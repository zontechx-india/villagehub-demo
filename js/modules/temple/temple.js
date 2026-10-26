/* Temple Vari Tharagar module — family registry, collector assignments, collections, receipts, handovers.
 * Records live under S().mod.temple[serviceId]. Totals are always calculated from the collection records
 * (never stored), so family-, collector-, locality- and period-wise figures reconcile by construction.
 * Collection rules (fixed / suggested / per-family amount, recurring or one-time, partial allowed) are
 * configured per service because practice differs between temples (spec §7.1). */

const COL_ST = {
  CONFIRMED: { label: 'Confirmed', tone: 'green' }, PENDING: { label: 'Awaiting bank', tone: 'warn' },
  FAILED: { label: 'Failed', tone: 'red' }, VOID: { label: 'Void', tone: 'red' }
};
const FAM_ST = { paid: ['Paid', 'green'], partial: ['Part paid', 'warn'], pending: ['Pending', 'grey'], over: ['Paid extra', 'blue'], inactive: ['Inactive', 'grey'] };
const PURPOSES = ['Festival', 'Pooja', 'Annadhanam', 'Maintenance', 'Kumbabishekam', 'Other'];
const CONTRIB = { fixed: 'Fixed amount per family', suggested: 'Suggested amount (families may give more or less)', per_family: 'Amount set for each family' };
const RECUR = { one_time: 'One-time collection', monthly: 'Every month', yearly: 'Every year' };

