#!/usr/bin/env bash
# Generate an age keypair on YOUR laptop. Keep the private key offline.
# Commit only the public key (into .sops.yaml). An agent must not be the
# only holder of the private key.
set -euo pipefail

if ! command -v age-keygen >/dev/null 2>&1; then
  echo "install age: https://github.com/FiloSottile/age" >&2
  exit 1
fi

OUT="${1:-$HOME/.config/sops/age/keys.txt}"
mkdir -p "$(dirname "$OUT")"
if [[ -f "$OUT" ]]; then
  echo "refusing to overwrite $OUT" >&2
  exit 1
fi

age-keygen -o "$OUT"
chmod 600 "$OUT"
echo
echo "Private key is at $OUT — back it up offline. Put the public age1... line in .sops.yaml."
echo "Do not copy the private key onto the Hetzner boxes or into an agent Secret."
