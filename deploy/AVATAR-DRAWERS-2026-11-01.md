# Personal avatars and contextual drawers

Live source release: `81bfd97` at `https://resume.jimmyzhang.xyz/`.
The active symlink is `/opt/luli/current -> /opt/luli/releases/81bfd97`.
The previous compatible release is `/opt/luli/releases/2c0b7ef`.

## Product changes

- Account opens in a right-edge panel, preserving the mounted workspace and
  unsaved forms. Phones use the available width; very narrow screens separate
  the logout action from the name. Closing restores the opener. Pending avatar
  adjustments and underlying workspace changes have independent inline guards.
- Personal avatars support local crop, keyboard/pointer positioning, zoom,
  replacement and removal. Only a 192px PNG crop is submitted after Save.
  The authenticated account owns the database update; dimensions, encoded size,
  CRCs and bounded pixel decompression are checked, and metadata is stripped.
  Existing `user.image` stores the result. No schema or dependency change.
- Mobile resume navigation uses a left drawer up to 320px, leaving at least
  64px of the current page visible. Dismiss via the close action, exposed page
  area or Escape. Search, document menus and short-screen scrolling remain
  available; the covered workspace remains mounted and temporarily inert.

## Verification

- Local automated suite: 87 passed; production build passed.
- Browser checks with fictional local accounts and a synthetic gradient image:
  upload, crop/zoom, unsaved-crop prompt, save, refresh persistence, removal,
  sidebar update and keyboard focus return; underlying form draft retention
  and logout protection; mobile account/navigation transitions; search Escape,
  outside dismissal and document rename entry.
- Light/dark appearances and representative 1280x800, 986x604, 390x844,
  320x568 and 320x420 viewports were inspected. No horizontal overflow in
  inspected mobile states; the final browser error log was empty. This is
  browser viewport verification, not a physical-device claim.
- On-server checks as the unprivileged `luli` user: code/asset readability and
  21 avatar, navigation, document, formatting and experience tests passed.
- A successful database backup preceded the atomic symlink switch. Only
  `luli.service` was restarted; health and served index matched the release.
- Public HTTPS index and its entry JS/CSS matched local SHA-256 hashes.
  Health returned production/cloud enabled. Anonymous admin and avatar writes
  were rejected with HTTP 401. No production avatar or private workspace was
  read or changed for verification. SMTP remains intentionally unconfigured.

Private verification artifacts and the uploaded archive are in
`/var/backups/luli/avatar-panel-20261101-81bfd97`. Local screenshots and
verification output are under `.data/avatar-panel-20261101/`, excluded from Git.
The uploaded archive SHA-256 is
`d56f0b5bf04f446f866377f14b25b66dcb127fe33343da3961027d088f7dbde9`.

## Rollback

Atomically relink `/opt/luli/current` to `/opt/luli/releases/2c0b7ef` and
restart only `luli.service`. No database rollback is needed: older code ignores
the existing image field. Keep all releases, backups and configuration intact.
Before any future activation, verify release and dist parent traversal plus
asset readability as `luli`; the private upload directory remains mode 0700.
