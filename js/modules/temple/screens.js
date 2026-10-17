/* Temple Vari Tharagar module — screens. Admins, collectors (Vari Tharagar) and families see different
 * navigation inside the same service; collectors only ever receive their assigned families. */

const TUI = {
  famBadge(t, f) { const [l, tone] = FAM_ST[Temple.famStatus(t, f)] || ['Merged', 'grey']; return C.badge(l, tone); },
  colBadge(c) { return C.badge(COL_ST[c.status].label, COL_ST[c.status].tone); },
  method(c) { return c.method === 'Cash' ? 'Cash · recorded manually' : c.status === 'CONFIRMED' ? `${c.method} · bank-verified` : `${c.method} · not yet verified`; },
  famRow(id, t, f, admin) {
    const paid = Temple.famPaid(t, f.id), exp = Temple.expected(t, f), col = Temple.col(t, f.collectorId);
    return `<button class="li" onclick="App.go('templeFamily',{id:'${id}',fid:'${f.id}'})">${C.avatar(f.name, null, 36)}<span class="li-main"><span>${esc(f.name)} <span class="xs muted">${f.fid}</span></span><span class="xs muted">${esc(f.locality)}${admin ? ' · ' + (col ? esc(col.userId === 'me' ? 'You' : col.name) : '<b class="red">No collector</b>') : ''} · ${rs(paid)} of ${rs(exp)}</span></span>${TUI.famBadge(t, f)}</button>`;
  },
  colRow(id, t, c) {
    const f = Temple.fam(t, c.familyId), cl = Temple.col(t, c.collectorId);
    return `<button class="txn" onclick="App.go('templeReceipt',{id:'${id}',cid:'${c.id}'})"><span class="txn-ic ${c.status === 'VOID' || c.status === 'FAILED' ? 'out' : c.method === 'Cash' ? 'in' : 'pay'}">${icon(c.method === 'Cash' ? 'cash' : 'mobile', 16)}</span>
      <div class="grow" style="min-width:0"><div class="b sm ellipsis ${c.status === 'VOID' ? 'strike' : ''}">${esc(f.name)}</div><div class="tiny muted ellipsis">${c.receiptNo} · ${fmt.dm(c.at)} · ${esc(cl ? (cl.userId === 'me' ? 'You' : cl.name) : '')}${c.recordedAt && istDay(c.recordedAt) !== istDay(c.at) ? ' · entered later' : ''}</div></div>
      <div style="text-align:right"><b class="${c.status === 'VOID' ? 'strike muted' : ''}">${rs(c.amountP)}</b><div>${c.status === 'CONFIRMED' ? '' : TUI.colBadge(c)}</div></div></button>`;
  },
  handoverSheet(id, cid) {
    const t = Temple.t(id), c = Temple.col(t, cid), h = Temple.cashInHand(t, cid), admin = myRole(id) === 'admin';
    UI.sheet(`<div class="sheet-title">Cash handover</div><p class="xs muted mb12">${esc(c.userId === 'me' ? 'You' : c.name)} → temple admin. Differences are recorded, never hidden.</p>
      <div class="card p mb12">${C.rows([['Cash collected (recorded)', rs(h.cash)], ['Already handed over', '− ' + rs(h.handed)]], ['Cash in hand', rs(h.inHand)])}</div>
      ${C.field('Amount handed over', `<div class="prefix-input"><span>₹</span><input id="hoD" inputmode="decimal" value="${h.inHand / 100}"></div>`)}
      ${admin ? C.field('Amount counted by admin', `<div class="prefix-input"><span>₹</span><input id="hoC" inputmode="decimal" value="${h.inHand / 100}"></div>`, { hint: 'If the counted cash differs, the difference is kept on record with a note.' }) : ''}
      ${C.field('Note', '<input id="hoN" class="input" placeholder="Optional">', { opt: true })}
      <button class="btn btn-primary btn-block mt8" onclick="TUI._handover('${id}','${cid}')">${admin ? 'Record handover' : 'Send for counting'}</button>`);
  },
  _handover(id, cid) {
    const d = paise(document.getElementById('hoD').value), c = document.getElementById('hoC') ? paise(document.getElementById('hoC').value) : d, n = document.getElementById('hoN').value.trim();
    if (!d) return UI.toast('Enter the amount', 'err');
    if (c !== d && !n) return UI.toast('Add a note explaining the difference', 'err');
    UI.close(true); Temple.handover(id, cid, d, c, n);
    UI.toast(c === d ? 'Handover recorded' : `Recorded with a ${rs(c - d)} difference`, c === d ? 'ok' : 'err');
  }
};

/* ===================== Create temple collection ===================== */
const TW = {
  p() { return App.top().params; },
  set(path, v) { const p = TW.p(); const [a, b] = path.split('.'); if (b) p.d[a][b] = v; else p.d[a] = v; App.refresh(); },
  addLoc() { const el = document.getElementById('locIn'), v = el.value.trim(); if (!v) return; const p = TW.p(); if (!p.d.localities.includes(v)) p.d.localities.push(v); App.refresh(); },
  addCol() {
    const n = document.getElementById('colN').value.trim(), ph = document.getElementById('colP').value.replace(/\D/g, ''), l = document.getElementById('colL').value;
    if (n.length < 2 || !/^[6-9]\d{9}$/.test(ph)) return UI.toast('Enter a name and a valid 10-digit mobile number', 'err');
    TW.p().d.collectors.push({ id: 'c' + (TW.p().d.collectors.length + 1), name: n, phone: ph, localities: l ? [l] : [] });
    App.refresh();
  },
  errs() {
    const d = TW.p().d, e = {};
    if (!d.temple.name.trim()) e.temple = 'Enter the temple name';
    if (!d.campaign.name.trim()) e.name = 'Enter a name for this collection';
    if (!d.campaign.dueDate) e.due = 'Pick a due date';
    if (d.campaign.type !== 'per_family' && !(d.campaign.amountP > 0)) e.amount = 'Enter the amount';
    if (!/^[A-Z0-9-]{2,12}$/.test(d.campaign.receiptPrefix)) e.prefix = 'Use 2–12 capital letters, digits or dashes';
    if (!d.localities.length) e.loc = 'Add at least one street or locality';
    if (!d.collectors.length && !d.meCollector) e.col = 'Add at least one Vari Tharagar, or collect yourself';
    return e;
  },
  next() {
    const p = TW.p(), e = TW.errs(), F = { 1: ['temple', 'name', 'due'], 2: ['amount', 'prefix'], 3: ['loc', 'col'] }[p.step] || [];
    if (F.some(k => e[k])) { p.showErr = true; return App.refresh(); }
    p.showErr = false; p.step++; App.refresh();
  },
  create() {
    const d = TW.p().d;
    UI.confirm({ title: 'Start this collection?', message: `${esc(d.campaign.name)} at ${esc(d.temple.name)}. Collectors are notified and can record collections for their families.`, confirm: 'Activate', icon: 'temple', onConfirm: () => { const id = Temple.create(d); App.reset('templeHome', { id }); UI.toast('Collection activated', 'ok'); } });
  }
};

