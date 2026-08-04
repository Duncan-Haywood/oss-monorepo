#!/usr/bin/env bash
set -Eeuo pipefail

backup_dir="${PAIRWISE_BACKUP_DIR:-/var/backups/pairwise}"
namespace="${PAIRWISE_NAMESPACE:-web-services}"
timestamp="$(date +%Y%m%d_%H%M%S)"

mkdir -p "$backup_dir"
chmod 700 "$backup_dir"

pod="$(kubectl -n "$namespace" get pod -l app=pairwise-db \
  -o jsonpath='{.items[0].metadata.name}')"
temporary="$backup_dir/.pairwise_${timestamp}.dump.tmp"
output="$backup_dir/pairwise_${timestamp}.dump"

cleanup() {
  rm -f "$temporary"
}
trap cleanup EXIT

kubectl -n "$namespace" exec "$pod" -- \
  pg_dump -U postgres -d pairwise --format=custom --compress=9 > "$temporary"
test -s "$temporary"
mv "$temporary" "$output"
sha256sum "$output" > "$output.sha256"

find "$backup_dir" -name 'pairwise_*.dump' -mtime +30 -delete
find "$backup_dir" -name 'pairwise_*.dump.sha256' -mtime +30 -delete
