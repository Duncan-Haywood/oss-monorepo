#!/usr/bin/env bash
# Turn the HETZNERSSHKEY secret into a usable key file, or say exactly why not.
#
# Extracted from the `preflight` job in .github/workflows/hetzner-gitops-ci.yml
# on 2026-09-05, when the `restore` job started needing the same thing. It is a
# script rather than a second copy of the block because this classifier has
# already produced the single most consequential reading in this repository --
# `HETZNERSSHKEY holds a public key, not a private key` (run 33884253173) --
# and two copies of a classifier are two classifiers, one of which will
# eventually be the one that is wrong. CLAUDE.md records what restating a rule
# instead of importing it cost the last time.
#
# Writes the key to $1 (default ~/.ssh/id_hetzner), chmod 600, and prints what
# it had to normalize. Exits non-zero with a specific message on bad material.
#
#   HETZNERSSHKEY="$SECRET" bootstrap/scripts/load-ssh-key.sh [path]
set -euo pipefail

KEY_PATH="${1:-${HOME}/.ssh/id_hetzner}"
KEY="${HETZNERSSHKEY:-}"

if [ -z "${KEY}" ]; then
  echo "HETZNERSSHKEY is unset." >&2
  exit 1
fi

mkdir -p "$(dirname "${KEY_PATH}")"
printf '%s\n' "${KEY}" > "${KEY_PATH}"
chmod 600 "${KEY_PATH}"

# A malformed secret (a public key pasted by mistake, literal \n escapes from a
# JSON paste, or CRLF line endings) used to fail here with a bare, unhelpful
# ssh-keygen error. Classify the format first and normalize escaped newlines,
# so a bad rotation of HETZNERSSHKEY says exactly what is wrong instead of just
# "invalid format".
#
# printf above always appends one trailing real newline, so a secret pasted as
# a single JSON-escaped line still shows one newline here. More than that means
# it already has real line breaks and escaping it further would corrupt a valid
# key.
if grep -qF '\n' "${KEY_PATH}" && [ "$(grep -c '' "${KEY_PATH}")" -le 1 ]; then
  sed -i 's/\\r\\n/\n/g; s/\\n/\n/g' "${KEY_PATH}"
  # printf, not echo: the message is about a literal backslash-n and echo's
  # handling of that is shell-dependent. (This block was never shellchecked
  # while it lived inline in the workflow YAML.)
  printf 'normalized literal \\n escapes in the secret\n'
fi

# Real CR bytes are the other half of the case the comment above names. A key
# pasted from a Windows editor arrives with genuine CRLF endings, never reaches
# the escape branch (its \r is a byte, not the two characters that branch greps
# for), and ssh-keygen rejects it with the same unhelpful error this block
# replaces.
CR="$(printf '\r')"
if grep -q "${CR}" "${KEY_PATH}"; then
  sed -i "s/${CR}\$//" "${KEY_PATH}"
  echo "normalized CRLF line endings in the secret"
fi

# Normalization above fixes formatting; it cannot fix wrong key material.
# Classify what's left before ssh-keygen's bare error.
if grep -Eq "^ssh-(ed25519|rsa)|ecdsa-sha2" "${KEY_PATH}"; then
  echo "HETZNERSSHKEY holds a public key, not a private key." >&2
  echo "A public key cannot open an SSH session — store the matching private key instead." >&2
  exit 1
fi

if ! grep -q "BEGIN .*PRIVATE KEY" "${KEY_PATH}"; then
  echo "HETZNERSSHKEY is not an OpenSSH/PEM private key after normalization." >&2
  exit 1
fi

ssh-keygen -y -f "${KEY_PATH}" >/dev/null
echo "HETZNERSSHKEY loaded into ${KEY_PATH}"
