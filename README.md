# รายรับรายจ่าย (personal-ledger)

PWA จดรายรับรายจ่าย — Next.js + Supabase (Postgres + Auth + RLS)

## ตั้งค่าครั้งแรก

**1. สร้าง Supabase project** ที่ [supabase.com](https://supabase.com) (free tier)

**2. รัน migration** — เปิด SQL Editor ใน Supabase แล้ววางไฟล์ใน
`supabase/migrations/` ทีละไฟล์ **ตามลำดับเลข** แล้วกด Run

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

## End-to-end encryption

ข้อมูลถูกเข้ารหัสบนเครื่องก่อนส่งขึ้น Supabase **เจ้าของโปรเจกต์เปิดดูไม่ได้**

กุญแจสองชั้น: กุญแจข้อมูล (DEK) เป็นค่าสุ่ม 256-bit ใช้เข้ารหัสทุกแถว
ส่วน passphrase ของผู้ใช้ derive เป็นกุญแจห่อ (KEK) ที่เข้ารหัส *แค่ DEK*
→ เปลี่ยนรหัสผ่านได้โดยไม่ต้องเข้ารหัสข้อมูลใหม่ และทุกเครื่องแกะ DEK ใบเดียวกัน

server เก็บแค่ DEK ที่ถูกห่อไว้ (ตาราง `ledger_keys`) ซึ่งไม่มีประโยชน์ถ้าไม่มี passphrase

**คอลัมน์ที่ server ยังอ่านได้** (จำเป็นต่อ sync/RLS): `id`, `ledger_id`,
`updated_at`, `deleted_at`, และ `sort_order` ของ presets
**ที่เหลือทั้งหมด**อยู่ในคอลัมน์ `payload` เป็น AES-GCM ciphertext

- `src/lib/crypto.ts` — PBKDF2 600k รอบ, AES-GCM, IV สุ่มใหม่ทุกครั้ง
- `src/lib/envelope.ts` — เส้นแบ่งว่าอะไรอ่านได้/อ่านไม่ได้ (ไม่มี dependency กับ Dexie/Supabase เพื่อให้ทดสอบแยกได้)
- `src/lib/vault.ts` — จัดการกุญแจบนเครื่อง

> ⚠️ **ลืม passphrase = ข้อมูลหายถาวร** ไม่มีใครกู้ให้ได้รวมถึงผู้พัฒนา
> นั่นคือความหมายของ E2EE ไม่ใช่ข้อบกพร่อง

**สิ่งที่ยังรั่ว (metadata):** เจ้าของโปรเจกต์ยังเห็นว่ามีกี่แถว แก้ไขเมื่อไหร่
ใครอยู่ ledger ไหน และอีเมลใน `auth.users`

## Dashboard

`/dashboard` — เลือกเดือนได้ที่แถวบนสุด แล้วทุกกราฟใต้ลงมาเปลี่ยนตาม

| ส่วน | รูปแบบ | ทำไมเลือกแบบนี้ |
|---|---|---|
| ยอดรวมเดือน | hero number + stat tile | ตัวเลขเดียวไม่ต้องใช้กราฟ |
| รายจ่ายตามหมวด | bar แนวนอน สีเดียว | หมวดมักมียอดใกล้กัน ซึ่ง donut อ่านยาก และชื่อไทยต้องการที่ |
| แนวโน้ม 12 เดือน | เส้น 2 ชุด แกน y เดียว | ทั้งคู่เป็นบาท สองแกนจะสร้างความสัมพันธ์ปลอม |
| ใช้จ่ายรายวัน | heatmap ปฏิทิน ไล่เฉดสีเดียว | magnitude บนตาราง |

กราฟทั้งหมดคำนวณจาก IndexedDB จึงดูย้อนหลังได้ตอนออฟไลน์
สีอยู่ใน `globals.css` (`.viz`) — ผ่านการตรวจ contrast/colorblind ทั้งสองโหมด
บนพื้นหลังจริงของแอพ (`#ffffff` / `#0a0a0a`)

จอสัมผัสไม่มี hover ค่าทุกตัวจึงต้องอ่านได้โดยไม่ต้อง tooltip — bar มีตัวเลขกำกับ
ทุกแถว, กราฟเส้นแตะเลือกเดือนแล้วอ่านค่าด้านบน, heatmap แตะวันแล้วอ่านยอดด้านล่าง

## ปุ่มลัด & หมวดหมู่

`/settings` — สร้างหมวดหมู่เองได้ และสร้าง **ปุ่มลัด** สำหรับรายการที่จดซ้ำๆ

ปุ่มลัดเก็บชุด (จำนวนเงิน + หมวด + กระเป๋า) ไว้ล่วงหน้า เช่น ค่า BTS เที่ยวละ ฿50
กดปุ่มเดียวบันทึกทันทีไม่ต้องพิมพ์เลข ปุ่มโผล่อยู่บนหน้าจด

เพราะไม่มีขั้นยืนยัน กดพลาดจึงต้องมีทางกลับ — หลังกดจะมีแถบ **เลิกทำ** ให้ 6 วินาที

> ตอนนี้ sync push **3 ตาราง**: transactions, categories, presets
> (กระเป๋าเงินยังแก้ในแอพไม่ได้) การ push เรียง categories ก่อน transactions
> เพราะรายการอาจอ้างหมวดที่เพิ่งสร้างบนเครื่อง ถ้าสลับลำดับ foreign key จะปฏิเสธ

## ยังไม่ได้ทำ (ตามลำดับที่ควรทำต่อ)

1. แชร์ ledger + จัดการกระเป๋าเงินในแอพ
2. งบต่อหมวด (budget vs actual)
3. Export CSV / ลบบัญชี (PDPA)
4. Web Push เตือนตอนเย็นว่ายังไม่ได้จด
