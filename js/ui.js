/* VillageHub prototype — formatting, platform, overlays and shared components.
 * Overlays, platform switching, chrome styles and most components are the ServiDEX-V2 implementations,
 * trimmed to what this app needs. Module-specific components live in each module's screens file. */

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TZ = 'Asia/Kolkata';
const toDate = v => v instanceof Date ? v : new Date(v.length === 10 ? v + 'T00:00:00+05:30' : v);
const pad2 = n => String(n).padStart(2, '0');
// Money is stored in paise. Whole rupees show no decimals; paise show two (₹1,052.63).
const rs = p => {
  const n = Number(p) || 0, neg = n < 0, a = Math.abs(n);
  return (neg ? '−' : '') + '₹' + (a / 100).toLocaleString('en-IN', { minimumFractionDigits: a % 100 ? 2 : 0, maximumFractionDigits: 2 });
};
const paise = rupees => Math.round((Number(String(rupees).replace(/[^\d.]/g, '')) || 0) * 100);

// Indian formats in Asia/Kolkata: 17 Oct 2026, 07:00 PM
const fmt = {
  date: v => toDate(v).toLocaleDateString(I18n.locale(), { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ }),
  day: v => toDate(v).toLocaleDateString(I18n.locale(), { weekday: 'short', day: '2-digit', month: 'short', timeZone: TZ }),
  dm: v => toDate(v).toLocaleDateString(I18n.locale(), { day: '2-digit', month: 'short', timeZone: TZ }),
  mon: v => toDate(v).toLocaleDateString(I18n.locale(), { month: 'short', year: 'numeric', timeZone: TZ }),
  time: v => toDate(v).toLocaleTimeString(I18n.locale(), { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: TZ }).toUpperCase(),
  dt: v => fmt.date(v) + ', ' + fmt.time(v),
  rel(v) {
    const m = (Date.now() - toDate(v).getTime()) / 60000;
    if (m < 0) return fmt.until(v);
    if (m < 1) return 'Just now';
    if (m < 60) return Math.floor(m) + ' min ago';
    if (m < 1440) return Math.floor(m / 60) + ' hr ago';
    if (m < 2880) return 'Yesterday';
    return fmt.date(v);
  },
  // "Today, 7:00 PM" / "Tomorrow, 7:00 PM" / "Tue, 20 Oct, 7:00 PM"
  when(v) {
    const d = istDay(v), t = istDay(new Date()), diff = Math.round((d - t) / 86400000);
    const lbl = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : fmt.day(v);
    return `${lbl}, ${fmt.time(v)}`;
  },
  until(v) {
    const s = Math.max(0, Math.round((toDate(v).getTime() - Date.now()) / 1000));
    if (s >= 86400) return `in ${Math.floor(s / 86400)} day${s >= 172800 ? 's' : ''}`;
    if (s >= 3600) return `in ${Math.floor(s / 3600)} hr ${Math.floor((s % 3600) / 60)} min`;
    return `in ${Math.floor(s / 60)} min`;
  },
  clock(sec) { sec = Math.max(0, Math.round(sec)); return `${pad2(Math.floor(sec / 60))}:${pad2(sec % 60)}`; },
  phone: p => p ? `+91 ${p.slice(0, 5)} ${p.slice(5)}` : '',
  masked: p => p ? `+91 ${p.slice(0, 2)}XXX XX${p.slice(7)}` : ''
};
// Midnight (IST) of a date, as a timestamp, for day comparisons.
function istDay(v) { const s = toDate(v).toLocaleDateString('en-CA', { timeZone: TZ }); return new Date(s + 'T00:00:00+05:30').getTime(); }
const istDate = v => toDate(v).toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD in IST
function istToday() { return new Date().toLocaleDateString('en-CA', { timeZone: TZ }); }
const nowISO = () => new Date().toISOString();
const uid = p => p + Math.random().toString(36).slice(2, 9);

