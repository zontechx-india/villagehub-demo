/* Splash, mobile OTP login, notification permission and profile name (ServiDEX-V2 auth flow). */

const TEST_OTP = '123456';

const Auth = {
  route() {
    const st = S(), ob = st.ob;
    if (!ob.authed) return App.reset('login');
    if (!ob.notifAsked) return App.reset('permNotif');
    if (!st.user.name) return App.reset('name');
    App.reset('home');
  },
  sendOtp() {
    const p = App.top().params;
    const v = (document.getElementById('mob').value || '').replace(/\D/g, '');
    p.phone = v;
    p.err = !v ? 'Enter your mobile number' : v.length !== 10 ? 'Mobile number must be 10 digits' : !/^[6-9]/.test(v) ? 'Enter a valid Indian mobile number starting with 6, 7, 8 or 9' : '';
    if (p.err) { App.refresh(); document.querySelector('.phone-input').classList.add('shake'); return; }
    p.loading = true; App.refresh();
    setTimeout(() => { p.loading = false; App.go('otp', { phone: v, left: 30, attempts: 3 }); }, 900);
  },
  boxes(v, state) {
    for (let i = 0; i < 6; i++) {
      const b = document.getElementById('ob' + i);
      b.textContent = v[i] || '';
      b.className = 'otp-box' + (state ? ' ' + state : i === v.length ? ' active' : '');
    }
  },
  otpInput(el) {
    el.value = el.value.replace(/\D/g, '').slice(0, 6);
    Auth.boxes(el.value);
    document.getElementById('otpErr').innerHTML = '';
    if (el.value.length === 6) Auth.verify();
  },
  verify() {
    const p = App.top().params;
    const el = document.getElementById('otpIn'), v = el.value, msg = document.getElementById('otpErr');
    if (p.attempts <= 0) { msg.innerHTML = `<div class="field-err">${icon('alert', 13)}Too many attempts. Request a new OTP.</div>`; return; }
    if (v.length < 6) { msg.innerHTML = `<div class="field-err">${icon('alert', 13)}Enter the 6-digit OTP</div>`; return; }
    const btn = document.getElementById('verifyBtn');
    btn.classList.add('loading'); el.blur();
    setTimeout(() => {
      if (App.top().name !== 'otp') return;
      btn.classList.remove('loading');
      if (v === TEST_OTP) {
        Auth.boxes(v, 'ok');
        msg.innerHTML = `<div class="hint green row gap4">${icon('check', 14)}Verified</div>`;
        setTimeout(() => {
          const st = S(), returning = st.user.phone === p.phone && st.user.name;
          st.ob.authed = true; st.user.phone = p.phone; Store.save();
          if (returning) UI.toast(`Welcome back, ${st.user.name.split(' ')[0]}`, 'ok');
          Auth.route();
        }, 550);
      } else {
        p.attempts--;
        Auth.boxes(v, 'err');
        document.querySelector('.otp').classList.add('shake');
        msg.innerHTML = `<div class="field-err">${icon('alert', 13)}${p.attempts > 0 ? `Incorrect OTP. ${p.attempts} attempt${p.attempts > 1 ? 's' : ''} left.` : 'Too many attempts. Request a new OTP.'}</div>`;
        setTimeout(() => { el.value = ''; Auth.boxes(''); document.querySelector('.otp').classList.remove('shake'); }, 600);
      }
    }, 1000);
  },
  resendHtml(p) { return p.left > 0 ? `Resend OTP in <b>00:${pad2(p.left)}</b>` : `Didn't get it? <button class="link" onclick="Auth.resend()">Resend OTP</button>`; },
  resend() {
    const p = App.top().params;
    p.left = 30; p.attempts = 3;
    document.getElementById('resend').innerHTML = Auth.resendHtml(p);
    document.getElementById('otpErr').innerHTML = '';
    UI.toast(`OTP sent again to +91 ${p.phone}`, 'ok');
  },
  notif(allow) {
    const done = granted => { Store.set(s => { s.ob.notifAsked = true; s.ob.notifGranted = granted; }); if (granted) UI.toast('Notifications turned on', 'ok'); Auth.route(); };
    if (!allow) return done(false);
    const no = { label: Platform.android ? "Don't allow" : "Don't Allow", fn: () => done(false) };
    const yes = { label: 'Allow', bold: true, fn: () => done(true) };
    UI.osPrompt(Platform.android
      ? { ic: 'bell', title: 'Allow <b>VillageHub</b> to send you notifications?', message: '', actions: [yes, no] }
      : { title: '"VillageHub" Would Like to Send You Notifications', message: 'Notifications may include alerts, sounds and badges.', actions: [no, yes] });
  },
  saveName() {
    const el = document.getElementById('nm'), v = el.value.trim().replace(/\s+/g, ' '), p = App.top().params;
    p.name = v;
    p.err = !v ? 'Please enter your name' : v.length < 2 ? 'Name must have at least 2 characters' : !/^[\p{L}\p{M} .'-]+$/u.test(v) ? 'Use letters only' : '';
    if (p.err) return App.refresh();
    p.loading = true; App.refresh();
    setTimeout(() => { S().user.name = v; Store.save(); App.reset('home'); UI.toast(`Welcome to VillageHub, ${v.split(' ')[0]}!`, 'ok'); }, 700);
  }
};

App.reg('splash', {
  full: true, light: true,
  render() {
    return `<div class="splash">
      <div class="splash-mark">${brandMark(84, true)}</div>
      <div class="splash-name">Village<b>Hub</b></div>
      <div class="splash-tag">Community services, run together.</div>
      <div class="splash-loader"><i></i></div>
    </div>`;
  },
  mount() { const t = setTimeout(() => Auth.route(), 1600); return () => clearTimeout(t); }
});

App.reg('login', {
  render(p) {
    return `<div class="content pad">
      <div class="row between auth-lang">${brandMark(48)}<button class="chip" onclick="I18n.sheet()">${icon('globe', 15)}<span data-raw>${I18n.label()}</span>${icon('down', 14)}</button></div>
      <div class="auth-top" style="padding-top:0">
        <h1 class="h1">Login with your mobile number</h1>
        <p class="muted">We'll send a 6-digit OTP to verify it's you. One account for every chit group, temple collection and future service.</p></div>
      ${C.field('Mobile number', `<div class="phone-input ${p.err ? 'err' : ''}"><span class="cc">+91 <i>IN</i></span><input id="mob" inputmode="numeric" maxlength="10" placeholder="98765 43210" value="${esc(p.phone || '')}" onkeydown="if(event.key==='Enter')Auth.sendOtp()"></div>`, { err: p.err })}
      <button class="btn btn-primary btn-block mt8 ${p.loading ? 'loading' : ''}" onclick="Auth.sendOtp()">Send OTP</button>
      <p class="xs muted center mt16">By continuing you agree to the <button class="link" onclick="App.go('terms')">Terms & Privacy Policy</button>.</p>
      <div class="info-card mt24">${icon('info', 16)}<div>Prototype: any valid 10-digit number works. The OTP is <b>${TEST_OTP}</b>.</div></div>
    </div>`;
  },
  mount() { setTimeout(() => { const m = document.getElementById('mob'); if (m) m.focus(); }, 300); }
});

App.reg('otp', {
  render(p) {
    return `${C.appbar('', { back: true })}<div class="content pad" style="padding-top:0">
      <h1 class="h1">Enter OTP</h1>
      <p class="muted mt4">Sent to <b>+91 ${esc(p.phone)}</b> · <button class="link" onclick="App.back()">Change</button></p>
      <div class="otp mt24"><input id="otpIn" class="otp-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" oninput="Auth.otpInput(this)">
        ${Array.from({ length: 6 }, (_, i) => `<div class="otp-box ${i === 0 ? 'active' : ''}" id="ob${i}"></div>`).join('')}</div>
      <div id="otpErr" class="mt8"></div>
      <button class="btn btn-primary btn-block mt16" id="verifyBtn" onclick="Auth.verify()">Verify & continue</button>
      <p class="sm muted center mt16" id="resend">${Auth.resendHtml(p)}</p>
    </div>`;
  },
  mount(p) {
    setTimeout(() => { const i = document.getElementById('otpIn'); if (i) i.focus(); }, 300);
    const t = setInterval(() => { if (p.left > 0) { p.left--; const el = document.getElementById('resend'); if (el) el.innerHTML = Auth.resendHtml(p); } }, 1000);
    return () => clearInterval(t);
  }
});

App.reg('permNotif', {
  render() {
    return `<div class="content pad">
      <div class="perm-art">${icon('bell', 52)}</div>
      <h1 class="h1 center">Stay on top of your services</h1>
      <p class="muted center mt8">Auction reminders, payment confirmations and collection updates.</p>
      <div class="perm-list">
        <div>${icon('gavel', 18)}<span>Auction starting soon, bids and results</span></div>
        <div>${icon('wallet', 18)}<span>Contribution due dates and receipts</span></div>
        <div>${icon('lock', 18)}<span>Amounts are hidden on the lock screen by default</span></div>
      </div></div>
    <div class="footer col"><button class="btn btn-primary btn-block" onclick="Auth.notif(true)">Allow notifications</button><button class="btn btn-ghost btn-block" onclick="Auth.notif(false)">Not now</button></div>`;
  }
});

App.reg('name', {
  render(p) {
    return `<div class="content pad"><div class="auth-top">${icon('user', 40, 'teal')}
      <h1 class="h1">What should we call you?</h1><p class="muted">Members and organisers see this name in groups you join.</p></div>
      ${C.field('Your name', `<input id="nm" class="input ${p.err ? 'err' : ''}" maxlength="40" placeholder="e.g. Arun Kumar" value="${esc(p.name || '')}" onkeydown="if(event.key==='Enter')Auth.saveName()">`, { err: p.err })}
    </div><div class="footer"><button class="btn btn-primary btn-block ${p.loading ? 'loading' : ''}" onclick="Auth.saveName()">Continue</button></div>`;
  },
  mount() { setTimeout(() => { const m = document.getElementById('nm'); if (m) m.focus(); }, 300); }
});
