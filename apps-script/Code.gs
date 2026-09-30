/**
 * Report Guild System — Backend (Google Apps Script)
 * Exclusive Guild Extreme · Zone4 Extreme / Tree of Savior M Extreme / 9Yin Classic
 *
 * - เว็บกิลด์ (GitHub Pages) เรียกผ่าน doPost (JSON, Content-Type: text/plain เพื่อเลี่ยง CORS preflight)
 * - CTM 🐶 เรียก action ที่ขึ้นต้นด้วย admin* โดยส่ง adminKey (เก็บใน Script Properties: ADMIN_KEY)
 * - ข้อมูลเก็บใน Google Sheets ไฟล์เดียว (สร้างโดย setup()) · Report แยกแท็บรายปี Reports_YYYY
 * - ไม่มีปีตายตัวในโค้ด — รองรับทุกปี (อย่างน้อยถึง 2575)
 */

// ===== ค่าคงที่ =====
const PROJECT_PARENT_FOLDER = '1W-q4Cl43lAp4ixE8h9sUxhzTGeOBRkB2'; // Drive "01 - Community Team Management 🐶" (เดิมชื่อ 07)
const RGS_FOLDER_NAME = '06 - 🛡️ Report Guild System'; // โฟลเดอร์เก็บชีต + โปรเจกต์ API (ชื่อตามแบบโฟลเดอร์ 01-05)
const EMAIL_DOMAIN = 'guild.exe';
const SESSION_HOURS = 6;
const REMEMBER_DAYS = 30;
const DASH_CACHE_SEC = 30;
const GAMES = {
  z4:   'Zone4 Extreme',
  tosm: 'Tree of Savior M Extreme',
  '9yin': '9Yin Classic'
};

const HEAD = {
  Guilds:    ['Email', 'Game', 'NameTH', 'NameEN', 'GuildID', 'PassHash', 'Salt', 'MustChange', 'Active', 'CreatedAt'],
  Missions:  ['MissionID', 'Game', 'Group', 'Name', 'Detail', 'Points', 'MaxPerMonth', 'MaxScope', 'StartYM', 'EndYM', 'Active', 'CuteGuild'],
  RankRules: ['Game', 'FromYear', 'SS', 'S'],
  Reports:   ['ReportID', 'CreatedAt', 'YM', 'Email', 'Game', 'GuildNameTH', 'MissionID', 'MissionName', 'Points',
              'Poster', 'Link', 'Note', 'Status', 'ApprovedPoints', 'Reason', 'ReviewedAt', 'ReviewedBy', 'BatchID', 'Kind', 'Hash']
};
const STATUS = { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected' };

// ===================================================================
// ติดตั้งครั้งแรก — รันจาก editor 1 ครั้ง
// ===================================================================

/**
 * สร้างไฟล์ชีตใต้ Drive 07 + ใส่ Mission/เกณฑ์ Rank เริ่มต้น + สร้าง ADMIN_KEY
 * รันซ้ำได้ — ถ้ามีไฟล์แล้วจะไม่สร้างใหม่
 */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let ssId = props.getProperty('SHEET_ID');
  if (!ssId) {
    const parent = DriveApp.getFolderById(PROJECT_PARENT_FOLDER);
    const it = parent.getFoldersByName(RGS_FOLDER_NAME);
    const folder = it.hasNext() ? it.next() : parent.createFolder(RGS_FOLDER_NAME);
    const ss = SpreadsheetApp.create('Report Guild System — Database');
    DriveApp.getFileById(ss.getId()).moveTo(folder);
    ssId = ss.getId();
    props.setProperty('SHEET_ID', ssId);
  }
  const ss = SpreadsheetApp.openById(ssId);
  ['Guilds', 'Missions', 'RankRules'].forEach(function (n) { getSheet_(n); });
  getReportSheet_(new Date().getFullYear());
  const def = ss.getSheetByName('Sheet1') || ss.getSheetByName('ชีต1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);

  if (getSheet_('Missions').getLastRow() < 2) seedMissions_();
  if (getSheet_('RankRules').getLastRow() < 2) seedRankRules_();
  if (!props.getProperty('ADMIN_KEY')) props.setProperty('ADMIN_KEY', Utilities.getUuid().replace(/-/g, ''));

  clearAllCache();
  Logger.log('SHEET: https://docs.google.com/spreadsheets/d/' + ssId);
  Logger.log('ADMIN_KEY: ' + props.getProperty('ADMIN_KEY') + '  (ใช้ใน CTM 🐶 เท่านั้น ห้ามเผยแพร่)');
}

/** Mission เริ่มต้นจากไฟล์ "09 - Guild #New Policy and Diraction" (มีผลตั้งแต่ ม.ค. 2026)
 *  Zone4 ไม่มี Feedback — ตามกติกา Z4 "Feedback จะไม่ถูกนับรวมในคะแนน Mission" · มีเฉพาะ TOSM/9Yin (+ Cute Guild) */
function seedMissions_() {
  const s = '2026-01';
  const tosmLike = function (g) {
    return [
      [g + '-M1', g, 'basic', 'สร้าง Content ลงกลุ่ม Facebook Official', 'Content ที่เกี่ยวข้องกับเกม · ใส่ Hashtag #รีวิวแฟชั่น #รีวิวเกม · ทำได้ไม่จำกัด', 10, '', 'guild', s, '', true, false],
      [g + '-M2', g, 'basic', 'กิจกรรมพิเศษในกิลด์ แล้วโพสต์ลงกลุ่ม Official', 'กิจกรรม/ชาเลนจ์/แจกของภายในกิลด์ แล้วแชร์บรรยากาศลงกลุ่ม Official', 50, '', 'guild', s, '', true, false],
      [g + '-M3', g, 'basic', 'โพสต์รูปรวม Guild รับสมัคร / โปรโมตกิลด์', 'โพสต์ลงกลุ่ม Facebook Official แคปชั่นบ่งบอกความเป็นกิลด์', 20, '', 'guild', s, '', true, false],
      [g + '-FB', g, 'feedback', 'ส่ง Feedback เกม', 'อ้างอิงแพทช์ล่าสุด อธิบายชัดเจน · ส่งครบ 3 ครั้งใน 30 วัน = Cute Guild', 10, '', 'guild', s, '', true, true]
    ];
  };
  const rows = [
    ['z4-M1', 'z4', 'basic', 'สร้าง Content ลงกลุ่ม Facebook Official', 'Content ที่เกี่ยวข้องกับเกม · ใส่ Hashtag #รีวิวแฟชั่น #รีวิวเกม · จำกัด 1 Facebook = 10 Content / เดือน · Content Creator Extreme ไม่นับ', 20, 10, 'poster', s, '', true, false],
    ['z4-M2', 'z4', 'basic', 'แชร์โพสต์กิจกรรม / โปรโมชั่น จาก Fanpage Official', 'แชร์ภายใน 3 วันหลังโพสต์ · ตั้งเป็น Public · ใส่แคปชั่น + Hashtag', 10, 50, 'guild', s, '', true, false],
    ['z4-M3', 'z4', 'basic', 'รวมตี้ 8 คนขึ้นไป แช๊ะภาพประจำเดือน', 'โพสต์รูปรวมตี้ลงกลุ่ม Facebook Official แบบสาธารณะ', 50, 4, 'guild', s, '', true, false],
    ['z4-M4', 'z4', 'basic', 'กิลด์วอยกตี้ เล่นด้วยกันรับด้วยกัน (Gang War)', 'แคปรายละเอียดในแชทกิลด์ ภาพต้องมี Timestamp', 10, 2, 'guild', s, '', true, false]
  ].concat(tosmLike('tosm')).concat(tosmLike('9yin'));
  const sh = getSheet_('Missions');
  sh.getRange(2, 1, rows.length, HEAD.Missions.length).setValues(rows);
}

/** เกณฑ์ Rank เริ่มต้น (ใช้ตั้งแต่ปี 2026 ไปจนกว่าจะเพิ่มแถวปีใหม่) */
function seedRankRules_() {
  getSheet_('RankRules').getRange(2, 1, 3, 4).setValues([
    ['z4', 2026, 200, 100],
    ['tosm', 2026, 200, 51],
    ['9yin', 2026, 200, 51]
  ]);
}

// ===================================================================
// ดูแลระบบ — รันเองจาก editor (ชื่อไม่มี _ ท้าย จะได้เห็นใน Dropdown)
// ===================================================================

/** ติดตั้ง Trigger: สำรองข้อมูลทุกวันจันทร์ 02:00 + ปลุกระบบทุก 10 นาที (รันซ้ำได้ ไม่สร้างซ้ำ) */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const h = t.getHandlerFunction();
    if (h === 'backupDatabase' || h === 'keepWarm') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('backupDatabase').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(2).create();
  ScriptApp.newTrigger('keepWarm').timeBased().everyMinutes(10).create();
  Logger.log('✅ ติดตั้ง Trigger แล้ว: สำรองข้อมูลทุกวันจันทร์ 02:00 · ปลุกระบบทุก 10 นาที (07:00–23:59)');
}

