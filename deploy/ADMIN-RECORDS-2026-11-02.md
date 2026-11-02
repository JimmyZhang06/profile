# Compact administration records

Live source release: `a5a0d57` at `https://resume.jimmyzhang.xyz/admin`.
Active: `/opt/luli/releases/a5a0d57`; previous: `/opt/luli/releases/f3bacd0`.

Phone template, user and invitation records now use one flat list item per
record, with quiet dividers instead of multi-field cards. Template names,
version/status and the preview entry sit together, with a short description
below. Template and user rows open their respective detail when clicked or
activated with the keyboard. Invitation revocation stays a separate explicit
button. Complete emails and long names wrap; desktop keeps its existing tables.
The accepted top navigation, native status-bar presentation and safe-area frame
remain unchanged.

The release is based on the repository's committed `0542e80` model-service
configuration work. That functionality is preserved, including administrator
MFA, revision checks, destination restrictions and audit records. No production
model policy, mail configuration or private user data was changed during review.

Validation:

- Production build and 99 existing local tests passed.
- Real components with fictional local metadata at 390x844 and 320x568:
  template records measured 73.8px each, versus about 163px in the prior release.
  The narrow-screen long email remained complete in a 94.6px record; the outer
  document stayed exactly 320x568 with no horizontal overflow.
- Enter opens the correct template; user search and row activation open the
  matching user. Cancelling a dirty-template departure preserves its draft.
  Invitation rows are non-interactive containers with one explicit revoke button.
- Light/dark appearances checked. At 1440x900, desktop tables were restored
  without mobile rows or document overflow. These are responsive browser checks,
  not physical-device or production-admin interaction tests.
- 41 server tests passed, including the managed-domain security suite. Lockfile
  and database schema match the prior release. Database backup succeeded before
  atomic activation; only `luli.service` restarted.
- Public HTTPS verification matched home/admin HTML, all six JS/CSS hashes,
  five icons and manifest metadata. Missing icons return 404; anonymous admin
  requests return 401; production health is valid.

Local evidence: `.data/admin-records-20261102/` (excluded from Git), including
`templates-compact-light.png`, `templates-compact-dark.png` and
`public-verification.json`. The read-only fictional fixture was not deployed.
Private server artifacts: `/var/backups/luli/admin-records-20261102-a5a0d57`.
Archive SHA-256: `7b8c45385072cc282880adfbcf074a8a74dc861f9155e9e734b52af3fd7f4e2c`.

Code rollback: atomically relink `/opt/luli/current` to
`/opt/luli/releases/f3bacd0` and restart only `luli.service`. No schema migration
or deployment configuration change was needed.