App.reg('templeWizard', {
  render(p) {
    if (!p.d) { p.d = TempleData.defaults(); p.step = 1; p.d.myLocalities = []; }
    const d = p.d, e = p.showErr ? TW.errs() : {};
    const O = (path, map) => { const [a, b] = path.split('.'); return Object.entries(map).map(([k, l]) => `<button class="opt ${d[a][b] === k ? 'on' : ''}" onclick="TW.set('${path}','${k}')"><span class="radio"></span><span class="grow b">${l}</span></button>`).join(''); };
    let body = '';
    if (p.step === 1) body = `
      <div class="info-card teal mb16">${icon('temple', 16)}<div>Collection rules differ between temples, so each one is set up here rather than assumed.</div></div>
      ${C.field('Temple name', `<input class="input ${e.temple ? 'err' : ''}" value="${esc(d.temple.name)}" placeholder="e.g. Sri Mariamman Kovil" onchange="TW.p().d.temple.name=this.value">`, { req: true, err: e.temple })}
      ${C.field('Village / place', `<input class="input" value="${esc(d.temple.place)}" onchange="TW.p().d.temple.place=this.value">`, { opt: true })}
      ${C.field('Trust registration', `<input class="input" value="${esc(d.temple.trust)}" onchange="TW.p().d.temple.trust=this.value">`, { opt: true })}
      <div class="divider"></div>
      ${C.field('Collection name', `<input class="input ${e.name ? 'err' : ''}" value="${esc(d.campaign.name)}" placeholder="e.g. Aippasi Thiruvizha 2026" onchange="TW.p().d.campaign.name=this.value">`, { req: true, err: e.name })}
      <div class="label">Purpose</div><div class="chips wrap mb16">${PURPOSES.map(x => `<button class="chip ${d.campaign.purpose === x ? 'on' : ''}" onclick="TW.set('campaign.purpose','${x}')">${x}</button>`).join('')}</div>
      <div class="row gap12"><div class="grow">${C.field('Period', `<input class="input" value="${esc(d.campaign.period)}" placeholder="Oct – Nov 2026" onchange="TW.p().d.campaign.period=this.value">`)}</div>
        <div class="grow">${C.field('Due date', `<input type="date" class="input ${e.due ? 'err' : ''}" value="${d.campaign.dueDate}" onchange="TW.p().d.campaign.dueDate=this.value">`, { err: e.due })}</div></div>`;
    if (p.step === 2) body = `
      <div class="label">Expected contribution</div>${O('campaign.type', CONTRIB)}
      ${d.campaign.type !== 'per_family' ? `<div class="mt12">${C.field(d.campaign.type === 'fixed' ? 'Amount per family' : 'Suggested amount', `<div class="prefix-input ${e.amount ? 'err' : ''}"><span>₹</span><input inputmode="numeric" value="${d.campaign.amountP / 100}" onchange="TW.p().d.campaign.amountP=paise(this.value)"></div>`, { err: e.amount })}</div>` : '<p class="xs muted mt8">You will enter the expected amount when registering each family.</p>'}
      <div class="label mt16">How often</div>${O('campaign.recurring', RECUR)}
      <div class="group mt16"><div class="li"><span class="li-main"><span>Allow part payments</span><span class="xs muted">Families can pay in instalments; shown as part paid</span></span>${C.toggle(d.campaign.partial, "TW.set('campaign.partial',!TW.p().d.campaign.partial)")}</div></div>
      <div class="row gap12 mt16"><div class="grow">${C.field('Receipt prefix', `<input class="input ${e.prefix ? 'err' : ''}" value="${esc(d.campaign.receiptPrefix)}" oninput="this.value=this.value.toUpperCase()" onchange="TW.p().d.campaign.receiptPrefix=this.value;App.refresh()">`, { err: e.prefix })}</div>
        <div style="width:110px">${C.field('Starts at', `<input class="input" inputmode="numeric" value="${d.campaign.nextNo}" onchange="TW.p().d.campaign.nextNo=Math.max(1,parseInt(this.value)||1);App.refresh()">`)}</div></div>
      <div class="receipt-mini">${icon('receipt', 16)}First receipt: <b>${esc(d.campaign.receiptPrefix)}${String(d.campaign.nextNo).padStart(4, '0')}</b> · numbers are never reused, even after a void.</div>`;
    if (p.step === 3) body = `
      <div class="label">Streets / localities</div>
      <div class="chips wrap mb8">${d.localities.map(l => `<span class="chip on">${esc(l)}<button onclick="TW.p().d.localities=TW.p().d.localities.filter(x=>x!=='${esc(l)}');App.refresh()" aria-label="Remove">${icon('x', 13)}</button></span>`).join('')}</div>
      <div class="row gap8 mb8"><input id="locIn" class="input" placeholder="e.g. North Street"><button class="btn btn-outline btn-md" onclick="TW.addLoc()">Add</button></div>
      ${e.loc ? `<div class="field-err mb8">${icon('alert', 13)}${e.loc}</div>` : ''}
      <div class="divider"></div>
      <div class="label">Vari Tharagar (collectors)</div>
      <div class="group mb8"><div class="li"><span class="li-main"><span>I will also collect</span><span class="xs muted">You appear as a collector for the localities you pick</span></span>${C.toggle(d.meCollector, "TW.set('meCollector',!TW.p().d.meCollector)")}</div>
        ${d.meCollector ? `<div class="li" style="flex-wrap:wrap"><span class="xs muted" style="width:100%">My localities</span>${d.localities.map(l => `<button class="chip ${d.myLocalities.includes(l) ? 'on' : ''}" onclick="var m=TW.p().d.myLocalities;TW.p().d.myLocalities=m.includes('${esc(l)}')?m.filter(x=>x!=='${esc(l)}'):m.concat('${esc(l)}');App.refresh()">${esc(l)}</button>`).join('') || '<span class="xs muted">Add localities first</span>'}</div>` : ''}
        ${d.collectors.map(c => `<div class="li">${C.avatar(c.name, null, 32)}<span class="li-main"><span>${esc(c.name)}</span><span class="xs muted">${fmt.masked(c.phone)} · ${c.localities.join(', ') || 'No locality yet'}</span></span></div>`).join('')}</div>
      <div class="card p"><div class="row gap8"><input id="colN" class="input" placeholder="Name"><input id="colP" class="input" inputmode="numeric" maxlength="10" placeholder="Mobile"></div>
        <div class="row gap8 mt8"><select id="colL" class="select"><option value="">Locality (optional)</option>${d.localities.map(l => `<option>${esc(l)}</option>`).join('')}</select><button class="btn btn-outline btn-md" onclick="TW.addCol()">Add</button></div></div>
      ${e.col ? `<div class="field-err mt8">${icon('alert', 13)}${e.col}</div>` : ''}`;
    if (p.step === 4) body = `
      <div class="card p mb12"><div class="card-title">Temple</div>${C.rows([['Temple', esc(d.temple.name)], ['Place', esc(d.temple.place || '—')], ['Registration', esc(d.temple.trust || '—')]])}</div>
      <div class="card p mb12"><div class="card-title">Collection</div>${C.rows([['Name', esc(d.campaign.name)], ['Purpose', d.campaign.purpose], ['Period', esc(d.campaign.period || '—')], ['Due', fmt.date(d.campaign.dueDate)], ['Rule', CONTRIB[d.campaign.type]], ['Amount', d.campaign.type === 'per_family' ? 'Per family' : rs(d.campaign.amountP)], ['Frequency', RECUR[d.campaign.recurring]], ['Part payments', d.campaign.partial ? 'Allowed' : 'Not allowed'], ['Receipts', `${esc(d.campaign.receiptPrefix)}${String(d.campaign.nextNo).padStart(4, '0')} onwards`]])}</div>
      <div class="card p mb12"><div class="card-title">Collectors</div>${C.rows((d.meCollector ? [['You', d.myLocalities.join(', ') || '—']] : []).concat(d.collectors.map(c => [esc(c.name), c.localities.join(', ') || '—'])))}</div>
      <div class="info-card">${icon('info', 16)}<div>Next you register families. Families in a locality are assigned to that locality's collector automatically.</div></div>`;
    const titles = ['Temple & purpose', 'Contribution rules', 'Localities & collectors', 'Review & activate'];
    return `${C.appbar('Temple collection', { white: true, onBack: `TW.p().step>1?(TW.p().step--,App.refresh()):App.back()` })}
      ${C.progress(p.step, 4, titles[p.step - 1])}
      <div class="content pad" style="padding-top:4px">${body}</div>
      <div class="footer">${p.step > 1 ? `<button class="btn btn-outline" onclick="TW.p().step--;App.refresh()">Back</button>` : ''}${p.step < 4 ? `<button class="btn btn-primary grow" onclick="TW.next()">Continue</button>` : `<button class="btn btn-primary grow" onclick="TW.create()">${icon('check', 18)}Activate collection</button>`}</div>`;
  }
});

/* ===================== Temple home ===================== */
const templeGuard = p => !svcById(p.id) ? 'notFound' : !membership(p.id) ? 'denied' : '';

