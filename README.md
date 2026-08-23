# รายรับรายจ่าย (personal-ledger)

PWA จดรายรับรายจ่าย — Next.js + Supabase (Postgres + Auth + RLS)

## ตั้งค่าครั้งแรก

**1. สร้าง Supabase project** ที่ [supabase.com](https://supabase.com) (free tier)

**2. รัน migration** — เปิด SQL Editor ใน Supabase แล้ววางเนื้อหาจาก
`supabase/migrations/0001_init.sql` ทั้งไฟล์ กด Run

**3. ใส่ค่า env** — copy `.env.example` เป็น `.env.local` แล้วเติมค่าจาก
Supabase → Project Settings → API

```bash
cp .env.example .env.local
```

**4. ตั้ง redirect URL** — Supabase → Authentication → URL Configuration
เพิ่ม `http://localhost:3000/auth/callback` (และ URL production เมื่อ deploy)

**5. รัน**

```bash
pnpm dev
```

## Deploy

Push ขึ้น GitHub แล้วต่อกับ Vercel — ใส่ env สองตัวเดียวกัน
เสร็จแล้วเปิดบน iPhone → Safari → Share → **Add to Home Screen**

## จดเร็วด้วย iOS Shortcuts

หน้าจดรับค่า query params เพื่อ pre-fill ฟอร์ม:

```
https://<host>/?amount=80&cat=อาหาร&note=กาแฟ
https://<host>/?amount=25000&kind=income&cat=เงินเดือน
```

สร้าง Shortcut แบบ **Open URL** ชี้มาที่ลิงก์นี้ แล้ววางไว้หน้า Home Screen
หรือเรียกด้วยเสียงผ่าน Siri ได้

## หลักการที่โค้ดนี้ยึด

- **จำนวนเงินเป็น integer (สตางค์)** — `฿80.50` เก็บเป็น `8050` ไม่ใช้ float
- **id สร้างจาก client (UUIDv7)** — จด offline ได้ และ id เรียงตามเวลา
- **ลบแบบ soft delete** — `deleted_at` เป็น tombstone ไม่งั้นรายการที่ลบจะฟื้นตอน sync
- **RLS เป็นด่านกั้น tenant** — ไม่ใช่โค้ดฝั่ง application
- **`ledger_id` อยู่ทุกตารางตั้งแต่วันแรก** — แชร์บัญชีทีหลังจะไม่ต้อง migrate

## ยังไม่ได้ทำ (ตามลำดับที่ควรทำต่อ)

1. Offline — Dexie cache + sync queue + service worker
2. Dashboards
3. แชร์ ledger + จัดการหมวดหมู่/กระเป๋าเงินในแอพ
4. Export CSV / ลบบัญชี (PDPA)
