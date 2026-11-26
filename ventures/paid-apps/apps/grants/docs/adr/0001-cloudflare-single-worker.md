# ADR 0001: Run everything in one Cloudflare Worker

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

Grant Autopilot needs an HTTP API, a hosted single-page app, background jobs (document conversion, fact
extraction, discovery, scoring, exports), a durable multi-day pipeline that waits for people (up to 14
days for missing information, 30 days for a review decision), scheduled tasks, and storage for rows,
files and vectors. It also calls models for embeddings, document conversion and speech-to-text.

One owner and a small group of agents build and run it. Customers are small nonprofits that pay cost-plus
prices (ADR 0007), so fixed hosting cost and operational overhead must stay close to zero.

## Decision

Ship one Worker, `grant-autopilot` (`wrangler.jsonc`). `src/worker/index.ts` exports four entry points:

| Entry point                    | What it runs                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `fetch`                        | The Hono app (`app.ts`) at `/api/*`. Static SPA assets are served with `not_found_handling: "single-page-application"`, and only `/api/*` runs the Worker first. |
| `queue`                        | `queues/consumer.ts` for queue `grant-autopilot-jobs`: typed `JobMessage`s, 3 retries with exponential delay, then the DLQ `grant-autopilot-jobs-dlq`. |
| `scheduled`                    | `scheduled.ts`: `17 13 * * *` (discovery and the retention sweep) and `*/30 * * * *` (due follow-ups). Crons only enqueue jobs. |
| `ApplicationPipeline` (export) | The Cloudflare Workflow `grant-autopilot-application-pipeline` (`workflows/application-pipeline.ts`).   |

Bindings: `DB` (D1), `FILES` (R2), `VECTORS` (Vectorize), `AI` (Workers AI), `JOBS` (Queue),
`APPLICATION_PIPELINE` (Workflow). `context.ts` is the composition root. It builds an `AppContext` for
each request or job, and every service takes that context as its first argument. External services sit
behind interfaces in `ports/`.

## Consequences

- One deploy (`pnpm deploy`), one runtime (workerd) and one bill. Request handlers, jobs and pipeline
  steps share code and types.
- Local development runs the whole app in one process (`@cloudflare/vite-plugin`). Integration tests run in
  real workerd with local D1, R2, Queues and Workflows (`@cloudflare/vitest-plugin`).
- We depend on Cloudflare primitives. The `ports/` interfaces keep the business logic portable, but
  queues, Workflows and D1 would need replacements on another host.
- Workers limits shape the code. For example, passwords use PBKDF2 through WebCrypto because Better
  Auth's default scrypt can exceed the CPU budget (`services/auth/password.ts`). Long LLM work runs in
  Workflow steps or queue jobs, not in requests.
- All job types share one queue and one retry policy. A job type that needs different retry or
  concurrency settings would need its own queue.
- Vectorize and Workers AI cannot run in Miniflare, so tests and the offline demo use fakes (ADR 0009).
- The whole product deploys at once, so a bad deploy affects every module. CI (`grants-ci.yml`) has to pass first.

## Alternatives considered

- **Several Workers joined by service bindings** (API, jobs, pipeline). This gives separate deploys and
  limits, but we would have to version the contracts between them. Not worth it at this size.
- **Containers or VMs** (Fly.io or Render, with Postgres and Redis/BullMQ). This is the most familiar
  stack, but it has fixed monthly costs, more to operate, and no durable-wait primitive like Workflows.
- **AWS serverless** (Lambda, SQS, Step Functions, S3, RDS or DynamoDB). It can do everything we need,
  but it needs more infrastructure code, has a slower local loop and costs more at low volume.
- **Next.js on Vercel with a separate job service.** See ADR 0002.
