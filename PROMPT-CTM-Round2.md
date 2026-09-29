# Prompt รอบ 2 — เชื่อม Report Guild System เข้า CTM 🐶

> วิธีใช้: เปิด Claude Code ที่โฟลเดอร์ `Community Team Management 🐶` แล้ว Copy ทุกอย่างใต้เส้นนี้ไปวาง

---

## งาน: เพิ่มเมนู "Guild Report System" ใน CTM เพื่อจัดการระบบ Report Guild (เว็บกิลด์แยกที่ทำเสร็จแล้ว)

### บริบท
- มีระบบแยกชื่อ **Report Guild System** ทำเสร็จและใช้งานได้แล้ว:
  - เว็บกิลด์: https://communityteamexe-cloud.github.io/Report-Guild-System/ (กิลด์ Login → ส่ง Report → ดูคะแนนของตัวเอง)
  - หลังบ้าน: Apps Script Web App แยกโปรเจกต์ (URL `/exec` อยู่ด้านล่าง) · ข้อมูลอยู่ในชีต `Report Guild System — Database` ใต้ Drive `06 - 🛡️ Report Guild System`
  - โค้ดต้นฉบับอ่านได้ที่ `C:\Users\TipsukanPhichemetaku\Desktop\Report Guild System\apps-script\Code.gs` (**อ่านอย่างเดียว ห้ามแก้ไฟล์ในโฟลเดอร์นั้น**)
- CTM ต้องเป็น **ฝั่งทีมงาน**: ตรวจอนุมัติ Report · ดูอันดับทุกกิลด์ · ตั้งค่า Mission/เกณฑ์ Rank · สร้าง/รีเซ็ตบัญชีกิลด์
- **ห้ามอ่าน/เขียนชีตของ Report Guild System ตรง ๆ** — เรียกผ่าน API เท่านั้น (API ล้าง Cache และกันข้อมูลชนให้เอง)

### การเชื่อมต่อ (สำคัญ)
- URL: `https://script.google.com/macros/s/AKfycbxf6LV-VCfdW_Lxc_37x_A442yk-kTwUWvpB6gSvwg-_EU-gegbM4Li9GrmaOJP864kYw/exec`
- เก็บ URL ผ่านระบบลิงก์กลาง (`systemItems_` + `applySystemOverrides_`) ให้แก้ได้ที่ Dev Tools → ตั้งค่าระบบ · key แนะนำ `RGS_API_URL`
- **ADMIN_KEY เป็นความลับ** → เก็บใน Script Properties ของ CTM ชื่อ `RGS_ADMIN_KEY` · ทำช่องบันทึกใน Dev Tools แบบเดียวกับ `saveGeminiKey` (ต้องใส่ PIN) · **ห้าม hardcode · ห้ามส่งค่าไปหน้าบ้าน**
- เรียกจาก backend (Code.gs) เท่านั้นด้วย `UrlFetchApp.fetch(url, { method: 'post', contentType: 'text/plain', payload: JSON.stringify(body), muteHttpExceptions: true, followRedirects: true })`
- ทุกคำขอส่ง `{ action, adminKey, ...params }` · ตอบกลับ `{ ok: true, data }` หรือ `{ ok: false, error }` (error เป็นภาษาไทยพร้อมโชว์ Toast ได้เลย)
- ทำ helper เดียว เช่น `rgsCall_(action, params)` → throw เมื่อ `ok:false` · มี wrapper ให้หน้าบ้านเรียกผ่าน `google.script.run`

