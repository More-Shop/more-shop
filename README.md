# More Shop

ระบบจัดการร้านอาหาร / ร้านค้า แบบหลายร้าน (multi-store) ใช้งานบนแท็บเล็ต มือถือ และคอมพิวเตอร์
ชื่อ **More Shop** เป็นชื่อเริ่มต้นของระบบ — แต่ละร้านมีชื่อ โลโก้ สี และข้อมูลภาษีของตัวเอง
และเปลี่ยนชื่อระบบได้ด้วยตัวแปร `VITE_APP_NAME`

> A white-label, multi-store restaurant POS: tablet ordering with photos, table QR ordering,
> 58/80 mm receipt printing, income/expense bookkeeping with Thai Revenue Department reports,
> and table booking / ordering through LINE Official Account. React + Supabase.

## ความสามารถ

| # | ฟีเจอร์ | รายละเอียด |
|---|---|---|
| 1 | **สั่งอาหารผ่านแท็บเล็ต (POS)** | หน้าจอเมนูมีรูปและราคา แตะเพื่อสั่ง เลือกโต๊ะ ใส่หมายเหตุ (ไม่เผ็ด ฯลฯ) — เพิ่ม/แก้รูปและราคาเองได้ในหน้า “เมนูและราคา” (ถ่ายรูปจากแท็บเล็ตได้เลย ระบบย่อขนาดให้อัตโนมัติ) รูปเก็บใน **Google Drive โฟลเดอร์ของแต่ละร้าน** |
| 2 | **พิมพ์ผ่านเครื่องพิมพ์ใบเสร็จ** | ใบสั่งครัว (เลขโต๊ะตัวใหญ่ + รายการ), QR Code สั่งอาหารประจำโต๊ะ, ใบแจ้งยอดพร้อม QR พร้อมเพย์, ใบเสร็จ / ใบกำกับภาษีอย่างย่อ / เต็มรูป รองรับกระดาษ 58 และ 80 มม. |
| 3 | **บัญชีรายรับ-รายจ่าย** | ยอดขายลงบัญชีอัตโนมัติเมื่อเช็คบิล บันทึกรายจ่ายพร้อมแนบรูปใบเสร็จ ผังบัญชีแก้ไขได้ ออกรายงาน **เงินสดรับ-จ่าย, ภาษีขาย, ภาษีซื้อ, งบกำไรขาดทุน, สมุดรายวันทั่วไป (เดบิต/เครดิต)** เป็น PDF (A4) และ CSV/Excel |
| 4 | **จองโต๊ะ & สั่งอาหารผ่าน LINE OA** | ลูกค้ากดเมนูใน LINE → เลือกหมายเลขโต๊ะ → สั่งอาหารหรือจองโต๊ะ (ผ่าน LIFF) ร้านกดยืนยัน ลูกค้าได้ข้อความตอบกลับใน LINE อัตโนมัติ |
| 5 | **หลายร้าน** | กด “เพิ่มร้านใหม่” แล้วกรอกฟอร์ม (ชื่อร้าน เลขผู้เสียภาษี สาขา VAT ค่าบริการ พร้อมเพย์ ขนาดกระดาษ เวลาเปิด-ปิด ฯลฯ) |
| 6 | **อีเมลและข้อมูลแยกกันต่อร้าน** | ผู้ใช้แต่ละคนล็อกอินด้วยอีเมลตัวเอง ข้อมูลทุกตารางแยกตามร้านด้วย Row Level Security ในฐานข้อมูล — ร้านหนึ่งมองไม่เห็นข้อมูลอีกร้าน มีสิทธิ์ เจ้าของ / ผู้จัดการ / พนักงาน |

ภาพหน้าจอ: `docs/screenshots/`

