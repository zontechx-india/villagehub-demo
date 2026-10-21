/* Chit Auction module — screens. Module-specific navigation lives here; the shared core only links in via the
 * registry (`open`, `setup`, `pending`, `events`). */

const ChitUI = {
  roundBadge(r) { const m = ROUND_ST[r.status]; return C.badge(m.label, m.tone); },
  payoutBadge(p) { return p ? C.badge(PAYOUT_ST[p.status].label, PAYOUT_ST[p.status].tone) : ''; },
  payBadge(p) { return C.badge(PAY_ST[p.status].label, PAY_ST[p.status].tone); },
  oblBadge(o) { const [l, t] = OBL_ST[o.status]; return C.badge(l, t); },
  memName(svcId, g, m, full) {
    if (!m) return '—';
    if (m.userId === 'me') return `${m.ticket} · You`;
    // Members see ticket + display name only; organisers see the full record.
    return `${m.ticket} · ${esc(m.name)}`;
  },

  // Settlement breakdown with the formula next to every figure, then the reconciliation checks (spec §5.2, §19).
  settlement(r, st, o = {}) {
    const L = (label, formula, amt, cls) => `<div class="calc-row ${cls || ''}"><span><span class="cl">${label}</span>${formula ? `<small>${formula}</small>` : ''}</span><b>${amt}</b></div>`;
    const rec = st.recipients;
    const rows = [
      L('Monthly gross pool', `${r.members} members × ${rs(r.contributionP || r.poolP / r.members)}`, rs(st.poolP)),
      L('Winning discount', o.sim ? 'Simulated winning bid' : 'Accepted winning bid', rs(st.discountP), 'hl'),
      L("Winner's gross payout", `${rs(st.poolP)} − ${rs(st.discountP)}`, rs(st.payoutGrossP)),
      L('Company fee', st.feeApplied ? ChitEngine.feeLabel(r, rs) + (r.feeBasis === 'pool_pct' ? ` × ${rs(st.poolP)}` : r.feeBasis === 'discount_pct' ? ` × ${rs(st.discountP)}` : '') : `Not charged in round ${st.round} (${ChitEngine.FEE_TIMING[r.feeTiming].toLowerCase()})`, rs(st.feeP)),
      st.deductions.length ? L('Net payout to winner', `${rs(st.payoutGrossP)} − fee charged separately`, rs(st.payoutNetP), 'hl') : '',
      L('Dividend pool', r.feeSource === 'discount' ? `${rs(st.discountP)} − ${rs(st.feeP)}` : `= winning discount (fee charged separately)`, rs(st.dividendPoolP), st.dividendPoolP < 0 ? 'bad' : ''),
      L('Dividend per member', `${rs(st.dividendPoolP)} ÷ ${rec} ${r.dividendTo === 'all' ? 'members' : 'non-winning members'}${st.remainderP ? ` · ${st.remainderP} paise left over` : ''}`, rs(st.perMemberP), 'hl'),
      st.remainderP ? L('Leftover paise', ChitEngine.REMAINDER[r.remainder], st.roundingP ? rs(st.roundingP) : `+₹0.01 × ${st.remainderP}`) : '',
      L('Net contribution after dividend credit', `${rs(r.contributionP || r.poolP / r.members)} − ${rs(st.perMemberP)}`, rs(st.netContributionP))
    ].join('');
    const checks = st.checks.map(c => `<div class="chk ${c.ok ? 'ok' : 'bad'}">${icon(c.ok ? 'check' : 'x', 14)}<span><b>${c.label}</b><small>${rs(c.l)} = ${c.rr.map(rs).join(' + ')}</small></span></div>`).join('');
    return `<div class="calc">${rows}</div>
      ${st.errors.length ? `<div class="info-card red mt12">${icon('alert', 16)}<div>${st.errors.map(esc).join('<br>')}</div></div>` : ''}
      <div class="chks mt12">${checks}</div>
      <p class="tiny muted mt8">Calculated in paise by ${st.version}${o.sim ? ' · simulation only' : ''}. The production server is the source of truth.</p>`;
  },

  rulesKv(r) {
    return `${C.kv('coins', 'Monthly gross pool', `${rs(r.poolP)} · ${r.members} members × ${rs(r.poolP / r.members)}`)}
      ${C.kv('calendar', 'Duration', `${r.rounds} monthly rounds · first auction ${fmt.date(r.startDate)} at ${r.auctionTime} IST`)}
      ${C.kv('gavel', 'Bidding', `Discount bids ${rs(r.minDiscountP)}–${rs(r.maxDiscountP)} · step ${rs(r.incrementP)} · highest wins`)}
      ${C.kv('scale', 'Tie-break', ChitEngine.TIE_BREAK[r.tieBreak])}
      ${C.kv('receipt', 'Company fee', `${ChitEngine.feeLabel(r, rs)} · ${ChitEngine.FEE_TIMING[r.feeTiming]}${r.feeTiming === 'selected' ? ' (' + r.feeRounds.join(', ') + ')' : ''} · ${ChitEngine.FEE_SOURCE[r.feeSource].toLowerCase()}`)}
      ${C.kv('users', 'Dividend', `${ChitEngine.DIV_TO[r.dividendTo]} · equal split · ${r.creditDividend ? 'credited against that round\'s contribution' : 'paid out separately'}`)}
      ${C.kv('x', 'No valid bids', ChitEngine.NO_BID[r.noBid])}
      ${C.kv('shield', 'Eligibility', `${r.eligibility === 'paid_up' ? 'Earlier contributions must be paid' : 'Any active member'}${r.winOnce ? ' · each member wins once' : ''}${r.winnerContinues ? ' · winner keeps paying' : ''}`)}`;
  },

  // Pay or record a payment (members pay their own; organisers record for anyone).
  paySheet(svcId, mid, n) {
    const g = Chit.g(svcId), m = Chit.mem(g, mid), self = m.userId === 'me', admin = Reg.can(svcId, 'payments.record');
    const dues = Chit.arrears(g, mid).filter(o => o.status !== 'verifying');
    if (!dues.length) return UI.toast('Nothing due for this member', 'ok');
    const o = dues.find(x => x.n === n) || dues[0];
    ChitUI._pay = { svcId, mid, n: o.n, method: self && !admin ? 'UPI' : 'Cash', req: uid('q') };
    const draw = u => {
      const P = ChitUI._pay, ob = Chit.oblig(g, mid, P.n);
      UI.sheet(`<div class="sheet-title">${self && !admin ? 'Pay contribution' : 'Record payment'}</div><p class="xs muted mb12">${ChitUI.memName(svcId, g, m)} · ${esc(svcById(svcId).name)}</p>
        <div class="label">Round</div><div class="chips wrap mb12">${dues.map(d => `<button class="chip ${d.n === P.n ? 'on' : ''}" onclick="ChitUI._pay.n=${d.n};ChitUI._payDraw()">Round ${d.n} · ${rs(d.balP)}</button>`).join('')}</div>
        <div class="card p mb12">${C.rows([['Contribution', rs(ob.dueP)], ['Dividend credit', '− ' + rs(ob.creditP)], ['Already paid', '− ' + rs(ob.paidP)]], ['Balance due', rs(ob.balP)])}</div>
        ${C.field('Amount', `<div class="prefix-input"><span>₹</span><input id="payAmt" inputmode="decimal" value="${(ob.balP / 100).toFixed(ob.balP % 100 ? 2 : 0)}"></div>`, { hint: 'Part payments are allowed and tracked as part paid.' })}
        <div class="label">Method</div>
        ${(self && !admin ? [['UPI', 'UPI', 'Confirmed by the bank before it counts'], ['Cash', 'Cash to organiser', 'Counts after the organiser records and verifies it']] : [['Cash', 'Cash', g.rules.cashVerify ? 'Recorded now, verified by a second check' : 'Confirmed immediately'], ['UPI', 'UPI', 'Pending until the bank confirms'], ['Bank', 'Bank transfer', 'Pending until the bank confirms']]).map(([k, l, s]) => `<button class="opt ${P.method === k ? 'on' : ''}" onclick="ChitUI._pay.method='${k}';ChitUI._payDraw()"><span class="radio"></span><span class="grow"><span class="b">${l}</span><span class="xs muted">${s}</span></span></button>`).join('')}
        ${!(self && !admin) && P.method === 'Cash' ? `<div class="mt12">${C.field('Receipt / note', '<input id="payRef" class="input" placeholder="Optional, e.g. paper receipt no.">', { opt: true })}</div>` : ''}
        <div id="payErr"></div>
        <button class="btn btn-primary btn-block mt16" id="payBtn" onclick="ChitUI._paySubmit()">${self && !admin ? (P.method === 'UPI' ? 'Pay with UPI' : 'I will pay cash to the organiser') : 'Record payment'}</button>`, u);
    };
    ChitUI._payDraw = () => draw(true);
    draw();
  },
  _paySubmit() {
    const P = ChitUI._pay, g = Chit.g(P.svcId), ob = Chit.oblig(g, P.mid, P.n);
    const amt = paise(document.getElementById('payAmt').value);
    const err = !amt ? 'Enter an amount' : amt > ob.balP ? `More than the balance due (${rs(ob.balP)}). Overpayments are not accepted.` : '';
    if (err) { document.getElementById('payErr').innerHTML = `<div class="field-err">${icon('alert', 13)}${err}</div>`; return; }
    const m = Chit.mem(g, P.mid), self = m.userId === 'me' && !Reg.can(P.svcId, 'payments.record');
    if (self && P.method === 'Cash') { UI.close(true); UI.toast('Noted · the organiser records cash when they receive it'); return; }
    document.getElementById('payBtn').classList.add('loading');
    setTimeout(() => { UI.close(true); Chit.recordPayment(P.svcId, { memberId: P.mid, n: P.n, amountP: amt, method: P.method, req: P.req, ref: (document.getElementById('payRef') || {}).value || '' }); }, 700);
  },

  inviteSheet(svcId) {
    const s = svcById(svcId), g = Chit.g(svcId);
    UI.sheet(`<div class="sheet-title">Invite members</div><p class="xs muted mb12">${g.members.filter(m => m.status !== 'EXITED').length} of ${g.rules.members} tickets filled.</p>
      <div class="invite-code"><div><div class="xs muted">Invite code</div><div class="code">${s.code}</div></div><button class="btn btn-outline btn-sm" onclick="UI.copy('${s.code}','Invite code copied')">${icon('copy', 15)}Copy</button></div>
      <button class="btn btn-outline btn-block mt8" onclick="UI.toast('Share sheet opened with the invite link (simulated)','ok')">${icon('share', 17)}Share invite link</button>
      <div class="divider"></div>
      <div class="label">Or add by phone number</div>
      ${C.field('Name', '<input id="invN" class="input" placeholder="Member name">')}
      ${C.field('Mobile number', '<div class="prefix-input"><span>+91</span><input id="invP" inputmode="numeric" maxlength="10" placeholder="10-digit number"></div>')}
      <div id="invErr"></div>
      <button class="btn btn-primary btn-block" onclick="ChitUI._invite('${svcId}')">Send invitation</button>`);
  },
  _invite(svcId) {
    const n = document.getElementById('invN').value.trim(), p = document.getElementById('invP').value.replace(/\D/g, '');
    const err = n.length < 2 ? 'Enter the member name' : !/^[6-9]\d{9}$/.test(p) ? 'Enter a valid 10-digit mobile number' : Chit.invite(svcId, n, p);
    if (err) { document.getElementById('invErr').innerHTML = `<div class="field-err mb12">${icon('alert', 13)}${err}</div>`; return; }
    UI.close(true); UI.toast(`Invitation sent to ${n}`, 'ok');
  },

  rescheduleSheet(svcId, n) {
    const g = Chit.g(svcId), r = Chit.round(g, n);
    const d = ChitData.istDate(r.auctionAt), t = new Date(r.auctionAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
    UI.sheet(`<div class="sheet-title">Reschedule round ${n}</div><p class="xs muted mb12">Members are notified. The original date and every change stay in the round history.</p>
      <div class="row gap8"><div class="grow">${C.field('New date', `<input id="rsD" type="date" class="input" value="${d}">`)}</div><div style="width:120px">${C.field('Time (IST)', `<input id="rsT" type="time" class="input" value="${t}">`)}</div></div>
      <div class="chips wrap mb12">${['Temple festival', 'Village meeting', 'Public holiday', 'Organiser unavailable'].map(q => `<button class="chip" onclick="document.getElementById('rsR').value=this.textContent">${q}</button>`).join('')}</div>
      <textarea id="rsR" class="textarea" placeholder="Reason (required, shared with members)"></textarea><div id="rsErr"></div>
      <button class="btn btn-primary btn-block mt16" onclick="ChitUI._resched('${svcId}',${n})">Reschedule and notify</button>`);
  },
  _resched(svcId, n) {
    const d = document.getElementById('rsD').value, t = document.getElementById('rsT').value, why = document.getElementById('rsR').value.trim();
    const iso = d && t ? ChitEngine.istISO(...d.split('-').map(Number), ...t.split(':').map(Number)) : '';
    const err = !iso ? 'Pick a date and time' : new Date(iso).getTime() < Date.now() ? 'Pick a time in the future' : why.length < 4 ? 'Enter a reason' : '';
    if (err) { document.getElementById('rsErr').innerHTML = `<div class="field-err">${icon('alert', 13)}${err}</div>`; return; }
    UI.close(true); Chit.reschedule(svcId, n, iso, why);
  },

  disputeSheet(svcId, n) {
    UI.reason({ title: `Raise a dispute · round ${n}`, message: 'Your message goes to the organiser and is kept in the audit history. Results are not changed silently; any correction is a separate, recorded adjustment.', presets: ['My payment is not reflected', 'Dividend amount looks wrong', 'My bid was not recorded'], confirm: 'Send to organiser', onConfirm: t => Chit.dispute(svcId, n, t) });
  },

  exportCsv(svcId) {
    const g = Chit.g(svcId), s = svcById(svcId);
    const head = 'Round,Auction date,Status,Winner ticket,Winning discount,Winner payout,Company fee,Dividend pool,Dividend per member,Payout status';
    const lines = g.rounds.map(r => { const st = r.result && r.result.st; const w = r.result && Chit.mem(g, r.result.winnerId); return [r.n, fmt.date(r.auctionAt), ROUND_ST[r.status].label, w ? w.ticket : '', st ? st.discountP / 100 : '', st ? st.payoutNetP / 100 : '', st ? st.feeP / 100 : '', st ? st.dividendPoolP / 100 : '', st ? st.perMemberP / 100 : '', r.payout ? PAYOUT_ST[r.payout.status].label : ''].join(','); });
    const blob = new Blob([head + '\n' + lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${s.code}-round-history.csv`; a.click();
    Act.audit(svcId, 'Round history exported (CSV)', 'reports', {});
    Store.save();
    UI.toast('Round history exported as CSV', 'ok');
  }
};

/* ===================== Create Chit wizard ===================== */
const CW = {
  p() { return App.top().params; },
  set(k, v) { const p = CW.p(); p.r[k] = v; if (k === 'members' && p.sameRounds) p.r.rounds = v; CW.sync(); App.refresh(); },
  num(k, v, min) { const n = parseInt(String(v).replace(/\D/g, ''), 10); CW.set(k, isNaN(n) ? (min || 0) : n); },
  money(k, v) { CW.set(k, paise(v)); },
  step(k, d) { const p = CW.p(); CW.set(k, Math.max(2, Math.min(100, (p.r[k] || 0) + d))); },
  pool(v, el) {
    const p = CW.p(), x = paise(v);
    p.r.poolP = p.r.poolMeaning === 'total' ? Math.round(x / Math.max(1, p.r.rounds)) : x; p.totalP = x;
    CW.sync(); if (!el) App.refresh();
  },
  sync() { const r = CW.p().r; r.contributionP = r.members ? r.poolP / r.members : 0; },
  // Field → section map, used to flag and open the sections that block publishing.
  SECTION_FIELDS: { basics: ['name'], money: ['pool', 'members', 'rounds'], auction: ['startDate', 'minDiscount', 'maxDiscount', 'increment'], fee: ['fee', 'feeRounds', 'minDiscount'] },
  toggle(k) {
    const p = CW.p(); p.open[k] = !p.open[k];
    if (k === 'members' && p.open[k]) CW.ensureDraft();
    App.refresh();
  },
  jump(k) {
    const p = CW.p(); p.open[k] = true; if (k === 'members') CW.ensureDraft();
    App.refresh();
    const el = document.getElementById('sec-' + k), c = document.querySelector('#app .content');
    if (el && c) c.scrollTo({ top: Math.max(0, el.offsetTop - 8), behavior: 'smooth' });
  },
  ensureDraft() {
    const p = CW.p();
    if (p.id) return p.id;
    const id = Act.newService('chit', p.r.name || 'Untitled chit', { status: 'draft' });
    const g = ChitData.group(p.r, svcById(id).code);
    ChitData.addMember(g, S().user.name, S().user.phone, { userId: 'me' });
    S().mod.chit[id] = g;
    Act.audit(id, 'Chit draft created', 'service', {});
    p.id = id;
    return id;
  },
  save(silent) {
    const p = CW.p(), id = CW.ensureDraft();
    Chit.saveDraft(id, p.r, 1);
    if (!silent) UI.toast('Draft saved · find it in My Services', 'ok');
  },
  opts(k, map, subs) {
    const r = CW.p().r;
    return Object.entries(map).map(([v, l]) => `<button class="opt ${String(r[k]) === v ? 'on' : ''}" onclick="CW.set('${k}', ${typeof r[k] === 'boolean' ? v : `'${v}'`})"><span class="radio"></span><span class="grow"><span class="b">${l}</span>${subs && subs[v] ? `<span class="xs muted">${subs[v]}</span>` : ''}</span></button>`).join('');
  },
  tog(k, label, sub) {
    const r = CW.p().r;
    return `<div class="li"><span class="li-main"><span>${label}</span>${sub ? `<span class="xs muted">${sub}</span>` : ''}</span>${C.toggle(r[k], `CW.set('${k}',${!r[k]})`)}</div>`;
  },
  moneyIn(k, ph) { const r = CW.p().r; return `<div class="prefix-input"><span>₹</span><input inputmode="numeric" value="${r[k] ? r[k] / 100 : ''}" placeholder="${ph || ''}" onchange="CW.money('${k}',this.value)"></div>`; },
  addSamples() {
    const p = CW.p(), id = CW.ensureDraft(), g = Chit.g(id);
    const have = new Set(g.members.map(m => m.name));
    ChitData.NAMES.filter(n => !have.has(n)).slice(0, Math.max(0, p.r.members - g.members.length)).forEach(n => ChitData.addMember(g, n));
    Store.save(); App.refresh();
  },
  removeMember(mid) {
    const g = Chit.g(CW.p().id); const i = g.members.findIndex(m => m.id === mid);
    if (i > 0) g.members.splice(i, 1);
    g.members.forEach((m, k) => { m.id = 'm' + (k + 1); m.ticket = 'M' + String(k + 1).padStart(3, '0'); });
    Store.save(); App.refresh();
  },
  editDate(n) {
    const p = CW.p(), sch = ChitEngine.schedule(p.r), cur = (p.dateEdits || []).find(x => x[0] === n);
    const at = cur ? cur[1] : sch[n - 1].auctionAt;
    UI.sheet(`<div class="sheet-title">Round ${n} date</div><p class="xs muted mb12">Use this for holidays or village meeting days. Changes after publication need a reason and notify members.</p>
      ${C.field('Date', `<input id="edD" type="date" class="input" value="${ChitData.istDate(at)}">`)}
      <button class="btn btn-primary btn-block" onclick="CW._setDate(${n})">Save date</button>`);
  },
  _setDate(n) {
    const p = CW.p(), d = document.getElementById('edD').value; if (!d) return;
    const [hh, mm] = p.r.auctionTime.split(':').map(Number);
    p.dateEdits = (p.dateEdits || []).filter(x => x[0] !== n).concat([[n, ChitEngine.istISO(...d.split('-').map(Number), hh, mm)]]);
    const g = p.id && Chit.g(p.id); if (g) g.dateEdits = p.dateEdits;
    UI.close(true); App.refresh();
  },
  publish() {
    const p = CW.p(), v = ChitEngine.validate(p.r, rs), bad = Object.keys(CW.SECTION_FIELDS).filter(k => CW.SECTION_FIELDS[k].some(f => v.errors[f]));
    if (bad.length || !p.confirm) {
      p.showErr = true; bad.forEach(k => { p.open[k] = true; });
      if (v.errors.feeRounds) p.open.advFee = true;
      App.refresh();
      if (bad.length) { UI.toast('Check the highlighted sections', 'err'); CW.jump(bad[0]); }
      else { UI.toast('Confirm the review statement first', 'err'); const c = document.querySelector('#app .content'); if (c) c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' }); }
      return;
    }
    CW.ensureDraft(); CW.save(true);
    const g = Chit.g(p.id); g.dateEdits = p.dateEdits || [];
    UI.confirm({ title: 'Publish this chit?', message: `Rules v1 are locked once members accept. ${g.members.length - 1} member${g.members.length > 2 ? 's' : ''} will be invited to review and accept them.`, confirm: 'Publish', icon: 'send', onConfirm: () => Chit.publish(p.id) });
  }
};

App.reg('chitWizard', {
  render(p) {
    if (!p.r) {
      const g = p.id && Chit.g(p.id);
      p.r = g ? JSON.parse(JSON.stringify(g.rules)) : ChitData.defaultRules();
      p.open = { basics: true, money: true, auction: true, fee: false, members: false, advAuction: false, advFee: false };
      p.sameRounds = p.r.members === p.r.rounds;
      p.dateEdits = (g && g.dateEdits) || [];
    }
    const r = p.r, v = ChitEngine.validate(r, rs), E = k => p.showErr ? v.errors[k] : '';
    const B = {};
    const adv = (key, label, html) => `<button class="adv-toggle" onclick="CW.p().open.${key}=!CW.p().open.${key};App.refresh()">${label}<span class="${p.open[key] ? 'up' : ''}">${icon('chevron', 16)}</span></button>${p.open[key] ? `<div class="adv-body">${html}</div>` : ''}`;

    B.basics = `
      ${C.field('Chit name', `<input class="input ${E('name') ? 'err' : ''}" maxlength="60" value="${esc(r.name)}" placeholder="e.g. Thirumalai Nagar Chit · ₹1 Lakh" onchange="CW.set('name',this.value.trim())">`, { req: true, err: E('name') })}
      ${C.field('Description', `<textarea class="textarea" maxlength="200" placeholder="Purpose, where the auction happens" onchange="CW.set('desc',this.value)">${esc(r.desc)}</textarea>`, { opt: true })}
      <div class="label">Who can find it</div>
      ${CW.opts('visibility', { invite: 'Invite only', discoverable: 'Discoverable with code' }, { invite: 'Members join only through your invitation', discoverable: 'Anyone with the code can request to join; you approve' })}
      <p class="xs muted mt12">₹ INR · Asia/Kolkata (IST) · Organiser: ${esc(S().user.name)} (you)</p>`;

    {
      const total = r.poolP * r.rounds;
      B.money = `
      <div class="label">What does the chit amount mean?</div>
      ${CW.opts('poolMeaning', { monthly: 'Monthly gross pool', total: 'Total scheme value' }, { monthly: 'Collected in one round if every member pays', total: 'Across all rounds — the app divides it by rounds' })}
      <div class="mt16">${C.field(r.poolMeaning === 'total' ? 'Total scheme value' : 'Monthly gross pool', `<div class="chips wrap mb8">${[100000, 200000, 300000].map(x => `<button class="chip ${(r.poolMeaning === 'total' ? total : r.poolP) === RP(x) ? 'on' : ''}" onclick="CW.pool(${x})">₹${x / 100000} lakh</button>`).join('')}</div>
        <div class="prefix-input ${E('pool') ? 'err' : ''}"><span>₹</span><input inputmode="numeric" value="${(r.poolMeaning === 'total' ? total : r.poolP) / 100}" onchange="CW.pool(this.value)"></div>`, { req: true, err: E('pool'), hint: r.poolMeaning === 'total' ? `= ${rs(r.poolP)} monthly gross pool over ${r.rounds} rounds` : '' })}</div>
      <div class="row gap12">
        <div class="grow">${C.field('Members (tickets)', `<div class="stepper"><button onclick="CW.step('members',-1)">−</button><span>${r.members}</span><button onclick="CW.step('members',1)">+</button></div>`, { err: E('members') && ' ' })}</div>
        <div class="grow">${C.field('Rounds (months)', `<div class="stepper"><button onclick="CW.p().sameRounds=false;CW.step('rounds',-1)">−</button><span>${r.rounds}</span><button onclick="CW.p().sameRounds=false;CW.step('rounds',1)">+</button></div>`)}</div>
      </div>
      ${E('members') ? `<div class="field-err mb12">${icon('alert', 13)}${E('members')}</div>` : ''}
      <label class="row gap8 xs mb16"><input type="checkbox" ${p.sameRounds ? 'checked' : ''} onchange="CW.p().sameRounds=this.checked;if(this.checked)CW.set('rounds',CW.p().r.members);else App.refresh()"> One winner per round (rounds = members)</label>
      <div class="card p mb16"><div class="card-title">Contribution</div>
        ${C.rows([['Contribution per member per round', r.poolP % r.members ? '<span class="red">Not a whole amount</span>' : rs(r.poolP / r.members)], ['Scheduled total per member', r.poolP % r.members ? '—' : rs(r.poolP / r.members * r.rounds)]], ['Scheduled total for the group', rs(r.poolP * r.rounds)])}</div>
      ${C.field('Contribution due', `<div class="row gap8"><input class="input" style="width:90px" inputmode="numeric" value="${r.dueDays}" onchange="CW.num('dueDays',this.value,1)"><span class="sm muted">days after each auction</span></div>`)}
      <div class="group">${CW.tog('winnerContinues', 'Winner keeps paying future instalments', 'Recommended for the sample model')}${CW.tog('winOnce', 'Each member can win only once', 'Default unless your approved rules say otherwise')}</div>
      ${v.warnings.map(w => `<div class="info-card warn mt12">${icon('alert', 16)}<div>${w}</div></div>`).join('')}`;
    }

    B.auction = `
      <div class="label">How is the auction held?</div>
      ${CW.opts('auctionType', { live: 'Live in the app', offline: 'In person, organiser records it', hybrid: 'Hybrid' }, { live: 'Members bid from their phones; the server picks the winner', offline: 'Bids taken at the meeting and entered by the organiser', hybrid: 'In-person bids entered alongside app bids' })}
      <div class="row gap12 mt16"><div class="grow">${C.field('First auction date', `<input type="date" class="input ${E('startDate') ? 'err' : ''}" value="${r.startDate}" onchange="CW.set('startDate',this.value)">`, { err: E('startDate') })}</div>
        <div style="width:118px">${C.field('Time (IST)', `<input type="time" class="input" value="${r.auctionTime}" onchange="CW.set('auctionTime',this.value)">`)}</div></div>
      ${C.field('Bidding window', `<div class="row gap8"><input class="input" style="width:90px" inputmode="numeric" value="${r.auctionMinutes}" onchange="CW.num('auctionMinutes',this.value,5)"><span class="sm muted">minutes</span></div>`)}
      <div class="info-card mb16">${icon('info', 16)}<div>Members bid the <b>discount they agree to give up</b>. The highest valid discount wins.</div></div>
      <div class="row gap12"><div class="grow">${C.field('Minimum discount', CW.moneyIn('minDiscountP'), { err: E('minDiscount') && ' ' })}</div><div class="grow">${C.field('Maximum discount', CW.moneyIn('maxDiscountP'), { err: E('maxDiscount') && ' ' })}</div></div>
      ${E('minDiscount') || E('maxDiscount') ? `<div class="field-err mb12">${icon('alert', 13)}${E('minDiscount') || E('maxDiscount')}</div>` : ''}
      ${C.field('Minimum bid increment', CW.moneyIn('incrementP'), { err: E('increment') })}
      ${adv('advAuction', 'Advanced auction rules', `<div class="label">Tie-break</div>${CW.opts('tieBreak', { first_bid: 'First bid wins', lots: 'Organiser draws lots' }, ChitEngine.TIE_BREAK)}
      <div class="label mt16">If no valid bid is received</div>${CW.opts('noBid', { postpone: 'Postpone 7 days', lots: 'Draw lots at minimum discount', carry: 'Move to next round' }, ChitEngine.NO_BID)}
      <div class="group mt16">
        ${CW.tog('extend', 'Extend on late bids', 'A bid in the last 30 seconds adds 30 seconds')}
        ${CW.tog('preBid', 'Allow bids before the window opens', 'Off: bids only while the auction is live')}
        <div class="li"><span class="li-main"><span>Bid visibility</span><span class="xs muted">${r.bidVisibility === 'all' ? 'Members see every accepted bid' : 'Members see only the leading bid'}</span></span><select class="select" style="width:130px" onchange="CW.set('bidVisibility',this.value)"><option value="all" ${r.bidVisibility === 'all' ? 'selected' : ''}>All bids</option><option value="leading" ${r.bidVisibility === 'leading' ? 'selected' : ''}>Leading only</option></select></div>
        <div class="li"><span class="li-main"><span>Eligibility to bid</span><span class="xs muted">Active membership + accepted rules</span></span><select class="select" style="width:130px" onchange="CW.set('eligibility',this.value)"><option value="paid_up" ${r.eligibility === 'paid_up' ? 'selected' : ''}>Must be paid up</option><option value="any" ${r.eligibility === 'any' ? 'selected' : ''}>Any member</option></select></div>
      </div>`)}`;

    {
      const sd = p.simD || Math.round((r.minDiscountP + r.maxDiscountP) / 2 / r.incrementP) * r.incrementP;
      const sm = Array.from({ length: r.members }, (_, i) => ({ id: 'm' + (i + 1) }));
      const st = ChitEngine.settle(r, p.simN || 1, sd, 'm2', sm);
      B.fee = `
      <div class="label">Fee basis</div>
      ${CW.opts('feeBasis', ChitEngine.FEE_BASIS, { pool_pct: `e.g. 5% × ${rs(r.poolP)} = ${rs(r.poolP * 0.05)}`, discount_pct: 'e.g. 5% of a ₹25,000 discount = ₹1,250', fixed: 'The same amount whenever the fee applies', none: 'The organiser takes no fee' })}
      ${r.feeBasis === 'none' ? '' : r.feeBasis === 'fixed' ? `<div class="mt12">${C.field('Fixed fee', CW.moneyIn('feeFixedP'), { err: E('fee') })}</div>`
        : `<div class="mt12">${C.field('Fee percentage', `<div class="row gap8"><div class="prefix-input" style="width:120px"><input inputmode="decimal" value="${r.feeBps / 100}" onchange="CW.set('feeBps',Math.round(parseFloat(this.value||0)*100))"><span>%</span></div><span class="sm muted">${ChitEngine.FEE_BASIS[r.feeBasis]}</span></div>`, { err: E('fee') })}</div>`}
      ${E('minDiscount') ? `<div class="info-card red mt12">${icon('alert', 16)}<div>${E('minDiscount')} <button class="link" onclick="CW.jump('auction')">Change in Auction rules</button></div></div>` : ''}
      <div class="label mt16">Who receives the dividend?</div>
      ${CW.opts('dividendTo', ChitEngine.DIV_TO)}
      ${adv('advFee', 'Advanced fee & settlement rules', `${r.feeBasis === 'none' ? '' : `
      <div class="label">When is the fee charged?</div>
      ${CW.opts('feeTiming', ChitEngine.FEE_TIMING)}
      ${r.feeTiming === 'selected' ? `<div class="chips wrap mt8">${Array.from({ length: r.rounds }, (_, i) => i + 1).map(n => `<button class="chip ${r.feeRounds.includes(n) ? 'on' : ''}" onclick="var f=CW.p().r.feeRounds;CW.set('feeRounds',f.includes(${n})?f.filter(x=>x!==${n}):f.concat(${n}).sort((a,b)=>a-b))">R${n}</button>`).join('')}</div>${E('feeRounds') ? `<div class="field-err">${icon('alert', 13)}${E('feeRounds')}</div>` : ''}` : ''}
      <div class="label mt16">Where does the fee come from?</div>
      ${CW.opts('feeSource', ChitEngine.FEE_SOURCE)}`}
      <div class="label mt16">Uneven split (paise left over)</div>
      ${CW.opts('remainder', { first_members: 'Lowest ticket numbers get 1 paisa each', organiser: 'Record as a rounding line to the organiser' })}
      <div class="group mt16">${CW.tog('creditDividend', 'Credit dividend against that round\'s contribution', 'Members pay contribution − dividend')}</div>`)}

      <div class="card p mt16"><div class="row between mb8"><div class="card-title" style="margin:0">Financial preview</div><span class="sample-tag">Preview</span></div>
        <p class="xs muted mb12">How a round settles under these rules. Move the slider to try different winning discounts.</p>
        <div class="row between xs"><span>Round <select class="select" style="width:80px;height:32px;display:inline-block;padding:0 24px 0 8px;font-size:13px" onchange="CW.p().simN=+this.value;App.refresh()">${Array.from({ length: r.rounds }, (_, i) => `<option ${(p.simN || 1) === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></span><b>${rs(sd)} discount</b></div>
        <input type="range" class="range" min="${r.minDiscountP / 100}" max="${r.maxDiscountP / 100}" step="${r.incrementP / 100}" value="${sd / 100}" oninput="CW.p().simD=this.value*100;App.refresh()">
        ${ChitUI.settlement(r, st, { sim: true })}</div>`;
    }

    // Members & schedule need a saved draft, so they are built only once that section is opened.
    const g = p.id && Chit.g(p.id), diff = g ? g.members.length - r.members : 0, sch = v.errors.startDate ? [] : ChitEngine.schedule(r);
    if (p.open.members && g) {
      const id = p.id, edits = Object.fromEntries(p.dateEdits || []);
      B.members = `
      <div class="row between mb8"><div class="h3">Members <span class="muted">${g.members.length}/${r.members}</span></div><button class="link" onclick="ChitUI.inviteSheet('${id}')">${icon('plus', 14)} Add</button></div>
      ${diff ? `<div class="info-card warn mb12">${icon('alert', 16)}<div>${diff < 0 ? `${-diff} ticket${diff < -1 ? 's' : ''} still open.` : `${diff} more than the configured ${r.members}.`} Auctions open only when the accepted member count matches. <button class="link" onclick="CW.addSamples()">Fill with sample members</button></div></div>` : `<div class="info-card teal mb12">${icon('check', 16)}<div>Member count matches the scheme.</div></div>`}
      <div class="group">${g.members.map(m => `<div class="li">${C.avatar(m.name, null, 34)}<span class="li-main"><span>${m.ticket} · ${esc(m.name)}${m.userId === 'me' ? ' (you)' : ''}</span><span class="xs muted">${fmt.masked(m.phone)} · invite sent on publish</span></span>${m.userId === 'me' ? C.badge('Organiser', 'navy') : `<button class="iconbtn" onclick="CW.removeMember('${m.id}')">${icon('trash', 17)}</button>`}</div>`).join('')}</div>
      <div class="row between mt24 mb8"><div class="h3">Auction schedule</div><span class="xs muted">Monthly · ${r.auctionTime} IST</span></div>
      <p class="xs muted mb8">Generated from the first auction date. Tap a round to move it for a holiday or village meeting.</p>
      <div class="group">${sch.map(x => { const at = edits[x.n] || x.auctionAt; return `<button class="li" onclick="CW.editDate(${x.n})"><span class="rnd">${x.n}</span><span class="li-main"><span>${fmt.day(at)}, ${fmt.time(at)}</span><span class="xs muted">Contribution due ${fmt.dm(new Date(new Date(at).getTime() + r.dueDays * 86400000))}${edits[x.n] ? ' · <b>moved</b>' : ''}</span></span>${icon('edit', 15, 'li-chev')}</button>`; }).join('')}</div>`;
    }

    const SEC = CW.SECTION_FIELDS;
    const sum = {
      basics: r.name ? esc(r.name) : 'Name, description, visibility',
      money: r.poolP > 0 && r.members ? `${rs(r.poolP)} · ${r.members} members · ${r.rounds} rounds${r.poolP % r.members ? '' : ' · ' + rs(r.poolP / r.members) + ' each'}` : 'Pool, members, rounds',
      auction: `${sch.length ? fmt.date(sch[0].auctionAt) + ' · ' : ''}${rs(r.minDiscountP)} – ${rs(r.maxDiscountP)} discount`,
      fee: `${ChitEngine.feeLabel(r, rs)} · dividend ${ChitEngine.DIV_TO[r.dividendTo]}`,
      members: g ? `${g.members.length}/${r.members} added · ${r.rounds} round dates` : 'Add members, adjust round dates'
    };
    const sect = (key, n, title, html) => {
      const open = p.open[key], bad = p.showErr && (SEC[key] || []).some(k => v.errors[k]);
      return `<div class="card acc ${open ? 'open' : ''} ${bad ? 'bad' : ''}" id="sec-${key}">
        <button class="acc-h" onclick="CW.toggle('${key}')"><span class="rnd">${n}</span><span class="grow"><b>${title}</b><span class="xs muted acc-sum">${bad ? 'Needs attention' : sum[key]}</span></span>${bad ? '<span class="acc-dot"></span>' : ''}<span class="acc-chev ${open ? 'up' : ''}">${icon('chevron', 18)}</span></button>
        ${open ? `<div class="acc-b">${html || ''}</div>` : ''}</div>`;
    };
    const allErrs = Object.values(v.errors);

    const body = `
      ${p.showErr && allErrs.length ? `<div class="info-card red mb12">${icon('alert', 16)}<div><b>Fix before publishing:</b><br>${allErrs.join('<br>')}</div></div>` : ''}
      ${sect('basics', 1, 'Basic details', B.basics)}
      ${sect('money', 2, 'Money', B.money)}
      ${sect('auction', 3, 'Auction rules', B.auction)}
      ${sect('fee', 4, 'Fee & dividend', B.fee)}
      ${sect('members', 5, 'Members & schedule', B.members)}
      <div class="info-card warn mt16 mb12">${icon('scale', 16)}<div><b>Legal review required.</b> Chit funds are regulated (Chit Funds Act, 1982 and state rules). Publishing in this prototype does not make a scheme compliant. Agreement version: <b>v1 (draft)</b>.</div></div>
      <p class="xs muted mb12">Overdue members cannot bid until paid. Corrections are recorded as reversals or adjustments with a reason. Members can raise a dispute from any round. Refund and exit terms follow the signed agreement.</p>
      <button class="opt ${p.confirm ? 'on' : ''} ${p.showErr && !p.confirm ? 'err-opt' : ''}" onclick="CW.p().confirm=!CW.p().confirm;App.refresh()"><span class="check">${p.confirm ? icon('check', 13) : ''}</span><span class="grow sm">I have reviewed these rules. Members will accept this exact version, and material terms cannot change after the chit starts.</span></button>`;

    return `${C.appbar(p.id ? 'Edit chit draft' : 'Create chit group', { white: true, onBack: 'CW.back()', right: `<button class="appbar-act" onclick="CW.save()">Save draft</button>` })}
      <div class="content pad" style="padding-top:8px">${body}</div>
      <div class="footer"><button class="btn btn-primary grow" onclick="CW.publish()">${icon('send', 18)}Publish chit</button></div>`;
  }
});

/* ===================== Chit home (module navigation) ===================== */
const chitGuard = p => {
  const s = svcById(p.id);
  if (!s) return 'notFound';
  if (!membership(p.id)) return 'denied';
  return '';
};

App.reg('chitHome', {
  net: true,
  guard: chitGuard,
  render(p) {
    const s = svcById(p.id), g = Chit.g(p.id), role = myRole(p.id), admin = role === 'admin', me = Chit.me(g);
    if (s.status === 'draft') { setTimeout(() => App.replace('chitWizard', { id: p.id }), 0); return ''; }
    const tab = p.tab || 'overview';
    const c = Chit.current(g), x = Chit.stats(g);
    const tabs = [['overview', 'Overview'], ['rounds', 'Rounds'], ['members', 'Members'], [admin ? 'payments' : 'ledger', admin ? 'Payments' : 'My ledger', admin ? x.toVerify.length + x.overdue.length : 0], ['more', 'More']];
    const hero = `<div class="p-hero chit-hero">
        <div class="row between"><span class="sub">${s.code} · ${esc(s.place || 'Chit group')}</span>${C.roleBadge(role, 'chit')}</div>
        <div class="row between mt8" style="align-items:flex-end"><div><div class="sub">Monthly pool</div><div class="hero-big">${rs(g.rules.poolP)}</div></div>
          <div style="text-align:right"><div class="sub">Round</div><div class="h2">${c.n}<span class="sub"> / ${g.rules.rounds}</span></div></div></div>
        <div class="meter light mt8"><i style="width:${Chit.settledCount(g) / g.rules.rounds * 100}%"></i></div>
        <div class="online-row">${c.status === 'OPEN' ? '<span class="live-dot"></span>' : icon('calendar', 16)}<div class="grow"><b>${c.status === 'OPEN' ? `Round ${c.n} auction is live` : c.status === 'SCHEDULED' ? `Round ${c.n} · ${fmt.when(c.auctionAt)}` : `Round ${c.n} · ${ROUND_ST[c.status].label}`}</b>
          <span class="xs" style="opacity:.8">${c.status === 'OPEN' ? 'Closes in <span data-cd="' + c.endsAt + '">' + fmt.clock((new Date(c.endsAt) - Date.now()) / 1000) + '</span>' : c.status === 'SCHEDULED' ? 'Opens <span data-cd="' + c.auctionAt + '">' + fmt.until(c.auctionAt) + '</span>' : 'Tap for details'}</span></div>
          <button class="btn btn-white btn-sm" onclick="App.go('${['OPEN', 'SCHEDULED'].includes(c.status) ? 'chitAuction' : 'chitRound'}',{id:'${p.id}',n:${c.n}})">${c.status === 'OPEN' ? 'Join' : 'Open'}</button></div>
      </div>`;

    let body = '';
    if (tab === 'overview') body = ChitHome.overview(p.id, g, admin, me, x);
    if (tab === 'rounds') body = ChitHome.rounds(p.id, g);
    if (tab === 'members') body = ChitHome.members(p.id, g, admin);
    if (tab === 'payments') body = ChitHome.payments(p.id, g, p);
    if (tab === 'ledger') body = ChitHome.ledger(p.id, g, me);
    if (tab === 'more') body = ChitHome.more(p.id, g, admin);

    return `${C.appbar(esc(s.name), { white: true, sub: `${Reg.get('chit').name} · ${s.status === 'active' ? 'Active' : s.status}`, right: `${admin ? `<button class="iconbtn" onclick="ChitUI.inviteSheet('${p.id}')" aria-label="Invite">${icon('plus', 22)}</button>` : ''}<button class="iconbtn" onclick="App.go('chitRules',{id:'${p.id}'})" aria-label="Rules">${icon('file', 21)}</button>` })}
      <div class="content">
        ${s.status !== 'active' ? `<div class="px mt12">${C.banner(s.status === 'paused' ? 'warn' : 'red', 'pause', `This chit is ${s.status}`, s.status === 'paused' ? 'Auctions will not open until the organiser resumes it.' : 'No further rounds will run.')}</div>` : ''}
        <div class="px mt12">${hero}</div>
        ${me && me.invite === 'INVITED' ? `<div class="px mt12"><button class="status-banner warn" style="width:100%;text-align:left" onclick="App.go('chitRules',{id:'${p.id}',accept:1})"><div class="sb-ic">${icon('file', 20)}</div><div class="grow"><h3>Review and accept the rules</h3><p>You can bid and pay once you accept rules v${g.ruleVersions.length}.</p></div>${icon('chevron', 18)}</button></div>` : ''}
        <div class="mt12">${C.tabsLine('chit-' + p.id, tabs, tab, "App.set('tab',")}</div>
        ${body}
      </div>`;
  }
});

// Tab bodies for the chit home.
const ChitHome = {
  overview(id, g, admin, me, x) {
    const pend = Reg.get('chit').pending(svcById(id), myRole(id));
    const last = [...g.rounds].reverse().find(r => r.status === 'SETTLED');
    const pr = g.rounds.find(r => ['RESULT_PENDING_APPROVAL', 'DISPUTED'].includes(r.status));
    let col = '';
    if (last && admin) {
      const os = Chit.active(g).map(m => Chit.oblig(g, m.id, last.n));
      const n = k => os.filter(o => o.status === k).length;
      col = `${C.sec(`Round ${last.n} collection`, `<button class="link" onclick="App.set('tab','payments')">Manage</button>`)}
        <div class="px"><div class="card p"><div class="row between"><div><div class="xs muted">Collected</div><div class="h2">${rs(os.reduce((a, o) => a + o.paidP, 0))} <span class="sm muted">of ${rs(os.reduce((a, o) => a + o.netP, 0))}</span></div></div>${C.badge(`${n('paid')}/${os.length} paid`, 'green')}</div>
          ${C.bar(os.reduce((a, o) => a + o.paidP, 0) / Math.max(1, os.reduce((a, o) => a + o.netP, 0)) * 100)}
          <div class="row gap8 mt8 wrap">${C.badge(`${n('overdue')} overdue`, 'red')}${C.badge(`${n('partial')} part paid`, 'warn')}${C.badge(`${n('verifying')} verifying`, 'blue')}${C.badge(`${n('pending')} due`, 'grey')}</div></div></div>`;
    }
    const mine = me && me.invite === 'ACCEPTED' ? (() => {
      const ar = Chit.arrears(g, me.id), el = Chit.eligibility(g, me.id, Chit.current(g).n);
      return `${C.sec('Your position', `<button class="link" onclick="App.go('chitMember',{id:'${id}',mid:'${me.id}'})">Statement</button>`)}
        <div class="px"><div class="mini-grid">
          <div class="mini"><div class="l">You owe now</div><div class="v ${ar.length ? 'red' : ''}">${rs(ar.reduce((a, o) => a + o.balP, 0))}</div></div>
          <div class="mini"><div class="l">Dividends credited</div><div class="v green">${rs(g.ledger.filter(e => e.memberId === me.id && e.type === 'DIVIDEND_CREDIT').reduce((a, e) => a + e.creditP, 0))}</div></div>
          <div class="mini"><div class="l">Ticket</div><div class="v">${me.ticket}</div></div>
          <div class="mini"><div class="l">Round ${Chit.current(g).n} bidding</div><div class="v sm ${el.ok ? 'green' : 'red'}" style="font-size:14px">${el.ok ? 'Eligible' : me.wins.length ? `Won round ${me.wins[0]}` : 'Not eligible'}</div></div>
        </div>${ar.length ? `<button class="btn btn-primary btn-block mt12" onclick="ChitUI.paySheet('${id}','${me.id}')">${icon('wallet', 18)}Pay ${rs(ar.reduce((a, o) => a + o.balP, 0))}</button>` : ''}</div>`;
    })() : '';
    return `
      ${pend.length ? `<div class="px mt12">${pend.slice(0, 4).map(a => `<button class="status-banner ${a.tone} act-row" onclick="App.go('${a.go.s}',${JSON.stringify(a.go.p).replace(/"/g, "'")})"><div class="sb-ic">${icon(a.ic, 18)}</div><div class="grow"><h3>${a.title}</h3><p>${a.sub}</p></div>${icon('chevron', 16)}</button>`).join('')}</div>` : ''}
      ${pr ? `<div class="px mt12"><div class="card p"><div class="row between"><div class="b">Round ${pr.n} result</div>${ChitUI.roundBadge(pr)}</div>
        <div class="row gap12 mt8">${C.avatar(Chit.mem(g, pr.result.winnerId).name, null, 40)}<div class="grow"><div class="b">${ChitUI.memName(id, g, Chit.mem(g, pr.result.winnerId))}</div><div class="xs muted">Winning discount ${rs(pr.result.discountP)} · payout ${rs(pr.result.st.payoutNetP)}</div></div></div>
        <button class="btn ${admin ? 'btn-primary' : 'btn-outline'} btn-block btn-md mt12" onclick="App.go('chitRound',{id:'${id}',n:${pr.n}})">${admin ? 'Review & approve' : 'View result'}</button></div></div>` : ''}
      ${mine}
      ${col}
      ${admin ? `${C.sec('Group totals')}<div class="px"><div class="mini-grid">
        <div class="mini"><div class="l">Contributions collected</div><div class="v">${rs(x.collectedP)}</div></div>
        <div class="mini"><div class="l">Outstanding</div><div class="v ${x.outstandingP ? 'red' : ''}">${rs(x.outstandingP)}</div></div>
        <div class="mini"><div class="l">Fees (${ChitEngine.feeLabel(g.rules, rs).replace('of monthly gross pool', 'of pool')})</div><div class="v">${rs(x.feesP)}</div></div>
        <div class="mini"><div class="l">Dividends credited</div><div class="v">${rs(x.divP)}</div></div>
        <div class="mini"><div class="l">Paid to winners</div><div class="v">${rs(x.paidOutP)}</div></div>
        <div class="mini"><div class="l">Members accepted</div><div class="v">${Chit.active(g).length}/${g.rules.members}</div></div></div></div>` : ''}
      ${C.sec('Recent rounds', `<button class="link" onclick="App.set('tab','rounds')">All rounds</button>`)}
      <div class="px">${g.rounds.filter(r => r.result).slice(-3).reverse().map(r => ChitHome.roundCard(id, g, r)).join('') || '<p class="sm muted">No completed rounds yet.</p>'}</div>
      ${C.sec('Scheme')}<div class="px"><div class="card p">${ChitUI.rulesKv(g.rules)}<button class="btn btn-outline btn-block btn-md mt12" onclick="App.go('chitRules',{id:'${id}'})">${icon('file', 17)}Rules & agreement v${g.ruleVersions.length}</button></div></div>`;
  },

  roundCard(id, g, r) {
    const res = r.result, w = res && Chit.mem(g, res.winnerId), moved = r.origAt && r.origAt !== r.auctionAt;
    return `<button class="card rd" onclick="App.go('${r.status === 'OPEN' ? 'chitAuction' : 'chitRound'}',{id:'${id}',n:${r.n}})">
      <div class="row between"><div class="row gap8"><span class="rnd ${r.status === 'SETTLED' ? 'done' : r.status === 'OPEN' ? 'live' : ''}">${r.n}</span><div><div class="b">${fmt.day(r.auctionAt)}, ${fmt.time(r.auctionAt)}</div>${moved ? `<div class="tiny muted">Originally ${fmt.dm(r.origAt)}</div>` : ''}</div></div>${ChitUI.roundBadge(r)}</div>
      ${res ? `<div class="rd-grid"><div><span>Winner</span><b>${w.userId === 'me' ? 'You' : w.ticket}</b></div><div><span>Discount</span><b>${rs(res.discountP)}</b></div><div><span>Payout</span><b>${rs(res.st.payoutNetP)}</b></div><div><span>Fee</span><b>${rs(res.st.feeP)}</b></div><div><span>Dividend pool</span><b>${rs(res.st.dividendPoolP)}</b></div><div><span>Per member</span><b>${rs(res.st.perMemberP)}</b></div></div>
        ${r.payout ? `<div class="row between mt8 xs"><span class="muted">Payout</span>${ChitUI.payoutBadge(r.payout)}</div>` : ''}` : ''}
    </button>`;
  },

  rounds(id, g) {
    const done = g.rounds.filter(r => r.result || r.status === 'NO_VALID_BIDS'), up = g.rounds.filter(r => !r.result && r.status !== 'NO_VALID_BIDS');
    return `<div class="px mt12">
      <div class="info-card mb12">${icon('info', 16)}<div>Every round stays in history, including postponed or no-bid rounds. Fee: ${ChitEngine.feeLabel(g.rules, rs)}, ${ChitEngine.FEE_TIMING[g.rules.feeTiming].toLowerCase()}.</div></div>
      ${up.length ? `<div class="group-label">Upcoming & current</div>${up.slice(0, 3).map(r => ChitHome.roundCard(id, g, r)).join('')}${up.length > 3 ? `<details class="more-rounds"><summary class="link">Show ${up.length - 3} more scheduled rounds</summary>${up.slice(3).map(r => ChitHome.roundCard(id, g, r)).join('')}</details>` : ''}` : ''}
      ${done.length ? `<div class="group-label">Completed</div>${done.slice().reverse().map(r => ChitHome.roundCard(id, g, r)).join('')}` : ''}
      ${Reg.can(id, 'reports') ? `<button class="btn btn-outline btn-block mt16" onclick="ChitUI.exportCsv('${id}')">${icon('download', 17)}Export round history (CSV)</button>` : ''}</div>`;
  },

  members(id, g, admin) {
    const invited = g.members.filter(m => m.invite === 'INVITED').length;
    return `<div class="px mt12">
      <div class="row between mb8"><div class="sm"><b>${Chit.active(g).length}</b> of ${g.rules.members} accepted${invited ? ` · ${invited} invited` : ''}</div>${admin ? `<button class="btn btn-outline btn-sm" onclick="ChitUI.inviteSheet('${id}')">${icon('plus', 15)}Invite</button>` : ''}</div>
      ${!admin ? `<div class="info-card mb12">${icon('lock', 16)}<div>Phone numbers, bank details and payment references of other members are private. You see ticket numbers and display names only.</div></div>` : ''}
      <div class="group">${g.members.map(m => {
        const ar = Chit.arrears(g, m.id), od = ar.some(o => o.status === 'overdue');
        const tag = m.invite === 'INVITED' ? C.badge('Invited', 'warn') : od && admin ? C.badge('Overdue', 'red') : m.wins.length ? C.badge('Won R' + m.wins[0], 'teal') : '';
        const can = admin || m.userId === 'me';
        return `<${can ? 'button' : 'div'} class="li" ${can ? `onclick="App.go('chitMember',{id:'${id}',mid:'${m.id}'})"` : ''}>${C.avatar(m.name, null, 36)}<span class="li-main"><span>${m.ticket} · ${m.userId === 'me' ? 'You' : esc(m.name)}</span><span class="xs muted">${admin ? fmt.phone(m.phone) + (m.acceptedVersion ? ` · rules v${m.acceptedVersion}` : ' · not accepted') : m.invite === 'INVITED' ? 'Invitation pending' : 'Member'}</span></span>${tag}${can ? icon('chevron', 16, 'li-chev') : ''}</${can ? 'button' : 'div'}>`;
      }).join('')}</div></div>`;
  },

  payments(id, g, p) {
    const f = p.pf || 'verify';
    const toV = g.payments.filter(x => x.status === 'RECORDED_PENDING_VERIFICATION');
    const pend = g.payments.filter(x => x.status === 'PENDING');
    const od = Chit.active(g).map(m => ({ m, ar: Chit.arrears(g, m.id).filter(o => o.status !== 'verifying') })).filter(x => x.ar.length);
    const recent = g.payments.slice().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 25);
    const payRow = (x, acts) => { const m = Chit.mem(g, x.memberId); return `<div class="card p mb8"><div class="row between"><div class="b">${m.ticket} · ${esc(m.name)}</div>${ChitUI.payBadge(x)}</div>
      <div class="row between xs muted mt4"><span>Round ${x.n} · ${x.method}${x.ref ? ' · ' + esc(x.ref) : ''}</span><b style="color:var(--text);font-size:14px">${rs(x.amountP)}</b></div>
      <div class="xs muted mt4">${x.receipt} · recorded by ${esc(actorName(x.recordedBy))} · ${fmt.rel(x.at)}${x.verifiedBy ? ' · verified by ' + esc(actorName(x.verifiedBy)) : ''}</div>${acts || ''}</div>`; };
    let list = '';
    if (f === 'verify') list = (toV.length ? `<p class="xs muted mb8">Cash recorded by an agent or organiser counts only after a second check.</p>${toV.map(x => payRow(x, `<div class="pbk-actions"><button class="btn btn-sm btn-outline danger" onclick="UI.reason({title:'Reverse this cash entry?',message:'The entry is kept and marked reversed.',danger:true,confirm:'Reverse',presets:['Recorded against the wrong member','Duplicate entry','Cash not handed over'],onConfirm:t=>Chit.reversePayment('${id}','${x.id}',t)})">Reverse</button><button class="btn btn-sm btn-primary" onclick="Chit.verifyPayment('${id}','${x.id}')">Verify & issue receipt</button></div>`)).join('')}` : C.empty({ ic: 'check', title: 'Nothing to verify', text: 'Cash entries waiting for a second check appear here.' }))
      + (pend.length ? `<div class="group-label">Waiting for bank confirmation</div>${pend.map(x => payRow(x)).join('')}` : '');
    if (f === 'due') list = od.length ? od.map(({ m, ar }) => `<div class="card p mb8"><div class="row between"><div class="b">${m.ticket} · ${esc(m.name)}</div>${ChitUI.oblBadge(ar[0])}</div>
      <div class="xs muted mt4">${ar.map(o => `Round ${o.n}: ${rs(o.balP)}${o.paidP ? ` (paid ${rs(o.paidP)})` : ''} · due ${fmt.dm(o.dueAt)}`).join('<br>')}</div>
      <div class="pbk-actions"><button class="btn btn-sm btn-outline" onclick="UI.toast('Reminder sent to ${esc(m.name).replace(/'/g, '')} by SMS (simulated)','ok')">${icon('bell', 14)}Remind</button><button class="btn btn-sm btn-primary" onclick="ChitUI.paySheet('${id}','${m.id}',${ar[0].n})">Record payment</button></div></div>`).join('') : C.empty({ ic: 'check', title: 'Everyone is paid up', text: 'Members with outstanding contributions appear here.' });
    if (f === 'all') list = recent.map(x => payRow(x, x.status === 'CONFIRMED' ? `<div class="row mt8" style="justify-content:flex-end"><button class="link" onclick="UI.reason({title:'Reverse ${x.receipt}?',message:'A reversal ledger entry is added. The original payment stays visible.',danger:true,confirm:'Reverse',onConfirm:t=>Chit.reversePayment('${id}','${x.id}',t)})">Reverse</button></div>` : '')).join('');
    return `<div class="px mt12">
      ${C.seg('pay-' + id, [['verify', 'To verify', toV.length], ['due', 'Outstanding', od.length], ['all', 'Recent', null]], f, "App.set('pf',")}
      <div class="mt12">${list}</div>
      <button class="btn btn-outline btn-block mt8" onclick="ChitHome.pickMember('${id}')">${icon('plus', 17)}Record a payment</button></div>`;
  },
  pickMember(id) {
    const g = Chit.g(id);
    const due = Chit.active(g).filter(m => Chit.arrears(g, m.id).some(o => o.status !== 'verifying'));
    UI.sheet(`<div class="sheet-title">Record payment for</div><div class="group mt8">${due.map(m => `<button class="li" onclick="UI.close(true);ChitUI.paySheet('${id}','${m.id}')">${C.avatar(m.name, null, 32)}<span class="li-main"><span>${m.ticket} · ${esc(m.name)}</span><span class="xs muted">Owes ${rs(Chit.arrears(g, m.id).reduce((a, o) => a + o.balP, 0))}</span></span>${icon('chevron', 16, 'li-chev')}</button>`).join('') || '<p class="pad sm muted">No member has anything due.</p>'}</div>`);
  },

  ledger(id, g, me) {
    if (!me) return C.empty({ ic: 'wallet', title: 'No ticket', text: 'You do not hold a ticket in this chit.' });
    return `<div class="px mt12">${ChitScreens.statement(id, g, me)}</div>`;
  },

  more(id, g, admin) {
    const s = svcById(id);
    return `<div class="px mt12"><div class="group">
      ${C.item('file', 'Rules & agreement', `App.go('chitRules',{id:'${id}'})`, { sub: `Version ${g.ruleVersions.length} · published ${fmt.date(g.ruleVersions[g.ruleVersions.length - 1].publishedAt)}` })}
      ${C.item('calc', 'Scheme calculator', `App.go('chitCalc',{id:'${id}'})`, { sub: 'Simulation only · never creates real entries' })}
      ${admin ? C.item('chart', 'Reports & reconciliation', `App.go('chitReports',{id:'${id}'})`, { sub: 'Collections, fees, dividends, payouts' }) : ''}
      ${C.item('flag', 'Disputes', `App.go('chitDisputes',{id:'${id}'})`, { right: g.disputes.length || '' })}
      ${C.item('history', 'Audit log', `App.go('audit',{svc:'${id}'})`, { sub: 'Who changed what, when and why' })}
      ${C.item('share', 'Invite code', `UI.copy('${s.code}','Invite code copied')`, { right: s.code, noChev: true })}
    </div>
    ${admin ? `<div class="group-label">Organiser settings</div><div class="group">
      ${s.status === 'active' ? C.item('pause', 'Pause chit', `UI.reason({title:'Pause this chit?',message:'Scheduled auctions will not open while paused. Members are notified.',confirm:'Pause',onConfirm:t=>Act.setStatus('${id}','paused',t)})`, { sub: 'Auctions stop until resumed' }) : s.status === 'paused' ? C.item('play', 'Resume chit', `Act.setStatus('${id}','active','Resumed')`) : ''}
      ${C.item('lock', 'Amend published rules', `UI.dialog({title:'Rules are locked',message:'Material financial terms cannot be edited after publication. An amendment creates rules v${g.ruleVersions.length + 1} that every member must accept, and it is not applied to completed rounds.',icon:'lock',actions:[{label:'OK',cls:'btn-primary'}]})`, { sub: 'Versioned · needs member acceptance' })}
      ${C.item('x', 'Cancel chit', `UI.reason({title:'Cancel this chit?',message:'Completed rounds and all financial records are kept. Outstanding balances must be settled offline.',danger:true,confirm:'Cancel chit',onConfirm:t=>Act.setStatus('${id}','cancelled',t)})`, { danger: true })}
    </div>` : ''}</div>`;
  }
};

/* ===================== Round detail ===================== */
App.reg('chitRound', {
  guard: chitGuard,
  render(p) {
    const s = svcById(p.id), g = Chit.g(p.id), r = Chit.round(g, p.n), admin = myRole(p.id) === 'admin', me = Chit.me(g);
    const res = r.result, w = res && Chit.mem(g, res.winnerId);
    const banners = {
      SCHEDULED: ['blue', 'calendar', `Auction ${fmt.when(r.auctionAt)}`, `Opens ${fmt.until(r.auctionAt)}. The server opens and closes bidding automatically.`],
      OPEN: ['red', 'gavel', 'Auction is live', 'Bidding is open. Server time decides acceptance and closing.'],
      RESULT_PENDING_APPROVAL: ['warn', 'clock', 'Result pending approval', admin ? 'Check the calculation, then approve to finalise and post the settlement.' : 'The organiser is reviewing the result. Amounts are not final yet.'],
      FINALIZED: ['teal', 'check', 'Result finalised', 'Settlement is being posted.'],
      SETTLED: ['green', 'shield', 'Settled', 'The result is final. Corrections need a recorded adjustment, never an edit.'],
      NO_VALID_BIDS: ['grey', 'x', 'No valid bids', ChitEngine.NO_BID[g.rules.noBid]],
      DISPUTED: ['red', 'flag', 'Settlement needs attention', res ? res.st.errors.join(' ') : 'A dispute is open.'],
      CANCELLED: ['red', 'x', 'Round cancelled', '']
    };
    const b = banners[r.status] || banners.SCHEDULED;
    const ob = me && r.status === 'SETTLED' ? Chit.oblig(g, me.id, r.n) : null;
    const showBids = r.bids.filter(x => x.status === 'ACCEPTED' && !x.round);
    const visible = admin || g.rules.bidVisibility === 'all' ? showBids : showBids.filter(x => x.id === (res && res.bidId) || (me && x.memberId === me.id));
    const p2 = r.payout, pi = p2 ? PAYOUT_PATH.indexOf(p2.status) : -1;
    const payoutActs = p2 && admin ? ({
      PENDING: `<button class="btn btn-primary btn-block btn-md" onclick="Chit.payoutStep('${p.id}',${r.n},'UNDER_REVIEW')">Start review</button>`,
      UNDER_REVIEW: `<div class="row gap8"><button class="btn btn-outline btn-md grow" onclick="UI.reason({title:'Reject payout?',danger:true,confirm:'Reject',onConfirm:t=>Chit.payoutStep('${p.id}',${r.n},'REJECTED',t)})">Reject</button><button class="btn btn-primary btn-md grow" onclick="Chit.payoutStep('${p.id}',${r.n},'APPROVED')">Approve payout</button></div>`,
      APPROVED: `<button class="btn btn-primary btn-block btn-md" onclick="UI.confirm({title:'Send ${rs(p2.netP)}?',message:'Transfer to ${esc(w.name)} (${p2.dest}). The payout is marked paid only after the bank confirms.',confirm:'Send transfer',icon:'bank',onConfirm:()=>Chit.payoutStep('${p.id}',${r.n},'PROCESSING')})">${icon('bank', 17)}Send transfer</button>`,
      FAILED: `<button class="btn btn-primary btn-block btn-md" onclick="Chit.payoutRetry('${p.id}',${r.n})">${icon('refresh', 17)}Check status & retry</button>`
    }[p2.status] || '') : '';

    return `${C.appbar(`Round ${r.n}`, { white: true, sub: esc(s.name) })}
      <div class="content">
        <div class="px mt12">${C.banner(b[0], b[1], b[2], b[3])}</div>
        ${['SCHEDULED', 'OPEN'].includes(r.status) ? `<div class="px mt12"><button class="btn btn-primary btn-block" onclick="App.go('chitAuction',{id:'${p.id}',n:${r.n}})">${icon('gavel', 18)}${r.status === 'OPEN' ? 'Enter auction room' : 'View auction room'}</button></div>` : ''}

        ${C.sec('Schedule')}<div class="px"><div class="card p">
          ${C.kv('gavel', 'Auction', `${fmt.dt(r.auctionAt)} IST${r.endsAt && r.status !== 'SCHEDULED' ? ` · closed ${fmt.time(r.closedAt || r.endsAt)}` : ` · ${g.rules.auctionMinutes} min window`}`)}
          ${r.origAt !== r.auctionAt ? C.kv('history', 'Originally scheduled', fmt.dt(r.origAt)) : ''}
          ${C.kv('wallet', 'Contribution due', fmt.dt(r.dueAt))}
          ${admin && r.status === 'SCHEDULED' ? `<button class="btn btn-outline btn-block btn-md mt8" onclick="ChitUI.rescheduleSheet('${p.id}',${r.n})">${icon('calendar', 17)}Reschedule</button>` : ''}</div></div>

        ${res ? `${C.sec('Result')}<div class="px"><div class="card p">
          <div class="row gap12">${C.avatar(w.name, null, 44)}<div class="grow"><div class="b">${ChitUI.memName(p.id, g, w)}</div><div class="xs muted">Winning bid ${rs(res.discountP)} at ${fmt.time(r.bids.find(x => x.id === res.bidId).at)} (server time)</div></div>${C.badge(res.status === 'FINAL' ? 'Final' : 'Draft', res.status === 'FINAL' ? 'green' : 'warn')}</div>
          ${res.tie ? `<div class="info-card warn mt12">${icon('scale', 16)}<div>Tie at ${rs(res.discountP)}. ${ChitEngine.TIE_BREAK[g.rules.tieBreak]}.</div></div>` : ''}
          ${res.approvedAt ? `<div class="xs muted mt8">Approved by ${esc(actorName(res.approvedBy))} · ${fmt.dt(res.approvedAt)} · rules v${res.rulesVersion} · ${res.st.version}</div>` : ''}
        </div></div>
        ${C.sec(res.status === 'FINAL' ? 'Final settlement' : 'Draft settlement')}<div class="px"><div class="card p">${ChitUI.settlement(g.rules, res.st)}</div></div>
        ${r.status === 'RESULT_PENDING_APPROVAL' && admin ? `<div class="px mt12"><button class="btn btn-primary btn-block" onclick="UI.confirm({title:'Approve and finalise?',message:'The result becomes final and the settlement is posted to every member ledger. It cannot be edited afterwards — only adjusted with a recorded reason.',confirm:'Approve',icon:'check',onConfirm:()=>Chit.approveResult('${p.id}',${r.n})})">${icon('check', 18)}Approve result</button></div>` : ''}` : ''}

        ${ob ? `${C.sec('Your round ' + r.n)}<div class="px"><div class="card p">${C.rows([['Scheduled contribution', rs(ob.dueP)], ['Dividend credit', '− ' + rs(ob.creditP)], ['Net contribution', rs(ob.netP)], ['Paid (confirmed)', rs(ob.paidP)]], ['Balance', rs(ob.balP)])}
          <div class="row between mt12">${ChitUI.oblBadge(ob)}${ob.balP > 0 ? `<button class="btn btn-primary btn-sm" onclick="ChitUI.paySheet('${p.id}','${me.id}',${r.n})">Pay ${rs(ob.balP)}</button>` : ''}</div>
          <p class="tiny muted mt8">A dividend is shown as credited against your contribution — it is not paid to you in cash.</p></div></div>` : ''}

        ${p2 ? `${C.sec('Winner payout')}<div class="px"><div class="card p">
          <div class="row between"><div><div class="xs muted">Net payout</div><div class="h2">${rs(p2.netP)}</div></div>${ChitUI.payoutBadge(p2)}</div>
          ${p2.deductions.length ? C.rows([['Gross payout', rs(p2.grossP)]].concat(p2.deductions.map(d => [d.label, '− ' + rs(d.amountP)]))) : ''}
          <div class="stepper-bar mt12" style="grid-template-columns:repeat(5,1fr)">${PAYOUT_PATH.map((st, i) => `<div class="sp ${pi > i || p2.status === 'PAID' ? 'done' : pi === i ? 'cur' : ''}"><i></i><span>${['Pending', 'Review', 'Approved', 'Sending', 'Paid'][i]}</span></div>`).join('')}</div>
          ${p2.status === 'FAILED' ? `<div class="info-card red mt12">${icon('alert', 16)}<div>${esc(p2.failReason)}</div></div>` : ''}
          <div class="mt12">${C.kv('bank', 'Destination', (admin || (me && w.id === me.id)) ? `${p2.method} · ${p2.dest}` : 'Private')}${p2.ref ? C.kv('hash', 'Bank reference', p2.ref) : ''}</div>
          ${payoutActs ? `<div class="mt8">${payoutActs}</div>` : ''}
          <details class="mt8"><summary class="link">Payout history (${p2.history.length})</summary><div class="mt8">${C.timeline(p2.history.map(h => ({ t: PAYOUT_ST[h.s].label, note: [h.by && actorName(h.by), h.note].filter(Boolean).map(esc).join(' · '), at: h.at, tone: ['FAILED', 'REJECTED'].includes(h.s) ? 'red' : '' })))}</div></details>
        </div></div>` : ''}

        ${showBids.length ? `${C.sec(`Bids (${showBids.length})`, `<span class="xs muted">${g.rules.bidVisibility === 'all' ? 'All accepted bids' : 'Leading bid only'}</span>`)}<div class="px"><div class="group">${visible.slice().reverse().map(x => { const m = Chit.mem(g, x.memberId); return `<div class="li"><span class="li-main"><span>${m.userId === 'me' ? 'You' : m.ticket}${x.id === (res && res.bidId) ? ' · <b class="green">Winning bid</b>' : ''}</span><span class="xs muted">${toDate(x.at).toLocaleTimeString('en-IN', { timeZone: TZ, hour12: true })}</span></span><b>${rs(x.discountP)}</b></div>`; }).join('')}</div></div>` : ''}

        ${C.sec('Round history')}<div class="px"><div class="card p">${r.history.length ? C.timeline(r.history.map(h => ({ t: h.t, note: [h.note, h.by && h.by !== 'system' ? 'by ' + actorName(h.by) : ''].filter(Boolean).map(esc).join(' · '), at: h.at, tone: /no valid|failed|cancel/i.test(h.t) ? 'red' : /reschedul|extended/i.test(h.t) ? 'info' : '' })).concat(r.status === 'SETTLED' ? [] : [{ t: 'Result & settlement', todo: true }])) : '<p class="sm muted">Nothing has happened in this round yet.</p>'}</div></div>
        ${me && res ? `<div class="px mt16"><button class="btn btn-outline btn-block" onclick="ChitUI.disputeSheet('${p.id}',${r.n})">${icon('flag', 17)}Raise a dispute</button></div>` : ''}
      </div>`;
  }
});

/* ===================== Live auction room ===================== */
const AR = {
  amt: null,
  bid(id, n) {
    const g = Chit.g(id), r = Chit.round(g, n), hi = Chit.highest(r);
    const v = AR.amt;
    const err = ChitEngine.checkBid(g.rules, hi ? hi.discountP : 0, v);
    if (err) return UI.toast(err, 'err');
    const req = uid('q'); // created once per confirmation, so a retried tap cannot create a second bid
    UI.confirm({
      title: `Bid ${rs(v)} discount?`, icon: 'gavel',
      message: `If you win, you receive <b>${rs(g.rules.poolP - v)}</b> before any itemised deductions, and you keep paying future instalments. Accepted bids cannot be withdrawn.`,
      confirm: 'Place bid',
      onConfirm: () => {
        const btn = document.getElementById('bidBtn'); if (btn) btn.classList.add('loading');
        setTimeout(() => {
          const b = Chit.placeBid(id, n, v, req);
          if (!b) return;
          if (b.status === 'ACCEPTED') UI.toast(`Bid accepted at ${toDate(b.at).toLocaleTimeString(I18n.locale(), { timeZone: TZ, hour12: true })}`, 'ok');
          else UI.toast('Bid rejected: ' + b.reason, 'err');
          AR.amt = null; App.refresh();
        }, 650);
      }
    });
  },
  adj(id, n, k) {
    const g = Chit.g(id), r = Chit.round(g, n), hi = Chit.highest(r), min = hi ? hi.discountP + g.rules.incrementP : g.rules.minDiscountP;
    AR.amt = Math.min(g.rules.maxDiscountP, Math.max(min, (AR.amt || min) + k * g.rules.incrementP));
    App.refresh();
  }
};

App.reg('chitAuction', {
  guard: chitGuard,
  mount() { ChitClock.tick(); },
  render(p) {
    const s = svcById(p.id), g = Chit.g(p.id), r = Chit.round(g, p.n), me = Chit.me(g), admin = myRole(p.id) === 'admin';
    if (!p._init) { p._init = true; AR.amt = null; }
    const hi = Chit.highest(r), open = r.status === 'OPEN';
    const min = hi ? hi.discountP + g.rules.incrementP : g.rules.minDiscountP;
    if (AR.amt == null || AR.amt < min) AR.amt = Math.min(min, g.rules.maxDiscountP);
    const el = me ? Chit.eligibility(g, me.id, r.n) : { ok: false, reasons: ['You do not hold a ticket in this chit.'] };
    const est = hi ? ChitEngine.settle(g.rules, r.n, hi.discountP, hi.memberId, Chit.active(g)) : null;
    const accepted = r.bids.filter(b => !b.round && (b.status === 'ACCEPTED' || (me && b.memberId === me.id)));
    const feed = (admin || g.rules.bidVisibility === 'all' ? accepted : accepted.filter(b => b === hi || (me && b.memberId === me.id))).slice().reverse();
    const hm = hi && Chit.mem(g, hi.memberId);
    const leading = hm && me && hm.id === me.id;

    const room = open ? `
      <div class="auc-hero ${leading ? 'lead' : ''}">
        <div class="row between"><span class="live-pill"><span class="live-dot"></span>LIVE · Round ${r.n}</span><span class="auc-cd">${icon('clock', 15)}<span data-cd="${r.endsAt}">${fmt.clock((new Date(r.endsAt) - Date.now()) / 1000)}</span></span></div>
        <div class="auc-k mt12">${hi ? 'Highest discount' : 'No bids yet'}</div>
        <div class="auc-amt">${hi ? rs(hi.discountP) : rs(g.rules.minDiscountP)}</div>
        <div class="auc-who">${hi ? (leading ? `${icon('trophy', 15)} You are leading` : `by ${hm.ticket}${g.rules.bidVisibility === 'all' || admin ? ' · ' + esc(hm.name) : ''}`) : 'Starting discount'}</div>
        ${est ? `<div class="auc-split"><div><span>Winner gets</span><b>${rs(est.payoutNetP)}</b></div><div><span>Fee</span><b>${rs(est.feeP)}</b></div><div><span>Dividend each</span><b>${rs(est.perMemberP)}</b></div></div>` : ''}
      </div>
      <p class="tiny muted center mt8">Server time is final. Countdown on your phone is only a guide.${g.rules.extend ? ' A bid in the last 30 s extends by 30 s.' : ''}</p>
      ${me ? (el.ok ? `<div class="card p mt12"><div class="row between"><div class="b">Your bid</div><span class="xs muted">Step ${rs(g.rules.incrementP)}</span></div>
          <div class="bid-ctl mt8"><button class="iconbtn" onclick="AR.adj('${p.id}',${r.n},-1)" ${AR.amt <= min ? 'disabled' : ''}>−</button><div class="bid-amt">${rs(AR.amt)}</div><button class="iconbtn" onclick="AR.adj('${p.id}',${r.n},1)" ${AR.amt >= g.rules.maxDiscountP ? 'disabled' : ''}>+</button></div>
          <div class="chips wrap mt8" style="justify-content:center">${[1, 2, 5].map(k => `<button class="chip" onclick="AR.amt=${Math.min(g.rules.maxDiscountP, min + (k - 1) * g.rules.incrementP)};App.refresh()">+${rs(k * g.rules.incrementP)}</button>`).join('')}<button class="chip" onclick="AR.amt=${g.rules.maxDiscountP};App.refresh()">Max</button></div>
          <div class="xs muted center mt8">You would receive ${rs(g.rules.poolP - AR.amt)} if this wins</div>
          <button id="bidBtn" class="btn btn-primary btn-block mt12" onclick="AR.bid('${p.id}',${r.n})">${icon('gavel', 18)}Place bid · ${rs(AR.amt)}</button></div>`
        : `<div class="mt12">${C.banner('grey', 'lock', 'You cannot bid in this round', el.reasons.map(esc).join('<br>'), Chit.arrears(g, me.id).length ? `<button class="btn btn-primary btn-sm mt8" onclick="ChitUI.paySheet('${p.id}','${me.id}')">Pay dues</button>` : '')}</div>`) : ''}
      ${admin ? `<div class="demo-strip">${icon('sparkles', 15)}<span>Prototype: the server closes this auction at the deadline.</span><button onclick="ChitClock.closeNow('${p.id}',${r.n});App.refresh()">Close now</button></div>` : ''}
      ${C.sec(`Bids (${accepted.filter(b => b.status === 'ACCEPTED').length})`, `<span class="xs muted">${g.rules.bidVisibility === 'all' ? 'All bids visible' : 'Leading bid only'}</span>`)}
      <div class="px"><div class="group bid-feed">${feed.map((b, i) => { const m = Chit.mem(g, b.memberId); return `<div class="li ${b.status === 'REJECTED' ? 'rej' : ''} ${i === 0 && b.status === 'ACCEPTED' ? 'top' : ''}">${C.avatar(m.name, null, 30)}<span class="li-main"><span>${m.userId === 'me' ? 'You' : m.ticket}${(admin || g.rules.bidVisibility === 'all') && m.userId !== 'me' ? ' · ' + esc(m.name) : ''}</span><span class="xs muted">${b.status === 'REJECTED' ? 'Rejected: ' + esc(b.reason) : toDate(b.at).toLocaleTimeString('en-IN', { timeZone: TZ, hour12: true })}</span></span><b>${rs(b.discountP)}</b></div>`; }).join('') || '<p class="pad sm muted center">Waiting for the first bid…</p>'}</div></div>`
      : r.status === 'SCHEDULED' ? `
      <div class="auc-hero wait">
        <div class="auc-k">Round ${r.n} opens</div>
        <div class="auc-amt" style="font-size:30px">${fmt.when(r.auctionAt)}</div>
        <div class="auc-who">${icon('clock', 15)} <span data-cd="${r.auctionAt}">${fmt.until(r.auctionAt)}</span></div>
      </div>
      ${Chit.active(g).length !== g.rules.members ? `<div class="info-card warn mt12">${icon('users', 16)}<div>${Chit.active(g).length} of ${g.rules.members} members have accepted the rules. The auction opens only when everyone has accepted.</div></div>` : ''}
      ${me ? `<div class="mt12">${C.banner(el.ok ? 'green' : 'grey', el.ok ? 'check' : 'lock', el.ok ? 'You are eligible to bid' : 'Not eligible to bid', el.ok ? 'Keep the app open at the auction time, or come back when you get the notification.' : el.reasons.map(esc).join('<br>'))}</div>` : ''}
      <div class="demo-strip">${icon('sparkles', 15)}<span>Prototype: open this auction now instead of waiting.</span><button onclick="if(ChitClock.openNow('${p.id}'))App.refresh()">Open now</button></div>`
      : `<div class="mt12">${C.banner(ROUND_ST[r.status].tone === 'grey' ? 'blue' : ROUND_ST[r.status].tone, ROUND_ST[r.status].ic, `Auction ${ROUND_ST[r.status].label.toLowerCase()}`, r.result ? `Highest bid ${rs(r.result.discountP)} by ${Chit.mem(g, r.result.winnerId).userId === 'me' ? 'you' : Chit.mem(g, r.result.winnerId).ticket}.` : '')}</div>
        <button class="btn btn-primary btn-block mt12" onclick="App.replace('chitRound',{id:'${p.id}',n:${r.n}})">View result & settlement</button>`;

    return `${C.appbar(`Auction room`, { white: true, sub: `${esc(s.name)} · round ${r.n}` })}
      <div class="content pad" style="padding-top:12px">${room}
        ${C.sec('Rules for this auction')}<div class="px" style="padding:0"><div class="card p">
          ${C.rows([['Monthly pool', rs(g.rules.poolP)], ['Discount range', `${rs(g.rules.minDiscountP)} – ${rs(g.rules.maxDiscountP)}`], ['Minimum increment', rs(g.rules.incrementP)], ['Tie-break', g.rules.tieBreak === 'first_bid' ? 'First bid at the highest amount' : 'Draw lots'], ['Fee this round', ChitEngine.feeApplies(g.rules, r.n) ? ChitEngine.feeLabel(g.rules, rs) : 'Not charged'], ['Eligibility', g.rules.eligibility === 'paid_up' ? 'Paid up · accepted rules' : 'Any active member']])}
          <button class="link mt12" onclick="App.go('chitRules',{id:'${p.id}'})">Read full scheme rules</button></div></div>
      </div>`;
  }
});

/* ===================== Member statement ===================== */
const ChitScreens = {
  statement(id, g, m) {
    const st = Chit.statement(g, m.id), admin = Reg.can(id, 'payments.record');
    const ar = Chit.arrears(g, m.id);
    const L = { CONTRIBUTION_DUE: ['Contribution due', 'receipt'], DIVIDEND_CREDIT: ['Dividend credit', 'coins'], CONTRIBUTION_RECEIVED: ['Payment confirmed', 'check'], REVERSAL: ['Reversal', 'undo'], WINNER_PAYOUT: ['Payout received', 'bank'], ADJUSTMENT: ['Adjustment', 'edit'], PAYMENT_PENDING: ['Payment pending', 'clock'], PAYMENT_RECORDED_PENDING_VERIFICATION: ['Cash awaiting verification', 'clock'], PAYMENT_FAILED: ['Payment failed', 'x'], PAYMENT_REVERSED: ['Payment reversed', 'undo'] };
    const settled = g.rounds.filter(r => r.status === 'SETTLED');
    return `<div class="mini-grid">
        <div class="mini"><div class="l">Outstanding</div><div class="v ${st.balP > 0 ? 'red' : 'green'}">${rs(Math.max(0, st.balP))}</div></div>
        <div class="mini"><div class="l">Paid so far</div><div class="v">${rs(st.rows.filter(e => e.type === 'CONTRIBUTION_RECEIVED').reduce((a, e) => a + e.creditP, 0))}</div></div>
        <div class="mini"><div class="l">Dividends credited</div><div class="v green">${rs(st.rows.filter(e => e.type === 'DIVIDEND_CREDIT').reduce((a, e) => a + e.creditP, 0))}</div></div>
        <div class="mini"><div class="l">Payout received</div><div class="v">${rs(st.rows.filter(e => e.type === 'WINNER_PAYOUT').reduce((a, e) => a + e.infoP, 0))}</div></div></div>
      ${ar.length ? `<button class="btn btn-primary btn-block mt12" onclick="ChitUI.paySheet('${id}','${m.id}')">${icon('wallet', 18)}${admin && m.userId !== 'me' ? 'Record payment' : 'Pay'} ${rs(ar.reduce((a, o) => a + o.balP, 0))}</button>` : ''}
      <div class="group-label">By round</div>
      <div class="group">${settled.map(r => { const o = Chit.oblig(g, m.id, r.n); return `<div class="li"><span class="rnd done">${r.n}</span><span class="li-main"><span>Net ${rs(o.netP)}</span><span class="xs muted">${rs(o.dueP)} − ${rs(o.creditP)} dividend · paid ${rs(o.paidP)}</span></span>${ChitUI.oblBadge(o)}</div>`; }).join('') || '<p class="pad sm muted">No settled rounds yet.</p>'}</div>
      <div class="group-label">Ledger entries</div>
      <div class="group">${st.rows.slice().reverse().map(e => { const [l, ic] = L[e.type] || [e.type, 'file']; const amt = e.debitP ? `<b class="red">+${rs(e.debitP)}</b>` : e.creditP ? `<b class="green">−${rs(e.creditP)}</b>` : `<span class="muted">${rs(e.infoP)}</span>`; return `<div class="txn"><span class="txn-ic ${e.debitP ? 'out' : e.creditP ? 'in' : 'pay'}">${icon(ic, 16)}</span><div class="grow"><div class="b sm">${l} · R${e.round}</div><div class="tiny muted">${fmt.dt(e.at)}${e.ref ? ' · ' + esc(e.ref) : ''}</div></div><div style="text-align:right">${amt}<div class="tiny muted">${e.balP != null && (e.debitP || e.creditP) ? 'Bal ' + rs(e.balP) : 'Not in balance'}</div></div></div>`; }).join('')}</div>
      <p class="tiny muted mt8">+ adds to what you owe, − reduces it. Pending or unverified payments and payouts are listed but do not change the balance.</p>`;
  }
};

App.reg('chitMember', {
  guard(p) {
    const d = chitGuard(p); if (d) return d;
    const g = Chit.g(p.id), m = Chit.mem(g, p.mid);
    return m && (myRole(p.id) === 'admin' || m.userId === 'me') ? '' : 'denied';
  },
  render(p) {
    const g = Chit.g(p.id), m = Chit.mem(g, p.mid), admin = myRole(p.id) === 'admin', s = svcById(p.id);
    return `${C.appbar(m.userId === 'me' ? 'My statement' : 'Member statement', { white: true, sub: esc(s.name) })}
      <div class="content px">
        <div class="card p row gap12 mt12">${C.avatar(m.name, null, 52)}<div class="grow"><div class="h3">${m.ticket} · ${m.userId === 'me' ? 'You' : esc(m.name)}</div>
          <div class="xs muted">${admin ? fmt.phone(m.phone) + ' · ' : ''}${m.invite === 'INVITED' ? 'Invitation pending' : `Accepted rules v${m.acceptedVersion} · ${fmt.date(m.acceptedAt)}`}</div>
          <div class="row gap6 mt4">${m.wins.length ? C.badge('Won round ' + m.wins.join(', '), 'teal') : C.badge('Not won yet', 'grey')}${C.badge(m.status === 'ACTIVE' ? 'Active' : m.status, m.status === 'ACTIVE' ? 'green' : 'warn')}</div></div></div>
        <div class="mt12">${ChitScreens.statement(p.id, g, m)}</div>
        ${admin && m.userId !== 'me' ? `<button class="btn btn-outline btn-block mt16" onclick="UI.toast('Statement shared with ${esc(m.name).replace(/'/g, '')} by SMS link (simulated)','ok')">${icon('share', 17)}Share statement with member</button>` : ''}
      </div>`;
  }
});

/* ===================== Rules & agreement ===================== */
App.reg('chitRules', {
  guard(p) { return svcById(p.id) ? '' : 'notFound'; },
  render(p) {
    const s = svcById(p.id), g = Chit.g(p.id), me = Chit.me(g), v = g.ruleVersions[g.ruleVersions.length - 1];
    const needs = me && me.invite === 'INVITED';
    return `${C.appbar('Rules & agreement', { white: true, sub: esc(s.name) })}
      <div class="content px">
        <div class="card p mt12"><div class="row between"><div><div class="xs muted">Published version</div><div class="h2">Rules v${v.v}</div></div>${C.badge('Locked', 'navy')}</div>
          <div class="xs muted mt4">Published ${fmt.dt(v.publishedAt)} by ${esc(actorName(v.by))}${me && me.acceptedVersion ? ` · you accepted ${fmt.date(me.acceptedAt)}` : ''}</div></div>
        <div class="group-label">Scheme rules</div><div class="card p">${ChitUI.rulesKv(g.rules)}</div>
        <div class="group-label">Payout formula</div><div class="card p"><p class="sm">Winner receives <b>monthly gross pool − winning discount</b>${g.rules.feeSource === 'separate' ? ' − company fee (itemised)' : ''}. ${g.rules.feeSource === 'discount' ? 'The company fee is taken from the discount, and the rest is split as dividends.' : 'The whole discount is split as dividends.'} Payout is not paid until it is approved and the bank confirms the transfer.</p></div>
        <div class="group-label">Payments & defaults</div><div class="card p"><p class="sm">Contribution is due ${g.rules.dueDays} days after each auction. ${g.rules.creditDividend ? 'The round\'s dividend is credited against it.' : ''} Cash counts only after the organiser records it${g.rules.cashVerify ? ' and a second check verifies it' : ''}. Digital payments count only after bank confirmation. Members with unpaid dues cannot bid.</p></div>
        <div class="group-label">Disputes & corrections</div><div class="card p"><p class="sm">Finalised results and payments are never edited. Corrections are added as reversals or adjustments with a reason, and every change is in the audit log.</p></div>
        <div class="info-card warn mt12">${icon('scale', 16)}<div>This agreement text is a prototype placeholder. The real agreement must be reviewed under the Chit Funds Act, 1982 and applicable state rules.</div></div>
        <div class="group-label">Version history</div><div class="group">${g.ruleVersions.slice().reverse().map(x => `<div class="li"><span class="li-ic">${icon('file', 17)}</span><span class="li-main"><span>v${x.v} · ${esc(x.reason)}</span><span class="xs muted">${fmt.dt(x.publishedAt)} · ${esc(actorName(x.by))}</span></span></div>`).join('')}</div>
      </div>
      ${needs ? `<div class="footer col"><p class="xs muted center">Accepting records rules v${v.v} and the time against your ticket ${me.ticket}.</p><button class="btn btn-primary btn-block" onclick="Chit.acceptRules('${p.id}');App.back()">${icon('check', 18)}I accept rules v${v.v}</button></div>` : ''}`;
  }
});

/* ===================== Calculator (simulation) ===================== */
App.reg('chitCalc', {
  render(p) {
    if (!p.r) {
      const g = p.id && Chit.g(p.id);
      p.r = g ? JSON.parse(JSON.stringify(g.rules)) : Object.assign(ChitData.defaultRules(), { name: 'Simulation' });
      p.n = 1; p.d = Math.round((p.r.minDiscountP + p.r.maxDiscountP) / 2 / p.r.incrementP) * p.r.incrementP; p.w = 'm2';
    }
    const r = p.r; r.contributionP = r.poolP / r.members;
    const mem = Array.from({ length: r.members }, (_, i) => ({ id: 'm' + (i + 1) }));
    const valid = r.poolP % r.members === 0;
    const st = valid ? ChitEngine.settle(r, p.n, p.d, p.w, mem) : null;
    // Round-by-round: discounts falling linearly from the chosen discount to the minimum.
    const sim = valid ? Array.from({ length: r.rounds }, (_, i) => {
      const d = Math.max(r.minDiscountP, Math.round((p.d - (p.d - r.minDiscountP) * i / Math.max(1, r.rounds - 1)) / r.incrementP) * r.incrementP);
      return ChitEngine.settle(r, i + 1, d, 'm' + ((i % r.members) + 1), mem);
    }) : [];
    const T = k => sim.reduce((a, x) => a + x[k], 0);
    const set = (k, v) => `CC.set('${k}',${v})`;
    window.CC = { set(k, v) { const q = App.top().params; if (k === 'pool') q.r.poolP = v; else if (k in q) q[k] = v; else q.r[k] = v; if (q.n > q.r.rounds) q.n = q.r.rounds; App.refresh(); } };
    return `${C.appbar('Scheme calculator', { white: true, sub: p.id ? esc(svcById(p.id).name) : 'Try different amounts and rules' })}
      <div class="content px">
        <div class="status-banner blue mt12"><div class="sb-ic">${icon('calc', 20)}</div><div class="grow"><h3>Simulation only</h3><p>Nothing here creates ledger entries, payments or results${p.id ? ', and it never changes the published rules' : ''}.</p></div></div>
        <div class="card p mt12">
          <div class="label">Monthly gross pool</div>
          <div class="chips wrap mb8">${[100000, 200000, 300000].map(x => `<button class="chip ${r.poolP === RP(x) ? 'on' : ''}" onclick="${set('pool', RP(x))}">₹${x / 100000} lakh</button>`).join('')}</div>
          <div class="prefix-input mb12"><span>₹</span><input inputmode="numeric" value="${r.poolP / 100}" onchange="CC.set('pool',paise(this.value))"></div>
          <div class="row gap12"><div class="grow"><div class="label">Members</div><div class="stepper"><button onclick="${set('members', Math.max(2, r.members - 1))}">−</button><span>${r.members}</span><button onclick="${set('members', r.members + 1)}">+</button></div></div>
            <div class="grow"><div class="label">Rounds</div><div class="stepper"><button onclick="${set('rounds', Math.max(2, r.rounds - 1))}">−</button><span>${r.rounds}</span><button onclick="${set('rounds', r.rounds + 1)}">+</button></div></div></div>
          ${valid ? '' : `<div class="field-err mt8">${icon('alert', 13)}${rs(r.poolP)} ÷ ${r.members} is not a whole amount. Change the pool or members.</div>`}
          <div class="label mt12">Fee</div>
          <div class="row gap8"><select class="select" onchange="CC.set('feeBasis',this.value)">${Object.entries(ChitEngine.FEE_BASIS).map(([k, l]) => `<option value="${k}" ${r.feeBasis === k ? 'selected' : ''}>${k === 'pool_pct' ? '% of pool' : k === 'discount_pct' ? '% of discount' : l}</option>`).join('')}</select>
            ${r.feeBasis === 'none' ? '' : r.feeBasis === 'fixed' ? `<div class="prefix-input" style="width:130px"><span>₹</span><input value="${r.feeFixedP / 100}" onchange="CC.set('feeFixedP',paise(this.value))"></div>` : `<div class="prefix-input" style="width:100px"><input value="${r.feeBps / 100}" onchange="CC.set('feeBps',Math.round(parseFloat(this.value||0)*100))"><span>%</span></div>`}</div>
          <div class="row gap8 mt8 calc-sel"><select class="select" onchange="CC.set('feeTiming',this.value)">${Object.entries(ChitEngine.FEE_TIMING).filter(([k]) => k !== 'selected').map(([k, l]) => `<option value="${k}" ${r.feeTiming === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
            <select class="select" onchange="CC.set('feeSource',this.value)"><option value="discount" ${r.feeSource === 'discount' ? 'selected' : ''}>From discount</option><option value="separate" ${r.feeSource === 'separate' ? 'selected' : ''}>Separate</option></select></div>
          <div class="label mt12">Dividend to</div>
          ${C.seg('cc-div', [['all', 'All members'], ['non_winners', 'Non-winners']], r.dividendTo, "CC.set('dividendTo',")}
        </div>
        ${valid ? `<div class="card p mt12">
          <div class="row between"><div class="label" style="margin:0">Round</div><div class="stepper"><button onclick="${set('n', Math.max(1, p.n - 1))}">−</button><span>${p.n}</span><button onclick="${set('n', Math.min(r.rounds, p.n + 1))}">+</button></div></div>
          <div class="row between mt12"><span class="label" style="margin:0">Winning discount</span><b>${rs(p.d)}</b></div>
          <input type="range" class="range" min="${r.minDiscountP / 100}" max="${r.maxDiscountP / 100}" step="${r.incrementP / 100}" value="${p.d / 100}" oninput="App.top().params.d=this.value*100;App.refresh()">
          <div class="row between tiny muted"><span>Min ${rs(r.minDiscountP)}</span><span>Max ${rs(r.maxDiscountP)}</span></div>
          <div class="mt12">${ChitUI.settlement(r, st, { sim: true })}</div></div>
        ${C.sec('Round-by-round', '<span class="sample-tag">Estimate</span>')}
        <p class="xs muted mb8">Assumes the discount falls evenly from ${rs(p.d)} to the minimum by the last round.</p>
        <div class="card sim-table"><table><thead><tr><th>R</th><th>Discount</th><th>Payout</th><th>Fee</th><th>Div/member</th></tr></thead>
          <tbody>${sim.map(x => `<tr class="${x.round === p.n ? 'on' : ''}"><td>${x.round}</td><td>${rs(x.discountP)}</td><td>${rs(x.payoutNetP)}</td><td>${rs(x.feeP)}</td><td>${rs(x.perMemberP)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td>Σ</td><td>${rs(T('discountP'))}</td><td>${rs(T('payoutNetP'))}</td><td>${rs(T('feeP'))}</td><td>${rs(T('perMemberP'))}</td></tr></tfoot></table></div>
        <button class="btn btn-outline btn-block mt12" onclick="CCopy()">${icon('copy', 17)}Copy calculation</button>` : ''}
      </div>`;
  }
});
function CCopy() {
  const p = App.top().params, r = p.r, mem = Array.from({ length: r.members }, (_, i) => ({ id: 'm' + (i + 1) }));
  const st = ChitEngine.settle(r, p.n, p.d, p.w, mem);
  const txt = `Chit simulation (not a final settlement)\nPool ${rs(st.poolP)} · ${r.members} members · round ${p.n}\nWinning discount ${rs(st.discountP)}\nWinner payout ${rs(st.payoutNetP)}\nCompany fee ${rs(st.feeP)} (${ChitEngine.feeLabel(r, rs)})\nDividend pool ${rs(st.dividendPoolP)} → ${rs(st.perMemberP)} × ${st.recipients}\nNet contribution ${rs(st.netContributionP)}`;
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt);
  UI.toast('Calculation copied', 'ok');
}

/* ===================== Reports ===================== */
App.reg('chitReports', {
  guard(p) { const d = chitGuard(p); return d || (Reg.can(p.id, 'reports') ? '' : 'denied'); },
  render(p) {
    const g = Chit.g(p.id), x = Chit.stats(g);
    const rows = g.rounds.filter(r => r.status === 'SETTLED').map(r => {
      const os = Chit.active(g).map(m => Chit.oblig(g, m.id, r.n));
      return { r, exp: os.reduce((a, o) => a + o.netP, 0), got: os.reduce((a, o) => a + o.paidP, 0), ok: r.result.st.checks.every(c => c.ok) };
    });
    return `${C.appbar('Reports', { white: true, sub: esc(svcById(p.id).name) })}
      <div class="content px">
        <div class="mini-grid mt12">
          <div class="mini"><div class="l">Expected (net of dividends)</div><div class="v">${rs(x.expectedP)}</div></div>
          <div class="mini"><div class="l">Collected</div><div class="v green">${rs(x.collectedP)}</div></div>
          <div class="mini"><div class="l">Outstanding</div><div class="v red">${rs(x.outstandingP)}</div></div>
          <div class="mini"><div class="l">Cash to verify</div><div class="v">${x.toVerify.length}</div></div>
          <div class="mini"><div class="l">Company fees</div><div class="v">${rs(x.feesP)}</div></div>
          <div class="mini"><div class="l">Paid to winners</div><div class="v">${rs(x.paidOutP)}</div></div></div>
        ${C.sec('Collections by round', '')}
        <div class="card sim-table"><table><thead><tr><th>R</th><th>Expected</th><th>Collected</th><th>Due</th><th>Check</th></tr></thead>
          <tbody>${rows.map(o => `<tr><td>${o.r.n}</td><td>${rs(o.exp)}</td><td>${rs(o.got)}</td><td class="${o.exp - o.got ? 'red' : ''}">${rs(o.exp - o.got)}</td><td>${o.ok ? '<span class="green">✓</span>' : '<span class="red">✗</span>'}</td></tr>`).join('')}</tbody></table></div>
        <p class="xs muted mt8">"Check" confirms each settlement reconciles in paise: pool = payout + fee + dividends.</p>
        ${C.sec('Cash vs digital')}
        <div class="card p">${(() => { const c = g.payments.filter(q => q.status === 'CONFIRMED'); const cash = c.filter(q => q.method === 'Cash').reduce((a, q) => a + q.amountP, 0), dig = c.filter(q => q.method !== 'Cash').reduce((a, q) => a + q.amountP, 0); return `${C.rows([['Cash (verified)', rs(cash)], ['UPI / bank (bank-confirmed)', rs(dig)]], ['Total confirmed', rs(cash + dig)])}<div class="split-bar mt8"><i style="width:${cash / Math.max(1, cash + dig) * 100}%"></i></div>`; })()}</div>
        <button class="btn btn-outline btn-block mt16" onclick="ChitUI.exportCsv('${p.id}')">${icon('download', 17)}Export round history (CSV)</button>
      </div>`;
  }
});

App.reg('chitDisputes', {
  guard: chitGuard,
  render(p) {
    const g = Chit.g(p.id), admin = myRole(p.id) === 'admin';
    return `${C.appbar('Disputes', { white: true, sub: esc(svcById(p.id).name) })}
      <div class="content px">${g.disputes.length ? `<div class="mt12">${g.disputes.map(d => `<div class="card p mb8"><div class="row between"><b>Round ${d.n}</b>${C.badge(d.status, d.status === 'Open' ? 'warn' : 'green')}</div><p class="sm mt4">${esc(d.text)}</p><div class="xs muted mt4">${esc(actorName(d.by))} · ${fmt.rel(d.at)}</div>
        ${admin && d.status === 'Open' ? `<button class="btn btn-outline btn-sm mt8" onclick="UI.reason({title:'Respond and resolve',confirm:'Send response',placeholder:'Response to the member (saved in the audit log)',onConfirm:t=>{const x=Chit.g('${p.id}').disputes.find(y=>y.id==='${d.id}');x.status='Resolved';x.reply=t;Act.audit('${p.id}','Dispute resolved','disputes',{reason:t});Act.commit();}})">Respond</button>` : d.reply ? `<div class="info-card teal mt8">${icon('chat', 16)}<div>${esc(d.reply)}</div></div>` : ''}</div>`).join('')}</div>`
        : C.empty({ ic: 'flag', title: 'No disputes', text: 'Members can raise a dispute from any completed round.' })}</div>`;
  }
});