### API ที่ใช้ได้ (ทุกตัวต้องมี adminKey)
| action | params | ได้อะไรกลับมา |
|---|---|---|
| `adminListGuilds` | `game?` | `[{email, game, gameName, nameTH, nameEN, guildId, mustChange, active}]` |
| `adminCreateGuild` | `game` (z4/tosm/9yin), `nameTH`, `nameEN` (a-z0-9), `guildId` | `{email, password, game, nameTH}` — **รหัสโชว์ครั้งเดียว** |
| `adminResetPassword` | `email` | `{email, password}` — รหัสใหม่ + บังคับเปลี่ยน |
| `adminSetGuildActive` | `email`, `active` (bool) | `true` |
| `adminListReports` | `year` (ค.ศ.), `month?`, `game?`, `status?` (pending/approved/rejected) | `[{id, createdAt, ym, email, game, guild, missionId, mission, points, poster, link, note, status, approvedPoints, reason, batchId}]` เรียงใหม่→เก่า |
| `adminReview` | `reportId`, `status` (approved/rejected/pending), `points?` (ไม่ใส่ = คะแนน Mission), `reason` (**บังคับเมื่อ rejected**), `by` | `true` |
| `adminReviewMany` | `reportIds[]` **หรือ** `batchId` (ทั้งชุด), `status`, `points?`, `reason` (บังคับเมื่อ rejected), `by` | `{updated, notFound[]}` — **ใช้ตัวนี้กับปุ่มอนุมัติทีเดียวหลายรายการ** |
| `adminListMissions` | `game?` | แถว Mission ทั้งหมด (MissionID, Game, Group, Name, Detail, Points, MaxPerMonth, MaxScope, StartYM, EndYM, Active, CuteGuild) |
| `adminUpsertMission` | `mission` (object ตามคอลัมน์ด้านบน · ไม่มี MissionID = เพิ่มใหม่) | `MissionID` |
| `adminListRankRules` | — | `[{Game, FromYear, SS, S}]` |
| `adminSetRankRule` | `game`, `fromYear`, `ss`, `s` | `true` |
| `adminLeaderboard` | `game`, `year`, `month?` (ไม่ใส่ = ทั้งปี) | `[{email, nameTH, guildId, score, rank}]` เรียงมาก→น้อย |

กติกาข้อมูล:
- ปีในข้อมูลเป็น **ค.ศ.** · แสดงผลเป็น **พ.ศ.** (+543)
- `StartYM`/`EndYM` รูปแบบ `YYYY-MM` (ค.ศ.) · Group: `basic` / `feedback` / `extra`
- **Mission เพิ่มเติมรายเดือน** = `Group:'extra'`, `StartYM` = `EndYM` = เดือนนั้น
- **เปลี่ยนคะแนนปีใหม่** = ใส่ `EndYM` ให้ตัวเก่า แล้วเพิ่มตัวใหม่ (**ห้ามแก้คะแนนตัวเดิม** — Report เก่าเก็บคะแนน snapshot ไว้แล้ว แต่ต้องคงประวัติ Mission)
- ห้ามลบ Mission → ใช้ `Active:false`
- เกม: `z4` = Zone4 Extreme · `tosm` = Tree of Savior M Extreme · `9yin` = 9Yin Classic (ชื่อเต็มเสมอในหน้าจอ)
- Zone4 **ไม่มี** Mission Feedback · TOSM/9Yin มี Feedback + Cute Guild (Feedback อนุมัติ ≥ 3 ครั้ง / 30 วัน)
- เกณฑ์ Rank ตอนนี้: Z4 SS≥200 S≥100 · TOSM/9Yin SS≥200 S≥51 · มีแค่ S และ SS

### หน้าจอที่ต้องมี (เมนูใหม่ 1 เมนู แบ่งแท็บ)
1. **📥 รอตรวจ** (แท็บแรก)
   - กรองเกม/เดือน/สถานะ · การ์ดหรือตารางแสดง กิลด์ · Mission · ผู้โพสต์ · ลิงก์หลักฐาน · หมายเหตุ · วันที่
   - **ทุกลิงก์เป็นไฮเปอร์ลิงก์กดได้ทันที** (`<a target="_blank" rel="noopener">`) โชว์ URL ย่อให้อ่านรู้เรื่อง (เช่น `facebook.com/groups/…/posts/123`) + ปุ่มคัดลอก · รับเฉพาะ `http(s)://` (กัน `javascript:`) · escape ทุกค่า
   - **กดเปิดแล้วขึ้นเครื่องหมาย ✓ "เปิดดูแล้ว"** ที่ลิงก์นั้น (จำใน localStorage ต่อ reportId) — รู้ว่าตรวจถึงไหนแล้ว
   - การ์ดชุด (batch) มีปุ่ม **"เปิดทุกลิงก์"** (เปิดทีละแท็บ · เตือนเรื่อง popup blocker ถ้าเบราว์เซอร์บล็อก)
   - ปุ่ม ✅ อนุมัติ / ❌ ปฏิเสธ (ต้องพิมพ์เหตุผล — มีตัวเลือกสำเร็จรูป เช่น "ไม่ได้ติด Hashtag", "ลิงก์ไม่เป็นสาธารณะ", "ส่งเกินช่วงเวลา" + พิมพ์เองได้)
   - Mission `extra` → มีช่องแก้คะแนนก่อนอนุมัติ (ค่าเริ่มต้น = คะแนน Mission)
   - เลือกหลายรายการแล้ว **อนุมัติทีเดียว** ได้ · ย้อนสถานะกลับเป็น pending ได้ (กดผิด)
   - **กิลด์ส่งหลายลิงก์ในครั้งเดียวได้** → Report ที่มี `batchId` เดียวกัน **รวมเป็นการ์ดเดียว** (หัวการ์ด: กิลด์ · Mission · จำนวนลิงก์ · คะแนนรวม) + ปุ่ม **"อนุมัติทั้งชุด"** (`adminReviewMany` + `batchId`) · กางดูลิงก์ทีละอันแล้วปฏิเสธเฉพาะอันที่มีปัญหาได้ · `batchId` ว่าง = ส่งลิงก์เดียว แสดงแบบปกติ
   - `by` = ชื่อผู้ทำตามระบบ Activity Log ของ CTM
   - Badge จำนวนรอตรวจที่เมนู Sidebar