App.reg('templeHome', {
  net: true,
  guard: templeGuard,
  render(p) {
    const s = svcById(p.id), t = Temple.t(p.id), role = myRole(p.id), admin = role === 'admin';
    if (role === 'family') return TempleFamilyView(p, s, t);
    const fams = Temple.visible(p.id), x = Temple.totals(t, fams);
    const tab = p.tab || 'overview';
    const tabs = [['overview', 'Overview'], ['families', admin ? 'Families' : 'My families', admin ? 0 : x.pending + x.partial], ['collections', 'Collections'], ['receipts', 'Receipts']].concat(admin ? [['more', 'More']] : []);
    const pct = x.expectedP ? x.collectedP / x.expectedP * 100 : 0;
    const hero = `<div class="p-hero tem-hero">
      <div class="row between"><span class="sub">${esc(t.temple.name)} · ${t.campaign.purpose}</span>${C.roleBadge(role, 'temple')}</div>
      <div class="row between mt8" style="align-items:flex-end"><div><div class="sub">${admin ? 'Collected' : 'You collected'}</div><div class="hero-big">${rs(x.collectedP)}</div></div><div style="text-align:right"><div class="sub">${t.campaign.type === 'suggested' ? 'Suggested total' : 'Expected'}</div><div class="h3">${rs(x.expectedP)}</div></div></div>
      <div class="meter light mt8"><i style="width:${Math.min(100, pct)}%"></i></div>
      <div class="row between mt8 xs" style="opacity:.85"><span>${x.paid} paid · ${x.partial} part · ${x.pending} pending</span><span>Due ${fmt.dm(t.campaign.dueDate)}</span></div></div>`;

    let body = '';
    if (tab === 'overview') body = TempleHome.overview(p.id, t, admin, x, fams);
    if (tab === 'families') body = TempleHome.families(p.id, t, admin, fams, p);
    if (tab === 'collections') body = TempleHome.collections(p.id, t, fams, p);
    if (tab === 'receipts') body = TempleHome.receipts(p.id, t, fams, p);
    if (tab === 'more') body = TempleHome.more(p.id, t);
    return `${C.appbar(esc(s.name), { white: true, sub: `${Reg.get('temple').name} · ${esc(t.temple.name)}`, right: admin ? `<button class="iconbtn" onclick="App.go('templeFamilyForm',{id:'${p.id}'})" aria-label="Add family">${icon('plus', 22)}</button>` : '' })}
      <div class="content">
        <div class="px mt12">${hero}</div>
        <div class="mt12">${C.tabsLine('tem-' + p.id, tabs, tab, "App.set('tab',")}</div>
        ${body}
      </div>
      <div class="footer"><button class="btn btn-primary btn-block" onclick="App.go('templeCollect',{id:'${p.id}'})">${icon('plus', 18)}Record collection</button></div>`;
  }
});

const TempleHome = {
  overview(id, t, admin, x, fams) {
    const s = svcById(id), pend = Reg.get('temple').pending(s, myRole(id));
    const me = Temple.meCol(t);
    const colCards = (admin ? t.collectors : [me]).filter(Boolean).map(c => {
      const mine = t.families.filter(f => f.collectorId === c.id), tt = Temple.totals(t, mine), h = Temple.cashInHand(t, c.id);
      return `<div class="card p mb8"><div class="row gap12">${C.avatar(c.name, null, 38)}<div class="grow"><div class="b">${esc(c.userId === 'me' ? 'You' : c.name)}</div><div class="xs muted">${(c.localities || []).join(', ') || 'No locality'} · ${mine.length} families</div></div><b>${rs(tt.collectedP)}</b></div>
        ${C.bar(tt.expectedP ? tt.collectedP / tt.expectedP * 100 : 0)}
        <div class="row between mt8 xs"><span class="muted">${tt.paid} paid · ${tt.partial} part · ${tt.pending} pending</span><span class="${h.inHand ? 'b' : 'muted'}">Cash in hand ${rs(h.inHand)}</span></div>
        ${h.inHand > 0 ? `<button class="btn btn-outline btn-sm btn-block mt8" onclick="TUI.handoverSheet('${id}','${c.id}')">${icon('cash', 15)}${admin ? 'Record cash handover' : 'Hand over cash'}</button>` : ''}</div>`;
    }).join('');
    const open = fams.filter(f => f.status === 'active' && ['pending', 'partial'].includes(Temple.famStatus(t, f))).slice(0, 5);
    return `
      ${pend.length ? `<div class="px mt12">${pend.map(a => `<button class="status-banner ${a.tone} act-row" onclick="App.go('${a.go.s}',${JSON.stringify(a.go.p).replace(/"/g, "'")})"><div class="sb-ic">${icon(a.ic, 18)}</div><div class="grow"><h3>${a.title}</h3><p>${a.sub}</p></div>${icon('chevron', 16)}</button>`).join('')}</div>` : ''}
      ${C.sec('Totals', `<span class="xs muted">From ${x.records} records</span>`)}<div class="px"><div class="mini-grid">
        <div class="mini"><div class="l">${t.campaign.type === 'suggested' ? 'Suggested total' : 'Expected'}</div><div class="v">${rs(x.expectedP)}</div></div>
        <div class="mini"><div class="l">Collected</div><div class="v green">${rs(x.collectedP)}</div></div>
        <div class="mini"><div class="l">Pending</div><div class="v red">${rs(x.pendingP)}</div></div>
        <div class="mini"><div class="l">Families</div><div class="v">${x.families}</div></div>
        <div class="mini"><div class="l">Cash (manual)</div><div class="v">${rs(x.cashP)}</div></div>
        <div class="mini"><div class="l">Digital (verified)</div><div class="v">${rs(x.digitalP)}</div></div></div>
        ${x.waitingP ? `<div class="info-card mt8">${icon('clock', 16)}<div>${rs(x.waitingP)} in digital payments is waiting for bank confirmation and is not counted yet.</div></div>` : ''}</div>
      ${C.sec(admin ? 'Collectors' : 'Your collection')}<div class="px">${colCards}</div>
      ${open.length ? `${C.sec('Still to collect', `<button class="link" onclick="App.set('tab','families')">All</button>`)}<div class="px"><div class="group">${open.map(f => TUI.famRow(id, t, f, admin)).join('')}</div></div>` : ''}
      ${C.sec('Recent collections', `<button class="link" onclick="App.set('tab','collections')">All</button>`)}<div class="px"><div class="group">${t.collections.filter(c => fams.some(f => f.id === c.familyId)).slice().sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)).slice(0, 5).map(c => TUI.colRow(id, t, c)).join('') || '<p class="pad sm muted">No collections yet.</p>'}</div></div>`;
  },

  families(id, t, admin, fams, p) {
    const q = (p.q || '').toLowerCase(), loc = p.loc || '', fs = p.fs || 'all';
    let list = fams.filter(f => f.status !== 'merged');
    if (q) list = list.filter(f => (f.name + f.head + f.fid + f.phone).toLowerCase().includes(q));
    if (loc) list = list.filter(f => f.locality === loc);
    if (fs === 'open') list = list.filter(f => ['pending', 'partial'].includes(Temple.famStatus(t, f)));
    if (fs === 'paid') list = list.filter(f => ['paid', 'over'].includes(Temple.famStatus(t, f)));
    if (fs === 'inactive') list = list.filter(f => f.status !== 'active');
    const locs = [...new Set(fams.map(f => f.locality))];
    return `<div class="px mt12">
      ${!admin ? `<div class="info-card mb12">${icon('lock', 16)}<div>You see only the ${fams.length} families assigned to you.</div></div>` : ''}
      <div class="search-bar mb8">${icon('search', 18)}<input id="fq" style="border:0;outline:0;background:none;flex:1;font-size:14px" placeholder="Name, family ID or phone" value="${esc(p.q || '')}" onchange="App.set('q',this.value)"></div>
      <div class="chips wrap mb8">${[['all', 'All'], ['open', 'To collect'], ['paid', 'Paid']].concat(admin ? [['inactive', 'Inactive']] : []).map(([k, l]) => `<button class="chip ${fs === k ? 'on' : ''}" onclick="App.set('fs','${k}')">${l}</button>`).join('')}</div>
      ${locs.length > 1 ? `<div class="chips wrap mb12">${['', ...locs].map(l => `<button class="chip dark ${loc === l ? 'on' : ''}" onclick="App.set('loc','${esc(l)}')">${esc(l || 'All streets')}</button>`).join('')}</div>` : ''}
      <div class="group">${list.map(f => TUI.famRow(id, t, f, admin)).join('') || '<p class="pad sm muted center">No families match.</p>'}</div>
      ${admin ? `<button class="btn btn-outline btn-block mt12" onclick="App.go('templeFamilyForm',{id:'${id}'})">${icon('plus', 17)}Register a family</button>` : ''}</div>`;
  },

  collections(id, t, fams, p) {
    const ids = new Set(fams.map(f => f.id)), m = p.cm || 'all';
    let list = t.collections.filter(c => ids.has(c.familyId)).slice().sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
    if (m === 'cash') list = list.filter(c => c.method === 'Cash');
    if (m === 'digital') list = list.filter(c => c.method !== 'Cash');
    if (m === 'issues') list = list.filter(c => c.status !== 'CONFIRMED');
    return `<div class="px mt12">${C.seg('tc-' + id, [['all', 'All'], ['cash', 'Cash'], ['digital', 'Digital'], ['issues', 'Pending/void']], m, "App.set('cm',")}
      <div class="group mt12">${list.map(c => TUI.colRow(id, t, c)).join('') || '<p class="pad sm muted center">Nothing here.</p>'}</div></div>`;
  },

  receipts(id, t, fams, p) {
    const ids = new Set(fams.map(f => f.id)), q = (p.rq || '').toUpperCase();
    const list = t.collections.filter(c => ids.has(c.familyId) && (!q || c.receiptNo.includes(q))).slice().sort((a, b) => b.receiptNo.localeCompare(a.receiptNo));
    return `<div class="px mt12">
      <div class="search-bar mb12">${icon('search', 18)}<input style="border:0;outline:0;background:none;flex:1;font-size:14px" placeholder="Receipt number" value="${esc(p.rq || '')}" onchange="App.set('rq',this.value)"></div>
      <div class="group">${list.map(c => { const f = Temple.fam(t, c.familyId); return `<button class="li" onclick="App.go('templeReceipt',{id:'${id}',cid:'${c.id}'})"><span class="li-ic">${icon('receipt', 17)}</span><span class="li-main"><span class="${c.status === 'VOID' ? 'strike' : ''}">${c.receiptNo}</span><span class="xs muted">${esc(f.name)} · ${fmt.date(c.at)}</span></span><span style="text-align:right"><b class="${c.status === 'VOID' ? 'strike muted' : ''}">${rs(c.amountP)}</b><br>${c.status === 'CONFIRMED' ? C.badge(c.method === 'Cash' ? 'Cash' : 'Verified', c.method === 'Cash' ? 'grey' : 'blue') : TUI.colBadge(c)}</span></button>`; }).join('') || '<p class="pad sm muted center">No receipts.</p>'}</div></div>`;
  },

  more(id, t) {
    return `<div class="px mt12"><div class="group">
      ${C.item('chart', 'Reports', `App.go('templeReports',{id:'${id}'})`, { sub: 'Collector-, locality-, purpose-wise and cash vs digital' })}
      ${C.item('users', 'Collectors & assignments', `App.go('templeCollectors',{id:'${id}'})`, { sub: `${t.collectors.length} Vari Tharagar · ${t.assignHistory.length} assignment changes` })}
      ${C.item('cash', 'Cash handovers', `App.go('templeHandovers',{id:'${id}'})`, { right: t.handovers.length })}
      ${C.item('flag', 'Family discrepancies', `App.go('templeDisputes',{id:'${id}'})`, { right: t.disputes.filter(d => d.status === 'Open').length || '' })}
      ${C.item('history', 'Audit log', `App.go('audit',{svc:'${id}'})`)}
      ${C.item('share', 'Invite code for families', `UI.copy('${svcById(id).code}','Invite code copied')`, { right: svcById(id).code, noChev: true })}
    </div>
    <div class="group-label">Collection settings</div>
    <div class="card p">${C.rows([['Rule', CONTRIB[t.campaign.type]], ['Amount', t.campaign.type === 'per_family' ? 'Per family' : rs(t.campaign.amountP)], ['Frequency', RECUR[t.campaign.recurring]], ['Part payments', t.campaign.partial ? 'Allowed' : 'Not allowed'], ['Due date', fmt.date(t.campaign.dueDate)], ['Next receipt', t.campaign.receiptPrefix + String(t.campaign.nextNo).padStart(4, '0')]])}</div></div>`;
  }
};

