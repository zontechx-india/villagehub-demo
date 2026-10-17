/* VillageHub prototype — shared core state, persistence, memberships, notifications and audit.
 * Data separation (spec §9): `services` holds shared service-instance metadata only; every module keeps its
 * own records under `mod[moduleKey][serviceId]`. The core never reads module records directly. */

const STORE_KEY = 'villagehub_proto_v1';
const STATE_VERSION = 3;

function freshState() {
  return {
    v: STATE_VERSION,
    ob: { authed: false, notifAsked: false, notifGranted: false },
    user: { id: 'me', name: '', phone: '', color: 'var(--secondary)', photo: null },
    services: [],     // { id, type, name, status, code, createdBy, createdAt, place }
    memberships: [],  // { svcId, role, status: 'active'|'pending'|'removed', joinedAt }
    mod: {},          // module-specific records keyed by module, then service id
    notifications: [],
    audit: [],        // append-only: { id, svcId, actor, action, entity, before, after, reason, at }
    settings: { nAuction: true, nPayment: true, nCollection: true, nSms: true, lockPrivacy: true, lang: 'English' },
    sim: { offline: false, noBids: false, payoutFail: false, upiFail: false },
    seq: 1000
  };
}

const Store = {
  state: null,
  load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const st = raw ? JSON.parse(raw) : null;
      this.state = st && st.v === STATE_VERSION ? st : freshState();
    } catch (e) { this.state = freshState(); }
  },
  save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.state)); }
    catch (e) { if (window.UI) UI.toast('Browser storage is full. Start over from the control panel.', 'err'); }
  },
  set(fn) { fn(this.state); this.save(); App.refresh(); }
};
const S = () => Store.state;

/* ---------- Lookups ---------- */
const svcById = id => S().services.find(s => s.id === id);
const membership = id => S().memberships.find(m => m.svcId === id && m.status === 'active');
const myRole = id => { const m = membership(id); return m ? m.role : null; };
const modData = (type, id) => ((S().mod[type] || {})[id]);
const mySvcs = () => S().services.filter(s => membership(s.id));
const nextSeq = () => ++S().seq;
const actorName = a => a === 'me' ? 'You' : a === 'system' ? 'VillageHub (server)' : a;

/* ---------- Core actions ---------- */
const Act = {
  commit() { Store.save(); App.refresh(); },

  // Append-only audit entry. Financial changes never overwrite: they add a correction/reversal and an entry here.
  audit(svcId, action, entity, o = {}) {
    S().audit.unshift({ id: uid('a'), svcId, actor: o.actor || 'me', action, entity, before: o.before || null, after: o.after || null, reason: o.reason || '', at: o.at || nowISO() });
  },

  // In-app notification. The lock-screen text hides amounts by default (spec §5.5); `amount` text is only shown in-app.
  notify(svcId, title, text, link, o = {}) {
    const st = S();
    const pref = o.kind && st.settings[o.kind] === false;
    st.notifications.unshift({ id: uid('n'), svcId, title, text, link: link || null, at: o.at || nowISO(), read: !!o.read, kind: o.kind || '' });
    if (!pref && !o.silent && App.top() && !o.at) Push.show(title, st.settings.lockPrivacy && o.private ? (o.lockText || 'Open VillageHub to view details') : text, link);
  },

  newService(type, name, o = {}) {
    const st = S();
    const id = uid('s');
    const code = (o.codePrefix || type.toUpperCase().slice(0, 3)) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    st.services.unshift({ id, type, name, status: o.status || 'draft', code, createdBy: 'me', createdAt: nowISO(), place: o.place || '' });
    st.memberships.push({ svcId: id, role: o.role || 'admin', status: 'active', joinedAt: nowISO() });
    return id;
  },
  setStatus(svcId, status, reason) {
    const s = svcById(svcId), before = s.status;
    if (!Reg.can(svcId, 'service.manage')) return Act.denied();
    s.status = status;
    Act.audit(svcId, `Service ${status}`, 'service', { before: { status: before }, after: { status }, reason });
    Act.commit();
  },
  denied(what) {
    UI.toast(`You don't have permission to ${what || 'do that'} in this service`, 'err');
    return false;
  },

  // Join flow: a code finds a service; the organiser approves the request (mocked a few seconds later).
  join(code) {
    const st = S();
    const s = st.services.find(x => x.code.toUpperCase() === code.trim().toUpperCase());
    if (!s) return 'No service found for that code. Check the code with the organiser.';
    const m = st.memberships.find(x => x.svcId === s.id);
    if (m && m.status === 'active') return 'You are already part of this service.';
    if (m && m.status === 'pending') return 'Your request is already waiting for the organiser.';
    st.memberships.push({ svcId: s.id, role: Reg.get(s.type).joinRole || 'member', status: 'pending', joinedAt: nowISO() });
    Act.audit(s.id, 'Join request sent', 'membership', { after: { code: s.code } });
    Store.save();
    setTimeout(() => {
      const mm = S().memberships.find(x => x.svcId === s.id && x.status === 'pending');
      if (!mm) return;
      mm.status = 'active'; mm.joinedAt = nowISO();
      const mod = Reg.get(s.type);
      if (mod.onJoined) mod.onJoined(s.id);
      Act.audit(s.id, 'Join request approved', 'membership', { actor: 'Organiser' });
      Act.notify(s.id, 'Request approved', `You are now a member of ${s.name}. Review and accept the scheme rules.`, { s: mod.home, p: { id: s.id } });
      Act.commit();
    }, 5000);
    return '';
  }
};

/* ---------- Simulated push banner (top of the phone) ---------- */
const Push = {
  show(title, text, link) {
    const el = document.getElementById('push'); if (!el) return;
    Push._link = link;
    el.innerHTML = `<span class="push-ic">${brandMark(22)}</span><span class="grow"><b>${esc(title)}</b><span>${esc(text)}</span></span><span class="tiny muted">now</span>`;
    I18n.apply(el);
    el.className = 'push show';
    clearTimeout(Push._t);
    Push._t = setTimeout(() => { el.className = 'push'; }, 4200);
  },
  open() {
    const el = document.getElementById('push'); el.className = 'push';
    const l = Push._link; if (l) App.go(l.s, Object.assign({}, l.p));
  }
};

/* ---------- Dashboard aggregation through the registry (core never reads module data) ---------- */
const Dash = {
  _collect(fn) {
    return mySvcs().filter(s => s.status !== 'draft').flatMap(s => {
      const m = Reg.get(s.type);
      return m && m[fn] ? m[fn](s, myRole(s.id)).map(x => Object.assign({ svc: s }, x)) : [];
    });
  },
  pending() { return this._collect('pending'); },
  events() { return this._collect('events').filter(e => toDate(e.at).getTime() > Date.now() - 3600000).sort((a, b) => a.at.localeCompare(b.at)); }
};
