# Deployment and recovery

Pairwise production runs on the Hetzner K3s cluster. Gitea Actions proves and
publishes artifacts; Git records the approved production digest; Argo CD is the
only controller that changes the production workload.

## Release flow

1. `.gitea/workflows/pairwise-ci.yml` runs for Pairwise application, database,
   workflow, and production-manifest changes.
2. CI installs the locked dependency graph with lifecycle scripts disabled,
   generates Prisma explicitly, and runs typecheck, lint, unit tests, and the
   production build.
3. A disposable PostgreSQL 16 database receives every migration and the
   idempotent seed. Integration tests and Prisma migration-drift detection must
   pass.
4. CI builds and smoke-tests
   `git.marisstella.dev/giteaadmin/pairwise-app:<full-git-sha>`.
5. A successful `main` build pushes that immutable tag and resolves its OCI
   `sha256` digest. The mutable `latest` alias may be published for humans, but
   no production manifest consumes it.
6. CI merges the tested revision into `gitops-production`, records the digest
   in `platform/k8s/apps/quick-pick-survey/kustomization.yaml`, records the
   source revision on the Deployment, and pushes a promotion commit.
7. The `quick-pick-survey` Argo CD Application watches only
   `gitops-production`. Automated sync, pruning, self-healing, bounded retry,
   and revision history are enabled.
8. Argo runs the digest-pinned `pairwise-migrate` PreSync hook. Only after
   forward migrations and the seed succeed does it roll out the Deployment
   with `maxUnavailable: 0`.
9. Once resources are healthy, Argo runs the digest-pinned `pairwise-smoke`
   PostSync hook against liveness, database readiness, seeded survey data, and
   public application pages.

Production promotion is serialized: a newer Pairwise run cannot cancel an
earlier release while it is publishing or promoting. The HPA owns
`Deployment.spec.replicas`; Argo intentionally ignores only that field.

## Ownership

- Gitea Actions owns validation, image publication, and the Git promotion.
- The `gitops-production` branch owns the production image digest and revision.
- Argo CD owns Deployment, Service, Ingress, PodDisruptionBudget, migration
  hook, smoke hook, and backup CronJob reconciliation.
- Terraform owns cluster infrastructure, Argo CD itself, the HPA, database,
  and unrelated Helm services. It deliberately excludes Pairwise from the
  generic `helm_release.web_service` map.
- `quick-pick-secrets` and `pairwise-registry` are provisioned out of band.
  Workload manifests reference their keys and never contain plaintext values.

CI has no kubeconfig and no Kubernetes RBAC. Argo has read-only repository
credentials; the Gitea promotion token can write repository contents but has no
cluster access.

## One-time ownership handoff

The initial migration from Terraform/Helm and direct CI deployment must be
ordered so no live resource is deleted:

1. Back up Terraform state.
2. Detach the existing release without running an uninstall:
   `terraform state rm 'helm_release.web_service["quick-pick-survey"]'`.
3. Materialize `quick-pick-secrets` from the current protected configuration
   and verify `pairwise-registry` exists.
4. Configure an Argo repository Secret with a read-only Gitea deploy token.
5. Apply `platform/k8s/argocd-apps/quick-pick-survey.yaml`.
6. Wait for Argo sync and health, then verify live resource ownership,
   immutable digest, hooks, and public smoke checks.
7. Revoke the obsolete CI kubeconfig secret and delete the old
   `pairwise-ci-deployer` ServiceAccount, token, Role, and RoleBinding.

Do not run `terraform apply` with the Pairwise release removed from the
configuration until step 2 has succeeded.

## Rollback

Revert the unwanted Pairwise promotion commit on `gitops-production` and push
the revert. Argo reconciles the previously recorded digest and keeps the
rollback auditable in Git.

Database migrations are forward-only and are not reversed automatically.
When a schema repair is required, add a reviewed forward migration. Restore the
database separately only under the documented recovery procedure.

After rollback, verify `/api/health`, `/api/health/ready`, `/app`, `/couple`,
and `/api/surveys/combined`. A successful landing page alone does not prove
database-backed paths work.