/* Family role: own dues, receipts and discrepancy reporting (spec §7.7). */
function TempleFamilyView(p, s, t) {
  const f = Temple.meFam(t), exp = Temple.expected(t, f), paid = Temple.famPaid(t, f.id), st = Temple.famStatus(t, f);
  const mine = t.collections.filter(c => c.familyId === f.id).slice().sort((a, b) => b.at.localeCompare(a.at));
  const col = Temple.col(t, f.collectorId);
  return `${C.appbar(esc(s.name), { white: true, sub: esc(t.temple.name) })}
    <div class="content px">
      <div class="p-hero tem-hero mt12"><div class="row between"><span class="sub">${f.fid} · ${esc(f.name)}</span>${C.roleBadge('family', 'temple')}</div>
        <div class="sub mt8">${t.campaign.recurring === 'monthly' ? fmt.mon(istToday()) + ' contribution' : t.campaign.purpose + ' contribution'}</div>
        <div class="hero-big">${rs(Math.max(0, exp - paid))} <span class="sub">${['paid', 'over'].includes(st) ? 'nothing due' : 'due by ' + fmt.dm(t.campaign.dueDate)}</span></div>
        <div class="online-row">${icon('user', 16)}<div class="grow"><b>Your Vari Tharagar: ${esc(col ? col.name : '—')}</b><span class="xs" style="opacity:.8">Pay in person and get a receipt in the app</span></div><button class="btn btn-white btn-sm" onclick="UI.toast('Calling ${esc(col ? col.name : '')} (simulated)','ok')">${icon('phone', 15)}Call</button></div></div>
      <div class="mt12">${C.banner(['paid', 'over'].includes(st) ? 'green' : 'warn', ['paid', 'over'].includes(st) ? 'check' : 'clock', ['paid', 'over'].includes(st) ? 'Paid for this period' : 'Contribution pending', `${CONTRIB[t.campaign.type]} · ${rs(exp)} · ${RECUR[t.campaign.recurring].toLowerCase()}`)}</div>
      <div class="group-label">Your receipts</div>
      <div class="group">${mine.map(c => TUI.colRow(p.id, t, c)).join('') || '<p class="pad sm muted">No receipts yet.</p>'}</div>
      <button class="btn btn-outline btn-block mt16" onclick="UI.reason({title:'Report a discrepancy',message:'For example a payment you made that is not shown. The temple administrator reviews it; nothing is changed without a record.',presets:['I paid but it is not shown','Wrong amount on receipt','Not my family'],confirm:'Send report',onConfirm:x=>Temple.dispute('${p.id}','${f.id}',x)})">${icon('flag', 17)}Report a discrepancy</button>
      <p class="xs muted center mt12">You see only your own family's records.</p>
    </div>`;
}

