/**
 * heatmap-aggregate — Supabase Edge Function
 *
 * On-demand refresh of the heatmap_grid materialized view.
 * Called when a new issue is submitted, or manually.
 * pg_cron also refreshes the view every 6 hours automatically.
 *
 * POST /heatmap-aggregate
 * Authorization: Bearer <service-role-key>
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.includes(SERVICE_ROLE_KEY)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { error } = await adminClient.rpc('refresh_heatmap');
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ refreshed: true }), { status: 200 });
});
