#!/usr/bin/env bash
set -euo pipefail

SERVER_IP="89.167.29.39"
SSH_KEY="$HOME/.ssh/hetzner_server"
BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)

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
EOF

echo "===> 2. Backing up local Terraform state..."
mkdir -p platform/terraform/backups
if [ -f platform/terraform/terraform.tfstate ]; then
    cp platform/terraform/terraform.tfstate "platform/terraform/backups/terraform.tfstate.${BACKUP_TIMESTAMP}"
    echo "Terraform state backed up to platform/terraform/backups/terraform.tfstate.${BACKUP_TIMESTAMP}"
fi

echo "===> 3. Setting up automated 12-hour cron backup on server..."
ssh -i "$SSH_KEY" "root@$SERVER_IP" << 'EOF'
(crontab -l 2>/dev/null | grep -v "k3s_data_backup" ; echo "0 */12 * * * tar -czf /var/backups/k3s/k3s_data_backup_\$(date +\%Y\%m\%d_\%H\%M\%S).tar.gz /var/lib/rancher/k3s/server/db /var/lib/rancher/k3s/storage 2>/dev/null; find /var/backups/k3s -name 'k3s_data_backup_*.tar.gz' -mtime +7 -delete") | crontab -
crontab -l | tail -n 2
EOF

echo "===> Data backup completed & cron schedule installed successfully!"
