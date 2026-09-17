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

echo
echo "== prod workloads =="
if ssh -o BatchMode=yes -o ConnectTimeout=8 "$CP" 'test -f /etc/rancher/k3s/k3s.yaml' 2>/dev/null; then
  ssh -o BatchMode=yes "$CP" \
    'kubectl get pods -n prod -o wide 2>/dev/null || k3s kubectl get pods -n prod -o wide' \
    || echo "could not list prod pods"
else
  echo "no k3s on the box — nothing is deployed"
fi

echo
echo "== what the apex actually serves =="
# The one check no agent session can run for itself. Outbound HTTPS from a web
# session is intercepted by the agent egress proxy for every host — raw TCP to
# :443 included, which answers `403 x-deny-reason: host_not_allowed` rather
# than reaching the box. So every claim in CLAUDE.md, portfolio/DIRECTION.md
# and issue #1925 about what marisstella.dev returns is read from the manifests
# rather than from a response, and one of those claims ("nothing is live") sat
# stale for five days because nothing could contradict it.
#
# This box can see the answer. ingress-nginx runs hostNetwork:true on the
# cpx52, so it holds :80 in the host namespace, and a Host-header curl against
# loopback is the real request path minus DNS and TLS — both of which are
# already known good (all three names resolve to 89.167.29.39).
if ssh -o BatchMode=yes -o ConnectTimeout=8 "$CP" 'command -v curl >/dev/null' 2>/dev/null; then
  for host in marisstella.dev www.marisstella.dev tools.marisstella.dev; do
    answer="$(ssh -o BatchMode=yes "$CP" \
      "curl -s -o /dev/null --max-time 8 -w '%{http_code}, %{size_download} bytes' \
       -H 'Host: ${host}' http://127.0.0.1/" 2>/dev/null || echo 'no answer')"
    echo "  ${host}: ${answer}"
  done
  echo
  echo "  200 with a non-trivial body = that hostname is serving."
  echo "  404 or 503 = the Ingress matched nothing, or the pod is not up."
  echo "  Record what you saw. This is the portfolio's only ground truth about"
  echo "  its own public surface — prefer it to anything a document asserts."
else
  echo "no curl on the control-plane — cannot check what the ingress returns"
fi
