/* Chit Auction module — domain records, lifecycle rules, actions and the mock server.
 * Records live under S().mod.chit[serviceId] (module-owned, linked to the shared service instance).
 * Everything that would be server-side in production (bid acceptance, closing at the deadline, winner
 * selection, settlement, ledger postings, payment webhooks) is in `ChitServer` and clearly separated from
 * user actions in `Chit`. All money is integer paise; all calculations go through ChitEngine. */

const RP = r => Math.round(r * 100); // rupees → paise for seed/config values

const ROUND_ST = {
  SCHEDULED: { label: 'Scheduled', tone: 'blue', ic: 'calendar' },
  OPEN: { label: 'Live now', tone: 'red', ic: 'gavel' },
  CLOSED: { label: 'Closed', tone: 'grey', ic: 'lock' },
  RESULT_PENDING_APPROVAL: { label: 'Result pending approval', tone: 'warn', ic: 'clock' },
  FINALIZED: { label: 'Finalised', tone: 'teal', ic: 'check' },
  SETTLED: { label: 'Settled', tone: 'green', ic: 'shield' },
  POSTPONED: { label: 'Postponed', tone: 'warn', ic: 'calendar' },
  NO_VALID_BIDS: { label: 'No valid bids', tone: 'grey', ic: 'x' },
  CANCELLED: { label: 'Cancelled', tone: 'red', ic: 'x' },
  DISPUTED: { label: 'Disputed', tone: 'red', ic: 'flag' }
};
const PAYOUT_ST = {
  PENDING: { label: 'Payout pending', tone: 'warn' }, UNDER_REVIEW: { label: 'Under review', tone: 'warn' }, APPROVED: { label: 'Approved', tone: 'teal' },
  PROCESSING: { label: 'Processing', tone: 'blue' }, PAID: { label: 'Paid', tone: 'green' }, FAILED: { label: 'Failed', tone: 'red' },
  REJECTED: { label: 'Rejected', tone: 'red' }, CANCELLED: { label: 'Cancelled', tone: 'red' }, REVERSED: { label: 'Reversed', tone: 'red' }, DISPUTED: { label: 'Disputed', tone: 'red' }
};
const PAYOUT_PATH = ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING', 'PAID'];
const PAY_ST = {
  CONFIRMED: { label: 'Confirmed', tone: 'green' }, PENDING: { label: 'Pending', tone: 'warn' }, INITIATED: { label: 'Initiated', tone: 'warn' },
  RECORDED_PENDING_VERIFICATION: { label: 'Cash · to verify', tone: 'warn' }, FAILED: { label: 'Failed', tone: 'red' },
  REVERSED: { label: 'Reversed', tone: 'red' }, REFUNDED: { label: 'Refunded', tone: 'grey' }, DISPUTED: { label: 'Disputed', tone: 'red' }
};
const OBL_ST = { paid: ['Paid', 'green'], partial: ['Part paid', 'warn'], pending: ['Due', 'warn'], overdue: ['Overdue', 'red'], not_due: ['After auction', 'grey'], verifying: ['Verifying', 'blue'] };
const DEMO_WINDOW_S = 120; // demo auction window (published rule is usually 30 min)

