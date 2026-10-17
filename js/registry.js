/* Service registry (modular_community_management_app_spec.md §5.3, §8).
 * The shared core (dashboard, Create New, My Services, Activity, audit) only knows services through this
 * registry. Each module registers a definition; adding a module never touches login, dashboard or navigation.
 *
 * A module definition:
 *   key, name, short, desc, icon, tint, fg     catalogue entry and icon tile
 *   status: 'available' | 'soon'                availability in Create New
 *   createPerm                                  permission needed to create one (platform level)
 *   roles: { roleKey: { label, tone, perms[] } } roles inside one service instance
 *   setup(draftId?)                             opens the module's setup flow
 *   open(svcId)                                 opens the module's home for an instance
 *   summary(svc, role) => string                one-line summary for cards
 *   events(svc, role) => [{ at, title, sub, ic, go }]      upcoming dated events for Home
 *   pending(svc, role) => [{ title, sub, tone, ic, go }]   actions needing attention
 *   stats(svc, role) => [[value, label], …]     2–3 figures for the service card
 */

const Reg = {
  modules: {},
  order: [],
  register(def) { this.modules[def.key] = def; if (!this.order.includes(def.key)) this.order.push(def.key); },
  get(key) { return this.modules[key]; },
  list() { return this.order.map(k => this.modules[k]); },
  role(type, role) { const m = this.modules[type]; return m && m.roles[role]; },
  // Does the current user hold `perm` in this service? Checked by every action (the backend re-checks in production).
  can(svcId, perm) {
    const s = svcById(svcId); if (!s) return false;
    const r = this.role(s.type, myRole(svcId));
    return !!(r && (r.perms.includes('*') || r.perms.includes(perm)));
  }
};

// Modules that are registered but not built yet: they appear in Create New as "Coming soon",
// proving the catalogue is driven by the registry rather than hard-coded.
Reg.register({
  key: 'shg', name: 'Savings Group (SHG)', short: 'Savings', icon: 'piggy', tint: '#DCFCE7', fg: '#15803D', status: 'soon',
  desc: 'Monthly savings, internal loans and repayments for self-help groups.', roles: { admin: { label: 'Leader', tone: 'navy', perms: ['*'] } }
});
Reg.register({
  key: 'water', name: 'Water & Utility Dues', short: 'Utilities', icon: 'droplet', tint: '#E0F2FE', fg: '#0369A1', status: 'soon',
  desc: 'Street water tank, borewell and street-light dues per household.', roles: { admin: { label: 'Committee', tone: 'navy', perms: ['*'] } }
});
Reg.register({
  key: 'event', name: 'Village Event Fund', short: 'Events', icon: 'sparkles', tint: '#EDE9FE', fg: '#6D28D9', status: 'soon',
  desc: 'Pongal games, sports day and other one-off collections with expense tracking.', roles: { admin: { label: 'Organiser', tone: 'navy', perms: ['*'] } }
});
