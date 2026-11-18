import { supabase } from './supabase';

// Report errors that people actually saw, so the platform admin can find
// and fix problems from the admin console (เมนู ผู้ดูแลระบบ → ปัญหาที่พบ).
const recent = new Map<string, number>();

export function reportError(message: string, context?: Record<string, unknown>) {
  try {
    const msg = String(message || '').slice(0, 1000);
    if (!msg) return;
    const now = Date.now();
    if ((recent.get(msg) ?? 0) > now - 60_000) return;   // same message at most once a minute
    recent.set(msg, now);
    let store: string | null = null;
    try { store = localStorage.getItem('moreshop.currentStore'); } catch { /* ignore */ }
    void supabase.rpc('log_client_error', {
      p_message: msg,
      p_page: window.location.hash || window.location.pathname,
      p_store: store && /^[0-9a-f-]{36}$/.test(store) ? store : null,
      p_user_agent: navigator.userAgent,
      p_context: context ?? null,
    }).then(() => undefined, () => undefined);
  } catch { /* never let reporting break the page */ }
}

export function installGlobalErrorReporting() {
  window.addEventListener('error', (e) => reportError(`[js] ${e.message}`, { source: e.filename, line: e.lineno }));
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { message?: string } | string;
    reportError(`[promise] ${typeof r === 'string' ? r : r?.message ?? 'unknown'}`);
  });
}
