# Alibaba Cloud deployment

The deployment uses the server's existing Apache reverse proxy, a separate
unprivileged `luli` systemd service and release directories under `/opt/luli`.
Only Apache listens publicly. Node binds to `127.0.0.1:4180`.

The latest product release is recorded in
[WEBAPP-ICONS-2026-11-01.md](WEBAPP-ICONS-2026-11-01.md), including Home Screen
icons, web app metadata, validation and rollback.
Personal avatars and contextual drawers are recorded in
[AVATAR-DRAWERS-2026-11-01.md](AVATAR-DRAWERS-2026-11-01.md).
Earlier complete-experience and chapter refinements are recorded in
[EXPERIENCE-2026-11-01.md](EXPERIENCE-2026-11-01.md).

## Release preparation

Build and test in `prototype/`. A release contains the repository source plus
`prototype/dist/client/`. Never transfer development `.data`, `.env`, PEM files
or browser backups. Keep the release's Git commit ID as its directory name.

The browser-only release (`CLOUD_ENABLED=false`) runs with Node.js 24 and no
runtime npm dependencies. Cloud mode additionally requires `npm ci --omit=dev`
in `prototype/` and every production setting in `prototype/.env.example`.

## Service installation

1. Create a system user `luli` with no shell; use `/var/lib/luli` for app state.
2. Extract each release under `/opt/luli/releases/<commit>` with root ownership.
3. Link `/opt/luli/current` to that release. Keep prior releases for rollback.
4. Install `luli.service` under `/etc/systemd/system/`; set deployment environment
   in `/etc/luli/luli.env`, readable only by root. systemd reads it before dropping
   privileges to `luli`.
5. Run `systemctl daemon-reload` and `systemctl enable --now luli`.
6. Verify `curl --fail http://127.0.0.1:4180/api/cloud/health`.

Create public release directories with explicit mode 0755. A private deployment
umask may otherwise leave the release root or an implicitly created `dist`
parent at mode 0700, which blocks the `luli` service account. Before switching
the symlink, run the entry-point check and read all built assets as `luli`.
Keep `/etc/luli` configuration and `/var/backups/luli` private; code readability
does not require changing their permissions.

## Domain and TLS

Create DNS A record `resume` pointing to the selected server. Create webroot
`/var/www/luli-acme` and log directory `/var/log/luli`. Install the HTTP vhost in
the existing Apache vhost include directory; validate `httpd -t` before a graceful
reload. Do not replace another site's configuration or bind another web server
to ports 80/443.

Use Certbot's webroot method for `resume.jimmyzhang.xyz`, then install the HTTPS
vhost and validate before reload. Enable automated certificate renewal with a
deploy hook that validates and gracefully reloads Apache. Test renewal once.
Keep any existing certificate automation intact.

The initial server installation reuses the already-installed Certbot executable
at `/opt/veya/acme-venv/bin/certbot`, but uses entirely separate configuration,
work and log directories (`/etc/luli/acme`, `/var/lib/luli-acme`,
`/var/log/luli/acme`). Install `luli-cert-renew.service` and its timer, and the
`reload-apache.sh` hook at `/etc/luli/reload-apache.sh` with mode 0755. Enable
the timer after a successful webroot issuance.

The custom hostname `resume.jimmyzhang.xyz` is active as of 2026-10-31, with its
own certificate and HTTPS vhost. `APP_ORIGIN` now uses that hostname. The earlier
preview `resume-47-93-237-199.sslip.io` retains its separate vhost and certificate
so existing browser-local workspaces can still be exported. Do not redirect the
preview away before users can export their data. Both certificates are covered
by the existing renewal timer.

Browser storage is origin-specific: export a workspace backup from the preview
before moving to the custom domain, then import it there. No automatic
cross-origin transfer or cloud upload is performed. Deployment verification is
recorded in `DOMAIN-2026-10-31.md`.

