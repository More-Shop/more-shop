/**
 * More Shop — save photos into each store's Google Drive folder.
 *
 * The web app receives a photo from the More Shop website, checks with
 * Supabase that the signed-in user really belongs to the store (using the
 * user's own session, so Row Level Security decides), then saves the file in
 * that store's folder (sub-folders: เมนู / โลโก้ / ใบเสร็จรายจ่าย) and shares it
 * "anyone with the link can view" so the menu photo can be shown.
 *
 * The folder always comes from the database (stores.drive_folder_id), never
 * from the browser, so nobody can write into a folder that is not theirs.
 *
 * Setup: see docs/GOOGLE_DRIVE.md
 */

// Public values (same as the website's .env.production) — not secrets.
var SUPABASE_URL = 'https://zhcbmsglavileyijmuxh.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpoY2Jtc2dsYXZpbGV5aWptdXhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ4MTY3MDQsImV4cCI6MjExMDM5MjcwNH0.TFHf2Wb20c7drXZodIaDCmcIl0H1CvwmzS4csuFfQ_w';

var MAX_BYTES = 8 * 1024 * 1024;
var SUBFOLDERS = { menu: 'เมนู', logo: 'โลโก้', receipts: 'ใบเสร็จรายจ่าย' };
var ALLOWED_MIME = /^(image\/(jpeg|png|webp|gif)|application\/pdf)$/;

function doGet() {
  return ContentService.createTextOutput('More Shop Drive upload: OK');
}

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    if (!/^[0-9a-f-]{36}$/i.test(String(req.storeId || ''))) throw new Error('storeId ไม่ถูกต้อง');
    if (!SUBFOLDERS[req.kind]) throw new Error('ประเภทไฟล์ไม่ถูกต้อง');
    if (!ALLOWED_MIME.test(String(req.mimeType || ''))) throw new Error('รองรับเฉพาะรูปภาพและ PDF');

    var store = storeForUser_(req.accessToken, req.storeId);
    if (!store.drive_folder_id) throw new Error('ร้านนี้ยังไม่ได้ตั้งค่าโฟลเดอร์ Google Drive');

    var bytes = Utilities.base64Decode(String(req.data || ''));
    if (!bytes.length) throw new Error('ไฟล์ว่าง');
    if (bytes.length > MAX_BYTES) throw new Error('ไฟล์ใหญ่เกิน 8 MB');

    var root;
    try { root = DriveApp.getFolderById(store.drive_folder_id); }
    catch (err) { throw new Error('เปิดโฟลเดอร์ Google Drive ของร้านไม่ได้ — ตรวจลิงก์ และแชร์โฟลเดอร์ให้บัญชีที่ติดตั้งสคริปต์เป็น "ผู้แก้ไข"'); }
    var folder, file;
    try { folder = subfolder_(root, SUBFOLDERS[req.kind]); }
    catch (err) { throw new Error(needEditor_('สร้างโฟลเดอร์ย่อย "' + SUBFOLDERS[req.kind] + '"')); }

    var name = String(req.fileName || 'file').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
    var stamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd-HHmmss');
    try { file = folder.createFile(Utilities.newBlob(bytes, req.mimeType, stamp + '_' + name)); }
    catch (err) { throw new Error(needEditor_('บันทึกไฟล์')); }
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
    catch (err) { throw new Error('บันทึกไฟล์แล้ว แต่ตั้งแชร์ "ทุกคนที่มีลิงก์" ไม่ได้ (บัญชีองค์กรอาจปิดการแชร์ภายนอก) — ' + err.message); }

    var id = file.getId();
    return json_({
      ok: true,
      id: id,
      url: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1000',
      viewUrl: 'https://drive.google.com/file/d/' + id + '/view',
    });
  } catch (err) {
    var msg = String((err && err.message) || err);
    if (/permission|สิทธิ์|อนุญาต|authorization/i.test(msg) && /DriveApp|drive/i.test(msg)) {
      msg = 'สคริปต์ยังไม่ได้รับสิทธิ์ Google Drive — เปิด Apps Script กด Run ฟังก์ชัน authorize แล้วติ๊กอนุญาตทุกข้อ (ดู docs/GOOGLE_DRIVE.md)';
    }
    return json_({ ok: false, error: msg });
  }
}

/** Reads the store with the user's session: returns nothing unless they are a member (RLS). */
function storeForUser_(token, storeId) {
  if (!token) throw new Error('กรุณาเข้าสู่ระบบใหม่');
  var res = UrlFetchApp.fetch(
    SUPABASE_URL + '/rest/v1/stores?select=id,drive_folder_id&id=eq.' + encodeURIComponent(storeId),
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
  if (res.getResponseCode() === 401) throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  if (res.getResponseCode() !== 200) throw new Error('ตรวจสอบสิทธิ์ไม่สำเร็จ (' + res.getResponseCode() + ')');
  var rows = JSON.parse(res.getContentText());
  if (!rows.length) throw new Error('คุณไม่มีสิทธิ์ในร้านนี้');
  return rows[0];
}

/** Explains which Google account needs Editor access to the store folder. */
function needEditor_(step) {
  var who = '';
  try { who = DriveApp.getRootFolder().getOwner().getEmail(); } catch (e) { /* ignore */ }  // Drive scope only
  return 'Google Drive ไม่ให้' + step + 'ในโฟลเดอร์ของร้าน — แชร์โฟลเดอร์ให้บัญชี ' + (who || 'ที่ติดตั้งสคริปต์') +
    ' เป็น "ผู้แก้ไข" (หรือสร้างโฟลเดอร์ในบัญชีนั้น แล้วใส่ลิงก์ใหม่ในตั้งค่าร้าน)';
}

function subfolder_(root, name) {
  var it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Run once from the editor (เลือก authorize → Run). Google shows a consent
 * screen: tick EVERY box (Google Drive + external service), or "Select all".
 * If a box was left unticked before, this asks again.
 */
function authorize() {
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  var root = DriveApp.getRootFolder();                       // Drive permission
  var res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/public_store', {  // internet permission
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ p_slug: '-' }),
    headers: { apikey: SUPABASE_ANON_KEY }, muteHttpExceptions: true });
  Logger.log('Google Drive: OK (' + root.getName() + ') · Supabase: HTTP ' + res.getResponseCode());
  Logger.log('พร้อมใช้งาน — ต่อไป Deploy → Manage deployments → ✏️ → Version: New version → Deploy');
}
