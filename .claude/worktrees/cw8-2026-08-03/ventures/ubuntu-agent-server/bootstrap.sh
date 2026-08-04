#!/usr/bin/env bash
# First-run helper: points inventory.ini at the box's LAN IP (the only
# thing reachable before this playbook has installed Tailscale — see the
# "bootstrap order problem" section in README.md) and kicks off the
# provisioning run.
#
# Usage:
#   ./bootstrap.sh <lan-ip> [tailscale-authkey]
#
# Examples:
#   ./bootstrap.sh 192.168.1.42
#   ./bootstrap.sh 192.168.1.42 tskey-auth-xxxxxxxx

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <lan-ip> [tailscale-authkey]" >&2
  exit 1
fi

LAN_IP="$1"
AUTHKEY="${2:-}"

cd "$(dirname "${BASH_SOURCE[0]}")"

sed -i.bak "s/ansible_host=[^ ]*/ansible_host=${LAN_IP}/" inventory.ini
rm -f inventory.ini.bak

echo "inventory.ini now points at ${LAN_IP}"
ansible-galaxy collection install -r requirements.yml

EXTRA_VARS=()
if [[ -n "$AUTHKEY" ]]; then
  EXTRA_VARS=(-e "tailscale_authkey=${AUTHKEY}")
fi

echo "Running playbook against ${LAN_IP} — you'll be prompted for the sudo password."
ansible-playbook playbook.yml --ask-become-pass "${EXTRA_VARS[@]}"

cat <<'EOF'

Done. Next steps:
  1. If you didn't pass a tailscale-authkey, SSH in and run `sudo tailscale up` once.
  2. Once the box shows up in `tailscale status`, switch inventory.ini's
     ansible_host to its Tailscale IP/MagicDNS name for future runs.
  3. Log in to each CLI once, interactively: `claude`, `codex`, `gemini`, `opencode`.
  4. Grok Build: sign in at https://grok.com/build yourself, no automation for this one.
EOF