/**
 * ปลุกระบบ — กันอาการ "ตื่นช้า" ตอนกิลด์กดส่ง/เปิดหน้าคะแนนครั้งแรกหลังเงียบไปนาน
 * ทำงานเฉพาะ 07:00–23:59 (เวลาไทย) · เปิดไฟล์ชีต + เติม Cache ของ Mission/กิลด์ ให้พร้อม
 */
function keepWarm() {
  const hour = Number(Utilities.formatDate(new Date(), 'Asia/Bangkok', 'H'));
  if (hour < 7) return;
  ss_();
  readRows_('Missions');
  readRows_('Guilds');
}

/** สำรองชีตฐานข้อมูล → โฟลเดอร์ Backup (เก็บทุกไฟล์ ไม่ลบของเก่า) */
function backupDatabase() {
  const src = DriveApp.getFileById(ss_().getId());
  const parent = src.getParents().hasNext() ? src.getParents().next() : DriveApp.getFolderById(PROJECT_PARENT_FOLDER);
  const it = parent.getFoldersByName('Backup');
  const folder = it.hasNext() ? it.next() : parent.createFolder('Backup');
  const name = 'Backup — Report Guild System — ' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HHmm');
  const copy = src.makeCopy(name, folder);
  Logger.log('✅ สำรองแล้ว: ' + copy.getUrl());
  return copy.getUrl();
}

/** เปลี่ยน ADMIN_KEY ใหม่ → คีย์เก่าใช้ไม่ได้ทันที · เอาคีย์ใหม่ไปวางใน Dev Tools ของ CTM 🐶 */
function rotateAdminKey() {
  const key = Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('ADMIN_KEY', key);
  Logger.log('🔑 ADMIN_KEY ใหม่: ' + key + '  (คีย์เก่าใช้ไม่ได้แล้ว · อัปเดตใน CTM 🐶 ด้วย · ห้ามเผยแพร่)');
}

/**
 * ลบข้อมูลทดสอบก่อนเปิดใช้จริง: บัญชีที่อีเมลขึ้นต้น "test." + Report ของบัญชีนั้นทุกปี
 * สำรองชีตก่อนลบทุกครั้ง
 */
function clearTestData() {
  const backup = backupDatabase();
  const isTest = function (email) { return String(email).toLowerCase().indexOf('test.') === 0; };
  let removed = { guilds: 0, reports: 0 };
  withLock_(function () {
    ss_().getSheets().forEach(function (sh) {
      const name = sh.getName();
      if (name !== 'Guilds' && name.indexOf('Reports_') !== 0) return;
      const data = sh.getDataRange().getValues();
      const col = indexMap_(data[0]).Email;
      for (let i = data.length - 1; i >= 1; i--) {            // ลบจากล่างขึ้นบน แถวจะไม่เลื่อน
        if (isTest(data[i][col])) {
          sh.deleteRow(i + 1);
          name === 'Guilds' ? removed.guilds++ : removed.reports++;
        }
      }
    });
  });
  clearAllCache();
  Logger.log('🧹 ลบบัญชีทดสอบ ' + removed.guilds + ' · Report ทดสอบ ' + removed.reports + ' แถว · สำรองก่อนลบ: ' + backup);
}

// ===================================================================
// Web entry
// ===================================================================

/** หน้า GET ไว้เช็คว่า API ยังทำงาน */
function doGet() {
  return json_({ ok: true, service: 'Report Guild System', time: new Date().toISOString() });
}

/** ทุก request จากเว็บกิลด์ / CTM เข้าที่นี่ */
function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const a = String(req.action || '');
    if (a.indexOf('admin') === 0) {
      checkAdmin_(req.adminKey);
      if (!ADMIN_ACTIONS[a]) throw new Error('ไม่รู้จักคำสั่ง ' + a);
      return json_({ ok: true, data: ADMIN_ACTIONS[a](req) });
    }
    if (a === 'login') return json_({ ok: true, data: login_(req.email, req.password, !!req.remember) });
    if (!GUILD_ACTIONS[a]) throw new Error('ไม่รู้จักคำสั่ง ' + a);
    const guild = requireSession_(req.token);
    if (truthy_(guild.MustChange) && ['me', 'changePassword', 'logout'].indexOf(a) < 0) throw new Error('MUST_CHANGE_PASSWORD');
    return json_({ ok: true, data: GUILD_ACTIONS[a](guild, req) });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

