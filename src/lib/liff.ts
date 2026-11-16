// Minimal typed loader for the LINE Front-end Framework (LIFF) SDK.
interface LiffProfile { userId: string; displayName: string; pictureUrl?: string }
export interface Liff {
  init(cfg: { liffId: string }): Promise<void>;
  isLoggedIn(): boolean;
  isInClient(): boolean;
  login(cfg?: { redirectUri?: string }): void;
  getProfile(): Promise<LiffProfile>;
  getIDToken(): string | null;
  closeWindow(): void;
}
declare global { interface Window { liff?: Liff } }

const SDK = 'https://static.line-scdn.net/liff/edge/2/sdk.js';

export function loadLiff(): Promise<Liff> {
  if (window.liff) return Promise.resolve(window.liff);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SDK;
    s.async = true;
    s.onload = () => (window.liff ? resolve(window.liff) : reject(new Error('LIFF SDK not available')));
    s.onerror = () => reject(new Error('โหลด LINE SDK ไม่สำเร็จ'));
    document.head.appendChild(s);
  });
}

export async function initLiff(liffId: string) {
  const liff = await loadLiff();
  await liff.init({ liffId });
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: window.location.href });
    return null; // page will reload after login
  }
  const profile = await liff.getProfile();
  return { liff, profile, idToken: liff.getIDToken() };
}
