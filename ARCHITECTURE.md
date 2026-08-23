# สถาปัตยกรรม — personal-ledger

เอกสารนี้อธิบายว่าชิ้นส่วนทั้งสี่ (GitHub / Vercel / Supabase / ตัวแอพ) ประกอบกันอย่างไร
และแต่ละอย่าง "รู้จัก" กันได้ด้วยกลไกอะไร

---

## สารบัญ

1. [ภาพรวม 30 วินาที](#1-ภาพรวม-30-วินาที)
2. [Vercel รู้จักแอพได้ยังไง](#2-vercel-รู้จักแอพได้ยังไง)
3. [Vercel รู้จัก Supabase ได้ยังไง](#3-vercel-รู้จัก-supabase-ได้ยังไง)
4. [อะไรรันที่ไหน](#4-อะไรรันที่ไหน)
5. [โครงไฟล์ในแอพ](#5-โครงไฟล์ในแอพ)
6. [ฝั่ง Supabase](#6-ฝั่ง-supabase)
7. [เส้นทางข้อมูล](#7-เส้นทางข้อมูล)
8. [Auth](#8-auth)
9. [การเข้ารหัส](#9-การเข้ารหัส)
10. [Offline](#10-offline)
11. [ขั้นตอน deploy](#11-ขั้นตอน-deploy)
12. [ข้อจำกัดที่รู้อยู่](#12-ข้อจำกัดที่รู้อยู่)

---

## 1. ภาพรวม 30 วินาที

```
    คุณเขียนโค้ด                     ผู้ใช้เปิดแอพ
         │                                 │
         │ git push                        │
         ▼                                 ▼
   ┌───────────┐   webhook   ┌──────────────────────┐
   │  GitHub   │ ──────────► │       Vercel         │
   │  (source) │             │  build + เสิร์ฟไฟล์   │
   └───────────┘             └──────────┬───────────┘
                                        │ ส่ง HTML + JS
                                        ▼
                             ┌──────────────────────┐
                             │  เบราว์เซอร์ผู้ใช้     │
                             │  ┌────────────────┐  │
                             │  │  IndexedDB     │  │ ◄── อ่าน/เขียนที่นี่เป็นหลัก
                             │  │  (Dexie)       │  │
                             │  └────────────────┘  │
                             └──────────┬───────────┘
                                        │ HTTPS ตรง (ไม่ผ่าน Vercel)
                                        ▼
                             ┌──────────────────────┐
                             │      Supabase        │
                             │  Postgres + Auth     │
                             └──────────────────────┘
```

หัวใจที่ต้องเข้าใจ: **Vercel ไม่ได้อยู่ระหว่างแอพกับฐานข้อมูล**
มันแค่ส่งไฟล์ให้เบราว์เซอร์ครั้งเดียว หลังจากนั้นเบราว์เซอร์คุยกับ Supabase เอง

| ชิ้นส่วน | หน้าที่ | ไม่ได้ทำอะไร |
|---|---|---|
| **GitHub** | เก็บ source of truth ของโค้ด | ไม่แตะข้อมูลผู้ใช้ |
| **Vercel** | build โค้ด + เสิร์ฟ static + รัน middleware | ไม่เก็บข้อมูล, ไม่ใช่ทางผ่านของข้อมูล |
| **Supabase** | Postgres, auth, RLS | ไม่คำนวณอะไรให้ (ดูข้อ 7) |
| **เบราว์เซอร์** | UI, IndexedDB, เข้ารหัส, คำนวณ dashboard ทั้งหมด | — |

---

## 2. Vercel รู้จักแอพได้ยังไง

สามชั้น เรียงจากล่างขึ้นบน

### 2.1 ชั้นเชื่อมต่อ — Git integration

ตอนกด *Add New Project* แล้วเลือก repo `gchanon/personal-ledger` Vercel จะ:

1. ขอสิทธิ์เข้าถึง repo ผ่าน **GitHub App** (ไม่ใช่ SSH key ไม่ใช่ token ของคุณ)
2. ติดตั้ง **webhook** ไว้ที่ repo นั้น

ผลคือ ทุกครั้งที่มี push GitHub จะยิง HTTP POST ไปบอก Vercel ว่า
"branch `main` ขยับไปที่ commit `abc1234` แล้ว" — Vercel จึงเริ่ม build เอง
**คุณไม่ต้องกดอะไรเลย นี่คือคำตอบว่าทำไม `git push` = deploy**

ถ้า webhook ไม่ทำงาน (เช่นถูกลบ) จะไม่มี deployment ใหม่ขึ้นเลย
ทางแก้คือกด **Redeploy** พร้อมติ๊ก *use latest commit*

### 2.2 ชั้นตรวจจับ framework

Vercel อ่าน `package.json` เจอ `"next": "15.5.23"` ใน dependencies
→ สรุปว่าเป็น Next.js → ตั้งค่าเองทั้งหมด:

| สิ่งที่ Vercel เดา | ค่าที่ได้ | มาจากไหน |
|---|---|---|
| Build command | `next build` | `scripts.build` ใน package.json |
| Output | `.next/` | มาตรฐาน Next |
| Node version | 22 | ดีฟอลต์ปัจจุบันของ Vercel |
| Install | `pnpm install` | เจอ `pnpm-lock.yaml` |

**ไม่มีไฟล์ config ของ Vercel ในโปรเจกต์นี้เลย** (ไม่มี `vercel.json`)
ทุกอย่างมาจากการตรวจจับ ซึ่งเป็นเหตุผลว่าทำไมย้ายไป host อื่นไม่ยาก

### 2.3 ชั้นแปลผลลัพธ์ build

หลัง build เสร็จ Vercel อ่านผลลัพธ์แล้วแยกว่าอะไรเสิร์ฟแบบไหน:

```
○ /                    static  ─┐
○ /login               static   │  ไฟล์นิ่ง วางบน CDN ทั่วโลก
○ /transactions        static   │  ไม่มีการรันโค้ดตอนมีคนขอ
○ /transactions/edit   static   │
○ /dashboard           static   │
○ /settings            static  ─┘

ƒ /auth/callback       dynamic ──  รัน serverless function ต่อ request
ƒ Middleware (95.8 kB) edge    ──  รันทุก request ที่เข้าเงื่อนไข matcher
```

ที่ทุกหน้าเป็น static ได้เพราะ **หน้าเว็บไม่ดึงข้อมูลผู้ใช้ตอน render**
ทุกหน้าเป็น client component ที่อ่านจาก IndexedDB หลังโหลดเสร็จ
ผลพลอยได้คือ service worker แคชได้ทั้งหมด (ดูข้อ 10)

---

## 3. Vercel รู้จัก Supabase ได้ยังไง

**ผ่าน environment variables สองตัวเท่านั้น** ไม่มีการเชื่อมต่อพิเศษ ไม่มี integration

```
NEXT_PUBLIC_SUPABASE_URL       = https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY  = eyJhbGciOi...
```

ตั้งที่ **Vercel → Settings → Environment Variables**

### จุดที่คนพลาดบ่อย: `NEXT_PUBLIC_` ถูกฝังตอน build ไม่ใช่อ่านตอนรัน

```
ตอน build                              ตอนผู้ใช้เปิดเว็บ
─────────                              ─────────────────
Vercel อ่าน env         ───►  แทนค่าลงในไฟล์ JS จริงๆ
                                       │
                                       ▼
                              chunk-abc123.js มีข้อความ
                              "https://xxx.supabase.co" อยู่ในไฟล์
```

ผลตามมาสองข้อ:

1. **แก้ env แล้วต้อง redeploy** ไม่งั้นไฟล์ JS เก่ายังมีค่าเดิมฝังอยู่
2. **ค่าทั้งสองเป็นข้อมูลสาธารณะ** ใครก็เปิด DevTools อ่านได้
   นั่นคือเจตนา — `anon` key ออกแบบมาให้เปิดเผย ความปลอดภัยอยู่ที่ **RLS** ไม่ใช่ที่การซ่อน key

> ⚠️ **ห้ามใส่ `service_role` key ที่นี่เด็ดขาด** ตัวนั้นข้าม RLS ทั้งหมด
> ถ้าหลุดไปอยู่ในบันเดิล = ใครก็อ่าน/ลบข้อมูลทุกคนได้

### แล้ว Supabase รู้จัก Vercel มั้ย

รู้จักในแง่เดียว: **Redirect URLs allowlist**

Supabase → Authentication → URL Configuration ต้องมี:

```
http://localhost:3000/auth/callback
https://personal-ledger-steel.vercel.app/auth/callback
```

ถ้าโดเมนไม่อยู่ในลิสต์ Supabase จะไม่ส่ง session กลับมาที่โดเมนนั้น
(กันคนเอาโปรเจกต์คุณไปหลอกเอา token) นอกจากนี้สองระบบไม่รู้จักกันเลย

---

## 4. อะไรรันที่ไหน

นี่คือตารางที่ตอบคำถาม "ข้อมูลผมผ่านมือใครบ้าง"

| งาน | รันที่ | เห็นข้อมูลผู้ใช้มั้ย |
|---|---|---|
| Build โค้ด | Vercel (ตอน deploy) | ไม่ |
| เสิร์ฟ HTML/JS/CSS | Vercel CDN | ไม่ |
| Middleware — เช็ก session, redirect | Vercel Edge | เห็นแค่ว่า login อยู่มั้ย |
| `/auth/callback` — แลก token | Vercel serverless | เห็นแค่ token |
| **UI ทั้งหมด** | เบราว์เซอร์ | ใช่ |
| **คำนวณ dashboard** | เบราว์เซอร์ | ใช่ |
| **เข้ารหัส/ถอดรหัส** | เบราว์เซอร์ | ใช่ |
| เก็บข้อมูล | Supabase Postgres | ขึ้นกับโหมด (ดูข้อ 9) |

**ข้อมูลรายการรับ-จ่ายไม่เคยผ่าน server ของ Vercel**
เบราว์เซอร์ยิงตรงไป `https://<ref>.supabase.co` เอง

Middleware เป็นชิ้นเดียวที่รันบน Vercel ทุก request:

```
matcher: ทุก path ยกเว้น _next/static, _next/image, favicon.ico,
         manifest.webmanifest, sw.js, apple-touch-icon.png, icons/
```

`sw.js` ต้องหลุดจาก matcher — ถ้ามันถูก redirect (307) การลงทะเบียน
service worker จะพังทั้งหมด และ offline หายไปด้วย

---

## 5. โครงไฟล์ในแอพ

```
src/
├─ middleware.ts            รัน Edge: refresh token + กันหน้าที่ต้อง login
│
├─ app/                     หน้าเว็บ (Next App Router)
│  ├─ layout.tsx            เชลล์: Nav + VaultGate + SyncBar
│  ├─ page.tsx              หน้าจด (หน้าแรก)
│  ├─ transactions/         ลิสต์ + แก้ไข (?id=)
│  ├─ dashboard/            กราฟ 4 แบบ
│  ├─ settings/             หมวดหมู่ / ปุ่มลัด / ความเป็นส่วนตัว
│  ├─ login/                Google + magic link
│  └─ auth/callback/        route handler แลก code/token → session
│
├─ components/
│  ├─ vault-gate.tsx        ★ ประตู: เลือกโหมด / ตั้งรหัส / ปลดล็อก
│  ├─ sync-bar.tsx          สถานะซิงก์ + ออกจากระบบ
│  ├─ transaction-form.tsx  ฟอร์มเดียวใช้ทั้งจดใหม่และแก้
│  ├─ quick-add.tsx         ปุ่มลัด + แถบเลิกทำ
│  ├─ encryption-settings.tsx  สลับโหมดเข้ารหัส
│  └─ charts/               bar / line / heatmap (inline SVG)
│
└─ lib/                     ★ แกนของระบบอยู่ที่นี่
   ├─ db.ts                 Dexie schema (v1→v3) + clearLocalData
   ├─ sync.ts               push-then-pull, cursor, mode
   ├─ envelope.ts           เส้นแบ่ง "server อ่านได้ / อ่านไม่ได้"
   ├─ crypto.ts             PBKDF2 + AES-GCM (ไม่รู้จัก Dexie/Supabase)
   ├─ vault.ts              จัดการกุญแจบนเครื่อง + โหมด
   ├─ transactions.ts       เขียนรายการลง IndexedDB
   ├─ catalog.ts            หมวดหมู่ / ปุ่มลัด / seed ค่าเริ่มต้น
   ├─ analytics.ts          รวมยอดสำหรับ dashboard (ล้วนๆ ไม่มี I/O)
   └─ supabase/             client (เบราว์เซอร์) + server (route handler)
```

`crypto.ts` กับ `envelope.ts` **ไม่ import Dexie หรือ Supabase เลย**
ตั้งใจให้ทดสอบแยกได้ เพราะสองไฟล์นี้ตัดสินว่าข้อมูลรั่วหรือไม่

---

## 6. ฝั่ง Supabase

### 6.1 ตาราง

```
auth.users  (ของ Supabase เอง)
    │
    │ trigger: on_auth_user_created
    ▼
ledgers ──────────────┐  id, name, base_currency, owner_id,
    │                 │  encryption_mode ('e2ee' | 'plaintext' | NULL)
    │                 │
    ├─ ledger_members │  (ledger_id, user_id, role) ← ใช้ทำ RLS
    ├─ ledger_keys    │  DEK ที่ถูกห่อ + salt + iterations
    ├─ wallets        │
    ├─ categories     │  ทุกตารางมี ledger_id, updated_at,
    ├─ presets        │  deleted_at, payload
    └─ transactions ──┘
```

ทุกตารางเนื้อหามีสี่คอลัมน์ร่วมกัน และนี่คือสิ่งที่ทำให้ระบบทั้งหมดทำงาน:

| คอลัมน์ | ทำไมต้องมี |
|---|---|
| `ledger_id` | ขอบเขต tenant — RLS ใช้ตัวนี้ |
| `updated_at` | cursor ของ sync (trigger เขียนให้ ห้าม client กำหนด) |
| `deleted_at` | tombstone — ถ้าลบจริงรายการจะฟื้นตอน sync ครั้งหน้า |
| `payload` | ciphertext เมื่ออยู่โหมด e2ee |

### 6.2 RLS

```sql
create function is_ledger_member(p_ledger_id uuid) ... security definer
```

`security definer` **จำเป็น** ไม่ใช่ทางเลือก: policy บน `ledger_members`
ต้อง query `ledger_members` เอง ถ้าไม่ bypass RLS ในฟังก์ชันนี้จะ recurse ไม่สิ้นสุด
(กับดักคลาสสิกของ Supabase)

policy ทั้งหมดใช้รูปเดียวกัน:

```sql
create policy transactions_rw on transactions
  for all using (is_ledger_member(ledger_id))
       with check (is_ledger_member(ledger_id));
```

**tenant isolation อยู่ในฐานข้อมูล ไม่ใช่ในโค้ดแอพ** — ถึงโค้ดจะบั๊ก
ข้อมูลก็ไม่ข้ามผู้ใช้ นั่นคือเหตุผลที่เบราว์เซอร์ยิงตรงเข้า Postgres ได้อย่างปลอดภัย

> **RLS ไม่กันเจ้าของโปรเจกต์** `service_role` และ SQL Editor ข้าม RLS ทั้งหมด
> นั่นคือเหตุผลที่มีการเข้ารหัส (ข้อ 9)

### 6.3 Trigger

| trigger | ทำอะไร |
|---|---|
| `on_auth_user_created` | user ใหม่ → สร้าง ledger + membership (role owner) |
| `touch_transactions` / `touch_categories` / `touch_wallets` / `touch_presets` | เขียน `updated_at = now()` ทุกครั้งที่ UPDATE |

`touch_*` สำคัญกว่าที่เห็น: cursor ของ sync เชื่อถือได้เพราะ
**server เป็นเจ้าของ `updated_at`** ไม่ใช่ client

### 6.4 Migration

รันเรียงเลขใน SQL Editor:

| ไฟล์ | ทำอะไร |
|---|---|
| `0001_init.sql` | ตารางหลัก, index, RLS, trigger, bootstrap user ใหม่ |
| `0002_presets.sql` | ตาราง `presets` |
| `0003_e2ee.sql` | `ledger_keys`, คอลัมน์ `payload`, ทำคอลัมน์เนื้อหาเป็น nullable, เลิก seed หมวดใน trigger |
| `0004_encryption_choice.sql` | `ledgers.encryption_mode` |
| `0005_backfill_encryption_mode.sql` | เติมค่าให้ ledger เดิมที่เป็น NULL |

> `0005` มีอยู่เพราะ `0004` เพิ่มคอลัมน์แบบ nullable แล้วปล่อย ledger เดิมเป็น `NULL`
> ซึ่ง `sync()` ตีความว่า "ยังไม่ตั้งค่า" แล้ว**ออกก่อนถึงขั้น pull** — ผู้ใช้เดิมทุกคน
> จึงหยุดซิงก์เงียบๆ ทันทีที่ deploy บทเรียน: migration ที่เพิ่ม flag ต้องเติมค่าให้แถวเดิมพร้อมกัน

---

## 7. เส้นทางข้อมูล

### 7.1 หลักการ

```
เขียน:  UI ──► IndexedDB (dirty=1) ──► [เบื้องหลัง] ──► Supabase
อ่าน:   UI ◄── IndexedDB
```

**UI ไม่เคยรอเน็ต** ทุกการเขียนลง IndexedDB ก่อน แล้วค่อย push
ทุกการอ่านมาจาก IndexedDB ไม่เคยยิงไป Supabase ตอน render

> IndexedDB เป็น **cache** ไม่ใช่ source of truth — Safari ล้าง storage ได้
> ถ้าไม่เปิดเว็บนานๆ Supabase คือของจริงเสมอ

### 7.2 โปรโตคอล sync

```
sync()
  │
  ├─ 1. เช็ก online / login / โหมด / กุญแจ  ── ไม่ผ่าน → ออกทันที
  │
  ├─ 2. PUSH  (เรียงลำดับสำคัญ)
  │      categories → wallets → transactions → presets
  │      เหตุผล: รายการอาจอ้างหมวดที่มีแค่บนเครื่อง
  │              ถ้า push transactions ก่อน foreign key จะปฏิเสธ
  │
  │      แต่ละแถว dirty=1 → seal() → upsert → เคลียร์ dirty
  │      เคลียร์เฉพาะแถวที่ updated_at ไม่เปลี่ยน
  │      (กันการแก้ระหว่าง push บินอยู่หายเงียบ)
  │
  └─ 3. PULL
         GET rows WHERE updated_at > cursor ORDER BY updated_at
         → ข้ามแถวที่ local ยัง dirty (ของเรานใหม่กว่า)
         → open() ถอดรหัส
         → cursor = updated_at ล่าสุดที่สำเร็จ − 2 วินาที
```

**ทำไม push ก่อน pull:** แถวที่ยังไม่ได้ push ใหม่กว่าอะไรก็ตามที่ server ส่งมาได้
last-write-wins จึงตัดสินไปทางที่ถูก เมื่อ "ความขัดแย้ง" คือคนเดียวกันใช้สองเครื่อง

**ทำไม cursor ถอยหลัง 2 วินาที:** commit อาจลงไม่เรียงเวลา
อ่านซ้ำไม่เสียหายเพราะ upsert เป็น idempotent แต่ข้ามแถวคือข้อมูลหาย

**สิ่งที่ server ทำให้:** `WHERE updated_at > x` และ `ORDER BY updated_at` — จบ
ไม่มี SUM ไม่มี JOIN ไม่มี GROUP BY **นี่คือเหตุผลที่เข้ารหัสได้ฟรี** (ข้อ 9)

### 7.3 Dashboard

`analytics.ts` รวมยอดจากแถวใน IndexedDB ด้วย JS ธรรมดา
ที่ระดับหลายแสนแถวยังต่ำกว่าหนึ่งเฟรม ถ้าวันหนึ่งช้าจริง ทางแก้คือ
ตาราง summary รายเดือน **ไม่ใช่**ย้ายไปคำนวณบน server

---

## 8. Auth

รองรับสองทาง จบที่ `/auth/callback` ทั้งคู่

### Google OAuth

```
กดปุ่ม
  → supabase.auth.signInWithOAuth({ provider: 'google' })
  → https://<ref>.supabase.co/auth/v1/authorize?provider=google
  → accounts.google.com  (ผู้ใช้เลือกบัญชี)
  → https://<ref>.supabase.co/auth/v1/callback     ← ต้องอยู่ใน Google Cloud Console
  → https://<โดเมนแอพ>/auth/callback?code=...      ← ต้องอยู่ใน Supabase allowlist
  → exchangeCodeForSession(code) → เขียน cookie
  → redirect ไปหน้าแรก
```

สอง URL นั้นคนละที่กัน และสลับกันบ่อย:

| URL | ตั้งที่ | อาการถ้าผิด |
|---|---|---|
| `https://<ref>.supabase.co/auth/v1/callback` | Google Cloud Console | `Error 400: redirect_uri_mismatch` |
| `https://<โดเมนแอพ>/auth/callback` | Supabase URL Configuration | login ผ่านแต่เด้งกลับหน้าเดิม |

### Magic link

```
ใส่อีเมล → signInWithOtp() → Supabase ส่งเมล
  → กดลิงก์ → /auth/callback?token_hash=...&type=email
  → verifyOtp() → cookie → หน้าแรก
```

> SMTP ในตัวของ Supabase จำกัดไม่กี่ฉบับต่อชั่วโมง ใช้จริงต้องต่อ SMTP เอง
> (Brevo ไม่ต้องมีโดเมน / Resend ต้องมี)

### Session

เก็บใน **cookie** ไม่ใช่ localStorage → middleware บน Vercel Edge อ่านได้
จึง refresh token และ redirect ก่อนหน้าจะ render ได้

```
middleware.ts
  ├─ ไม่มี env → ปล่อยผ่าน + log (ไม่ใช่ throw — throw = ทั้งเว็บ 500)
  ├─ getUser() ล้มเหลว → ถือว่าไม่มี session (Supabase ล่มต้องไม่ล้มทั้งเว็บ)
  ├─ ไม่ login + ไม่ใช่หน้า public → redirect /login
  └─ login แล้ว + อยู่ /login → redirect /
```

---

## 9. การเข้ารหัส

### 9.1 ปัญหาที่แก้

RLS กันเพื่อนไม่ให้เห็นกันเอง แต่**ไม่กันเจ้าของโปรเจกต์**
และ encryption-at-rest ก็ไม่กัน เพราะกุญแจอยู่ในโปรเจกต์ที่คุณคุม

### 9.2 กุญแจสองชั้น

```
passphrase ─PBKDF2(600k, SHA-256, salt 16B)─► KEK ─┐
                                                    │ ห่อ (AES-GCM)
DEK (สุ่ม 256-bit) ◄────────────────────────────────┘
  │
  └─ เข้ารหัสทุกแถว (AES-GCM, IV สุ่มใหม่ทุกครั้ง)

server เก็บ: salt, iterations, DEK-ที่ถูกห่อ   ← ไร้ประโยชน์ถ้าไม่มี passphrase
เครื่องเก็บ: DEK ที่แกะแล้ว แบบ non-extractable ใน IndexedDB
```

**ทำไมไม่ derive กุญแจจาก passphrase ตรงๆ:**
- เปลี่ยนรหัสผ่าน → ห่อ DEK ใหม่ 32 bytes ไม่ต้องเข้ารหัสข้อมูลใหม่ทั้งหมด
- หลายเครื่องแกะ DEK ใบเดียวกัน จึงอ่านข้อมูลของกันได้

### 9.3 เส้นแบ่ง

`envelope.ts` ตัดสินว่าอะไรอ่านได้:

```
ธรรมดา (server อ่านได้):   id, ledger_id, updated_at, deleted_at
                            + presets.sort_order
เข้ารหัส (ใน payload):      จำนวนเงิน, โน้ต, ชื่อหมวด, วันที่, kind,
                            category_id, wallet_id, ...
```

```
seal()  local row ──► { คอลัมน์เนื้อหา = NULL, routing, payload: ciphertext }
open()  server row ──► { routing, ...ถอดรหัสแล้ว, dirty }
```

คอลัมน์เนื้อหาต้องส่ง `NULL` **อย่างชัดแจ้ง** เพราะ upsert แตะเฉพาะคอลัมน์ที่ระบุ
ถ้าไม่ส่ง plaintext เก่าจะยังนอนอยู่ข้างๆ ciphertext

### 9.4 สองโหมด

`ledgers.encryption_mode` = `'e2ee'` หรือ `'plaintext'`
ถามครั้งแรกที่เปิด ดีฟอลต์คือเข้ารหัส เปลี่ยนได้ในหน้าตั้งค่า

การเลือกคือ **ความเป็นส่วนตัว แลกกับ การกู้คืนได้** ไม่ใช่ "ส่วนตัว แลกกับ สะดวก"

| | e2ee | plaintext |
|---|---|---|
| เจ้าของโปรเจกต์เห็น | metadata เท่านั้น | ทั้งหมด |
| ลืมรหัส | หายถาวร | ไม่มีรหัสให้ลืม |
| เครื่องใหม่ | ต้องพิมพ์รหัส | เข้าได้เลย |

`Cipher` เป็น discriminated union → **"เข้ารหัสแต่ไม่มีกุญแจ" สร้างไม่ได้ในระดับ type**

> **กับดักที่เคยเจอ:** `open()` เคย mark `dirty=1` ให้ทุกแถวที่ไม่มี `payload`
> เพื่อสั่งเข้ารหัสใหม่ ถูกสำหรับ e2ee แต่ในโหมด plaintext กลายเป็นลูป
> pull→flag→push→pull ตอนนี้ dirty ผูกกับ**โหมด** ไม่ใช่ผูกกับการมี payload

### 9.5 metadata ที่ยังรั่ว

เจ้าของโปรเจกต์ยังเห็น: จำนวนแถว, เวลาที่แก้ไข, ใครอยู่ ledger ไหน,
อีเมลใน `auth.users`, และว่าใครเลือกโหมดอะไร

เดาได้ว่าใครใช้แอพบ่อยแค่ไหน แต่ไม่รู้ว่าจดอะไรเท่าไหร่

---

## 10. Offline

```
public/sw.js  (VERSION = v3)
  ├─ precache: /  /transactions  /transactions/edit  /dashboard  /settings
  ├─ navigation → network-first, cache เป็น fallback
  └─ /_next/static, /icons → cache-first (ชื่อไฟล์มี hash จึงไม่ต้อง revalidate)
```

ที่ precache ได้เพราะทุกหน้าเป็น **static** (ข้อ 2.3)
route แบบ `[id]` แคชไม่ได้ — นี่คือเหตุผลที่หน้าแก้ไขใช้ `/transactions/edit?id=`
ไม่ใช่ `/transactions/[id]`

**สิ่งที่ทำได้ตอนไม่มีเน็ต:** เปิดแอพ, จด, แก้, ลบ, ดู dashboard ย้อนหลัง
**สิ่งที่ทำไม่ได้:** เปิดครั้งแรกสุดบนเครื่องใหม่ (ต้องดึง `ledger_id` + กุญแจก่อน)

---

## 11. ขั้นตอน deploy

**ลำดับสำคัญ** — migration ก่อน push เสมอ

```
1. Supabase → SQL Editor → รัน migration ใหม่ทีละไฟล์ตามเลข
2. git push origin main
3. GitHub webhook → Vercel เริ่ม build เอง (~1-2 นาที)
4. ตรวจว่า commit hash ในหน้า Deployments ตรงกับที่ push
```

**ทำไมต้อง migration ก่อน:** ถ้าโค้ดใหม่ขึ้นก่อนคอลัมน์มี query จะพัง
ถ้าพังใน middleware = ทั้งเว็บ 500 / ถ้าพังใน VaultGate = แอพค้างที่หน้าโหลด

ตรวจว่า build ใหม่ขึ้นจริงยังไง — **อย่าเชื่อ buildId เพียวๆ และระวัง CDN cache**
(`age:` header บอกอายุของสำเนาที่ได้มา) วิธีที่ชัวร์คือ grep หาสตริงที่มีแค่ในโค้ดใหม่:

```bash
curl -s "https://<โดเมน>/sw.js?cb=$(date +%s)" | grep VERSION
```

---

## 12. ข้อจำกัดที่รู้อยู่

| เรื่อง | สถานะ |
|---|---|
| Timezone | `analytics.ts` ใช้เวลาเครื่องผู้ใช้ ถ้าเดินทางข้ามโซนวันจะเลื่อน — ควรเก็บใน `ledgers.timezone` |
| กระเป๋าเงิน | ซิงก์และเข้ารหัสแล้ว แต่ยังไม่มี UI จัดการ |
| แชร์ ledger | schema พร้อม (`ledger_members` + role) แต่ยังไม่มี UI เชิญคน |
| Export / ลบบัญชี | ยังไม่มี — จำเป็นถ้าจะปล่อยจริงตาม PDPA |
| Node | supabase-js เตือนว่า Node 20 ตกรุ่น ควรขยับเป็น 22 (Vercel ใช้ 22 อยู่แล้ว) |
| Vercel Hobby | ToS ห้ามใช้เชิงพาณิชย์ ถ้าจะเก็บเงินต้องย้ายหรืออัปเกรด |
| สลับโหมดเข้ารหัส | ยังไม่ได้ทดสอบกับข้อมูลจริง — มันเขียนทับทุกแถว ควรลองกับข้อมูลทดสอบก่อน |
| Metadata | ดูข้อ 9.5 — ยังรั่ว และปิดไม่ได้โดยไม่ใช้เทคนิคที่หนักกว่านี้มาก |
