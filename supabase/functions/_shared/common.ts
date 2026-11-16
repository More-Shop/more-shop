import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.46.1';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/** Service-role client: bypasses RLS. Only use after the caller has been verified. */
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
}

/** Client acting as the calling user (RLS applies). */
export function userClient(authHeader: string): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false }, global: { headers: { Authorization: authHeader } },
  });
}

export interface StoreLine {
  id: string; slug: string; name: string; timezone: string;
  line_liff_id: string | null; line_login_channel_id: string | null;
  secret: { line_channel_secret: string | null; line_channel_access_token: string | null; line_staff_target_id: string | null } | null;
}

export async function loadStoreLine(db: SupabaseClient, by: { slug?: string; id?: string }): Promise<StoreLine | null> {
  let q = db.from('stores').select('id, slug, name, timezone, line_liff_id, line_login_channel_id, secret:store_secrets(line_channel_secret, line_channel_access_token, line_staff_target_id)');
  q = by.id ? q.eq('id', by.id) : q.eq('slug', (by.slug ?? '').toLowerCase());
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const secret = Array.isArray(data.secret) ? data.secret[0] ?? null : data.secret;
  return { ...data, secret } as StoreLine;
}

export function thaiDate(iso: string) {
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${iso}T00:00:00`));
}

/** Absolute link into the web app (set PUBLIC_APP_URL as a function secret). */
export function appLink(path: string) {
  const base = Deno.env.get('PUBLIC_APP_URL');
  if (!base) return null;
  return `${base.endsWith('/') ? base : `${base}/`}#/${path}`;
}
