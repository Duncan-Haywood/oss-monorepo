# Grant Autopilot: Monitoring

How production is watched, what pages someone, and what to do about it. Guards, logs, cost SQL and the
LLM kill switch are in [OPERATIONS.md](OPERATIONS.md); deploys and rollback are in [DEPLOY.md](DEPLOY.md).

| Piece | Where | What it does |
| ----- | ----- | ------------ |
| `GET /api/health` | `src/worker/routes/health.ts` | Public liveness: one D1 round trip, `{ ok, env, fake }`. |
| `GET /api/health/deep` | same file | Bearer `INTERNAL_API_TOKEN`: 7 dependency/pipeline/spend checks, 503 on any `fail`. |
| `grants-monitor` | `.github/workflows/grants-monitor.yml` | Every 15 min: probes both, opens/updates/closes one `incident` issue. |
| Cloudflare native | dashboard | Logs, Issues, D1 and Queue metrics (below). |

## Health endpoints

`GET /api/health/deep` returns:

```json
{ "status": "warn",
  "checks": [
    { "name": "d1", "status": "ok", "detail": "read in 4ms" },
    { "name": "stuck_applications", "status": "warn", "detail": "1 in drafting/verifying for more than 2h (oldest 3.1h)" } ] }
```

- `status` is the worst check. HTTP **503** when it is `fail`, otherwise 200 (`ok` and `warn`).
- It uses the same bearer check as `/api/internal/*` (`requireInternalToken`, constant-time compare):
  401 for a missing or wrong token, 404 when the Worker has no `INTERNAL_API_TOKEN` at all.
- The checks aggregate across all orgs on purpose. Responses hold counts, ages, latencies and global
  totals only, never ids, titles, org names or error text. A check that throws reports
  `check errored (see Worker logs)` and logs `health.check_failed` with the error. A check that takes
  more than 5 s fails with `no answer within 5000ms`.
- A non-ok result logs `health.deep_degraded` (warn) with the names of the checks that are not ok.
- `Cache-Control: no-store`. Each call runs about 6 small D1 queries and 1 R2 HEAD (one probe every
  15 min is negligible).

### Thresholds

All constants are in `THRESHOLDS` in `routes/health.ts`.

| Check | Source | ok | warn | fail |
| ----- | ------ | -- | ---- | ---- |
| `d1` | `select count(*) from sqlite_master` | < 500 ms | ≥ 500 ms | ≥ 2 s, error, or no answer in 5 s |
| `r2` | `FILES.head("ops/health-sentinel")` | < 1 s | ≥ 1 s | ≥ 3 s or error |
| `discovery` | newest `discovery_runs` row with `status = 'succeeded'` | ≤ 30 h old | > 30 h | > 48 h |
| `stuck_applications` | `applications` in `drafting`/`verifying` with `updated_at` > 2 h ago | 0 | 1–4 | ≥ 5 |
| `stuck_documents` | `documents` in `processing` with `updated_at` > 30 min ago | 0 | 1–4 | ≥ 5 |
| `llm_error_rate` | `llm_calls.error IS NOT NULL`, last 60 min | ≤ 10% | > 10% | > 50% with ≥ 10 calls |
| `llm_spend` | `llm_calls.cost_micros` vs `GLOBAL_DAILY_LLM_CAP_USD` (default $200) | below warn | today ≥ 80% of the cap, or month-to-date ≥ 80% of cap × days elapsed, or cap = `0` (kill switch on) | today ≥ 100% of the cap (every LLM route returns 429) |

Notes:

- **Discovery** runs daily at 13:17 UTC (`wrangler.jsonc`), so one missed run warns and two missed runs
  fail. With no runs at all (a fresh deploy) the check is `ok`. If runs exist but none has ever
  succeeded, the age counts from the first attempt.