const ChitData = {
  NAMES: ['Lakshmi Raman', 'Murugan K', 'Selvi Arumugam', 'Karthik Raja', 'Meena Sundaram', 'Pandian S', 'Revathi Kumar', 'Senthil Nathan', 'Kavitha Mani', 'Ganesan P', 'Valli Muthu', 'Saravanan R', 'Deepa Ramesh', 'Arul Prakash', 'Jothi Lingam', 'Bhuvana S', 'Rajendran V', 'Malar Vizhi', 'Ilango T', 'Anbu Selvan', 'Priya Devi', 'Muthu Kumar', 'Sangeetha R', 'Velu Swamy'],

  defaultRules() {
    const d = new Date(Date.now() + 30 * 86400000);
    return {
      chitType: 'auction', company: (S() && S().user.company) || '', photo: null, maxTickets: ChitEngine.MAX_TICKETS, turnOrder: 'order',
      name: '', desc: '', poolMeaning: 'monthly', poolP: RP(100000), members: 20, rounds: 20, contributionP: RP(5000), frequency: 'monthly',
      startDate: d.toLocaleDateString('en-CA', { timeZone: TZ }), auctionTime: '19:00', auctionMinutes: 30, dueDays: 5, visibility: 'invite',
      auctionType: 'live', preBid: false, minDiscountP: RP(5000), maxDiscountP: RP(40000), incrementP: RP(500), tieBreak: 'first_bid', noBid: 'postpone',
      extend: true, bidVisibility: 'all', eligibility: 'paid_up', winnerContinues: true, winOnce: true,
      feeBasis: 'pool_pct', feeBps: 500, feeFixedP: RP(5000), feeTiming: 'every', feeRounds: [], feeSource: 'discount',
      dividendTo: 'all', remainder: 'first_members', creditDividend: true, cashVerify: true, lateFeeP: 0
    };
  },

  // A fresh group record for a service instance.
  group(rules, code) {
    return { code, rules, ruleVersions: [], members: [], rounds: [], payments: [], ledger: [], disputes: [], seqR: 100 };
  },

  addMember(g, name, phone, o = {}) {
    const n = g.members.length + 1;
    const m = { id: 'm' + n, ticket: 'M' + String(n).padStart(3, '0'), name, phone: phone || ('9' + String(840000000 + n * 7919).slice(0, 9)), userId: o.userId || null,
      status: o.status || 'ACTIVE', invite: o.invite || 'ACCEPTED', acceptedVersion: o.invite === 'INVITED' ? null : (o.version || 1), acceptedAt: o.at || nowISO(), wins: [] };
    g.members.push(m);
    return m;
  },

  buildRounds(g) {
    g.rounds = ChitEngine.schedule(g.rules).map(x => ({ n: x.n, auctionAt: x.auctionAt, origAt: x.auctionAt, dueAt: x.dueAt, endsAt: null, status: 'SCHEDULED', history: [], bids: [], result: null, payout: null }));
  },

  // Next 7:00 PM IST that is at least an hour away (keeps the demo's "tonight's auction" upcoming).
  nextEvening() {
    const t = Date.now() + 3600000;
    let d = istToday();
    let at = ChitEngine.istISO(...d.split('-').map(Number), 19, 0);
    if (new Date(at).getTime() < t) { const n = new Date(istDay(at) + 86400000 + 3600000).toLocaleDateString('en-CA', { timeZone: TZ }); at = ChitEngine.istISO(...n.split('-').map(Number), 19, 0); }
    return at;
  },
  shiftMonths(iso, k) {
    const d = new Date(new Date(iso).getTime() + 330 * 60000); // IST wall clock in UTC fields
    const y = d.getUTCFullYear(), mo = d.getUTCMonth() + k, yy = y + Math.floor(mo / 12), m = ((mo % 12) + 12) % 12;
    const last = new Date(Date.UTC(yy, m + 1, 0)).getUTCDate();
    return ChitEngine.istISO(yy, m + 1, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes());
  },
  istDate(iso) { return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ }); },

  // Settle a historical round exactly as the live flow would (bids → result → approval → postings → payout).
  seedRound(g, n, winnerTicket, discountR, bidders, o = {}) {
    const r = g.rounds[n - 1], at = r.auctionAt;
    const win = g.members.find(m => m.ticket === winnerTicket);
    const t0 = new Date(at).getTime();
    const steps = [0.4, 0.6, 0.72, 0.8, 0.9, 1];
    const others = bidders.map(tk => g.members.find(m => m.ticket === tk));
    steps.forEach((k, i) => {
      const mem = i === steps.length - 1 ? win : others[i % others.length];
      if (mem.id === win.id && i < steps.length - 1) return;
      const inc = g.rules.incrementP, amt = Math.max(g.rules.minDiscountP, Math.round(RP(discountR) * k / inc) * inc);
      r.bids.push({ id: uid('b'), memberId: mem.id, discountP: i === steps.length - 1 ? RP(discountR) : amt, at: new Date(t0 + (10 + i * 17) * 1000).toISOString(), status: 'ACCEPTED', req: uid('q') });
    });
    r.status = 'OPEN'; r.endsAt = new Date(t0 + g.rules.auctionMinutes * 60000).toISOString();
    r.history.push({ at, t: 'Auction opened', by: 'system' });
    ChitServer.close(g, r, { at: r.endsAt, silent: true });
    ChitData.seedPaid(g, r, o);
  },
  // Fixed chit: the turn is decided (fixed order or lots), approved and paid out, as the live flow would.
  seedTurn(g, n, o = {}) {
    const r = g.rounds[n - 1];
    ChitServer.draw(g, r, { at: r.auctionAt });
    ChitData.seedPaid(g, r, o);
  },
  seedPaid(g, r, o) {
    const n = r.n, win = Chit.mem(g, r.result.winnerId);
    ChitServer.approve(g, r, { by: o.approver || 'me', at: new Date(new Date(r.endsAt).getTime() + 15 * 60000).toISOString(), silent: true });
    const p = r.payout, pt = new Date(new Date(r.endsAt).getTime() + 86400000);
    ['UNDER_REVIEW', 'APPROVED', 'PROCESSING', 'PAID'].forEach((s, i) => p.history.push({ s, at: new Date(pt.getTime() + i * 3600000).toISOString(), by: s === 'PAID' ? 'Bank (confirmed)' : (o.approver || 'me') }));
    p.status = 'PAID'; p.ref = 'UTR' + (402100000000 + n * 7331); p.paidAt = p.history[p.history.length - 1].at;
    ChitServer.post(g, 'payout:' + n, [{ round: n, memberId: win.id, type: 'WINNER_PAYOUT', debitP: 0, creditP: 0, infoP: p.netP, ref: p.ref }], p.paidAt, 'system');
  },

  // Pay every member's net amount for a settled round, except the listed exceptions.
  seedPayments(g, n, except = {}) {
    const r = g.rounds[n - 1];
    g.members.forEach((m, i) => {
      const o = Chit.oblig(g, m.id, n);
      const ex = except[m.ticket];
      if (ex === 'unpaid') return;
      const at = new Date(new Date(r.endsAt).getTime() + (1 + (i % 4)) * 86400000).toISOString();
      if (ex === 'partial') return ChitServer.payment(g, { memberId: m.id, n, amountP: Math.round(o.netP / 2 / 100) * 100, method: 'Cash', status: 'CONFIRMED', at, by: 'me' });
      if (ex === 'verify') return ChitServer.payment(g, { memberId: m.id, n, amountP: o.netP, method: 'Cash', status: 'RECORDED_PENDING_VERIFICATION', at: new Date(Date.now() - 5 * 3600000).toISOString(), by: 'Murugan K (agent)' });
      ChitServer.payment(g, { memberId: m.id, n, amountP: o.netP, method: i % 3 ? 'UPI' : 'Cash', status: 'CONFIRMED', at, by: i % 3 ? 'system' : 'me', ref: i % 3 ? 'UPI' + (6021000 + n * 100 + i) : '' });
    });
  },

  seed(st) {
    st.mod.chit = {};
    const me = st.user.name || 'You';
    const r6 = ChitData.nextEvening();

    /* 1. Created by you: ₹1 lakh, 20 members, 5% of pool every round, dividends to all. Round 6 is tonight. */
    const id1 = 's_chit1';
    const rules1 = Object.assign(ChitData.defaultRules(), { name: 'Thirumalai Nagar Chit · ₹1 Lakh', desc: 'Monthly chit for Thirumalai Nagar families. Auction at the community hall, 7:00 PM.', startDate: ChitData.istDate(ChitData.shiftMonths(r6, -5)) });
    st.services.push({ id: id1, type: 'chit', name: rules1.name, status: 'active', code: 'TNC-4821', createdBy: 'me', createdAt: ChitData.shiftMonths(r6, -6), place: 'Thirumalai Nagar' });
    st.memberships.push({ svcId: id1, role: 'admin', status: 'active', joinedAt: ChitData.shiftMonths(r6, -6) });
    const g1 = ChitData.group(rules1, 'TNC-4821');
    g1.ruleVersions.push({ v: 1, publishedAt: ChitData.shiftMonths(r6, -6), by: 'me', reason: 'Initial publication', rules: JSON.parse(JSON.stringify(rules1)) });
    ChitData.addMember(g1, me, st.user.phone, { userId: 'me' });
    ChitData.NAMES.slice(0, 19).forEach(n => ChitData.addMember(g1, n));
    ChitData.buildRounds(g1);
    st.mod.chit[id1] = g1;
    const hist1 = [['M012', 25000], ['M004', 20000], ['M009', 15000], ['M015', 12000], ['M007', 10000]];
    hist1.forEach(([tk, d], i) => { ChitData.seedRound(g1, i + 1, tk, d, ['M004', 'M009', 'M012', 'M017', 'M003'].filter(x => x !== tk)); });
    [1, 2, 3, 4].forEach(n => ChitData.seedPayments(g1, n));
    ChitData.seedPayments(g1, 5, { M018: 'unpaid', M011: 'unpaid', M006: 'partial', M020: 'verify' });
    // A reschedule in history (round 3 moved for a village festival) — original date is kept.
    const r3 = g1.rounds[2];
    r3.history.unshift({ at: new Date(new Date(r3.auctionAt).getTime() - 12 * 86400000).toISOString(), t: 'Rescheduled', note: `${fmt.dt(new Date(new Date(r3.auctionAt).getTime() - 86400000).toISOString())} → ${fmt.dt(r3.auctionAt)} · Reason: Temple festival on the original date`, by: 'me' });

    /* 2. Joined as a member: ₹2 lakh, dividends to non-winners only (paise remainder rule), you won round 2. */
    const id2 = 's_chit2';
    const r4 = new Date(new Date(r6).getTime() + 3 * 86400000).toISOString();
    const rules2 = Object.assign(ChitData.defaultRules(), { name: 'Amman Kovil Chit · ₹2 Lakh', desc: 'Run by Lakshmi Raman. Monthly auction after the temple pooja.', poolP: RP(200000), contributionP: RP(10000), minDiscountP: RP(10000), maxDiscountP: RP(80000), incrementP: RP(1000), dividendTo: 'non_winners', dueDays: 30, auctionTime: '19:00', startDate: ChitData.istDate(ChitData.shiftMonths(r4, -3)) });
    st.services.push({ id: id2, type: 'chit', name: rules2.name, status: 'active', code: 'AKC-2207', createdBy: 'Lakshmi Raman', createdAt: ChitData.shiftMonths(r4, -4), place: 'Amman Kovil Street' });
    st.memberships.push({ svcId: id2, role: 'member', status: 'active', joinedAt: ChitData.shiftMonths(r4, -4) });
    const g2 = ChitData.group(rules2, 'AKC-2207');
    g2.ruleVersions.push({ v: 1, publishedAt: ChitData.shiftMonths(r4, -4), by: 'Lakshmi Raman', reason: 'Initial publication', rules: JSON.parse(JSON.stringify(rules2)) });
    ChitData.NAMES.slice(0, 6).forEach(n => ChitData.addMember(g2, n));
    ChitData.addMember(g2, me, st.user.phone, { userId: 'me' });
    ChitData.NAMES.slice(6, 19).forEach(n => ChitData.addMember(g2, n));
    ChitData.buildRounds(g2);
    st.mod.chit[id2] = g2;
    [['M011', 50000], ['M007', 42000], ['M003', 36000]].forEach(([tk, d], i) => ChitData.seedRound(g2, i + 1, tk, d, ['M003', 'M011', 'M014', 'M007', 'M019'].filter(x => x !== tk), { approver: 'Lakshmi Raman' }));
    [1, 2].forEach(n => ChitData.seedPayments(g2, n));
    ChitData.seedPayments(g2, 3, { M007: 'unpaid', M015: 'unpaid' });
    g2.rounds[1].payout.dest = 'SBI ····4821';

    /* 3. Not a member yet (for the join flow): 10 members, one ticket open. Code KWC-2026. */
    const id3 = 's_chit3';
    const rules3 = Object.assign(ChitData.defaultRules(), { name: "Kalaimagal Women's Chit · ₹50,000", desc: "Women's savings chit. Organiser: Selvi Arumugam.", poolP: RP(50000), members: 10, rounds: 10, contributionP: RP(5000), minDiscountP: RP(2500), maxDiscountP: RP(20000), incrementP: RP(250), feeBasis: 'fixed', feeFixedP: RP(1000), feeTiming: 'first', startDate: ChitData.istDate(ChitData.shiftMonths(r6, 1)) });
    st.services.push({ id: id3, type: 'chit', name: rules3.name, status: 'active', code: 'KWC-2026', createdBy: 'Selvi Arumugam', createdAt: nowISO(), place: 'Kalaimagal Street' });
    const g3 = ChitData.group(rules3, 'KWC-2026');
    g3.ruleVersions.push({ v: 1, publishedAt: nowISO(), by: 'Selvi Arumugam', reason: 'Initial publication', rules: JSON.parse(JSON.stringify(rules3)) });
    ['Selvi Arumugam', 'Meena Sundaram', 'Revathi Kumar', 'Kavitha Mani', 'Valli Muthu', 'Deepa Ramesh', 'Bhuvana S', 'Malar Vizhi', 'Priya Devi'].forEach(n => ChitData.addMember(g3, n));
    ChitData.buildRounds(g3);
    st.mod.chit[id3] = g3;

    /* 4. A saved draft. */
    const id4 = 's_chit4';
    const rules4 = Object.assign(ChitData.defaultRules(), { name: 'Diwali Savings Chit · ₹3 Lakh', poolP: RP(300000), members: 30, rounds: 30, contributionP: RP(10000), minDiscountP: RP(15000), maxDiscountP: RP(120000), incrementP: RP(1000) });
    st.services.push({ id: id4, type: 'chit', name: rules4.name, status: 'draft', code: 'DSC-7310', createdBy: 'me', createdAt: new Date(Date.now() - 2 * 86400000).toISOString(), place: '' });
    st.memberships.push({ svcId: id4, role: 'admin', status: 'active', joinedAt: nowISO() });
    st.mod.chit[id4] = Object.assign(ChitData.group(rules4, 'DSC-7310'), { draftStep: 3 });

    /* 5. Fixed monthly chit (no auction), organised by you. Additional chits: you hold 2 tickets, Lakshmi 3,
     *    Karthik 2 — each ticket pays separately. Commission 5% of the chit amount. Round 4 is tonight. */
    const id5 = 's_chit5';
    const rules5 = Object.assign(ChitData.defaultRules(), { chitType: 'fixed', company: 'Sri Murugan Chits', name: 'Sri Murugan Fixed Chit · ₹1 Lakh', desc: 'No auction. Every month one ticket gets ₹95,000 in the order agreed at the start.', turnOrder: 'order', startDate: ChitData.istDate(ChitData.shiftMonths(r6, -3)) });
    st.services.push({ id: id5, type: 'chit', name: rules5.name, status: 'active', code: 'SMF-1190', createdBy: 'me', createdAt: ChitData.shiftMonths(r6, -4), place: 'Murugan Kovil Street' });
    st.memberships.push({ svcId: id5, role: 'admin', status: 'active', joinedAt: ChitData.shiftMonths(r6, -4) });
    const g5 = ChitData.group(rules5, 'SMF-1190');
    g5.ruleVersions.push({ v: 1, publishedAt: ChitData.shiftMonths(r6, -4), by: 'me', reason: 'Initial publication', rules: JSON.parse(JSON.stringify(rules5)) });
    [0, 1].forEach(() => ChitData.addMember(g5, me, st.user.phone, { userId: 'me' }));
    const lak = '9840011223', kar = '9840044556';
    [0, 1, 2].forEach(() => ChitData.addMember(g5, 'Lakshmi Raman', lak));
    [0, 1].forEach(() => ChitData.addMember(g5, 'Karthik Raja', kar));
    ChitData.NAMES.filter(n => !['Lakshmi Raman', 'Karthik Raja'].includes(n)).slice(0, 13).forEach(n => ChitData.addMember(g5, n));
    const first = ['M003', 'M011', 'M001', 'M008'];
    g5.order = first.concat(g5.members.map(m => m.ticket).filter(t => !first.includes(t))).map(t => g5.members.find(m => m.ticket === t).id);
    ChitData.buildRounds(g5);
    st.mod.chit[id5] = g5;
    [1, 2, 3].forEach(n => ChitData.seedTurn(g5, n));
    [1, 2].forEach(n => ChitData.seedPayments(g5, n));
    ChitData.seedPayments(g5, 3, { M002: 'unpaid', M009: 'unpaid', M014: 'partial' });

    return [id1, id2];
  }
};