/* ===================== Family detail & form ===================== */
App.reg('templeFamily', {
  guard(p) { return templeGuard(p) || (Temple.canSeeFamily(p.id, p.fid) ? '' : 'denied'); },
  render(p) {
    const t = Temple.t(p.id), f = Temple.fam(t, p.fid), admin = myRole(p.id) === 'admin';
    const exp = Temple.expected(t, f), paid = Temple.famPaid(t, f.id), col = Temple.col(t, f.collectorId);
    const hist = t.collections.filter(c => c.familyId === f.id).slice().sort((a, b) => b.at.localeCompare(a.at));
    const ah = t.assignHistory.filter(h => h.target.startsWith(f.fid));
    const dupes = admin ? Temple.dupes(t, f) : [];
    return `${C.appbar(esc(f.name), { white: true, sub: f.fid, right: admin ? `<button class="iconbtn" onclick="App.go('templeFamilyForm',{id:'${p.id}',fid:'${f.id}'})" aria-label="Edit">${icon('edit', 20)}</button>` : '' })}
      <div class="content px">
        ${f.status !== 'active' ? `<div class="mt12">${C.banner('grey', 'lock', f.status === 'merged' ? `Merged into ${Temple.fam(t, f.mergedInto).fid}` : 'Inactive family', 'Kept for history. New collections cannot be recorded.')}</div>` : ''}
        ${dupes.length ? `<div class="info-card warn mt12">${icon('alert', 16)}<div>Possible duplicate of ${dupes.map(d => `<b>${d.fid} ${esc(d.name)}</b>`).join(', ')}. <button class="link" onclick="UI.reason({title:'Merge ${dupes[0].fid} into ${f.fid}?',message:'Collections from ${dupes[0].fid} move here. ${dupes[0].fid} is kept as merged for traceability.',confirm:'Merge',onConfirm:x=>Temple.merge('${p.id}','${f.id}','${dupes[0].id}',x)})">Merge</button></div></div>` : ''}
        <div class="card p mt12"><div class="row gap12">${C.avatar(f.name, null, 50)}<div class="grow"><div class="h3">${esc(f.head || f.name)}</div><div class="xs muted">${fmt.phone(f.phone)} · ${f.members} members</div><div class="xs muted">${esc(f.locality)}</div></div>${TUI.famBadge(t, f)}</div>
          <div class="divider"></div>
          ${C.rows([[t.campaign.type === 'suggested' ? 'Suggested' : 'Expected', rs(exp)], ['Collected' + (t.campaign.recurring === 'monthly' ? ' this month' : ''), rs(paid)]], [paid > exp ? 'Paid extra' : 'Balance', rs(Math.abs(exp - paid))])}
          <div class="row between mt12"><span class="xs muted">Vari Tharagar</span><span class="b sm">${col ? esc(col.userId === 'me' ? 'You' : col.name) : '<span class="red">Unassigned</span>'}</span></div></div>
        ${f.status === 'active' ? `<div class="row gap8 mt12"><button class="btn btn-outline grow" onclick="UI.toast('Calling ${esc(f.head || f.name).replace(/'/g, '')} (simulated)','ok')">${icon('phone', 17)}Call</button><button class="btn btn-primary grow" onclick="App.go('templeCollect',{id:'${p.id}',fid:'${f.id}'})">${icon('plus', 17)}Record</button></div>` : ''}
        <div class="group-label">Collection history</div>
        <div class="group">${hist.map(c => TUI.colRow(p.id, t, c)).join('') || '<p class="pad sm muted">No collections yet.</p>'}</div>
        ${admin ? `<div class="group-label">Assignment history</div>
          <div class="card p">${ah.length ? C.timeline(ah.map(h => ({ t: `${esc(h.from)} → ${esc(h.to)}`, note: esc(h.reason) + ' · by ' + esc(actorName(h.by)), at: h.at, tone: 'info' }))) : `<p class="sm muted">Assigned to ${esc(col ? col.name : 'nobody')} through ${esc(f.locality)}.</p>`}</div>
          <div class="group mt12">
            ${C.item('swap', 'Reassign collector', `TempleCol.pick('${p.id}',['${f.id}'])`)}
            ${f.status === 'active' ? C.item('lock', 'Deactivate family', `UI.reason({title:'Deactivate ${f.fid}?',message:'History is kept. The family is excluded from expected totals.',danger:true,confirm:'Deactivate',presets:['Moved out of the village','Duplicate record'],onConfirm:x=>Temple.setFamilyStatus('${p.id}','${f.id}','inactive',x)})`, { danger: true }) : f.status === 'inactive' ? C.item('refresh', 'Reactivate family', `Temple.setFamilyStatus('${p.id}','${f.id}','active','Reactivated')`) : ''}
          </div>` : ''}
      </div>`;
  }
});