const GUILD_ACTIONS = {
  me: function (g) { return publicGuild_(g); },
  // เปิดเว็บครั้งเดียวได้ครบ: กิลด์ + Mission เดือนนี้ + คะแนน (ลดจาก 3 คำขอเหลือ 1)
  bootstrap: function (g, r) {
    return { guild: publicGuild_(g), missions: missionsFor_(g.Game, ymOf_(r.year, r.month)),
      dashboard: dashboard_(g, Number(r.year), Number(r.month)),
      reviewed: reviewedSince_(g, Number(r.since) || 0) };
  },
  changePassword: function (g, r) { return changePassword_(g, r.oldPassword, r.newPassword, r.token); },
  logout: function (g, r) { return logout_(r.token); },
  missions: function (g, r) { return missionsFor_(g.Game, ymOf_(r.year, r.month)); },
  submit: function (g, r) { return submitReport_(g, r); },
  dashboard: function (g, r) { return dashboard_(g, Number(r.year), Number(r.month)); },
  history: function (g, r) { return history_(g, Number(r.year), Number(r.month)); }
};

const ADMIN_ACTIONS = {
  adminListGuilds: function (r) { return listGuilds_(r.game); },
  adminCreateGuild: function (r) { return createGuild_(r); },
  adminResetPassword: function (r) { return resetPassword_(r.email); },
  adminSetGuildActive: function (r) { return setGuildField_(r.email, 'Active', !!r.active); },
  adminListReports: function (r) { return listReports_(Number(r.year), r.month ? Number(r.month) : null, r.game, r.status); },
  adminReview: function (r) { return reviewReport_(r); },
  adminReviewMany: function (r) { return reviewMany_(r); },
  adminListMissions: function (r) { return listMissions_(r.game); },
  adminUpsertMission: function (r) { return upsertMission_(r.mission); },
  adminListRankRules: function () { return readRows_('RankRules'); },
  adminSetRankRule: function (r) { return setRankRule_(r.game, Number(r.fromYear), Number(r.ss), Number(r.s)); },
  adminLeaderboard: function (r) { return leaderboard_(r.game, Number(r.year), r.month ? Number(r.month) : null); }
};

// ===================================================================
// Auth
// ===================================================================

/**
 * "จดจำฉัน" — เก็บ session ยาว 30 วันใน Script Properties (key = hash ของ token ไม่เก็บ token จริง)
 * ผูกกับ Salt ของรหัสผ่าน → เปลี่ยน/รีเซ็ตรหัส = session ที่จำไว้ทุกเครื่องใช้ไม่ได้ทันที
 */
function rememberKey_(token) { return 'rs_' + sha_(token).slice(0, 40); }

function saveRemember_(token, g) {
  PropertiesService.getScriptProperties().setProperty(rememberKey_(token),
    JSON.stringify({ e: String(g.Email).toLowerCase(), x: Date.now() + REMEMBER_DAYS * 86400000, s: sha_(g.Salt).slice(0, 12) }));
}

/** ลบ session ที่หมดอายุ/รหัสเปลี่ยนแล้ว (เรียกตอน login) */
function pruneRemember_() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  const now = Date.now();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('rs_') !== 0) return;
    try { if (JSON.parse(all[k]).x < now) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
  });
}

function sha_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

/** ออกจากระบบ — ลบทั้ง session สั้นและที่จำไว้ */
function logout_(token) {
  CacheService.getScriptCache().remove('sess_' + token);
  PropertiesService.getScriptProperties().deleteProperty(rememberKey_(token));
  return true;
}

/** ล็อกอินด้วยอีเมล+รหัส · ผิดเกิน 10 ครั้ง/15 นาที = ล็อกชั่วคราว · remember=true = จำไว้ 30 วัน */
function login_(email, password, remember) {
  email = String(email || '').trim().toLowerCase();
  const cache = CacheService.getScriptCache();
  const failKey = 'fail_' + email;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= 10) throw new Error('ใส่รหัสผิดหลายครั้ง กรุณารอ 15 นาทีแล้วลองใหม่');

  const g = findGuild_(email);
  if (!g || hash_(password, g.Salt) !== g.PassHash) {
    cache.put(failKey, String(fails + 1), 900);
    throw new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  }
  if (!truthy_(g.Active)) throw new Error('บัญชีนี้ถูกระงับ กรุณาติดต่อทีมงาน');
  cache.remove(failKey);
  const token = Utilities.getUuid() + Utilities.getUuid().slice(0, 8);
  cache.put('sess_' + token, email, SESSION_HOURS * 3600);
  if (remember) {
    try { pruneRemember_(); } catch (e) { /* ไม่ให้การล้างของเก่าทำ login พัง */ }
    saveRemember_(token, g);
  }
  return { token: token, guild: publicGuild_(g), remember: !!remember };
}

/** ตรวจ token → คืนข้อมูลกิลด์ (หา cache ก่อน ไม่เจอค่อยดู session ที่จำไว้) */
function requireSession_(token) {
  if (!token) throw new Error('SESSION_EXPIRED');
  const cache = CacheService.getScriptCache();
  let email = cache.get('sess_' + token);
  let g = null;
  if (!email) {
    const raw = PropertiesService.getScriptProperties().getProperty(rememberKey_(token));
    let rs = null;
    try { rs = raw && JSON.parse(raw); } catch (e) { rs = null; }
    if (!rs || rs.x < Date.now()) throw new Error('SESSION_EXPIRED');
    g = findGuild_(rs.e);
    if (!g || sha_(g.Salt).slice(0, 12) !== rs.s) {       // รหัสถูกเปลี่ยน/รีเซ็ตแล้ว
      PropertiesService.getScriptProperties().deleteProperty(rememberKey_(token));
      throw new Error('SESSION_EXPIRED');
    }
    email = rs.e;
    cache.put('sess_' + token, email, SESSION_HOURS * 3600);
  }
  g = g || findGuild_(email);
  if (!g || !truthy_(g.Active)) throw new Error('SESSION_EXPIRED');
  return g;
}

/** เปลี่ยนรหัสผ่าน (บังคับครั้งแรก) · เครื่องนี้ยังจำต่อได้ เครื่องอื่นหลุด */
function changePassword_(g, oldPw, newPw, token) {
  if (hash_(oldPw, g.Salt) !== g.PassHash) throw new Error('รหัสผ่านเดิมไม่ถูกต้อง');
  newPw = String(newPw || '');
  if (newPw.length < 8) throw new Error('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัว');
  if (newPw === oldPw) throw new Error('รหัสผ่านใหม่ต้องไม่ซ้ำรหัสเดิม');
  const salt = Utilities.getUuid();
  setGuildFields_(g.Email, { PassHash: hash_(newPw, salt), Salt: salt, MustChange: false });
  const props = PropertiesService.getScriptProperties();
  if (token && props.getProperty(rememberKey_(token))) { g.Salt = salt; saveRemember_(token, g); }
  return true;
}

function checkAdmin_(key) {
  const real = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!real || key !== real) throw new Error('ไม่มีสิทธิ์ (adminKey ไม่ถูกต้อง)');
}

