#!/usr/bin/env bash
set -Eeuo pipefail

namespace="${HOMEPAGE_NAMESPACE:-web-services}"
deployment="${HOMEPAGE_DEPLOYMENT:-web-portal-web-service}"
configmap="${HOMEPAGE_CONFIGMAP:-marisstella-homepage-files}"
rollout_timeout="${HOMEPAGE_ROLLOUT_TIMEOUT:-5m}"
source_dir="${HOMEPAGE_SOURCE_DIR:-portfolio/marisstella-homepage}"

: "${RELEASE_REVISION:?RELEASE_REVISION is required}"

for command in kubectl jq; do
  command -v "$command" >/dev/null || {
    printf 'Required command is unavailable: %s\n' "$command" >&2
    exit 1
  }
done

for file in index.html style.css app.js Dockerfile; do
  [[ -f "$source_dir/$file" ]] || {
    printf 'Homepage release file is unavailable: %s/%s\n' "$source_dir" "$file" >&2
    exit 1
  }
done

kubectl -n "$namespace" get deployment "$deployment" >/dev/null

# Production currently serves the static site from an Nginx-mounted ConfigMap.
# Generate the full release atomically so all replicas receive the same file set.
kubectl -n "$namespace" create configmap "$configmap" \
  --from-file="index.html=$source_dir/index.html" \
  --from-file="style.css=$source_dir/style.css" \
  --from-file="app.js=$source_dir/app.js" \
  --from-file="Dockerfile=$source_dir/Dockerfile" \
  --dry-run=client \
  -o yaml |
  kubectl apply -f -

kubectl -n "$namespace" patch deployment "$deployment" --type=strategic -p \
  '{"spec":{"strategy":{"type":"RollingUpdate","rollingUpdate":{"maxSurge":1,"maxUnavailable":0}}}}'

kubectl -n "$namespace" annotate deployment "$deployment" \
  "kubernetes.io/change-cause=Maris Stella homepage ${RELEASE_REVISION}" \
  --overwrite

kubectl -n "$namespace" rollout restart "deployment/$deployment"

if ! kubectl -n "$namespace" rollout status \
  "deployment/$deployment" \
  --timeout="$rollout_timeout"; then
  printf 'Homepage rollout failed.\n' >&2
  exit 1
fi

deployment_json="$(kubectl -n "$namespace" get deployment "$deployment" -o json)"
desired="$(jq -r '.spec.replicas // 1' <<<"$deployment_json")"
ready="$(jq -r '.status.readyReplicas // 0' <<<"$deployment_json")"
updated="$(jq -r '.status.updatedReplicas // 0' <<<"$deployment_json")"

[[ "$ready" == "$desired" && "$updated" == "$desired" ]] || {
  printf 'Homepage replica verification failed: desired=%s ready=%s updated=%s\n' \
    "$desired" "$ready" "$updated" >&2
  exit 1
}

printf 'Successfully deployed homepage revision %s: %s/%s replicas ready.\n' \
  "$RELEASE_REVISION" "$ready" "$desired"
