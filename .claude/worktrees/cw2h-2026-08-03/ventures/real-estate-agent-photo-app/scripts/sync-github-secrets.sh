#!/usr/bin/env bash
set -euo pipefail

# Sync Cloudflare runtime credentials to GitHub repository secrets.
#
# Requires a GitHub token with permission to manage Actions secrets
# (classic: repo scope; fine-grained: Administration + Secrets write).
#
# Usage:
#   export GITHUB_TOKEN=ghp_...   # admin-capable PAT
#   ./scripts/sync-github-secrets.sh
#
# Runtime secret names use hyphens; always read them with printenv.

REPO="${GITHUB_REPOSITORY:-Duncan-Haywood/real-estate-agent-photo-app}"

CF_TOKEN=$(printenv 'cloudflare-api-token' || true)
CF_ACCOUNT=$(printenv 'cloudflare-account-id' || true)

if [ -z "${CF_TOKEN}" ] || [ -z "${CF_ACCOUNT}" ]; then
  echo "Missing Cloudflare runtime secrets (cloudflare-api-token, cloudflare-account-id)." >&2
  exit 1
fi

if [ -z "${GITHUB_TOKEN:-}" ] && [ -z "${GH_TOKEN:-}" ]; then
  echo "Missing GITHUB_TOKEN or GH_TOKEN with secrets write permission." >&2
  echo "The Cursor GitHub app token cannot manage repository secrets." >&2
  exit 1
fi

export GH_TOKEN="${GITHUB_TOKEN:-${GH_TOKEN}}"

printf '%s' "${CF_TOKEN}" | gh secret set CLOUDFLARE_API_TOKEN --repo "${REPO}"
printf '%s' "${CF_ACCOUNT}" | gh secret set CLOUDFLARE_ACCOUNT_ID --repo "${REPO}"

echo "GitHub secrets updated for ${REPO}:"
gh secret list --repo "${REPO}"