/** SHA-256 + salt วน 200 รอบ */
function hash_(pw, salt) {
  let h = String(salt) + '|' + String(pw || '');
  for (let i = 0; i < 200; i++) {
    h = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h, Utilities.Charset.UTF_8)
      .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  }
  return h;
}

/** รหัสสุ่ม 8 ตัว ตัดตัวที่ดูคล้ายกัน (0/O/1/l/I) */
function randomPassword_() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

// ===================================================================
// Guild accounts (admin)
// ===================================================================

/** สร้างบัญชี: ชื่ออังกฤษ.GuildID.เกม@guild.exe · คืนรหัสเริ่มต้นครั้งเดียว */
function createGuild_(r) {
  const game = String(r.game || '').toLowerCase();
  if (!GAMES[game]) throw new Error('เกมไม่ถูกต้อง (z4 / tosm / 9yin)');
  const nameEN = String(r.nameEN || '').trim().toLowerCase();
  if (!/^[a-z0-9]+$/.test(nameEN)) throw new Error('ชื่ออังกฤษใช้ได้เฉพาะ a-z และ 0-9 (ไม่มีช่องว่าง)');
  const guildId = String(r.guildId || '').trim();
  if (!/^[A-Za-z0-9]+$/.test(guildId)) throw new Error('Guild ID ใช้ได้เฉพาะตัวอักษรอังกฤษและตัวเลข');
  const nameTH = String(r.nameTH || '').trim() || nameEN;

  return withLock_(function () {
    const all = readRows_('Guilds');
    const sameId = function (v) {
      // ชีตเก่าอาจแปลง '00001' เป็นเลข 1 → เทียบแบบตัวเลขด้วย
      return String(v).toLowerCase() === guildId.toLowerCase() || (/^\d+$/.test(guildId) && v !== '' && Number(v) === Number(guildId));
    };
    if (all.some(function (x) { return x.Game === game && sameId(x.GuildID); }))
      throw new Error('Guild ID ' + guildId + ' มีบัญชีในเกมนี้แล้ว');
    const email = nameEN + '.' + guildId.toLowerCase() + '.' + game + '@' + EMAIL_DOMAIN;
    if (all.some(function (x) { return String(x.Email).toLowerCase() === email; }))
      throw new Error('อีเมล ' + email + ' มีอยู่แล้ว');
    const pw = randomPassword_();
    const salt = Utilities.getUuid();
    appendRow_('Guilds', { Email: email, Game: game, NameTH: nameTH, NameEN: nameEN, GuildID: "'" + guildId,
      PassHash: hash_(pw, salt), Salt: salt, MustChange: true, Active: true, CreatedAt: new Date() });
    return { email: email, password: pw, game: game, nameTH: nameTH };
  });
}

/** รีเซ็ตรหัส → รหัสสุ่มใหม่ + บังคับเปลี่ยน */
function resetPassword_(email) {
  const g = findGuild_(email);
  if (!g) throw new Error('ไม่พบบัญชี ' + email);
  const pw = randomPassword_();
  const salt = Utilities.getUuid();
  setGuildFields_(g.Email, { PassHash: hash_(pw, salt), Salt: salt, MustChange: true });
  return { email: g.Email, password: pw };
}

function listGuilds_(game) {
  return readRows_('Guilds')
    .filter(function (g) { return !game || g.Game === game; })
    .map(publicGuild_);
}

function publicGuild_(g) {
  return { email: g.Email, game: g.Game, gameName: GAMES[g.Game] || g.Game, nameTH: g.NameTH, nameEN: g.NameEN,
    guildId: String(g.GuildID), mustChange: truthy_(g.MustChange), active: truthy_(g.Active) };
}

function findGuild_(email) {
  email = String(email || '').trim().toLowerCase();
  return readRows_('Guilds').filter(function (g) { return String(g.Email).toLowerCase() === email; })[0] || null;
}

function setGuildField_(email, field, value) {
  const o = {}; o[field] = value;
  return setGuildFields_(email, o);
}

function setGuildFields_(email, fields) {
  return withLock_(function () {
    const sh = getSheet_('Guilds');
    const data = sh.getDataRange().getValues();
    const col = indexMap_(data[0]);
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][col.Email]).toLowerCase() === String(email).toLowerCase()) {
        Object.keys(fields).forEach(function (k) { sh.getRange(i + 1, col[k] + 1).setValue(fields[k]); });
        clearRows_('Guilds');
        return true;
      }
    }
    throw new Error('ไม่พบบัญชี ' + email);
  });
}

// ===================================================================
// Missions & Rank rules
// ===================================================================

/** Mission ที่ใช้ได้ในเดือนนั้น (StartYM ≤ ym ≤ EndYM) */
function missionsFor_(game, ym) {
  return readRows_('Missions').filter(function (m) {
    return m.Game === game && truthy_(m.Active) && ymStr_(m.StartYM) <= ym && (!m.EndYM || ym <= ymStr_(m.EndYM));
  }).map(function (m) {
    return { id: m.MissionID, group: m.Group, name: m.Name, detail: m.Detail, points: Number(m.Points) || 0,
      maxPerMonth: m.MaxPerMonth === '' ? null : Number(m.MaxPerMonth), maxScope: m.MaxScope || 'guild',
      cuteGuild: truthy_(m.CuteGuild), startYM: ymStr_(m.StartYM), endYM: m.EndYM ? ymStr_(m.EndYM) : '' };
  });
}

function listMissions_(game) {
  return readRows_('Missions').filter(function (m) { return !game || m.Game === game; })
    .map(function (m) { m.StartYM = ymStr_(m.StartYM); m.EndYM = m.EndYM ? ymStr_(m.EndYM) : ''; return m; });
}

/**
 * เพิ่ม/แก้ Mission
 * - Mission เพิ่มเติมรายเดือน: group='extra', StartYM=EndYM='2026-10'
 * - เปลี่ยนคะแนนปีใหม่: ปิดตัวเก่า (EndYM) แล้วเพิ่มตัวใหม่ — คะแนน Report เก่าไม่เปลี่ยน (เก็บ snapshot ไว้แล้ว)
 */
function upsertMission_(m) {
  if (!m || !GAMES[m.Game]) throw new Error('ข้อมูล Mission ไม่ครบ (Game)');
  if (!m.Name) throw new Error('ต้องมีชื่อ Mission');
  if (!/^\d{4}-\d{2}$/.test(String(m.StartYM || ''))) throw new Error('StartYM ต้องเป็นรูปแบบ YYYY-MM (ค.ศ.)');
  return withLock_(function () {
    const sh = getSheet_('Missions');
    const data = sh.getDataRange().getValues();
    const col = indexMap_(data[0]);
    if (!m.MissionID) m.MissionID = m.Game + '-' + Utilities.getUuid().slice(0, 6);
    const row = HEAD.Missions.map(function (h) {
      if (h === 'Active') return m.Active === undefined ? true : !!m.Active;
      if (h === 'CuteGuild') return !!m.CuteGuild;
      if (h === 'StartYM' || h === 'EndYM') return m[h] ? "'" + m[h] : '';
      return m[h] === undefined || m[h] === null ? '' : m[h];
    });
    for (let i = 1; i < data.length; i++) {
      if (data[i][col.MissionID] === m.MissionID) {
        sh.getRange(i + 1, 1, 1, row.length).setValues([row]);
        clearRows_('Missions');
        return m.MissionID;
      }
    }
    sh.appendRow(row);
    clearRows_('Missions');
    return m.MissionID;
  });
}

