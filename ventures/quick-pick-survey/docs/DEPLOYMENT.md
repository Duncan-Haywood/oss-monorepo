# Deployment and recovery

Pairwise production runs on the Hetzner K3s cluster. Gitea Actions proves the
application, database behavior, migration history, and container before a
change can be promoted. Preview hosting, when enabled, is not a substitute for
that gate.

## Pipeline

1. `.gitea/workflows/pairwise-ci.yml` runs only when Pairwise, its workflow,
   or its production deployment script changes.
2. Dependencies are installed from `package-lock.json` with lifecycle scripts
   disabled, then the Prisma client is generated explicitly.
3. Typecheck, lint, unit/component tests, and a production build run.
4. A disposable Postgres 16 service receives every migration and the seed.
5. The full integration suite runs against that database.
6. Prisma compares the migration history with `schema.prisma`; drift blocks
   merge.
7. A dependent job builds the production Dockerfile. Pull requests build
   without publishing; a successful push to `main` publishes exactly one image
   tagged with the full Git commit SHA.
8. The production job creates or rotates the cluster registry pull secret,
   applies forward-only Prisma migrations from that exact image, and updates
   the Deployment to the immutable image.
9. Kubernetes keeps every existing ready replica available while the new
   ReplicaSet becomes ready. CI waits for the rollout and both health endpoints.
   A failed rollout is returned to the previous ReplicaSet.

Production promotion is serialized: a newer commit cannot cancel a migration
or rollout already in progress. No `latest`, `main`, or other mutable image tag
is used for promotion.

## Health contracts

- `GET /api/health` is liveness. It proves the process can answer and does not
  touch Postgres. Docker uses this check.
- `GET /api/health/ready` is readiness. It returns 200 only when a database
  query succeeds, otherwise 503 with `Retry-After: 5`.

The production smoke script checks both. Kubernetes readiness should use
`/api/health/ready`; liveness should use `/api/health`. Do not use readiness
as liveness—restarting the web process cannot repair a database outage.

## Rollback

For an application-only regression, run `kubectl rollout undo
deployment/quick-pick-survey-web-service -n web-services` or promote the last
known-good immutable image. Do not reverse a database migration automatically:
Prisma migrations may contain irreversible data changes. Restore or repair the
database separately, using a reviewed forward migration whenever possible.

After rollback, verify `/api/health`, `/api/health/ready`, `/app`, and one
read-only page. A 200 from the landing page alone does not prove the database
paths work.
