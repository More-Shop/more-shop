import { APP_NAME } from '@/lib/config';

export default function NotConfigured() {
  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="mb-2 text-2xl font-bold">{APP_NAME}</h1>
      <p className="mb-4 text-slate-600">ยังไม่ได้เชื่อมต่อฐานข้อมูล Supabase</p>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
        <li>คัดลอกไฟล์ <code className="rounded bg-slate-100 px-1">.env.example</code> เป็น <code className="rounded bg-slate-100 px-1">.env</code></li>
        <li>ใส่ <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_URL</code> และ <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_ANON_KEY</code> จาก Supabase → Settings → API</li>
        <li>รัน <code className="rounded bg-slate-100 px-1">npm run dev</code> ใหม่ (ดูขั้นตอนเต็มใน docs/SETUP.md)</li>
      </ol>
    </div>
  );
}
