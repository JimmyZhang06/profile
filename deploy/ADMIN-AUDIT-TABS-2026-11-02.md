# Audit disclosure and model tab alignment

Live source release: `e633c88` at `https://resume.jimmyzhang.xyz/admin`.
Active: `/opt/luli/releases/e633c88`; previous: `/opt/luli/releases/a5a0d57`.

Phone audit records now start collapsed, displaying the operation and timestamp.
Native disclosure controls expand each record independently to reveal the actor,
operation identifier, target and complete reason. Before/after values retain a
separate disclosure. The maintenance-import action has a readable Chinese label;
stored audit data is unchanged. Desktop audit tables remain available.

AI service tabs now explicitly center their inline-flex content. The same rule
covers the connection list, connection editor, domain tab and draft indicators.
Model forms use explicit technical field names and autocomplete-off hints;
model IDs, endpoints, domains and secrets disable automatic capitalization or
correction where appropriate. URL keyboard hints accompany address fields.
Login and personal-contact autofill behavior was not changed.

These HTML hints cannot guarantee removal of the iOS keyboard accessory bar.
Safari can ignore autocomplete-off; its AutoFill policy is user-controlled.
The website does not use fake OTP fields, readonly/focus workarounds or native
private APIs to suppress keyboard controls. Device settings were not changed.
See [Apple's Safari AutoFill guidance](https://developer.apple.com/documentation/safari-developer-tools/autofill)
and [iPhone contact AutoFill settings](https://support.apple.com/zh-cn/guide/iphone/iphccfb450b7/27/ios/27).

Validation:

- Production build passed. Real UI checks used fictional, read-only metadata.
- Audit rows started closed; Enter expanded one row without opening the other.
  Its complete reason and before/after values were readable. At 320px wide,
  expanded content produced no horizontal document overflow.
- Tab content centers matched button centers with a measured 0px offset on
  the 390px list/editor, 320px draft view and 1440px desktop view. Arrow-key
  switching retained the unsaved connection label. Light/dark audit states
  were checked; the browser reported no warnings or errors in this review.
- Technical input attributes were verified in rendered DOM. Actual iPhone
  keyboard accessory behavior and Chinese IME composition were not tested.
- 41 server tests passed, including model-domain policy checks. Database backup
  succeeded before atomic activation; only `luli.service` restarted. Schema,
  dependency lockfile and deployment configuration match the previous release.
- Public home/admin HTML, all six JS/CSS assets and five PNG hashes matched the
  build. Manifest validation, missing-icon 404, anonymous-admin 401 and
  production health checks passed.

Local evidence: `.data/admin-audit-tabs-20261102/` (excluded from Git), with
collapsed audit and centered list/editor screenshots and public verification.
The fictional fixture and synthetic safe-area insets were excluded from release.
Private server artifacts: `/var/backups/luli/admin-audit-tabs-20261102-e633c88`.
Archive SHA-256: `4dad772dffd66081c2de7ab9b18306a06a908ecdec106635e4d4571e250a7c72`.

Rollback: atomically relink `/opt/luli/current` to `/opt/luli/releases/a5a0d57`
and restart only `luli.service`. No database migration was required.