- **R2 sentinel.** The HEAD proves the binding answers. A missing object is still `ok` (the detail
  says `sentinel absent`). To make the detail show `present`, write the key once:
  `echo ok | pnpm exec wrangler r2 object put <bucket>/ops/health-sentinel --pipe --remote`.
  It is outside `orgs/`, so it is not tenant data.
- **Stuck counts.** One stuck item is usually one bad input, so it warns. Five or more at once
  usually means the Workflow, the queue consumer or the LLM is down, so it fails.
- **LLM spend.** The enforced cap is daily. The month-to-date figure is compared with cap × UTC days
  elapsed, which catches spend running near the cap every day. `off` disables the check.
- The 10%/50% error rates use the rows `llm_calls` records. Calls that never got a response are not
  recorded there (see OPERATIONS.md), so a full Anthropic outage shows up as stuck applications and
  `job.failed` logs rather than as an error rate.

## The GitHub probe (`grants-monitor`)

Runs on `*/15 * * * *` and on demand (Actions → grants-monitor → Run workflow).

1. If the repository variable `APP_DOMAIN` is unset, the run ends with a notice and does nothing.
2. `curl $APP_URL/api/health` (`APP_URL` variable, default `https://marisstella.app/grants`; `APP_DOMAIN`,
   the old host, only 301s there). `ok` means HTTP 200 and `"ok": true`.
3. If the secret `INTERNAL_API_TOKEN` exists, `curl /api/health/deep` with the bearer token (sent on
   stdin, not in argv). A 200 or 503 JSON body adds its checks. A 401 (token mismatch), a 404 (no
   Worker token) or any other answer adds a failing `deep_check`. Without the secret, only the public
   check runs, and the run shows a notice.
4. Each curl retries twice, 10 s apart, before a failure counts. This rides out single network blips.
5. Results go to the job summary (table) and to annotations (`fail` = error, `warn` = warning).
6. **Any `fail`**: the run opens an issue labelled `incident` (it creates the label if it is missing),
   or updates the open one. There is only one open incident issue at a time, found by a hidden marker
   in its body. The body always shows the latest failing checks and warnings. A comment is added only
   when the set of failing checks changes, so a long outage does not post a comment every 15 minutes.
   The run is marked failed (red).
7. **No `fail`** (ok or only warnings): if an incident issue is open, the run comments
   `Resolved: …` (listing any remaining warnings) and closes it as completed.

Warnings never open an issue. Read them in the run annotations, or check `/api/health/deep` by hand.

**Who gets told.** GitHub emails the person who last changed the workflow's `cron` when a scheduled
run fails. Everyone else should watch the repository (at least Issues), or route new `incident`
issues to chat or a pager (for example with a GitHub app for Slack, or a webhook filtered on the
label).

**Caveats.**

- GitHub runs scheduled workflows on a best-effort basis. Runs can start minutes late or be
  skipped when Actions is busy (especially at minute 0), so this is a coarse monitor, not a 1-minute
  uptime check. Add an external uptime service on `/api/health` if you need tighter detection.
- Each run bills at least 1 runner minute. That is about 2,900 minutes per 30-day month, more than
  the 2,000 minutes GitHub Free includes for private repositories. Check Settings → Billing, or
  change the cron to `*/30`.
- In a public repository, GitHub disables scheduled workflows after 60 days without repository
  activity. Re-enable the workflow in the Actions tab.

### Enabling the deep check from GitHub

The deploy workflow generates `INTERNAL_API_TOKEN` as a **Worker secret** on first deploy, when it is
missing (see DEPLOY.md "Secrets"). It is never printed, and `wrangler secret` values cannot be read
back, so GitHub does not know the value. To let the monitor call the deep check, do one of these:

1. **Preferred: rotate to a known value.** Generate a value (`openssl rand -hex 32`) and save it as the
   GitHub Actions secret `INTERNAL_API_TOKEN` (Settings → Secrets and variables → Actions). The deploy
   workflow re-applies a GitHub secret with that name on every deploy, so the next deploy rotates the
   Worker to the same value. To apply it now, also run
   `pnpm exec wrangler secret put INTERNAL_API_TOKEN --name <worker>` and paste the same value.