const TempleData = {
  FAMILY_NAMES: ['Ramasamy', 'Muthusamy', 'Palaniappan', 'Subramani', 'Krishnan', 'Arumugam', 'Veerappan', 'Chinnasamy', 'Natarajan', 'Kandasamy', 'Periyasamy', 'Sivakumar', 'Duraisamy', 'Mariappan', 'Selvaraj', 'Thangavel', 'Govindan', 'Rajagopal', 'Sundaram', 'Manickam', 'Balasubramani', 'Annamalai', 'Shanmugam', 'Venkatesan', 'Jayaraman', 'Ponnusamy', 'Karuppasamy', 'Ganapathy', 'Murugesan', 'Elango', 'Pandiyan', 'Raju'],

  defaults() {
    const due = new Date(Date.now() + 21 * 86400000).toLocaleDateString('en-CA', { timeZone: TZ });
    return {
      temple: { name: '', place: '', trust: '' },
      campaign: { name: '', purpose: 'Festival', period: '', dueDate: due, type: 'suggested', amountP: RP(2001), recurring: 'one_time', partial: true, receiptPrefix: 'SMT-26-', nextNo: 1 },
      localities: [], collectors: [], families: [], assignHistory: [], collections: [], handovers: [], disputes: [], meCollector: true
    };
  },

  addFamily(t, o) {
    const n = t.families.length + 1;
    const f = { id: uid('f'), fid: 'F-' + String(n).padStart(3, '0'), name: o.name, head: o.head || '', phone: o.phone || '', locality: o.locality || '', members: o.members || 4,
      status: 'active', expectedP: o.expectedP || null, collectorId: o.collectorId || TempleData.collectorFor(t, o.locality), userId: o.userId || null, createdAt: o.at || nowISO() };
    t.families.push(f);
    return f;
  },
  collectorFor(t, loc) { const c = t.collectors.find(x => (x.localities || []).includes(loc)); return c ? c.id : null; },

  // Record a collection the same way the live flow does (receipt numbers never repeat).
  addCollection(t, o) {
    const c = { id: uid('c'), familyId: o.familyId, amountP: o.amountP, method: o.method, ref: o.ref || '', at: o.at || nowISO(), recordedAt: o.recordedAt || o.at || nowISO(),
      collectorId: o.collectorId, receiptNo: t.campaign.receiptPrefix + String(t.campaign.nextNo++).padStart(4, '0'), status: o.status || 'CONFIRMED',
      verified: o.method !== 'Cash' && (o.status || 'CONFIRMED') === 'CONFIRMED', note: o.note || '', period: o.period || (t.campaign.recurring === 'monthly' ? istDate(o.at || nowISO()).slice(0, 7) : ''), req: o.req || uid('q'), history: [{ s: o.status || 'CONFIRMED', at: o.recordedAt || o.at || nowISO(), by: o.by || o.collectorId }] };
    t.collections.push(c);
    return c;
  },

  seed(st) {
    st.mod.temple = {};
    const me = st.user.name || 'You';
    const day = k => new Date(Date.now() - k * 86400000 - (k % 5) * 3600000).toISOString();

    /* 1. You are the temple admin and also the Vari Tharagar for Kovil Street. */
    const id1 = 's_tem1';
    const t1 = TempleData.defaults();
    Object.assign(t1.temple, { name: 'Sri Mariamman Kovil', place: 'Thirumalai Nagar', trust: 'Reg. No. 114/2009' });
    Object.assign(t1.campaign, { name: 'Aippasi Thiruvizha 2026', purpose: 'Festival', period: 'Oct – Nov 2026', type: 'suggested', amountP: RP(2001), receiptPrefix: 'SMK-26-', nextNo: 1 });
    t1.localities = ['North Street', 'South Street', 'Kovil Street'];
    t1.collectors = [
      { id: 'c1', name: me, phone: st.user.phone || '9876543210', userId: 'me', localities: ['Kovil Street'] },
      { id: 'c2', name: 'Murugan K', phone: '9842011234', localities: ['North Street'] },
      { id: 'c3', name: 'Selvi Arumugam', phone: '9790055621', localities: ['South Street'] }
    ];
    TempleData.FAMILY_NAMES.slice(0, 30).forEach((n, i) => TempleData.addFamily(t1, { name: n + ' family', head: (['K.', 'P.', 'S.', 'M.', 'R.'][i % 5]) + ' ' + n, phone: '9' + String(700000000 + i * 104729).slice(0, 9), locality: t1.localities[i % 3], members: 3 + (i % 4), at: day(40) }));
    // Collections: about half fully paid, some partial, some above the suggested amount, the rest pending.
    t1.families.forEach((f, i) => {
      const k = i % 10, col = f.collectorId;
      if (k < 4) TempleData.addCollection(t1, { familyId: f.id, amountP: RP(2001), method: i % 3 ? 'Cash' : 'UPI', ref: i % 3 ? '' : 'UPI' + (8812000 + i), collectorId: col, at: day(2 + i % 9) });
      else if (k === 4) TempleData.addCollection(t1, { familyId: f.id, amountP: RP(5001), method: 'Bank', ref: 'NEFT' + (55100 + i), collectorId: col, at: day(6) });
      else if (k === 5) TempleData.addCollection(t1, { familyId: f.id, amountP: RP(1000), method: 'Cash', collectorId: col, at: day(4), note: 'Rest after harvest' });
      else if (k === 6 && i > 10) TempleData.addCollection(t1, { familyId: f.id, amountP: RP(2001), method: 'UPI', ref: '', collectorId: col, at: new Date(Date.now() - 40 * 60000).toISOString(), status: 'PENDING' });
    });
    // A late-entered cash collection and a voided receipt (number not reused).
    const lateF = t1.families.find(f => f.locality === 'Kovil Street' && !t1.collections.some(c => c.familyId === f.id));
    if (lateF) TempleData.addCollection(t1, { familyId: lateF.id, amountP: RP(2001), method: 'Cash', collectorId: 'c1', at: day(5), recordedAt: day(1), note: 'Collected at the temple, entered later' });
    const vf = t1.families[1];
    const v = TempleData.addCollection(t1, { familyId: vf.id, amountP: RP(2100), method: 'Cash', collectorId: vf.collectorId, at: day(3) });
    v.status = 'VOID'; v.voidReason = 'Wrong amount written (₹2,100 instead of ₹2,001)'; v.history.push({ s: 'VOID', at: day(3), by: 'me', note: v.voidReason });
    t1.handovers.push({ id: uid('h'), collectorId: 'c2', declaredP: RP(8004), countedP: RP(8004), at: day(2), by: 'me', note: '' });
    t1.handovers.push({ id: uid('h'), collectorId: 'c3', declaredP: RP(6003), countedP: RP(5503), at: day(1), by: 'me', note: '₹500 short — Selvi to check with Arumugam family' });
    t1.assignHistory.push({ at: day(30), target: 'South Street', from: 'Murugan K', to: 'Selvi Arumugam', by: 'me', reason: 'Murugan covering North Street only this year' });
    t1.disputes.push({ id: uid('d'), familyId: t1.families[7].id, text: 'We paid ₹2,001 in cash to the collector last week but it is not shown.', at: day(1), status: 'Open', by: t1.families[7].head });
    st.services.push({ id: id1, type: 'temple', name: 'Aippasi Thiruvizha 2026', status: 'active', code: 'SMK-0926', createdBy: 'me', createdAt: day(45), place: 'Sri Mariamman Kovil' });
    st.memberships.push({ svcId: id1, role: 'admin', status: 'active', joinedAt: day(45) });
    st.mod.temple[id1] = t1;

    /* 2. You are only a collector: you see your 6 assigned families, nothing else. */
    const id2 = 's_tem2';
    const t2 = TempleData.defaults();
    Object.assign(t2.temple, { name: 'Ayyanar Kovil', place: 'Pudhu Colony', trust: '' });
    Object.assign(t2.campaign, { name: 'Kumbabishekam Fund', purpose: 'Kumbabishekam', period: '2026', type: 'fixed', amountP: RP(5000), receiptPrefix: 'AYK-', nextNo: 201, dueDate: new Date(Date.now() + 9 * 86400000).toLocaleDateString('en-CA', { timeZone: TZ }) });
    t2.localities = ['Pudhu Colony', 'Mettu Street', 'Pallivasal Street'];
    t2.collectors = [{ id: 'c1', name: me, phone: st.user.phone || '9876543210', userId: 'me', localities: ['Pudhu Colony'] }, { id: 'c2', name: 'Velu Swamy', phone: '9443300112', localities: ['Mettu Street', 'Pallivasal Street'] }];
    TempleData.FAMILY_NAMES.slice(10, 28).forEach((n, i) => TempleData.addFamily(t2, { name: n + ' family', head: 'T. ' + n, phone: '9' + String(600000000 + i * 7121).slice(0, 9), locality: i < 6 ? 'Pudhu Colony' : t2.localities[1 + (i % 2)], at: day(20) }));
    t2.families.forEach((f, i) => { if (i % 3 === 0) TempleData.addCollection(t2, { familyId: f.id, amountP: RP(5000), method: 'Cash', collectorId: f.collectorId, at: day(3 + i) }); if (i === 4) TempleData.addCollection(t2, { familyId: f.id, amountP: RP(2000), method: 'Cash', collectorId: f.collectorId, at: day(2) }); });
    st.services.push({ id: id2, type: 'temple', name: 'Kumbabishekam Fund', status: 'active', code: 'AYK-3310', createdBy: 'Ramasamy (trustee)', createdAt: day(25), place: 'Ayyanar Kovil' });
    st.memberships.push({ svcId: id2, role: 'collector', status: 'active', joinedAt: day(25) });
    st.mod.temple[id2] = t2;

    /* 3. Family view: your household's dues and receipts only. */
    const id3 = 's_tem3';
    const t3 = TempleData.defaults();
    Object.assign(t3.temple, { name: 'Sri Perumal Kovil', place: 'Main Road', trust: '' });
    Object.assign(t3.campaign, { name: 'Annadhanam 2026', purpose: 'Annadhanam', period: 'Monthly · 2026', type: 'fixed', amountP: RP(500), recurring: 'monthly', receiptPrefix: 'SPK-AN-', nextNo: 87, dueDate: new Date(Date.now() + 5 * 86400000).toLocaleDateString('en-CA', { timeZone: TZ }) });
    t3.localities = ['Main Road'];
    t3.collectors = [{ id: 'c1', name: 'Ganesan P', phone: '9894012345', localities: ['Main Road'] }];
    const mine = TempleData.addFamily(t3, { name: (me.split(' ').slice(-1)[0] || 'Your') + ' family', head: me, phone: st.user.phone || '9876543210', locality: 'Main Road', userId: 'me', at: day(200) });
    [3, 2, 1].forEach(m => TempleData.addCollection(t3, { familyId: mine.id, amountP: RP(500), method: m === 1 ? 'UPI' : 'Cash', ref: m === 1 ? 'UPI7741203' : '', collectorId: 'c1', at: day(m * 30 + 2), period: istDate(day(m * 30)).slice(0, 7) }));
    st.services.push({ id: id3, type: 'temple', name: 'Annadhanam 2026', status: 'active', code: 'SPK-1102', createdBy: 'Sri Perumal Kovil trust', createdAt: day(200), place: 'Sri Perumal Kovil' });
    st.memberships.push({ svcId: id3, role: 'family', status: 'active', joinedAt: day(200) });
    st.mod.temple[id3] = t3;
  }
};