/* ---------- Platform (iOS / Android look) — from ServiDEX ---------- */
const PLATFORM_KEY = 'villagehub_platform';
const Platform = {
  get os() {
    try { return localStorage.getItem(PLATFORM_KEY) || (/android/i.test(navigator.userAgent) ? 'android' : 'ios'); }
    catch (e) { return 'ios'; }
  },
  get android() { return this.os === 'android'; },
  set(os) {
    try { localStorage.setItem(PLATFORM_KEY, os); } catch (e) { /* ignore */ }
    this.apply();
    if (App.top()) App.refresh();
  },
  apply() {
    const and = this.android;
    document.documentElement.classList.toggle('android', and);
    const ic = document.getElementById('sbIcons');
    if (ic) ic.innerHTML = and
      ? `<svg width="15" height="12" viewBox="0 0 24 20"><path d="M12 19 0 5a17 17 0 0 1 24 0z" fill="currentColor"/></svg><svg width="13" height="13" viewBox="0 0 20 20"><path d="M20 0v20H0z" fill="currentColor"/></svg><span style="font-size:12px">85%</span><svg width="9" height="14" viewBox="0 0 10 16"><rect x="0" y="1.5" width="10" height="14.5" rx="1.5" fill="currentColor"/><rect x="3" y="0" width="4" height="2" fill="currentColor"/></svg>`
      : `<svg width="17" height="11" viewBox="0 0 17 11"><rect x="0" y="7" width="3" height="4" rx="1" fill="currentColor"/><rect x="4.5" y="5" width="3" height="6" rx="1" fill="currentColor"/><rect x="9" y="2.5" width="3" height="8.5" rx="1" fill="currentColor"/><rect x="13.5" y="0" width="3" height="11" rx="1" fill="currentColor"/></svg><svg width="24" height="11" viewBox="0 0 24 11"><rect x=".5" y=".5" width="20" height="10" rx="3" fill="none" stroke="currentColor" opacity=".45"/><rect x="2" y="2" width="15" height="7" rx="1.6" fill="currentColor"/><rect x="21.5" y="3.5" width="1.6" height="4" rx=".8" fill="currentColor" opacity=".5"/></svg>`;
    document.querySelectorAll('[data-os]').forEach(b => b.classList.toggle('on', b.dataset.os === this.os));
  }
};

/* ---------- Bottom navigation and bottom sheet design — from ServiDEX ---------- */
const CHROME_STYLES = {
  nav: { key: 'villagehub_nav_style', label: 'Bottom navigation', opts: [['standard', 'Standard'], ['glass', 'Floating glass'], ['liquid', 'Liquid glass']], cls: { glass: 'nav-float', liquid: 'nav-float nav-liquid' } },
  labels: { key: 'villagehub_nav_labels', label: 'Tab labels', opts: [['show', 'With labels'], ['hide', 'Icons only']], cls: { hide: 'nav-icons' } },
  sheet: { key: 'villagehub_sheet_style', label: 'Bottom sheets', opts: [['standard', 'Standard'], ['glass', 'Floating glass'], ['liquid', 'Liquid glass']], cls: { glass: 'sheet-float', liquid: 'sheet-float sheet-liquid' } }
};
const ChromeStyle = {
  get(k) { const d = CHROME_STYLES[k]; let v = null; try { v = localStorage.getItem(d.key); } catch (e) { /* ignore */ } return d.opts.some(([o]) => o === v) ? v : d.opts[0][0]; },
  set(k, v) { try { localStorage.setItem(CHROME_STYLES[k].key, v); } catch (e) { /* ignore */ } this.apply(); this.panel(); },
  apply() {
    const el = document.getElementById('phone'); if (!el) return;
    Object.entries(CHROME_STYLES).forEach(([k, d]) => {
      const all = new Set(Object.values(d.cls).join(' ').split(' ')), want = (d.cls[this.get(k)] || '').split(' ');
      all.forEach(c => el.classList.toggle(c, want.includes(c)));
    });
  },
  panel() {
    const el = document.getElementById('chromePanel'); if (!el) return;
    el.innerHTML = Object.entries(CHROME_STYLES).map(([k, d]) => `<div class="panel-sub">${d.label}</div><div class="panel-grid">${d.opts.map(([v, l]) => `<button class="${this.get(k) === v ? 'on' : ''}" onclick="ChromeStyle.set('${k}','${v}')">${l}</button>`).join('')}</div>`).join('');
  }
};

