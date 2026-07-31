#!/usr/bin/env bash
set -Eeuo pipefail

: "${IMAGE_DIGEST:?IMAGE_DIGEST is required}"
: "${RELEASE_REVISION:?RELEASE_REVISION is required}"

[[ "$IMAGE_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || {
  printf 'Invalid OCI digest: %s\n' "$IMAGE_DIGEST" >&2
  exit 1
}
[[ "$RELEASE_REVISION" =~ ^[0-9a-f]{40}$ ]] || {
  printf 'Invalid Git revision: %s\n' "$RELEASE_REVISION" >&2
  exit 1
}

root="$(git rev-parse --show-toplevel)"
kustomization="$root/platform/k8s/apps/quick-pick-survey/kustomization.yaml"
deployment="$root/platform/k8s/apps/quick-pick-survey/deployment.yaml"

grep -Eq '^  digest: sha256:[0-9a-f]{64}$' "$kustomization"
grep -Eq '^    pairwise\.marisstella\.dev/revision: "[0-9a-f]{40}"$' "$deployment"

sed -E -i.bak \
  "s#^  digest: sha256:[0-9a-f]{64}\$#  digest: ${IMAGE_DIGEST}#" \
  "$kustomization"
sed -E -i.bak \
  "s#^    pairwise\\.marisstella\\.dev/revision: \"[0-9a-f]{40}\"\$#    pairwise.marisstella.dev/revision: \"${RELEASE_REVISION}\"#" \
  "$deployment"
rm "$kustomization.bak" "$deployment.bak"

grep -Fq "  digest: $IMAGE_DIGEST" "$kustomization"
grep -Fq "    pairwise.marisstella.dev/revision: \"$RELEASE_REVISION\"" "$deployment"

printf 'Recorded Pairwise %s at %s\n' "$RELEASE_REVISION" "$IMAGE_DIGEST"