/** เกณฑ์ Rank ของปีนั้น = แถวที่ FromYear มากที่สุดแต่ไม่เกินปีนั้น */
function rankRule_(game, year) {
  const rules = readRows_('RankRules')
    .filter(function (r) { return r.Game === game && Number(r.FromYear) <= year; })
    .sort(function (a, b) { return Number(b.FromYear) - Number(a.FromYear); });
  const r = rules[0];
  return r ? { ss: Number(r.SS), s: Number(r.S) } : { ss: 200, s: 100 };
}

function setRankRule_(game, fromYear, ss, s) {
  if (!GAMES[game] || !fromYear || !ss || !s) throw new Error('ข้อมูลเกณฑ์ Rank ไม่ครบ');
  return withLock_(function () {
    const sh = getSheet_('RankRules');
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === game && Number(data[i][1]) === fromYear) {
        sh.getRange(i + 1, 3, 1, 2).setValues([[ss, s]]);
        clearRows_('RankRules');
        return true;
      }
    }
    sh.appendRow([game, fromYear, ss, s]);
    clearRows_('RankRules');
    return true;
  });
}

function rankOf_(score, rule) {
  if (score >= rule.ss) return 'SS';
  if (score >= rule.s) return 'S';
  return '';
}

// ===================================================================
// Reports
// ===================================================================

/**
 * กิลด์ส่ง Report → สถานะ pending
 * รับ links[] (ลิงก์) และ images[] ({name,type,data(base64),hash}) รวมกันไม่เกิน MAX_LINKS_PER_BATCH
 * ทุกลิงก์/ทุกรูป = 1 แถว ผูกด้วย BatchID เดียวกัน · รูปเก็บใน Drive (ส่วนตัว) → Link = ลิงก์ไฟล์ · Kind = image
 * รายการที่ไม่ผ่าน (ไม่ใช่ลิงก์ / ซ้ำ / เกินเพดาน / รูปเสีย) ถูกข้าม ไม่ทำให้ทั้งชุดล้ม
 */
const MAX_LINKS_PER_BATCH = 50;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;   // ต่อรูป (หน้าเว็บย่อให้ก่อนส่งอยู่แล้ว)

function submitReport_(g, r) {
  const now = new Date();
  const ym = Utilities.formatDate(now, 'Asia/Bangkok', 'yyyy-MM');
  const m = missionsFor_(g.Game, ym).filter(function (x) { return x.id === r.missionId; })[0];
  if (!m) throw new Error('กรุณาเลือก Mission (หรือ Mission นี้ไม่เปิดให้ส่งในเดือนนี้)');
  const poster = String(r.poster || '').trim();
  if (m.maxScope === 'poster' && !poster) throw new Error('Mission นี้ต้องระบุชื่อ Facebook ผู้โพสต์');

  const raw = Array.isArray(r.links) ? r.links : String(r.links || r.link || '').split(/\s+/);
  const items = raw.map(function (s) { return String(s || '').trim(); }).filter(String)
    .map(function (l) { return { kind: 'link', key: l, link: l }; })
    .concat((Array.isArray(r.images) ? r.images : []).map(function (im) {
      const h = String(im && im.hash || '').slice(0, 64);
      return { kind: 'image', key: 'img:' + h, hash: h, name: String(im && im.name || 'image').slice(0, 80),
        type: String(im && im.type || ''), data: String(im && im.data || '') };
    }));
  if (!items.length) throw new Error('กรุณาใส่ลิงก์หรือรูปหลักฐานอย่างน้อย 1 รายการ');
  if (items.length > MAX_LINKS_PER_BATCH) throw new Error('ส่งได้ครั้งละไม่เกิน ' + MAX_LINKS_PER_BATCH + ' รายการ (ลิงก์ + รูป)');

  const year = now.getFullYear();
  const usedKeys_ = function () {
    const mine = readReports_(year).filter(function (x) {
      return x.Email === g.Email && x.YM === ym && x.MissionID === m.id && x.Status !== STATUS.REJECTED;
    });
    const used = {};
    mine.forEach(function (x) { used[String(x.Link).trim()] = true; if (x.Hash) used['img:' + x.Hash] = true; });
    const count = mine.filter(function (x) {
      return m.maxScope !== 'poster' || String(x.Poster).trim().toLowerCase() === poster.toLowerCase();
    }).length;
    return { used: used, count: count };
  };
  const label = function (it) { return it.kind === 'image' ? '🖼️ ' + it.name : it.link; };
  const precheck = function (it, st) {
    if (it.kind === 'link' && !/^https?:\/\/\S+$/i.test(it.link)) return 'ไม่ใช่ลิงก์ (ต้องขึ้นต้น http:// หรือ https://)';
    if (it.kind === 'image') {
      if (!/^[0-9a-f]{16,64}$/i.test(it.hash)) return 'รูปเสีย ลองเลือกใหม่';
      if (!/^image\/(jpeg|png|webp|gif)$/i.test(it.type)) return 'รองรับเฉพาะรูป JPG / PNG / WEBP / GIF';
      if (it.data.length * 0.75 > MAX_IMAGE_BYTES) return 'รูปใหญ่เกิน 5MB';
    }
    if (st.used[it.key]) return it.kind === 'image' ? 'รูปนี้ส่งไปแล้วในเดือนนี้' : 'ลิงก์นี้ส่งไปแล้วในเดือนนี้';
    if (m.maxPerMonth && st.count >= m.maxPerMonth) return 'เกินเพดาน ' + m.maxPerMonth + ' ครั้ง/เดือน' + (m.maxScope === 'poster' ? ' ของ Facebook นี้' : '');
    return '';
  };

  // 1) ตรวจรอบแรก (ไม่ล็อก) แล้วอัปโหลดรูปที่ผ่าน — อัปโหลดนอกล็อก กิลด์อื่นไม่ต้องรอ
  const pre = usedKeys_(), skipped = [];
  pre.used = Object.assign({}, pre.used);
  items.forEach(function (it) {
    const why = precheck(it, pre);
    if (why) { it.skip = why; return; }
    pre.used[it.key] = true; pre.count++;
    if (it.kind === 'image') {
      try {
        const blob = Utilities.newBlob(Utilities.base64Decode(it.data), it.type, it.name);
        const f = evidenceFolder_(ym, g).createFile(blob);
        f.setName(Utilities.formatDate(now, 'Asia/Bangkok', 'yyyyMMdd-HHmmss') + '_' + it.hash.slice(0, 8) + '_' + it.name);
        it.link = 'https://drive.google.com/file/d/' + f.getId() + '/view';
      } catch (e) { it.skip = 'อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง'; }
      it.data = '';
    }
  });

  // 2) ล็อก → ตรวจซ้ำกับข้อมูลล่าสุด (กันส่งชนกัน) → บันทึก
  return withLock_(function () {
    const st = usedKeys_();
    // ส่งต่อชุดเดิมได้ (หน้าเว็บแบ่งอัปโหลดรูปเป็นรอบ ๆ เพื่อโชว์ความคืบหน้า) — ต้องเป็นชุดของกิลด์นี้ ปีนี้ Mission เดียวกัน
    let batchId = '';
    const want = String(r.batchId || '');
    if (/^B\d{4}-[0-9a-f]{8}$/.test(want) && want.slice(1, 5) === String(year)) {
      const owners = readReports_(year).filter(function (x) { return x.BatchID === want; });
      if (owners.every(function (x) { return x.Email === g.Email && x.MissionID === m.id; })) batchId = want;
    }
    if (!batchId && (items.length > 1 || r.more)) batchId = 'B' + year + '-' + Utilities.getUuid().slice(0, 8);
    const accepted = [], rows = [];
    items.forEach(function (it) {
      const why = it.skip || precheck(it, st);
      if (why) return skipped.push({ link: label(it), key: it.key, kind: it.kind, reason: why });
      st.used[it.key] = true; st.count++;
      const id = 'R' + year + '-' + Utilities.getUuid().slice(0, 8);
      accepted.push({ link: label(it), key: it.key, kind: it.kind, reportId: id });
      rows.push({ ReportID: id, CreatedAt: now, YM: "'" + ym, Email: g.Email, Game: g.Game, GuildNameTH: g.NameTH,
        MissionID: m.id, MissionName: m.name, Points: m.points, Poster: poster, Link: it.link,
        Note: String(r.note || '').slice(0, 500), Status: STATUS.PENDING, ApprovedPoints: '', Reason: '',
        ReviewedAt: '', ReviewedBy: '', BatchID: batchId, Kind: it.kind, Hash: it.hash || '' });
    });
    if (rows.length) {
      appendRows_(reportSheetName_(year), rows);
      bumpVersion_(g.Email);
    }
    return { batchId: batchId, accepted: accepted, skipped: skipped,
      reportId: accepted.length === 1 ? accepted[0].reportId : undefined,
      remaining: m.maxPerMonth ? Math.max(0, m.maxPerMonth - st.count) : null };
  });
}

