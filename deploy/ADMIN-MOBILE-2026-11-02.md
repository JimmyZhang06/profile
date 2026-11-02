# Mobile administration layout

Live source release: `f3bacd0` at `https://resume.jimmyzhang.xyz/admin`.
Active: `/opt/luli/releases/f3bacd0`; previous: `/opt/luli/releases/5bdb88f`.

The supplied phone screenshots showed clipped headings, a permanent icon rail
and user/template records with excessive vertical spacing. At widths up to
760px, administration now uses the full content width and an opaque 56px header
with page selection, appearance and workspace/account actions. Desktop keeps
its sidebar. Navigation retains the existing unsaved-form guard.

Page changes and template-detail transitions reset the admin content scroller.
Cancelled departures preserve the draft and scroll. Mobile records group the
identity/title, parallel metadata and explicit actions without redundant labels.
Email addresses remain complete and can wrap before the @ separator. Filters,
pagination, theme controls and 44px touch targets remain available.

The shared safe-area frame and web app metadata are unchanged. The user reports
that the remaining black native status bar looks better; this release preserves
that accepted presentation instead of introducing another status-bar override.

Validation completed:

- Production build and 91 local tests passed; final UI changes were rebuilt.
- The real components were exercised with fictional, read-only local admin
  metadata at 390x844 and 320x568, with synthetic 59px top/34px bottom safe areas.
  At 320px the outer document stayed exactly 320x568, the header occupied
  y=59..115, and the page heading began at y=140.5 with scroll offset 0.
- Scrolling users and switching to templates returned the content to the top.
  Template rows were approximately 163px tall at 390px. Search, page controls,
  long email wrapping, light/dark themes and menu navigation were checked.
- A modified template name survived cancelling an unsaved-form departure.
  No production account, authenticator, template or user data was modified.
- At 1440x900 the desktop sidebar and table remained visible, mobile controls
  were hidden, and there was no document overflow or browser warning/error.
- 33 server tests passed as `luli`; dependency lockfile and database schema
  matched the prior release. Database backup succeeded before atomic activation.
  Only `luli.service` restarted; the existing proxy and other sites were untouched.
- Public HTTPS checks matched exact home/admin HTML and all six JS/CSS hashes,
  including both lazy AdminApp assets. Manifest MIME/revalidation, five icons,
  missing-icon 404, anonymous-admin 401 and production health also passed.

These responsive checks do not constitute physical iPhone or production-admin
interaction testing. The temporary local metadata fixture and synthetic insets
were excluded from the source archive and deployment.

Local evidence: `.data/admin-mobile-20261102/` (excluded from Git), including
`templates-mobile-light.png` and `public-verification.json`.
Private server artifacts: `/var/backups/luli/admin-mobile-20261102-f3bacd0`.
Archive SHA-256: `bfc91911e11f7fdd098fb869e0cdd21f7bb7a3df83c51a55d488d9559c1ad01f`.

Rollback: atomically relink `/opt/luli/current` to `/opt/luli/releases/5bdb88f`
and restart only `luli.service`. No schema or deployment configuration changed.

The release was prepared in the isolated `codex/admin-mobile-layout` worktree.
Uncommitted model-service work in the primary checkout was not staged or shipped.
