#!/bin/bash
# Runs on the EC2 host. Each PostgreSQL dump is transactionally consistent;
# separate databases are not a single point-in-time snapshot. Restore with the
# worker stopped, then reconcile workflow state and current provider allowances.
set -euo pipefail
umask 077
cd /opt/scoutalert
source ./host.env
: "${SCOUTALERT_BACKUP_BUCKET:?Configure the private backup bucket}"
: "${AWS_REGION:?Configure the AWS region}"

backup_dir=$(mktemp -d /opt/scoutalert/backup.XXXXXX)
trap 'rm -rf "$backup_dir"' EXIT
stamp=$(date -u +%Y-%m-%dT%H-%M-%SZ)

for database in scoutalert temporal temporal_visibility; do
  docker compose exec -T postgres pg_dump -U postgres -d "$database" -Fc > "$backup_dir/$database.dump"
  test -s "$backup_dir/$database.dump"
  docker compose exec -T postgres pg_restore --list < "$backup_dir/$database.dump" > /dev/null
done

tar -czf "$backup_dir/databases.tar.gz" -C "$backup_dir" scoutalert.dump temporal.dump temporal_visibility.dump
aws s3 cp "$backup_dir/databases.tar.gz" "s3://$SCOUTALERT_BACKUP_BUCKET/backups/$stamp/databases.tar.gz" \
  --region "$AWS_REGION" --sse AES256 --only-show-errors
printf 'Backup uploaded: %s\n' "$stamp"