/* ---------- Mock server: the only place that accepts bids, closes auctions, settles and posts ledger entries ---------- */
const ChitServer = {
  // Idempotent ledger posting: a batch with the same key is never posted twice.
  post(g, key, entries, at, by) {
    if (g.ledger.some(e => e.key === key)) return false;
    entries.forEach((e, i) => g.ledger.push(Object.assign({ id: uid('l'), key, line: i, at: at || nowISO(), by: by || 'system', debitP: 0, creditP: 0 }, e)));
    return true;
  },

  payment(g, o) {
    const p = { id: uid('p'), memberId: o.memberId, n: o.n, amountP: o.amountP, method: o.method, status: o.status, ref: o.ref || '', receipt: g.code + '-R' + (++g.seqR), recordedBy: o.by || 'me', verifiedBy: o.status === 'CONFIRMED' && o.method === 'Cash' ? (o.by || 'me') : null, at: o.at || nowISO(), req: o.req || uid('q'), history: [{ s: o.status, at: o.at || nowISO(), by: o.by || 'me' }] };
    g.payments.push(p);
    if (p.status === 'CONFIRMED') ChitServer.post(g, 'pay:' + p.id, [{ round: p.n, memberId: p.memberId, type: 'CONTRIBUTION_RECEIVED', creditP: p.amountP, ref: p.receipt }], p.at, p.recordedBy);
    return p;
  },
  confirmPayment(g, p, by, at) {
    p.status = 'CONFIRMED'; p.verifiedBy = by; p.history.push({ s: 'CONFIRMED', at: at || nowISO(), by });
    ChitServer.post(g, 'pay:' + p.id, [{ round: p.n, memberId: p.memberId, type: 'CONTRIBUTION_RECEIVED', creditP: p.amountP, ref: p.receipt }], at, by);
  },

  open(g, r, o = {}) {
    if (r.status !== 'SCHEDULED') return;
    r.status = 'OPEN';
    r.openedAt = o.at || nowISO();
    r.endsAt = o.endsAt || new Date(Date.now() + DEMO_WINDOW_S * 1000).toISOString();
    r.history.push({ at: r.openedAt, t: 'Auction opened', note: o.note || '', by: 'system' });
    r.sim = { cap: 0, next: Date.now() + 4000 };
  },

  bid(g, r, memberId, discountP, req, by) {
    const dupe = r.bids.find(b => b.req === req);
    if (dupe) return dupe; // retried request: same bid, no duplicate (unique auction_id + client_request_id)
    const hi = Chit.highest(r);
    let reason = r.status !== 'OPEN' ? 'The auction is not open.' : Date.now() > new Date(r.endsAt).getTime() ? 'Received after the closing time (server time).' : '';
    if (!reason) { const el = Chit.eligibility(g, memberId, r.n); if (!el.ok) reason = el.reasons[0]; }
    if (!reason) reason = ChitEngine.checkBid(g.rules, hi ? hi.discountP : 0, discountP);
    const b = { id: uid('b'), memberId, discountP, at: nowISO(), status: reason ? 'REJECTED' : 'ACCEPTED', reason, req, by: by || memberId };
    r.bids.push(b);
    // Extension rule: an accepted bid in the last 30 seconds extends the auction by 30 seconds.
    if (!reason && g.rules.extend && new Date(r.endsAt).getTime() - Date.now() < 30000) {
      r.endsAt = new Date(Date.now() + 30000).toISOString();
      r.history.push({ at: nowISO(), t: 'Auction extended by 30 seconds', note: 'Late bid received in the final 30 seconds', by: 'system' });
    }
    return b;
  },

  // Close at the deadline: pick the winner by the published rules and calculate the draft settlement.
  close(g, r, o = {}) {
    if (r.status !== 'OPEN') return;
    r.status = 'CLOSED'; r.closedAt = o.at || nowISO();
    r.history.push({ at: r.closedAt, t: 'Auction closed', note: 'Closed by the server at the deadline', by: 'system' });
    const hi = Chit.highest(r);
    if (!hi) {
      r.status = 'NO_VALID_BIDS';
      r.history.push({ at: r.closedAt, t: 'No valid bids', note: ChitEngine.NO_BID[g.rules.noBid], by: 'system' });
      if (g.rules.noBid === 'postpone') {
        const nat = new Date(new Date(r.auctionAt).getTime() + 7 * 86400000).toISOString();
        r.history.push({ at: r.closedAt, t: 'Rescheduled (no-bid rule)', note: `${fmt.dt(r.auctionAt)} → ${fmt.dt(nat)}`, by: 'system' });
        r.dueAt = new Date(new Date(r.dueAt).getTime() + 7 * 86400000).toISOString(); // contribution due moves with the auction
        r.auctionAt = nat; r.status = 'SCHEDULED'; r.bids.forEach(b => { b.round = 'previous attempt'; }); r.endsAt = null;
      }
      return;
    }
    const ties = r.bids.filter(b => b.status === 'ACCEPTED' && b.discountP === hi.discountP);
    const st = ChitEngine.settle(g.rules, r.n, hi.discountP, hi.memberId, Chit.active(g));
    r.result = { winnerId: hi.memberId, bidId: hi.id, discountP: hi.discountP, st, status: 'PENDING_APPROVAL', tie: ties.length > 1, closedAt: r.closedAt, rulesVersion: g.ruleVersions.length };
    r.status = st.ok ? 'RESULT_PENDING_APPROVAL' : 'DISPUTED';
    r.history.push({ at: r.closedAt, t: st.ok ? 'Result calculated · awaiting approval' : 'Settlement failed validation', note: st.ok ? `Winner ${Chit.mem(g, hi.memberId).ticket} · ${rs(hi.discountP)} discount` : st.errors.join(' '), by: 'system' });
  },

  /* A round with no bidding. Fixed chit: the ticket is taken from the agreed order, or drawn by lots among
   * tickets that have not received the money yet. Auction chit: when only one ticket is left, it gets the full
   * pool without an auction (it never bid, so no discount). The result still waits for organiser approval. */
  draw(g, r, o = {}) {
    if (r.status !== 'SCHEDULED') return;
    const at = o.at || nowISO(), fixed = Chit.isFixed(g), lots = fixed && g.rules.turnOrder === 'lots';
    const left = Chit.active(g).filter(m => !m.wins.length);
    const win = !fixed ? Chit.lastOne(g) : lots ? left[Math.floor(Math.random() * left.length)] : Chit.turnFor(g, r.n);
    if (!win) return;
    const how = !fixed ? 'last' : lots ? 'lots' : 'order';
    const st = ChitEngine.settlePlain(g.rules, r.n, win.id, Chit.active(g), fixed ? 'fixed' : 'last');
    r.closedAt = at; r.endsAt = at;
    r.result = { winnerId: win.id, bidId: null, discountP: 0, st, how, status: 'PENDING_APPROVAL', tie: false, closedAt: at, rulesVersion: g.ruleVersions.length };
    r.status = st.ok ? 'RESULT_PENDING_APPROVAL' : 'DISPUTED';
    const t = { order: 'Turn by fixed order', lots: 'Lots drawn', last: 'Last member · no auction needed' }[how];
    r.history.push({ at, t, note: `${win.ticket} gets ${rs(st.payoutNetP)}${how === 'lots' ? ` · drawn from ${left.length} tickets` : ''}`, by: 'system' });
  },

  // Approve → finalise → post settlement → create payout. Guarded against double finalisation.
  approve(g, r, o = {}) {
    if (r.status !== 'RESULT_PENDING_APPROVAL') return 'This result was already finalised by another organiser. Showing the latest state.';
    const at = o.at || nowISO();
    r.status = 'FINALIZED'; r.result.status = 'FINAL'; r.result.approvedBy = o.by || 'me'; r.result.approvedAt = at;
    r.history.push({ at, t: 'Result approved and finalised', by: o.by || 'me' });
    const st = r.result.st, win = Chit.mem(g, r.result.winnerId);
    win.wins.push(r.n);
    const entries = [];
    Chit.active(g).forEach(m => {
      entries.push({ round: r.n, memberId: m.id, type: 'CONTRIBUTION_DUE', debitP: g.rules.contributionP, ref: 'Round ' + r.n });
      const a = ChitEngine.allocationFor(st, m.id);
      if (a && g.rules.creditDividend) entries.push({ round: r.n, memberId: m.id, type: 'DIVIDEND_CREDIT', creditP: a, ref: 'Round ' + r.n });
    });
    if (st.feeP) entries.push({ round: r.n, memberId: null, type: 'COMPANY_FEE', creditP: st.feeP, ref: ChitEngine.feeLabel(g.rules, rs) });
    if (st.roundingP) entries.push({ round: r.n, memberId: null, type: 'ADJUSTMENT', creditP: st.roundingP, ref: 'Dividend rounding remainder' });
    ChitServer.post(g, 'settle:' + r.n, entries, at, o.by || 'me');
    r.status = 'SETTLED';
    r.history.push({ at, t: 'Settlement posted', note: `${entries.length} ledger entries · reconciles in paise`, by: 'system' });
    r.payout = { status: 'PENDING', grossP: st.payoutGrossP, deductions: st.deductions, netP: st.payoutNetP, method: 'Bank transfer', dest: 'Bank ····' + (3000 + r.n * 137), history: [{ s: 'PENDING', at, by: 'system' }], attempts: 0 };
    return '';
  }
};

