#!/usr/bin/env bash
set -Eeuo pipefail

namespace="${PAIRWISE_NAMESPACE:-web-services}"
database="${PAIRWISE_DATABASE:-pairwise}"
user="${PAIRWISE_DATABASE_USER:-postgres}"

if [[ $# -ne 1 ]]; then
  printf 'Usage: %s /path/to/pairwise_TIMESTAMP.dump\n' "$0" >&2
  exit 2
fi

backup_file="$1"
checksum_file="${backup_file}.sha256"

[[ -s "$backup_file" ]] || {
  printf 'Backup is missing or empty: %s\n' "$backup_file" >&2
  exit 1
}

if [[ -f "$checksum_file" ]]; then
  expected_checksum="$(cut -d ' ' -f 1 "$checksum_file")"
  actual_checksum="$(shasum -a 256 "$backup_file" | cut -d ' ' -f 1)"
  [[ "$actual_checksum" == "$expected_checksum" ]] || {
    printf 'Backup checksum verification failed.\n' >&2
    exit 1
  }
fi

printf 'This replaces all data in PostgreSQL database %q in namespace %q.\n' \
  "$database" "$namespace" >&2
printf 'Type RESTORE-%s to continue: ' "$database" >&2
read -r confirmation
[[ "$confirmation" == "RESTORE-$database" ]] || {
  printf 'Restore cancelled.\n' >&2
  exit 1
}

pod="$(kubectl -n "$namespace" get pod -l app=pairwise-db \
  -o jsonpath='{.items[0].metadata.name}')"
remote_backup="/tmp/$(basename "$backup_file")"

kubectl -n "$namespace" cp "$backup_file" "$pod:$remote_backup"
kubectl -n "$namespace" exec "$pod" -- \
  pg_restore \
    --username="$user" \
    --dbname="$database" \
    --clean \
    --if-exists \
    --no-owner \
    --single-transaction \
    "$remote_backup"
kubectl -n "$namespace" exec "$pod" -- rm -f "$remote_backup"

printf 'Restore completed. Run application smoke tests before resuming writes.\n'
