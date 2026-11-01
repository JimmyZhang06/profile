# Home Screen icon fix

Live source release: `ba40dc6` at `https://resume.jimmyzhang.xyz/`.
Active: `/opt/luli/releases/ba40dc6`; prior release: `/opt/luli/releases/81bfd97`.

The previous HTML declared only an SVG favicon. It had no Apple touch icon or
web app manifest. Added an explicit 180px Apple icon, 192/512px app icons, a
separate 512px maskable icon, a PNG favicon fallback and a linked manifest with
stable `/` identity/start/scope, standalone display and short name 履历.
Icons use the existing folded-page paths on an opaque monochrome square;
maskable artwork fits inside the central 40%-radius safe circle.

Cloud and local servers send `application/manifest+json`. The manifest and
Apple icon revalidate; missing icon/manifest files return 404 instead of the SPA
HTML. No service worker or private-data caching was added.

Run `npm run icons` locally to regenerate committed PNGs from
`src/assets/luli-mark.svg`. `@resvg/resvg-js` is a pinned development dependency.
Every existing lockfile entry and runtime dependency remains unchanged; this
was checked before reusing the previous release's server dependencies.

Validation: clean dependency installation, icon regeneration, production build
and 89 local tests passed. On the server, 23 tests passed as `luli`, including
both real static-serving paths with an isolated in-memory test database.
After a successful database backup and atomic switch, public HTTPS checks
confirmed the exact index, manifest MIME/revalidation, 5 PNG dimensions and
hashes, entry JS/CSS hashes, missing-icon 404, anonymous-admin 401 and healthy
cloud production service. No real user records or credentials were accessed.
Physical iOS/Android Home Screen installation was not performed. Previously
saved launchers may retain an old icon; add a fresh launcher from the browser.

Private release/verification files: `/var/backups/luli/webapp-icons-20261101-ba40dc6`.
Local evidence: `.data/webapp-icons-20261101/` (excluded from Git).
Archive SHA-256: `85599666a36a9e1b6bf78b592c89fcc01b6184eea31a4389b9fd2c2eec3b0e3f`.
Rollback: atomically relink `/opt/luli/current` to `/opt/luli/releases/81bfd97`
and restart only `luli.service`; there is no schema change.

References: [WebKit Home Screen icons](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
and [web.dev manifest and maskable icons](https://web.dev/learn/pwa/web-app-manifest).
