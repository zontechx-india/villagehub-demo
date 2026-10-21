/* VillageHub prototype — live theme (copied from ServiDEX-V2).
 * The default colours live in assets/styles.css (:root "THEME: base colours"). This file lets you try
 * other combinations without editing files: it overrides those base CSS variables on the phone element,
 * and every derived shade (tints, text-on-tint, gradients, shadows) follows automatically via color-mix().
 * Dark backgrounds switch on the dark-mode rules (.theme-dark); a theme can also use the "Native" UI style
 * (.ui-native: iOS Settings / Telegram-like grouped lists, icon tiles, iOS toggles, frosted bars). */

const THEME_KEY = 'villagehub_theme';

// Editable base colours, in the order shown in the Theme panel.
const THEME_FIELDS = [
  ['primary', 'Primary', 'Dark buttons, provider gradient, toasts'],
  ['secondary', 'Secondary', 'Main buttons, active tab, links'],
  ['accent', 'Accent', 'Badges, alerts, logo dot'],
  ['bg', 'Background', 'Screen background'],
  ['card', 'Card', 'Cards, grouped lists, sheets'],
  ['text', 'Text', 'Primary text'],
  ['muted', 'Muted text', 'Secondary text, icons'],
  ['border', 'Border', 'Separators, borders'],
  ['success', 'Success', 'Paid, available, toggles in Native style'],
  ['error', 'Error', 'Errors, cancel, disputes'],
  ['info', 'Info', 'Info banners, verified badge'],
  ['star', 'Rating stars', 'Star ratings'],
  ['onDark', 'Text on dark', 'Text on primary and gradients'],
  ['onSecondary', 'Text on secondary', 'Text on main buttons']
];

// Must match the :root base colours in assets/styles.css.
const THEME_DEFAULT = {
  primary: '#17212B', secondary: '#3390EC', accent: '#F7A23B', bg: '#EFEFF4', card: '#FFFFFF', text: '#000000', muted: '#707579',
  border: '#DADCE0', success: '#4FAE4E', error: '#E53935', info: '#3390EC', star: '#F7B500', onDark: '#FFFFFF', onSecondary: '#FFFFFF',
  catMode: 'colourful', style: 'standard', tints: 'neutral', dark: 'on'
};

// Dark surfaces applied on top of any light theme when dark mode is On (or System and the device is dark).
// Brand colours (secondary, accent, success…) are kept from the theme.
const DARK_SURFACES = { primary: '#2C2C2E', bg: '#000000', card: '#1C1C1E', text: '#FFFFFF', muted: '#8E8E93', border: '#38383A', onDark: '#FFFFFF' };
const sysDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

// Presets only list what differs from the default.
const THEME_GROUPS = {
  'Default': { 'VillageHub (default)': {} },
  'Premium · native': {
    // Sampled from the iOS Settings screenshots: true-black background, #1C1C1E grouped cells,
    // system blue links, system green toggles, system orange / red / yellow.
    'iOS Dark (Settings)': { primary: '#2C2C2E', secondary: '#0A84FF', accent: '#FF9F0A', bg: '#000000', card: '#1C1C1E', text: '#FFFFFF', muted: '#8E8E93', border: '#38383A', success: '#30D158', error: '#FF453A', info: '#0A84FF', star: '#FFD60A', style: 'native', catMode: 'brand' },
    'iOS Light (Settings)': { primary: '#1C1C1E', secondary: '#007AFF', accent: '#FF9500', bg: '#F2F2F7', card: '#FFFFFF', text: '#000000', muted: '#8E8E93', border: '#C6C6C8', success: '#34C759', error: '#FF3B30', info: '#007AFF', star: '#FFCC00', style: 'native' },
    'Telegram Light': { primary: '#17212B', secondary: '#3390EC', accent: '#F7A23B', bg: '#EFEFF4', card: '#FFFFFF', text: '#000000', muted: '#707579', border: '#DADCE0', success: '#4FAE4E', error: '#E53935', info: '#3390EC', star: '#F7B500', style: 'native' },
    'Telegram Night': { primary: '#2B3A4A', secondary: '#5288C1', accent: '#E9A23B', bg: '#0E1621', card: '#17212B', text: '#F5F5F5', muted: '#7D8B99', border: '#243140', success: '#4FAE4E', error: '#EC3942', info: '#64B5EF', star: '#F7B500', style: 'native', catMode: 'brand' },
    'Midnight Gold': { primary: '#26262A', secondary: '#D4AF5A', accent: '#E8C77A', bg: '#0B0B0C', card: '#161618', text: '#F4F1EA', muted: '#9A958C', border: '#2A2A2E', success: '#3FB27F', error: '#E5534B', info: '#E8C77A', star: '#E3B341', onSecondary: '#141414', style: 'native', catMode: 'brand' },
    'Porcelain Noir': { primary: '#111111', secondary: '#111111', accent: '#B8925A', bg: '#F6F5F2', card: '#FFFFFF', text: '#111111', muted: '#6E6E73', border: '#E5E3DE', success: '#2F7D5B', error: '#C2410C', info: '#3A5A80', star: '#B8925A', style: 'native', catMode: 'brand' }
  },
  // Orange & yellow as brand highlights on a neutral white / black / gray base.
  // Colours only: radius, type and UI style are unchanged.
  // Bright orange / yellow fail contrast with white text, so text on buttons and banners uses a dark ink.
  'Orange & Yellow': {
    // Carbon Orange: orange / yellow brand colours with neutral tints and
    // brand icons, on iOS-style light system grays (grouped gray background, white cards, near-black dark surfaces).
    'Carbon Orange iOS Light': { primary: '#1C1C1E', secondary: '#FF7A00', accent: '#FFC400', bg: '#F2F2F7', card: '#FFFFFF', text: '#000000', muted: '#6E6E73', border: '#E5E5EA', info: '#FF9500', star: '#FFC400', onSecondary: '#1A0E00', catMode: 'brand', tints: 'neutral' },
    // Same idea on a cooler blue-gray background.
    'Carbon Orange Cool Mist': { primary: '#16181D', secondary: '#FF7A00', accent: '#FFC400', bg: '#EEF0F3', card: '#FFFFFF', text: '#0B0C0E', muted: '#6B7079', border: '#DFE2E7', info: '#FF9500', star: '#FFC400', onSecondary: '#1A0E00', catMode: 'brand', tints: 'neutral' },
    'Carbon Orange Dark': { primary: '#2A2A2A', secondary: '#FF7A00', accent: '#FFC400', bg: '#0D0D0D', card: '#1A1A1A', text: '#F5F5F5', muted: '#9A9A9A', border: '#2C2C2C', success: '#3FB950', error: '#FF5A4E', info: '#FFB020', star: '#FFC400', onSecondary: '#1A0E00' }
  }
};
const THEME_PRESETS = Object.assign({}, ...Object.values(THEME_GROUPS));