/* ---------- Accessibility: names for icon-only buttons and toggles — from ServiDEX ---------- */
const A11y = {
  NAMES: { back: 'Back', arrowLeft: 'Back', menu: 'Menu', bell: 'Notifications', search: 'Search', share: 'Share', x: 'Close', trash: 'Delete', phone: 'Call', help: 'Help', edit: 'Edit', chevron: 'Open', filter: 'Filters', plus: 'Add', refresh: 'Retry', more: 'More', copy: 'Copy', print: 'Print' },
  label(root) {
    if (!root) return;
    root.querySelectorAll('button:not([aria-label]), [role=button]:not([aria-label])').forEach(b => {
      if (b.textContent.trim()) return;
      if (b.classList.contains('switch')) {
        const host = b.closest('.li, .card, .opt');
        b.setAttribute('aria-label', host ? host.textContent.trim().replace(/\s+/g, ' ').slice(0, 60) : 'Toggle');
        return;
      }
      const svg = b.querySelector('svg[data-i]');
      if (svg) b.setAttribute('aria-label', I18n.t(A11y.NAMES[svg.dataset.i] || svg.dataset.i));
    });
  }
};

/* ---------- Network state (simulated) ---------- */
const Net = {
  block(app) {
    const c = app.querySelector('.content'); if (!c) return;
    c.innerHTML = C.error('Net.retry()');
    app.querySelectorAll('.footer').forEach(f => f.remove());
  },
  retry() {
    const c = document.querySelector('#app .content');
    if (c) c.innerHTML = '<div class="empty"><div class="spinner"></div><p class="mt12">Trying again…</p></div>';
    setTimeout(() => { App.refresh(); if (S().sim.offline) UI.toast('Still offline. Check your connection.', 'err'); }, 900);
  }
};