/* ---------- Queries ---------- */
const Temple = {
  t: id => modData('temple', id),
  fam: (t, fid) => t.families.find(f => f.id === fid),
  col: (t, cid) => t.collectors.find(c => c.id === cid),
  meCol: t => t.collectors.find(c => c.userId === 'me'),
  meFam: t => t.families.find(f => f.userId === 'me'),
  expected(t, f) { return t.campaign.type === 'per_family' ? (f.expectedP || 0) : t.campaign.amountP; },
  // Only confirmed collections count. Void and failed are excluded; pending digital is shown separately.
  // Monthly collections count only the current period (YYYY-MM); one-time collections count everything.
  period: t => t.campaign.recurring === 'monthly' ? istToday().slice(0, 7) : '',
  famPaid(t, fid) { const per = Temple.period(t); return t.collections.filter(c => c.familyId === fid && c.status === 'CONFIRMED' && (!per || c.period === per)).reduce((a, c) => a + c.amountP, 0); },
  famStatus(t, f) {
    if (f.status !== 'active') return 'inactive';
    const e = Temple.expected(t, f), p = Temple.famPaid(t, f.id);
    if (p === 0) return 'pending';
    if (p > e && t.campaign.type !== 'suggested') return 'over';
    return p >= e ? 'paid' : 'partial';
  },
  // Families the current user may see: admins see all, collectors only their assigned ones, families only their own.
  visible(id) {
    const t = Temple.t(id), r = myRole(id);
    if (r === 'admin') return t.families;
    if (r === 'collector') { const c = Temple.meCol(t); return t.families.filter(f => c && f.collectorId === c.id); }
    return t.families.filter(f => f.userId === 'me');
  },
  canSeeFamily(id, fid) { return Temple.visible(id).some(f => f.id === fid); },
  totals(t, fams, cols) {
    const ids = new Set(fams.map(f => f.id));
    const list = (cols || t.collections).filter(c => ids.has(c.familyId));
    const ok = list.filter(c => c.status === 'CONFIRMED');
    const active = fams.filter(f => f.status === 'active');
    const expectedP = active.reduce((a, f) => a + Temple.expected(t, f), 0);
    const collectedP = ok.reduce((a, c) => a + c.amountP, 0);
    const cashP = ok.filter(c => c.method === 'Cash').reduce((a, c) => a + c.amountP, 0);
    // Pending is per family (a family that paid extra does not offset another family's balance).
    const pendingP = active.reduce((a, f) => a + Math.max(0, Temple.expected(t, f) - Temple.famPaid(t, f.id)), 0);
    const by = k => active.filter(f => Temple.famStatus(t, f) === k).length;
    return { expectedP, collectedP, pendingP, cashP, digitalP: collectedP - cashP, waitingP: list.filter(c => c.status === 'PENDING').reduce((a, c) => a + c.amountP, 0),
      families: active.length, paid: by('paid') + by('over'), partial: by('partial'), pending: by('pending'), records: list.length, voids: list.filter(c => c.status === 'VOID').length };
  },
  cashInHand(t, cid) {
    const cash = t.collections.filter(c => c.collectorId === cid && c.status === 'CONFIRMED' && c.method === 'Cash').reduce((a, c) => a + c.amountP, 0);
    const handed = t.handovers.filter(h => h.collectorId === cid).reduce((a, h) => a + h.declaredP, 0);
    return { cash, handed, inHand: cash - handed };
  },

  /* ---------- Actions ---------- */
  record(id, o) {
    const t = Temple.t(id), f = Temple.fam(t, o.familyId), role = myRole(id);
    if (!Reg.can(id, 'collect') || !Temple.canSeeFamily(id, o.familyId)) return Act.denied('record collections for this family');
    if (t.collections.some(c => c.req === o.req)) return null; // retried submit: no duplicate record
    const col = role === 'admin' && o.collectorId ? o.collectorId : (Temple.meCol(t) || {}).id || f.collectorId;
    const status = o.method === 'Cash' ? 'CONFIRMED' : 'PENDING';
    const c = TempleData.addCollection(t, { familyId: f.id, amountP: o.amountP, method: o.method, ref: o.ref, at: o.at, recordedAt: nowISO(), collectorId: col, status, note: o.note, req: o.req, by: 'me' });
    Act.audit(id, `Collection recorded · ${c.receiptNo}`, 'collections', { after: { family: f.fid, amount: rs(o.amountP), method: o.method, collectedOn: fmt.date(o.at), status } });
    if (status === 'PENDING') setTimeout(() => {
      const tt = Temple.t(id), cc = tt && tt.collections.find(x => x.id === c.id);
      if (!cc || cc.status !== 'PENDING') return;
      if (S().sim.upiFail) { cc.status = 'FAILED'; cc.history.push({ s: 'FAILED', at: nowISO(), by: 'Bank webhook', note: 'Payment declined' }); Act.notify(id, 'Digital payment failed', `${f.name}: ${rs(cc.amountP)} was not received. Receipt ${cc.receiptNo} is not valid.`, { s: 'templeReceipt', p: { id, cid: cc.id } }, { kind: 'nCollection' }); }
      else { cc.status = 'CONFIRMED'; cc.verified = true; cc.history.push({ s: 'CONFIRMED', at: nowISO(), by: 'Bank webhook (verified)' }); Act.notify(id, 'Digital payment confirmed', `${f.name} · ${rs(cc.amountP)} · ${cc.receiptNo}`, { s: 'templeReceipt', p: { id, cid: cc.id } }, { kind: 'nCollection', private: true }); }
      Act.commit();
    }, 3000);
    Store.save();
    return c;
  },
  voidReceipt(id, cid, reason, reissue) {
    const t = Temple.t(id), c = t.collections.find(x => x.id === cid);
    if (!Reg.can(id, 'receipts.void')) return Act.denied('void receipts');
    const was = c.status;
    c.status = 'VOID'; c.voidReason = reason; c.history.push({ s: 'VOID', at: nowISO(), by: 'me', note: reason });
    Act.audit(id, `Receipt ${c.receiptNo} voided`, 'receipts', { before: { status: was, amount: rs(c.amountP) }, after: { status: 'VOID' }, reason });
    let n = null;
    if (reissue) {
      n = TempleData.addCollection(t, { familyId: reissue.familyId || c.familyId, amountP: reissue.amountP, method: c.method, ref: c.ref, at: c.at, recordedAt: nowISO(), collectorId: c.collectorId, note: `Corrected from ${c.receiptNo}`, by: 'me' });
      c.replacedBy = n.id; n.replaces = c.id;
      Act.audit(id, `Corrected receipt ${n.receiptNo} issued`, 'receipts', { after: { replaces: c.receiptNo, amount: rs(n.amountP) }, reason });
    }
    Act.commit();
    return n;
  },
  saveFamily(id, o) {
    const t = Temple.t(id);
    if (!Reg.can(id, 'families.manage')) return Act.denied('edit families');
    if (o.fid) {
      const f = Temple.fam(t, o.fid), before = { name: f.name, phone: fmt.masked(f.phone), locality: f.locality };
      Object.assign(f, { name: o.name, head: o.head, phone: o.phone, locality: o.locality, members: o.members, expectedP: o.expectedP });
      Act.audit(id, `Family ${f.fid} updated`, 'families', { before, after: { name: f.name, phone: fmt.masked(f.phone), locality: f.locality } });
      Act.commit();
      return f;
    }
    const f = TempleData.addFamily(t, o);
    Act.audit(id, `Family ${f.fid} registered`, 'families', { after: { name: f.name, locality: f.locality, collector: (Temple.col(t, f.collectorId) || {}).name || 'Unassigned' } });
    Act.commit();
    return f;
  },
  dupes(t, o) {
    const norm = s => (s || '').toLowerCase().replace(/[^a-z]/g, '');
    return t.families.filter(f => f.id !== o.fid && f.status === 'active' && ((o.phone && f.phone === o.phone) || (norm(f.name) === norm(o.name) && f.locality === o.locality)));
  },
  setFamilyStatus(id, fid, status, reason) {
    const t = Temple.t(id), f = Temple.fam(t, fid);
    if (!Reg.can(id, 'families.manage')) return Act.denied();
    const was = f.status; f.status = status;
    Act.audit(id, `Family ${f.fid} ${status === 'active' ? 'reactivated' : 'deactivated'}`, 'families', { before: { status: was }, after: { status }, reason });
    Act.commit();
  },
  // Merge a duplicate into the kept record: collections move, the duplicate is kept as "merged" for traceability.
  merge(id, keepId, dupId, reason) {
    const t = Temple.t(id), keep = Temple.fam(t, keepId), dup = Temple.fam(t, dupId);
    const moved = t.collections.filter(c => c.familyId === dupId);
    moved.forEach(c => { c.familyId = keepId; c.history.push({ s: c.status, at: nowISO(), by: 'me', note: `Moved from ${dup.fid} (merge)` }); });
    dup.status = 'merged'; dup.mergedInto = keepId;
    Act.audit(id, `Family ${dup.fid} merged into ${keep.fid}`, 'families', { before: { duplicate: dup.fid, collections: moved.length }, after: { kept: keep.fid }, reason });
    Act.commit();
  },
  reassign(id, fids, toCid, reason) {
    const t = Temple.t(id);
    if (!Reg.can(id, 'collectors.manage')) return Act.denied('reassign families');
    const to = Temple.col(t, toCid);
    fids.forEach(fid => {
      const f = Temple.fam(t, fid), from = Temple.col(t, f.collectorId);
      f.collectorId = toCid;
      t.assignHistory.unshift({ at: nowISO(), target: `${f.fid} ${f.name}`, from: from ? from.name : 'Unassigned', to: to.name, by: 'me', reason });
    });
    Act.audit(id, `${fids.length} famil${fids.length > 1 ? 'ies' : 'y'} reassigned to ${to.name}`, 'collector_assignments', { reason });
    Act.commit();
  },
  addCollector(id, name, phone, locs) {
    const t = Temple.t(id);
    if (t.collectors.some(c => c.phone === phone)) return 'This phone number is already a collector.';
    const c = { id: 'c' + (t.collectors.length + 1) + Math.random().toString(36).slice(2, 4), name, phone, localities: locs };
    t.collectors.push(c);
    t.families.filter(f => locs.includes(f.locality) && !f.collectorId).forEach(f => { f.collectorId = c.id; });
    Act.audit(id, `Collector ${name} added`, 'collector_assignments', { after: { localities: locs.join(', ') } });
    Act.commit();
    return '';
  },
  handover(id, cid, declaredP, countedP, note) {
    const t = Temple.t(id);
    t.handovers.unshift({ id: uid('h'), collectorId: cid, declaredP, countedP, at: nowISO(), by: 'me', note });
    Act.audit(id, `Cash handover · ${Temple.col(t, cid).name}`, 'handovers', { after: { declared: rs(declaredP), counted: rs(countedP), difference: rs(countedP - declaredP) }, reason: note });
    Act.commit();
  },
  dispute(id, fid, text) {
    const t = Temple.t(id);
    t.disputes.unshift({ id: uid('d'), familyId: fid, text, at: nowISO(), status: 'Open', by: 'me' });
    Act.audit(id, 'Discrepancy reported', 'disputes', { reason: text });
    Act.commit();
    UI.toast('Reported to the temple administrator', 'ok');
  },
  create(o) {
    const id = Act.newService('temple', o.campaign.name, { status: 'active', codePrefix: 'TMP', place: o.temple.name });
    const t = Object.assign(TempleData.defaults(), o);
    if (o.meCollector) t.collectors.unshift({ id: 'c0', name: S().user.name, phone: S().user.phone, userId: 'me', localities: o.myLocalities || [] });
    t.collectors.forEach(c => { c.localities = c.localities || []; });
    (S().mod.temple = S().mod.temple || {})[id] = t; // a new user has no temple records yet
    Act.audit(id, 'Temple collection created and activated', 'service', { after: { temple: t.temple.name, purpose: t.campaign.purpose, rule: CONTRIB[t.campaign.type], amount: rs(t.campaign.amountP) } });
    Act.notify(id, 'Collection is live', `${t.campaign.name} · ${t.collectors.length} collector${t.collectors.length > 1 ? 's' : ''}. Register families to start collecting.`, { s: 'templeHome', p: { id } });
    Store.save();
    return id;
  }
};

