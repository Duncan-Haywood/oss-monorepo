#!/usr/bin/env bash
# Idempotent k3s *server* install for ubuntu-24gb-hel1-1 (cpx52).
# Run once over SSH from a laptop you control. Do not run from an agent Job.
set -euo pipefail

K3S_CHANNEL="${K3S_CHANNEL:-stable}"
ADVERTISE_IP="${ADVERTISE_IP:-10.10.0.10}"
PUBLIC_IP="${PUBLIC_IP:-89.167.29.39}"
VOLUME_MOUNT="${VOLUME_MOUNT:-/var/lib/rancher}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "run as root (sudo $0)" >&2
  exit 1
fi

if command -v k3s >/dev/null 2>&1 && [[ -f /etc/rancher/k3s/k3s.yaml ]]; then
  echo "k3s already installed; refusing to overwrite. Node token:"
  cat /var/lib/rancher/k3s/server/node-token
  exit 0
fi

# Prefer the already-attached 100G volume for k3s state if it is mounted
# somewhere Hetzner automounted it.
if ! mountpoint -q "$VOLUME_MOUNT"; then
  hc_vol="$(find /mnt -maxdepth 1 -type d -name 'HC_Volume_*' 2>/dev/null | head -n 1 || true)"
  if [[ -n "$hc_vol" && -d "$hc_vol" ]]; then
    mkdir -p "$VOLUME_MOUNT"
    if ! mountpoint -q "$hc_vol"; then
      echo "found $hc_vol but it is not a mountpoint; leaving k3s on the local disk"
    else
      # Bind the automounted volume over the k3s data dir before install.
      mkdir -p "$VOLUME_MOUNT"
      mount --bind "$hc_vol" "$VOLUME_MOUNT"
      echo "$hc_vol $VOLUME_MOUNT none bind 0 0" >> /etc/fstab
    fi
  fi
fi

curl -sfL https://get.k3s.io | INSTALL_K3S_CHANNEL="$K3S_CHANNEL" sh -s - \
  --disable traefik \
  --write-kubeconfig-mode 644 \
  --tls-san "$ADVERTISE_IP" \
  --tls-san "$PUBLIC_IP" \
  --tls-san 127.0.0.1 \
  --node-ip "$ADVERTISE_IP" \
  --advertise-address "$ADVERTISE_IP" \
  --node-label "hcloud/node-role=control-plane" \
  --node-label "hcloud/instance=ubuntu-24gb-hel1-1"

# Wait until the API answers. advertise-address may fail if the private
# NIC is not up yet — fall back to the public IP once, then stop.
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
if ! kubectl wait --for=condition=Ready node --all --timeout=180s; then
  echo "k3s API not ready. If this host has no 10.10.0.10 yet, attach the" >&2
  echo "private network (tofu apply) and re-run, or set ADVERTISE_IP=$PUBLIC_IP" >&2
  exit 1
fi

echo "k3s server is up. Agent join token:"
cat /var/lib/rancher/k3s/server/node-token
echo
echo "Next: on ubuntu-4gb-hel1-1 run install-k3s-agent.sh with this token"
echo "and SERVER_URL=https://${ADVERTISE_IP}:6443"