/* ---------- Queries and user actions ---------- */
const Chit = {
  g: id => modData('chit', id),
  mem: (g, id) => g.members.find(m => m.id === id),
  me: g => g.members.find(m => m.userId === 'me'),
  // All of my tickets (additional chits). Each ticket pays and receives separately.
  mine: g => g.members.filter(m => m.userId === 'me' && m.status !== 'EXITED'),
  // Every ticket held by the same person (same phone number) as ticket m.
  tickets: (g, m) => g.members.filter(x => x.phone === m.phone && x.status !== 'EXITED'),
  active: g => g.members.filter(m => m.status === 'ACTIVE'),
  isFixed: g => g.rules.chitType === 'fixed',
  // Fixed chit, fixed order: the ticket for round n (organiser can reorder before publishing).
  order(g) {
    const ids = (g.order || []).filter(id => g.members.some(m => m.id === id && m.status !== 'EXITED'));
    g.members.forEach(m => { if (m.status !== 'EXITED' && !ids.includes(m.id)) ids.push(m.id); });
    return ids;
  },
  turnFor(g, n) { return Chit.mem(g, Chit.order(g)[n - 1]); },
  // Auction chit: the one ticket left that has not received the pool (no auction is needed for it).
  lastOne(g) {
    const left = Chit.active(g).filter(m => !m.wins.length);
    return g.rules.winOnce && left.length === 1 ? left[0] : null;
  },
  // This round is settled without bidding (fixed chit, or the last ticket of an auction chit).
  noAuction: g => Chit.isFixed(g) || !!Chit.lastOne(g),
  round: (g, n) => g.rounds[n - 1],
  highest(r) {
    const acc = r.bids.filter(b => b.status === 'ACCEPTED' && !b.round);
    // Highest discount wins; ties go to the first bid received by the server (published tie-break rule).
    return acc.sort((a, b) => b.discountP - a.discountP || a.at.localeCompare(b.at))[0] || null;
  },
  // The round that needs attention now: live, awaiting approval, or the next scheduled one.
  current(g) {
    return g.rounds.find(r => ['OPEN', 'CLOSED', 'RESULT_PENDING_APPROVAL', 'FINALIZED', 'DISPUTED'].includes(r.status)) || g.rounds.find(r => r.status === 'SCHEDULED') || g.rounds[g.rounds.length - 1];
  },
  settledCount: g => g.rounds.filter(r => r.status === 'SETTLED').length,

  // A member's contribution obligation for one round (spec §6.5 states).
  oblig(g, memberId, n) {
    const r = g.rounds[n - 1];
    const pays = g.payments.filter(p => p.memberId === memberId && p.n === n);
    const paidP = pays.filter(p => p.status === 'CONFIRMED').reduce((a, p) => a + p.amountP, 0);
    const verifyP = pays.filter(p => ['RECORDED_PENDING_VERIFICATION', 'PENDING', 'INITIATED'].includes(p.status)).reduce((a, p) => a + p.amountP, 0);
    if (!r || r.status !== 'SETTLED') return { n, status: 'not_due', dueP: g.rules.contributionP, creditP: 0, netP: g.rules.contributionP, paidP, verifyP, balP: 0, dueAt: r && r.dueAt };
    const creditP = g.rules.creditDividend ? ChitEngine.allocationFor(r.result.st, memberId) : 0;
    const netP = g.rules.contributionP - creditP, balP = netP - paidP;
    const late = Date.now() > new Date(r.dueAt).getTime();
    const status = balP <= 0 ? 'paid' : verifyP >= balP ? 'verifying' : late ? 'overdue' : paidP > 0 ? 'partial' : 'pending';
    return { n, status, dueP: g.rules.contributionP, creditP, netP, paidP, verifyP, balP, dueAt: r.dueAt };
  },
  arrears(g, memberId) {
    return g.rounds.filter(r => r.status === 'SETTLED').map(r => Chit.oblig(g, memberId, r.n)).filter(o => o.balP > 0);
  },
  // Eligibility to bid in round n under the published rules.
  eligibility(g, memberId, n) {
    const m = Chit.mem(g, memberId), reasons = [];
    if (!m || m.status !== 'ACTIVE') reasons.push('Membership is not active.');
    else {
      if (m.acceptedVersion !== g.ruleVersions.length) reasons.push('The member has not accepted the current scheme rules.');
      if (g.rules.winOnce && m.wins.length) reasons.push(`Already won round ${m.wins[0]}. Each member can win once.`);
      const due = Chit.arrears(g, memberId).filter(o => o.n < n && o.status !== 'verifying');
      if (g.rules.eligibility === 'paid_up' && due.length) reasons.push(`Unpaid contribution for round ${due.map(o => o.n).join(', ')} (${rs(due.reduce((a, o) => a + o.balP, 0))}).`);
    }
    return { ok: !reasons.length, reasons };
  },
  // Member statement: separate entries per round, running outstanding balance (spec §11).
  statement(g, memberId) {
    const rows = g.ledger.filter(e => e.memberId === memberId).map(e => Object.assign({}, e));
    g.payments.filter(p => p.memberId === memberId && p.status !== 'CONFIRMED').forEach(p => rows.push({ id: p.id, round: p.n, type: 'PAYMENT_' + p.status, infoP: p.amountP, at: p.at, ref: p.receipt }));
    rows.sort((a, b) => a.round - b.round || a.at.localeCompare(b.at) || (a.line || 0) - (b.line || 0));
    let bal = 0;
    rows.forEach(e => { bal += (e.debitP || 0) - (e.creditP || 0); e.balP = bal; });
    return { rows, balP: bal };
  },
  stats(g) {
    const settled = g.rounds.filter(r => r.status === 'SETTLED');
    const collectedP = g.payments.filter(p => p.status === 'CONFIRMED').reduce((a, p) => a + p.amountP, 0);
    const expectedP = settled.reduce((a, r) => a + Chit.active(g).reduce((b, m) => b + Chit.oblig(g, m.id, r.n).netP, 0), 0);
    const feesP = settled.reduce((a, r) => a + r.result.st.feeP, 0);
    const divP = settled.reduce((a, r) => a + r.result.st.allocations.reduce((b, x) => b + x.amountP, 0), 0);
    const paidOutP = settled.filter(r => r.payout && r.payout.status === 'PAID').reduce((a, r) => a + r.payout.netP, 0);
    const overdue = Chit.active(g).filter(m => Chit.arrears(g, m.id).some(o => o.status === 'overdue'));
    const toVerify = g.payments.filter(p => p.status === 'RECORDED_PENDING_VERIFICATION');
    return { settled: settled.length, collectedP, expectedP, outstandingP: expectedP - collectedP, feesP, divP, paidOutP, overdue, toVerify };
  },
  canSee(svcId, perm) { return Reg.can(svcId, perm); },

  /* --- Creator actions (each checks permission first; the server would re-check) --- */
  saveDraft(svcId, rules, step) {
    const g = Chit.g(svcId), s = svcById(svcId);
    g.rules = rules; g.draftStep = step; s.name = rules.name || 'Untitled chit';
    Store.save();
  },
  publish(svcId) {
    const g = Chit.g(svcId), s = svcById(svcId);
    if (!Reg.can(svcId, 'service.manage')) return Act.denied('publish');
    const v = ChitEngine.validate(g.rules, rs);
    if (!v.ok) return UI.toast('Fix the highlighted settings before publishing', 'err');
    g.rules.contributionP = g.rules.poolP / g.rules.members;
    if (Chit.isFixed(g)) g.order = Chit.order(g);
    ChitData.buildRounds(g);
    (g.dateEdits || []).forEach(([n, at]) => { const r = g.rounds[n - 1]; if (r) { r.auctionAt = at; r.origAt = at; } });
    g.ruleVersions.push({ v: 1, publishedAt: nowISO(), by: 'me', reason: 'Initial publication', rules: JSON.parse(JSON.stringify(g.rules)) });
    if (!Chit.me(g)) ChitData.addMember(g, S().user.name, S().user.phone, { userId: 'me' });
    g.members.forEach(m => { if (m.userId !== 'me') { m.invite = 'INVITED'; m.acceptedVersion = null; m.status = 'PENDING'; } });
    s.status = 'active';
    Act.audit(svcId, 'Scheme published (rules v1)', 'chit_rule_versions', { after: { pool: rs(g.rules.poolP), members: g.rules.members, rounds: g.rules.rounds, fee: ChitEngine.feeLabel(g.rules, rs) } });
    Act.notify(svcId, 'Chit published', `${s.name} is live. ${g.members.length - 1} invitation${g.members.length > 2 ? 's' : ''} sent.`, { s: 'chitHome', p: { id: svcId } });
    Store.save();
    // Mock: invited members accept the published rules over the next few seconds.
    g.members.filter(m => m.invite === 'INVITED').forEach((m, i) => setTimeout(() => {
      const gg = Chit.g(svcId); const mm = gg && Chit.mem(gg, m.id);
      if (!mm || mm.invite !== 'INVITED') return;
      mm.invite = 'ACCEPTED'; mm.status = 'ACTIVE'; mm.acceptedVersion = 1; mm.acceptedAt = nowISO();
      Act.audit(svcId, `${mm.ticket} accepted rules v1`, 'chit_memberships', { actor: mm.name });
      Act.commit();
    }, 2500 + i * 1200));
    App.reset('chitHome', { id: svcId, tab: 'overview' });
    UI.toast('Published · invitations sent', 'ok');
  },
  // count = how many chits (tickets) this person takes. Additional chits: up to rules.maxTickets per person,
  // and each ticket pays its own contribution.
  invite(svcId, name, phone, count = 1) {
    const g = Chit.g(svcId), draft = svcById(svcId).status === 'draft', max = g.rules.maxTickets || 1;
    if (!Reg.can(svcId, 'members.manage')) return Act.denied('invite members');
    const has = g.members.filter(m => m.phone === phone && m.status !== 'EXITED');
    if (has.length + count > max) return has.length ? `This person already has ${has.length} chit${has.length > 1 ? 's' : ''}. One person can hold at most ${max} in this group.` : `One person can hold at most ${max} chit${max > 1 ? 's' : ''} in this group.`;
    const free = g.rules.members - g.members.filter(m => m.status !== 'EXITED').length;
    if (!draft && count > free) return free ? `Only ${free} ticket${free > 1 ? 's are' : ' is'} left.` : `All ${g.rules.members} tickets are taken. The published member count cannot change without an amendment.`;
    const who = has.length ? has[0].name : name;
    for (let i = 0; i < count; i++) {
      const m = ChitData.addMember(g, who, phone, { invite: draft ? 'ACCEPTED' : 'INVITED', status: draft ? 'ACTIVE' : 'PENDING' });
      Act.audit(svcId, `Member ${m.ticket} invited`, 'chit_memberships', { after: { name: who, phone: fmt.masked(phone), chit: `${has.length + i + 1} of ${has.length + count}` } });
    }
    Act.commit();
    return '';
  },
  acceptRules(svcId) {
    const g = Chit.g(svcId), v = g.ruleVersions.length;
    // One acceptance covers every ticket this person holds.
    Chit.mine(g).forEach(m => {
      m.invite = 'ACCEPTED'; m.status = 'ACTIVE'; m.acceptedVersion = v; m.acceptedAt = nowISO();
      Act.audit(svcId, `${m.ticket} accepted rules v${v}`, 'chit_memberships', {});
    });
    Act.commit();
    UI.toast(Chit.isFixed(g) ? `Rules v${v} accepted` : `Rules v${v} accepted · you can bid when eligible`, 'ok');
  },
  reschedule(svcId, n, iso, reason) {
    const g = Chit.g(svcId), r = Chit.round(g, n);
    if (!Reg.can(svcId, 'rounds.manage')) return Act.denied('reschedule');
    if (r.status !== 'SCHEDULED') return UI.toast('Only a scheduled round can be rescheduled', 'err');
    const before = r.auctionAt;
    r.dueAt = new Date(new Date(r.dueAt).getTime() + (new Date(iso) - new Date(before))).toISOString(); // due date keeps its offset from the auction
    r.auctionAt = iso;
    r.history.push({ at: nowISO(), t: 'Rescheduled', note: `${fmt.dt(before)} → ${fmt.dt(iso)} · Reason: ${reason}`, by: 'me' });
    Act.audit(svcId, `Round ${n} rescheduled`, 'chit_rounds', { before: { auction: fmt.dt(before) }, after: { auction: fmt.dt(iso) }, reason });
    Act.notify(svcId, `Round ${n} auction rescheduled`, `New time: ${fmt.dt(iso)}. Reason: ${reason}`, { s: 'chitRound', p: { id: svcId, n } }, { kind: 'nAuction' });
    Act.commit();
    UI.toast('Rescheduled · members notified', 'ok');
  },
  approveResult(svcId, n) {
    const g = Chit.g(svcId), r = Chit.round(g, n);
    if (!Reg.can(svcId, 'result.approve')) return Act.denied('approve results');
    const err = ChitServer.approve(g, r, { by: 'me' });
    if (err) { UI.toast(err, 'err'); return App.refresh(); }
    const w = Chit.mem(g, r.result.winnerId);
    Act.audit(svcId, `Round ${n} result finalised`, 'auction_results', { after: { winner: w.ticket, discount: rs(r.result.discountP), payout: rs(r.result.st.payoutNetP), fee: rs(r.result.st.feeP), dividend: rs(r.result.st.perMemberP) } });
    Act.notify(svcId, `Round ${n} result published`, `Winner ${w.ticket} · discount ${rs(r.result.discountP)} · dividend ${rs(r.result.st.perMemberP)} per member`, { s: 'chitRound', p: { id: svcId, n } }, { kind: 'nAuction', private: true });
    Act.commit();
    UI.toast('Result finalised · settlement posted', 'ok');
  },
  payoutStep(svcId, n, to, note) {
    const g = Chit.g(svcId), r = Chit.round(g, n), p = r.payout;
    if (!Reg.can(svcId, 'payout.manage')) return Act.denied('manage payouts');
    const from = p.status;
    p.status = to; p.history.push({ s: to, at: nowISO(), by: 'me', note: note || '' });
    Act.audit(svcId, `Round ${n} payout ${PAYOUT_ST[to].label.toLowerCase()}`, 'payouts', { before: { status: from }, after: { status: to }, reason: note });
    if (to === 'PROCESSING') {
      p.attempts++; p.req = p.req || uid('po');
      setTimeout(() => {
        const rr = Chit.round(Chit.g(svcId), n), pp = rr.payout;
        if (pp.status !== 'PROCESSING') return;
        if (S().sim.payoutFail) {
          pp.status = 'FAILED'; pp.failReason = 'Bank rejected: beneficiary account name mismatch'; pp.history.push({ s: 'FAILED', at: nowISO(), by: 'Bank', note: pp.failReason });
          S().sim.payoutFail = false;
          Act.notify(svcId, `Round ${n} payout failed`, pp.failReason, { s: 'chitRound', p: { id: svcId, n } }, { kind: 'nPayment' });
        } else {
          pp.status = 'PAID'; pp.ref = 'UTR' + Math.floor(402100000000 + Math.random() * 99999999); pp.paidAt = nowISO(); pp.history.push({ s: 'PAID', at: nowISO(), by: 'Bank (confirmed)', note: pp.ref });
          ChitServer.post(Chit.g(svcId), 'payout:' + n, [{ round: n, memberId: rr.result.winnerId, type: 'WINNER_PAYOUT', infoP: pp.netP, ref: pp.ref }], nowISO(), 'system');
          Act.notify(svcId, `Round ${n} payout paid`, `${rs(pp.netP)} transferred · ${pp.ref}`, { s: 'chitRound', p: { id: svcId, n } }, { kind: 'nPayment', private: true });
        }
        Act.commit();
      }, 3000);
    }
    Act.commit();
  },
  // Never retry blindly: check the original transaction's status with the provider first (spec §13).
  payoutRetry(svcId, n) {
    UI.toast('Checking the original transfer with the bank…');
    setTimeout(() => {
      UI.confirm({ title: 'Original transfer not processed', message: 'The bank confirms the first attempt was rejected and no money left the account. A new attempt will use a new idempotency key.', confirm: 'Retry payout', icon: 'refresh', onConfirm: () => Chit.payoutStep(svcId, n, 'PROCESSING', 'Retry after confirming the original attempt failed') });
    }, 1200);
  },

  recordPayment(svcId, o) {
    const g = Chit.g(svcId), self = Chit.me(g) && Chit.me(g).id === o.memberId;
    if (!self && !Reg.can(svcId, 'payments.record')) return Act.denied('record payments');
    if (g.payments.some(p => p.req === o.req)) return; // double tap / retry: idempotent
    const recent = g.payments.find(p => p.memberId === o.memberId && p.n === o.n && p.amountP === o.amountP && Date.now() - new Date(p.at).getTime() < 10 * 60000 && p.status !== 'FAILED');
    if (recent && !o.force) {
      UI.confirm({ title: 'Possible duplicate', message: `A payment of ${rs(o.amountP)} for round ${o.n} was recorded ${fmt.rel(recent.at)} (${recent.receipt}). Record another one?`, confirm: 'Record anyway', danger: true, onConfirm: () => Chit.recordPayment(svcId, Object.assign({}, o, { force: true })) });
      return;
    }
    const m = Chit.mem(g, o.memberId);
    if (o.method === 'Cash') {
      const status = g.rules.cashVerify ? 'RECORDED_PENDING_VERIFICATION' : 'CONFIRMED';
      const p = ChitServer.payment(g, { memberId: o.memberId, n: o.n, amountP: o.amountP, method: 'Cash', status, by: 'me', req: o.req, ref: o.ref });
      Act.audit(svcId, `Cash recorded · ${m.ticket} round ${o.n}`, 'payments', { after: { amount: rs(o.amountP), receipt: p.receipt, status } });
      UI.toast(status === 'CONFIRMED' ? 'Cash payment confirmed' : 'Cash recorded · waiting for verification', 'ok');
    } else {
      // Digital: a pending payment is created; only the provider's server-to-server webhook confirms it.
      const p = ChitServer.payment(g, { memberId: o.memberId, n: o.n, amountP: o.amountP, method: o.method, status: 'PENDING', by: self ? m.name : 'me', req: o.req });
      Act.audit(svcId, `${o.method} payment initiated · ${m.ticket} round ${o.n}`, 'payments', { after: { amount: rs(o.amountP) } });
      UI.toast('Payment pending · waiting for bank confirmation');
      setTimeout(() => {
        const gg = Chit.g(svcId), pp = gg.payments.find(x => x.id === p.id);
        if (!pp || pp.status !== 'PENDING') return;
        if (S().sim.upiFail) {
          pp.status = 'FAILED'; pp.history.push({ s: 'FAILED', at: nowISO(), by: 'UPI webhook', note: 'Declined by the payer\'s bank' });
          Act.notify(svcId, 'Payment failed', `Round ${o.n} payment of ${rs(o.amountP)} was declined. No money was taken.`, { s: 'chitMember', p: { id: svcId, mid: o.memberId } }, { kind: 'nPayment' });
        } else {
          pp.ref = 'UPI' + Math.floor(6000000 + Math.random() * 999999);
          ChitServer.confirmPayment(gg, pp, 'UPI webhook (verified)');
          Act.notify(svcId, 'Payment confirmed', `Round ${o.n} · ${rs(o.amountP)} · receipt ${pp.receipt}`, { s: 'chitMember', p: { id: svcId, mid: o.memberId } }, { kind: 'nPayment', private: true });
        }
        Act.commit();
      }, 2600);
    }
    Act.commit();
  },
  verifyPayment(svcId, payId) {
    const g = Chit.g(svcId), p = g.payments.find(x => x.id === payId);
    if (!Reg.can(svcId, 'payments.verify')) return Act.denied('verify payments');
    ChitServer.confirmPayment(g, p, 'me');
    Act.audit(svcId, `Cash verified · ${Chit.mem(g, p.memberId).ticket} round ${p.n}`, 'payments', { before: { status: 'RECORDED_PENDING_VERIFICATION' }, after: { status: 'CONFIRMED', receipt: p.receipt } });
    Act.commit();
    UI.toast('Verified · receipt issued', 'ok');
  },
  reversePayment(svcId, payId, reason) {
    const g = Chit.g(svcId), p = g.payments.find(x => x.id === payId);
    if (!Reg.can(svcId, 'payments.verify')) return Act.denied('reverse payments');
    const was = p.status;
    p.status = 'REVERSED'; p.history.push({ s: 'REVERSED', at: nowISO(), by: 'me', note: reason });
    if (was === 'CONFIRMED') ChitServer.post(g, 'rev:' + p.id, [{ round: p.n, memberId: p.memberId, type: 'REVERSAL', debitP: p.amountP, ref: 'Reversal of ' + p.receipt }], nowISO(), 'me');
    Act.audit(svcId, `Payment ${p.receipt} reversed`, 'payments', { before: { status: was }, after: { status: 'REVERSED' }, reason });
    Act.commit();
    UI.toast('Reversed · original kept in history', 'ok');
  },
  dispute(svcId, n, text) {
    const g = Chit.g(svcId);
    g.disputes.unshift({ id: uid('d'), n, text, at: nowISO(), by: 'me', status: 'Open' });
    Act.audit(svcId, `Dispute raised on round ${n}`, 'disputes', { reason: text });
    Act.commit();
    UI.toast('Sent to the organiser · you will be notified of the response', 'ok');
  },

  /* --- Auction (user side) --- */
  // mid: which of my tickets is bidding (a person with additional chits picks one).
  placeBid(svcId, n, discountP, req, mid) {
    const g = Chit.g(svcId), r = Chit.round(g, n), me = (mid && Chit.mine(g).find(m => m.id === mid)) || Chit.me(g);
    if (!Reg.can(svcId, 'bid')) return Act.denied('bid');
    const b = ChitServer.bid(g, r, me.id, discountP, req);
    if (b.status === 'ACCEPTED') Act.audit(svcId, `Bid accepted · round ${n}`, 'bids', { after: { ticket: me.ticket, discount: rs(discountP), at: fmt.time(b.at) } });
    Act.commit();
    return b;
  }
};

