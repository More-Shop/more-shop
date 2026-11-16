export const APP_NAME: string = import.meta.env.VITE_APP_NAME || 'More Shop';
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
/** Default Apps Script web app for saving photos to Google Drive (a store can override it). */
export const DRIVE_UPLOAD_URL: string = import.meta.env.VITE_DRIVE_UPLOAD_URL || '';
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** Absolute base URL of the web app (used inside QR codes and LINE links). */
export function publicBaseUrl(): string {
  const env = import.meta.env.VITE_PUBLIC_URL as string | undefined;
  const base = env || `${window.location.origin}${import.meta.env.BASE_URL}`;
  return base.endsWith('/') ? base : `${base}/`;
}

/** Link to a customer page, e.g. publicLink('s/more-shop/t/abc'). Hash routing keeps it host-agnostic. */
export const publicLink = (path: string) => `${publicBaseUrl()}#/${path.replace(/^\//, '')}`;
