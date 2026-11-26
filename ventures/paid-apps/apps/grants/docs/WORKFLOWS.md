# Application pipeline Workflow

The application lifecycle runs as a Cloudflare Workflow: class `ApplicationPipeline`
(`src/worker/workflows/application-pipeline.ts`), binding `APPLICATION_PIPELINE`, Workflow name
**`grant-autopilot-application-pipeline`**. One instance per application, and the **instance id is the
application id** (`app_…`, also stored in `applications.workflow_instance_id`).

The steps are in `services/pipeline/steps.ts`. Each one is idempotent and reads its state from D1,
never from the previous step's return value. The same steps also run **inline** (`runPipelineInline`
in `services/pipeline/index.ts`) when `APP_ENV=test`, `FAKE_EXTERNALS=true`, `INLINE_JOBS=true` or the
binding is missing (tests, offline demo). Production always uses the Workflow. `createApplication`
falls back to inline only if `APPLICATION_PIPELINE.create()` throws.

## Principle: D1 is the source of truth, events are wake-ups

Routes write the decision or status to D1 **first**, then send the event. On every loop iteration the
Workflow re-reads the application (`state-<i>`) and branches on `applications.status`. Event payloads
are validated with zod (`InfoProvidedPayload`, `ReviewDecisionPayload`). A malformed payload never
crashes the instance:

- a bad `review_decision` is logged (`pipeline.workflow_bad_event`) and treated as a plain wake-up;
- a bad `info_provided` is treated as `{ redraft: false }`, i.e. re-route only.

## States and transitions

```
create ─► prepare ─► draft-0 ─► verify-0 ─┐
                                          ▼
            ┌──────────── loop i = 0..24: state-<i> (read D1) ─────────────┐
            │ verifying          → route-<i>  (→ in_review | approved | needs_info)
            │ needs_info         → wait info_provided (info-<i>, 14 days)
            │                        redraft:true  → info-<i>-round/-draft/-verify
            │                        redraft:false → info-<i>-route (only if still needs_info)
            │ changes_requested  → changes-count-<i>; ≤ 3 requests → changes-<i>-round/-draft/-verify
            │                        > 3 requests → wait review_decision like in_review
            │ in_review          → wait review_decision (review-<i>, 30 days)
            │ approved           → submit-<i>  (one step, bounded retries)
            │ draft_queued/drafting → sleep settle-<i> 30 s (a human regenerate in flight)
            │ submitting/submitted/awarded/declined/withdrawn/failed → return { status }
            └──────────────────────────────────────────────────────────────────┘
```

| Status              | Who moves it on                                                     |
| ------------------- | ------------------------------------------------------------------- |
| `draft_queued`      | Workflow (`draft-0`)                                                |
| `drafting`          | Workflow draft steps (or a human regenerate, inline in the request) |
| `verifying`         | Workflow `route-<i>`                                                |
| `needs_info`        | human: gap-fill answers or flag resolution → `info_provided`        |
| `in_review`         | human: `POST /reviews/:id/decision` → `review_decision`             |
| `changes_requested` | Workflow auto-redraft (max `MAX_CHANGE_REDRAFTS` = 3), then a human |
| `approved`          | Workflow `submit-<i>` (autopilot tier `auto`, or after a human approval) |
| `failed`            | terminal for the instance; a human edit/regenerate runs inline      |

Step names include the loop index, so every iteration has unique, deterministic names and replays
hit the step cache. Redraft rounds use deterministic version ids (`ver_<app>_d<round>`), so a
retried draft never creates a duplicate version. `MAX_ITERATIONS` = 25 bounds the loop; hitting it
returns `{ status: "max_iterations" }`.

## Events

| Event type        | Payload                                   | Sent by (in `services/pipeline/index.ts`)                                                                                                                                                    |
| ----------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `info_provided`   | `{ redraft: boolean }`                    | `resumeAfterInfo` (gap-fill done → `redraft: true`; last missing-info blocker resolved via `POST /applications/:id/flags/:flagId/resolve` → `redraft: false`); `reverifyAndRoute` after a human edit leaves `needs_info` (`redraft: false`) |
| `review_decision` | `{ decision, reviewerId, comments }`      | `submitReviewDecision` (`POST /reviews/:applicationId/decision`) for `approved` and `changes_requested`. `rejected` **terminates** the instance instead.                                       |

How a route sends one (`notifyWorkflow`):

1. `APPLICATION_PIPELINE.get(app.workflowInstanceId ?? app.id)`;
2. `instance.status()`: if the instance is no longer live (`complete`, `errored`, `terminated`),
   the event is **not** sent and the route runs the same transition **inline** (submit, redraft,
   re-route). Finished instances still accept `sendEvent` but nobody consumes it, so without this
   check an approval after a timeout would be lost;
