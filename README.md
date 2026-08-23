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

## Offline & sync ทำงานยังไง

หน้าจอทั้งหมดอ่านจาก **IndexedDB (Dexie)** ไม่ได้อ่านจาก server โดยตรง
เขียนก็ลง IndexedDB ก่อนเสมอแล้วค่อย push ขึ้น Supabase เบื้องหลัง
UI จึงไม่เคยรอเน็ต และปิดเน็ตก็ยังจดได้

- `src/lib/db.ts` — schema ฝั่งเครื่อง (`dirty = 1` คือยังไม่ได้ push)
- `src/lib/sync.ts` — push ก่อน pull, last-write-wins รายแถว
- `public/sw.js` — cache app shell ให้เปิดแอพได้ตอนออฟไลน์

เบราว์เซอร์คุยกับ Supabase ตรงๆ ไม่มี API layer เพราะ **RLS** กันข้อมูลข้ามผู้ใช้
ให้อยู่แล้ว

> **IndexedDB เป็นแค่ cache** — Safari ล้าง storage ทิ้งได้ถ้าไม่ได้เปิดเว็บนานๆ
> Supabase คือ source of truth เสมอ นี่คือเหตุผลที่ sync ต้อง push ก่อน pull

## ยังไม่ได้ทำ (ตามลำดับที่ควรทำต่อ)

1. Dashboards
2. แชร์ ledger + จัดการหมวดหมู่/กระเป๋าเงินในแอพ
3. Export CSV / ลบบัญชี (PDPA)
4. Web Push เตือนตอนเย็นว่ายังไม่ได้จด