/** โฟลเดอร์เก็บรูปหลักฐาน: (โฟลเดอร์ของชีต)/หลักฐาน/ปี-เดือน/ชื่อกิลด์.GuildID — ไฟล์เป็นส่วนตัว ไม่แชร์ */
function evidenceFolder_(ym, g) {
  const props = PropertiesService.getScriptProperties();
  const key = 'EVF_' + ym + '_' + String(g.Email).toLowerCase();
  const cached = props.getProperty(key);
  if (cached) { try { return DriveApp.getFolderById(cached); } catch (e) { /* ถูกย้าย/ลบ → สร้างใหม่ */ } }
  const sub = function (parent, name) { const it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); };
  const dbFile = DriveApp.getFileById(ss_().getId());
  const root = dbFile.getParents().hasNext() ? dbFile.getParents().next() : DriveApp.getFolderById(PROJECT_PARENT_FOLDER);
  const folder = sub(sub(sub(root, 'หลักฐาน'), ym), (GAMES[g.Game] ? g.Game + '_' : '') + g.NameEN + '.' + g.GuildID);
  props.setProperty(key, folder.getId());
  return folder;
}

/** ทีมอนุมัติ/ปฏิเสธ 1 รายการ (คงไว้ให้ CTM ที่เรียกแบบเดิม) */
function reviewReport_(r) {
  const res = reviewMany_({ reportIds: [r.reportId], status: r.status, points: r.points, reason: r.reason, by: r.by });
  if (res.notFound.length) throw new Error('ไม่พบ Report ' + r.reportId);
  return true;
}

/**
 * อนุมัติ/ปฏิเสธหลายรายการในครั้งเดียว — reportIds[] หรือ batchId (ทั้งชุด)
 * points: ไม่ใส่ = คะแนน Mission ของแต่ละแถว · reason บังคับเมื่อ rejected
 */
function reviewMany_(r) {
  if ([STATUS.APPROVED, STATUS.REJECTED, STATUS.PENDING].indexOf(r.status) < 0) throw new Error('status ไม่ถูกต้อง');
  if (r.status === STATUS.REJECTED && !String(r.reason || '').trim()) throw new Error('กรุณาใส่เหตุผลที่ปฏิเสธ');
  let ids = (r.reportIds || []).map(String);
  const batch = String(r.batchId || '');
  const years = {};
  ids.forEach(function (id) { const y = id.match(/^R(\d{4})-/); if (!y) throw new Error('ReportID ไม่ถูกต้อง: ' + id); years[y[1]] = true; });
  if (batch) { const y = batch.match(/^B(\d{4})-/); if (!y) throw new Error('BatchID ไม่ถูกต้อง'); years[y[1]] = true; }
  if (!ids.length && !batch) throw new Error('ต้องระบุ reportIds หรือ batchId');

  return withLock_(function () {
    const want = {}; ids.forEach(function (id) { want[id] = true; });
    const done = {}, emails = {};
    const now = new Date();
    Object.keys(years).forEach(function (y) {
      const sh = getReportSheet_(Number(y));
      const data = sh.getDataRange().getValues();
      const col = indexMap_(data[0]);
      let touched = false;
      for (let i = 1; i < data.length; i++) {
        const id = data[i][col.ReportID];
        const inBatch = batch && col.BatchID !== undefined && data[i][col.BatchID] === batch;
        if (!want[id] && !inBatch) continue;
        data[i][col.Status] = r.status;
        data[i][col.ApprovedPoints] = r.status === STATUS.APPROVED
          ? (r.points === undefined || r.points === null || r.points === '' ? Number(data[i][col.Points]) : Number(r.points)) : '';
        data[i][col.Reason] = r.reason || '';
        data[i][col.ReviewedAt] = r.status === STATUS.PENDING ? '' : now;
        data[i][col.ReviewedBy] = r.by || '';
        done[id] = true; emails[data[i][col.Email]] = true; touched = true;
      }
      // เขียนเฉพาะคอลัมน์ผลตรวจ (Status..ReviewedBy ติดกัน) ทีเดียวทั้งแท็บ
      if (touched && data.length > 1) {
        const c0 = col.Status, c1 = col.ReviewedBy;
        sh.getRange(2, c0 + 1, data.length - 1, c1 - c0 + 1)
          .setValues(data.slice(1).map(function (row) { return row.slice(c0, c1 + 1); }));
        delete MEMO_.reports[reportSheetName_(Number(y))];
      }
    });
    Object.keys(emails).forEach(bumpVersion_);
    return { updated: Object.keys(done).length, notFound: ids.filter(function (id) { return !done[id]; }) };
  });
}

