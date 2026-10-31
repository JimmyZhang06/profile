#!/bin/sh
set -eu
umask 077
backup_dir=/var/backups/luli
install -d -m 0700 "$backup_dir"
backup_path="$backup_dir/luli-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker exec luli-postgres pg_dump -U postgres -d luli --format=custom > "$backup_path.partial"
docker exec -i luli-postgres pg_restore --list < "$backup_path.partial" > /dev/null
mv "$backup_path.partial" "$backup_path"
printf 'Database backup verified: %s\n' "$backup_path"
