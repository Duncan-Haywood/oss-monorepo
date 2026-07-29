#!/usr/bin/env bash
set -euo pipefail

SERVER_IP="89.167.29.39"
SSH_KEY="$HOME/.ssh/hetzner_server"
BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOCAL_BACKUP_DIR="${PAIRWISE_LOCAL_BACKUP_DIR:-.backups/pairwise}"

echo "===> 1. Backing up K3s datastore & persistent volumes on Hetzner server ($SERVER_IP)..."
ssh -i "$SSH_KEY" "root@$SERVER_IP" << EOF
mkdir -p /var/backups/k3s
tar -czf /var/backups/k3s/k3s_data_backup_${BACKUP_TIMESTAMP}.tar.gz \
    /var/lib/rancher/k3s/server/db \
    /var/lib/rancher/k3s/storage 2>/dev/null || true

echo "Backup size:"
ls -lh /var/backups/k3s/k3s_data_backup_${BACKUP_TIMESTAMP}.tar.gz

# Retain last 14 backups (7 days @ 12-hour interval)
find /var/backups/k3s -name "k3s_data_backup_*.tar.gz" -mtime +7 -delete

mkdir -p /var/backups/pairwise
chmod 700 /var/backups/pairwise
pairwise_pod=\$(kubectl -n web-services get pod -l app=pairwise-db \
    -o jsonpath='{.items[0].metadata.name}')
kubectl -n web-services exec "\$pairwise_pod" -- \
    pg_dump -U postgres -d pairwise --format=custom --compress=9 \
    > /var/backups/pairwise/pairwise_${BACKUP_TIMESTAMP}.dump
test -s /var/backups/pairwise/pairwise_${BACKUP_TIMESTAMP}.dump
sha256sum /var/backups/pairwise/pairwise_${BACKUP_TIMESTAMP}.dump \
    > /var/backups/pairwise/pairwise_${BACKUP_TIMESTAMP}.dump.sha256
find /var/backups/pairwise -name "pairwise_*.dump" -mtime +30 -delete
find /var/backups/pairwise -name "pairwise_*.dump.sha256" -mtime +30 -delete
EOF

echo "===> 2. Copying the logical Pairwise backup off the server..."
mkdir -p "$LOCAL_BACKUP_DIR"
chmod 700 "$LOCAL_BACKUP_DIR"
scp -i "$SSH_KEY" \
    "root@$SERVER_IP:/var/backups/pairwise/pairwise_${BACKUP_TIMESTAMP}.dump"* \
    "$LOCAL_BACKUP_DIR/"
expected_checksum="$(cut -d ' ' -f 1 "$LOCAL_BACKUP_DIR/pairwise_${BACKUP_TIMESTAMP}.dump.sha256")"
actual_checksum="$(shasum -a 256 "$LOCAL_BACKUP_DIR/pairwise_${BACKUP_TIMESTAMP}.dump" | cut -d ' ' -f 1)"
[[ "$actual_checksum" == "$expected_checksum" ]] || {
    echo "Logical backup checksum verification failed." >&2
    exit 1
}
find "$LOCAL_BACKUP_DIR" -name "pairwise_*.dump" -mtime +90 -delete
find "$LOCAL_BACKUP_DIR" -name "pairwise_*.dump.sha256" -mtime +90 -delete

echo "===> 3. Backing up local Terraform state..."
mkdir -p platform/terraform/backups
if [ -f platform/terraform/terraform.tfstate ]; then
    cp platform/terraform/terraform.tfstate "platform/terraform/backups/terraform.tfstate.${BACKUP_TIMESTAMP}"
    echo "Terraform state backed up to platform/terraform/backups/terraform.tfstate.${BACKUP_TIMESTAMP}"
fi

echo "===> 4. Setting up automated 12-hour cron backup on server..."
ssh -i "$SSH_KEY" "root@$SERVER_IP" << 'EOF'
install -m 0750 /dev/stdin /usr/local/sbin/backup-pairwise-db <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
backup_dir=/var/backups/pairwise
timestamp=$(date +%Y%m%d_%H%M%S)
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
pod=$(kubectl -n web-services get pod -l app=pairwise-db \
  -o jsonpath='{.items[0].metadata.name}')
temporary="$backup_dir/.pairwise_${timestamp}.dump.tmp"
output="$backup_dir/pairwise_${timestamp}.dump"
kubectl -n web-services exec "$pod" -- \
  pg_dump -U postgres -d pairwise --format=custom --compress=9 > "$temporary"
test -s "$temporary"
mv "$temporary" "$output"
sha256sum "$output" > "$output.sha256"
find "$backup_dir" -name 'pairwise_*.dump' -mtime +30 -delete
find "$backup_dir" -name 'pairwise_*.dump.sha256' -mtime +30 -delete
SCRIPT

(crontab -l 2>/dev/null | grep -vE "k3s_data_backup|backup-pairwise-db" ; \
 echo "0 */12 * * * tar -czf /var/backups/k3s/k3s_data_backup_\$(date +\%Y\%m\%d_\%H\%M\%S).tar.gz /var/lib/rancher/k3s/server/db /var/lib/rancher/k3s/storage 2>/dev/null; find /var/backups/k3s -name 'k3s_data_backup_*.tar.gz' -mtime +7 -delete"; \
 echo "15 */6 * * * /usr/local/sbin/backup-pairwise-db") | crontab -
crontab -l | tail -n 2
EOF

echo "===> Data backup completed & cron schedule installed successfully!"
