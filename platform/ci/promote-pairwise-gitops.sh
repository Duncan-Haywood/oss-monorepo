#!/usr/bin/env bash
set -Eeuo pipefail

: "${IMAGE_DIGEST:?IMAGE_DIGEST is required}"
: "${IMAGE_REFERENCE:?IMAGE_REFERENCE is required}"
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

git cat-file -e "${RELEASE_REVISION}^{commit}" 2>/dev/null || {
  printf 'Git revision does not name a commit in this repository: %s\n' "$RELEASE_REVISION" >&2
  exit 1
}

expected_reference="git.marisstella.dev/giteaadmin/pairwise-app:${RELEASE_REVISION}"
[[ "$IMAGE_REFERENCE" == "$expected_reference" ]] || {
  printf 'Image reference is not the trusted immutable release tag: %s\n' "$IMAGE_REFERENCE" >&2
  exit 1
}

registry_digest="$(
  docker manifest inspect --verbose "$IMAGE_REFERENCE" |
    jq -er '
      if type == "array"
      then .[0].Descriptor.digest
      else .Descriptor.digest // .digest
      end |
      select(type == "string" and test("^sha256:[0-9a-f]{64}$"))
    '
)" || {
  printf 'Could not resolve immutable image reference: %s\n' "$IMAGE_REFERENCE" >&2
  exit 1
}
[[ "$registry_digest" == "$IMAGE_DIGEST" ]] || {
  printf 'Image provenance mismatch for %s: expected %s, registry returned %s\n' \
    "$RELEASE_REVISION" "$IMAGE_DIGEST" "$registry_digest" >&2
  exit 1
}
kustomization="$root/platform/k8s/apps/quick-pick-survey/kustomization.yaml"
deployment="$root/platform/k8s/apps/quick-pick-survey/deployment.yaml"

grep -Eq '^  digest: sha256:[0-9a-f]{64}$' "$kustomization"
[[ "$(grep -Ec '^[[:space:]]+pairwise\.marisstella\.dev/revision: "[0-9a-f]{40}"$' "$deployment")" == 2 ]]

sed -E -i.bak \
  "s#^  digest: sha256:[0-9a-f]{64}\$#  digest: ${IMAGE_DIGEST}#" \
  "$kustomization"
sed -E -i.bak \
  "s#^([[:space:]]+)pairwise\\.marisstella\\.dev/revision: \"[0-9a-f]{40}\"\$#\\1pairwise.marisstella.dev/revision: \"${RELEASE_REVISION}\"#" \
  "$deployment"
rm "$kustomization.bak" "$deployment.bak"

grep -Fq "  digest: $IMAGE_DIGEST" "$kustomization"
[[ "$(grep -Fc "pairwise.marisstella.dev/revision: \"$RELEASE_REVISION\"" "$deployment")" == 2 ]]

printf 'Recorded Pairwise %s at %s\n' "$RELEASE_REVISION" "$IMAGE_DIGEST"
