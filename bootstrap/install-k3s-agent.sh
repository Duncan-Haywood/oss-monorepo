#!/usr/bin/env bash
# Idempotent k3s *agent* install for ubuntu-4gb-hel1-1 (cpx22).
# Tainted dedicated=agents:NoSchedule so prod never lands here.
set -euo pipefail

K3S_CHANNEL="${K3S_CHANNEL:-stable}"
SERVER_URL="${SERVER_URL:-https://10.10.0.10:6443}"
NODE_IP="${NODE_IP:-10.10.0.11}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "run as root (sudo $0)" >&2
  exit 1
fi

if [[ -z "${K3S_TOKEN:-}" ]]; then
  echo "K3S_TOKEN is required (contents of the server's node-token file)" >&2
  exit 1
fi

if command -v k3s >/dev/null 2>&1 && systemctl is-active --quiet k3s-agent; then
  echo "k3s-agent already running; nothing to do"
  exit 0
fi

curl -sfL https://get.k3s.io | INSTALL_K3S_CHANNEL="$K3S_CHANNEL" K3S_URL="$SERVER_URL" K3S_TOKEN="$K3S_TOKEN" sh -s - \
  --node-ip "$NODE_IP" \
  --node-label "hcloud/node-role=agents" \
  --node-label "hcloud/instance=ubuntu-4gb-hel1-1" \
  --node-taint "dedicated=agents:NoSchedule"

echo "k3s-agent installed. Confirm from the server: kubectl get nodes -o wide"