/* ---------- Overlays — from ServiDEX ---------- */
const UI = {
  _acts: [],
  _ct: null,
  _open(cls, html, update) {
    const o = document.getElementById('overlay');
    clearTimeout(UI._ct);
    if (update && o.classList.contains('open')) {
      const box = o.querySelector('.ov-box');
      if (box) { const top = box.scrollTop; box.innerHTML = html; box.scrollTop = top; I18n.apply(box); A11y.label(box); return; }
    }
    o.innerHTML = `${cls === 'switching' ? '' : '<div class="backdrop" onclick="UI.close()"></div>'}<div class="ov-box ${cls}">${html}</div>`;
    o.className = 'overlay open';
    I18n.apply(o);
    A11y.label(o);
  },
  sheet(html, update) { UI._open('sheet', '<div class="grab"></div>' + html, update); Motion.sheetDrag(document.querySelector('#overlay .ov-box.sheet')); },
  isOpen() { const o = document.getElementById('overlay'); return o && o.classList.contains('open'); },
  close(instant) {
    const o = document.getElementById('overlay');
    if (!o || !o.classList.contains('open')) return;
    if (instant) { o.className = 'overlay'; o.innerHTML = ''; return; }
    o.classList.add('closing');
    UI._ct = setTimeout(() => { o.className = 'overlay'; o.innerHTML = ''; }, 190);
  },
  dialog({ title, message, icon: ic, tone, actions, stack }) {
    UI._acts = actions;
    UI._open('dialog', `${ic ? `<div class="dlg-ic ${tone || ''}">${icon(ic, 26)}</div>` : ''}<h3>${title}</h3>${message ? `<p>${message}</p>` : ''}
      <div class="dlg-actions ${stack ? 'stack' : ''}">${actions.map((a, i) => `<button class="btn ${a.cls || 'btn-outline'}" onclick="UI._act(${i})">${a.label}</button>`).join('')}</div>`);
  },
  _act(i) { const a = UI._acts[i]; UI.close(true); if (a && a.fn) a.fn(); },
  confirm({ title, message, confirm = 'Confirm', cancel = 'Cancel', danger = false, icon: ic, onConfirm }) {
    UI.dialog({ title, message, icon: ic || (danger ? 'alert' : 'info'), tone: danger ? 'red' : '', actions: [{ label: cancel }, { label: confirm, cls: danger ? 'btn-danger' : 'btn-primary', fn: onConfirm }] });
  },
  // A confirm that requires a written reason (reschedules, voids, reversals, reassignments). Reasons go to the audit log.
  reason({ title, message, placeholder, confirm = 'Confirm', danger, presets = [], onConfirm }) {
    UI._rf = onConfirm;
    UI.sheet(`<div class="sheet-title">${title}</div>${message ? `<p class="xs muted mb12">${message}</p>` : ''}
      ${presets.length ? `<div class="chips wrap mb12">${presets.map(q => `<button class="chip" onclick="document.getElementById('rsn').value=this.textContent">${esc(q)}</button>`).join('')}</div>` : ''}
      <textarea id="rsn" class="textarea" placeholder="${placeholder || 'Reason (required, saved in the audit log)'}"></textarea>
      <div id="rsnErr"></div>
      <div class="row gap8 mt16"><button class="btn btn-outline grow" onclick="UI.close()">Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'} grow" onclick="UI._reasonOk()">${confirm}</button></div>`);
  },
  _reasonOk() {
    const v = (document.getElementById('rsn').value || '').trim();
    if (v.length < 4) { document.getElementById('rsnErr').innerHTML = `<div class="field-err">${icon('alert', 13)}Enter a reason of at least 4 characters</div>`; return; }
    UI.close(true); UI._rf(v);
  },
  osPrompt({ title, message, actions, ic }) {
    UI._acts = actions;
    if (Platform.android) {
      UI._open('os-and', `<div class="osa-ic">${icon(ic || 'info', 24)}</div><h3>${title}</h3>${message ? `<p>${message}</p>` : ''}
        ${actions.map((a, i) => `<button class="osa-btn" onclick="UI._act(${i})">${a.label}</button>`).join('')}<div class="os-tag">System dialog (simulated)</div>`);
      return;
    }
    UI._open('os', `<div class="os-body"><h3>${title}</h3><p>${message}</p><div class="os-tag">System dialog (simulated)</div></div>${actions.map((a, i) => `<button class="os-btn ${a.bold ? 'bold' : ''}" onclick="UI._act(${i})">${a.label}</button>`).join('')}`);
  },
  toast(msg, type) {
    const t = document.getElementById('toast');
    t.innerHTML = (type === 'ok' ? icon('check', 16) : type === 'err' ? icon('alert', 16) : '') + `<span>${esc(I18n.t(msg))}</span>`;
    t.className = 'toast show ' + (type || '');
    clearTimeout(UI._tt);
    UI._tt = setTimeout(() => { t.className = 'toast ' + (type || ''); }, 2800);
  },
  drawer() { UI._open('drawer', C.drawer()); },
  copy(text, label) {
    const done = () => UI.toast(`${label || 'Copied'}: ${text}`, 'ok');
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, done); else done();
  }
};

