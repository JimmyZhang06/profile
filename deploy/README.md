# Alibaba Cloud deployment

The deployment uses the server's existing Apache reverse proxy, a separate
unprivileged `luli` systemd service and release directories under `/opt/luli`.
Only Apache listens publicly. Node binds to `127.0.0.1:4180`.

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

## Cloud activation later

Configure a dedicated PostgreSQL database, real SMTP delivery, the administrator
email, authentication secret and 32-byte encryption key. Set `CLOUD_ENABLED=true`
and restart. Missing production settings fail startup; there is no automatic
fallback to development authentication or a public OTP mailbox. Do not import
development databases. Empty model host allowlists reject all external calls.

Back up the database before upgrades. Reverting a code symlink does not undo a
database migration. Validate login, account isolation, sync and recovery before
inviting users. See `prototype/CLOUD.md` for proxy/rate-limit considerations.

## Rollback and checks

Relink `/opt/luli/current` to the prior validated release and restart only `luli`.
Do not delete old releases, database volumes or other services during deployment.
Check the HTTPS page, hashed assets, `/api/cloud/health`, the account unavailable
message, no private-file access, theme switching and browser-local saving.