/** รายการ Report สำหรับ CTM (กรองปี/เดือน/เกม/สถานะ) */
function listReports_(year, month, game, status) {
  if (!year) throw new Error('ต้องระบุปี');
  const ym = month ? ymOf_(year, month) : null;
  return readReports_(year).filter(function (x) {
    return (!ym || x.YM === ym) && (!game || x.Game === game) && (!status || x.Status === status);
  }).map(reportOut_).sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
}

function history_(g, year, month) {
  return listReports_(year, month, g.Game, null).filter(function (x) { return x.email === g.Email; });
}

function reportOut_(x) {
  return { id: x.ReportID, createdAt: x.CreatedAt instanceof Date ? x.CreatedAt.toISOString() : String(x.CreatedAt),
    ym: x.YM, email: x.Email, game: x.Game, guild: x.GuildNameTH, missionId: x.MissionID, mission: x.MissionName,
    points: Number(x.Points) || 0, poster: x.Poster, link: x.Link, note: x.Note, status: x.Status,
    approvedPoints: x.ApprovedPoints === '' ? null : Number(x.ApprovedPoints), reason: x.Reason, batchId: x.BatchID || '', kind: x.Kind || 'link', hash: x.Hash || '' };
}

// ===================================================================
// Dashboard & Leaderboard
// ===================================================================

/** หน้า "คะแนนของฉัน" — cache 30 วิ ต่อกิลด์ (ล้างเมื่อส่ง/ตรวจ) */
function dashboard_(g, year, month) {
  const cache = CacheService.getScriptCache();
  const key = 'dash_' + g.Email + '_' + year + '_' + month + '_' + (cache.get('ver_' + g.Email) || '0');
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  const ym = ymOf_(year, month);
  const mine = readReports_(year).filter(function (x) { return x.Email === g.Email; });
  const approved = mine.filter(function (x) { return x.Status === STATUS.APPROVED; });
  const monthly = [];
  for (let i = 1; i <= 12; i++) {
    const k = ymOf_(year, i);
    monthly.push(approved.filter(function (x) { return x.YM === k; })
      .reduce(function (s, x) { return s + (Number(x.ApprovedPoints) || 0); }, 0));
  }
  const thisMonth = mine.filter(function (x) { return x.YM === ym; });
  const perMission = missionsFor_(g.Game, ym).map(function (m) {
    const rows = thisMonth.filter(function (x) { return x.MissionID === m.id && x.Status !== STATUS.REJECTED; });
    return { id: m.id, name: m.name, group: m.group, points: m.points, maxPerMonth: m.maxPerMonth, maxScope: m.maxScope,
      used: rows.length,
      score: rows.filter(function (x) { return x.Status === STATUS.APPROVED; })
        .reduce(function (s, x) { return s + (Number(x.ApprovedPoints) || 0); }, 0) };
  });
  const rule = rankRule_(g.Game, year);
  const monthScore = monthly[month - 1];
  const out = {
    guild: publicGuild_(g), year: year, month: month,
    monthScore: monthScore, yearScore: monthly.reduce(function (a, b) { return a + b; }, 0),
    monthly: monthly, rank: rankOf_(monthScore, rule), rule: rule,
    pending: thisMonth.filter(function (x) { return x.Status === STATUS.PENDING; }).length,
    rejected: thisMonth.filter(function (x) { return x.Status === STATUS.REJECTED; }).length,
    perMission: perMission, cuteGuild: cuteGuild_(g),
    totalThisYear: mine.length,
    updatedAt: new Date().toISOString()
  };
  cache.put(key, JSON.stringify(out), DASH_CACHE_SEC);
  return out;
}

/**
 * ผลตรวจที่เกิดขึ้นหลังเวลา since (ms) — แจ้งกิลด์ตอนเปิดเว็บ "อนุมัติ N · ปฏิเสธ N ตั้งแต่ครั้งก่อน"
 * since = 0 (เปิดครั้งแรกในเครื่องนี้) → ไม่แจ้ง
 */
function reviewedSince_(g, since) {
  if (!since) return { approved: 0, rejected: 0, points: 0, rejectedList: [] };
  const y = new Date().getFullYear();
  const rows = readReports_(y).concat(new Date(since).getFullYear() < y ? readReports_(y - 1) : []).filter(function (x) {
    return x.Email === g.Email && x.ReviewedAt && new Date(x.ReviewedAt).getTime() > since &&
      (x.Status === STATUS.APPROVED || x.Status === STATUS.REJECTED);
  });
  const ok = rows.filter(function (x) { return x.Status === STATUS.APPROVED; });
  const no = rows.filter(function (x) { return x.Status === STATUS.REJECTED; });
  return { approved: ok.length, rejected: no.length,
    points: ok.reduce(function (s, x) { return s + (Number(x.ApprovedPoints) || 0); }, 0),
    rejectedList: no.slice(0, 5).map(function (x) { return { mission: x.MissionName, reason: x.Reason }; }) };
}

/** Cute Guild (TOSM/9Yin): Feedback ที่อนุมัติแล้ว ≥ 3 ครั้งใน 30 วันล่าสุด */
function cuteGuild_(g) {
  const cuteIds = readRows_('Missions').filter(function (m) { return m.Game === g.Game && truthy_(m.CuteGuild); })
    .map(function (m) { return m.MissionID; });
  if (!cuteIds.length) return null;
  const since = Date.now() - 30 * 86400000;
  const y = new Date().getFullYear();
  const rows = readReports_(y).concat(new Date(since).getFullYear() < y ? readReports_(y - 1) : []);
  const count = rows.filter(function (x) {
    return x.Email === g.Email && x.Status === STATUS.APPROVED && cuteIds.indexOf(x.MissionID) >= 0 &&
      new Date(x.CreatedAt).getTime() >= since;
  }).length;
  return { count: count, need: 3, achieved: count >= 3 };
}

/** อันดับทุกกิลด์ของเกม (รายเดือน หรือทั้งปีถ้าไม่ระบุเดือน) — สำหรับ CTM เท่านั้น */
function leaderboard_(game, year, month) {
  const ym = month ? ymOf_(year, month) : null;
  const rule = rankRule_(game, year);
  const score = {};
  readReports_(year).forEach(function (x) {
    if (x.Game !== game || x.Status !== STATUS.APPROVED || (ym && x.YM !== ym)) return;
    score[x.Email] = (score[x.Email] || 0) + (Number(x.ApprovedPoints) || 0);
  });
  return listGuilds_(game).map(function (g) {
    const s = score[g.email] || 0;
    return { email: g.email, nameTH: g.nameTH, guildId: g.guildId, score: s, rank: month ? rankOf_(s, rule) : '' };
  }).sort(function (a, b) { return b.score - a.score; });
}

