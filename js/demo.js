/* Client demo shell: first-visit welcome, the demo guide as a sheet on phones, app install and offline cache.
 * Not part of the app itself; loaded after app.js. */

const WELCOME_KEY = 'villagehub_demo_welcomed';

const Demo = {
  _installEvt: null,

  get standalone() { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; },
  get narrow() { return matchMedia('(max-width: 760px)').matches; },
  get ios() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); },

  openGuide() { document.body.classList.add('guide-open'); document.getElementById('panel').scrollTop = 0; },
  closeGuide() { document.body.classList.remove('guide-open'); },

  welcome() {
    let seen = false;
    try { seen = !!localStorage.getItem(WELCOME_KEY); } catch (e) { /* ignore */ }
    if (seen) return;
    document.getElementById('welcomeMark').innerHTML = brandMark(56);
    const hint = document.getElementById('welcomeHint');
    if (!this.standalone && this.narrow) {
      hint.innerHTML = this.ios
        ? 'Tip: in Safari, tap Share → <b>Add to Home Screen</b> to open it full-screen like an app.'
        : 'Tip: in Chrome, tap ⋮ → <b>Install app</b> to open it full-screen like an app.';
    } else hint.innerHTML = this.narrow ? 'Tap <b>Demo</b> at any time for guided flows.' : 'Use the guide on the left to jump straight to any flow.';
    document.getElementById('welcome').hidden = false;
  },
  start(mode) {
    try { localStorage.setItem(WELCOME_KEY, '1'); } catch (e) { /* ignore */ }
    document.getElementById('welcome').hidden = true;
    if (mode === 'demo') Panel.loadDemo(); else Panel.newUser();
  },

  async install() {
    const e = this._installEvt; if (!e) return;
    e.prompt();
    await e.userChoice.catch(() => null);
    this._installEvt = null;
    document.getElementById('installBtn').hidden = true;
  },

  init() {
    // On phones the guide closes after choosing a flow; look/language buttons keep it open.
    document.getElementById('panel').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b && !b.hasAttribute('data-keep') && !b.classList.contains('panel-x') && this.narrow) this.closeGuide();
    });
    addEventListener('keydown', e => { if (e.key === 'Escape') this.closeGuide(); });

    if (this.standalone) document.getElementById('installSec').hidden = true;
    addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      this._installEvt = e;
      document.getElementById('installBtn').hidden = false;
    });
    addEventListener('appinstalled', () => { document.getElementById('installSec').hidden = true; });

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline cache is optional */ });
    }
    this.welcome();
  }
};

Demo.init();
