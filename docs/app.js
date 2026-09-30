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
    try {
      const b = DEMO
        ? { guild: state.guild, missions: await api('missions'), dashboard: await api('dashboard', { year: now.getFullYear(), month: now.getMonth() + 1 }) }
        : await api('bootstrap', { year: now.getFullYear(), month: now.getMonth() + 1 });
      state.guild = b.guild;
      showGuild(b.guild);
      renderMissions(b.missions);
      renderDash(b.dashboard);
      startRefresh();
    } catch (err) { toast(err.message, true); }
    finally { setDashLoading(false); }
  }

  /** สถานะกำลังโหลดของหน้าคะแนน (ตัวเลขกระพริบแทนขีด) */
  function setDashLoading(on) {
    $('p-dash').classList.toggle('loading', on);
    if (on) {
      ['k-month', 'k-year', 'k-pend', 'k-rej'].forEach((id) => { if ($(id).textContent === '–') $(id).textContent = '···'; });
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
      renderMissions(await api('missions', { year: now.getFullYear(), month: now.getMonth() + 1 }));
    } catch (err) { toast(err.message, true); }
  }

  function renderMissions(list) {
      const now = new Date();
      state.missions = list;
      $('s-sub').textContent = state.guild.nameTH + ' · ' + state.guild.gameName + ' · เดือน ' + MONTHS[now.getMonth()] + ' ' + (now.getFullYear() + 543);
      const groups = { basic: 'Mission พื้นฐาน', feedback: 'Feedback', extra: '⭐ Mission เพิ่มเติม' };
      const cur = $('s-mission').value;
      $('s-mission').innerHTML = '<option value="">— เลือก Mission —</option>' + Object.keys(groups).map((k) => {
        const ms = state.missions.filter((m) => (m.group || 'basic') === k);
        return ms.length ? `<optgroup label="${groups[k]}">${ms.map((m) => `<option value="${esc(m.id)}">${esc(m.name)} — ${m.points} คะแนน</option>`).join('')}</optgroup>` : '';
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
    if (!p.ok.length) return toast('กรุณาใส่ลิงก์หลักฐานที่ขึ้นต้นด้วย http:// หรือ https:// อย่างน้อย 1 ลิงก์', true);
    if (p.ok.length > MAX_LINKS) return toast('ส่งได้ครั้งละไม่เกิน ' + MAX_LINKS + ' ลิงก์', true);
    btn.disabled = true; state.busy = true;
    btn.textContent = p.ok.length > 1 ? `กำลังส่ง ${p.ok.length} ลิงก์…` : 'กำลังส่ง…';
    const slow = setTimeout(() => { btn.textContent = 'กำลังบันทึก… อาจใช้เวลาสักครู่ อย่าเพิ่งปิดหน้านี้'; }, 3000);
    try {
      let r;
      try {
        r = await api('submit', { missionId: $('s-mission').value, links: p.ok, poster: $('s-poster').value.trim(), note: $('s-note').value.trim() });
      } catch (err) {
        if (!err.uncertain) throw err;
        btn.textContent = 'กำลังตรวจสอบว่าบันทึกแล้วหรือยัง…';
        r = await verifySubmitted(p.ok);
      }
      const leftover = (r.skipped || []).map((x) => x.link).concat(p.bad);
      if (!leftover.length && (r.accepted || []).length) {
        // ส่งครบทุกลิงก์ → ล้างฟอร์ม แล้วกลับหน้าคะแนน (โหลดใหม่ให้เห็นรายการรอตรวจ)
        resetSendForm();
        toast(`✅ ส่ง Report ${r.accepted.length} ลิงก์เรียบร้อย — รอทีมงานตรวจ`);
        switchPage('dash');
        return;
      }
      // มีลิงก์ค้าง → อยู่หน้าเดิม โชว์สรุป + เหลือเฉพาะกล่องที่ต้องแก้
      renderSendResult(r);
      setLinkBoxes(leftover);
    } catch (err) { toast(err.message, true); }
    finally { clearTimeout(slow); btn.disabled = false; state.busy = false; updateLinkCount(); }
  }

  /**
   * ผลส่งไม่ชัดเจน (Google ตอบผิดรูป/เน็ตหลุดระหว่างรอ) → ดูประวัติเดือนนี้ว่าลิงก์ไหนเข้าแล้ว
   * ไม่ส่งซ้ำเอง เพราะอาจบันทึกไปแล้ว
   */
  async function verifySubmitted(links) {
    const now = new Date();
    await new Promise((ok) => setTimeout(ok, 1500));
    const rows = await api('history', { year: now.getFullYear(), month: now.getMonth() + 1 });
    const saved = {};
    rows.forEach((x) => { if (x.status !== 'rejected') saved[String(x.link).trim()] = true; });
    const accepted = [], skipped = [];
    links.forEach((l) => saved[l] ? accepted.push({ link: l }) : skipped.push({ link: l, reason: 'ยังไม่ได้บันทึก (ระบบตอบช้า) — กดส่งอีกครั้ง' }));
    return { accepted: accepted, skipped: skipped, remaining: null };
  }

  // ---------- หลายลิงก์ ----------
  const MAX_LINKS = 50;

  const linkInputs = () => Array.prototype.slice.call(document.querySelectorAll('#s-links input'));

  /** เพิ่มกล่องลิงก์ 1 กล่อง (ค่าเริ่มต้นได้) */
  function addLinkBox(value, focus) {
    if (linkInputs().length >= MAX_LINKS) return toast('ส่งได้ครั้งละไม่เกิน ' + MAX_LINKS + ' ลิงก์', true);
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
      else if (linkInputs().length < MAX_LINKS) { addLinkBox(l); added++; }
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

  /** ล้างกล่องทั้งหมด แล้วใส่ลิงก์ที่ให้มา (ไม่มี = กล่องว่าง 1 กล่อง) */
  function setLinkBoxes(links) {
    $('s-links').innerHTML = '';
    (links && links.length ? links : ['']).forEach((l) => addLinkBox(l));
  }

  /** อ่านทุกกล่อง → ok / bad / dup · ทำเครื่องหมายกล่องที่มีปัญหา */
  function parseLinks() {
    const seen = {}, out = { ok: [], bad: [], dup: [] };
    linkInputs().forEach((inp, i) => {
      const s = inp.value.trim();
      inp.parentNode.querySelector('.n').textContent = i + 1;
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
    if (p.dup.length) parts.push(`<span class="warn">⚠️ ลิงก์ซ้ำ ${p.dup.length} (จะส่งครั้งเดียว)</span>`);
    if (p.bad.length) parts.push(`<span class="bad">❌ ไม่ใช่ลิงก์ ${p.bad.length}</span>`);
    if (p.ok.length > MAX_LINKS) parts.push(`<span class="bad">เกิน ${MAX_LINKS} ลิงก์</span>`);
    $('s-count').innerHTML = parts.join(' · ');
    $('s-btn').textContent = p.ok.length > 1 ? `ส่ง Report (${p.ok.length} ลิงก์)` : 'ส่ง Report';
  }

  function renderSendResult(r) {
    const acc = r.accepted || [], sk = r.skipped || [];
    const rem = r.remaining == null ? '' : ` · เดือนนี้ส่งได้อีก ${r.remaining} ครั้ง`;
    $('s-result').innerHTML = `<div class="result ${sk.length ? 'mixed' : 'good'}">
      <b>${acc.length ? `✅ ส่งสำเร็จ ${acc.length} ลิงก์ — รอทีมงานตรวจ` : '❌ ไม่มีลิงก์ที่ส่งได้'}</b>${rem}
      ${sk.length ? `<div class="note">ข้าม ${sk.length} ลิงก์ (ยังอยู่ในกล่องด้านบน แก้แล้วส่งใหม่ได้):</div><ul>${sk.map((x) => `<li><span class="muted">${esc(x.link)}</span> — ${esc(x.reason)}</li>`).join('')}</ul>` : ''}
      ${acc.length ? '<a href="#" id="go-hist">ดูในประวัติ →</a>' : ''}</div>`;
    const go = $('go-hist');
    if (go) go.onclick = (ev) => { ev.preventDefault(); switchPage('hist'); };
    if (acc.length) toast(`ส่ง Report ${acc.length} ลิงก์เรียบร้อย`);
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
    drop.addEventListener('drop', (ev) => { ev.preventDefault(); importFile(ev.dataTransfer.files[0]); });
    ['s-mission', 's-poster', 's-note'].forEach((id) => { const x = $(id); if (x) x.addEventListener('focus', warmUp); });
    $('p-cancel').onclick = () => enterApp();
    $('b-pass').onclick = () => openPass(false);
    $('b-out').onclick = () => logout(false);
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
    ['d-year', 'd-month'].forEach((id) => $(id).addEventListener('change', () => loadDash()));
    ['h-year', 'h-month'].forEach((id) => $(id).addEventListener('change', () => loadHist()));

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
