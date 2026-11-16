import { supabase } from './supabase';

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

/** Upload into the public `store-media` bucket under the store's folder and return the public URL. */
export async function uploadStoreFile(storeId: string, file: File, folder = 'menu'): Promise<string> {
  const isImage = file.type.startsWith('image/');
  const body = isImage ? await resizeImage(file) : file;
  const ext = isImage && body !== file ? 'jpg' : (file.name.split('.').pop() || 'bin').toLowerCase();
  const path = `${storeId}/${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('store-media').upload(path, body, {
    contentType: isImage && body !== file ? 'image/jpeg' : file.type, upsert: false,
  });
  if (error) throw new Error(error.message);
  return supabase.storage.from('store-media').getPublicUrl(path).data.publicUrl;
}