App.reg('templeFamilyForm', {
  guard(p) { return templeGuard(p) || (Reg.can(p.id, 'families.manage') ? '' : 'denied'); },
  render(p) {
    const t = Temple.t(p.id), f = p.fid ? Temple.fam(t, p.fid) : null;
    if (!p.v) p.v = f ? { name: f.name, head: f.head, phone: f.phone, locality: f.locality, members: f.members, expectedP: f.expectedP } : { name: '', head: '', phone: '', locality: t.localities[0], members: 4, expectedP: null };
    const v = p.v, e = p.err || {};
    const dup = !p.okDup && (v.name || v.phone) ? Temple.dupes(t, Object.assign({ fid: p.fid }, v)) : [];
    const col = Temple.col(t, TempleData.collectorFor(t, v.locality));
    return `${C.appbar(f ? 'Edit family' : 'Register family', { white: true })}
      <div class="content pad">
        ${C.field('Family name', `<input class="input ${e.name ? 'err' : ''}" value="${esc(v.name)}" placeholder="e.g. Ramasamy family" onchange="App.top().params.v.name=this.value;App.refresh()">`, { req: true, err: e.name })}
        ${C.field('Contact person', `<input class="input" value="${esc(v.head)}" onchange="App.top().params.v.head=this.value">`)}
        ${C.field('Mobile number', `<div class="prefix-input ${e.phone ? 'err' : ''}"><span>+91</span><input inputmode="numeric" maxlength="10" value="${esc(v.phone)}" onchange="App.top().params.v.phone=this.value.replace(/\\D/g,'');App.refresh()"></div>`, { err: e.phone, hint: 'Only what the collection needs is stored.' })}
        ${dup.length ? `<div class="info-card warn mb12">${icon('alert', 16)}<div>Looks like an existing family: <b>${dup.map(d => `${d.fid} ${esc(d.name)} (${esc(d.locality)})`).join(', ')}</b>.<div class="row gap8 mt8"><button class="btn btn-sm btn-outline" onclick="App.replace('templeFamily',{id:'${p.id}',fid:'${dup[0].id}'})">Open existing</button><button class="btn btn-sm btn-outline" onclick="App.set('okDup',true)">It's a different family</button></div></div></div>` : ''}
        ${C.field('Street / locality', `<select class="select" onchange="App.top().params.v.locality=this.value;App.refresh()">${t.localities.map(l => `<option ${v.locality === l ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`, { hint: col ? `Vari Tharagar: ${esc(col.userId === 'me' ? 'You' : col.name)}` : 'No collector covers this locality yet' })}
        ${C.field('Members in household', `<input class="input" inputmode="numeric" value="${v.members}" onchange="App.top().params.v.members=parseInt(this.value)||1">`, { opt: true })}
        ${t.campaign.type === 'per_family' ? C.field('Expected amount', `<div class="prefix-input ${e.exp ? 'err' : ''}"><span>₹</span><input inputmode="numeric" value="${v.expectedP ? v.expectedP / 100 : ''}" onchange="App.top().params.v.expectedP=paise(this.value)"></div>`, { req: true, err: e.exp }) : ''}
      </div>
      <div class="footer"><button class="btn btn-primary btn-block" ${dup.length ? 'disabled' : ''} onclick="TempleForm.save()">${f ? 'Save changes' : 'Register family'}</button></div>`;
  }
});
const TempleForm = {
  save() {
    const p = App.top().params, v = p.v, t = Temple.t(p.id), e = {};
    if ((v.name || '').trim().length < 2) e.name = 'Enter the family name';
    if (v.phone && !/^[6-9]\d{9}$/.test(v.phone)) e.phone = 'Enter a valid 10-digit mobile number';
    if (t.campaign.type === 'per_family' && !(v.expectedP > 0)) e.exp = 'Enter the expected amount';
    if (Object.keys(e).length) { p.err = e; return App.refresh(); }
    const f = Temple.saveFamily(p.id, Object.assign({ fid: p.fid }, v, { name: v.name.trim() }));
    if (!f) return;
    UI.toast(p.fid ? 'Family updated' : `${f.fid} registered`, 'ok');
    App.replace('templeFamily', { id: p.id, fid: f.id });
  }
};

/* ===================== Record collection ===================== */
App.reg('templeCollect', {
  guard(p) { return templeGuard(p) || (Reg.can(p.id, 'collect') ? '' : 'denied'); },
  render(p) {
    const t = Temple.t(p.id), fams = Temple.visible(p.id).filter(f => f.status === 'active');
    if (!p.req) { p.req = uid('q'); p.method = 'Cash'; p.date = istToday(); }
    if (!p.fid) {
      const q = (p.q || '').toLowerCase();
      const list = fams.filter(f => !q || (f.name + f.fid + f.phone + f.head).toLowerCase().includes(q)).sort((a, b) => ['pending', 'partial'].includes(Temple.famStatus(t, a)) ? -1 : 1);
      return `${C.appbar('Record collection', { white: true, sub: 'Choose a family' })}
        <div class="content px"><div class="search-bar mt12 mb12">${icon('search', 18)}<input style="border:0;outline:0;background:none;flex:1;font-size:14px" placeholder="Search your families" value="${esc(p.q || '')}" oninput="clearTimeout(window._sq);window._sq=setTimeout(()=>App.set('q',this.value),350)"></div>
        <div class="group">${list.map(f => `<button class="li" onclick="App.set('fid','${f.id}')">${C.avatar(f.name, null, 34)}<span class="li-main"><span>${esc(f.name)} <span class="xs muted">${f.fid}</span></span><span class="xs muted">${esc(f.locality)} · ${rs(Temple.famPaid(t, f.id))} of ${rs(Temple.expected(t, f))}</span></span>${TUI.famBadge(t, f)}</button>`).join('') || '<p class="pad sm muted center">No families found.</p>'}</div></div>`;
    }
    const f = Temple.fam(t, p.fid), exp = Temple.expected(t, f), paid = Temple.famPaid(t, f.id), bal = Math.max(0, exp - paid);
    if (p.amt == null) p.amt = bal || exp;
    const e = p.err || {};
    return `${C.appbar('Record collection', { white: true, sub: esc(t.campaign.name) })}
      <div class="content pad">
        <button class="card p row gap12" style="width:100%;text-align:left" onclick="App.set('fid',null)">${C.avatar(f.name, null, 40)}<div class="grow"><div class="b">${esc(f.name)}</div><div class="xs muted">${f.fid} · ${esc(f.locality)}</div></div><span class="link">Change</span></button>
        <div class="card p mt12">${C.rows([[t.campaign.type === 'suggested' ? 'Suggested' : 'Expected', rs(exp)], ['Already collected', rs(paid)]], ['Balance', rs(bal)])}</div>
        <div class="mt16">${C.field('Amount collected', `<div class="prefix-input ${e.amt ? 'err' : ''}" style="height:54px"><span style="font-size:18px">₹</span><input style="font-size:22px;font-weight:700" inputmode="decimal" value="${p.amt / 100}" onchange="App.top().params.amt=paise(this.value);App.refresh()"></div>`, { err: e.amt, hint: !t.campaign.partial ? 'Part payments are not allowed for this collection.' : p.amt < bal ? 'Recorded as a part payment.' : '' })}</div>
        <div class="label">Payment method</div>
        <div class="seg mb12">${[['Cash', 'Cash'], ['UPI', 'UPI'], ['Bank', 'Bank']].map(([k, l]) => `<button class="${p.method === k ? 'on' : ''}" onclick="App.set('method','${k}')">${l}</button>`).join('')}</div>
        ${p.method !== 'Cash' ? C.field('Transaction reference', `<input class="input ${e.ref ? 'err' : ''}" value="${esc(p.ref || '')}" placeholder="UPI / UTR reference" onchange="App.top().params.ref=this.value.trim()">`, { req: true, err: e.ref, hint: 'Counted only after the bank confirms it.' }) : `<div class="info-card mb12">${icon('cash', 16)}<div>Cash is marked <b>recorded manually</b> on the receipt, separate from bank-verified payments.</div></div>`}
        ${C.field('Collected on', `<input type="date" class="input" max="${istToday()}" value="${p.date}" onchange="App.top().params.date=this.value;App.refresh()">`, { hint: p.date !== istToday() ? 'Entered later than collected — this is shown on the receipt.' : '' })}
        ${C.field('Note', `<input class="input" value="${esc(p.note || '')}" onchange="App.top().params.note=this.value">`, { opt: true })}
      </div>
      <div class="footer"><button class="btn btn-primary btn-block" id="tcBtn" onclick="TempleCol.save()">${icon('receipt', 18)}Save & issue receipt</button></div>`;
  }
});
const TempleCol = {
  save(force) {
    const p = App.top().params, t = Temple.t(p.id), f = Temple.fam(t, p.fid), exp = Temple.expected(t, f), bal = Math.max(0, exp - Temple.famPaid(t, f.id)), e = {};
    if (!(p.amt > 0)) e.amt = 'Enter the amount collected';
    else if (!t.campaign.partial && p.amt < bal) e.amt = `Part payments are not allowed. Collect ${rs(bal)}.`;
    if (p.method !== 'Cash' && !(p.ref || '').trim()) e.ref = 'Enter the transaction reference';
    if (Object.keys(e).length) { p.err = e; return App.refresh(); }
    p.err = null;
    if (!force) {
      const dup = t.collections.find(c => c.familyId === f.id && c.amountP === p.amt && c.status !== 'VOID' && Date.now() - new Date(c.recordedAt).getTime() < 15 * 60000);
      if (dup) return UI.confirm({ title: 'Possible duplicate', message: `${rs(p.amt)} from ${esc(f.name)} was recorded ${fmt.rel(dup.recordedAt)} (${dup.receiptNo}). Record another collection?`, confirm: 'Record anyway', danger: true, onConfirm: () => TempleCol.save(true) });
      if (t.campaign.type === 'fixed' && p.amt > bal) return UI.confirm({ title: 'More than the amount due', message: `${esc(f.name)} owes ${rs(bal)}. The extra ${rs(p.amt - bal)} will be shown as paid extra in reports.`, confirm: 'Record', onConfirm: () => TempleCol.save(true) });
    }
    document.getElementById('tcBtn').classList.add('loading');
    setTimeout(() => {
      const at = p.date === istToday() ? nowISO() : new Date(p.date + 'T10:00:00+05:30').toISOString();
      const c = Temple.record(p.id, { familyId: f.id, amountP: p.amt, method: p.method, ref: p.ref, at, note: p.note, req: p.req });
      if (!c) return;
      App.replace('templeReceipt', { id: p.id, cid: c.id, fresh: 1 });
      UI.toast(c.status === 'PENDING' ? 'Saved · waiting for bank confirmation' : 'Collection saved · receipt issued', 'ok');
    }, 600);
  },
  pick(id, fids) {
    const t = Temple.t(id);
    UI.sheet(`<div class="sheet-title">Reassign to</div><p class="xs muted mb12">The change and your reason are kept in the assignment history.</p><div class="group">${t.collectors.map(c => `<button class="li" onclick="UI.close(true);UI.reason({title:'Reason for reassigning',presets:['Collector unavailable','Moved closer to this street','Workload balancing'],confirm:'Reassign',onConfirm:x=>Temple.reassign('${id}',${JSON.stringify(fids).replace(/"/g, "'")},'${c.id}',x)})">${C.avatar(c.name, null, 32)}<span class="li-main"><span>${esc(c.userId === 'me' ? 'You' : c.name)}</span><span class="xs muted">${(c.localities || []).join(', ')} · ${t.families.filter(f => f.collectorId === c.id).length} families</span></span>${icon('chevron', 16, 'li-chev')}</button>`).join('')}</div>`);
  }
};

