import { supabase } from './supabase';
import { DRIVE_UPLOAD_URL } from './config';
import type { Store } from './types';

export type UploadKind = 'menu' | 'logo' | 'receipts';
type UploadStore = Pick<Store, 'id' | 'drive_folder_id' | 'drive_upload_url'>;

/** Shrink a photo in the browser before upload (tablet cameras produce 5–12 MB files). */
async function resizeImage(file: File, maxSide = 1000, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', quality));
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    r.readAsDataURL(blob);
  });
}

/** Extract the folder id from a Google Drive folder link (or accept a bare id). */
export function parseDriveFolderId(input: string): string {
  const s = input.trim();
  const m = s.match(/folders\/([A-Za-z0-9_-]{10,})/) ?? s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : '';
}

export const driveUploadUrl = (store: UploadStore) => store.drive_upload_url || DRIVE_UPLOAD_URL || '';

/**
 * Upload a photo/PDF for a store and return a URL to show it.
 * Stores with a Google Drive folder save there (through apps-script/DriveUpload.gs);
 * others fall back to the Supabase `store-media` bucket.
 */
export async function uploadStoreFile(store: UploadStore, file: File, kind: UploadKind = 'menu'): Promise<string> {
  const isImage = file.type.startsWith('image/');
  const body = isImage ? await resizeImage(file) : file;
  const resized = isImage && body !== file;
  const mimeType = resized ? 'image/jpeg' : file.type;
  const name = resized ? file.name.replace(/\.[^.]+$/, '') + '.jpg' : file.name;

  if (store.drive_folder_id) {
    const url = driveUploadUrl(store);
    if (!url) throw new Error('ยังไม่ได้ใส่ลิงก์ Apps Script สำหรับ Google Drive ในหน้าตั้งค่าร้าน');
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    // text/plain avoids a CORS pre-flight, which Apps Script web apps don't answer.
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ accessToken: token, storeId: store.id, kind, fileName: name, mimeType, data: await toBase64(body) }),
    }).catch(() => { throw new Error('เชื่อมต่อ Google Drive ไม่ได้ — ตรวจลิงก์ Apps Script'); });
    const out = await res.json().catch(() => ({ ok: false, error: 'Google Drive ตอบกลับไม่ถูกต้อง' }));
    if (!out.ok) throw new Error(out.error || 'อัปโหลดไป Google Drive ไม่สำเร็จ');
    return kind === 'receipts' ? out.viewUrl : out.url;
  }

  const ext = resized ? 'jpg' : (file.name.split('.').pop() || 'bin').toLowerCase();
  const path = `${store.id}/${kind}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('store-media').upload(path, body, { contentType: mimeType, upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from('store-media').getPublicUrl(path).data.publicUrl;
}
