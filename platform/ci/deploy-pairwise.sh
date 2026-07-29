#!/usr/bin/env bash
set -Eeuo pipefail

namespace="${PAIRWISE_NAMESPACE:-web-services}"
deployment="${PAIRWISE_DEPLOYMENT:-quick-pick-survey-web-service}"
container="${PAIRWISE_CONTAINER:-web-service}"
registry_secret="${PAIRWISE_REGISTRY_SECRET:-pairwise-registry}"
instance="${PAIRWISE_INSTANCE:-quick-pick-survey}"
rollout_timeout="${PAIRWISE_ROLLOUT_TIMEOUT:-10m}"

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

# Keep private-registry credentials in Kubernetes rather than in the pod spec or
# Terraform state. apply makes token rotation idempotent.
kubectl -n "$namespace" create secret docker-registry "$registry_secret" \
  --docker-server="$REGISTRY_SERVER" \
  --docker-username="$REGISTRY_USERNAME" \
  --docker-password="$REGISTRY_TOKEN" \
  --dry-run=client \
  -o yaml |
  kubectl apply -f -

kubectl -n "$namespace" create poddisruptionbudget "$deployment" \
  --selector="app.kubernetes.io/name=web-service,app.kubernetes.io/instance=${instance}" \
  --min-available=1 \
  --dry-run=client \
  -o yaml |
  kubectl apply -f -

# Run forward-only Prisma migrations from the exact artifact that will be
# promoted. Reuse the Deployment's environment without printing secret values.
revision_short="${RELEASE_REVISION:0:12}"
migration_job="pairwise-migrate-${revision_short}"
deployment_json="$(kubectl -n "$namespace" get deployment "$deployment" -o json)"
container_json="$(
  jq \
    --arg image "$IMAGE" \
    --arg container "$container" \
    '
      .spec.template.spec.containers[]
      | select(.name == $container)
      | .name = "migrate"
      | .image = $image
      | .imagePullPolicy = "IfNotPresent"
      | .resources = {
          requests: {
            cpu: "100m",
            memory: "512Mi"
          },
          limits: {
            cpu: "1",
            memory: "1Gi"
          }
        }
      | .command = [
          "sh",
          "-c",
          "export PATH=\"/app/node_modules/.bin:$PATH\"; prisma migrate deploy && prisma db seed"
        ]
      | del(
          .args,
          .ports,
          .readinessProbe,
          .livenessProbe,
          .startupProbe,
          .lifecycle
        )
    ' <<<"$deployment_json"
)"

if [[ -z "$container_json" ]]; then
  printf 'Container %s was not found in Deployment %s\n' "$container" "$deployment" >&2
  exit 1
fi

# A manual retry of the same release uses the same deterministic Job name.
# Remove an earlier failed or completed attempt so the retry actually runs.
kubectl -n "$namespace" delete job "$migration_job" \
  --ignore-not-found \
  --wait=true

jq -n \
  --arg namespace "$namespace" \
  --arg job "$migration_job" \
  --arg secret "$registry_secret" \
  --argjson container "$container_json" \
  '{
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: {
      name: $job,
      namespace: $namespace,
      labels: {
        "app.kubernetes.io/name": "pairwise-migration",
        "app.kubernetes.io/part-of": "quick-pick-survey"
      }
    },
    spec: {
      backoffLimit: 1,
      ttlSecondsAfterFinished: 600,
      template: {
        metadata: {
          labels: {
            "app.kubernetes.io/name": "pairwise-migration",
            "app.kubernetes.io/part-of": "quick-pick-survey"
          }
        },
        spec: {
          restartPolicy: "Never",
          imagePullSecrets: [{name: $secret}],
          containers: [$container]
        }
      }
    }
  }' |
  kubectl apply -f -

if ! kubectl -n "$namespace" wait \
  --for=condition=complete \
  "job/$migration_job" \
  --timeout="$rollout_timeout"; then
  kubectl -n "$namespace" describe "job/$migration_job" >&2
  kubectl -n "$namespace" logs "job/$migration_job" --all-containers >&2 || true
  exit 1
fi

# Patch the live Helm-managed Deployment before changing its image. This also
# corrects older releases that were created with Kubernetes' 25% defaults.
kubectl -n "$namespace" patch deployment "$deployment" --type=strategic -p "$(
  jq -cn \
    --arg secret "$registry_secret" \
    --arg container "$container" \
    '{
      spec: {
        minReadySeconds: 5,
        progressDeadlineSeconds: 600,
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
  "kubernetes.io/change-cause=Pairwise ${RELEASE_REVISION}" \
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

jq -e '
  .spec.strategy.type == "RollingUpdate"
  and (.spec.strategy.rollingUpdate.maxUnavailable | tostring) == "0"
  and (.spec.strategy.rollingUpdate.maxSurge | tostring) == "1"
  and .spec.minReadySeconds >= 5
  and .status.replicas > 0
  and .status.readyReplicas == .status.replicas
  and .status.updatedReplicas == .status.replicas
  and ((.status.unavailableReplicas // 0) == 0)
' <<<"$deployment_json" >/dev/null || {
  printf 'Deployment failed its zero-downtime readiness invariants.\n' >&2
  exit 1
}

pod_json="$(
  kubectl -n "$namespace" get pods \
    -l "app.kubernetes.io/name=web-service,app.kubernetes.io/instance=${instance}" \
    -o json
)"
jq -e \
  --arg image "$IMAGE" \
  --arg container "$container" \
  '
    .items | length > 0
    and all(.[];
      (.spec.containers[] | select(.name == $container) | .image) == $image
      and (.status.containerStatuses[] | select(.name == $container) | .ready)
    )
  ' <<<"$pod_json" >/dev/null || {
  printf 'Not every Pairwise pod is ready on the promoted image.\n' >&2
  exit 1
}

ingress_host="$(
  kubectl -n "$namespace" get ingress "$deployment" \
    -o jsonpath='{.spec.rules[0].host}'
)"
"$(dirname "$0")/smoke-test-pairwise.sh" "$ingress_host"

printf 'Deployed %s with zero unavailable replicas.\n' "$IMAGE"
