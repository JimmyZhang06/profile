# Installed web app safe areas

Live source release: `5bdb88f` at `https://resume.jimmyzhang.xyz/`.
Active: `/opt/luli/releases/5bdb88f`; previous: `/opt/luli/releases/ba40dc6`.

The user reports a persistently blurred top edge in an iOS 27 Home Screen app,
including immediately after launch. No workspace header uses a CSS blur filter;
the previous layout did not reserve a top safe area. WebKit also has native
scroll-edge effects, so the device symptom cannot be conclusively attributed
to CSS without physical-device validation.

The viewport now uses `viewport-fit=cover`. A fixed, opaque app frame owns all
four `env(safe-area-inset-*)` values once, with matching initial/theme backgrounds.
Workspace, account panel, navigation drawer and admin/authentication layouts fit
inside that frame; their inner areas retain native scrolling. Removed duplicated
bottom safe-area padding from individual footers. Portal menus intersect the
safe frame with the visual viewport, including a reduced or panned viewport.
No device-specific status-bar offset, translucent status-bar meta tag, zoom
restriction, service worker or private-data caching was introduced. New layout
rules are screen-only so they do not make the print root fixed.

Validation completed:

- Production build and 91 local tests passed. The first isolated HTTP test run
  was blocked by the local network sandbox; its permitted rerun passed.
- Browser checks at 390×844, 844×390 and 1440×900. A temporary local fixture used
  59px top/34px bottom portrait insets and 59px side/21px bottom landscape insets.
  The real app, not a static mock, was used with fictional account data.
- In the portrait fixture the frame spans y=59…810; the account header stays at
  y=59 while its content scrolls 568.8px and the outer document stays at 0.
  Navigation Logo, light/dark backgrounds, menus and font choices stay within
  the safe frame. Desktop has zero extra inset. The admin verification page
  remains usable; no real authenticator or production account was accessed.
- 33 server tests passed as the `luli` service user. Dependency lockfile and
  database schema match the previous release. Database backup succeeded before
  the atomic switch; only `luli.service` was restarted.
- Public HTTPS checks verify exact HTML and entry JS/CSS hashes, viewport
  metadata, manifest MIME/revalidation, all 5 PNGs, missing-icon 404,
  anonymous-admin 401 and healthy production service.

Physical iOS 27 compositing, keyboard behavior and installation were not
verified. Close the installed app from the app switcher and relaunch to load
the new document; verify the reported top-edge effect on the user's device.
The synthetic insets are layout evidence, not a reproduction of iOS blur.

Local evidence: `.data/ios-safe-area-20261101/` (excluded from Git), including
`dark-sidebar-safe-area.png`, the temporary fixture and public verification.
Private server artifacts: `/var/backups/luli/ios-safe-area-20261102-5bdb88f`.
Archive SHA-256: `7b2729b2e2975611c063bf924fdc54fe7b89860026f079a199fd023c23af95cb`.
Rollback: atomically relink `/opt/luli/current` to `/opt/luli/releases/ba40dc6`
and restart only `luli.service`. No schema or deployment configuration changed.

References: [WebKit viewport and safe areas](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)
and [WebKit fixed elements and scroll-edge compositing](https://results.webkit.org/commit?uuid=175056451300).
