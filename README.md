# Report Guild System — คู่มือติดตั้ง (รอบ 1)

```
Report Guild System/
├── apps-script/   ← หลังบ้าน (Copy เข้า Apps Script)
│   ├── Code.gs
│   └── appsscript.json
├── docs/          ← หน้าเว็บกิลด์ (GitHub Pages: main + /docs)
│   ├── index.html · app.js · style.css
│   └── config.js  ← ใส่ URL /exec
├── PROJECT.md     ← Requirement
└── mockup.html
```

## ขั้นที่ 1 — Apps Script (หลังบ้าน)
1. เข้า Drive โฟลเดอร์ **01 - Community Team Management 🐶** (ใน 01 - 2569 Internal · เดิมชื่อ 07) → ใหม่ → เพิ่มเติม → **Google Apps Script** ตั้งชื่อ `Report Guild System — API`
2. วาง `Code.gs` ทับไฟล์ Code.gs
3. ⚙️ Project Settings → ติ๊ก **Show "appsscript.json"** → วาง `appsscript.json` ทับ
4. เลือกฟังก์ชัน `setup` → กด **Run** → Authorize
   - ระบบสร้างโฟลเดอร์ `06 - 🛡️ Report Guild System` + ชีต `Report Guild System — Database` ใต้ 07
   - ใส่ Mission 3 เกม + เกณฑ์ Rank ให้อัตโนมัติ
   - ดู **Execution log** → จด `ADMIN_KEY` ไว้ (ใช้กับ CTM 🐶 ในรอบ 2 · ห้ามเผยแพร่)
5. **Deploy → New deployment → Web app**
   - Execute as: **Me** · Who has access: **Anyone**
   - Copy URL ที่ลงท้าย `/exec`

## ขั้นที่ 2 — GitHub Pages (หน้าเว็บ)
1. เปิด `docs/config.js` → วาง URL `/exec` แทน `PASTE_APPS_SCRIPT_EXEC_URL_HERE`
2. GitHub → **New repository** ชื่อ `guild-report` (**Public** — GitHub Pages ฟรีต้อง Public · ในเว็บไม่มีความลับ)
3. Upload ไฟล์ทั้งหมดในโฟลเดอร์ `docs/`
4. Settings → Pages → Branch: `main` / `/docs` → Save
5. ได้ลิงก์ `https://<username>.github.io/guild-report/` → ส่งให้กิลด์

## ขั้นที่ 3 — สร้างบัญชีกิลด์ทดสอบ (ก่อนมีเมนู CTM)
ใน Apps Script editor เพิ่มฟังก์ชันชั่วคราวแล้วรัน:
```js
function testCreateGuild() {
  Logger.log(createGuild_({ game: 'z4', nameTH: 'กิลด์ทดสอบ', nameEN: 'test', guildId: '00001' }));
}
```
→ Log จะโชว์อีเมล + รหัสเริ่มต้น

## อัปเดตโค้ดครั้งต่อไป
- Apps Script: วางโค้ดใหม่ → Deploy → **Manage deployments → Edit → New version** (URL เดิม)
- เว็บ: Claude commit ให้ → แป้งพิมพ์ `git push` → เว็บอัปเดตเองใน 1–2 นาที

## โครงสร้างชีต
| แท็บ | ใช้ทำอะไร |
|---|---|
| Guilds | บัญชีกิลด์ (รหัสเก็บเป็น hash) |
| Missions | Mission ทุกเกม · `StartYM`/`EndYM` = ช่วงเดือนที่ใช้ (YYYY-MM ค.ศ.) · group: basic / feedback / extra |
| RankRules | เกณฑ์ S/SS ต่อเกม · `FromYear` = ใช้ตั้งแต่ปีนั้น (เพิ่มแถวปีใหม่ได้ ปีเก่าไม่เปลี่ยน) |
| Reports_YYYY | Report แยกรายปี (สร้างเองอัตโนมัติ) · คะแนนเก็บ snapshot ตอนส่ง |

## ฟังก์ชันดูแลระบบ (รันจาก Apps Script editor → Dropdown → ▷ เรียกใช้)
| ฟังก์ชัน | ใช้เมื่อ |
|---|---|
| `installTriggers` | ครั้งแรก 1 ครั้ง — สำรองชีตอัตโนมัติทุกวันจันทร์ 02:00 |
| `backupDatabase` | สำรองชีตเดี๋ยวนี้ → โฟลเดอร์ `Backup` ใต้ `06 - 🛡️ Report Guild System` (ไม่ลบของเก่า) |
| `clearTestData` | ก่อนเปิดใช้จริง — ลบบัญชี `test.*` + Report ของบัญชีนั้น (สำรองก่อนลบให้เอง) |
| `rotateAdminKey` | คีย์หลุด / คนในทีมย้ายออก — ได้คีย์ใหม่ใน Log → เอาไปวางใน Dev Tools ของ CTM 🐶 |
| `clearAllCache` | แก้ชีตด้วยมือแล้วอยากให้มีผลทันที (ปกติรอ ≤ 5 นาที) |
