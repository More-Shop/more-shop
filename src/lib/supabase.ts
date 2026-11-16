import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isConfigured } from './config';

// A placeholder URL keeps the client constructible so the app can show the
// "not configured" screen instead of crashing.
export const supabase = createClient(
  isConfigured ? SUPABASE_URL : 'http://localhost:54321',
  isConfigured ? SUPABASE_ANON_KEY : 'public-anon-key',
  { auth: { persistSession: true, autoRefreshToken: true } },
);

/** Throw the PostgREST error (if any) and return data. */
export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export async function callFunction<T = unknown>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) msg = (await ctx.json()).error || msg;
    } catch { /* keep generic */ }
    throw new Error(msg);
  }
  return data as T;
}