// ===================================================================
// Sheet helpers
// ===================================================================

// ── ความจำภายใน 1 คำขอ (29 ก.ย. 69) ──
// Apps Script เริ่มตัวแปร global ใหม่ทุกคำขอ → จำไว้ได้แค่ในคำขอนั้น ไม่มีข้อมูลเก่าค้างข้ามคำขอ
// เดิม 1 คำขอเปิดไฟล์ชีตซ้ำ 2–3 ครั้ง และ bootstrap อ่านแท็บ Report ทั้งปี 2 รอบ (dashboard_ + cuteGuild_)
const MEMO_ = { ss: null, sheets: {}, heads: {}, reports: {} };

function ss_() {
  if (MEMO_.ss) return MEMO_.ss;
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('ยังไม่ได้รัน setup()');
  MEMO_.ss = SpreadsheetApp.openById(id);
  return MEMO_.ss;
}

/** เปิดแท็บ ถ้าไม่มีสร้างพร้อมหัวตาราง */
function getSheet_(name) {
  if (MEMO_.sheets[name]) return MEMO_.sheets[name];
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    const head = HEAD[name.indexOf('Reports_') === 0 ? 'Reports' : name];
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
    MEMO_.heads[name] = head.slice();
  }
  else if (name.indexOf('Reports_') === 0) ensureHead_(sh, HEAD.Reports, name);
  MEMO_.sheets[name] = sh;
  return sh;
}

/** เพิ่มคอลัมน์ที่ขาดต่อท้าย (แท็บเก่าก่อนมีคอลัมน์ใหม่ เช่น BatchID) · จำหัวตารางไว้ให้ appendRows_ ใช้ต่อ */
function ensureHead_(sh, head, name) {
  const cur = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
  const miss = head.filter(function (h) { return cur.indexOf(h) < 0; });
  if (miss.length) sh.getRange(1, cur.length + 1, 1, miss.length).setValues([miss]).setFontWeight('bold');
  if (name) MEMO_.heads[name] = cur.concat(miss);
}

/** หัวตารางของแท็บ (จำไว้ในคำขอ) */
function headOf_(name, sh) {
  if (!MEMO_.heads[name]) MEMO_.heads[name] = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  return MEMO_.heads[name];
}

function reportSheetName_(year) { return 'Reports_' + year; }
function getReportSheet_(year) { return getSheet_(reportSheetName_(year)); }

/** อ่าน Report ของปีนั้น (ไม่มีแท็บ = ว่าง) · จำไว้ในคำขอ — เขียนแท็บนั้นเมื่อไหร่ล้างทันที */
function readReports_(year) {
  const name = reportSheetName_(year);
  if (MEMO_.reports[name]) return MEMO_.reports[name];
  const sh = MEMO_.sheets[name] || ss_().getSheetByName(name);
  const rows = sh ? rowsToObjects_(sh.getDataRange().getValues()).map(function (x) { x.YM = ymStr_(x.YM); return x; }) : [];
  MEMO_.reports[name] = rows;
  return rows;
}

/**
 * อ่านแท็บเป็น object · แท็บที่ไม่ค่อยเปลี่ยน (Guilds/Missions/RankRules) เก็บ Cache 5 นาที
 * เขียนผ่านโค้ด = ล้าง Cache ทันที · แก้ในชีตด้วยมือ = มีผลภายใน 5 นาที (หรือรัน clearAllCache)
 */
const CACHED_TABS = { Guilds: true, Missions: true, RankRules: true };
const ROWS_CACHE_SEC = 300;

function readRows_(name) {
  if (!CACHED_TABS[name]) return rowsToObjects_(getSheet_(name).getDataRange().getValues());
  const cache = CacheService.getScriptCache();
  const hit = cache.get('rows_' + name);
  if (hit) return JSON.parse(hit);
  const rows = rowsToObjects_(getSheet_(name).getDataRange().getValues()).map(function (o) {
    Object.keys(o).forEach(function (k) {
      if (o[k] instanceof Date) o[k] = (k === 'StartYM' || k === 'EndYM') ? ymStr_(o[k]) : o[k].toISOString();
    });
    return o;
  });
  try { cache.put('rows_' + name, JSON.stringify(rows), ROWS_CACHE_SEC); } catch (e) { /* ใหญ่เกิน 100KB = ไม่ cache */ }
  return rows;
}

function clearRows_(name) { CacheService.getScriptCache().remove('rows_' + name); }

/** รันเองจาก editor หลังแก้ชีตด้วยมือ ถ้าอยากให้มีผลทันที */
function clearAllCache() { Object.keys(CACHED_TABS).forEach(clearRows_); }

function rowsToObjects_(data) {
  if (data.length < 2) return [];
  const head = data[0];
  return data.slice(1).filter(function (r) { return r.join('') !== ''; }).map(function (r) {
    const o = {};
    head.forEach(function (h, i) { o[h] = r[i]; });
    return o;
  });
}

function appendRow_(name, obj) {
  const sh = getSheet_(name);
  const head = headOf_(name, sh);
  sh.appendRow(head.map(function (h) { return obj[h] === undefined ? '' : obj[h]; }));
  if (CACHED_TABS[name]) clearRows_(name);
  delete MEMO_.reports[name];
}

/** เพิ่มหลายแถวทีเดียว (เร็วกว่า appendRow ทีละแถว) */
function appendRows_(name, objs) {
  const sh = getSheet_(name);
  const head = headOf_(name, sh);
  const rows = objs.map(function (o) { return head.map(function (h) { return o[h] === undefined ? '' : o[h]; }); });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, head.length).setValues(rows);
  if (CACHED_TABS[name]) clearRows_(name);
  delete MEMO_.reports[name];
}

function indexMap_(head) {
  const m = {};
  head.forEach(function (h, i) { m[h] = i; });
  return m;
}

// ===================================================================
// Utils
// ===================================================================

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('ระบบกำลังยุ่ง กรุณาลองใหม่อีกครั้ง');
  try { return fn(); } finally { lock.releaseLock(); }
}

function bumpVersion_(email) {
  const c = CacheService.getScriptCache();
  c.put('ver_' + email, String(Date.now()), 21600);
}

/** year = ค.ศ. · month 1–12 → 'YYYY-MM' */
function ymOf_(year, month) {
  year = Number(year); month = Number(month);
  if (!year || !month || month < 1 || month > 12) throw new Error('ปี/เดือนไม่ถูกต้อง');
  return year + '-' + ('0' + month).slice(-2);
}

/** ชีตอาจแปลง '2026-09' เป็น Date → แปลงกลับเป็น 'YYYY-MM' */
function ymStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Bangkok', 'yyyy-MM');
  return String(v || '').replace(/^'/, '').slice(0, 7);
}

function truthy_(v) { return v === true || String(v).toLowerCase() === 'true'; }

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