2. **🏆 อันดับ**
   - เลือกเกม + เดือน/ทั้งปี + ปี · ตารางอันดับ + Rank S/SS
   - **TOP 3 Rising Star รายไตรมาส** = รวมคะแนน 3 เดือนของไตรมาสจาก `adminLeaderboard` รายเดือน
   - ปุ่ม Export CSV (ใช้ `csvTagline()` ตามแบบเดิม)
3. **🎯 Mission & Rank**
   - ตาราง Mission แยกเกม · เพิ่ม/แก้/ปิด · ปุ่มลัด **"+ Mission เพิ่มเติมเดือนนี้"**
   - ตารางเกณฑ์ Rank ต่อเกมต่อปี · เพิ่มแถวปีใหม่
4. **👥 บัญชีกิลด์**
   - รายชื่อกิลด์แยกเกม + สถานะ (ใช้งาน/ระงับ · ยังไม่เปลี่ยนรหัส)
   - ฟอร์มสร้าง: เกม · ชื่อไทย · ชื่ออังกฤษ (a-z0-9) · Guild ID ในเกม → พรีวิวอีเมล `ชื่ออังกฤษ.guildid.เกม@guild.exe` ก่อนกด
   - หลังสร้าง/รีเซ็ต → modal แสดงอีเมล+รหัส **ครั้งเดียว** + ปุ่มคัดลอก "ข้อความส่งกิลด์" (ลิงก์เว็บ + อีเมล + รหัส + "เปลี่ยนรหัสเมื่อเข้าครั้งแรก") · **ห้ามบันทึกรหัสลงชีต/Log ของ CTM**
   - ปุ่มรีเซ็ตรหัส · ระงับ/เปิดใช้งาน

### Overview / Guild Report เดิม
- เพิ่มการ์ด KPI "Report รอตรวจ" ใน Overview (ถ้าเหมาะกับ Bento เดิม) — เสนอในแผนก่อน
- ห้ามแตะ Guild Report (Mission report) เดิมที่อ่านจาก Google Forms จนกว่าจะสั่ง

### กฎของโปรเจกต์ที่ต้องทำตาม
- อ่าน `CLAUDE.md` ก่อนเริ่ม · ตอบภาษาไทย · **เสนอแผนเป็นข้อ ๆ สั้น ๆ แล้วรอคำว่า "อนุมัติ"**
- ธีม shadcn (§8) · ไอคอน Lucide · รองรับมือถือ · ไม่มีข้อมูล → ข้อความ + ปุ่มเพิ่ม
- **เมนูใหม่ต้องเปิด/ปิด + เปลี่ยนชื่อได้ใน Dev Tools** (กฎถาวร)
- ทุก action ที่มีผลจริง → `logActivity_()` (ห้าม log รหัสผ่าน/adminKey)
- ดักจับ error ทุกจุด · API ล่ม/ช้า → Toast ภาษาคน ไม่ค้างหน้าจอ
- ตรวจก่อน deploy: bracket/string checker + harness render ทุกหน้า
- เสร็จแล้วบอกไฟล์ที่ต้อง Copy · git commit · ถาม "เก็บเป็น Checkpoint ไหม?"

### ทดสอบ
- มีบัญชีทดสอบอยู่แล้ว: `test.00001.z4@guild.exe` (Zone4) + Report ทดสอบ 2 รายการ ก.ย. 2569
- ทดสอบครบวงจร: สร้างบัญชี → Login เว็บกิลด์ → ส่ง Report → อนุมัติ/ปฏิเสธใน CTM → คะแนนขึ้นที่เว็บกิลด์ (≤ 30 วิ)
