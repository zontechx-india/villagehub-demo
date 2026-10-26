/* Boot, demo data and the prototype control panel (outside the phone frame). */

// Full demo: a signed-in organiser with every module and role populated by the modules' own seeders.
function demoState() {
  const st = freshState();
  st.ob = { authed: true, notifAsked: true, notifGranted: true };
  st.user = { id: 'me', name: 'Arun Kumar', phone: '9876543210', color: 'var(--secondary)', photo: null };
  Store.state = st;
  Reg.list().filter(m => m.seed).forEach(m => m.seed(st));
  const ago = h => new Date(Date.now() - h * 3600000).toISOString();
  const N = (svcId, title, text, link, h, read) => st.notifications.push({ id: uid('n'), svcId, title, text, link, at: ago(h), read: !!read, kind: '' });
  const g1 = st.mod.chit.s_chit1, r6 = g1.rounds[5];
  N('s_chit1', `Round 6 auction ${fmt.when(r6.auctionAt).split(',')[0].toLowerCase()}`, `${fmt.time(r6.auctionAt)} · ${Chit.active(g1).filter(m => Chit.eligibility(g1, m.id, 6).ok).length} of 20 members eligible to bid`, { s: 'chitAuction', p: { id: 's_chit1', n: 6 } }, 2);
  N('s_chit1', 'Cash recorded by agent', 'M020 · round 5 · waiting for your verification', { s: 'chitHome', p: { id: 's_chit1', tab: 'payments' } }, 5);
  N('s_tem1', 'Family reported a discrepancy', 'Thangavel family says a cash payment is missing', { s: 'templeDisputes', p: { id: 's_tem1' } }, 20);
  N('s_chit2', 'Round 3 contribution due', 'Open VillageHub to view the amount', { s: 'chitMember', p: { id: 's_chit2', mid: 'm7' } }, 26);
  N('s_tem2', 'Families assigned to you', '6 families in Pudhu Colony for the Kumbabishekam Fund', { s: 'templeHome', p: { id: 's_tem2', tab: 'families' } }, 72, true);
  N('s_chit2', 'Round 2 payout paid', 'Transferred to SBI ····4821', { s: 'chitRound', p: { id: 's_chit2', n: 2 } }, 24 * 40, true);
  N('s_tem3', 'Receipt SPK-AN-0089', 'Annadhanam · thank you', { s: 'templeHome', p: { id: 's_tem3' } }, 24 * 30, true);
  st.notifications.sort((a, b) => b.at.localeCompare(a.at));
  const A = (svcId, action, entity, o, h) => st.audit.push(Object.assign({ id: uid('a'), svcId, actor: 'me', action, entity, before: null, after: null, reason: '', at: ago(h) }, o));
  A('s_chit1', 'Round 5 result finalised', 'auction_results', { after: { winner: 'M007', discount: '₹10,000', payout: '₹90,000', fee: '₹5,000', dividend: '₹250' } }, 24 * 28);
  A('s_chit1', 'Round 3 rescheduled', 'chit_rounds', { reason: 'Temple festival on the original date' }, 24 * 100);
  A('s_chit1', 'Scheme published (rules v1)', 'chit_rule_versions', { after: { pool: '₹1,00,000', members: 20, rounds: 20, fee: '5% of monthly gross pool' } }, 24 * 180);
  A('s_tem1', 'Receipt SMK-26-0032 voided', 'receipts', { before: { amount: '₹2,100' }, after: { status: 'VOID' }, reason: 'Wrong amount written (₹2,100 instead of ₹2,001)' }, 72);
  A('s_tem1', 'Cash handover · Selvi Arumugam', 'handovers', { after: { declared: '₹6,003', counted: '₹5,503', difference: '−₹500' }, reason: '₹500 short — Selvi to check with Arumugam family' }, 24);
  A('s_tem1', 'South Street reassigned to Selvi Arumugam', 'collector_assignments', { reason: 'Murugan covering North Street only this year' }, 24 * 30);
  A('s_chit2', 'Round 3 result finalised', 'auction_results', { actor: 'Lakshmi Raman', after: { winner: 'M003', discount: '₹36,000' } }, 24 * 26);
  st.audit.sort((a, b) => b.at.localeCompare(a.at));
  return st;
}

const Panel = {
  sync() {
    const t = App.top(), el = document.getElementById('panelScreen');
    if (el && t) el.textContent = t.name + (t.params.id ? ' · ' + t.params.id : '');
    [['simOffline', 'offline'], ['simNoBids', 'noBids'], ['simPayout', 'payoutFail'], ['simUpi', 'upiFail']].forEach(([id, k]) => { const c = document.getElementById(id); if (c) c.checked = !!S().sim[k]; });
  },
  ensureDemo() {
    if (!S().ob.authed || !S().user.name || !S().services.some(s => s.id === 's_chit1')) { Store.state = demoState(); Store.save(); }
  },
  jump(name, params) {
    UI.close(true);
    if (name === 'splash') { App.session = {}; return App.reset('splash'); }
    if (name === 'login') { S().ob.authed = false; Store.save(); return App.reset('login'); }
    Panel.ensureDemo();
    if (['home', 'services', 'activity', 'profile'].includes(name)) return App.reset(name);
    App.stack = [{ name: 'home', params: {} }];
    App.go(name, params || {});
  },
  loadDemo() { UI.close(true); Store.state = demoState(); Store.save(); BigText.apply(); App.session = {}; App.reset('home'); UI.toast('Demo data loaded', 'ok'); },
  newUser() { UI.close(true); Store.state = freshState(); Store.save(); BigText.apply(); App.session = {}; App.reset('splash'); },
  openAuction() {
    Panel.ensureDemo();
    const n = ChitClock.openNow('s_chit1');
    if (!n) return;
    App.stack = [{ name: 'home', params: {} }];
    App.go('chitAuction', { id: 's_chit1', n });
  },
  sim(k, v) {
    S().sim[k] = v; Store.save();
    if (k === 'offline') { App.refresh(); UI.toast(v ? 'Offline simulated — data screens show the error state' : 'Back online', v ? 'err' : 'ok'); }
  }
};

function tickClock() {
  const d = new Date(), el = document.getElementById('clock');
  if (el) el.textContent = `${d.getHours() % 12 || 12}:${pad2(d.getMinutes())}`;
}

(function boot() {
  Store.load();
  Platform.apply();
  I18n.sync();
  Theme.panel();
  ChromeStyle.apply(); ChromeStyle.panel();
  tickClock(); setInterval(tickClock, 30000);
  BigText.apply();
  ChitClock.start();
  App.reset('splash');
})();