2. If you still have the generated value from somewhere else, store that value as the GitHub secret.

Until the two values match, the deep check fails with `deep_check: HTTP 401`. This is deliberate: a
monitor that cannot see is an incident. Rotating the token also changes the token that scripts calling
`/api/internal/*` must use.

## Cloudflare-native monitoring to enable

Paths below were checked against developers.cloudflare.com on 2026-11-19. Where the docs give no
dashboard path, none is given here.

- **Workers Observability (logs).** Already on: `"observability": { "enabled": true, "head_sampling_rate": 1 }`
  in `wrangler.jsonc`. View it at **Workers & Pages → (select `grant-autopilot`) → Observability**.
  Saved queries to keep are listed in OPERATIONS.md "Logs". Add `msg = health.deep_degraded` and
  `msg = health.check_failed`.
- **Worker errors and CPU.** **Workers & Pages → (select the Worker)** shows the metrics, including
  the *Errors by invocation status* chart. CPU-limit kills appear there as *Exceeded CPU Time Limits*
  (outcome `exceededCpu` in analytics and Logpush).
- **Workers Issues (error alerting).** Issues groups uncaught exceptions, failed invocations, 5xx
  responses and logged errors from the Worker into issues, with no SDK. To get alerted, open the
  Worker's **Issues** page → **Automations** → **Add automation**. Choose a trigger (an occurrence
  threshold, or recurrence after inactivity) and a destination (generic webhook, chat, incident
  management, or a coding agent), turn on **Enabled**, then select **Create**. This is the
  Cloudflare-native way to alert on Worker errors.
- **Notifications.** The account's **Notifications** (Alerts) page has no Worker-, D1- or
  Queue-specific alert types (the error-rate alerts there cover zone or origin traffic and are
  Enterprise only). For usage spikes, use **Notifications → Add → Billable Usage** (Professional plan
  or higher), which watches one product metric against a threshold. The docs do not confirm that
  Workers CPU time is one of the selectable metrics, so check in the dashboard. Use budget alerts for
  total spend.
- **D1 metrics.** **D1 → (select the database) → Metrics**. It shows read/write queries, rows
  read/written, query latency (server side), response size and storage. Watch *Rows read* after
  schema changes (full scans), and latency next to the `d1` check.
- **Queue backlog.** Backlog and lag are in the dashboard and in the GraphQL Analytics API
  (`queuesBacklogAdaptiveGroups`: `messages` and `bytes`; `queueMessageOperationsAdaptiveGroups`:
  `lagTime` and `retryCount`). The docs give no dashboard path. Watch `grant-autopilot-jobs` and its
  dead-letter queue `grant-autopilot-jobs-dlq`. Anything in the DLQ is a job that failed 3 times.
  Possible follow-up: the Queue binding has `JOBS.metrics()` → `{ backlogCount, backlogBytes,
  oldestMessageTimestamp }`, which could become an 8th deep check (oldest message older than 30 min
  → warn). It is not added yet because the local test runtime has not been verified to support it.

## SLO proposal

| SLI | Measured by | Objective (calendar month) | Error budget |
| --- | ----------- | -------------------------- | ------------ |
| Availability of `GET /api/health` (HTTP 200, `ok: true`, after retries) | `grants-monitor` probes (`public` check) | **99.5%** | 3.6 h a month, about 14 failed 15-minute probes |
| API server errors | Workers Observability: `msg = http.request AND status >= 500` / all `http.request` | < 1% of requests, per day | — |
| Discovery freshness | `discovery` check | a successful run within 30 h on ≥ 29 days a month | 1 late day |
| Pipeline progress | `stuck_applications` | ≥ 95% of applications leave drafting/verifying within 2 h | 5% |