/* ---------- Registry definition ---------- */
Reg.register({
  key: 'temple', name: 'Temple Vari Tharagar', short: 'Temple', icon: 'temple', tint: '#FFE4E6', fg: '#BE123C', status: 'available', home: 'templeHome', joinRole: 'family',
  desc: 'Collect festival, pooja and maintenance contributions from families through Vari Tharagars, with receipts and reports.',
  createPerm: 'platform.create',
  roles: {
    admin: { label: 'Temple admin', tone: 'navy', perms: ['*'] },
    collector: { label: 'Vari Tharagar', tone: 'warn', perms: ['view', 'collect', 'receipts.share', 'handover'] },
    family: { label: 'Family', tone: 'teal', perms: ['view', 'family.own', 'dispute'] }
  },
  setup() { App.go('templeWizard'); },
  open(id) { App.go('templeHome', { id }); },
  summary(s, role) {
    const t = Temple.t(s.id); if (!t) return '';
    return `${t.temple.name} · ${t.campaign.purpose} · ${RECUR[t.campaign.recurring].toLowerCase()}`;
  },
  stats(s, role) {
    const t = Temple.t(s.id); if (!t) return [];
    if (role === 'family') { const f = Temple.meFam(t); return [[rs(Temple.expected(t, f)), 'Due'], [t.collections.filter(c => c.familyId === f.id && c.status === 'CONFIRMED').length, 'Receipts']]; }
    const x = Temple.totals(t, Temple.visible(s.id));
    return [[rs(x.collectedP), role === 'collector' ? 'You collected' : 'Collected'], [`${x.paid}/${x.families}`, 'Families paid'], [rs(x.pendingP), 'Pending']];
  },
  events(s, role) {
    const t = Temple.t(s.id); if (!t) return [];
    const at = t.campaign.dueDate + 'T18:00:00+05:30';
    if (role === 'family') return [{ at, title: `${t.campaign.purpose} contribution due`, sub: `${t.temple.name} · ${rs(Temple.expected(t, Temple.meFam(t)))}`, ic: 'temple', go: { s: 'templeHome', p: { id: s.id } } }];
    return [{ at, title: `Collection closes · ${t.campaign.name}`, sub: `${t.temple.name} · ${Temple.totals(t, Temple.visible(s.id)).pending} families pending`, ic: 'temple', go: { s: 'templeHome', p: { id: s.id } } }];
  },
  pending(s, role) {
    const t = Temple.t(s.id); if (!t) return [];
    const out = [];
    if (role === 'collector' || (role === 'admin' && Temple.meCol(t))) {
      const c = Temple.meCol(t), mine = t.families.filter(f => f.collectorId === c.id && f.status === 'active' && ['pending', 'partial'].includes(Temple.famStatus(t, f)));
      if (mine.length) out.push({ title: `${mine.length} of your families still to collect`, sub: `${t.campaign.name} · due ${fmt.dm(t.campaign.dueDate)}`, tone: 'warn', ic: 'users', go: { s: 'templeHome', p: { id: s.id, tab: 'families', fs: 'open' } } });
      const h = Temple.cashInHand(t, c.id);
      if (h.inHand > 0 && role === 'collector') out.push({ title: `Hand over ${rs(h.inHand)} cash`, sub: `${t.campaign.name} · to the temple admin`, tone: 'blue', ic: 'cash', go: { s: 'templeHome', p: { id: s.id, tab: 'overview' } } });
    }
    if (role === 'admin') {
      const pend = t.collections.filter(c => c.status === 'PENDING').length;
      if (pend) out.push({ title: `${pend} digital payment${pend > 1 ? 's' : ''} awaiting bank`, sub: t.campaign.name, tone: 'blue', ic: 'clock', go: { s: 'templeHome', p: { id: s.id, tab: 'collections' } } });
      const d = t.disputes.filter(x => x.status === 'Open').length;
      if (d) out.push({ title: `${d} family discrepanc${d > 1 ? 'ies' : 'y'} to review`, sub: t.campaign.name, tone: 'red', ic: 'flag', go: { s: 'templeDisputes', p: { id: s.id } } });
      const un = t.families.filter(f => f.status === 'active' && !f.collectorId).length;
      if (un) out.push({ title: `${un} famil${un > 1 ? 'ies have' : 'y has'} no collector`, sub: t.campaign.name, tone: 'warn', ic: 'users', go: { s: 'templeCollectors', p: { id: s.id } } });
    }
    if (role === 'family') {
      const f = Temple.meFam(t), st = Temple.famStatus(t, f);
      if (!['paid', 'over'].includes(st)) out.push({ title: `${t.campaign.recurring === 'monthly' ? fmt.mon(istToday()) + ' contribution' : 'Contribution due'} · ${rs(Temple.expected(t, f) - Temple.famPaid(t, f.id))}`, sub: `${t.temple.name} · due ${fmt.dm(t.campaign.dueDate)}`, tone: 'warn', ic: 'temple', go: { s: 'templeHome', p: { id: s.id } } });
    }
    return out;
  },
  seed: TempleData.seed
});
