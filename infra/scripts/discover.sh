#!/usr/bin/env bash
# Read-only inventory dump. Needs HCLOUD_TOKEN and the hcloud CLI.
# Prints IDs this stack still has as empty variables (firewall, volume).
set -euo pipefail

if ! command -v hcloud >/dev/null 2>&1; then
  echo "install hcloud CLI: https://github.com/hetznercloud/cli" >&2
  exit 1
fi

if [[ -z "${HCLOUD_TOKEN:-}" ]]; then
  echo "export HCLOUD_TOKEN first (Hetzner Cloud API token, Read permission is enough here)" >&2
  exit 1
fi

echo "== servers =="
hcloud server list -o columns=id,name,status,ipv4,type,location

echo
echo "== expected =="
echo "control-plane 163417666 ubuntu-24gb-hel1-1 cpx52"
echo "agent         163580094 ubuntu-4gb-hel1-1  cpx22"

echo
echo "== firewalls =="
hcloud firewall list -o columns=id,name

echo
echo "== volumes =="
hcloud volume list -o columns=id,name,size,server,location

echo
echo "== placement groups =="
hcloud placement-group list -o columns=id,name,type,servers

echo
echo "== networks =="
hcloud network list -o columns=id,name,ip_range || true

echo
echo "Copy the k3s-cluster-firewall id into TF_VAR_firewall_id"
echo "Copy the 100G volume id attached to ubuntu-24gb-hel1-1 into TF_VAR_volume_id"
