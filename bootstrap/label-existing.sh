#!/usr/bin/env bash
# If k3s is already running on the cpx52, apply the labels GitOps expects
# instead of re-installing.
set -euo pipefail

export KUBECONFIG="${KUBECONFIG:-/etc/rancher/k3s/k3s.yaml}"

if [[ ! -f "$KUBECONFIG" ]]; then
  echo "no kubeconfig at $KUBECONFIG — this is for an existing cluster" >&2
  exit 1
fi

kubectl label node ubuntu-24gb-hel1-1 \
  hcloud/node-role=control-plane \
  hcloud/instance=ubuntu-24gb-hel1-1 \
  --overwrite

echo "labeled control-plane node. Agent join still needs K3S_TOKEN from"
echo "  /var/lib/rancher/k3s/server/node-token"
echo "and SERVER_URL=https://10.42.0.10:6443 (or https://89.167.29.39:6443)."