/* ===================== Receipt ===================== */
App.reg('templeReceipt', {
  guard(p) { const d = templeGuard(p); if (d) return d; const t = Temple.t(p.id), c = t.collections.find(x => x.id === p.cid); return c && Temple.canSeeFamily(p.id, c.familyId) ? '' : 'denied'; },
  render(p) {
    const t = Temple.t(p.id), c = t.collections.find(x => x.id === p.cid), f = Temple.fam(t, c.familyId), col = Temple.col(t, c.collectorId), admin = myRole(p.id) === 'admin';
    const rep = c.replacedBy && t.collections.find(x => x.id === c.replacedBy), orig = c.replaces && t.collections.find(x => x.id === c.replaces);
    const late = istDay(c.recordedAt) !== istDay(c.at);
    return `${C.appbar('Receipt', { white: true, sub: c.receiptNo })}
      <div class="content pad">
        ${p.fresh && c.status !== 'VOID' ? `<div class="success-hero" style="padding:8px 0 14px"><div class="success-ic ${c.status === 'PENDING' ? 'warn' : ''}">${icon(c.status === 'PENDING' ? 'clock' : 'check', 34)}</div><div class="h2">${c.status === 'PENDING' ? 'Waiting for bank' : 'Collection saved'}</div></div>` : ''}
        <div class="receipt ${c.status === 'VOID' ? 'void' : ''}">
          <div class="center"><div class="rc-mark">${icon('temple', 22)}</div><div class="h3 mt4">${esc(t.temple.name)}</div><div class="xs muted">${esc(t.temple.place)}${t.temple.trust ? ' · ' + esc(t.temple.trust) : ''}</div></div>
          <div class="rc-no"><span>Receipt no.</span><b>${c.receiptNo}</b></div>
          ${C.rows([['Received from', `${esc(f.name)} (${f.fid})`], ['Purpose', `${t.campaign.purpose} · ${esc(t.campaign.name)}`], ['Date', fmt.dt(c.at) + (late ? `<br><span class="tiny muted">entered ${fmt.dt(c.recordedAt)}</span>` : '')], ['Method', TUI.method(c)], c.ref ? ['Reference', esc(c.ref)] : null, ['Vari Tharagar', esc(col ? col.name : '')], c.note ? ['Note', esc(c.note)] : null].filter(Boolean), ['Amount', rs(c.amountP)])}
          <div class="row between mt12">${TUI.colBadge(c)}<span class="tiny muted">Issued via VillageHub</span></div>
          ${c.status === 'VOID' ? '<div class="void-stamp">VOID</div>' : ''}
        </div>
        ${c.status === 'VOID' ? `<div class="info-card red mt12">${icon('x', 16)}<div><b>Voided:</b> ${esc(c.voidReason)}${rep ? `<br>Corrected receipt: <button class="link" onclick="App.replace('templeReceipt',{id:'${p.id}',cid:'${rep.id}'})">${rep.receiptNo}</button>` : ''}<br>This number will not be reused.</div></div>` : ''}
        ${orig ? `<div class="info-card mt12">${icon('info', 16)}<div>Corrects <button class="link" onclick="App.replace('templeReceipt',{id:'${p.id}',cid:'${orig.id}'})">${orig.receiptNo}</button> (voided).</div></div>` : ''}
        ${c.status === 'FAILED' ? `<div class="info-card red mt12">${icon('alert', 16)}<div>The bank did not confirm this payment. It is not counted, and this receipt is not valid.</div></div>` : ''}
        <div class="row gap8 mt16"><button class="btn btn-outline grow" onclick="UI.toast('Receipt shared on WhatsApp to ${fmt.masked(f.phone)} (simulated)','ok')">${icon('share', 17)}Share</button><button class="btn btn-outline grow" onclick="UI.toast('Sent to the Bluetooth receipt printer (simulated)','ok')">${icon('print', 17)}Print</button></div>
        ${admin && c.status === 'CONFIRMED' ? `<button class="btn btn-outline danger btn-block mt8" onclick="TempleRc.voidSheet('${p.id}','${c.id}')">${icon('x', 17)}Void or correct</button>` : ''}
        <details class="mt16"><summary class="link">Record history</summary><div class="card p mt8">${C.timeline(c.history.map(h => ({ t: COL_ST[h.s].label, note: [(Temple.col(t, h.by) || {}).name || actorName(h.by), h.note].filter(Boolean).map(esc).join(' · '), at: h.at, tone: ['VOID', 'FAILED'].includes(h.s) ? 'red' : '' })))}</div></details>
      </div>`;
  }
});
const TempleRc = {
  voidSheet(id, cid) {
    const t = Temple.t(id), c = t.collections.find(x => x.id === cid);
    TempleRc._v = { id, cid, reissue: true };
    const draw = u => UI.sheet(`<div class="sheet-title">Void ${c.receiptNo}</div><p class="xs muted mb12">The receipt stays on record marked void. Its number is never reused.</p>
      <div class="chips wrap mb8">${['Wrong amount', 'Wrong family', 'Duplicate entry', 'Payment returned'].map(q => `<button class="chip" onclick="document.getElementById('vr').value=this.textContent">${q}</button>`).join('')}</div>
      <textarea id="vr" class="textarea" placeholder="Reason (required)"></textarea>
      <button class="opt mt12 ${TempleRc._v.reissue ? 'on' : ''}" onclick="TempleRc._v.reissue=!TempleRc._v.reissue;TempleRc._d()"><span class="check">${TempleRc._v.reissue ? icon('check', 13) : ''}</span><span class="grow"><span class="b">Issue a corrected receipt</span><span class="xs muted">New number, linked to this one</span></span></button>
      ${TempleRc._v.reissue ? `<div class="row gap8 mt8"><div class="grow">${C.field('Correct amount', `<div class="prefix-input"><span>₹</span><input id="va" inputmode="decimal" value="${c.amountP / 100}"></div>`)}</div><div class="grow">${C.field('Family', `<select id="vf" class="select">${Temple.visible(id).filter(f => f.status === 'active').map(f => `<option value="${f.id}" ${f.id === c.familyId ? 'selected' : ''}>${f.fid} ${esc(f.name)}</option>`).join('')}</select>`)}</div></div>` : ''}
      <button class="btn btn-danger btn-block mt12" onclick="TempleRc.go()">Void receipt</button>`, u);
    TempleRc._d = () => { const v = (document.getElementById('vr') || {}).value; draw(true); if (v) document.getElementById('vr').value = v; };
    draw();
  },
  go() {
    const v = TempleRc._v, why = document.getElementById('vr').value.trim();
    if (why.length < 4) return UI.toast('Enter a reason', 'err');
    const re = v.reissue ? { amountP: paise(document.getElementById('va').value), familyId: document.getElementById('vf').value } : null;
    if (re && !(re.amountP > 0)) return UI.toast('Enter the correct amount', 'err');
    UI.close(true);
    const n = Temple.voidReceipt(v.id, v.cid, why, re);
    if (n) App.replace('templeReceipt', { id: v.id, cid: n.id });
    UI.toast(n ? `Voided · corrected receipt ${n.receiptNo} issued` : 'Receipt voided', 'ok');
  }
};

