# VillageHub — clickable prototype

Live demo: https://zontechx-india.github.io/villagehub-demo/

A clickable mobile prototype of VillageHub (Chit Fund — fixed monthly and auction chits — and Temple Vari Tharagar modules) with sample data and no backend.
It installs as an app from the browser (PWA) and opens full-screen from the home-screen icon.

- **Test OTP:** `123456` · **Join code:** `KWC-2026`
- Desktop: the app is shown in a phone frame with a demo guide on the left.
- Phone: full-screen; tap **Demo** on the right edge for guided flows.
- Install: iPhone Safari → Share → Add to Home Screen. Android Chrome → Install app.

Static files only — no build step. Deployed with GitHub Pages from `main`.
When you change files, bump `VERSION` in `sw.js` so installed copies drop their old offline cache.
