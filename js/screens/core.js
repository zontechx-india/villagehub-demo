/* Shared core screens: Home, My Services, Create New, Join, Activity, Profile, Audit, Settings, Help.
 * These screens know nothing about chits or temples: they read every module through the registry
 * (Reg.get(type).summary / stats / events / pending / open / setup). */

const Core = {
  open(id) {
    const s = svcById(id), m = Reg.get(s.type);
    if (s.status === 'draft' && m.setup) return m.setup(id);
    m.open(id);
  },
  go(l) { App.go(l.s, Object.assign({}, l.p)); },
  logout() {
    UI.confirm({ title: 'Log out of VillageHub?', message: 'Your services, roles and history stay saved to your account.', confirm: 'Log out', danger: true, icon: 'logout',
      onConfirm: () => { S().ob.authed = false; Store.save(); App.session = {}; App.reset('login', { phone: S().user.phone }); UI.toast('Logged out'); } });
  },
  greeting() { const h = +new Date().toLocaleTimeString('en-GB', { hour: '2-digit', hour12: false, timeZone: TZ }); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; },

  // Service card used on Home (wide=false, horizontal scroller) and My Services (wide=true).
  card(s, wide) {
    const m = Reg.get(s.type), role = myRole(s.id), pend = membershipPending(s.id);
    const stats = !pend && m.stats ? m.stats(s, role) : [];
    const acts = !pend && s.status !== 'draft' && m.pending ? m.pending(s, role).length : 0;
    return `<button class="svc-card ${wide ? 'wide' : ''}" onclick="${pend ? `UI.toast('Waiting for the organiser to approve your request')` : `Core.open('${s.id}')`}">
      <div class="row gap12">${C.modIc(s.type, 42)}<div class="grow" style="min-width:0"><div class="b ellipsis">${esc(s.name)}</div><div class="xs muted ellipsis">${esc(m.summary(s, role))}</div></div>${acts ? `<span class="act-dot">${acts}</span>` : ''}</div>
      <div class="row gap6 mt8 wrap">${pend ? C.badge('Request pending', 'warn') : C.roleBadge(role, s.type)}${s.status !== 'active' ? C.statusBadge(s.status) : ''}<span class="tiny muted">${m.short}</span></div>
      ${stats.length ? `<div class="sc-stats">${stats.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>` : ''}
    </button>`;
  },
  actRow(a) {
    return `<button class="status-banner ${a.tone} act-row" onclick='Core.go(${JSON.stringify(a.go)})'><div class="sb-ic">${icon(a.ic, 18)}</div><div class="grow"><h3>${a.title}</h3><p>${esc(a.sub)}</p></div>${icon('chevron', 16)}</button>`;
  },
  eventRow(e) {
    const live = e.live, soon = toDate(e.at).getTime() - Date.now() < 86400000;
    return `<button class="ev" onclick='Core.go(${JSON.stringify(e.go)})'>
      <span class="ev-date ${live ? 'live' : ''}"><b>${live ? 'LIVE' : fmt.dm(e.at).split(' ')[0]}</b><span>${live ? 'now' : fmt.dm(e.at).split(' ')[1] || ''}</span></span>
      <span class="grow" style="min-width:0"><span class="b ellipsis" style="display:block">${esc(e.title)}</span><span class="xs muted ellipsis" style="display:block">${esc(e.sub)}</span></span>
      <span class="xs ${live ? 'red b' : soon ? 'b' : 'muted'}" style="white-space:nowrap">${live ? 'Join →' : soon ? fmt.time(e.at) : fmt.until(e.at).replace('in ', '')}</span></button>`;
  },
  notifIc(n) { const s = svcById(n.svcId); return s ? C.modIc(s.type, 34, 17) : `<span class="li-ic">${icon('bell', 17)}</span>`; },
  openNotif(id) {
    const n = S().notifications.find(x => x.id === id);
    n.read = true; Store.save();
    if (n.link) App.go(n.link.s, Object.assign({}, n.link.p)); else App.refresh();
  }
};
const membershipPending = id => S().memberships.some(m => m.svcId === id && m.status === 'pending');

/* ===================== Home ===================== */
App.reg('home', {
  tab: true, net: true, ptr: true,
  render() {
    const st = S(), u = st.user, mine = mySvcs();
    const pendingSvcs = st.services.filter(s => membershipPending(s.id));
    const acts = Dash.pending(), evs = Dash.events().slice(0, 4);
    const head = `<header class="home-head">
      <div class="row between"><button class="iconbtn" onclick="UI.drawer()" aria-label="Menu">${icon('menu', 22)}</button>${C.wordmark()}${C.bell()}</div>
      <div class="hello"><span>${Core.greeting()},</span> <b>${esc(u.name.split(' ')[0])}</b></div></header>`;

    if (!mine.length && !pendingSvcs.length) return `${head}<div class="content">
      ${C.empty({ ic: 'layers', title: 'No services yet', text: 'Start a chit group or a temple collection for your village, or join one with an invite code from the organiser.', cta: `<button class="btn btn-primary btn-md" onclick="App.go('create')">${icon('plus', 18)}Create new</button><button class="btn btn-ghost btn-md" onclick="App.go('join')">${icon('link', 18)}Join with a code</button>` })}
      ${C.sec('What you can run')}<div class="px">${Reg.list().filter(m => m.status === 'available').map(m => `<button class="card p row gap12 mb8" style="text-align:left" onclick="Reg.get('${m.key}').setup()">${C.modIc(m.key, 44)}<div class="grow"><div class="b">${m.name}</div><div class="xs muted">${m.desc}</div></div>${icon('chevron', 16, 'li-chev')}</button>`).join('')}</div>
    </div>`;

    const created = mine.filter(s => myRole(s.id) === 'admin').length;
    return `${head}<div class="content">
      ${acts.length ? `${C.sec(`Needs your attention <span class="cnt">${acts.length}</span>`, acts.length > 3 ? `<button class="link" onclick="App.go('pending')">See all</button>` : '')}<div class="px">${acts.slice(0, 3).map(Core.actRow).join('')}</div>` : `<div class="px mt12">${C.banner('green', 'check', "You're all caught up", 'No payments, approvals or collections need you right now.')}</div>`}

      <div class="px mt16"><div class="banner cust"><div><div class="banner-k">Your community</div><h3>${created} service${created === 1 ? '' : 's'} you run · ${mine.length - created} you're part of</h3>
        <button class="btn btn-white btn-sm" onclick="App.go('create')">${icon('plus', 15)}Create new</button></div><div class="banner-art">${icon('home', 34)}</div></div></div>

      ${evs.length ? `${C.sec('Upcoming')}<div class="px"><div class="group">${evs.map(Core.eventRow).join('')}</div></div>` : ''}

      ${C.sec('My services', `<button class="link" onclick="App.tab('services')">View all</button>`)}
      <div class="hscroll">${mine.filter(s => s.status !== 'draft').map(s => Core.card(s)).join('')}${pendingSvcs.map(s => Core.card(s)).join('')}
        <button class="svc-card add" onclick="App.go('create')">${icon('plusCircle', 30)}<span class="b">Create or join</span></button></div>

      <div class="cta-prov">
        <div class="cta-prov-top"><span class="cta-prov-ic">${icon('sparkles', 22)}</span><div><span class="cta-prov-k">Modular</span><h3>Start something for your village</h3></div></div>
        <p>Chit groups and temple collections today. Savings groups, utility dues and event funds are coming.</p>
        <button class="cta-btn" onclick="App.go('create')">Browse services ${icon('back', 16)}</button></div>

      ${C.sec('Recent activity', `<button class="link" onclick="App.tab('activity')">All</button>`)}
      <div class="px"><div class="group">${st.notifications.slice(0, 4).map(n => `<button class="li ${n.read ? '' : 'unread'}" onclick="Core.openNotif('${n.id}')">${Core.notifIc(n)}<span class="li-main"><span class="${n.read ? '' : 'b'} ellipsis">${esc(n.title)}</span><span class="xs muted ellipsis">${esc(n.text)}</span></span><span class="tiny muted" style="white-space:nowrap">${fmt.rel(n.at)}</span></button>`).join('') || '<p class="pad sm muted">Nothing yet.</p>'}</div></div>
    </div>`;
  }
});

App.reg('pending', {
  render() {
    const acts = Dash.pending();
    return `${C.appbar('Needs your attention', { white: true, sub: `${acts.length} item${acts.length === 1 ? '' : 's'} across your services` })}
      <div class="content px"><div class="mt12">${acts.map(Core.actRow).join('') || C.empty({ ic: 'check', title: "You're all caught up", text: 'Nothing needs you right now.' })}</div></div>`;
  }
});

/* ===================== My Services ===================== */
App.reg('services', {
  tab: true, ptr: true,
  render(p) {
    const st = S(), seg = p.seg || 'all', type = p.type || '', status = p.status || '';
    const all = st.services.filter(s => membership(s.id) || membershipPending(s.id));
    const isMine = s => myRole(s.id) === 'admin';
    let list = all.filter(s => seg === 'all' || (seg === 'created' ? isMine(s) : !isMine(s)));
    if (type) list = list.filter(s => s.type === type);
    if (status) list = list.filter(s => s.status === status);
    const types = [...new Set(all.map(s => s.type))];
    return `${C.ltHeader('My Services', `<button class="appbar-act" onclick="App.go('join')">Join</button>`)}
      <div class="content px">${C.ltBig('My Services')}
        ${C.seg('svc-seg', [['all', 'All', all.length], ['created', 'Created', all.filter(isMine).length], ['joined', 'Joined', all.filter(s => !isMine(s)).length]], seg, "App.set('seg',")}
        <div class="chips wrap mt12">${[['', 'All types']].concat(types.map(t => [t, Reg.get(t).short])).map(([k, l]) => `<button class="chip ${type === k ? 'on' : ''}" onclick="App.set('type','${k}')">${k ? icon(Reg.get(k).icon, 15) : ''}${l}</button>`).join('')}
          <select class="chip" style="padding-right:10px" onchange="App.set('status',this.value)"><option value="">Any status</option>${['active', 'draft', 'paused', 'completed', 'cancelled'].map(s => `<option value="${s}" ${status === s ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select></div>
        <div class="mt12">${list.map(s => Core.card(s, true)).join('') || C.empty({ ic: 'layers', title: 'Nothing here', text: seg === 'created' ? 'Services you create appear here.' : 'Services you join appear here.', cta: `<button class="btn btn-primary btn-md" onclick="App.go('create')">${icon('plus', 18)}Create new</button>` })}</div>
      </div>`;
  }
});

/* ===================== Create New (catalogue from the registry) ===================== */
App.reg('create', {
  render() {
    const mods = Reg.list(), drafts = mySvcs().filter(s => s.status === 'draft');
    return `${C.appbar('Create new', { white: true, sub: 'Choose what you want to run' })}
      <div class="content px">
        <div class="group-label">Available</div>
        ${mods.filter(m => m.status === 'available').map(m => `<button class="mod-card" onclick="Reg.get('${m.key}').setup()">${C.modIc(m.key, 52)}<div class="grow"><div class="h3">${m.name}</div><p class="xs muted mt4">${m.desc}</p>
          <div class="row gap6 mt8 wrap">${Object.values(m.roles).map(r => C.badge(r.label, 'grey')).join('')}</div></div>${icon('chevron', 18, 'li-chev')}</button>`).join('')}
        ${drafts.length ? `<div class="group-label">Continue a draft</div><div class="group">${drafts.map(s => `<button class="li" onclick="Core.open('${s.id}')">${C.modIc(s.type, 34, 17)}<span class="li-main"><span>${esc(s.name)}</span><span class="xs muted">Saved ${fmt.rel(s.createdAt)}</span></span>${C.badge('Draft', 'grey')}</button>`).join('')}</div>` : ''}
        <div class="group-label">Coming soon</div>
        ${mods.filter(m => m.status === 'soon').map(m => `<div class="mod-card soon">${C.modIc(m.key, 44)}<div class="grow"><div class="b">${m.name}</div><p class="xs muted">${m.desc}</p></div>${C.badge('Soon', 'grey')}</div>`).join('')}
        <p class="xs muted mt8">New service types are added as modules, without changing login, the dashboard or navigation.</p>
        <button class="card p row gap12 mt16" style="text-align:left" onclick="App.go('join')"><span class="li-ic">${icon('link', 18)}</span><div class="grow"><div class="b">Have an invite code?</div><div class="xs muted">Join a chit group or temple collection</div></div>${icon('chevron', 16, 'li-chev')}</button>
      </div>`;
  }
});

App.reg('join', {
  render(p) {
    if (p.sent) {
      const s = svcById(p.sent), m = membership(p.sent);
      return `${C.appbar('Join a service', { white: true })}<div class="content pad"><div class="success-hero"><div class="success-ic ${m ? '' : 'warn'}">${icon(m ? 'check' : 'clock', 36)}</div>
        <div class="h2">${m ? 'You are in!' : 'Request sent'}</div><p class="muted">${m ? `The organiser approved your request for <b>${esc(s.name)}</b>.` : `<b>${esc(s.name)}</b> · the organiser will review your request. You'll be notified.`}</p></div>
        ${m ? `<button class="btn btn-primary btn-block" onclick="App.reset('home');Core.open('${s.id}')">Open ${Reg.get(s.type).short}</button>` : `<button class="btn btn-outline btn-block" onclick="App.reset('home')">Back to Home</button>`}</div>`;
    }
    return `${C.appbar('Join a service', { white: true })}
      <div class="content pad">
        <div class="perm-art" style="margin-top:12px">${icon('link', 48)}</div>
        <p class="muted center mb16">Enter the invite code shared by the organiser. They approve every request.</p>
        ${C.field('Invite code', `<input id="jc" class="input ${p.err ? 'err' : ''}" style="text-transform:uppercase;letter-spacing:.08em;font-weight:700;text-align:center;font-size:18px" placeholder="ABC-1234" value="${esc(p.code || '')}" onkeydown="if(event.key==='Enter')JoinUI.go()">`, { err: p.err })}
        <div class="info-card mt8">${icon('info', 16)}<div>Prototype: try <button class="link" onclick="document.getElementById('jc').value='KWC-2026'">KWC-2026</button> (Kalaimagal Women's Chit). The organiser approves about 5 seconds later, then you accept its rules.</div></div>
      </div>
      <div class="footer"><button class="btn btn-primary btn-block" onclick="JoinUI.go()">Send join request</button></div>`;
  }
});
const JoinUI = {
  go() {
    const p = App.top().params, v = document.getElementById('jc').value.trim();
    p.code = v;
    p.err = !v ? 'Enter the invite code' : Act.join(v);
    if (p.err) return App.refresh();
    p.sent = S().services.find(s => s.code.toUpperCase() === v.toUpperCase()).id;
    App.refresh();
    const t = setInterval(() => { if (App.top().name !== 'join') return clearInterval(t); if (membership(p.sent)) { clearInterval(t); App.refresh(); } }, 800);
  }
};

/* ===================== Activity ===================== */
App.reg('activity', {
  tab: true, ptr: true,
  render(p) {
    const st = S(), f = p.f || '';
    const list = st.notifications.filter(n => !f || n.svcId === f);
    const svcs = [...new Set(st.notifications.map(n => n.svcId))].map(svcById).filter(Boolean);
    const unread = st.notifications.filter(n => !n.read).length;
    return `${C.ltHeader('Activity', unread ? `<button class="appbar-act" onclick="S().notifications.forEach(n=>n.read=true);Act.commit()">Mark all read</button>` : '')}
      <div class="content">${C.ltBig('Activity')}
        <div class="chips mb12">${[['', 'All']].concat(svcs.map(s => [s.id, s.name])).map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" onclick="App.set('f','${k}')">${esc(l.length > 22 ? l.slice(0, 20) + '…' : l)}</button>`).join('')}</div>
        ${list.length ? `<div class="group" style="border-radius:0;border-left:0;border-right:0">${list.map(n => { const s = svcById(n.svcId); return `<button class="li ${n.read ? '' : 'unread'}" style="align-items:flex-start" onclick="Core.openNotif('${n.id}')">${Core.notifIc(n)}<span class="li-main"><span class="row between gap8"><span class="${n.read ? '' : 'b'}">${esc(n.title)}</span><span class="tiny muted" style="white-space:nowrap">${fmt.rel(n.at)}</span></span><span class="xs muted">${esc(n.text)}</span>${s ? `<span class="tiny muted mt4">${esc(s.name)}</span>` : ''}</span>${n.read ? '' : '<span class="unread-dot"></span>'}</button>`; }).join('')}</div>`
          : C.empty({ ic: 'bell', title: "You're all caught up", text: 'Auction updates, payments, receipts and requests appear here.' })}
        <div class="px mt16"><button class="btn btn-outline btn-block" onclick="App.go('audit')">${icon('history', 17)}Open audit history</button></div>
      </div>`;
  }
});

/* ===================== Profile ===================== */
App.reg('profile', {
  tab: true,
  render() {
    const st = S(), u = st.user, s = st.settings;
    const roles = {};
    mySvcs().forEach(x => { const r = Reg.role(x.type, myRole(x.id)); if (r) roles[r.label] = (roles[r.label] || 0) + 1; });
    return `${C.ltHeader('Profile', C.bell())}
      <div class="content px">${C.ltBig('Profile')}
        <div class="card p row gap12">${C.userAvatar(60)}<div class="grow"><div class="h3">${esc(u.name)}</div><div class="sm muted">${fmt.phone(u.phone)}</div>
          <div class="row gap6 mt4 wrap">${Object.entries(roles).map(([l, n]) => C.badge(`${l} · ${n}`, 'grey')).join('')}</div></div>
          <button class="btn btn-outline btn-sm" onclick="App.go('editProfile')">${icon('edit', 15)}Edit</button></div>
        <p class="xs muted mt8 px">Roles are per service: you can organise one chit and be a member of another.</p>
        <div class="group-label">My services</div>
        <div class="group">
          ${C.item('layers', 'My services', "App.tab('services')", { right: mySvcs().length })}
          ${C.item('plus', 'Create new', "App.go('create')")}
          ${C.item('link', 'Join with invite code', "App.go('join')")}
          ${C.item('history', 'Audit history', "App.go('audit')", { sub: 'Changes made by you and others in your services' })}
        </div>
        <div class="group-label">Preferences</div>
        <div class="group">
          ${C.item('bell', 'Notifications', "App.go('settings')", { sub: st.ob.notifGranted ? 'On' : 'Off on this phone' })}
          <div class="li"><span class="li-ic">${icon('lock', 18)}</span><span class="li-main"><span>Hide amounts on lock screen</span><span class="xs muted">Notifications show "Open VillageHub to view"</span></span>${C.toggle(s.lockPrivacy, 'S().settings.lockPrivacy=!S().settings.lockPrivacy;Act.commit()')}</div>
          ${C.item('globe', 'Language', 'I18n.sheet()', { right: `<span data-raw>${I18n.label()}</span>` })}
        </div>
        <div class="group-label">Support</div>
        <div class="group">
          ${C.item('help', 'Help & Support', "App.go('help')")}
          ${C.item('file', 'Terms & Privacy', "App.go('terms')")}
          ${C.item('logout', 'Logout', 'Core.logout()', { danger: true, noChev: true })}
        </div>
        <p class="tiny muted center mt16">VillageHub v0.1 · Prototype</p>
      </div>`;
  }
});

App.reg('editProfile', {
  render(p) {
    const u = S().user;
    if (p.name == null) { p.name = u.name; p.color = u.color; }
    return `${C.appbar('Edit profile', { white: true })}
      <div class="content pad">
        <div class="center" style="display:flex;justify-content:center">${C.avatar(p.name, p.color, 84)}</div>
        <div class="label mt16">Avatar colour</div>
        <div class="row gap8 mb16">${AVATAR_COLORS.slice(0, 6).map(c => `<button onclick="App.set('color','${c}')" style="width:36px;height:36px;border-radius:50%;background:${c};box-shadow:${p.color === c ? '0 0 0 3px var(--card),0 0 0 5px ' + c : 'none'}" aria-label="Colour"></button>`).join('')}</div>
        ${C.field('Display name', `<input class="input ${p.err ? 'err' : ''}" maxlength="40" value="${esc(p.name)}" oninput="App.top().params.name=this.value">`, { req: true, err: p.err })}
        ${C.field('Mobile number', `<input class="input" value="${fmt.phone(u.phone)}" disabled style="background:var(--line);color:var(--muted)">`, { hint: 'Your mobile number is your login.' })}
      </div>
      <div class="footer"><button class="btn btn-primary btn-block" onclick="var p=App.top().params,v=(p.name||'').trim();if(v.length<2)return App.set('err','Name must have at least 2 characters');S().user.name=v;S().user.color=p.color;Store.save();App.back();UI.toast('Profile updated','ok')">Save changes</button></div>`;
  }
});

App.reg('settings', {
  render() {
    const st = S(), s = st.settings;
    const T = (k, label, sub) => `<div class="li"><span class="li-main"><span>${label}</span><span class="xs muted">${sub}</span></span>${C.toggle(s[k], `S().settings.${k}=!S().settings.${k};Act.commit()`)}</div>`;
    return `${C.appbar('Settings', { white: true })}
      <div class="content px">
        <div class="group-label">Notifications</div>
        ${st.ob.notifGranted ? '' : `<div class="info-card warn mb8">${icon('bell', 16)}<div>Notifications are off for VillageHub on this phone. <button class="link" onclick="S().ob.notifGranted=true;Act.commit();UI.toast('Phone settings opened · notifications on (simulated)','ok')">Open phone settings</button></div></div>`}
        <div class="group">
          ${T('nAuction', 'Auctions', 'Schedule changes, auction live, results')}
          ${T('nPayment', 'Payments & payouts', 'Dues, confirmations, receipts')}
          ${T('nCollection', 'Temple collections', 'Collections recorded, bank confirmations')}
          ${T('nSms', 'SMS for important updates', 'OTP and payment confirmations')}
          ${T('lockPrivacy', 'Hide amounts on lock screen', 'Recommended')}
        </div>
        <div class="group-label">Display</div>
        <div class="group"><div class="li"><span class="li-ic">${icon('eye', 18)}</span><span class="li-main"><span>Large text</span><span class="xs muted">Bigger letters and buttons, easier to read</span></span>${C.toggle(s.bigText !== false, 'BigText.set(!(S().settings.bigText !== false))')}</div></div>
        <div class="group-label">General</div>
        <div class="group">
          <div class="li"><span class="li-ic">${icon('globe', 18)}</span><span class="li-main"><span>Language</span></span><select class="select" style="width:140px;height:40px;font-size:13px" onchange="I18n.set(this.value)"><option value="en" ${I18n.ta ? '' : 'selected'} data-raw>English</option><option value="ta" ${I18n.ta ? 'selected' : ''}>தமிழ்</option></select></div>
          ${C.item('lock', 'Privacy & data', "App.go('terms')")}
          ${C.item('trash', 'Delete account', "UI.confirm({title:'Delete your account?',message:'Services you organise must be handed over or closed first. Financial records are retained as required by law.',confirm:'Delete account',danger:true,onConfirm:()=>{localStorage.removeItem(STORE_KEY);Store.load();App.session={};App.reset('splash')}})", { danger: true })}
        </div>
      </div>`;
  }
});

/* ===================== Audit history (shared, append-only) ===================== */
App.reg('audit', {
  render(p) {
    const st = S(), svc = p.svc || '';
    const visible = st.audit.filter(a => membership(a.svcId) && (!svc || a.svcId === svc));
    const svcs = [...new Set(st.audit.filter(a => membership(a.svcId)).map(a => a.svcId))].map(svcById).filter(Boolean);
    const kv = o => o ? Object.entries(o).map(([k, v]) => `${esc(k)}: <b>${esc(v)}</b>`).join(' · ') : '';
    return `${C.appbar('Audit history', { white: true, sub: svc ? esc(svcById(svc).name) : 'All your services' })}
      <div class="content">
        <div class="px mt12"><div class="info-card">${icon('shield', 16)}<div>Append-only. Entries are never edited or deleted; corrections appear as new entries with a reason.</div></div></div>
        ${!p.svc ? `<div class="chips mt12">${[['', 'All']].concat(svcs.map(s => [s.id, s.name])).map(([k, l]) => `<button class="chip ${p.f === k || (!p.f && !k) ? 'on' : ''}" onclick="App.set('f','${k}')">${esc(l.length > 22 ? l.slice(0, 20) + '…' : l)}</button>`).join('')}</div>` : ''}
        <div class="px mt12">${visible.filter(a => !p.f || a.svcId === p.f).slice(0, 80).map(a => `<div class="audit">
          <div class="row between"><b class="sm">${esc(a.action)}</b><span class="tiny muted">${fmt.rel(a.at)}</span></div>
          <div class="xs muted">${esc(actorName(a.actor))} · ${esc(a.entity)}${svc ? '' : ' · ' + esc((svcById(a.svcId) || {}).name || '')}</div>
          ${a.before ? `<div class="xs mt4"><span class="muted">Before</span> ${kv(a.before)}</div>` : ''}${a.after ? `<div class="xs mt4"><span class="muted">After</span> ${kv(a.after)}</div>` : ''}
          ${a.reason ? `<div class="xs mt4"><span class="muted">Reason</span> ${esc(a.reason)}</div>` : ''}</div>`).join('') || C.empty({ ic: 'history', title: 'No entries yet', text: 'Important actions in your services are recorded here.' })}</div>
      </div>`;
  }
});

/* ===================== Access states ===================== */
App.reg('denied', {
  render(p) {
    const s = svcById(p.id);
    return `${C.appbar('', { white: true })}<div class="content">${C.empty({ ic: 'lock', tone: 'red', title: "You don't have access", text: s ? `You are not a member of <b>${esc(s.name)}</b>, or your role does not include this page. Ask the organiser for an invitation.` : 'This page is limited to authorised members.', cta: `<button class="btn btn-primary btn-md" onclick="App.replace('join')">${icon('link', 18)}Join with a code</button>` })}</div>`;
  }
});
App.reg('notFound', {
  render() { return `${C.appbar('', { white: true })}<div class="content">${C.empty({ ic: 'alert', tone: 'red', title: 'Service not found', text: 'It may have been removed, or the link is wrong.' })}</div>`; }
});

App.reg('help', {
  render() {
    const faq = [['How do roles work?', 'Roles belong to each service. You can organise one chit, be a member of another and collect for a temple, all with one login.'], ['When does my payment count?', 'Cash counts when the organiser records it (and verifies it, if the scheme needs a second check). UPI and bank payments count only after the bank confirms them.'], ['Can an organiser change a finished auction?', 'No. Finalised results and payments are never edited. Corrections are added as reversals or adjustments with a reason, and they appear in the audit history.'], ['Who sees my phone number?', 'Organisers and your assigned collector. Other members see your display name or ticket number only.']];
    return `${C.appbar('Help & Support', { white: true })}<div class="content px">
      <div class="group-label">Common questions</div>
      ${faq.map(([q, a]) => `<details class="card p mb8"><summary class="b">${q}</summary><p class="sm muted mt8">${a}</p></details>`).join('')}
      <button class="btn btn-primary btn-block mt16" onclick="UI.toast('Support request sent (simulated)','ok')">${icon('chat', 18)}Contact support</button></div>`;
  }
});
App.reg('terms', {
  render() {
    return `${C.appbar('Terms & Privacy', { white: true })}<div class="content pad"><div class="sample-tag mb12">Placeholder text</div>
      <p class="sm mb12">VillageHub stores only the personal information needed to run each service: name, mobile number, and for temple collections the household details the temple requires.</p>
      <p class="sm mb12">Financial records (payments, receipts, results, payouts) are kept for the period required by law and the service's own rules. They are never silently changed.</p>
      <p class="sm mb12">Chit funds are regulated in India (Chit Funds Act, 1982 and state rules). Organisers are responsible for registration and compliance. Using this app does not make a scheme compliant.</p>
      <p class="sm">The final terms will be drafted and reviewed by a qualified legal professional before launch.</p></div>`;
  }
});