/* ===================== Collectors, handovers, reports, disputes ===================== */
App.reg('templeCollectors', {
  guard(p) { return templeGuard(p) || (Reg.can(p.id, 'collectors.manage') ? '' : 'denied'); },
  render(p) {
    const t = Temple.t(p.id), un = t.families.filter(f => f.status === 'active' && !f.collectorId);
    return `${C.appbar('Collectors & assignments', { white: true, sub: esc(t.campaign.name) })}
      <div class="content px">
        ${un.length ? `<div class="info-card warn mt12">${icon('alert', 16)}<div>${un.length} famil${un.length > 1 ? 'ies have' : 'y has'} no collector. <button class="link" onclick="TempleCol.pick('${p.id}',${JSON.stringify(un.map(f => f.id)).replace(/"/g, "'")})">Assign</button></div></div>` : ''}
        <div class="group mt12">${t.collectors.map(c => { const n = t.families.filter(f => f.collectorId === c.id && f.status === 'active'); return `<div class="li" style="flex-wrap:wrap">${C.avatar(c.name, null, 38)}<span class="li-main"><span>${esc(c.userId === 'me' ? c.name + ' (you)' : c.name)}</span><span class="xs muted">${fmt.phone(c.phone)} · ${(c.localities || []).join(', ') || 'No locality'} · ${n.length} families</span></span>${n.length ? `<button class="btn btn-outline btn-sm" onclick="TempleCol.pick('${p.id}',${JSON.stringify(n.map(f => f.id)).replace(/"/g, "'")})">Move all</button>` : ''}</div>`; }).join('')}</div>
        <div class="card p mt12"><div class="label">Add a Vari Tharagar</div><input id="ncN" class="input mb8" placeholder="Name"><div class="prefix-input mb8"><span>+91</span><input id="ncP" inputmode="numeric" maxlength="10" placeholder="Mobile"></div>
          <select id="ncL" class="select mb8"><option value="">Locality</option>${t.localities.map(l => `<option>${esc(l)}</option>`).join('')}</select>
          <button class="btn btn-primary btn-block btn-md" onclick="var n=document.getElementById('ncN').value.trim(),ph=document.getElementById('ncP').value.replace(/\\D/g,''),l=document.getElementById('ncL').value;if(n.length<2||!/^[6-9]\\d{9}$/.test(ph))return UI.toast('Enter a name and a valid mobile number','err');var e=Temple.addCollector('${p.id}',n,ph,l?[l]:[]);UI.toast(e||'Collector added and invited',e?'err':'ok')">Add collector</button></div>
        <div class="group-label">Assignment history</div>
        <div class="card p">${t.assignHistory.length ? C.timeline(t.assignHistory.slice(0, 20).map(h => ({ t: `${esc(h.target)}: ${esc(h.from)} → ${esc(h.to)}`, note: esc(h.reason) + ' · by ' + esc(actorName(h.by)), at: h.at, tone: 'info' }))) : '<p class="sm muted">No changes yet.</p>'}</div>
      </div>`;
  }
});

App.reg('templeHandovers', {
  guard: templeGuard,
  render(p) {
    const t = Temple.t(p.id);
    return `${C.appbar('Cash handovers', { white: true, sub: esc(t.campaign.name) })}
      <div class="content px">
        <div class="group mt12">${t.collectors.map(c => { const h = Temple.cashInHand(t, c.id); return `<div class="li">${C.avatar(c.name, null, 34)}<span class="li-main"><span>${esc(c.userId === 'me' ? 'You' : c.name)}</span><span class="xs muted">Collected ${rs(h.cash)} · handed ${rs(h.handed)}</span></span><span style="text-align:right"><b>${rs(h.inHand)}</b><br><span class="tiny muted">in hand</span></span></div>`; }).join('')}</div>
        <div class="group-label">History</div>
        <div class="group">${t.handovers.map(h => { const c = Temple.col(t, h.collectorId), d = h.countedP - h.declaredP; return `<div class="li" style="align-items:flex-start"><span class="li-ic">${icon('cash', 17)}</span><span class="li-main"><span>${esc(c.userId === 'me' ? 'You' : c.name)} · ${rs(h.declaredP)}</span><span class="xs muted">${fmt.dt(h.at)}${h.note ? ' · ' + esc(h.note) : ''}</span></span>${d ? C.badge(`${d < 0 ? 'Short' : 'Over'} ${rs(Math.abs(d))}`, 'red') : C.badge('Matched', 'green')}</div>`; }).join('') || '<p class="pad sm muted">No handovers yet.</p>'}</div>
      </div>`;
  }
});

App.reg('templeReports', {
  guard(p) { return templeGuard(p) || (Reg.can(p.id, 'reports') ? '' : 'denied'); },
  render(p) {
    const t = Temple.t(p.id), all = Temple.totals(t, t.families);
    const by = (keyFn, labels) => labels.map(l => { const fams = t.families.filter(f => keyFn(f) === l.k); return Object.assign({ l: l.l }, Temple.totals(t, fams)); });
    const cols = by(f => f.collectorId, t.collectors.map(c => ({ k: c.id, l: c.userId === 'me' ? 'You' : c.name })));
    const locs = by(f => f.locality, t.localities.map(l => ({ k: l, l })));
    const table = (rows, first) => `<div class="card sim-table"><table><thead><tr><th>${first}</th><th>Families</th><th>Collected</th><th>Pending</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.l)}</td><td>${r.paid}/${r.families}</td><td>${rs(r.collectedP)}</td><td>${rs(r.pendingP)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td><td>${all.paid}/${all.families}</td><td>${rs(all.collectedP)}</td><td>${rs(all.pendingP)}</td></tr></tfoot></table></div>`;
    const sumC = cols.reduce((a, r) => a + r.collectedP, 0), sumL = locs.reduce((a, r) => a + r.collectedP, 0);
    return `${C.appbar('Reports', { white: true, sub: `${esc(t.campaign.name)} · ${esc(t.campaign.period)}` })}
      <div class="content px">
        <div class="mini-grid mt12"><div class="mini"><div class="l">${t.campaign.purpose} total</div><div class="v">${rs(all.collectedP)}</div></div><div class="mini"><div class="l">Families fully paid</div><div class="v">${all.paid}/${all.families}</div></div></div>
        ${C.sec('By Vari Tharagar')}${table(cols, 'Collector')}
        ${C.sec('By street')}${table(locs, 'Street')}
        ${C.sec('Cash vs digital')}<div class="card p">${C.rows([['Cash (recorded manually)', rs(all.cashP)], ['UPI / bank (bank-verified)', rs(all.digitalP)], ['Waiting for bank (not counted)', rs(all.waitingP)]], ['Counted total', rs(all.collectedP)])}<div class="split-bar mt8"><i style="width:${all.cashP / Math.max(1, all.collectedP) * 100}%"></i></div></div>
        ${C.sec('Reconciliation')}<div class="card p">
          <div class="chk ${sumC === all.collectedP ? 'ok' : 'bad'}">${icon(sumC === all.collectedP ? 'check' : 'x', 14)}<span><b>Collector totals = overall total</b><small>${rs(sumC)} = ${rs(all.collectedP)}</small></span></div>
          <div class="chk ${sumL === all.collectedP ? 'ok' : 'bad'}">${icon(sumL === all.collectedP ? 'check' : 'x', 14)}<span><b>Street totals = overall total</b><small>${rs(sumL)} = ${rs(all.collectedP)}</small></span></div>
          <p class="xs muted mt8">Calculated from ${all.records} collection records. ${all.voids} void receipt${all.voids === 1 ? ' is' : 's are'} excluded; part payments count as collected; amounts above the expected figure count as collected and do not reduce other families' pending.</p></div>
        <button class="btn btn-outline btn-block mt16" onclick="Act.audit('${p.id}','Temple report exported','reports',{});Store.save();UI.toast('Report exported as PDF (simulated)','ok')">${icon('download', 17)}Export report</button>
      </div>`;
  }
});

App.reg('templeDisputes', {
  guard: templeGuard,
  render(p) {
    const t = Temple.t(p.id);
    return `${C.appbar('Family discrepancies', { white: true, sub: esc(t.campaign.name) })}
      <div class="content px">${t.disputes.length ? `<div class="mt12">${t.disputes.map(d => { const f = Temple.fam(t, d.familyId); return `<div class="card p mb8"><div class="row between"><b>${esc(f.name)} <span class="xs muted">${f.fid}</span></b>${C.badge(d.status, d.status === 'Open' ? 'warn' : 'green')}</div><p class="sm mt4">${esc(d.text)}</p><div class="xs muted mt4">${esc(actorName(d.by))} · ${fmt.rel(d.at)}</div>
        ${d.status === 'Open' ? `<div class="row gap8 mt8"><button class="btn btn-sm btn-outline" onclick="App.go('templeFamily',{id:'${p.id}',fid:'${f.id}'})">Check records</button><button class="btn btn-sm btn-primary" onclick="UI.reason({title:'Resolve discrepancy',placeholder:'What was found and done (shared with the family)',confirm:'Resolve',onConfirm:x=>{const q=Temple.t('${p.id}').disputes.find(y=>y.id==='${d.id}');q.status='Resolved';q.reply=x;Act.audit('${p.id}','Discrepancy resolved','disputes',{reason:x});Act.commit()}})">Resolve</button></div>` : d.reply ? `<div class="info-card teal mt8">${icon('chat', 16)}<div>${esc(d.reply)}</div></div>` : ''}</div>`; }).join('')}</div>`
        : C.empty({ ic: 'flag', title: 'No discrepancies', text: 'When a family reports a problem with a collection, it appears here.' })}</div>`;
  }
});