- Start by reporting the SLOs, not paging on them. Review them monthly from the incident issues
  (opened/closed times) and the Actions run history. The run conclusion is red for **any** failing
  check, so red runs are an upper bound on `/api/health` downtime. The `public` row in each run's
  summary is the exact SLI.
- One probe stands for 15 minutes, so the SLI is coarse. Probes that GitHub skips count as neither
  good nor bad.
- **Budget policy:** if more than half the monthly budget (1.8 h) is spent, pause risky deploys
  (migrations, pipeline changes) until the cause is fixed. If the budget is spent, only fixes ship.

## On-call checklist

When an `incident` issue opens (or the deep check shows warnings):

1. **Acknowledge.** Comment on the issue with who is looking. Open the linked run, and read the
   failing checks and their details.
2. **Scope it.** If `public` fails: is the site down for users? Open `$APP_URL` (`https://marisstella.app/grants`), check
   https://www.cloudflarestatus.com, and look at the latest `grants-deploy` run. A failed or partial
   deploy is the most common cause.
3. **Work the failing check:**

   | Check | First steps |
   | ----- | ----------- |
   | `public` / `deep_check` HTTP 5xx or 000 | Observability: `msg = unhandled_error` and `status >= 500`, grouped by `route`. If it started with a deploy, roll back: `pnpm exec wrangler rollback --name <worker>` (code + vars only, D1 is not rolled back; see DEPLOY.md). |
   | `deep_check` HTTP 401 / 404 | The token is out of sync, not an outage. See "Enabling the deep check from GitHub". |
   | `d1` | D1 → Metrics (latency, rows read). A recent migration or a new full-scan query? Check Cloudflare status for D1. |
   | `r2` | Cloudflare status for R2. Uploads and downloads will fail too: `msg = http.request` on `/documents` routes. |
   | `discovery` | `curl -H "Authorization: Bearer $TOKEN" https://marisstella.app/grants/api/internal/discovery/runs` to read the latest runs' `error`. Logs: `msg = job.failed` with `type = discovery.run`. Confirm the deployed Worker still has its cron triggers. Re-run with `POST /api/internal/discovery/run`. Grants.gov outages are common: wait for the next run if the error is upstream. |
   | `stuck_applications` | Logs: `msg = job.failed`, and Workflow errors. List instances: `pnpm exec wrangler workflows instances list grant-autopilot-application-pipeline`. Check `llm_error_rate` and `llm_spend` first: a tripped cap or an Anthropic outage stops drafting. |
   | `stuck_documents` | Queue backlog and DLQ (`grant-autopilot-jobs-dlq`). Logs: `msg = job.failed` for the ingestion job types. Workers AI (`toMarkdown`, embeddings) errors? After a fix, editors can reprocess from the UI (`POST /documents/:id/reprocess`). |
   | `llm_error_rate` | https://status.anthropic.com, the `ANTHROPIC_API_KEY` validity, and the Anthropic console spend limit. Group the cost SQL "refusals/errors" query (OPERATIONS.md) by `purpose`. |
   | `llm_spend` | Is it a runaway loop or real demand? Run the "spend by purpose" and "per org" SQL in OPERATIONS.md. If it is runaway, use the kill switch: `echo 0 \| pnpm exec wrangler secret put GLOBAL_DAILY_LLM_CAP_USD`. |

4. **Communicate.** For user-visible impact longer than 30 minutes, post a status note to affected
   orgs or the status channel, and keep the issue updated with what you know.
5. **Recover and verify.** Run the workflow by hand (Actions → grants-monitor → Run workflow). The
   issue closes itself on the first run with no failing check. Do not close it by hand while it is
   still failing: the next run would open a new one.
6. **Follow up.** For any `fail` longer than 30 minutes, or any data or tenant impact, add a short
   postmortem comment before the issue closes: timeline, cause, fix, follow-ups. Then link the
   follow-up issues. Tune `THRESHOLDS` if the alert was noise.
