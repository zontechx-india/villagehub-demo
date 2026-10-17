/* VillageHub prototype — motion and gestures (from ServiDEX-V2).
 * Sliding segment/tab indicators, pull-to-refresh and drag-to-close sheets.
 * Everything here is optional polish: flows work the same without it, and it respects "reduce motion". */

const reduceMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

const Motion = {
  // Called by App.render after every render.
  afterRender(app, def) {
    Motion.segments(app);
    Motion.tabLines(app);
    if (def.ptr) Motion.pullToRefresh(app);
  },

  /* Sliding pill behind the selected segment (.seg.has-ind). */
  segments(app) {
    app.querySelectorAll('.seg-ind[data-to]').forEach(ind => {
      const to = ind.dataset.to;
      if (reduceMotion()) { ind.style.setProperty('--i', to); return; }
      requestAnimationFrame(() => requestAnimationFrame(() => ind.style.setProperty('--i', to)));
    });
  },
  segInd(key, idx, n) {
    const prev = (App.session.segPrev || {})[key];
    (App.session.segPrev = App.session.segPrev || {})[key] = idx;
    return `<span class="seg-ind" style="--n:${n};--i:${prev == null ? idx : prev}" data-to="${idx}" aria-hidden="true"></span>`;
  },

  /* Underline that slides between tabs (.tabs-line[data-key]). */
  tabLines(app) {
    app.querySelectorAll('.tabs-line[data-key]').forEach(tl => {
      const on = tl.querySelector('button.on'), ind = tl.querySelector('.tl-ind');
      if (!on || !ind) return;
      const key = tl.dataset.key, to = { x: on.offsetLeft, w: on.offsetWidth };
      const prev = (App.session.tlPrev || {})[key];
      if (prev && !reduceMotion()) {
        ind.style.transition = 'none';
        ind.style.transform = `translateX(${prev.x}px)`; ind.style.width = prev.w + 'px';
        void ind.offsetWidth;
        ind.style.transition = '';
      }
      ind.style.transform = `translateX(${to.x}px)`; ind.style.width = to.w + 'px';
      (App.session.tlPrev = App.session.tlPrev || {})[key] = to;
    });
  },

  /* Pull to refresh on screens with def.ptr: drag down at the top of the list. */
  pullToRefresh(app) {
    const c = app.querySelector('.content'); if (!c) return;
    const ind = document.createElement('div');
    ind.className = 'ptr'; ind.innerHTML = '<div class="spinner"></div>';
    c.prepend(ind);
    let y0 = null, dy = 0, busy = false;
    const start = y => { if (busy || c.scrollTop > 0) return; y0 = y; dy = 0; };
    const move = (y, e) => {
      if (y0 == null) return;
      dy = Math.max(0, y - y0);
      if (dy > 0 && c.scrollTop <= 0) {
        if (e && e.cancelable) e.preventDefault();
        const h = Math.min(dy * 0.5, 72);
        ind.style.height = h + 'px'; ind.style.opacity = Math.min(1, h / 56);
        ind.classList.toggle('ready', h >= 56);
      }
    };
    const end = () => {
      if (y0 == null) return;
      y0 = null;
      if (Math.min(dy * 0.5, 72) >= 56) {
        busy = true; ind.classList.add('busy'); ind.style.height = '56px';
        setTimeout(() => { App.refresh(); UI.toast('Updated', 'ok'); }, 700);
      } else { ind.style.height = '0px'; ind.style.opacity = 0; }
    };
    c.addEventListener('touchstart', e => start(e.touches[0].clientY), { passive: true });
    c.addEventListener('touchmove', e => move(e.touches[0].clientY, e), { passive: false });
    c.addEventListener('touchend', end);
    c.addEventListener('mousedown', e => { if (e.button === 0 && !e.target.closest('button,a,input,textarea,select,.hscroll,.promo-track')) start(e.clientY); });
    c.addEventListener('mousemove', e => move(e.clientY));
    c.addEventListener('mouseup', end); c.addEventListener('mouseleave', end);
  },

  /* Drag a bottom sheet down to close it. Called by UI.sheet. */
  sheetDrag(box) {
    if (!box || box.dataset.drag) return;
    box.dataset.drag = '1';
    let y0 = null, dy = 0;
    const start = (y, target) => { if (box.scrollTop > 0 && !target.closest('.grab')) return; y0 = y; dy = 0; box.style.transition = 'none'; };
    const move = (y, e) => {
      if (y0 == null) return;
      dy = Math.max(0, y - y0);
      if (dy > 0) { if (e && e.cancelable) e.preventDefault(); box.style.transform = `translateY(${dy}px)`; }
    };
    const end = () => {
      if (y0 == null) return;
      y0 = null; box.style.transition = 'transform .2s';
      if (dy > 110) UI.close(); else box.style.transform = '';
    };
    box.addEventListener('touchstart', e => start(e.touches[0].clientY, e.target), { passive: true });
    box.addEventListener('touchmove', e => move(e.touches[0].clientY, e), { passive: false });
    box.addEventListener('touchend', end);
    const grab = box.querySelector('.grab');
    if (grab) grab.addEventListener('mousedown', e => { start(e.clientY, e.target); const mm = ev => move(ev.clientY); const mu = () => { end(); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); }; window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu); });
  }
};
