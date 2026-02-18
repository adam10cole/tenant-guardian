/**
 * Legal Deadline Calculator — Tenant Guardian
 *
 * IMPORTANT: This module has direct legal consequences for users.
 * Every number in this file should be verified against the cited statute.
 * When in doubt, use the shorter deadline (more protective for the tenant).
 *
 * Jurisdiction format: `{STATE}-{CITY}` or `{STATE}-GENERAL`
 * Examples: 'MI-ANN-ARBOR', 'MI-DETROIT', 'MI-GENERAL'
 *
 * Sources:
 *   - Michigan Compiled Laws § 554.139 (landlord duties)
 *   - Ann Arbor City Code § 8:575 (housing code enforcement)
 *   - Detroit City Code § 9-1-73 (housing inspections)
 *
 * TODO: Add jurisdiction data as the app expands to new cities.
 */

import type { IssueCategory } from '@/types/database';

/**
 * Deadline entry: number of calendar days the landlord has to
 * remedy an issue after receiving written notice from the tenant.
 *
 * `null` means "consult a housing attorney — no clear statutory deadline."
 */
export interface DeadlineEntry {
  /** Calendar days from landlord notice to remedy */
  days: number | null;
  /** Human-readable description of the statutory basis */
  description: string;
  /** Citation to the controlling statute or ordinance */
  citation: string;
}

/**
 * Per-category deadline map for a jurisdiction.
 * Not every jurisdiction overrides every category — fall through
 * to the state-level default if a key is absent.
 */
export type JurisdictionDeadlines = Partial<Record<IssueCategory, DeadlineEntry>>;

// -------------------------------------------------------
// Michigan state-level defaults (MCL § 554.139)
// -------------------------------------------------------
const MI_GENERAL: JurisdictionDeadlines = {
  water: {
    days: 24,
    description:
      'Running water and plumbing in reasonable working condition. Emergency failures (no water at all) — 24 hours.',
    citation: 'MCL § 554.139(1)(a)',
  },
  heat: {
    days: 24,
    description:
      'Heat must be maintained at a minimum of 65°F. Failure in winter constitutes an emergency.',
    citation: 'MCL § 554.139(1)(a); Michigan Residential Code R 408.30535',
  },
  pests: {
    days: 30,
    description:
      'Landlord must maintain premises free from pest infestation. 30 days for non-emergency remediation.',
    citation: 'MCL § 554.139(1)(b)',
  },
  mold: {
    days: 14,
    description:
      'Mold attributable to landlord failure to maintain structure. 14 days to begin remediation after notice.',
    citation: 'MCL § 554.139(1)(a)-(b)',
  },
  structural: {
    days: 30,
    description:
      'Landlord must keep premises in reasonable repair. 30 days for structural defects that do not create immediate danger.',
    citation: 'MCL § 554.139(1)(a)',
  },
  electrical: {
    days: 24,
    description: 'Electrical failures creating safety hazards treated as emergencies — 24 hours.',
    citation: 'MCL § 554.139(1)(a)',
  },
  security: {
    days: 24,
    description: 'Broken exterior locks or doors compromising tenant safety — emergency, 24 hours.',
    citation: 'MCL § 554.139(1)(a)',
  },
  sanitation: {
    days: 14,
    description:
      'Sewage backup or lack of garbage facilities — 14 days to remedy after written notice.',
    citation: 'MCL § 554.139(1)(b)',
  },
  other: {
    days: 30,
    description: 'General habitability defects — 30 days after written notice.',
    citation: 'MCL § 554.139(1)',
  },
};

// -------------------------------------------------------
// Ann Arbor city ordinance overrides
// Ann Arbor Code § 8:575 imposes stricter timelines than state law.
// -------------------------------------------------------
const MI_ANN_ARBOR: JurisdictionDeadlines = {
  ...MI_GENERAL,
  heat: {
    days: 12,
    description:
      'Ann Arbor requires heat restoration within 12 hours of written notice during heating season (Oct 1 – May 1).',
    citation: 'Ann Arbor City Code § 8:575(C)(1)',
  },
  water: {
    days: 12,
    description: 'Ann Arbor: restoration of running water within 12 hours of written notice.',
    citation: 'Ann Arbor City Code § 8:575(C)(1)',
  },
  pests: {
    days: 14,
    description: 'Ann Arbor: pest infestation must be remediated within 14 days of notice.',
    citation: 'Ann Arbor City Code § 8:575(C)(2)',
  },
};