## เทคโนโลยี

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS (PWA-ready, ติดตั้งบนหน้าจอ iPad/Android ได้)
- **Backend:** [Supabase](https://supabase.com) — PostgreSQL + Row Level Security, Auth (อีเมล), Storage (รูปเมนู), Realtime (ออเดอร์ใหม่เด้งทุกเครื่อง), Edge Functions (LINE)
- **LINE:** Messaging API (webhook / push) + LIFF (LINE Front-end Framework)
- **Hosting:** GitHub Pages (มี workflow ให้) หรือ Vercel / Netlify / Cloudflare Pages

## เริ่มต้นใช้งาน

เว็บจริง: **https://more-shop.github.io/more-shop/** (หลังเปิด GitHub Pages) — เชื่อมฐานข้อมูล Supabase โปรเจกต์ `more-shop` แล้ว (ค่าอยู่ใน `.env.production`)

```bash
npm install
npm run dev               # ใช้ค่าใน .env (คัดลอกจาก .env.example หรือ .env.production)
```

ขั้นตอนเต็ม (สร้าง Supabase, รัน migration, deploy, ตั้งค่า LINE, เครื่องพิมพ์):

1. [docs/SETUP.md](docs/SETUP.md) — ติดตั้งฐานข้อมูลและ deploy เว็บ
2. [docs/LINE_OA.md](docs/LINE_OA.md) — เชื่อม LINE Official Account / LIFF
3. [docs/PRINTER.md](docs/PRINTER.md) — เครื่องพิมพ์ใบเสร็จ 58/80 มม. กับ iPad / Android / Windows
4. [docs/ACCOUNTING.md](docs/ACCOUNTING.md) — รายงานบัญชีและภาษีสำหรับยื่นสรรพากร
5. [docs/GOOGLE_DRIVE.md](docs/GOOGLE_DRIVE.md) — เก็บรูปเมนู/โลโก้/ใบเสร็จใน Google Drive ของแต่ละร้าน

## โครงสร้างโปรเจกต์

```
src/
  pages/admin/      หน้าหลังร้าน: POS, ออเดอร์, เมนู, โต๊ะ, การจอง, รายรับ-รายจ่าย, รายงาน, พนักงาน, ตั้งค่า
  pages/public/     หน้าลูกค้า: เมนู QR, จองโต๊ะ, LINE LIFF, ดูบิล
  print/            แม่แบบใบเสร็จ / ใบสั่งครัว / QR โต๊ะ
  lib/              รายงานบัญชี, พร้อมเพย์, VAT, จำนวนเงินเป็นตัวอักษร, การพิมพ์
supabase/
  migrations/       ตาราง, RLS, ฟังก์ชันสั่งอาหาร/เช็คบิล/จองโต๊ะ
  functions/        Edge functions: line-webhook, line-liff, line-push
apps-script/        DriveUpload.gs — บันทึกรูปลงโฟลเดอร์ Google Drive ของแต่ละร้าน
  tests/            ทดสอบสิทธิ์ข้อมูลข้ามร้าน และ logic ฐานข้อมูล
tests/              Unit tests (VAT, พร้อมเพย์, BAHTTEXT, รายงานบัญชี)
```

## การทดสอบ

```bash
npm run typecheck && npm test && npm run build
# ฐานข้อมูล (ต้องมี PostgreSQL 15+):
cd supabase && psql -v ON_ERROR_STOP=1 -f tests/supabase_stub.sql -f migrations/20261116000000_init.sql -f tests/rls_test.sql
```

GitHub Actions รันทั้งสามชุด (web, database, edge functions) ทุก push / pull request

## เปลี่ยนชื่อแบรนด์ระบบ

- ชื่อระบบ: ตั้ง `VITE_APP_NAME` (เช่น `"Siam POS"`) ใน `.env` หรือ GitHub Variables
- ชื่อ/โลโก้/สีของแต่ละร้าน: แก้ในหน้า **ตั้งค่าร้าน** — ใบเสร็จ หน้าลูกค้า และข้อความ LINE ใช้ข้อมูลของร้านนั้น ๆ
- ไอคอนและชื่อแอปเมื่อติดตั้งบนหน้าจอ: `public/favicon.svg`, `public/manifest.webmanifest`, `<title>` ใน `index.html`
