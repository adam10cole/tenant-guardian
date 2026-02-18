/**
 * send-notifications — Supabase Edge Function
 *
 * Sends Expo Push Notifications for upcoming legal deadlines.
 * Called by pg_cron on a schedule (e.g., daily at 8am).
 *
 * Logic:
 *   - Find all issues where legal_deadline_at is in [now, now + 3 days]
 *     and status is NOT resolved.
 *   - Look up the owner's expo_push_token from profiles.
 *   - Send a push notification via the Expo Push API.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface IssueWithProfile {
  id: string;
  category: string;
  legal_deadline_at: string;
  legal_deadline_days: number;
  profiles: {
    expo_push_token: string | null;
    display_name: string | null;
  };
}

Deno.serve(async (req: Request) => {
  // Verify this is a legitimate internal call (pg_cron or manual trigger)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.includes(SERVICE_ROLE_KEY)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Find issues with deadlines in the next 3 days
  const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

  const { data: issues, error } = await adminClient
    .from('issues')
    .select(
      'id, category, legal_deadline_at, legal_deadline_days, profiles(expo_push_token, display_name)',
    )
    .not('legal_deadline_at', 'is', null)
    .lte('legal_deadline_at', threeDaysFromNow)
    .gte('legal_deadline_at', new Date().toISOString())
    .not('status', 'eq', 'resolved');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const notifications = [];
  const tokens: string[] = [];

  for (const issue of (issues ?? []) as IssueWithProfile[]) {
    const token = issue.profiles?.expo_push_token;
    if (!token) continue;

    const daysLeft = Math.ceil(
      (new Date(issue.legal_deadline_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );

    notifications.push({
      to: token,
      title: 'Legal Deadline Approaching',
      body: `Your ${issue.category} issue has a legal deadline in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}.`,
      data: { issueId: issue.id },
      sound: 'default',
      priority: 'high',
    });
    tokens.push(token);
  }

  if (notifications.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  // Send to Expo Push API in batches of 100
  let sent = 0;
  for (let i = 0; i < notifications.length; i += 100) {
    const batch = notifications.slice(i, i + 100);
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(batch),
    });

    if (response.ok) sent += batch.length;
  }

  return new Response(JSON.stringify({ sent }), { status: 200 });
});