3. otherwise `instance.sendEvent({ type, payload })`. Events sent while the instance is busy are
   queued and consumed by the next `waitForEvent` of that type. A stale event only causes one extra
   loop iteration, because the Workflow re-reads D1.

`withdrawApplication` and a `rejected` review call `instance.terminate()`. Errors are logged
(`pipeline.workflow_terminate_failed`) and never fail the request.

## Timeouts, retries and failures

| What                                        | Setting                                                     |
| ------------------------------------------- | ----------------------------------------------------------- |
| LLM steps (prepare, draft, verify)          | 3 retries, 30 s exponential, 10 min timeout                 |
| DB steps (state, route, counts, round)      | 5 retries, 5 s exponential                                  |
| `submit-<i>`                                | 3 retries, 1 min exponential, 10 min timeout                |
| `info_provided` wait                        | `INFO_TIMEOUT` = 14 days                                    |
| `review_decision` wait                      | `REVIEW_TIMEOUT` = 30 days                                  |

- **4xx `AppError`** (402 plan limit, 404 application/org deleted, 409 conflicts) is rethrown as a
  `NonRetryableError` with its default name. The engine recognizes it by `name`, so never pass a
  second argument. No retry happens. The application becomes `failed` and its `lastError` shows the
  user-facing message as is.
- **Other errors** are retried up to the step limit. When retries run out, `mark-failed` sets
  `failed` with `lastError = "Pipeline error: …"` and the instance ends `errored`. Human checkpoints
  (`in_review`, `needs_info`, `changes_requested`) and final statuses are never overwritten.
- **Submission refused by the channel** (for example the email bounced, so `stepSubmit` leaves the
  status `approved` with `lastError`): the submit step throws, so it retries with backoff inside the
  **same** step. Every attempt submits the same (application, current version), which is the
  submission module's dedupe key. After the retries run out, the application becomes `failed` with
  the channel's `lastError`. There is no immediate re-send loop.
- **Wait timeout**: the instance ends `complete` with output `{ status, timedOut: true }`. The
  application keeps its status (`in_review` / `needs_info`) and `lastError` is left untouched. The
  next human action runs inline (see step 2 above).

## Inspecting, terminating, restarting

```sh
# list / filter instances
pnpm exec wrangler workflows list
pnpm exec wrangler workflows instances list grant-autopilot-application-pipeline
pnpm exec wrangler workflows instances list grant-autopilot-application-pipeline --status errored

# one instance (id = application id): status, every step with attempts/outputs, error, output
pnpm exec wrangler workflows instances describe grant-autopilot-application-pipeline app_123
pnpm exec wrangler workflows instances describe grant-autopilot-application-pipeline latest

# stop / pause / resume / restart from the beginning
pnpm exec wrangler workflows instances terminate grant-autopilot-application-pipeline app_123
pnpm exec wrangler workflows instances pause     grant-autopilot-application-pipeline app_123
pnpm exec wrangler workflows instances resume    grant-autopilot-application-pipeline app_123
pnpm exec wrangler workflows instances restart   grant-autopilot-application-pipeline app_123

# wake a waiting instance by hand (prefer the API routes: they write D1 first)
pnpm exec wrangler workflows instances send-event grant-autopilot-application-pipeline app_123 \
  --type info_provided --payload '{"redraft":false}'
```

Check the actual flags with `wrangler workflows instances --help` for the installed version.
Local dev (`wrangler dev`) accepts the same commands with `--local`.

Runbook:

- **Stuck in `needs_info`/`in_review` with an `errored`/`complete` instance**: nothing to do. The next
  human action runs inline.
- **`failed` after exhausted retries**: fix the cause, then either have a user edit or regenerate
  (runs inline), or `restart` the instance. A restart re-runs from `prepare`. Idempotent steps skip
  work that is already done (existing `_d0` version, existing grounding report) and continue from
  the D1 state.
- **Instance missing** (for example `create()` failed and the inline fallback ran): routes fall back
  to inline automatically. To move the application back onto a Workflow, create an instance with
  `id = applicationId` and `params = { orgId, applicationId, startedBy }`.
- **Never** edit `applications.status` by hand while an instance is live without sending the
  matching event (or terminating the instance). The instance only re-reads D1 when it wakes up.

## Tests

`test/worker/workflow.test.ts` runs the real Workflow in workerd. Under `APP_ENV=test`,
`createApplication` is always inline, so the test inserts the application row and calls
`env.APPLICATION_PIPELINE.create({ id, params })` directly. Route-side calls use a context whose env
is not inline, so they go through `status()`/`sendEvent()` like production. It uses
`introspectWorkflowInstance` (`disableSleeps`, `disableRetryDelays`, `forceEventTimeout`,
`waitForStepResult`).

Locally, an instance parked on `waitForEvent` reports `running`, not `waiting`.

```sh
pnpm exec vitest run --config vitest.worker.config.ts test/worker/workflow.test.ts
```
