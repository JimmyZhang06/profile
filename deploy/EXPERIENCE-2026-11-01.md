# Complete experience previews — 2026-11-01

- Runtime/source release: `2c0b7ef`, pushed to `JimmyZhang06/profile` on `main`.
- Site: https://resume.jimmyzhang.xyz/
- Active release: `/opt/luli/releases/2c0b7ef`.
- Previous compatible release: `/opt/luli/releases/65498f4`.
- Dependency lock and database schema are unchanged.

## Changes

Project, work/internship, education and research records have a complete reading preview. It includes current unsaved text without saving or applying it, preserves mounted forms, and restores the opener's focus and scroll position. Conversation references can preview their entire current resume experience with the cited point marked; this does not enlarge the AI request scope.

Resume project selection is compact, with a named preview entry and row menu for ordering/removal. Desktop project chapters use a continuous, smoothly joined outline. The selected chapter has no gray fill or shadow; emphasis comes from the outline and text weight. The existing mobile chapter menu is retained.

## Verification

- Local application suite: 83 passed, 0 failed; production build and Git whitespace checks passed.
- Browser checks of the feature release used fictional local records and covered complete previews, unsaved drafts, return focus/scroll, selection ordering, conversation draft preservation, narrow screens and both themes. The final transparent chapter selection was inspected in the actual page: its background is transparent, shadow is none, and its only SVG path has no fill.
- Linux release checks: 18 document, navigation, formatting and experience-preview tests passed as the unprivileged `luli` account. That account also verified access to the server entry point and every built asset.
- Database backup completed before activation. No workspace data migration or production test-data writes were performed.
- HTTPS health returns 200 with cloud enabled and production mode. The public entry JavaScript and CSS both return 200 and their SHA-256 hashes match the local production build.
- Anonymous `/api/admin/mail` returns 401. SMTP remains unconfigured as previously requested.

The initial activation failed because the newly created release root was mode 0700; automatic rollback restored `65498f4`. The public code root and generated `dist` parent were corrected to mode 0755, service-account read checks were added, and the second activation succeeded. Private configuration and backup directories retain their restricted permissions. Only `luli.service` was restarted.

Public browser automation timed out; public deployment verification therefore uses HTTPS responses and exact asset hashes. The UI screenshots are from the matching local build. This does not claim a production administrator sign-in, physical-device testing, real mail delivery or real AI calls.

The private release package and deployment script are retained under `/var/backups/luli/experience-release-20261101-2c0b7ef`. To roll back, atomically relink `/opt/luli/current` to `65498f4` and restart `luli.service`; no database rollback is needed for this release.
