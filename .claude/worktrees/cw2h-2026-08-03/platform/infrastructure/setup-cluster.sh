#!/usr/bin/env bash
set -euo pipefail

SERVER_IP="89.167.29.39"
SSH_KEY="$HOME/.ssh/hetzner_server"
CLUSTER_NAME="hetzner-web-cluster"
LOCAL_KUBECONFIG="$HOME/.kube/config-hetzner"

echo "===> 1. Connecting to Hetzner server ($SERVER_IP) to install/verify K3s..."

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "root@$SERVER_IP" << 'EOF'
if command -v k3s &> /dev/null; then
    echo "K3s is already installed on the server."
else
    echo "Installing K3s on Hetzner server..."
    curl -sfL https://get.k3s.io | sh -s - --tls-san 89.167.29.39
fi
systemctl status k3s --no-pager | head -n 10
EOF

echo "===> 2. Fetching kubeconfig to local machine..."
mkdir -p "$HOME/.kube"

# Fetch k3s.yaml and update server IP
ssh -i "$SSH_KEY" "root@$SERVER_IP" "cat /etc/rancher/k3s/k3s.yaml" | \
    sed "s/127.0.0.1/$SERVER_IP/g" | \
    sed "s/default/$CLUSTER_NAME/g" > "$LOCAL_KUBECONFIG"

chmod 600 "$LOCAL_KUBECONFIG"

# Update main kubeconfig or export KUBECONFIG
if [ -f "$HOME/.kube/config" ]; then
    cp "$HOME/.kube/config" "$HOME/.kube/config.bak.$(date +%s)"
    KUBECONFIG="$HOME/.kube/config:$LOCAL_KUBECONFIG" kubectl config view --flatten > "$HOME/.kube/config.tmp"
    mv "$HOME/.kube/config.tmp" "$HOME/.kube/config"
else
    cp "$LOCAL_KUBECONFIG" "$HOME/.kube/config"
fi

kubectl config use-context "$CLUSTER_NAME"

echo "===> 3. Testing kubectl cluster access..."
kubectl get nodes -o wide

echo "===> Cluster setup completed successfully!"
