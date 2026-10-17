/* VillageHub prototype — stack navigation with tab roots (ServiDEX-V2 router).
 * A screen is { render(params, entry) => html, mount?(params, entry) => cleanup?, tab?, full?, light?, net?, ptr? }.
 * `net: true` screens show the network error state when offline is simulated.
 * `guard(params)` returns an error screen name when the user may not open the screen (e.g. not a member).
 * The bottom tab bar shows only when a tab screen is the root of the stack. */

const App = {
  stack: [],
  screens: {},
  session: {},

  reg(name, def) { this.screens[name] = def; },
  top() { return this.stack[this.stack.length - 1]; },

  go(name, params = {}) { this._leave(); this.stack.push({ name, params }); this.render('push'); },
  back() {
    if (this.stack.length > 1) { this._leave(); this.stack.pop(); this.render('pop'); }
    else if (this.top().name !== 'home' && S().ob.authed && S().user.name) this.reset('home');
  },
  replace(name, params = {}) { this._leave(); this.stack[this.stack.length - 1] = { name, params }; this.render('fade'); },
  reset(name, params = {}) { this._leave(); this.stack = [{ name, params }]; this.render('fade'); },
  tab(name) {
    UI.close(true);
    const t = this.top();
    if (t && t.name === name && this.stack.length === 1) {
      const c = document.querySelector('#app .content'); if (c) c.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    this._leave(); this.stack = [{ name, params: {} }]; this.session.tabPop = name; this.render('none');
  },
  // Update a param of the current screen and re-render in place.
  set(k, v) { this.top().params[k] = v; this.refresh(); },
  refresh() { if (this.top()) this.render('none', true); },

  _leave() {
    const t = this.top();
    if (t && t._cleanup) { t._cleanup(); t._cleanup = null; }
    UI.close(true);
  },

  render(dir, keep) {
    const t = this.top();
    let def = this.screens[t.name];
    const denied = def.guard && def.guard(t.params);
    if (denied) def = this.screens[denied];
    const app = document.getElementById('app');
    let scroll = 0;
    if (keep) { const c = app.querySelector('.content'); if (c) scroll = c.scrollTop; }
    const tabbar = this.stack.length === 1 && def.tab ? C.tabbar(t.name) : '';
    app.innerHTML = `<div class="screen ${def.full ? 'full' : ''} ${dir !== 'none' ? 'anim-' + dir : ''}">${def.render(t.params, t)}${tabbar}</div>`;
    document.getElementById('statusbar').className = 'statusbar' + (def.light ? ' light' : '');
    if (def.net && S().sim.offline) Net.block(app);
    if (keep) { const c = app.querySelector('.content'); if (c) c.scrollTop = scroll; }
    else if (def.mount) { const r = def.mount(t.params, t); if (typeof r === 'function') t._cleanup = r; }
    // Header elevation and large-title collapse follow the scroll position.
    const scr = app.firstElementChild, content = app.querySelector('.content');
    if (content && scr) {
      const onScroll = () => { const y = content.scrollTop; scr.classList.toggle('scrolled', y > 4); scr.classList.toggle('lt-collapsed', y > 34); };
      content.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
    this.session.tabPop = null;
    I18n.apply(app);
    Motion.afterRender(app, def);
    A11y.label(app);
    if (window.Panel) Panel.sync();
  }
};
