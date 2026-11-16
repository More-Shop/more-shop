import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isConfigured } from './config';

// Session storage: localStorage plus an in-memory copy. Some mobile
// browsers (seen on Chrome for iPhone) can lose localStorage while the page
// is still open; without the copy every request would silently go out as a
// signed-out visitor and fail with "permission denied".
const memory = new Map<string, string>();
const sessionStorageAdapter = {
  getItem(key: string) {
    try {
      const v = localStorage.getItem(key);
      if (v !== null) { memory.set(key, v); return v; }
    } catch { /* storage blocked */ }
    return memory.get(key) ?? null;
  },
  setItem(key: string, value: string) {
    memory.set(key, value);
    try { localStorage.setItem(key, value); } catch { /* storage blocked */ }
  },
  removeItem(key: string) {
    memory.delete(key);
    try { localStorage.removeItem(key); } catch { /* storage blocked */ }
  },
};

/** Fired when the server rejects a request because the login is gone. */
export const AUTH_LOST_EVENT = 'moreshop:auth-lost';

async function watchedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const res = await fetch(input, init);
  if (res.status === 401 && String(input instanceof Request ? input.url : input).includes('/rest/v1/')) {
    const auth = new Headers(init?.headers).get('Authorization') ?? '';
    // 401 sent with the bare anon key means we had no session to attach.
    if (auth === `Bearer ${SUPABASE_ANON_KEY}`) window.dispatchEvent(new Event(AUTH_LOST_EVENT));
  }
  return res;
}

// A placeholder URL keeps the client constructible so the app can show the
// "not configured" screen instead of crashing.
export const supabase = createClient(
  isConfigured ? SUPABASE_URL : 'http://localhost:54321',
  isConfigured ? SUPABASE_ANON_KEY : 'public-anon-key',
  {
    auth: { persistSession: true, autoRefreshToken: true, storage: sessionStorageAdapter },
    global: { fetch: watchedFetch },
  },
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
