#!/usr/bin/env bash
set -Eeuo pipefail

namespace="${HOMEPAGE_NAMESPACE:-web-services}"
deployment="${HOMEPAGE_DEPLOYMENT:-marisstella-homepage}"
container="${HOMEPAGE_CONTAINER:-marisstella-homepage}"
registry_secret="${HOMEPAGE_REGISTRY_SECRET:-homepage-registry}"
rollout_timeout="${HOMEPAGE_ROLLOUT_TIMEOUT:-5m}"

: "${IMAGE:?IMAGE is required}"
: "${REGISTRY_SERVER:?REGISTRY_SERVER is required}"
: "${REGISTRY_USERNAME:?REGISTRY_USERNAME is required}"
: "${REGISTRY_TOKEN:?REGISTRY_TOKEN is required}"
: "${RELEASE_REVISION:?RELEASE_REVISION is required}"

for command in kubectl jq; do
  command -v "$command" >/dev/null || {
    printf 'Required command is unavailable: %s\n' "$command" >&2
    exit 1
  }
done

kubectl -n "$namespace" get deployment "$deployment" >/dev/null

# Keep private-registry credentials in Kubernetes rather than in the pod spec or Terraform state.
kubectl -n "$namespace" create secret docker-registry "$registry_secret" \
  --docker-server="$REGISTRY_SERVER" \
  --docker-username="$REGISTRY_USERNAME" \
  --docker-password="$REGISTRY_TOKEN" \
  --dry-run=client \
  -o yaml |
  kubectl apply -f -

kubectl -n "$namespace" create poddisruptionbudget "$deployment" \
  --selector="app.kubernetes.io/name=marisstella-homepage" \
  --min-available=1 \
  --dry-run=client \
  -o yaml |
  kubectl apply -f -

# Patch the live Deployment to ensure zero-downtime rolling update settings and registry secret.
kubectl -n "$namespace" patch deployment "$deployment" --type=strategic -p "$(
  jq -cn \
    --arg secret "$registry_secret" \
    --arg container "$container" \
    '{
      spec: {
        minReadySeconds: 5,
        progressDeadlineSeconds: 300,
        strategy: {
          type: "RollingUpdate",
          rollingUpdate: {
            maxSurge: 1,
            maxUnavailable: 0
          }
        },
        template: {
          spec: {
            imagePullSecrets: [{name: $secret}],
            terminationGracePeriodSeconds: 30,
            containers: [
              {
                name: $container,
                imagePullPolicy: "Always"
              }
            ]
          }
        }
      }
    }'
)"

kubectl -n "$namespace" set image \
  "deployment/$deployment" \
  "$container=$IMAGE"

kubectl -n "$namespace" annotate deployment "$deployment" \
  "kubernetes.io/change-cause=Marisstella Homepage ${RELEASE_REVISION}" \
  --overwrite

if ! kubectl -n "$namespace" rollout status \
  "deployment/$deployment" \
  --timeout="$rollout_timeout"; then
  printf 'Rollout failed; restoring the previous ReplicaSet.\n' >&2
  kubectl -n "$namespace" rollout undo "deployment/$deployment"
  kubectl -n "$namespace" rollout status \
    "deployment/$deployment" \
    --timeout="$rollout_timeout"
  exit 1
fi

deployment_json="$(kubectl -n "$namespace" get deployment "$deployment" -o json)"
actual_image="$(
  jq -r \
    --arg container "$container" \
    '.spec.template.spec.containers[] | select(.name == $container) | .image' \
    <<<"$deployment_json"
)"

[[ "$actual_image" == "$IMAGE" ]] || {
  printf 'Deployment image mismatch: expected %s, got %s\n' "$IMAGE" "$actual_image" >&2
  exit 1
}

printf 'Successfully deployed %s to %s namespace with zero unavailable replicas.\n' "$IMAGE" "$namespace"
