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

# The shape check above is not a provenance check, and the difference is not
# hypothetical. On 2026-08-05 `gitops-production` was moved to a commit whose
# deployment manifest recorded
# `pairwise.marisstella.dev/revision: "5fa8a33c10e137bcbb3298ecadcb404c0ec54bb7"`.
# That string is forty lowercase hex characters, so it satisfies the regex
# exactly; it shares its first eight with `5fa8a33c10e109520b32ca735f171691c93376e6`,
# which was `main` at the time. It names no object in this repository and none on
# the remote — `git fetch origin <sha>` answers `upload-pack: not our ref`. The
# annotation is the only record of what is serving `pairwise.marisstella.dev`, so
# production provenance pointed at a commit that has never existed, and
# `deployment_lag.py` reported `revision-unresolvable` for the service while its
# headline "commits behind" read 0 — an unresolvable revision is not measured, so
# it cannot be counted as behind.
#
# A hash is the one input where a well-formed fabrication is indistinguishable
# from the real thing by inspection, which is why this repository already refuses
# to accept shape as evidence for an OCI digest pin and for a print file URL. The
# object database is the authority, so ask it. `^{commit}` rather than a bare
# `-e`: a blob or tree id is also forty hex characters and would resolve.
git cat-file -e "${RELEASE_REVISION}^{commit}" 2>/dev/null || {
  printf 'Git revision does not name a commit in this repository: %s\n' "$RELEASE_REVISION" >&2
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
