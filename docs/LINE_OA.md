# เชื่อม LINE Official Account

ลูกค้าเปิด LINE OA ของร้าน → กดเมนู **สั่งอาหาร** หรือ **จองโต๊ะ** → **เลือกหมายเลขโต๊ะ** →
สั่งอาหาร / จอง → ร้านเห็นทันทีในหน้า *ออเดอร์* / *การจองโต๊ะ* → ลูกค้าได้ข้อความยืนยันใน LINE

ทำ 1 ครั้งต่อร้าน (แต่ละร้านใช้ LINE OA ของตัวเอง)

## 1. สร้าง LINE OA + Messaging API

1. สร้าง LINE OA ที่ <https://manager.line.biz>
2. *ตั้งค่า → Messaging API → เปิดใช้งาน* (จะได้ Provider และ Channel)
3. ไปที่ <https://developers.line.biz/console/> → เลือก Channel *Messaging API*
   - **Basic settings → Channel secret** → คัดลอก
   - **Messaging API → Channel access token (long-lived) → Issue** → คัดลอก
   - **Messaging API → Webhook URL:** ใส่ค่าจากหน้า *ตั้งค่าร้าน → LINE* ช่อง ② เช่น
     `https://<project>.supabase.co/functions/v1/line-webhook?store=more-shop`
     แล้วกด **Verify** และเปิด **Use webhook**
   - ปิด *Auto-reply messages* ใน LINE OA Manager (ไม่อย่างนั้นบอทตอบซ้ำ)

## 2. สร้าง LIFF app

1. ใน Provider เดียวกัน → **Create a new channel → LINE Login**
2. แท็บ **LIFF → Add**
   - **Size:** Full
   - **Endpoint URL:** ค่าจาก *ตั้งค่าร้าน → LINE* ช่อง ① เช่น
     `https://<user>.github.io/more-shop/?liff=more-shop`
   - **Scopes:** `openid`, `profile`
3. คัดลอก **LIFF ID** และ **Channel ID** ของ LINE Login channel
4. แท็บ **Basic settings → Linked LINE Official Account** เลือก OA ของร้าน (ให้ลูกค้าเพิ่มเพื่อนร้านตอนเข้าใช้)
5. Publish channel LINE Login (สถานะ *Published*)

## 3. ใส่ค่าในระบบ

*ตั้งค่าร้าน → LINE Official Account* (ต้องเป็นเจ้าของร้าน)

| ช่อง | ค่า |
|---|---|
| LINE OA Basic ID | เช่น `@moreshop` |
| LIFF ID | จากข้อ 2 |
| LINE Login Channel ID | จากข้อ 2 |
| Channel secret | จากข้อ 1 |
| Channel access token | จากข้อ 1 |
| ส่งแจ้งเตือนไปที่ | (ไม่บังคับ) เชิญบอทเข้ากลุ่ม LINE พนักงาน แล้วพิมพ์ `staff-id` ในกลุ่ม → นำรหัสที่ได้มาใส่ |

Secret / token เก็บในตาราง `store_secrets` ที่อ่านได้เฉพาะเจ้าของร้านและ Edge Function เท่านั้น

## 4. Rich menu (เมนูด้านล่างแชท)

LINE OA Manager → *Rich menu → สร้าง* → เลือกเทมเพลต 2–3 ช่อง

| ปุ่ม | Action: Link |
|---|---|
| สั่งอาหาร | `https://liff.line.me/<LIFF ID>` |
| จองโต๊ะ | `https://liff.line.me/<LIFF ID>?go=book` |
| เมนูร้าน | `https://<เว็บ>/#/s/<slug>` |

ลูกค้าพิมพ์คำว่า “เมนู”, “สั่ง”, “จอง” ในแชท บอทจะส่งปุ่มให้เช่นกัน

## 5. ทดสอบ

- กด *ทดสอบเปิด LIFF* ในหน้าตั้งค่า หรือเปิดลิงก์ `https://liff.line.me/<LIFF ID>` ในแชท LINE ของตัวเอง
- สั่งอาหาร → หน้า *ออเดอร์* บนแท็บเล็ตจะมีเสียงแจ้งเตือนและป้าย “รอยืนยัน”
- จองโต๊ะ → หน้า *การจองโต๊ะ* → กด **ยืนยัน** → ลูกค้าได้ข้อความ ✅ ใน LINE

## ความปลอดภัย

- ทุกคำสั่งจาก LIFF ส่ง **LINE ID token** ไปตรวจกับ LINE (`/oauth2/v2.1/verify`) ก่อนบันทึก
  จึงปลอมตัวเป็นลูกค้าคนอื่นไม่ได้
- ราคาคิดจากเมนูในฐานข้อมูลเสมอ ลูกค้าแก้ราคาเองไม่ได้
- ออเดอร์จาก QR/LINE เข้าสถานะ “รอยืนยัน” ให้พนักงานกดยืนยันก่อนส่งครัว
- Webhook ตรวจลายเซ็น `X-Line-Signature` ทุกครั้ง