/* ---------- Server clock: opens auctions at their time, runs simulated bidders, closes at the deadline ---------- */
const ChitClock = {
  start() { if (!this._t) this._t = setInterval(() => ChitClock.tick(), 1000); },
  tick() {
    const st = S(); if (!st || !st.mod.chit) return;
    let changed = false;
    Object.entries(st.mod.chit).forEach(([svcId, g]) => {
      const s = svcById(svcId); if (!s || s.status !== 'active') return;
      g.rounds.forEach(r => {
        if (r.status === 'SCHEDULED' && Date.now() >= new Date(r.auctionAt).getTime() && Chit.active(g).length === g.rules.members && !g.rounds.some(x => ['OPEN', 'CLOSED', 'RESULT_PENDING_APPROVAL', 'FINALIZED'].includes(x.status))) {
          if (Chit.noAuction(g)) { ChitClock.drawNow(svcId, r.n); changed = true; return; }
          ChitServer.open(g, r, { endsAt: new Date(new Date(r.auctionAt).getTime() + DEMO_WINDOW_S * 1000).toISOString() });
          if (membership(svcId)) Act.notify(svcId, `Round ${r.n} auction is live`, 'Bidding is open now.', { s: 'chitAuction', p: { id: svcId, n: r.n } }, { kind: 'nAuction' });
          changed = true;
        }
        if (r.status !== 'OPEN') return;
        if (Date.now() >= new Date(r.endsAt).getTime()) { ChitClock.closeNow(svcId, r.n); changed = true; return; }
        if (S().sim.noBids) return;
        // Simulated members bid against each other up to a private cap.
        if (!r.sim) r.sim = { cap: 0, next: Date.now() + 3000 };
        if (!r.sim.cap) r.sim.cap = Math.round((g.rules.minDiscountP + (g.rules.maxDiscountP - g.rules.minDiscountP) * (0.35 + Math.random() * 0.3)) / g.rules.incrementP) * g.rules.incrementP;
        if (Date.now() < r.sim.next) return;
        r.sim.next = Date.now() + 3500 + Math.random() * 4500;
        const hi = Chit.highest(r), me = Chit.me(g);
        const pool = Chit.active(g).filter(m => (!me || m.id !== me.id) && Chit.eligibility(g, m.id, r.n).ok && (!hi || hi.memberId !== m.id));
        const amt = hi ? hi.discountP + g.rules.incrementP * (1 + Math.floor(Math.random() * 3)) : g.rules.minDiscountP + g.rules.incrementP * Math.floor(Math.random() * 4);
        if (!pool.length || amt > r.sim.cap) return;
        ChitServer.bid(g, r, pool[Math.floor(Math.random() * pool.length)].id, amt, uid('q'));
        changed = true;
      });
    });
    if (changed) { Store.save(); ChitClock.repaint(); }
    document.querySelectorAll('[data-cd]').forEach(el => {
      const s = (new Date(el.dataset.cd).getTime() - Date.now()) / 1000;
      el.textContent = s > 3600 ? I18n.t(fmt.until(el.dataset.cd)) : fmt.clock(s);
      el.classList.toggle('cd-hot', s < 30);
    });
  },
  repaint() { const t = App.top(); if (t && ['chitAuction', 'chitHome', 'chitRound', 'home', 'services'].includes(t.name)) App.refresh(); },
  closeNow(svcId, n) {
    const g = Chit.g(svcId), r = Chit.round(g, n);
    ChitServer.close(g, r);
    ChitClock.after(svcId, n);
  },
  // Fixed chit / last ticket: decide this round's turn without an auction.
  drawNow(svcId, n) {
    const g = Chit.g(svcId), r = Chit.round(g, n);
    ChitServer.draw(g, r);
    ChitClock.after(svcId, n);
  },
  after(svcId, n) {
    const g = Chit.g(svcId), r = Chit.round(g, n), plain = r.result && r.result.how;
    const s = svcById(svcId), admin = myRole(svcId) === 'admin';
    if (r.status === 'RESULT_PENDING_APPROVAL') {
      const w = Chit.mem(g, r.result.winnerId), mine = w.userId === 'me';
      const title = mine ? (plain ? `Your turn: round ${n} money is yours` : `You won round ${n}!`) : plain ? `Round ${n}: ${w.ticket} gets the money` : `Round ${n} auction closed`;
      Act.notify(svcId, title, admin ? (plain ? `${w.ticket} · ${rs(r.result.st.payoutNetP)}. Review and approve.` : `Winner ${w.ticket} · ${rs(r.result.discountP)}. Review and approve the result.`) : 'The organiser is reviewing the result.', { s: 'chitRound', p: { id: svcId, n } }, { kind: 'nAuction', private: true });
      // Mock organiser for services you only joined.
      if (!admin) setTimeout(() => {
        const gg = Chit.g(svcId), rr = Chit.round(gg, n);
        if (ChitServer.approve(gg, rr, { by: s.createdBy })) return;
        Act.audit(svcId, `Round ${n} result finalised`, 'auction_results', { actor: s.createdBy });
        Act.notify(svcId, `Round ${n} result published`, plain ? `${Chit.mem(gg, rr.result.winnerId).ticket} receives ${rs(rr.result.st.payoutNetP)}.` : `Dividend ${rs(rr.result.st.perMemberP)} per member credited to your round ${n} contribution.`, { s: 'chitRound', p: { id: svcId, n } }, { kind: 'nAuction', private: true });
        Act.commit();
      }, 6000);
    } else if (!plain) {
      Act.notify(svcId, `Round ${n}: no valid bids`, r.status === 'SCHEDULED' ? `Postponed to ${fmt.dt(r.auctionAt)} under the published no-bid rule.` : 'The published no-bid rule was applied.', { s: 'chitRound', p: { id: svcId, n } }, { kind: 'nAuction' });
    }
    Act.audit(svcId, plain ? `Round ${n} turn decided` : `Round ${n} auction closed`, plain ? 'chit_rounds' : 'auctions', { actor: 'system', after: { status: r.status } });
    Store.save();
  },
  // Prototype control: the server opens the next scheduled auction now (published time is unchanged in history).
  // Fixed chit or last ticket: it decides the turn now instead.
  openNow(svcId) {
    const g = Chit.g(svcId), r = g.rounds.find(x => x.status === 'SCHEDULED');
    if (!r) return UI.toast('No scheduled round', 'err');
    if (Chit.active(g).length !== g.rules.members) return UI.toast(`Only ${Chit.active(g).length} of ${g.rules.members} members have accepted. Auction cannot open.`, 'err');
    if (g.rounds.some(x => ['OPEN', 'CLOSED', 'RESULT_PENDING_APPROVAL', 'FINALIZED'].includes(x.status))) return UI.toast('Finish the previous round first (approve its result)', 'err');
    if (Chit.noAuction(g)) { ChitClock.drawNow(svcId, r.n); return r.n; }
    ChitServer.open(g, r, { note: 'Opened early from the prototype control panel (demo)' });
    Act.notify(svcId, `Round ${r.n} auction is live`, 'Bidding is open now.', { s: 'chitAuction', p: { id: svcId, n: r.n } }, { kind: 'nAuction' });
    Store.save();
    return r.n;
  }
};

