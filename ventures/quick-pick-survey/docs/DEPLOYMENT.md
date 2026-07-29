# Deployment and recovery

Pairwise is built by Vercel from `ventures/quick-pick-survey`. GitHub CI is a
separate required gate: it proves the application, database behavior, and
migration history before a change should merge. A Vercel preview looking
healthy is not a substitute for that gate.

## Pipeline

1. `.github/workflows/pairwise-ci.yml` runs only when Pairwise or its workflow
   changes.
2. Dependencies are installed from `package-lock.json` with lifecycle scripts
   disabled, then the Prisma client is generated explicitly.
3. Typecheck, lint, unit/component tests, and a production build run.
4. A disposable Postgres 16 service receives every migration and the seed.
5. The full integration suite runs against that database.
6. Prisma compares the migration history with `schema.prisma`; drift blocks
   merge.
7. A dependent job builds the production Dockerfile without publishing it, so
   a broken standalone image cannot pass merely because `next build` worked.
8. Vercel Git integration builds the reviewed revision. Its build applies
   migrations before compiling, but does not re-seed production on every
   deployment.

Production promotion remains owned by Vercel Git integration. The monorepo
container workflow publishes images, but does not deploy Pairwise; its domain
smoke test is therefore named an availability check and must not be read as
proof that a newly built image is live.

## Health contracts

- `GET /api/health` is liveness. It proves the process can answer and does not
  touch Postgres. Docker uses this check.
- `GET /api/health/ready` is readiness. It returns 200 only when a database
  query succeeds, otherwise 503 with `Retry-After: 5`.

The production smoke script checks both. Kubernetes readiness should use
`/api/health/ready`; liveness should use `/api/health`. Do not use readiness
as liveness—restarting the web process cannot repair a database outage.

## Rollback

For an application-only regression, use Vercel rollback or promote the last
known-good deployment. Do not reverse a database migration automatically:
Prisma migrations may contain irreversible data changes. Restore or repair the
database separately, using a reviewed forward migration whenever possible.

After rollback, verify `/api/health`, `/api/health/ready`, `/app`, and one
read-only page. A 200 from the landing page alone does not prove the database
paths work.
