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
      // บางครั้ง Google ตอบหน้าเช็คสถานะ (doGet: มี "service" ไม่มี data) แทนผลจริง — มักตอนเซิร์ฟเวอร์ช้า
      // คำสั่งอ่านอย่างเดียว → ลองใหม่เอง · submit ห้ามส่งซ้ำ → ให้ onSend ไปตรวจในประวัติแทน
      const readOnly = ['me', 'bootstrap', 'missions', 'dashboard', 'history'].indexOf(action) >= 0;
      let lastErr;
      for (let i = 0; i < 3; i++) {           // ลองใหม่อัตโนมัติ (เน็ตสะดุด / Apps Script ยุ่ง)
        try {
          const r = await fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
          res = await r.json();
          if (res && res.ok && res.service && res.data === undefined) {
            if (!readOnly) throw Object.assign(new Error('UNCERTAIN'), { uncertain: true });
            res = null;
            throw new Error('GET_FALLBACK');
          }
          lastErr = null;
          break;
        } catch (e) {
          if (e.uncertain) throw e;
          if (!readOnly && action !== 'login') throw Object.assign(new Error('UNCERTAIN'), { uncertain: true });
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

  /** ปลุกเซิร์ฟเวอร์ล่วงหน้า (GET เบา ๆ ไม่อ่านชีต) ระหว่างกิลด์กรอกฟอร์ม · ไม่เกิน 1 ครั้ง/นาที · พลาดก็ไม่เป็นไร */
  let lastWarm = 0;
  function warmUp() {
    if (DEMO || Date.now() - lastWarm < 60000) return;
    lastWarm = Date.now();
    fetch(CFG.API_URL, { method: 'GET', mode: 'no-cors', cache: 'no-store' }).catch(() => {});
  }

  // ---------- auth ----------
  async function onLogin(e) {
    e.preventDefault();
    const btn = e.submitter || e.target.querySelector('button');
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'กำลังเข้าสู่ระบบ…';
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
    finally { btn.disabled = false; btn.textContent = label; }
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
      if (state.guild) state.guild.mustChange = false;
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
  /** ปี: ตั้งแต่ปีแรกของโครงการ ถึงปีปัจจุบัน (ปีใหม่เพิ่มเอง ไม่มีปีตายตัว) · เดือนในอนาคตเลือกไม่ได้ */
  function fillPeriodSelects() {
    const now = new Date();
    ['d', 'h'].forEach((p) => {
      $(p + '-month').innerHTML = MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
      let yrs = '';
      for (let y = now.getFullYear(); y >= FIRST_YEAR; y--) yrs += `<option value="${y}">${y + 543}</option>`;
      $(p + '-year').innerHTML = yrs;
      $(p + '-month').value = now.getMonth() + 1;
      $(p + '-year').value = now.getFullYear();
      lockFutureMonths(p);
    });
  }
  function lockFutureMonths(p) {
    const now = new Date(), y = Number($(p + '-year').value), sel = $(p + '-month');
    Array.prototype.forEach.call(sel.options, (o) => { o.disabled = y === now.getFullYear() && Number(o.value) > now.getMonth() + 1; });
    if (sel.selectedOptions[0] && sel.selectedOptions[0].disabled) sel.value = now.getMonth() + 1;
  }

  function showGuild(g) {
    $('g-name').textContent = g.nameTH;
    $('g-game').textContent = g.gameName + ' · Guild ID ' + g.guildId + (DEMO ? ' · DEMO' : '');
  }

  /** เข้าแอป: ขอ bootstrap ครั้งเดียว (กิลด์ + Mission + คะแนน) */
  async function enterApp() {
    if (state.guild) showGuild(state.guild);
    show('v-app');
    switchPage('dash', true);
    setDashLoading(true);
    const now = new Date();
    const seenKey = 'rgs_seen_' + ((state.guild && state.guild.email) || store.get('rgs_email') || '');
    const since = Number(store.get(seenKey) || 0);
    try {
      const b = DEMO
        ? { guild: state.guild, missions: await api('missions'), dashboard: await api('dashboard', { year: now.getFullYear(), month: now.getMonth() + 1 }) }
        : await api('bootstrap', { year: now.getFullYear(), month: now.getMonth() + 1, since: since });
      state.guild = b.guild;
      showGuild(b.guild);
      state.missions = b.missions;
      renderDash(b.dashboard);
      renderMissions(b.missions);
      showReviewed(b.reviewed);
      store.set('rgs_seen_' + b.guild.email, String(Date.now()));
      startRefresh();
    } catch (err) { toast(err.message, true); }
    finally { setDashLoading(false); }
  }

  /** สถานะกำลังโหลดของหน้าคะแนน (ตัวเลขกระพริบแทนขีด) */
  function setDashLoading(on) {
    $('p-dash').classList.toggle('loading', on);
    if (on) {
      ['k-month', 'k-year', 'k-pend', 'k-rej', 'k-streak'].forEach((id) => { if ($(id).textContent === '–') $(id).textContent = '···'; });
      if ($('r-title').textContent === '–') $('r-title').textContent = 'กำลังโหลดคะแนน…';
    }
  }

  function switchPage(p, skipLoad) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.p === p));
    document.querySelectorAll('.page').forEach((x) => x.classList.toggle('on', x.id === 'p-' + p));
    if (skipLoad) return;
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
    if (!silent) setDashLoading(true);
    try {
      const d = await api('dashboard', { year: y, month: m });
      renderDash(d);
    } catch (err) { if (!silent) toast(err.message, true); }
    finally { if (!silent) setDashLoading(false); }
  }

  /** แจ้งผลตรวจที่เกิดขึ้นตั้งแต่เปิดเว็บครั้งก่อน (แถบบนหน้าคะแนน + Toast) */
  function showReviewed(rv) {
    const box = $('d-review');
    if (!rv || (!rv.approved && !rv.rejected)) { if (box) box.remove(); return; }
    const el = box || Object.assign(document.createElement('div'), { id: 'd-review' });
    el.className = 'notice ' + (rv.rejected ? 'warn' : 'good');
    el.innerHTML = `<div><b>ผลตรวจตั้งแต่ครั้งก่อน:</b> ` +
      (rv.approved ? `✅ อนุมัติ ${rv.approved} รายการ (+${fmtNum(rv.points)} คะแนน)` : '') + (rv.approved && rv.rejected ? ' · ' : '') +
      (rv.rejected ? `❌ ปฏิเสธ ${rv.rejected} รายการ` : '') + `</div>` +
      (rv.rejectedList && rv.rejectedList.length ? `<ul>${rv.rejectedList.map((x) => `<li>${esc(x.mission)} — <span class="muted">${esc(x.reason || '')}</span></li>`).join('')}</ul>` : '') +
      `<div class="notice-act">${rv.rejected ? '<a href="#" data-go="hist">ดูและส่งใหม่ในประวัติ →</a>' : ''}<button type="button" class="icon x" aria-label="ปิด">×</button></div>`;
    el.querySelector('.x').onclick = () => el.remove();
    const go = el.querySelector('[data-go]');
    if (go) go.onclick = (ev) => { ev.preventDefault(); switchPage('hist'); };
    if (!box) $('d-notice').prepend(el);
    toast(`มีผลตรวจใหม่: ✅ ${rv.approved} · ❌ ${rv.rejected}`);
  }

  // ---------- เอฟเฟกต์ (ปิดเองถ้าเครื่องตั้ง "ลดการเคลื่อนไหว") ----------
  const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  /** ตัวเลขวิ่งจากค่าเดิม → ค่าใหม่ (ครั้งแรกเริ่มที่ 0) */
  function countUp(el, to) {
    to = Number(to) || 0;
    const from = Number(el.dataset.v || 0);
    el.dataset.v = to;
    if (calm() || from === to) { el.textContent = fmtNum(to); return; }
    const t0 = performance.now(), dur = 900;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmtNum(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** ฉลองครั้งแรกที่ได้ S / SS ของเดือน (ครั้งเดียวต่อ Rank ต่อเดือน ต่อเครื่อง) */
  function maybeCelebrate(rank, y, m) {
    if (!rank || !state.guild) return;
    const key = `rgs_cel_${state.guild.email}_${y}-${m}`, had = store.get(key) || '';
    if (had === 'SS' || had === rank) return;
    store.set(key, rank);
    celebrate(rank);
  }
  function celebrate(rank) {
    const o = document.createElement('div');
    o.className = 'overlay celebrate';
    o.innerHTML = `<canvas></canvas><div class="card cele"><div class="cele-rank ${rank}">${rank}</div><h2>🎉 ยินดีด้วย!</h2><p>กิลด์ของคุณได้ <b>Rank ${rank}</b> ประจำเดือนนี้แล้ว</p>` +
      `<p class="muted">${rank === 'SS' ? 'สุดยอด! รักษาไว้ให้ได้ทุกเดือนนะ 👑' : 'อีกนิดเดียวถึง SS — สู้ ๆ! 🔥'}</p><button type="button" class="btn">เยี่ยมเลย!</button></div>`;
    const close = () => o.remove();
    o.querySelector('button').onclick = close;
    o.onclick = (ev) => { if (ev.target === o) close(); };
    document.body.appendChild(o);
    if (!calm()) confetti(o.querySelector('canvas'));
  }
  /** พลุกระดาษโทนแดงไล่เฉด (ไม่ใช้ไลบรารี) */
  function confetti(cv) {
    const ctx = cv.getContext('2d'), W = cv.width = innerWidth, H = cv.height = innerHeight;
    const cs = getComputedStyle(document.documentElement);
    const cols = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'].map((v) => cs.getPropertyValue(v).trim() || '#e11').concat(['#ffd166', '#ffffff']);
    const ps = Array.from({ length: 160 }, () => ({ x: W / 2 + (Math.random() - 0.5) * 120, y: H * 0.35, vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 14 - 4, r: Math.random() * 6 + 4, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3, c: cols[(Math.random() * cols.length) | 0] }));
    const t0 = performance.now();
    const tick = (t) => {
      ctx.clearRect(0, 0, W, H);
      ps.forEach((p) => {
        p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore();
      });
      if (t - t0 < 3500 && cv.isConnected) requestAnimationFrame(tick); else ctx.clearRect(0, 0, W, H);
    };
    requestAnimationFrame(tick);
  }

  /** ปฏิทินความขยัน: 1 ช่อง = 1 วัน · สีเข้มตามจำนวน Report ที่ส่ง */
  function renderHeat(d) {
    const box = $('heat'), daily = d.daily || [];
    $('hm-title').textContent = 'ปฏิทินความขยัน · ' + MONTHS[d.month - 1];
    if (!daily.length) { box.innerHTML = '<div class="empty">อัปเดตหลังบ้านแล้วจะเห็นข้อมูลรายวัน</div>'; return; }
    const first = new Date(d.year, d.month - 1, 1).getDay(), today = new Date();
    const isNow = d.year === today.getFullYear() && d.month === today.getMonth() + 1;
    const lvl = (n) => n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4;
    box.innerHTML = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((w) => `<b>${w}</b>`).join('') +
      '<span></span>'.repeat(first) +
      daily.map((n, i) => `<i class="h${lvl(n)}${isNow && i + 1 === today.getDate() ? ' today' : ''}${isNow && i + 1 > today.getDate() ? ' future' : ''}" title="${i + 1} ${MONTHS[d.month - 1]}: ${n} รายการ" style="--i:${i}">${i + 1}</i>`).join('');
  }

  /** เหรียญความสำเร็จ (ทั้งปี) — ได้แล้วสีแดงเรืองแสง · ยังไม่ได้สีเทา + บอกเงื่อนไข */
  function renderBadges(d) {
    const s = d.stats || {}, cute = d.cuteGuild;
    const list = [
      { i: '🥇', t: 'Report แรก', need: 'ส่ง Report ครั้งแรก', ok: (s.reports || 0) >= 1 },
      { i: '🔥', t: 'ขยันติดกัน 7 วัน', need: `ส่งติดกัน 7 วัน (ตอนนี้ ${s.bestStreak || 0})`, ok: (s.bestStreak || 0) >= 7 },
      { i: '💯', t: 'อนุมัติครบ 100', need: `อนุมัติ 100 รายการในปีนี้ (ตอนนี้ ${s.approved || 0})`, ok: (s.approved || 0) >= 100 },
      { i: '💖', t: 'Cute Guild', need: cute ? `Feedback อนุมัติ ${cute.count}/${cute.need} ใน 30 วัน` : 'เฉพาะ TOSM / 9Yin', ok: !!(cute && cute.achieved), off: !cute },
      { i: '👑', t: 'SS 3 เดือนติด', need: `ได้ SS ติดกัน 3 เดือน (ตอนนี้ ${s.ssStreak || 0})`, ok: (s.ssStreak || 0) >= 3 }
    ].filter((b) => !b.off);
    $('bd-count').textContent = `${list.filter((b) => b.ok).length}/${list.length}`;
    $('badges').innerHTML = list.map((b) => `<div class="bd ${b.ok ? 'on' : ''}" title="${esc(b.need)}"><span>${b.i}</span><b>${esc(b.t)}</b><small>${b.ok ? 'ปลดล็อกแล้ว' : esc(b.need)}</small></div>`).join('');
  }

  /** เครื่องหมายถูกวาดตัวเอง ก่อนไปหน้าคะแนน */
  function successCheck(text) {
    return new Promise((ok) => {
      const o = document.createElement('div');
      o.className = 'overlay done';
      o.innerHTML = `<div class="card done-card"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M14 27l8 8 16-17"/></svg><b></b></div>`;
      o.querySelector('b').textContent = text;
      document.body.appendChild(o);
      setTimeout(() => { o.remove(); ok(); }, calm() ? 700 : 1400);
    });
  }

  /** วันที่เหลือก่อนปิดรอบเดือนนี้ (รวมวันนี้) */
  function daysLeftInMonth() {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate() - n.getDate() + 1;
  }
  function deadlineHtml() {
    const d = daysLeftInMonth(), n = new Date();
    if (d > 7) return '';
    const last = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
    return `<div class="notice ${d <= 2 ? 'warn' : 'info'}"><div>⏳ ${d === 1 ? '<b>วันสุดท้าย!</b> ปิดรอบ' : `เหลือ <b>${d} วัน</b> ก่อนปิดรอบ`} ${MONTHS[n.getMonth()]} ${n.getFullYear() + 543} — ส่งได้ถึง ${last} ${MONTHS[n.getMonth()]} 23:59 น.</div></div>`;
  }

  function renderDash(d) {
    const rule = d.rule, sc = d.monthScore, now = new Date();
    const isNow = d.year === now.getFullYear() && d.month === now.getMonth() + 1;
    // จำนวนที่ใช้ไปของเดือนนี้ → ให้ Dropdown Mission บอกสิทธิ์ที่เหลือ
    if (isNow) {
      state.usage = {};
      d.perMission.forEach((m) => { state.usage[m.id] = m.used; });
      if (state.missions) renderMissions(state.missions);
    }
    // แถบนับถอยหลัง + การ์ดต้อนรับกิลด์ใหม่
    const welcome = d.year === now.getFullYear() && !d.totalThisYear
      ? `<div class="notice welcome"><div><b>👋 ยินดีต้อนรับ ${esc((state.guild && state.guild.nameTH) || '')}</b><br>ยังไม่มี Report ในปีนี้ — ส่งหลักฐาน Mission แรกเพื่อเริ่มเก็บคะแนน</div>` +
        `<div class="notice-act"><button type="button" class="btn go-send">📤 ส่ง Report แรก</button><button type="button" class="btn ghost open-help2">📖 วิธีใช้งาน</button></div></div>` : '';
    let slot = $('d-slot');
    if (!slot) { slot = document.createElement('div'); slot.id = 'd-slot'; $('d-notice').appendChild(slot); }
    slot.innerHTML = (isNow ? deadlineHtml() : '') + welcome;
    const gs = slot.querySelector('.go-send'); if (gs) gs.onclick = () => switchPage('send');
    const oh = slot.querySelector('.open-help2'); if (oh) oh.onclick = () => { $('help').hidden = false; };
    $('d-rank').innerHTML = d.rank ? `<span class="pill rank ${d.rank}">Rank ${d.rank}</span>` : '';
    $('k-month-l').textContent = 'คะแนนเดือน ' + MONTHS[d.month - 1] + ' ' + (d.year + 543);
    countUp($('k-month'), sc);
    $('k-year-l').textContent = 'คะแนนสะสมปี ' + (d.year + 543);
    countUp($('k-year'), d.yearScore);
    countUp($('k-pend'), d.pending);
    countUp($('k-rej'), d.rejected);
    const st = d.stats || {};
    $('k-streak').textContent = (st.bestStreak || 0) + ' วัน';

    // วงแหวน: ยังไม่ถึง S → วัดไปที่ S · ถึง S แล้ว → วัดไปที่ SS · ได้ SS แล้ว = เต็มวง
    const target = sc >= rule.s ? rule.ss : rule.s;
    const pct = sc >= rule.ss ? 100 : Math.max(0, Math.min(100, Math.round((sc / target) * 100)));
    const C = 2 * Math.PI * 52;
    $('r-ring').style.strokeDasharray = C;
    $('r-ring').style.strokeDashoffset = C;
    requestAnimationFrame(() => requestAnimationFrame(() => { $('r-ring').style.strokeDashoffset = C * (1 - pct / 100); }));
    $('r-pct').textContent = pct + '%';
    $('r-next').textContent = sc >= rule.ss ? 'SS แล้ว!' : (sc >= rule.s ? 'ถึง SS · ' + rule.ss : 'ถึง S · ' + rule.s);
    $('p-dash').querySelector('.hero').dataset.rank = d.rank || '';
    if (isNow) maybeCelebrate(d.rank, d.year, d.month);
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
      `<div class="${i + 1 === d.month ? 'cur' : ''}${v >= rule.ss ? ' ss' : ''}" style="--h:${(v / top) * 100}%;--i:${i}" title="${MONTHS[i]}: ${v}${v >= rule.ss ? ' · SS' : ''}">${v ? `<em>${v >= rule.ss ? '⭐ ' : ''}${v}</em>` : ''}<span>${MONTHS[i]}</span></div>`).join('');

    renderHeat(d);
    renderBadges(d);

    $('per').innerHTML = d.perMission.length ? d.perMission.map((m) =>
      `<div class="mission"><span>${esc(m.name)} <span class="muted">· ${m.used}${m.maxPerMonth && m.maxScope !== 'poster' ? '/' + m.maxPerMonth : ''} ครั้ง</span></span><b class="${m.score ? '' : 'muted'}">${fmtNum(m.score)}</b></div>`).join('')
      : '<div class="empty">ยังไม่มี Mission ในเดือนนี้</div>';
  }

  // ---------- send ----------
  async function loadMissions() {
    try {
      const now = new Date();
      renderMissions(await api('missions', { year: now.getFullYear(), month: now.getMonth() + 1 }));
    } catch (err) { toast(err.message, true); }
  }

  function renderMissions(list) {
      const now = new Date();
      state.missions = list;
      $('s-sub').textContent = state.guild.nameTH + ' · ' + state.guild.gameName + ' · เดือน ' + MONTHS[now.getMonth()] + ' ' + (now.getFullYear() + 543);
      $('s-deadline').innerHTML = deadlineHtml();
      const groups = { basic: 'Mission พื้นฐาน', feedback: 'Feedback', extra: '⭐ Mission เพิ่มเติม' };
      const cur = $('s-mission').value;
      const usage = state.usage || {};
      // บอกสิทธิ์ที่เหลือ · ส่งครบแล้วเลือกไม่ได้ (Mission ที่นับต่อ Facebook นับรวมไม่ได้ จึงไม่ปิด)
      const optText = (m) => {
        let t = `${m.name} — ${m.points} คะแนน`;
        if (m.maxPerMonth && m.maxScope !== 'poster' && usage[m.id] != null) {
          const left = Math.max(0, m.maxPerMonth - usage[m.id]);
          t += left ? ` · เหลือ ${left}/${m.maxPerMonth}` : ' · ✔ ครบแล้วเดือนนี้';
        }
        return t;
      };
      const full = (m) => m.maxPerMonth && m.maxScope !== 'poster' && usage[m.id] != null && usage[m.id] >= m.maxPerMonth;
      $('s-mission').innerHTML = '<option value="">— เลือก Mission —</option>' + Object.keys(groups).map((k) => {
        const ms = state.missions.filter((m) => (m.group || 'basic') === k);
        return ms.length ? `<optgroup label="${groups[k]}">${ms.map((m) => `<option value="${esc(m.id)}"${full(m) ? ' disabled' : ''}>${esc(optText(m))}</option>`).join('')}</optgroup>` : '';
      }).join('');
      if (cur) $('s-mission').value = cur;
      onMissionChange();
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
    const p = parseLinks();
    if (!$('s-mission').value) return toast('กรุณาเลือก Mission', true);
    if (!$('s-poster-wrap').hidden && !$('s-poster').value.trim()) return toast('Mission นี้ต้องระบุชื่อ Facebook ผู้โพสต์', true);
    const n = p.ok.length + p.imgs.length;
    if (!n) return toast('กรุณาใส่ลิงก์ (http:// หรือ https://) หรือเพิ่มรูปหลักฐานอย่างน้อย 1 รายการ', true);
    if (n > MAX_LINKS) return toast('ส่งได้ครั้งละไม่เกิน ' + MAX_LINKS + ' รายการ (ลิงก์ + รูป)', true);
    btn.disabled = true; state.busy = true;
    btn.textContent = p.imgs.length ? `กำลังอัปโหลด ${n} รายการ…` : (n > 1 ? `กำลังส่ง ${n} ลิงก์…` : 'กำลังส่ง…');
    const slow = setTimeout(() => { btn.textContent = 'กำลังบันทึก… อาจใช้เวลาสักครู่ อย่าเพิ่งปิดหน้านี้'; }, 3000);
    try {
      let r;
      try {
        r = await submitInRounds(p, btn, slow);
      } catch (err) {
        if (!err.uncertain) throw err;
        btn.textContent = 'กำลังตรวจสอบว่าบันทึกแล้วหรือยัง…';
        r = await verifySubmitted(p.ok, p.imgs);
      }
      const sk = r.skipped || [];
      const leftLinks = sk.filter((x) => x.kind !== 'image').map((x) => x.link).concat(p.bad);
      const leftImgs = sk.filter((x) => x.kind === 'image').map((x) => String(x.key || '').replace(/^img:/, ''));
      if (!leftLinks.length && !leftImgs.length && (r.accepted || []).length) {
        // ส่งครบทุกรายการ → ล้างฟอร์ม แล้วกลับหน้าคะแนน (โหลดใหม่ให้เห็นรายการรอตรวจ)
        resetSendForm();
        await successCheck(`ส่ง ${r.accepted.length} รายการเรียบร้อย — รอทีมงานตรวจ`);
        switchPage('dash');
        return;
      }
      // มีรายการค้าง → อยู่หน้าเดิม โชว์สรุป + เหลือเฉพาะกล่องที่ต้องแก้
      renderSendResult(r);
      setLinkBoxes(leftLinks, leftImgs);
    } catch (err) { toast(err.message, true); }
    finally { clearTimeout(slow); btn.disabled = false; state.busy = false; updateLinkCount(); }
  }

  /**
   * ส่งเป็นรอบ: รอบแรก = ลิงก์ทั้งหมด + รูป 4 รูป · รอบต่อไปรอบละ 4 รูป (ใช้ batchId เดิม = การ์ดเดียวกันใน CTM)
   * โชว์ "อัปโหลดรูป 4/12" บนปุ่ม · รวมผลทุกรอบเป็นผลเดียว
   */
  const IMG_PER_ROUND = 4;
  async function submitInRounds(p, btn, slow) {
    const base = { missionId: $('s-mission').value, poster: $('s-poster').value.trim(), note: $('s-note').value.trim() };
    const pack = (arr) => arr.map((im) => ({ name: im.name, type: im.type, data: im.data, hash: im.hash }));
    const imgs = p.imgs.slice(), total = imgs.length;
    const out = { accepted: [], skipped: [], remaining: null, batchId: '' };
    let first = true, sent = 0;
    do {
      const part = imgs.splice(0, IMG_PER_ROUND);
      if (total) { clearTimeout(slow); btn.textContent = `⏳ อัปโหลดรูป ${sent + part.length}/${total}…`; }
      const r = await api('submit', Object.assign({}, base, {
        links: first ? p.ok : [], images: pack(part), batchId: out.batchId, more: imgs.length > 0 || (first && p.ok.length + total > 1) }));
      out.accepted = out.accepted.concat(r.accepted || []);
      out.skipped = out.skipped.concat(r.skipped || []);
      out.remaining = r.remaining;
      out.batchId = out.batchId || r.batchId || '';
      sent += part.length; first = false;
    } while (imgs.length);
    return out;
  }

  /**
   * ผลส่งไม่ชัดเจน (Google ตอบผิดรูป/เน็ตหลุดระหว่างรอ) → ดูประวัติเดือนนี้ว่าลิงก์ไหนเข้าแล้ว
   * ไม่ส่งซ้ำเอง เพราะอาจบันทึกไปแล้ว
   */
  async function verifySubmitted(links, imgs) {
    const now = new Date();
    await new Promise((ok) => setTimeout(ok, 1500));
    const rows = await api('history', { year: now.getFullYear(), month: now.getMonth() + 1 });
    const saved = {};
    rows.forEach((x) => { if (x.status !== 'rejected') { saved[String(x.link).trim()] = true; if (x.hash) saved['img:' + x.hash] = true; } });
    const accepted = [], skipped = [], why = 'ยังไม่ได้บันทึก (ระบบตอบช้า) — กดส่งอีกครั้ง';
    links.forEach((l) => saved[l] ? accepted.push({ link: l }) : skipped.push({ link: l, kind: 'link', reason: why }));
    (imgs || []).forEach((im) => {
      const it = { link: '🖼️ ' + im.name, kind: 'image', key: 'img:' + im.hash };
      if (saved[it.key]) accepted.push(it); else { it.reason = why; skipped.push(it); }
    });
    return { accepted: accepted, skipped: skipped, remaining: null };
  }

  // ---------- หลายลิงก์ ----------
  const MAX_LINKS = 50;

  const linkInputs = () => Array.prototype.slice.call(document.querySelectorAll('#s-links input'));

  /** เพิ่มกล่องลิงก์ 1 กล่อง (ค่าเริ่มต้นได้) */
  function addLinkBox(value, focus) {
    if (boxCount() >= MAX_LINKS) return toast('ส่งได้ครั้งละไม่เกิน ' + MAX_LINKS + ' รายการ (ลิงก์ + รูป)', true);
    const row = document.createElement('div');
    row.className = 'link-row';
    row.innerHTML = '<span class="n"></span><input type="url" inputmode="url" placeholder="https://facebook.com/groups/..." aria-label="ลิงก์หลักฐาน"><button type="button" class="icon x" title="ลบกล่องนี้" aria-label="ลบกล่องนี้">×</button>';
    const inp = row.querySelector('input');
    inp.value = value || '';
    inp.addEventListener('input', updateLinkCount);
    inp.addEventListener('focus', warmUp);
    // วางหลายลิงก์ทีเดียว → แตกเป็นหลายกล่องให้เอง
    inp.addEventListener('paste', (ev) => {
      const txt = (ev.clipboardData || window.clipboardData).getData('text') || '';
      const parts = txt.split(/\s+/).map((s) => s.trim()).filter(Boolean);
      if (parts.length < 2) return;
      ev.preventDefault();
      inp.value = parts.shift();
      parts.forEach((s) => addLinkBox(s));
      updateLinkCount();
    });
    row.querySelector('.x').onclick = () => {
      if (linkInputs().length > 1) row.remove(); else inp.value = '';
      updateLinkCount();
    };
    $('s-links').appendChild(row);
    if (focus) inp.focus();
    updateLinkCount();
  }

  // ---------- รูปหลักฐาน (1 รูป = 1 กล่อง · ย่อในเครื่องก่อนส่ง) ----------
  const IMG_MAX_SIDE = 1600, IMG_QUALITY = 0.82;
  const imgStore = {};                     // hash → { name, type, data(base64), hash, thumb }
  const boxCount = () => $('s-links').children.length;
  const imgRows = () => Array.prototype.slice.call(document.querySelectorAll('#s-links .img-row'));

  async function sha256Hex(buf) {
    const d = await crypto.subtle.digest('SHA-256', buf);
    return Array.prototype.map.call(new Uint8Array(d), (b) => ('0' + b.toString(16)).slice(-2)).join('');
  }

  /** ย่อรูป (ด้านยาว ≤ 1600px → JPEG) · GIF ส่งตามเดิม · hash จากไฟล์ต้นฉบับ (กันส่งรูปเดิมซ้ำ) */
  async function prepareImage(file) {
    const buf = await file.arrayBuffer();
    const hash = await sha256Hex(buf);
    const bmp = await new Promise((ok, fail) => {
      const im = new Image();
      im.onload = () => ok(im);
      im.onerror = () => fail(new Error('เปิดรูป "' + file.name + '" ไม่ได้'));
      im.src = URL.createObjectURL(file);
    });
    const draw = (max, type, q) => {
      const s = Math.min(1, max / Math.max(bmp.naturalWidth, bmp.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.naturalWidth * s); c.height = Math.round(bmp.naturalHeight * s);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);   // PNG โปร่งใส → พื้นขาว
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      return c.toDataURL(type, q);
    };
    const thumb = draw(160, 'image/jpeg', 0.7);
    let type = 'image/jpeg', data;
    if (file.type === 'image/gif') { type = 'image/gif'; data = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.readAsDataURL(file); }); }
    else data = draw(IMG_MAX_SIDE, 'image/jpeg', IMG_QUALITY).split(',')[1];
    URL.revokeObjectURL(bmp.src);
    if (data.length * 0.75 > 5 * 1024 * 1024) throw new Error('รูป "' + file.name + '" ใหญ่เกิน 5MB');
    const base = (file.name || 'screenshot').replace(/\.[^.]+$/, '').replace(/[^\w฀-๿-]+/g, '_').slice(0, 60) || 'image';
    return { name: base + (type === 'image/gif' ? '.gif' : '.jpg'), type, data, hash, thumb };
  }

  /** เพิ่มกล่องรูป (ใช้แทนกล่องลิงก์ว่างอันสุดท้ายถ้ามี) */
  function addImageBox(img) {
    const emptyLink = linkInputs().filter((i) => !i.value.trim());
    if (boxCount() - emptyLink.length >= MAX_LINKS) return false;
    imgStore[img.hash] = img;
    const row = document.createElement('div');
    row.className = 'link-row img-row';
    row.dataset.hash = img.hash;
    row.innerHTML = '<span class="n"></span><div class="img-box"><img alt=""><span></span></div><button type="button" class="icon x" title="ลบรูปนี้" aria-label="ลบรูปนี้">×</button>';
    row.querySelector('img').src = img.thumb;
    row.querySelector('.img-box').onclick = () => viewImage(img);
    row.querySelector('.img-box').title = 'แตะเพื่อดูรูปใหญ่';
    row.querySelector('.img-box span').textContent = img.name;
    row.querySelector('.x').onclick = () => {
      row.remove(); delete imgStore[img.hash];
      if (!boxCount()) addLinkBox('');
      updateLinkCount();
    };
    if (emptyLink.length) emptyLink[emptyLink.length - 1].parentNode.replaceWith(row);
    else $('s-links').appendChild(row);
    updateLinkCount();
    return true;
  }

  /** ดูรูปใหญ่ก่อนส่ง (ปิด: แตะที่ว่าง / ✕ / Esc) */
  function viewImage(img) {
    const o = document.createElement('div');
    o.className = 'overlay viewer';
    o.innerHTML = '<figure><img alt=""><figcaption></figcaption></figure><button type="button" class="icon x" aria-label="ปิด">✕</button>';
    o.querySelector('img').src = 'data:' + img.type + ';base64,' + img.data;
    o.querySelector('figcaption').textContent = img.name;
    const close = () => { o.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (ev) => { if (ev.key === 'Escape') close(); };
    o.onclick = (ev) => { if (ev.target === o || ev.target.classList.contains('x')) close(); };
    document.addEventListener('keydown', onKey);
    document.body.appendChild(o);
  }

  async function addImages(files) {
    files = Array.prototype.filter.call(files || [], (f) => /^image\//.test(f.type));
    if (!files.length) return;
    const btn = $('s-addimg');
    btn.disabled = true; btn.textContent = `⏳ กำลังเตรียมรูป 0/${files.length}…`;
    let added = 0, dup = 0, over = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        btn.textContent = `⏳ กำลังเตรียมรูป ${i + 1}/${files.length}…`;
        try {
          const img = await prepareImage(files[i]);
          if (imgStore[img.hash]) { dup++; continue; }
          if (addImageBox(img)) added++; else over++;
        } catch (err) { toast(err.message, true); }
      }
      if (added) toast(`🖼️ เพิ่มรูป ${added} รูป` + (dup ? ` · ข้ามรูปซ้ำ ${dup}` : ''));
      else if (dup) toast('รูปนี้อยู่ในรายการแล้ว', true);
      if (over) toast(`⚠️ เกิน ${MAX_LINKS} กล่อง — เหลืออีก ${over} รูป ส่งรอบนี้ก่อนแล้วค่อยเพิ่ม`, true);
    } finally { btn.disabled = false; btn.textContent = '🖼️ เพิ่มรูป'; $('s-img').value = ''; }
  }

  // ---------- นำเข้าลิงก์จากไฟล์ (อ่านในเครื่อง ไม่อัปโหลด) ----------
  const SHEETJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  let sheetJsPromise = null;

  /** โหลด SheetJS ครั้งเดียว เฉพาะตอนนำเข้า Excel */
  function loadSheetJs() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!sheetJsPromise) {
      sheetJsPromise = new Promise((ok, fail) => {
        const s = document.createElement('script');
        s.src = SHEETJS_URL;
        s.onload = () => ok(window.XLSX);
        s.onerror = () => { sheetJsPromise = null; fail(new Error('โหลดตัวอ่าน Excel ไม่ได้ (ตรวจอินเทอร์เน็ต) — ลอง Save เป็น .csv แทน')); };
        document.head.appendChild(s);
      });
    }
    return sheetJsPromise;
  }

  /**
   * กวาดหาลิงก์ในข้อความ · เติม https:// ให้ลิงก์ Facebook/www ที่ไม่มี
   * ตัดเครื่องหมายวรรคตอนท้ายลิงก์ (เช่น "," ")" ".") ออก
   */
  function extractLinks(text) {
    // ไม่รับ , ในลิงก์ (เป็นตัวคั่นคอลัมน์ CSV)
    const re = /\bhttps?:\/\/[^\s"'<>,]+|\b(?:www\.|m\.|web\.)?(?:facebook\.com|fb\.com|fb\.watch)\/[^\s"'<>,]+|\bwww\.[^\s"'<>,]+/gi;
    return (String(text || '').match(re) || []).map((u) => {
      u = u.replace(/[),.;:!?\]}]+$/, '');
      return /^https?:\/\//i.test(u) ? u : 'https://' + u;
    });
  }

  /** อ่านไฟล์ → รายการลิงก์ (Excel อ่านทุกชีต ทุกช่อง + ลิงก์ที่ซ่อนใต้ข้อความ) */
  async function readLinksFromFile(file) {
    const name = file.name.toLowerCase();
    if (/\.(xlsx|xls)$/.test(name)) {
      const XLSX = await loadSheetJs();
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const found = [];
      wb.SheetNames.forEach((sn) => {
        const ws = wb.Sheets[sn];
        Object.keys(ws).forEach((addr) => {
          if (addr[0] === '!') return;
          const c = ws[addr];
          if (c.l && c.l.Target) found.push.apply(found, extractLinks(c.l.Target));   // ไฮเปอร์ลิงก์ที่ซ่อน
          if (c.v != null) found.push.apply(found, extractLinks(c.v));
          if (c.f) found.push.apply(found, extractLinks(c.f));                       // =HYPERLINK("…")
        });
      });
      return found;
    }
    if (/\.(txt|csv|tsv)$/.test(name) || /^text\//.test(file.type)) return extractLinks(await file.text());
    throw new Error('ไฟล์นี้ยังไม่รองรับ — ใช้ .txt · .csv · .xlsx · .xls');
  }

  /** เติมลิงก์ลงกล่อง: ใช้กล่องว่างก่อน · ข้ามลิงก์ที่มีอยู่แล้ว · ไม่เกิน MAX_LINKS */
  function fillLinkBoxes(links) {
    const have = {};
    linkInputs().forEach((i) => { if (i.value.trim()) have[i.value.trim()] = true; });
    const fresh = [];
    links.forEach((l) => { if (!have[l]) { have[l] = true; fresh.push(l); } });
    let added = 0, over = 0;
    fresh.forEach((l) => {
      const empty = linkInputs().find((i) => !i.value.trim());
      if (empty) { empty.value = l; added++; }
      else if (boxCount() < MAX_LINKS) { addLinkBox(l); added++; }
      else over++;
    });
    updateLinkCount();
    return { added: added, dup: links.length - fresh.length, over: over };
  }

  async function importFile(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast('ไฟล์ใหญ่เกิน 10MB', true);
    const btn = $('s-import');
    btn.disabled = true; btn.textContent = '⏳ กำลังอ่านไฟล์…';
    try {
      const links = await readLinksFromFile(file);
      if (!links.length) return toast('ไม่พบลิงก์ในไฟล์ "' + file.name + '"', true);
      const r = fillLinkBoxes(links);
      let msg = `📂 นำเข้า ${r.added} ลิงก์จาก "${file.name}"`;
      if (r.dup) msg += ` · ข้ามที่ซ้ำ ${r.dup}`;
      toast(msg);
      if (r.over) toast(`⚠️ เกิน ${MAX_LINKS} ลิงก์ — เหลืออีก ${r.over} ลิงก์ ส่งรอบนี้แล้วนำเข้าไฟล์เดิมอีกครั้ง (ลิงก์ที่ส่งแล้วจะถูกข้ามให้)`, true);
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; btn.textContent = '📂 นำเข้าจากไฟล์'; $('s-file').value = ''; }
  }

  /** ล้างฟอร์มส่ง Report ทั้งหมด (Mission · ผู้โพสต์ · ลิงก์ · หมายเหตุ · สรุปผล) */
  function resetSendForm() {
    $('s-mission').value = '';
    $('s-poster').value = '';
    $('s-note').value = '';
    $('s-result').innerHTML = '';
    setLinkBoxes();
    onMissionChange();
  }

  /** ล้างกล่องทั้งหมด แล้วใส่ลิงก์ที่ให้มา + เก็บกล่องรูปที่ระบุ hash ไว้ (ไม่มีอะไรเลย = กล่องลิงก์ว่าง 1 กล่อง) */
  function setLinkBoxes(links, keepImgHashes) {
    const keep = {};
    (keepImgHashes || []).forEach((h) => { keep[h] = true; });
    imgRows().forEach((r) => { if (!keep[r.dataset.hash]) { delete imgStore[r.dataset.hash]; r.remove(); } });
    Array.prototype.slice.call(document.querySelectorAll('#s-links .link-row:not(.img-row)')).forEach((r) => r.remove());
    (links || []).forEach((l) => addLinkBox(l));
    if (!boxCount()) addLinkBox('');
    updateLinkCount();
  }

  /** อ่านทุกกล่อง → ok (ลิงก์) / imgs (รูป) / bad / dup · ใส่เลขลำดับ + ทำเครื่องหมายกล่องที่มีปัญหา */
  function parseLinks() {
    const seen = {}, out = { ok: [], bad: [], dup: [], imgs: [] };
    Array.prototype.forEach.call($('s-links').children, (row, i) => { const n = row.querySelector('.n'); if (n) n.textContent = i + 1; });
    imgRows().forEach((r) => { const im = imgStore[r.dataset.hash]; if (im) out.imgs.push(im); });
    linkInputs().forEach((inp) => {
      const s = inp.value.trim();
      inp.classList.remove('is-bad', 'is-dup');
      if (!s) return;
      if (!/^https?:\/\/\S+$/i.test(s)) { out.bad.push(s); inp.classList.add('is-bad'); }
      else if (seen[s]) { out.dup.push(s); inp.classList.add('is-dup'); }
      else { seen[s] = true; out.ok.push(s); }
    });
    return out;
  }

  function updateLinkCount() {
    const p = parseLinks();
    const parts = [];
    if (p.ok.length) parts.push(`<span class="ok">✅ ลิงก์ถูกต้อง ${p.ok.length}</span>`);
    if (p.imgs.length) parts.push(`<span class="ok">🖼️ รูป ${p.imgs.length}</span>`);
    if (p.dup.length) parts.push(`<span class="warn">⚠️ ลิงก์ซ้ำ ${p.dup.length} (จะส่งครั้งเดียว)</span>`);
    if (p.bad.length) parts.push(`<span class="bad">❌ ไม่ใช่ลิงก์ ${p.bad.length}</span>`);
    const n = p.ok.length + p.imgs.length;
    if (n > MAX_LINKS) parts.push(`<span class="bad">เกิน ${MAX_LINKS} รายการ</span>`);
    $('s-count').innerHTML = parts.join(' · ');
    $('s-btn').textContent = n > 1 ? `ส่ง Report (${n} รายการ)` : 'ส่ง Report';
  }

  function renderSendResult(r) {
    const acc = r.accepted || [], sk = r.skipped || [];
    const rem = r.remaining == null ? '' : ` · เดือนนี้ส่งได้อีก ${r.remaining} ครั้ง`;
    $('s-result').innerHTML = `<div class="result ${sk.length ? 'mixed' : 'good'}">
      <b>${acc.length ? `✅ ส่งสำเร็จ ${acc.length} รายการ — รอทีมงานตรวจ` : '❌ ไม่มีรายการที่ส่งได้'}</b>${rem}
      ${sk.length ? `<div class="note">ข้าม ${sk.length} รายการ (ยังอยู่ในกล่องด้านบน แก้แล้วส่งใหม่ได้):</div><ul>${sk.map((x) => `<li><span class="muted">${esc(x.link)}</span> — ${esc(x.reason)}</li>`).join('')}</ul>` : ''}
      ${acc.length ? '<a href="#" id="go-hist">ดูในประวัติ →</a>' : ''}</div>`;
    const go = $('go-hist');
    if (go) go.onclick = (ev) => { ev.preventDefault(); switchPage('hist'); };
    if (acc.length) toast(`ส่ง Report ${acc.length} รายการเรียบร้อย`);
  }

  // ---------- history ----------
  async function loadHist(silent) {
    try {
      const rows = await api('history', { year: Number($('h-year').value), month: Number($('h-month').value) });
      $('h-body').innerHTML = rows.length ? rows.map((r) => `<tr>
        <td>${fmtDate(r.createdAt)}</td>
        <td>${esc(r.mission)}${r.poster ? `<div class="note muted">${esc(r.poster)}</div>` : ''}</td>
        <td>${r.kind === 'image' ? '<span class="muted" title="รูปเก็บส่วนตัว ทีมงานเท่านั้นที่เปิดได้">🖼️ รูปหลักฐาน</span>' : `<a href="${esc(safeUrl(r.link))}" target="_blank" rel="noopener">เปิดลิงก์</a>`}</td>
        <td><span class="pill ${esc(r.status)}">${STATUS_TH[r.status] || esc(r.status)}</span>${r.reason ? `<div class="note muted">${esc(r.reason)}</div>` : ''}${r.status === 'rejected' ? `<div><button type="button" class="link-btn resend" data-m="${esc(r.missionId)}" data-l="${r.kind === 'image' ? '' : esc(r.link)}" data-ym="${esc(r.ym)}">↻ แก้แล้วส่งใหม่</button></div>` : ''}</td>
        <td class="r">${r.status === 'approved' ? '<b>+' + fmtNum(r.approvedPoints) + '</b>' : '<span class="muted">—</span>'}</td></tr>`).join('')
        : '<tr><td colspan="5" class="empty">ยังไม่มี Report ในเดือนนี้ — <a href="#" id="go-send">ส่ง Report แรก</a></td></tr>';
      const go = $('go-send');
      if (go) go.onclick = (ev) => { ev.preventDefault(); switchPage('send'); };
      $('h-body').querySelectorAll('.resend').forEach((b) => { b.onclick = () => resendFrom(b.dataset); });
    } catch (err) { if (!silent) toast(err.message, true); }
  }

  /**
   * "แก้แล้วส่งใหม่": เปิดหน้าส่งพร้อมเลือก Mission เดิม + ลิงก์เดิม (แก้ได้) · รูปต้องแคปใหม่
   * Report ของเดือนที่ปิดรอบแล้วส่งเข้าเดือนนี้ไม่ได้ → แจ้งแทน
   */
  function resendFrom(ds) {
    const n = new Date(), ymNow = n.getFullYear() + '-' + ('0' + (n.getMonth() + 1)).slice(-2);
    if (ds.ym && ds.ym !== ymNow) return toast('Report เดือนที่ปิดรอบแล้ว ส่งใหม่ไม่ได้ — ส่งเป็นงานของเดือนนี้แทน', true);
    switchPage('send');
    resetSendForm();
    const opt = Array.prototype.find.call($('s-mission').options, (o) => o.value === ds.m);
    if (!opt) toast('Mission นี้ไม่เปิดให้ส่งในเดือนนี้แล้ว', true);
    else if (opt.disabled) toast('Mission นี้ส่งครบจำนวนของเดือนนี้แล้ว', true);
    else { $('s-mission').value = ds.m; onMissionChange(); }
    if (ds.l) setLinkBoxes([ds.l]);
    toast(ds.l ? 'แก้ลิงก์ (หรือโพสต์ใหม่) แล้วกดส่งได้เลย' : 'เพิ่มรูปที่แคปใหม่ แล้วกดส่งได้เลย');
  }

  // ---------- theme ----------
  function applyTheme(t) {
    document.documentElement.classList.toggle('dark', t === 'dark');
    $('b-theme').querySelector('em').textContent = t === 'dark' ? '☀️' : '🌙';
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
      if (m.maxScope === 'poster' && !b.poster) throw new Error('Mission นี้ต้องระบุชื่อ Facebook ผู้โพสต์');
      const accepted = [], skipped = [];
      b.links.forEach((link) => {
        if (this.reports.some((x) => x.link === link)) return skipped.push({ link, reason: 'ลิงก์นี้ส่งไปแล้วในเดือนนี้' });
        this.reports.unshift({ id: 'R' + Date.now(), createdAt: new Date().toISOString(), missionId: m.id, mission: m.name, poster: b.poster, link, status: 'pending', approvedPoints: null, reason: '' });
        accepted.push({ link, reportId: 'demo' });
      });
      return { accepted, skipped, remaining: m.maxPerMonth ? Math.max(0, m.maxPerMonth - accepted.length) : null };
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
    setLinkBoxes();
    $('s-add').onclick = () => addLinkBox('', true);
    $('s-import').onclick = () => $('s-file').click();
    $('s-file').addEventListener('change', () => importFile($('s-file').files[0]));
    const drop = $('s-links');
    ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (ev) => { ev.preventDefault(); drop.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('drag')));
    // ลากมาวาง: รูป → กล่องรูป · ไฟล์อื่น → อ่านลิงก์ในไฟล์
    drop.addEventListener('drop', (ev) => {
      ev.preventDefault();
      const files = Array.prototype.slice.call(ev.dataTransfer.files || []);
      addImages(files.filter((f) => /^image\//.test(f.type)));
      files.filter((f) => !/^image\//.test(f.type)).forEach((f) => importFile(f));
    });
    $('s-addimg').onclick = () => $('s-img').click();
    $('s-img').addEventListener('change', () => addImages($('s-img').files));
    // แคปหน้าจอแล้วกด Ctrl+V ที่ไหนก็ได้ในหน้าส่ง Report → เพิ่มเป็นกล่องรูป
    document.addEventListener('paste', (ev) => {
      const page = document.querySelector('.page.on');
      if (!page || page.id !== 'p-send') return;
      const files = Array.prototype.slice.call((ev.clipboardData && ev.clipboardData.files) || []).filter((f) => /^image\//.test(f.type));
      if (!files.length) return;
      ev.preventDefault();
      addImages(files.map((f, i) => (f.name && f.name !== 'image.png') ? f : new File([f], `แคปหน้าจอ_${new Date().toISOString().slice(11, 19).replace(/:/g, '')}_${i + 1}.png`, { type: f.type })));
    });
    ['s-mission', 's-poster', 's-note'].forEach((id) => { const x = $(id); if (x) x.addEventListener('focus', warmUp); });
    $('p-cancel').onclick = () => enterApp();
    $('b-pass').onclick = () => openPass(false);
    $('b-out').onclick = () => { if (confirm('ออกจากระบบใช่ไหม?' + (store.get('rgs_token') ? '\n(เครื่องนี้จะไม่จำการเข้าสู่ระบบแล้ว)' : ''))) logout(false); };
    // ช่องรหัสผ่าน: ปุ่ม 👁️ แสดง/ซ่อน + เตือนเมื่อเปิด Caps Lock
    document.querySelectorAll('input[type=password]').forEach((inp) => {
      const wrap = document.createElement('div');
      wrap.className = 'pw';
      inp.parentNode.insertBefore(wrap, inp);
      wrap.appendChild(inp);
      const eye = document.createElement('button');
      eye.type = 'button'; eye.className = 'icon eye'; eye.textContent = '👁️';
      eye.setAttribute('aria-label', 'แสดงรหัสผ่าน'); eye.title = 'แสดง/ซ่อนรหัสผ่าน';
      eye.onclick = () => {
        const show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        eye.textContent = show ? '🙈' : '👁️';
        eye.setAttribute('aria-label', show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน');
        inp.focus();
      };
      wrap.appendChild(eye);
      const caps = document.createElement('div');
      caps.className = 'note caps'; caps.hidden = true; caps.textContent = '⇪ Caps Lock เปิดอยู่';
      wrap.after(caps);
      const check = (ev) => { if (ev.getModifierState) caps.hidden = !ev.getModifierState('CapsLock'); };
      inp.addEventListener('keydown', check); inp.addEventListener('keyup', check);
      inp.addEventListener('blur', () => { caps.hidden = true; });
    });
    // ฟอร์มถูก reset → กลับเป็นซ่อนรหัส
    ['f-login', 'f-pass'].forEach((id) => $(id).addEventListener('reset', () => {
      $(id).querySelectorAll('.pw input').forEach((i) => { i.type = 'password'; });
      $(id).querySelectorAll('.pw .eye').forEach((b) => { b.textContent = '👁️'; });
    }));
    // วิธีใช้งาน: ปุ่ม ❓ / ลิงก์ในหน้า Login · ปิดด้วย ✕ · คลิกนอกกล่อง · Esc
    const help = $('help');
    const closeHelp = () => { help.hidden = true; };
    document.querySelectorAll('.open-help').forEach((b) => b.addEventListener('click', (ev) => { ev.preventDefault(); help.hidden = false; $('help-x').focus(); }));
    $('help-x').onclick = closeHelp;
    help.addEventListener('click', (ev) => { if (ev.target === help) closeHelp(); });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !help.hidden) closeHelp(); });
    $('b-theme').onclick = () => {
      const t = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
      store.set('rgs_theme', t); applyTheme(t);
    };
    document.querySelectorAll('.tab').forEach((t) => (t.onclick = () => switchPage(t.dataset.p)));
    ['d-year', 'd-month'].forEach((id) => $(id).addEventListener('change', () => { lockFutureMonths('d'); loadDash(); }));
    ['h-year', 'h-month'].forEach((id) => $(id).addEventListener('change', () => { lockFutureMonths('h'); loadHist(); }));

    const savedEmail = store.get('rgs_email');
    if (savedEmail) $('l-email').value = savedEmail;
    const saved = tokenStore.get();
    if (saved && !DEMO) {
      state.token = saved;
      // เปิดหน้าแอปทันทีพร้อมสถานะโหลด แล้ว bootstrap ครั้งเดียว (ถ้ารหัสต้องเปลี่ยน/หมดอายุ api() พาไปหน้าที่ถูกเอง)
      enterApp().then(() => { if (!state.guild) show('v-login'); });
    } else {
      show('v-login');
    }
  }

  init();
})();
