# Pairwise AI repair loop

The release pipeline remains the authority. An AI repair run may change code,
tests, migrations, container packaging, or Pairwise-owned deployment files,
but it may not bypass, weaken, or mark a required gate optional.

## Scope

The repair agent watches changes under:

- `ventures/quick-pick-survey/**`
- `.gitea/workflows/pairwise-ci.yml`
- `platform/ci/deploy-pairwise.sh`
- `platform/ci/smoke-test-pairwise.sh`
- `platform/k8s/apps/quick-pick-survey/**`
- `platform/terraform/helm/web-service/**`
- Pairwise entries in `platform/terraform/services.tf` and
  `platform/terraform/autoscaling.tf`

## Loop

1. Read `AGENTS.md`, the latest `main`, the active Gitea runner logs, and the
   live Deployment before making a claim.
2. If the latest Pairwise-relevant commit is already deployed, all required
   gates are green, all replicas are ready on one immutable digest,
   `maxUnavailable` is zero, and the production smoke suite passes, stop.
3. Otherwise identify the first actionable failure and make the smallest
   project-scoped fix. Never edit unrelated dirty files.
4. Run `npm run verify`, the database integration/migration-drift workflow,
   the container smoke check, and the CI contract tests.
5. Commit and push only after the local gates pass. Observe the resulting
   Gitea run through image publication, migration, rollout, and production
   smoke tests.
6. Retry at most three distinct fixes for the same failing commit. Record the
   commit, failing gate, and attempted fixes in the task. If the same blocker
   survives three attempts, stop and ask for human input instead of weakening
   the gate or looping indefinitely.

## Safety boundaries

- Never force-push, rewrite shared history, delete production data, reverse a
  database migration automatically, print secrets, or deploy an image that was
  not built from the tested commit.
- A newer commit must not cancel a migration or rollout already in progress.
- Failed validation leaves the currently healthy ReplicaSet serving traffic.
- Roll back application code on rollout failure; repair schema changes with a
  reviewed forward migration.
