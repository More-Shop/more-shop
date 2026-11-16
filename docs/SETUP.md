# ติดตั้งและ Deploy

> **More Shop ตั้งค่าแล้ว:** Supabase โปรเจกต์ `more-shop` (Singapore) สร้าง ติดตั้งตาราง และ deploy edge functions เรียบร้อย
> ค่าเชื่อมต่ออยู่ใน `.env.production` — ขั้นตอนด้านล่างใช้เมื่อต้องการติดตั้งใหม่ในโปรเจกต์อื่น

## 1. สร้างโปรเจกต์ Supabase

1. สมัคร/ล็อกอิน <https://supabase.com> → **New project** (Region แนะนำ: Singapore)
2. เก็บค่า **Project URL** และ **anon public key** จาก *Project Settings → API*

## 2. สร้างฐานข้อมูล

เลือกวิธีใดวิธีหนึ่ง

**ก. ผ่านเว็บ (ง่ายที่สุด)** — เปิด *SQL Editor* → วางเนื้อหาไฟล์
`supabase/migrations/20261116000000_init.sql` ทั้งไฟล์ → **Run**

**ข. ผ่าน Supabase CLI**

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

## 3. ตั้งค่า Auth (อีเมล)

*Authentication → URL Configuration*

- **Site URL:** URL ของเว็บ เช่น `https://<user>.github.io/more-shop/`
- **Redirect URLs:** เพิ่ม URL เดียวกัน และ `http://localhost:5173` สำหรับทดสอบ

*Authentication → Providers → Email* เปิดไว้ (ค่าเริ่มต้น) — แนะนำเปิด *Confirm email*
สำหรับใช้งานจริง ควรตั้ง SMTP ของร้านเองใน *Authentication → Emails → SMTP Settings*
(ค่าเริ่มต้นของ Supabase ส่งอีเมลได้จำนวนจำกัดต่อชั่วโมง)

## 4. รันบนเครื่อง

```bash
npm install
cp .env.example .env
# แก้ VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev
```

เปิด <http://localhost:5173> → **สมัครใช้งาน** → **เพิ่มร้านใหม่** → กรอกข้อมูลร้าน

> ทดสอบบนแท็บเล็ตในวง Wi-Fi เดียวกัน: `npm run dev -- --host` แล้วเปิด `http://<ip-เครื่อง>:5173`

## 5. Deploy เว็บขึ้น GitHub Pages

1. Push โค้ดขึ้น GitHub
2. *Settings → Pages → Source:* **GitHub Actions**
3. แก้ค่าใน `.env.production` ให้ตรงกับโปรเจกต์ Supabase ของคุณ (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` เป็นค่าสาธารณะ ปลอดภัยด้วย RLS, `VITE_PUBLIC_URL`)
4. Push เข้า `main` — workflow **Deploy to GitHub Pages** จะ build และ deploy ให้

ใช้ Vercel / Netlify / Cloudflare Pages ก็ได้: Build command `npm run build`, Output `dist`, ใส่ env เดียวกัน

## 6. Deploy Edge Functions (สำหรับ LINE)

```bash
npx supabase functions deploy line-webhook --no-verify-jwt
npx supabase functions deploy line-liff --no-verify-jwt
npx supabase functions deploy line-push --no-verify-jwt
# ให้ข้อความใน LINE มีลิงก์ดูบิลได้:
npx supabase secrets set PUBLIC_APP_URL=https://<user>.github.io/more-shop/
```

(`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` มีให้อัตโนมัติใน Edge Functions)

จากนั้นทำตาม [LINE_OA.md](LINE_OA.md)

## 7. ติดตั้งบนแท็บเล็ตเหมือนแอป

- **iPad (Safari):** ปุ่มแชร์ → *เพิ่มไปยังหน้าจอโฮม*
- **Android (Chrome):** เมนู ⋮ → *ติดตั้งแอป / เพิ่มลงในหน้าจอหลัก*

## การใช้งานหลายร้าน

- เจ้าของร้านแต่ละร้าน **สมัครด้วยอีเมลของตัวเอง** แล้วกด *เพิ่มร้านใหม่*
- บัญชีเดียวมีได้หลายร้าน (เช่น หลายสาขา) — สลับร้านได้ที่ชื่อร้านมุมซ้ายบน
- เพิ่มพนักงาน: ให้พนักงานสมัครด้วยอีเมลตัวเองก่อน → เจ้าของร้านไปที่ *พนักงาน* → ใส่อีเมล + สิทธิ์
- ข้อมูลทุกอย่าง (เมนู โต๊ะ ออเดอร์ บัญชี) แยกตามร้านในระดับฐานข้อมูล (Row Level Security)