/* ---------- Components ---------- */
const AVATAR_COLORS = ['var(--secondary)', 'var(--info)', '#7C3AED', '#DB2777', '#EA580C', '#0F766E', '#B45309', 'var(--primary)'];
const colorFor = s => AVATAR_COLORS[[...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];

const C = {
  wordmark(light) { return `<div class="wordmark ${light ? 'light' : ''}">${brandMark(26)}<span data-raw>Village<b>Hub</b></span></div>`; },
  backIcon() { return icon(Platform.android ? 'arrowLeft' : 'back', 22); },
  appbar(title, o = {}) {
    const back = o.back === false ? '' : `<button class="iconbtn" onclick="${o.onBack || 'App.back()'}" aria-label="Back">${C.backIcon()}</button>`;
    return `<header class="appbar ${o.white ? 'white' : ''}">${back}<div class="appbar-title" ${o.back === false ? 'style="padding-left:8px"' : ''}><h2>${title}</h2>${o.sub ? `<div class="xs muted ellipsis">${o.sub}</div>` : ''}</div><div class="appbar-right">${o.right || ''}</div></header>`;
  },
  bell() {
    const n = S().notifications.filter(x => !x.read).length;
    return `<button class="iconbtn" onclick="App.tab('activity')" aria-label="Activity">${icon('bell', 22)}${n ? `<span class="count">${n > 9 ? '9+' : n}</span>` : ''}</button>`;
  },
  avatar(name, color, size = 40, photo) {
    if (photo) return `<span class="avatar" style="width:${size}px;height:${size}px;background:${color || 'var(--secondary)'};overflow:hidden"><img src="${photo}" alt="" style="width:100%;height:100%;object-fit:cover"></span>`;
    const words = (name || '?').split(' ').filter(w => /^[\p{L}]/u.test(w));
    const ini = (size < 26 ? words.slice(0, 1) : words.slice(0, 2)).map(w => w[0]).join('').toUpperCase() || '?';
    const fsz = size < 26 ? 11 : Math.round(size * .38);
    return `<span class="avatar" ${size < 26 ? 'aria-hidden="true"' : ''} style="width:${size}px;height:${size}px;background:${color || colorFor(name)};font-size:${fsz}px">${esc(ini)}</span>`;
  },
  userAvatar(size) { const u = S().user; return C.avatar(u.name, u.color, size, u.photo); },
  badge(t, tone) { return `<span class="badge ${tone || 'grey'}">${t}</span>`; },
  sample() { return '<span class="sample-tag">Sample data</span>'; },
  empty({ ic, title, text, cta, tone }) {
    return `<div class="empty"><div class="empty-ic ${tone || ''}">${icon(ic, 30)}</div><h3>${title}</h3><p>${text}</p>${cta || ''}</div>`;
  },
  error(retry) {
    return C.empty({ ic: 'alert', tone: 'red', title: "Couldn't load this page", text: "You seem to be offline or the network is slow. Nothing was saved twice — try again in a moment.", cta: `<button class="btn btn-primary btn-md" onclick="${retry}">${icon('refresh', 18)}Retry</button>` });
  },
  sec(title, action) { return `<div class="sec-head"><h3>${title}</h3>${action || ''}</div>`; },
  toggle(on, fn, disabled) {
    return `<button class="switch ${on ? 'on' : ''}" ${disabled ? 'disabled' : ''} onclick="event.stopPropagation();${fn}" role="switch" aria-checked="${on}"><i></i></button>`;
  },
  item(ic, label, fn, o = {}) {
    return `<button class="li ${o.danger ? 'danger' : ''}" onclick="${fn}"><span class="li-ic" ${o.icStyle ? `style="${o.icStyle}"` : ''}>${icon(ic, 18)}</span><span class="li-main"><span>${label}</span>${o.sub ? `<span class="xs muted">${o.sub}</span>` : ''}</span>${o.right != null ? `<span class="li-right">${o.right}</span>` : ''}${o.noChev ? '' : icon('chevron', 16, 'li-chev')}</button>`;
  },
  kv(ic, label, value) { return `<div class="kv">${icon(ic, 18)}<div class="grow"><div class="kv-l">${label}</div><div class="kv-v">${value}</div></div></div>`; },
  field(label, inner, o = {}) {
    return `<div class="field"><label class="label">${label}${o.req ? '<span class="req">*</span>' : ''}${o.opt ? '<span class="opt">Optional</span>' : ''}</label>${inner}${o.err ? `<div class="field-err">${icon('alert', 13)}${o.err}</div>` : o.hint ? `<div class="hint">${o.hint}</div>` : ''}</div>`;
  },
  progress(step, total, title) {
    return `<div class="progress"><div class="progress-meta"><b>${title}</b><span>Step ${step} of ${total}</span></div><div class="progress-bar"><i style="width:${(step / total) * 100}%"></i></div></div>`;
  },
  ltHeader(title, right, left) {
    return `<header class="appbar lt">${left || ''}<div class="appbar-title" style="padding-left:8px"><h2 class="lt-small">${title}</h2></div><div class="appbar-right">${right || ''}</div></header>`;
  },
  ltBig(title) { return `<h1 class="lt-big">${title}</h1>`; },
  // Segmented control with the sliding pill (Motion.segInd). `call` is a call prefix such as "App.set('tab',"; the value and ')' are appended.
  seg(key, opts, cur, fn) {
    const i = Math.max(0, opts.findIndex(o => o[0] === cur));
    return `<div class="seg has-ind">${Motion.segInd(key, i, opts.length)}${opts.map(([v, l, n]) => `<button class="${v === cur ? 'on' : ''}" onclick="${fn}'${v}')">${l}${n != null ? ` <span class="n">${n}</span>` : ''}</button>`).join('')}</div>`;
  },
  // Underlined tabs with the sliding indicator (Motion.tabLines).
  tabsLine(key, opts, cur, fn) {
    return `<div class="tabs-line has-ind" data-key="${key}">${opts.map(([v, l, n]) => `<button class="${v === cur ? 'on' : ''}" onclick="${fn}'${v}')">${l}${n ? ` <span class="n">${n}</span>` : ''}</button>`).join('')}<span class="tl-ind"></span></div>`;
  },
  banner(tone, ic, title, text, extra) {
    return `<div class="status-banner ${tone}"><div class="sb-ic">${icon(ic, 20)}</div><div class="grow"><h3>${title}</h3>${text ? `<p>${text}</p>` : ''}${extra || ''}</div></div>`;
  },
  rows(list, total) {
    return `<div class="rows">${list.map(([k, v, cls]) => `<div class="prow ${cls || ''}"><span>${k}</span><span>${v}</span></div>`).join('')}${total ? `<div class="prow total"><span>${total[0]}</span><span>${total[1]}</span></div>` : ''}</div>`;
  },
  stat(v, l, o = {}) { return `<${o.fn ? 'button' : 'div'} class="stat ${o.hl ? 'hl' : ''}" ${o.fn ? `onclick="${o.fn}"` : ''}><div class="v">${v}</div><div class="l">${l}</div></${o.fn ? 'button' : 'div'}>`; },
  bar(pct, tone) { return `<div class="meter"><i style="width:${Math.max(0, Math.min(100, pct))}%;${tone ? `background:var(--${tone})` : ''}"></i></div>`; },
  // Generic timeline from [{t, note, at, tone:'red'|'info'|'', todo}]
  timeline(items) {
    return `<ol class="tl">${items.map((e, i) => {
      const last = i === items.length - 1 || (items[i + 1] && items[i + 1].todo);
      const cls = e.todo ? 'todo' : e.tone === 'red' ? 'red' : e.tone === 'info' ? 'info' : '';
      const dot = e.todo ? '' : e.tone === 'info' ? icon('info', 13) : e.tone === 'red' ? icon('x', 12) : icon('check', 12);
      return `<li class="tl-i ${cls} ${last && !e.todo ? 'cur' : ''}"><span class="tl-dot">${dot}</span><div><div class="tl-t">${e.t}</div>${e.note ? `<div class="xs muted">${e.note}</div>` : ''}${e.at ? `<div class="tiny muted2 mt4">${fmt.dt(e.at)}</div>` : ''}</div></li>`;
    }).join('')}</ol>`;
  },
  // Module icon tile, coloured per module (or brand colour when "Brand icons" is chosen in the theme panel).
  modIc(type, size = 44, isz) {
    const m = Reg.get(type) || { icon: 'grid', tint: 'var(--line)', fg: 'var(--text)' };
    return `<span class="mod-ic" style="${catStyle(m)};width:${size}px;height:${size}px">${icon(m.icon, isz || Math.round(size * .5))}</span>`;
  },
  roleBadge(role, type) {
    const r = Reg.role(type, role);
    return C.badge(r ? r.label : role, r ? r.tone : 'grey');
  },
  statusBadge(status) {
    const m = { draft: ['Draft', 'grey'], active: ['Active', 'green'], paused: ['Paused', 'warn'], completed: ['Completed', 'blue'], cancelled: ['Cancelled', 'red'], pending: ['Request pending', 'warn'] }[status] || [status, 'grey'];
    return C.badge(m[0], m[1]);
  },

  tabbar(active) {
    const st = S();
    const pend = Dash.pending().length;
    const unread = st.notifications.filter(n => !n.read).length;
    // Tamil uses shorter tab labels so they fit under the icons.
    const L = (en, ta) => I18n.ta ? ta : en;
    const items = [['home', 'home', L('Home', 'முகப்பு'), pend], ['services', 'layers', L('My Services', 'சேவைகள்'), 0], ['create', 'plus', L('Create', 'புதிது'), 0], ['activity', 'bell', L('Activity', 'செயல்கள்'), unread], ['profile', 'user', L('Profile', 'சுயவிவரம்'), 0]];
    return `<nav class="tabbar">${items.map(([n, ic, l, c]) => n === 'create'
      ? `<button class="tab tab-create" onclick="App.go('create')" aria-label="Create new service"><span class="tab-ic">${icon('plus', 24)}</span><span class="tab-l">${l}</span></button>`
      : `<button class="tab ${n === active ? 'on' : ''} ${n === active && App.session.tabPop === n ? 'pop' : ''}" onclick="App.tab('${n}')" aria-label="${l}${c ? ', ' + c + ' new' : ''}" ${n === active ? 'aria-current="page"' : ''}><span class="tab-ic">${n === active ? icon(ic + 'F', 22, 'fill') : icon(ic, 22)}</span><span class="tab-l">${l}</span>${c ? `<span class="dot">${c > 9 ? '9+' : c}</span>` : ''}</button>`).join('')}</nav>`;
  },

  drawer() {
    const st = S(), u = st.user;
    const created = st.services.filter(s => myRole(s.id) === 'admin').length;
    const I = (ic, label, fn, o = {}) => `<button class="d-item ${o.cls || ''}" onclick="UI.close(true);${fn}">${icon(ic, 20)}<span>${label}</span>${o.tag ? `<span class="tag">${o.tag}</span>` : ''}</button>`;
    return `<div class="drawer-head">
        <div class="row gap12">${C.userAvatar(52)}<div class="grow"><div class="h3">${esc(u.name || 'Guest')}</div><div class="ph">${fmt.phone(u.phone)}</div></div></div>
        <div class="row gap8 mt12"><span class="mode-pill on-head">${created} created · ${st.services.length - created} joined</span></div>
      </div>
      <div class="drawer-body">
        <button class="mode-cta" onclick="UI.close(true);App.go('create')">
          <span class="mode-cta-ic">${icon('plus', 20)}</span>
          <span class="grow"><span class="mode-cta-t">Create a new service</span><span class="mode-cta-s">Chit group · temple collection</span></span>${icon('chevron', 18)}</button>
        ${I('home', 'Home', "App.tab('home')")}
        ${I('layers', 'My Services', "App.tab('services')")}
        ${I('link', 'Join with invite code', "App.go('join')")}
        ${I('bell', 'Activity & notifications', "App.tab('activity')", { tag: st.notifications.filter(n => !n.read).length || '' })}
        ${I('history', 'Audit history', "App.go('audit')")}
        <div class="d-sep"></div>
        ${I('help', 'Help & Support', "App.go('help')")}
        ${I('settings', 'Settings', "App.go('settings')")}
        ${I('file', 'Terms & Privacy', "App.go('terms')")}
        <div class="d-sep"></div>
        ${I('logout', 'Logout', 'Core.logout()', { cls: 'red' })}
      </div>
      <div class="drawer-foot">VillageHub v0.1 · Prototype build<br>Community services, run together.</div>`;
  }
};
