/**
 * generate-pdf — Supabase Edge Function (Deno runtime)
 *
 * Generates a court-ready evidence PDF for a housing issue.
 *
 * Security:
 *   - Authenticates the caller via Supabase JWT; only the issue owner can generate.
 *   - Recomputes SHA-256 of each photo from Storage; flags mismatches in the PDF.
 *   - Stores the final PDF in the exported-pdfs private bucket (never public URLs).
 *   - Returns a 1-hour signed URL for the caller to download.
 *
 * Request: POST /generate-pdf
 *   Body: { "issueId": "<UUID>" }
 *
 * Response: { "signedUrl": "...", "pdfPath": "..." }
 *
 * Deno dependencies are pinned by import map — see import_map.json.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'https://esm.sh/pdf-lib@1.17.1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EVIDENCE_BUCKET = 'evidence-photos';
const EXPORT_BUCKET = 'exported-pdfs';

// -------------------------------------------------------
// Types
// -------------------------------------------------------

interface GeneratePdfRequest {
  issueId: string;
}

interface IssueRow {
  id: string;
  user_id: string;
  building_id: string | null;
  category: string;
  status: string;
  description: string | null;
  first_reported_at: string;
  landlord_notified_at: string | null;
  legal_deadline_days: number | null;
  legal_deadline_at: string | null;
}

interface PhotoRow {
  id: string;
  storage_path: string;
  taken_at: string;
  latitude: number | null;
  longitude: number | null;
  photo_hash: string;
}

interface CommunicationRow {
  id: string;
  direction: string;
  method: string;
  summary: string;
  occurred_at: string;
}

interface BuildingRow {
  address_line1: string;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

interface IssueUpdateRow {
  id: string;
  user_id: string;
  event_type: string;
  note: string | null;
  status_value: string | null;
  created_at: string;
  created_by_name: string | null;
}

// -------------------------------------------------------
// Main handler
// -------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    // -------------------------------------------------------
    // Auth: extract caller's JWT and verify ownership
    // -------------------------------------------------------
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('Missing authorization header', 401);
    }

    // Caller-scoped client (respects RLS)
    const callerClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await callerClient.auth.getUser();
    if (authError || !user) {
      return errorResponse('Unauthorized', 401);
    }

    // -------------------------------------------------------
    // Parse request body
    // -------------------------------------------------------
    let body: GeneratePdfRequest;
    try {
      body = (await req.json()) as GeneratePdfRequest;
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }

    const { issueId } = body;
    if (!issueId || typeof issueId !== 'string') {
      return errorResponse('issueId is required', 400);
    }

    // -------------------------------------------------------
    // Fetch data using service role client (bypasses RLS for joins)
    // -------------------------------------------------------
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Verify ownership via RLS by using the caller's scoped client
    const { data: issueCheck, error: ownerError } = await callerClient
      .from('issues')
      .select('id')
      .eq('id', issueId)
      .single();

    if (ownerError || !issueCheck) {
      return errorResponse('Issue not found or access denied', 404);
    }

    // Now fetch full details with admin client
    const [issueResult, photosResult, commsResult, updatesResult] = await Promise.all([
      adminClient
        .from('issues')
        .select('*, buildings(address_line1, address_line2, city, state, zip)')
        .eq('id', issueId)
        .single(),
      adminClient
        .from('photos')
        .select('id, storage_path, taken_at, latitude, longitude, photo_hash')
        .eq('issue_id', issueId)
        .order('taken_at', { ascending: true }),
      adminClient
        .from('communications')
        .select('id, direction, method, summary, occurred_at')
        .eq('issue_id', issueId)
        .order('occurred_at', { ascending: true }),
      adminClient
        .from('issue_updates')
        .select('id, user_id, event_type, note, status_value, created_at, created_by_name')
        .eq('issue_id', issueId)
        .order('created_at', { ascending: true }),
    ]);

    if (issueResult.error) {
      return errorResponse(`Failed to fetch issue: ${issueResult.error.message}`, 500);
    }

    const issue = issueResult.data as IssueRow & { buildings: BuildingRow | null };
    const photos = (photosResult.data ?? []) as PhotoRow[];
    const communications = (commsResult.data ?? []) as CommunicationRow[];
    const updates = (updatesResult.data ?? []) as IssueUpdateRow[];

    // -------------------------------------------------------
    // Build PDF
    // -------------------------------------------------------
    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    addCoverPage(pdfDoc, helvetica, helveticaBold, issue, user.email ?? '');
    addIssuePage(pdfDoc, helvetica, helveticaBold, issue);

    if (updates.length > 0) {
      addTimelinePage(pdfDoc, helvetica, helveticaBold, issue, updates, issue.user_id);
    }

    if (communications.length > 0) {
      addCommunicationsPage(pdfDoc, helvetica, helveticaBold, communications);
    }

    const hashResults: Array<{ path: string; expected: string; actual: string; match: boolean }> =
      [];
    for (const photo of photos) {
      const result = await addPhotoPage(pdfDoc, helvetica, helveticaBold, photo, adminClient);
      hashResults.push(result);
    }

    addHashSummaryPage(pdfDoc, helvetica, helveticaBold, hashResults);

    // -------------------------------------------------------
    // Save PDF to Supabase Storage
    // -------------------------------------------------------
    const pdfBytes = await pdfDoc.save();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const pdfPath = `${user.id}/${issueId}/${timestamp}.pdf`;

    const { error: uploadError } = await adminClient.storage
      .from(EXPORT_BUCKET)
      .upload(pdfPath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      return errorResponse(`Failed to save PDF: ${uploadError.message}`, 500);
    }

    // -------------------------------------------------------
    // Generate signed URL (1 hour)
    // -------------------------------------------------------
    const { data: signedData, error: signedError } = await adminClient.storage
      .from(EXPORT_BUCKET)
      .createSignedUrl(pdfPath, 3600);

    if (signedError || !signedData) {
      return errorResponse('Failed to create signed URL', 500);
    }

    return new Response(JSON.stringify({ signedUrl: signedData.signedUrl, pdfPath }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error('[generate-pdf] uncaught error:', err);
    return errorResponse(
      `Internal error: ${err instanceof Error ? err.message : String(err)}`,
      500,
    );
  }
});

// -------------------------------------------------------
// PDF page builders
// -------------------------------------------------------

function addCoverPage(
  pdfDoc: PDFDocument,
  font: PDFFont,
  boldFont: PDFFont,
  issue: IssueRow & { buildings: BuildingRow | null },
  userEmail: string,
): void {
  const page = pdfDoc.addPage([612, 792]); // US Letter
  const { width, height } = page.getSize();
  let y = height - 60;

  // Header bar
  page.drawRectangle({
    x: 0,
    y: height - 80,
    width,
    height: 80,
    color: rgb(0.1, 0.33, 0.85),
  });

  page.drawText('TENANT GUARDIAN', {
    x: 40,
    y: height - 52,
    size: 28,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  page.drawText('Housing Issue Evidence Report', {
    x: 40,
    y: height - 72,
    size: 12,
    font,
    color: rgb(0.85, 0.9, 1),
  });

  y = height - 120;

  drawLabelValue(page, font, boldFont, 'Generated:', formatDate(new Date().toISOString()), 40, y);
  y -= 20;
  drawLabelValue(page, font, boldFont, 'Prepared for:', userEmail, 40, y);
  y -= 40;

  // Issue summary box
  page.drawRectangle({
    x: 30,
    y: y - 120,
    width: width - 60,
    height: 130,
    color: rgb(0.96, 0.97, 1),
  });
  page.drawRectangle({ x: 30, y: y - 120, width: 4, height: 130, color: rgb(0.1, 0.33, 0.85) });

  drawLabelValue(page, font, boldFont, 'Issue ID:', issue.id, 44, y - 16);
  drawLabelValue(page, font, boldFont, 'Category:', capitalizeFirst(issue.category), 44, y - 36);
  drawLabelValue(page, font, boldFont, 'Status:', formatStatus(issue.status), 44, y - 56);
  drawLabelValue(
    page,
    font,
    boldFont,
    'First Reported:',
    formatDate(issue.first_reported_at),
    44,
    y - 76,
  );

  if (issue.landlord_notified_at) {
    drawLabelValue(
      page,
      font,
      boldFont,
      'Landlord Notified:',
      formatDate(issue.landlord_notified_at),
      44,
      y - 96,
    );
  }
  if (issue.legal_deadline_at) {
    drawLabelValue(
      page,
      font,
      boldFont,
      'Legal Deadline:',
      formatDate(issue.legal_deadline_at),
      44,
      y - 116,
    );
  }

  y -= 140;

  if (issue.buildings) {
    const b = issue.buildings;
    const addr = [b.address_line1, b.address_line2, b.city, b.state, b.zip]
      .filter(Boolean)
      .join(', ');
    drawLabelValue(page, font, boldFont, 'Property Address:', addr, 40, y);
    y -= 20;
  }

  y -= 20;
  page.drawText(
    'This document was generated by Tenant Guardian and contains photographic evidence, ' +
      'communication logs, and cryptographic hash verification for use in housing code ' +
      'enforcement proceedings and legal proceedings.',
    { x: 40, y, size: 9, font, color: rgb(0.4, 0.4, 0.4), maxWidth: width - 80, lineHeight: 14 },
  );

  addPageFooter(page, font, 1);
}

function addIssuePage(
  pdfDoc: PDFDocument,
  font: PDFFont,
  boldFont: PDFFont,
  issue: IssueRow & { buildings: BuildingRow | null },
): void {
  const page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();
  let y = height - 60;

  drawSectionHeader(page, boldFont, 'Issue Details', y);
  y -= 30;

  if (issue.description) {
    page.drawText('Description:', {
      x: 40,
      y,
      size: 11,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 18;
    page.drawText(issue.description, {
      x: 40,
      y,
      size: 10,
      font,
      color: rgb(0.2, 0.2, 0.2),
      maxWidth: width - 80,
      lineHeight: 15,
    });
    y -= estimateTextHeight(issue.description, width - 80, 10, 15) + 20;
  }

  // Timeline
  drawSectionHeader(page, boldFont, 'Timeline', y);
  y -= 25;

  const timelineEvents = [
    { label: 'Issue first reported', date: issue.first_reported_at },
    { label: 'Landlord notified', date: issue.landlord_notified_at },
    { label: 'Legal deadline', date: issue.legal_deadline_at },
  ].filter((e) => e.date);

  for (const event of timelineEvents) {
    page.drawCircle({ x: 50, y: y + 4, size: 4, color: rgb(0.1, 0.33, 0.85) });
    page.drawText(event.label + ':', {
      x: 65,
      y,
      size: 10,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText(formatDate(event.date!), {
      x: 230,
      y,
      size: 10,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= 22;
  }

  if (issue.legal_deadline_days) {
    y -= 10;
    page.drawText(
      `Legal deadline is ${issue.legal_deadline_days} calendar days after landlord notification ` +
        `per applicable housing code.`,
      { x: 40, y, size: 9, font, color: rgb(0.4, 0.4, 0.4), maxWidth: width - 80 },
    );
  }

  addPageFooter(page, font, 2);
}

function addTimelinePage(
  pdfDoc: PDFDocument,
  font: PDFFont,
  boldFont: PDFFont,
  issue: IssueRow,
  updates: IssueUpdateRow[],
  issueOwnerId: string,
): void {
  const page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();
  let y = height - 60;

  drawSectionHeader(page, boldFont, 'Issue Timeline', y);
  y -= 30;

  // Dot colors per entry type (greyscale-safe approximations)
  const DOT_COLORS: Record<string, [number, number, number]> = {
    initial: [0.42, 0.45, 0.5], // grey
    update: [0.1, 0.33, 0.85], // blue
    status_change: [0.49, 0.23, 0.93], // purple
  };

  type Entry =
    | { kind: 'initial'; date: string; note: string | null; author: null }
    | { kind: 'update'; date: string; note: string | null; author: string; role: string }
    | { kind: 'status_change'; date: string; status: string | null; author: string; role: string };

  const entries: Entry[] = [
    { kind: 'initial', date: issue.first_reported_at, note: issue.description, author: null },
    ...updates.map((u): Entry => {
      const isTenant = u.user_id === issueOwnerId;
      const role = isTenant ? 'Tenant' : 'Property Manager';
      const author = u.created_by_name ?? (isTenant ? 'Tenant' : 'Property Manager');
      return u.event_type === 'status_change'
        ? { kind: 'status_change', date: u.created_at, status: u.status_value, author, role }
        : { kind: 'update', date: u.created_at, note: u.note, author, role };
    }),
  ];

  for (const entry of entries) {
    if (y < 80) break;

    const [r, g, b] = DOT_COLORS[entry.kind];
    page.drawCircle({ x: 50, y: y + 3, size: 5, color: rgb(r, g, b) });

    let label: string;
    let detail: string;

    if (entry.kind === 'initial') {
      label = 'Initial Report';
      detail = entry.note ?? '(no description)';
    } else if (entry.kind === 'status_change') {
      label = 'Status Changed';
      detail = entry.status ? `-> ${formatStatus(entry.status)}` : '';
    } else {
      label = 'Update';
      detail = entry.note ?? '(no note)';
    }

    page.drawText(label, {
      x: 65,
      y,
      size: 10,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText(formatDate(entry.date), {
      x: 200,
      y,
      size: 9,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });

    if (entry.author !== null) {
      y -= 14;
      page.drawText(`${entry.author} · ${entry.role}`, {
        x: 65,
        y,
        size: 8,
        font,
        color: rgb(0.45, 0.45, 0.55),
      });
    }

    if (detail) {
      y -= 14;
      page.drawText(detail, {
        x: 65,
        y,
        size: 9,
        font,
        color: rgb(0.25, 0.25, 0.25),
        maxWidth: width - 105,
        lineHeight: 13,
      });
      y -= estimateTextHeight(detail, width - 105, 9, 13);
    }

    y -= 18;
  }

  addPageFooter(page, font, 3);
}

function addCommunicationsPage(
  pdfDoc: PDFDocument,
  font: PDFFont,
  boldFont: PDFFont,
  communications: CommunicationRow[],
): void {
  const page = pdfDoc.addPage([612, 792]);
  const { height, width } = page.getSize();
  let y = height - 60;

  drawSectionHeader(page, boldFont, 'Communications Log', y);
  y -= 30;

  page.drawText('The following communications between the tenant and landlord have been logged.', {
    x: 40,
    y,
    size: 10,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= 25;

  for (let i = 0; i < communications.length; i++) {
    const comm = communications[i];
    const bgColor = i % 2 === 0 ? rgb(0.98, 0.98, 0.98) : rgb(1, 1, 1);

    page.drawRectangle({ x: 30, y: y - 60, width: width - 60, height: 68, color: bgColor });

    page.drawText(`${capitalizeFirst(comm.direction)} via ${formatMethod(comm.method)}`, {
      x: 44,
      y: y - 14,
      size: 10,
      font: boldFont,
      color: rgb(0.1, 0.33, 0.85),
    });
    page.drawText(formatDate(comm.occurred_at), {
      x: 44,
      y: y - 28,
      size: 9,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
    page.drawText(comm.summary, {
      x: 44,
      y: y - 44,
      size: 9,
      font,
      color: rgb(0.2, 0.2, 0.2),
      maxWidth: width - 88,
      lineHeight: 13,
    });

    y -= 78;

    if (y < 80) {
      page.drawText('(Additional entries omitted — report truncated at page boundary)', {
        x: 44,
        y: y + 10,
        size: 8,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });
      break;
    }
  }

  addPageFooter(page, font, 4);
}

async function addPhotoPage(
  pdfDoc: PDFDocument,
  font: PDFFont,
  boldFont: PDFFont,
  photo: PhotoRow,
  adminClient: ReturnType<typeof createClient>,
): Promise<{ path: string; expected: string; actual: string; match: boolean }> {
  const page = pdfDoc.addPage([612, 792]);
  const { height, width } = page.getSize();
  let y = height - 60;

  drawSectionHeader(page, boldFont, 'Evidence Photo', y);
  y -= 25;

  drawLabelValue(page, font, boldFont, 'Photo ID:', photo.id, 40, y);
  y -= 18;
  drawLabelValue(page, font, boldFont, 'Captured at:', formatDate(photo.taken_at), 40, y);
  y -= 18;

  if (photo.latitude != null && photo.longitude != null) {
    drawLabelValue(
      page,
      font,
      boldFont,
      'GPS coordinates:',
      `${photo.latitude.toFixed(6)}, ${photo.longitude.toFixed(6)}`,
      40,
      y,
    );
    y -= 18;
  }

  // Hash verification
  let hashMatch = false;
  let actualHash = '';

  try {
    // Download raw file bytes to recompute hash
    const { data: fileData, error: downloadError } = await adminClient.storage
      .from(EVIDENCE_BUCKET)
      .download(photo.storage_path);

    if (downloadError || !fileData) {
      throw new Error(downloadError?.message ?? 'Download failed');
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    actualHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    hashMatch = actualHash === photo.photo_hash;

    // Embed photo in PDF
    let pdfImage;
    try {
      pdfImage = await pdfDoc.embedJpg(arrayBuffer);
    } catch {
      pdfImage = await pdfDoc.embedPng(arrayBuffer);
    }

    const maxWidth = width - 80;
    const maxHeight = 340;
    const scale = Math.min(maxWidth / pdfImage.width, maxHeight / pdfImage.height, 1);
    const imgWidth = pdfImage.width * scale;
    const imgHeight = pdfImage.height * scale;

    y -= 10;
    page.drawImage(pdfImage, {
      x: (width - imgWidth) / 2,
      y: y - imgHeight,
      width: imgWidth,
      height: imgHeight,
    });
    y -= imgHeight + 20;
  } catch (e) {
    page.drawText(`[Photo could not be loaded: ${e instanceof Error ? e.message : String(e)}]`, {
      x: 40,
      y: y - 20,
      size: 10,
      font,
      color: rgb(0.8, 0.2, 0.2),
    });
    y -= 40;
  }

  // Hash integrity section
  const hashColor = hashMatch ? rgb(0.1, 0.6, 0.1) : rgb(0.8, 0.1, 0.1);
  const hashStatus = hashMatch ? '[OK] VERIFIED' : '[FAIL] MISMATCH - FILE MAY HAVE BEEN ALTERED';

  page.drawRectangle({
    x: 30,
    y: y - 70,
    width: width - 60,
    height: 75,
    color: hashMatch ? rgb(0.9, 1, 0.9) : rgb(1, 0.9, 0.9),
  });

  page.drawText('Cryptographic Integrity', {
    x: 44,
    y: y - 14,
    size: 10,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText(hashStatus, { x: 44, y: y - 28, size: 10, font: boldFont, color: hashColor });
  page.drawText(`Expected SHA-256: ${photo.photo_hash}`, {
    x: 44,
    y: y - 44,
    size: 7,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });
  page.drawText(`Computed SHA-256: ${actualHash || '(could not compute)'}`, {
    x: 44,
    y: y - 56,
    size: 7,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });

  addPageFooter(page, font, 0);

  return {
    path: photo.storage_path,
    expected: photo.photo_hash,
    actual: actualHash,
    match: hashMatch,
  };
}

function addHashSummaryPage(
  pdfDoc: PDFDocument,
  font: PDFFont,
  boldFont: PDFFont,
  results: Array<{ path: string; expected: string; actual: string; match: boolean }>,
): void {
  const page = pdfDoc.addPage([612, 792]);
  const { height, width } = page.getSize();
  let y = height - 60;

  drawSectionHeader(page, boldFont, 'Cryptographic Hash Verification Summary', y);
  y -= 25;

  const allMatch = results.every((r) => r.match);
  const summaryColor = allMatch ? rgb(0.1, 0.6, 0.1) : rgb(0.8, 0.1, 0.1);
  const summaryText = allMatch
    ? `All ${results.length} photo(s) verified — no tampering detected.`
    : `WARNING: ${results.filter((r) => !r.match).length} photo(s) failed hash verification.`;

  page.drawText(summaryText, { x: 40, y, size: 12, font: boldFont, color: summaryColor });
  y -= 30;

  page.drawText(
    'SHA-256 hashes are computed on-device at the moment of capture and stored immutably. ' +
      'This function recomputes each hash from the stored file and compares it to the ' +
      'original. A mismatch indicates the file has been modified after capture.',
    { x: 40, y, size: 9, font, color: rgb(0.4, 0.4, 0.4), maxWidth: width - 80, lineHeight: 14 },
  );
  y -= 50;

  for (const result of results) {
    const rowColor = result.match ? rgb(0.95, 1, 0.95) : rgb(1, 0.92, 0.92);
    page.drawRectangle({ x: 30, y: y - 42, width: width - 60, height: 46, color: rowColor });

    page.drawText(result.path.split('/').pop() ?? result.path, {
      x: 44,
      y: y - 12,
      size: 9,
      font: boldFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText(result.match ? '[OK]' : '[FAIL]', {
      x: width - 90,
      y: y - 12,
      size: 9,
      font: boldFont,
      color: result.match ? rgb(0.1, 0.6, 0.1) : rgb(0.8, 0.1, 0.1),
    });
    page.drawText(`SHA-256: ${result.expected.substring(0, 32)}...`, {
      x: 44,
      y: y - 30,
      size: 7,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });

    y -= 54;
    if (y < 80) break;
  }

  addPageFooter(page, font, 0);
}

// -------------------------------------------------------
// Drawing helpers
// -------------------------------------------------------

function drawSectionHeader(page: PDFPage, boldFont: PDFFont, title: string, y: number): void {
  const { width } = page.getSize();
  page.drawRectangle({ x: 0, y: y - 4, width, height: 26, color: rgb(0.93, 0.95, 1) });
  page.drawLine({
    start: { x: 0, y: y - 4 },
    end: { x: width, y: y - 4 },
    thickness: 1,
    color: rgb(0.1, 0.33, 0.85),
  });
  page.drawText(title, { x: 40, y: y + 4, size: 13, font: boldFont, color: rgb(0.1, 0.33, 0.85) });
}

function drawLabelValue(
  page: PDFPage,
  font: PDFFont,
  boldFont: PDFFont,
  label: string,
  value: string,
  x: number,
  y: number,
): void {
  page.drawText(label, { x, y, size: 10, font: boldFont, color: rgb(0.2, 0.2, 0.2) });
  page.drawText(value, { x: x + 160, y, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
}

function addPageFooter(page: PDFPage, font: PDFFont, pageNum: number): void {
  const { width } = page.getSize();
  page.drawLine({
    start: { x: 30, y: 40 },
    end: { x: width - 30, y: 40 },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
  page.drawText('Tenant Guardian Evidence Report — Confidential', {
    x: 30,
    y: 26,
    size: 8,
    font,
    color: rgb(0.6, 0.6, 0.6),
  });
  if (pageNum > 0) {
    page.drawText(`Page ${pageNum}`, {
      x: width - 60,
      y: 26,
      size: 8,
      font,
      color: rgb(0.6, 0.6, 0.6),
    });
  }
}

// -------------------------------------------------------
// Formatting utilities
// -------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return iso;
  }
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatStatus(status: string): string {
  return status.split('_').map(capitalizeFirst).join(' ');
}

function formatMethod(method: string): string {
  const map: Record<string, string> = {
    email: 'Email',
    text: 'Text/SMS',
    call: 'Phone Call',
    letter: 'Written Letter',
    in_person: 'In Person',
  };
  return map[method] ?? capitalizeFirst(method);
}

function estimateTextHeight(
  text: string,
  maxWidth: number,
  fontSize: number,
  lineHeight: number,
): number {
  const approxCharsPerLine = Math.floor(maxWidth / (fontSize * 0.55));
  const lines = Math.ceil(text.length / approxCharsPerLine);
  return lines * lineHeight;
}

function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
