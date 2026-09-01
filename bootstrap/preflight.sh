#!/usr/bin/env bash
# Read-only checks you run from a laptop that can SSH to the two boxes.
# Prints what bootstrap should do next. Never installs anything.
set -euo pipefail

CP="${CP:-root@89.167.29.39}"
AG="${AG:-root@157.180.80.188}"

ssh_ok() {
  ssh -o BatchMode=yes -o ConnectTimeout=8 "$1" 'echo ok' 2>/dev/null
}

echo "== SSH =="
if out="$(ssh_ok "$CP")"; then
  echo "control-plane $CP: $out"
else
  echo "control-plane $CP: UNREACHABLE (need the key you control)"
fi
if out="$(ssh_ok "$AG")"; then
  echo "agent         $AG: $out"
else
  echo "agent         $AG: UNREACHABLE"
fi

echo
echo "== k3s on control-plane =="
if ssh -o BatchMode=yes -o ConnectTimeout=8 "$CP" 'test -f /etc/rancher/k3s/k3s.yaml' 2>/dev/null; then
  echo "k3s kubeconfig present — do NOT re-run install-k3s-server.sh"
  ssh -o BatchMode=yes "$CP" 'kubectl get nodes -o wide || k3s kubectl get nodes -o wide' || true
  echo "Next: bootstrap/label-existing.sh, then install-k3s-agent.sh on the cpx22"
else
  echo "no /etc/rancher/k3s/k3s.yaml — empty Ubuntu, run install-k3s-server.sh after tofu apply"
fi

echo
echo "== private NIC 10.10.0.10 =="
if ssh -o BatchMode=yes -o ConnectTimeout=8 "$CP" 'ip -4 addr show | grep -q 10.10.0.10' 2>/dev/null; then
  echo "private address is up"
else
  echo "10.10.0.10 not on the box yet — tofu apply the hel1-k3s network first,"
  echo "or install k3s with ADVERTISE_IP=89.167.29.39 as a temporary bind"
fi