For a manual renewal rehearsal, pass `--no-random-sleep-on-renew` together with
`--dry-run --run-deploy-hooks` and the installation's config/work/log directory
arguments. Otherwise Certbot's non-interactive random delay may exceed a short
manual validation timeout. The custom hostname passed this complete rehearsal
on 2026-10-31; ordinary scheduled renewal retains its normal jitter.

## Cloud service and first administrator

The custom domain runs cloud mode with a dedicated PostgreSQL database,
deployment administrator email, authentication secret and 32-byte credential
encryption key in `/etc/luli/luli.env` (root, mode 0600). SMTP is optional at
startup and can be managed under **管理后台 → 邮件服务**. Until SMTP is enabled,
public email login returns `MAIL_NOT_CONFIGURED`; there is no public development
mailbox. Empty model host allowlists reject all external calls.

From the active release's `prototype/` directory, issue a one-time setup file:

```sh
node --env-file=/etc/luli/luli.env scripts/create-admin-setup.mjs /etc/luli/admin-setup.txt
```

Deliver this file privately. The owner enters their own password at `/admin`,
then binds an authenticator and stores recovery codes. No real administrator
credentials are created during automated verification. Setup expires after
24 hours and is single-use; rerunning issuance before initialization invalidates
the preceding code. Once an administrator exists, issuance is blocked.

The old preview runs `luli-preview.service` on `127.0.0.1:4181`, with
`/opt/luli/preview` pinned to the previous browser-only release. Its Apache vhost
proxies to 4181; only the custom hostname reaches the cloud process on 4180.

## PostgreSQL and backup

PostgreSQL 17.11 runs in the dedicated `luli-postgres` container, with 384 MiB
memory, 64 MiB shared buffers, 40 connections and a private Docker network.
The official Docker image is mirrored by its publisher on ECR:
`public.ecr.aws/docker/library/postgres:17.11-bookworm`, pinned to manifest digest
`sha256:839fbb5a4942a7758dd93e18b42ea5649807491a0545b5eeeb8f0b8bb11857a5`.

Bind `/var/lib/luli-postgres/data` directly to `/var/lib/postgresql/data`;
PostgreSQL 17 declares that exact volume, so mounting only its parent would
create an unintended anonymous data volume. The data directory is owned by UID
999 and mode 0700. Publish port 5432 on **127.0.0.1 only**, use SCRAM credentials,
and mount `/etc/luli/postgres-password` read-only at
`/run/secrets/postgres-password` through `POSTGRES_PASSWORD_FILE`.

The application role `luli` owns only database `luli` and has no superuser,
role-creation or database-creation privileges. Isolated QA uses `luli_qa` and a
separate `luli_test_admin` database. Never run destructive tests against `luli`.

Install `backup-database.sh` at `/etc/luli/backup-database.sh` (0755), create
`/var/backups/luli` (root, 0700), and enable `luli-db-backup.timer`. It creates
daily custom-format dumps and validates their archive lists. Files are retained
in that dedicated private directory; copy them to independent storage according
to the owner's backup policy. Back up `/etc/luli` separately with equal access
controls: the database dump alone does not include credential-encryption keys.

For a manual backup, run `systemctl start luli-db-backup.service`. Validate
restoration in a new `luli_test_...` database with `pg_restore --no-owner
--no-privileges`; never restore over the live database as a verification step.

Back up the database before upgrades. Reverting a code symlink does not undo a
database migration. Validate login, account isolation, sync and recovery before
inviting users. See `prototype/CLOUD.md` for proxy/rate-limit considerations.

## Rollback and checks

Relink `/opt/luli/current` to the prior validated release and restart only `luli`.
Do not delete old releases, database volumes or other services during deployment.
Check the HTTPS page, hashed assets, `/api/cloud/health`, the administrator setup
status, unavailable email login before SMTP, unauthorized admin API rejection,
no private-file access, theme switching and browser-local saving.

Cloud activation and verification are recorded in [CLOUD-2026-10-31.md](CLOUD-2026-10-31.md).