const Theme = {
  current: null,
  target() { return document.getElementById('phone') || document.documentElement; },
  load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(THEME_KEY) || 'null'); } catch (e) { /* ignore */ }
    this.current = Object.assign({}, THEME_DEFAULT, saved || {});
  },
  save() { try { localStorage.setItem(THEME_KEY, JSON.stringify(this.current)); } catch (e) { /* ignore */ } },
  cssVar(k) { return '--' + k.replace(/[A-Z]/g, m => '-' + m.toLowerCase()); },
  // Relative luminance of the background decides whether dark-mode rules apply.
  darkWanted() { return this.current.dark === 'on' || (this.current.dark === 'system' && !!(sysDark && sysDark.matches)); },
  // The colours actually applied: the theme, plus dark surfaces when dark mode is active and the theme is light.
  effective() {
    const c = this.current;
    return this.darkWanted() && !this.isDark(c.bg) ? Object.assign({}, c, DARK_SURFACES) : c;
  },
  isDark(bgHex) {
    const h = (bgHex || this.effective().bg || '#ffffff').replace('#', '');
    const [r, g, b] = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.35;
  },
  apply() {
    const el = this.target(), st = el.style, eff = this.effective();
    THEME_FIELDS.forEach(([k]) => {
      // Only override what differs from the stylesheet, so styles.css stays the source of truth.
      if (eff[k] && eff[k].toLowerCase() !== THEME_DEFAULT[k].toLowerCase()) st.setProperty(this.cssVar(k), eff[k]);
      else st.removeProperty(this.cssVar(k));
    });
    el.classList.toggle('theme-dark', this.isDark());
    el.classList.toggle('ui-native', this.current.style === 'native');
    el.classList.toggle('tint-neutral', this.current.tints === 'neutral');
  },
  set(k, v) {
    this.current[k] = v; this.save(); this.apply();
    if (['catMode', 'style', 'bg', 'dark'].includes(k)) { if (window.App && App.top()) App.refresh(); }
    if (['catMode', 'style', 'tints', 'dark'].includes(k)) this.panel();
    const sel = document.getElementById('themePreset'); if (sel) sel.value = Theme.presetName();
  },
  usePreset(name) {
    this.current = Object.assign({}, THEME_DEFAULT, THEME_PRESETS[name], { dark: this.current.dark });
    this.save(); this.apply(); this.panel();
    if (window.App && App.top()) App.refresh();
  },
  reset() { this.usePreset('VillageHub (default)'); UI.toast('Theme reset to default', 'ok'); },
  presetName() {
    const keys = THEME_FIELDS.map(([k]) => k).concat(['style', 'tints']);
    return Object.keys(THEME_PRESETS).find(n => { const p = Object.assign({}, THEME_DEFAULT, THEME_PRESETS[n]); return keys.every(k => String(p[k]).toLowerCase() === String(this.current[k]).toLowerCase()); }) || 'Custom';
  },
  // The base-colour block to paste into assets/styles.css to make a combination permanent.
  css() {
    return ':root {\n' + THEME_FIELDS.map(([k]) => `  ${this.cssVar(k)}: ${this.current[k].toUpperCase()};`).join('\n') + '\n}'
      + `\n/* UI style: ${this.current.style}${this.current.style === 'native' ? ' (set THEME_DEFAULT.style = \'native\' in js/theme.js)' : ''} · category icons: ${this.current.catMode} · tints: ${this.current.tints}${this.current.tints === 'neutral' ? ' (set THEME_DEFAULT.tints = \'neutral\' in js/theme.js)' : ''} */`;
  },
  copy() {
    const css = this.css();
    const done = () => UI.toast('Theme CSS copied. Paste it over the base colours in styles.css', 'ok');
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(css).then(done, () => Theme.showCss());
    else Theme.showCss();
  },
  showCss() {
    UI.sheet(`<div class="sheet-title">Theme CSS</div><p class="xs muted mb12">Paste this over the base colours at the top of <b>assets/styles.css</b> and update <b>THEME_DEFAULT</b> in js/theme.js.</p>
      <textarea class="textarea" style="font-family:monospace;font-size:12px;min-height:280px" onfocus="this.select()">${esc(this.css())}</textarea>`);
  },
  // Control-panel editor (desktop only).
  panel() {
    const el = document.getElementById('themePanel'); if (!el) return;
    const t = this.current, name = this.presetName();
    el.innerHTML = `
      <select id="themePreset" class="panel-select" onchange="if(this.value!=='Custom')Theme.usePreset(this.value)">
        ${Object.entries(THEME_GROUPS).map(([g, ps]) => `<optgroup label="${g}">${Object.keys(ps).map(n => `<option ${n === name ? 'selected' : ''}>${n}</option>`).join('')}</optgroup>`).join('')}
        <option ${name === 'Custom' ? 'selected' : ''} disabled>Custom</option>
      </select>
      <div class="panel-grid">
        <button class="${t.style === 'standard' ? 'on' : ''}" onclick="Theme.set('style','standard')">Standard UI</button>
        <button class="${t.style === 'native' ? 'on' : ''}" onclick="Theme.set('style','native')">Native UI</button>
      </div>
      <div class="panel-sub">Dark mode</div><div class="panel-grid" style="grid-template-columns:1fr 1fr 1fr">${[['off', 'Off'], ['on', 'On'], ['system', 'System']].map(([k, l]) => `<button class="${t.dark === k ? 'on' : ''}" onclick="Theme.set('dark','${k}')">${l}</button>`).join('')}</div>
      <div class="swatches">${THEME_FIELDS.map(([k, label, hint]) => `<label class="swatch" title="${hint}"><input type="color" value="${t[k]}" oninput="Theme.set('${k}',this.value)"><span>${label}</span></label>`).join('')}</div>
      <div class="panel-grid mt8">
        <button class="${t.catMode === 'colourful' ? 'on' : ''}" onclick="Theme.set('catMode','colourful')">Colourful icons</button>
        <button class="${t.catMode === 'brand' ? 'on' : ''}" onclick="Theme.set('catMode','brand')">Brand icons</button>
      </div>
      <div class="panel-grid">
        <button class="${t.tints === 'brand' ? 'on' : ''}" onclick="Theme.set('tints','brand')">Brand tints</button>
        <button class="${t.tints === 'neutral' ? 'on' : ''}" onclick="Theme.set('tints','neutral')">Neutral tints</button>
      </div>
      <div class="panel-grid"><button onclick="Theme.copy()">Copy CSS</button><button onclick="Theme.reset()">Reset</button></div>`;
  }
};

// Category icon colours: each category's own colour, or the brand colour when "Brand icons" is chosen.
// On dark themes the pastel tiles are toned down so they sit on dark surfaces.
function catStyle(c) {
  if (Theme.current && Theme.current.catMode === 'brand') return '--tint:var(--secondary-50);--fg:var(--secondary-d)';
  if (Theme.current && Theme.isDark()) return `--tint:color-mix(in srgb, ${c.fg} 26%, var(--card));--fg:color-mix(in srgb, ${c.fg} 45%, white)`;
  return `--tint:${c.tint};--fg:${c.fg}`;
}

Theme.load();
Theme.apply();
// Follow the device light/dark setting live when dark mode is set to System.
if (sysDark && sysDark.addEventListener) sysDark.addEventListener('change', () => { if (Theme.current.dark === 'system') { Theme.apply(); if (window.App && App.top()) App.refresh(); } });
