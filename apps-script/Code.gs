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
              'Poster', 'Link', 'Note', 'Status', 'ApprovedPoints', 'Reason', 'ReviewedAt', 'ReviewedBy']
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
    const it = parent.getFoldersByName('Report Guild System');
    const folder = it.hasNext() ? it.next() : parent.createFolder('Report Guild System');
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

  Logger.log('SHEET: https://docs.google.com/spreadsheets/d/' + ssId);
  Logger.log('ADMIN_KEY: ' + props.getProperty('ADMIN_KEY') + '  (ใช้ใน CTM 🐶 เท่านั้น ห้ามเผยแพร่)');
}

/** Mission เริ่มต้นจากไฟล์ "09 - Guild #New Policy and Diraction" (มีผลตั้งแต่ ม.ค. 2026) */
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
    ['z4-M4', 'z4', 'basic', 'กิลด์วอยกตี้ เล่นด้วยกันรับด้วยกัน (Gang War)', 'แคปรายละเอียดในแชทกิลด์ ภาพต้องมี Timestamp', 10, 2, 'guild', s, '', true, false],
    ['z4-FB', 'z4', 'feedback', 'ส่ง Feedback เกม', 'อ้างอิงแพทช์ล่าสุด อธิบายชัดเจน', 10, '', 'guild', s, '', true, false]
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
        return m.MissionID;
      }
    }
    sh.appendRow(row);
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
        return true;
      }
    }
    sh.appendRow([game, fromYear, ss, s]);
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

/** กิลด์ส่ง Report → สถานะ pending · ตรวจเพดานต่อเดือน (นับ pending+approved) */
function submitReport_(g, r) {
  const now = new Date();
  const ym = Utilities.formatDate(now, 'Asia/Bangkok', 'yyyy-MM');
  const link = String(r.link || '').trim();
  if (!/^https?:\/\/\S+$/i.test(link)) throw new Error('กรุณาใส่ลิงก์หลักฐานที่ขึ้นต้นด้วย http:// หรือ https://');
  const m = missionsFor_(g.Game, ym).filter(function (x) { return x.id === r.missionId; })[0];
  if (!m) throw new Error('Mission นี้ไม่เปิดให้ส่งในเดือนนี้');
  const poster = String(r.poster || '').trim();
  if (m.maxScope === 'poster' && !poster) throw new Error('Mission นี้ต้องระบุชื่อ Facebook ผู้โพสต์');

  return withLock_(function () {
    const year = now.getFullYear();
    const rows = readReports_(year).filter(function (x) {
      return x.Email === g.Email && x.YM === ym && x.MissionID === m.id;
    });
    if (rows.some(function (x) { return String(x.Link).trim() === link && x.Status !== STATUS.REJECTED; }))
      throw new Error('ลิงก์นี้ส่งไปแล้วในเดือนนี้');
    if (m.maxPerMonth) {
      const used = rows.filter(function (x) {
        return x.Status !== STATUS.REJECTED && (m.maxScope !== 'poster' || String(x.Poster).trim().toLowerCase() === poster.toLowerCase());
      }).length;
      if (used >= m.maxPerMonth) throw new Error('ส่ง Mission นี้ครบ ' + m.maxPerMonth + ' ครั้งของเดือนนี้แล้ว' + (m.maxScope === 'poster' ? ' (สำหรับ Facebook นี้)' : ''));
    }
    const id = 'R' + year + '-' + Utilities.getUuid().slice(0, 8);
    appendRow_(reportSheetName_(year), { ReportID: id, CreatedAt: now, YM: "'" + ym, Email: g.Email, Game: g.Game,
      GuildNameTH: g.NameTH, MissionID: m.id, MissionName: m.name, Points: m.points, Poster: poster,
      Link: link, Note: String(r.note || '').slice(0, 500), Status: STATUS.PENDING, ApprovedPoints: '', Reason: '',
      ReviewedAt: '', ReviewedBy: '' });
    bumpVersion_(g.Email);
    return { reportId: id };
  });
}

/** ทีมอนุมัติ/ปฏิเสธ · points ใส่ได้ (เช่น Mission เพิ่มเติม 10–20) ไม่ใส่ = ใช้คะแนน Mission */
function reviewReport_(r) {
  const id = String(r.reportId || '');
  const m = id.match(/^R(\d{4})-/);
  if (!m) throw new Error('ReportID ไม่ถูกต้อง');
  if ([STATUS.APPROVED, STATUS.REJECTED, STATUS.PENDING].indexOf(r.status) < 0) throw new Error('status ไม่ถูกต้อง');
  if (r.status === STATUS.REJECTED && !String(r.reason || '').trim()) throw new Error('กรุณาใส่เหตุผลที่ปฏิเสธ');
  return withLock_(function () {
    const sh = getReportSheet_(Number(m[1]));
    const data = sh.getDataRange().getValues();
    const col = indexMap_(data[0]);
    for (let i = 1; i < data.length; i++) {
      if (data[i][col.ReportID] !== id) continue;
      const pts = r.status === STATUS.APPROVED
        ? (r.points === undefined || r.points === null || r.points === '' ? Number(data[i][col.Points]) : Number(r.points))
        : '';
      const vals = {};
      vals.Status = r.status; vals.ApprovedPoints = pts; vals.Reason = r.reason || '';
      vals.ReviewedAt = r.status === STATUS.PENDING ? '' : new Date(); vals.ReviewedBy = r.by || '';
      Object.keys(vals).forEach(function (k) { sh.getRange(i + 1, col[k] + 1).setValue(vals[k]); });
      bumpVersion_(data[i][col.Email]);
      return true;
    }
    throw new Error('ไม่พบ Report ' + id);
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
    approvedPoints: x.ApprovedPoints === '' ? null : Number(x.ApprovedPoints), reason: x.Reason };
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
    updatedAt: new Date().toISOString()
  };
  cache.put(key, JSON.stringify(out), DASH_CACHE_SEC);
  return out;
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

function ss_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('ยังไม่ได้รัน setup()');
  return SpreadsheetApp.openById(id);
}

/** เปิดแท็บ ถ้าไม่มีสร้างพร้อมหัวตาราง */
function getSheet_(name) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    const head = HEAD[name.indexOf('Reports_') === 0 ? 'Reports' : name];
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function reportSheetName_(year) { return 'Reports_' + year; }
function getReportSheet_(year) { return getSheet_(reportSheetName_(year)); }

/** อ่าน Report ของปีนั้น (ไม่มีแท็บ = ว่าง) */
function readReports_(year) {
  const sh = ss_().getSheetByName(reportSheetName_(year));
  return sh ? rowsToObjects_(sh.getDataRange().getValues()).map(function (x) { x.YM = ymStr_(x.YM); return x; }) : [];
}

function readRows_(name) { return rowsToObjects_(getSheet_(name).getDataRange().getValues()); }

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
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.appendRow(head.map(function (h) { return obj[h] === undefined ? '' : obj[h]; }));
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