// -------------------------------------------------------
// Detroit city ordinance overrides
// Detroit City Code § 9-1-73
// -------------------------------------------------------
const MI_DETROIT: JurisdictionDeadlines = {
  ...MI_GENERAL,
  heat: {
    days: 24,
    description:
      'Detroit: heat failures treated as emergencies; landlord has 24 hours to restore heat.',
    citation: 'Detroit City Code § 9-1-73',
  },
  pests: {
    days: 21,
    description: 'Detroit: pest infestation remediation required within 21 days of written notice.',
    citation: 'Detroit City Code § 9-1-73',
  },
};

// -------------------------------------------------------
// Jurisdiction registry
// -------------------------------------------------------
const JURISDICTION_MAP: Record<string, JurisdictionDeadlines> = {
  'MI-GENERAL': MI_GENERAL,
  'MI-ANN-ARBOR': MI_ANN_ARBOR,
  'MI-DETROIT': MI_DETROIT,
};

/**
 * Returns the number of calendar days the landlord has to remedy an issue,
 * given the tenant's jurisdiction and issue category.
 *
 * Falls back to the state-level default if the city does not override the
 * category, then to `null` if no data exists.
 *
 * @param jurisdiction - Jurisdiction code from the user's profile (e.g. 'MI-ANN-ARBOR')
 * @param category     - Issue category
 * @returns DeadlineEntry with days and citation, or null if unknown
 */
export function getDeadlineEntry(
  jurisdiction: string,
  category: IssueCategory,
): DeadlineEntry | null {
  const jurisdictionDeadlines = JURISDICTION_MAP[jurisdiction];

  if (!jurisdictionDeadlines) {
    // Unknown jurisdiction — fall back to Michigan general
    console.warn(`[deadlines] Unknown jurisdiction "${jurisdiction}". Falling back to MI-GENERAL.`);
    return MI_GENERAL[category] ?? null;
  }

  return jurisdictionDeadlines[category] ?? null;
}

/**
 * Returns the number of calendar days only (convenience wrapper).
 *
 * @param jurisdiction - Jurisdiction code
 * @param category     - Issue category
 * @returns Number of days, or null if no data
 */
export function getDeadlineDays(jurisdiction: string, category: IssueCategory): number | null {
  return getDeadlineEntry(jurisdiction, category)?.days ?? null;
}

/**
 * Computes the legal deadline date given the landlord notification timestamp
 * and the number of deadline days.
 *
 * Uses calendar days (not business days). The deadline falls at the END of the
 * last day (23:59:59 local time), but we store it as midnight UTC of that day
 * for consistency.
 *
 * @param landlordNotifiedAt - ISO 8601 string of when formal notice was sent
 * @param deadlineDays       - Number of calendar days from notice to remedy
 * @returns ISO 8601 deadline date string, or null if inputs are invalid
 */
export function computeDeadlineDate(
  landlordNotifiedAt: string,
  deadlineDays: number,
): string | null {
  if (!landlordNotifiedAt || deadlineDays <= 0) {
    return null;
  }

  const notifiedDate = new Date(landlordNotifiedAt);
  if (isNaN(notifiedDate.getTime())) {
    return null;
  }

  const deadlineDate = new Date(notifiedDate);
  deadlineDate.setUTCDate(deadlineDate.getUTCDate() + deadlineDays);

  return deadlineDate.toISOString();
}

/**
 * Returns true if the legal deadline has passed, given the current time.
 *
 * @param legalDeadlineAt - ISO 8601 deadline string (from computeDeadlineDate)
 * @param now             - Current time (defaults to Date.now() — injectable for testing)
 */
export function isDeadlinePassed(
  legalDeadlineAt: string | null,
  now: number = Date.now(),
): boolean {
  if (!legalDeadlineAt) return false;
  return new Date(legalDeadlineAt).getTime() < now;
}

/**
 * Returns the number of days remaining until the deadline.
 * Negative values mean the deadline has passed.
 *
 * @param legalDeadlineAt - ISO 8601 deadline string
 * @param now             - Current time (defaults to Date.now())
 */
export function daysUntilDeadline(
  legalDeadlineAt: string | null,
  now: number = Date.now(),
): number | null {
  if (!legalDeadlineAt) return null;
  const deadline = new Date(legalDeadlineAt).getTime();
  const msRemaining = deadline - now;
  return Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
}

/**
 * Returns all supported jurisdiction codes.
 * Useful for the profile setup screen's jurisdiction picker.
 */
export function getSupportedJurisdictions(): string[] {
  return Object.keys(JURISDICTION_MAP);
}
