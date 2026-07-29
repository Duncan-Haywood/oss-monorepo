# CI/CD architecture

## Decision

Keep Gitea Actions as the event, identity, status, and audit plane. Improve the
current Act Runner setup before adding a second CI server. Pilot Dagger as a
portable execution layer for one application; do not migrate deployment or
security gates until the pilot proves faster or more reliable.

Dagger is not a replacement for Gitea. It moves build and test logic from YAML
into a typed, containerized module that can run locally and from Gitea Actions.
Gitea still handles pull requests, protected branches, secrets, job tokens,
scheduling, and run history.

## Current pipeline contract

| Change | Required checks | Release effect |
| --- | --- | --- |
| Pairwise | Typecheck, lint, unit/component tests, production build, disposable PostgreSQL migrations/seed/integration tests, schema drift, container build | No automatic production mutation |
| AI-First Markets | Typecheck, lint, Next.js build, Cloudflare build | Manual production deployment |
| Homepage | Container build | No automatic production mutation |
| Terraform/platform | CI contract tests, repository policy, format, init without backend, validate | Apply requires main, manual dispatch, exact `APPLY` confirmation, and a saved plan |
| Security | Repository-policy tests, history secret scan, dependency/IaC scan, per-venture lockfile audit | Failure blocks release; default-branch failures open or update one remediation issue |

Application workflows are path-filtered. The repository/platform workflow does
not repeat application builds. `scripts/ci/verify-component.sh` is the shared,
fail-closed local/CI contract so YAML and developer checks do not diverge.

## Deployment boundary

CI must build, test, scan, and publish an immutable image identified by the full
Git commit. CD should update a Git-tracked desired image digest and let Argo CD
reconcile it. CI runners should not hold a long-lived administrator kubeconfig.

The previous service workflow looked like a deployment but installed a demo
image and never built the selected service. It is now a credential-free Helm
rendering gate. Production service rollout should remain disabled until the
Gitea package registry path, immutable image naming, Argo CD repository access,
health checks, and rollback policy are verified end to end.

## Dagger pilot

Pilot only the Pairwise verification path:

1. Build a TypeScript Dagger module with functions for dependencies, unit
   verification, PostgreSQL-backed integration tests, and OCI image export.
2. Call the same module locally and from Gitea Actions.
3. Keep the existing workflow as the control for at least ten comparable runs.
4. Adopt only if median feedback time improves by at least 20%, cache-hit runs
   are materially faster, and failures remain diagnosable without privileged
   host access.

The pilot must pin the Dagger CLI and engine versions, keep secrets as Dagger
`Secret` inputs, and expose only the repository directory and required service
sockets. Do not mount the host Docker socket into untrusted pull-request jobs.

### Why not switch fully now

- The installed local Dagger CLI could not start an engine in the current
  environment, so a generated module cannot yet be tested here.
- Dagger adds an engine and cache lifecycle; it does not remove the need for
  Gitea Actions or runner hardening.
- The highest-value current fixes are fail-closed gates, removal of duplicate
  work, immutable artifacts, and safe deployment promotion.

Woodpecker is a reasonable alternative if Gitea Actions compatibility becomes
a recurring operational problem. It has first-class Gitea integration and
container/Kubernetes agents, but adds another server, database, OAuth app,
webhooks, backups, and upgrade path. It provides less incremental value than a
Dagger pilot while Gitea Actions is otherwise functioning.

## Runner hardening

- Run jobs on a node separate from Gitea and production workloads.
- Prefer ephemeral Act Runners with rootless Docker-in-Docker; never use host
  execution for pull-request code.
- Split untrusted verification runners from protected release runners with
  distinct labels and credentials.
- Do not expose production secrets to pull-request jobs or workflows that can be
  changed by those jobs.
- Configure the Gitea Actions cache explicitly and bound its storage.
- Pin actions, scanner images, build images, Dagger CLI, and Dagger engine to
  reviewed immutable digests or commits.
- Use short-lived, least-privilege registry credentials. A release runner may
  publish images; a verification runner may not.

## Measures

Track queue time, execution time, cache-hit rate, flaky reruns, failure cause,
time to diagnose, artifact digest, deployment lead time, rollback time, and
runner CPU/storage consumption. A CI engine change without an improvement in
these measures is churn rather than progress.