/* ---------- Registry definition ---------- */
Reg.register({
  key: 'chit', name: 'Chit Fund', short: 'Chit', icon: 'gavel', tint: '#FEF3C7', fg: '#B45309', status: 'available', home: 'chitHome', joinRole: 'member',
  desc: 'Run a fixed monthly chit or an auction chit: members, monthly turns, commission, payouts and full history.',
  createPerm: 'platform.create',
  roles: {
    admin: { label: 'Organiser', tone: 'navy', perms: ['*'] },
    member: { label: 'Member', tone: 'teal', perms: ['view', 'bid', 'pay.own', 'statement.own', 'dispute'] }
  },
  setup(draftId) { App.go('chitWizard', draftId ? { id: draftId } : {}); },
  open(id) { App.go('chitHome', { id }); },
  onJoined(svcId) {
    const g = Chit.g(svcId);
    if (!Chit.me(g)) ChitData.addMember(g, S().user.name, S().user.phone, { userId: 'me', invite: 'INVITED', status: 'PENDING' });
  },
  summary(s) {
    const g = Chit.g(s.id); if (!g) return '';
    if (s.status === 'draft') return `Draft · ${rs(g.rules.poolP)} pool · ${g.rules.members} members`;
    const c = Chit.current(g);
    return `${Chit.isFixed(g) ? 'Fixed chit · ' : ''}Round ${c.n} of ${g.rules.rounds} · ${rs(g.rules.poolP)} monthly pool`;
  },
  stats(s, role) {
    const g = Chit.g(s.id); if (!g || s.status === 'draft') return [];
    const c = Chit.current(g), mine = Chit.mine(g);
    if (role === 'admin') { const x = Chit.stats(g); return [[`${Chit.settledCount(g)}/${g.rules.rounds}`, 'Rounds done'], [x.overdue.length, 'Overdue'], [rs(x.outstandingP), 'Outstanding']]; }
    const due = mine.reduce((a, m) => a + Chit.arrears(g, m.id).reduce((b, o) => b + o.balP, 0), 0);
    const won = mine.filter(m => m.wins.length);
    return [[`${c.n}/${g.rules.rounds}`, 'Round'], [rs(due), 'You owe'], [mine.length > 1 ? `${won.length}/${mine.length} chits` : won.length ? 'Won R' + won[0].wins[0] : Chit.isFixed(g) ? 'Waiting' : 'Eligible', mine.length > 1 ? 'Got money' : 'Status']];
  },
  events(s, role) {
    const g = Chit.g(s.id); if (!g) return [];
    const out = [];
    const nx = g.rounds.find(r => ['SCHEDULED', 'OPEN'].includes(r.status));
    if (nx) out.push({ at: nx.status === 'OPEN' ? nowISO() : nx.auctionAt, title: Chit.isFixed(g) ? `Round ${nx.n} money day` : `Round ${nx.n} auction`, sub: nx.status === 'OPEN' ? 'Live now' : s.name, ic: Chit.isFixed(g) ? 'coins' : 'gavel', live: nx.status === 'OPEN', go: { s: nx.status === 'OPEN' ? 'chitAuction' : 'chitRound', p: { id: s.id, n: nx.n } } });
    Chit.mine(g).forEach(me => Chit.arrears(g, me.id).filter(o => o.status !== 'verifying').forEach(o => out.push({ at: o.dueAt, title: `Contribution due · ${rs(o.balP)}`, sub: `${s.name} · ${me.ticket} · round ${o.n}`, ic: 'wallet', go: { s: 'chitMember', p: { id: s.id, mid: me.id } } })));
    return out;
  },
  pending(s, role) {
    const g = Chit.g(s.id); if (!g) return [];
    const out = [], me = Chit.me(g), mine = Chit.mine(g), many = mine.length > 1;
    if (me && me.invite === 'INVITED') out.push({ title: 'Accept the scheme rules', sub: `${s.name} · rules v${g.ruleVersions.length}`, tone: 'warn', ic: 'file', go: { s: 'chitRules', p: { id: s.id, accept: 1 } } });
    const live = g.rounds.find(r => r.status === 'OPEN');
    if (live) out.push({ title: `Round ${live.n} auction is live`, sub: s.name, tone: 'red', ic: 'gavel', go: { s: 'chitAuction', p: { id: s.id, n: live.n } } });
    mine.forEach(me => Chit.arrears(g, me.id).forEach(o => out.push({ title: o.status === 'verifying' ? 'Payment being verified' : o.status === 'overdue' ? `Overdue: pay ${rs(o.balP)}` : `Pay ${rs(o.balP)} for round ${o.n}`, sub: `${s.name}${many ? ' · ' + me.ticket : ''} · due ${fmt.dm(o.dueAt)}`, tone: o.status === 'overdue' ? 'red' : o.status === 'verifying' ? 'blue' : 'warn', ic: 'wallet', go: { s: 'chitMember', p: { id: s.id, mid: me.id } } })));
    mine.filter(me => me.wins.length).forEach(me => { const r = Chit.round(g, me.wins[me.wins.length - 1]); if (r.payout && r.payout.status !== 'PAID') out.push({ title: `Your payout: ${PAYOUT_ST[r.payout.status].label}`, sub: `${s.name} · ${rs(r.payout.netP)}`, tone: 'blue', ic: 'bank', go: { s: 'chitRound', p: { id: s.id, n: r.n } } }); });
    if (role === 'admin') {
      g.rounds.filter(r => r.status === 'RESULT_PENDING_APPROVAL').forEach(r => out.push({ title: `Approve round ${r.n} result`, sub: s.name, tone: 'warn', ic: 'check', go: { s: 'chitRound', p: { id: s.id, n: r.n } } }));
      g.rounds.filter(r => r.payout && ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'FAILED'].includes(r.payout.status)).forEach(r => out.push({ title: `Payout ${PAYOUT_ST[r.payout.status].label.toLowerCase()} · round ${r.n}`, sub: `${s.name} · ${rs(r.payout.netP)}`, tone: r.payout.status === 'FAILED' ? 'red' : 'warn', ic: 'bank', go: { s: 'chitRound', p: { id: s.id, n: r.n } } }));
      const v = g.payments.filter(p => p.status === 'RECORDED_PENDING_VERIFICATION').length;
      if (v) out.push({ title: `Verify ${v} cash payment${v > 1 ? 's' : ''}`, sub: s.name, tone: 'warn', ic: 'cash', go: { s: 'chitHome', p: { id: s.id, tab: 'payments' } } });
      const inv = g.members.filter(m => m.invite === 'INVITED').length;
      if (inv) out.push({ title: `${inv} member${inv > 1 ? 's have' : ' has'} not accepted yet`, sub: `${s.name} · auctions open only when all accept`, tone: 'blue', ic: 'users', go: { s: 'chitHome', p: { id: s.id, tab: 'members' } } });
    }
    return out;
  },
  seed: ChitData.seed
});
