/**
 * Report Guild System — Frontend (Vanilla JS)
 * เรียก Apps Script ผ่าน fetch POST (text/plain) · รีเฟรชคะแนนทุก REFRESH_MS
 * ถ้ายังไม่ได้ใส่ API_URL ใน config.js → ทำงานแบบ DEMO (ข้อมูลสมมติในเครื่อง)
 */
(function () {
  'use strict';

  const CFG = window.RGS_CONFIG || {};
  const DEMO = !/^https:\/\/script\.google\.com\//.test(CFG.API_URL || '');
  const FIRST_YEAR = 2026;             // ปีแรกของโครงการ (ค.ศ.)
  const MIN_LAST_YEAR = 2032;          // ให้เลือกได้อย่างน้อยถึง พ.ศ. 2575
  const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const STATUS_TH = { pending: 'รอตรวจ', approved: 'อนุมัติ', rejected: 'ปฏิเสธ' };

  const $ = (id) => document.getElementById(id);
  const state = { token: null, guild: null, missions: [], timer: null, busy: false };

  // ---------- storage (กันเบราว์เซอร์ที่ปิด storage) ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };
  // token: จดจำฉัน = localStorage (อยู่ข้ามการปิดเบราว์เซอร์) · ไม่จำ = sessionStorage (ปิดแท็บแล้วหาย)
  const tokenStore = {
    get() {
      const t = store.get('rgs_token');
      if (t) return t;
      try { return sessionStorage.getItem('rgs_token'); } catch (e) { return null; }
    },
    set(t, remember) {
      this.clear();
      if (remember) store.set('rgs_token', t);
      else { try { sessionStorage.setItem('rgs_token', t); } catch (e) { /* ignore */ } }
    },
    clear() {
      store.del('rgs_token');
      try { sessionStorage.removeItem('rgs_token'); } catch (e) { /* ignore */ }
    }
  };

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function toast(msg, isErr) {
    const d = document.createElement('div');
    d.textContent = msg;
    if (isErr) d.className = 'err';
    $('toast').appendChild(d);
    setTimeout(() => d.remove(), isErr ? 6000 : 3500);
  }
  function show(viewId) {
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('on', v.id === viewId));
  }
  function fmtNum(n) { return Number(n || 0).toLocaleString('th-TH'); }
  function fmtDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return esc(iso);
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + String(d.getFullYear() + 543).slice(-2) +
      ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function safeUrl(u) { return /^https?:\/\//i.test(u) ? u : '#'; }

  // ---------- API ----------
  async function api(action, payload) {
    const body = Object.assign({ action: action, token: state.token }, payload || {});
    let res;
    if (DEMO) {
      res = await Demo.call(body);
    } else {
      let lastErr;
      for (let i = 0; i < 3; i++) {           // ลองใหม่อัตโนมัติ (เน็ตสะดุด / Apps Script ยุ่ง)
        try {
          const r = await fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
          res = await r.json();
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          await new Promise((ok) => setTimeout(ok, 800 * (i + 1)));
        }
      }
      if (lastErr) throw new Error('เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่');
    }
    if (!res.ok) {
      if (res.error === 'SESSION_EXPIRED') { logout(true); throw new Error('หมดเวลาการใช้งาน กรุณาเข้าสู่ระบบใหม่'); }
      if (res.error === 'MUST_CHANGE_PASSWORD') { openPass(true); throw new Error('กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน'); }
      throw new Error(res.error || 'เกิดข้อผิดพลาด');
    }
    return res.data;
  }

  // ---------- auth ----------
  async function onLogin(e) {
    e.preventDefault();
    const btn = e.submitter || e.target.querySelector('button');
    btn.disabled = true;
    try {
      const remember = $('l-remember').checked;
      const email = $('l-email').value.trim();
      const d = await api('login', { email: email, password: $('l-pass').value, remember: remember });
      state.token = d.token;
      state.guild = d.guild;
      tokenStore.set(d.token, remember);
      if (remember) store.set('rgs_email', email); else store.del('rgs_email');
      $('l-pass').value = '';
      d.guild.mustChange ? openPass(true) : enterApp();
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; }
  }

  function openPass(forced) {
    $('pass-hint').textContent = forced ? 'เข้าครั้งแรก กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน' : 'เปลี่ยนรหัสผ่านของบัญชีกิลด์';
    $('p-cancel').hidden = !!forced;
    $('f-pass').reset();
    stopRefresh();
    show('v-pass');
  }

  async function onPass(e) {
    e.preventDefault();
    if ($('p-new').value !== $('p-new2').value) return toast('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน', true);
    const btn = e.submitter || e.target.querySelector('button');
    btn.disabled = true;
    try {
      await api('changePassword', { oldPassword: $('p-old').value, newPassword: $('p-new').value });
      state.guild.mustChange = false;
      toast('เปลี่ยนรหัสผ่านเรียบร้อย');
      enterApp();
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; }
  }

  function logout(silent) {
    if (!silent && state.token) api('logout').catch(() => {});
    state.token = null; state.guild = null;
    tokenStore.clear();
    stopRefresh();
    show('v-login');
  }

  // ---------- app ----------
  function fillPeriodSelects() {
    const now = new Date();
    const last = Math.max(now.getFullYear(), MIN_LAST_YEAR);
    ['d', 'h'].forEach((p) => {
      $(p + '-month').innerHTML = MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
      let yrs = '';
      for (let y = last; y >= FIRST_YEAR; y--) yrs += `<option value="${y}">${y + 543}</option>`;
      $(p + '-year').innerHTML = yrs;
      $(p + '-month').value = now.getMonth() + 1;
      $(p + '-year').value = now.getFullYear();
    });
  }

  function enterApp() {
    const g = state.guild;
    $('g-name').textContent = g.nameTH;
    $('g-game').textContent = g.gameName + ' · Guild ID ' + g.guildId + (DEMO ? ' · DEMO' : '');
    show('v-app');
    switchPage('dash');
    loadMissions();
    startRefresh();
  }

  function switchPage(p) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.p === p));
    document.querySelectorAll('.page').forEach((x) => x.classList.toggle('on', x.id === 'p-' + p));
    if (p === 'dash') loadDash();
    if (p === 'hist') loadHist();
    if (p === 'send') loadMissions();
  }

  function startRefresh() {
    stopRefresh();
    state.timer = setInterval(() => {
      if (document.hidden || state.busy) return;
      const on = document.querySelector('.page.on');
      if (on && on.id === 'p-dash') loadDash(true);
      if (on && on.id === 'p-hist') loadHist(true);
    }, CFG.REFRESH_MS || 30000);
  }
  function stopRefresh() { if (state.timer) clearInterval(state.timer); state.timer = null; }

  // ---------- dashboard ----------
  async function loadDash(silent) {
    const y = Number($('d-year').value), m = Number($('d-month').value);
    try {
      const d = await api('dashboard', { year: y, month: m });
      renderDash(d);
    } catch (err) { if (!silent) toast(err.message, true); }
  }

  function renderDash(d) {
    const rule = d.rule, sc = d.monthScore;
    $('d-rank').innerHTML = d.rank ? `<span class="pill ${d.rank}">Rank ${d.rank}</span>` : '';
    $('k-month').textContent = fmtNum(sc);
    $('k-year-l').textContent = 'คะแนนสะสมปี ' + (d.year + 543);
    $('k-year').textContent = fmtNum(d.yearScore);
    $('k-pend').textContent = fmtNum(d.pending);
    $('k-rej').textContent = fmtNum(d.rejected);

    const max = Math.max(rule.ss, sc) || 1;
    $('r-bar').style.width = Math.min(100, (sc / max) * 100) + '%';
    $('r-s').textContent = 'S · ' + rule.s;
    $('r-ss').textContent = 'SS · ' + rule.ss;
    $('r-title').textContent = sc >= rule.ss ? 'ได้ Rank SS แล้ว 🎉'
      : sc >= rule.s ? `อีก ${rule.ss - sc} คะแนน จะได้ Rank SS 🎯`
      : `อีก ${rule.s - sc} คะแนน จะได้ Rank S 🎯`;
    $('cute').innerHTML = d.cuteGuild
      ? `<div class="badge">${d.cuteGuild.achieved ? '💖' : '🤍'} <div>Cute Guild: ส่ง Feedback ที่อนุมัติแล้ว <b>${d.cuteGuild.count} / ${d.cuteGuild.need}</b> ครั้งใน 30 วันล่าสุด${d.cuteGuild.achieved ? ' — <b>ผ่านเงื่อนไขแล้ว</b>' : ''}</div></div>`
      : '';
    $('upd').textContent = 'อัปเดตล่าสุด ' + fmtDate(d.updatedAt) + ' น. · รีเฟรชอัตโนมัติทุก ' + Math.round((CFG.REFRESH_MS || 30000) / 1000) + ' วินาที';

    $('c-title').textContent = 'คะแนนรายเดือน ปี ' + (d.year + 543);
    const top = Math.max.apply(null, d.monthly.concat([1]));
    $('bars').innerHTML = d.monthly.map((v, i) =>
      `<div class="${i + 1 === d.month ? 'cur' : ''}" style="height:${(v / top) * 100}%" title="${MONTHS[i]}: ${v}">${v ? `<em>${v}</em>` : ''}<span>${MONTHS[i]}</span></div>`).join('');

    $('per').innerHTML = d.perMission.length ? d.perMission.map((m) =>
      `<div class="mission"><span>${esc(m.name)} <span class="muted">· ${m.used}${m.maxPerMonth && m.maxScope !== 'poster' ? '/' + m.maxPerMonth : ''} ครั้ง</span></span><b class="${m.score ? '' : 'muted'}">${fmtNum(m.score)}</b></div>`).join('')
      : '<div class="empty">ยังไม่มี Mission ในเดือนนี้</div>';
  }

  // ---------- send ----------
  async function loadMissions() {
    try {
      const now = new Date();
      state.missions = await api('missions', { year: now.getFullYear(), month: now.getMonth() + 1 });
      $('s-sub').textContent = state.guild.nameTH + ' · ' + state.guild.gameName + ' · เดือน ' + MONTHS[now.getMonth()] + ' ' + (now.getFullYear() + 543);
      const groups = { basic: 'Mission พื้นฐาน', feedback: 'Feedback', extra: '⭐ Mission เพิ่มเติม' };
      const cur = $('s-mission').value;
      $('s-mission').innerHTML = '<option value="">— เลือก Mission —</option>' + Object.keys(groups).map((k) => {
        const ms = state.missions.filter((m) => (m.group || 'basic') === k);
        return ms.length ? `<optgroup label="${groups[k]}">${ms.map((m) => `<option value="${esc(m.id)}">${esc(m.name)} — ${m.points} คะแนน</option>`).join('')}</optgroup>` : '';
      }).join('');
      if (cur) $('s-mission').value = cur;
      onMissionChange();
    } catch (err) { toast(err.message, true); }
  }

  function onMissionChange() {
    const m = state.missions.find((x) => x.id === $('s-mission').value);
    $('s-poster-wrap').hidden = !(m && m.maxScope === 'poster');
    if (!m) { $('s-detail').textContent = 'เลือก Mission เพื่อดูรายละเอียด'; return; }
    const limit = m.maxPerMonth ? `สูงสุด ${m.maxPerMonth} ครั้ง / เดือน${m.maxScope === 'poster' ? ' ต่อ 1 Facebook' : ''}` : 'ส่งได้ไม่จำกัด';
    $('s-detail').innerHTML = `<b style="color:var(--foreground)">${esc(m.name)}</b><br>${esc(m.detail).replace(/ · /g, '<br>• ').replace(/^/, '• ')}` +
      `<div class="badge">🏅 <div><b>${m.points}</b> คะแนน / ครั้ง · ${limit}${m.cuteGuild ? '<br>นับเข้าเงื่อนไข Cute Guild' : ''}</div></div>`;
  }

  async function onSend(e) {
    e.preventDefault();
    const btn = $('s-btn');
    btn.disabled = true; state.busy = true;
    try {
      await api('submit', { missionId: $('s-mission').value, link: $('s-link').value.trim(), poster: $('s-poster').value.trim(), note: $('s-note').value.trim() });
      toast('ส่ง Report เรียบร้อย รอทีมงานตรวจ');
      $('s-link').value = ''; $('s-note').value = '';
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; state.busy = false; }
  }

  // ---------- history ----------
  async function loadHist(silent) {
    try {
      const rows = await api('history', { year: Number($('h-year').value), month: Number($('h-month').value) });
      $('h-body').innerHTML = rows.length ? rows.map((r) => `<tr>
        <td>${fmtDate(r.createdAt)}</td>
        <td>${esc(r.mission)}${r.poster ? `<div class="note muted">${esc(r.poster)}</div>` : ''}</td>
        <td><a href="${esc(safeUrl(r.link))}" target="_blank" rel="noopener">เปิดลิงก์</a></td>
        <td><span class="pill ${esc(r.status)}">${STATUS_TH[r.status] || esc(r.status)}</span>${r.reason ? `<div class="note muted">${esc(r.reason)}</div>` : ''}</td>
        <td class="r">${r.status === 'approved' ? '<b>+' + fmtNum(r.approvedPoints) + '</b>' : '<span class="muted">—</span>'}</td></tr>`).join('')
        : '<tr><td colspan="5" class="empty">ยังไม่มี Report ในเดือนนี้ — <a href="#" id="go-send">ส่ง Report แรก</a></td></tr>';
      const go = $('go-send');
      if (go) go.onclick = (ev) => { ev.preventDefault(); switchPage('send'); };
    } catch (err) { if (!silent) toast(err.message, true); }
  }

  // ---------- theme ----------
  function applyTheme(t) {
    document.documentElement.classList.toggle('dark', t === 'dark');
    $('b-theme').textContent = t === 'dark' ? '☀️' : '🌙';
  }

  // ---------- DEMO (ใช้เมื่อยังไม่ได้ใส่ API_URL) ----------
  const Demo = {
    guild: { email: 'phoenix.10234.z4@guild.exe', game: 'z4', gameName: 'Zone4 Extreme', nameTH: 'กิลด์ Phoenix', nameEN: 'phoenix', guildId: '10234', mustChange: true, active: true },
    missions: [
      { id: 'z4-M1', group: 'basic', name: 'สร้าง Content ลงกลุ่ม Facebook Official', detail: 'Content ที่เกี่ยวข้องกับเกม · ใส่ Hashtag #รีวิวแฟชั่น #รีวิวเกม · จำกัด 1 Facebook = 10 Content / เดือน', points: 20, maxPerMonth: 10, maxScope: 'poster', cuteGuild: false },
      { id: 'z4-M2', group: 'basic', name: 'แชร์โพสต์กิจกรรม / โปรโมชั่น จาก Fanpage Official', detail: 'แชร์ภายใน 3 วันหลังโพสต์ · ตั้งเป็น Public · ใส่แคปชั่น + Hashtag', points: 10, maxPerMonth: 50, maxScope: 'guild', cuteGuild: false },
      { id: 'z4-M3', group: 'basic', name: 'รวมตี้ 8 คนขึ้นไป แช๊ะภาพประจำเดือน', detail: 'โพสต์รูปรวมตี้ลงกลุ่ม Facebook Official แบบสาธารณะ', points: 50, maxPerMonth: 4, maxScope: 'guild', cuteGuild: false },
      { id: 'z4-M4', group: 'basic', name: 'กิลด์วอยกตี้ เล่นด้วยกันรับด้วยกัน (Gang War)', detail: 'แคปรายละเอียดในแชทกิลด์ ภาพต้องมี Timestamp', points: 10, maxPerMonth: 2, maxScope: 'guild', cuteGuild: false },
      { id: 'z4-FB', group: 'feedback', name: 'ส่ง Feedback เกม', detail: 'อ้างอิงแพทช์ล่าสุด อธิบายชัดเจน', points: 10, maxPerMonth: null, maxScope: 'guild', cuteGuild: false },
      { id: 'z4-X1', group: 'extra', name: 'Mission เพิ่มเติมประจำเดือน', detail: 'ทีมงานแจ้งรายละเอียดทาง Discord', points: 15, maxPerMonth: 1, maxScope: 'guild', cuteGuild: false }
    ],
    reports: [],
    async call(b) {
      await new Promise((ok) => setTimeout(ok, 250));
      try { return { ok: true, data: this[b.action](b) }; } catch (e) { return { ok: false, error: e.message }; }
    },
    login(b) { if (!b.email || !b.password) throw new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง'); return { token: 'demo', guild: Object.assign({}, this.guild) }; },
    changePassword(b) { if ((b.newPassword || '').length < 8) throw new Error('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัว'); this.guild.mustChange = false; return true; },
    logout() { return true; },
    missions() { return this.missions; },
    submit(b) {
      const m = this.missions.find((x) => x.id === b.missionId);
      if (!m) throw new Error('กรุณาเลือก Mission');
      if (!/^https?:\/\/\S+$/i.test(b.link)) throw new Error('กรุณาใส่ลิงก์หลักฐานที่ขึ้นต้นด้วย http:// หรือ https://');
      if (m.maxScope === 'poster' && !b.poster) throw new Error('Mission นี้ต้องระบุชื่อ Facebook ผู้โพสต์');
      this.reports.unshift({ id: 'R' + Date.now(), createdAt: new Date().toISOString(), missionId: m.id, mission: m.name, poster: b.poster, link: b.link, status: 'pending', approvedPoints: null, reason: '' });
      return { reportId: 'demo' };
    },
    history(b) {
      const now = new Date();
      if (b.year !== now.getFullYear() || b.month !== now.getMonth() + 1) return [];
      return this.reports.concat([
        { createdAt: new Date(now - 2 * 864e5).toISOString(), mission: 'รวมตี้ 8 คนขึ้นไป แช๊ะภาพประจำเดือน', link: 'https://facebook.com', status: 'approved', approvedPoints: 50 },
        { createdAt: new Date(now - 4 * 864e5).toISOString(), mission: 'สร้าง Content ลงกลุ่ม Facebook Official', poster: 'Somchai Gamer', link: 'https://facebook.com', status: 'rejected', reason: 'ไม่ได้ติด Hashtag' },
        { createdAt: new Date(now - 6 * 864e5).toISOString(), mission: 'สร้าง Content ลงกลุ่ม Facebook Official', poster: 'Somchai Gamer', link: 'https://facebook.com', status: 'approved', approvedPoints: 20 }
      ]);
    },
    dashboard(b) {
      const monthly = [40, 55, 120, 48, 210, 62, 75, 230, 70, 0, 0, 0].map((v) => b.year === 2026 ? v : 0);
      const sc = monthly[b.month - 1];
      return { year: b.year, month: b.month, monthScore: sc, yearScore: monthly.reduce((a, c) => a + c, 0), monthly: monthly,
        rank: sc >= 200 ? 'SS' : sc >= 100 ? 'S' : '', rule: { ss: 200, s: 100 }, pending: this.reports.length, rejected: 1,
        perMission: this.missions.map((m, i) => ({ id: m.id, name: m.name, points: m.points, maxPerMonth: m.maxPerMonth, maxScope: m.maxScope, used: [1, 0, 1, 0, 0, 0][i], score: [20, 0, 50, 0, 0, 0][i] })),
        cuteGuild: null, updatedAt: new Date().toISOString() };
    }
  };

  // ---------- init ----------
  function init() {
    fillPeriodSelects();
    applyTheme(store.get('rgs_theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    $('f-login').addEventListener('submit', onLogin);
    $('f-pass').addEventListener('submit', onPass);
    $('f-send').addEventListener('submit', onSend);
    $('s-mission').addEventListener('change', onMissionChange);
    $('p-cancel').onclick = () => enterApp();
    $('b-pass').onclick = () => openPass(false);
    $('b-out').onclick = () => logout(false);
    $('b-theme').onclick = () => {
      const t = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
      store.set('rgs_theme', t); applyTheme(t);
    };
    document.querySelectorAll('.tab').forEach((t) => (t.onclick = () => switchPage(t.dataset.p)));
    ['d-year', 'd-month'].forEach((id) => $(id).addEventListener('change', () => loadDash()));
    ['h-year', 'h-month'].forEach((id) => $(id).addEventListener('change', () => loadHist()));

    const savedEmail = store.get('rgs_email');
    if (savedEmail) $('l-email').value = savedEmail;
    const saved = tokenStore.get();
    if (saved && !DEMO) {
      state.token = saved;
      api('me').then((g) => { state.guild = g; g.mustChange ? openPass(true) : enterApp(); }).catch(() => show('v-login'));
    } else {
      show('v-login');
    }
  }

  init();
})();
