# Grant Autopilot: Operations

This doc covers the abuse and cost guards, how to change them, how to read the logs, and the kill switch.
Code: `src/worker/middleware/{rate-limit,request-limits,observability}.ts`,
`src/worker/services/guards/llm-budget.ts`, `src/worker/ports/budgeted-llm.ts`.

| Layer                  | Protects against                         | Response                                   |
| ---------------------- | ---------------------------------------- | ------------------------------------------ |
| Request limits         | huge bodies, form-post CSRF, junk input  | 413 `payload_too_large`, 415 `unsupported_media_type` |
| Rate limits            | credential stuffing, LLM/upload floods   | 429 `rate_limited` + `Retry-After`         |
| Org monthly LLM cap    | one tenant burning Claude spend          | 402 `llm_budget_exceeded`                  |
| Global daily LLM cap   | runaway bugs/loops, a compromised tenant | 429 `llm_capacity_exhausted`               |
| Anthropic console spend limit | everything above failing          | API errors (set it slightly above the global cap x 30) |

All errors use the standard `{ error: { code, message } }` shape.

## Rate limits

| Limiter         | Binding          | Key                          | Applies to                                                                                                                                                                                        | Limit     |
| --------------- | ---------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `authLimiter`   | `AUTH_LIMITER`   | client IP (`cf-connecting-ip`) | `POST /api/auth/*` (sign-in, sign-up, password reset)                                                                                                                                             | 20 / 60 s |
| `llmLimiter`    | `LLM_LIMITER`    | org + user                   | `POST /applications`, `POST /applications/:id/regenerate`, `PATCH /applications/:id/sections/:key`, `POST /interviews`, `POST /interviews/:id/{answer,complete}`, `POST /interviews/transcript`, `POST /imports/*`, `POST /matches/rescore`, `POST /transcribe`, `POST /documents/:id/reprocess` | 30 / 60 s |
| `uploadLimiter` | `UPLOAD_LIMITER` | org                          | `POST /documents`, `POST /documents/text`, `POST /imports/rfp`, `POST /interviews/transcript`, `POST /transcribe`                                                                                 | 20 / 60 s |
| `newsletterIpLimiter`, `newsletterEmailLimiter` | `NEWSLETTER_LIMITER` | client IP; SHA-256 of the address | `POST /api/newsletter/subscribe` (public; see docs/EMAIL_MARKETING.md)                                                                                                       | 5 / 60 s each |

The org route paths above are relative to `/api/orgs/:orgId`. The org limiters run after `requireOrg()`, so
non-members get a 404 before they use up any bucket.

**How it works.** In production the counters live in Cloudflare's
[Workers Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
bindings (`ratelimits` in `wrangler.jsonc`). Those counters are kept per Cloudflare location and are
eventually consistent: treat them as abuse protection, not exact quotas (the LLM caps are the exact
backstop). If a binding is missing (unit tests, plain `vite dev`), an in-isolate fixed-window counter
uses the same numbers. If a binding call throws, the request is let through (fail open) and
`rate_limit.binding_error` is logged.

**Changing a limit.** Edit both places together:

1. `wrangler.jsonc` → `ratelimits[].simple.limit` / `period`. Only `period` values of 10 or 60 are allowed.
   This value is the one production enforces.
2. `RATE_LIMITS` in `middleware/rate-limit.ts`, which sets the fallback counter and the `Retry-After` value.

Then deploy. To add a limiter, add a binding with a new unique `namespace_id` (any positive integer
string that is unique in the account), then write
`rateLimit({ binding, limit, periodSeconds, key, when })`.

**Tests.** Worker tests share one isolate and one fake IP, so under `APP_ENV=test` the presets apply
only when a request sends `x-test-rate-limit: enforce`. Better Auth also has its own limiter, which is
on by default in production.

## Request limits

`requestLimits()` covers `/api/*`. The first matching rule wins:

| Group        | Routes                                                                              | Max body | JSON required |
| ------------ | ----------------------------------------------------------------------------------- | -------- | ------------- |
| `upload`     | `POST /api/orgs/:orgId/{documents, imports/rfp, interviews/transcript, transcribe}` | 26 MiB (25 MiB file + envelope) | no (the handler validates multipart) |
| `large_json` | `POST /api/orgs/:orgId/documents/text`                                              | 8 MiB    | yes           |
| `webhook`    | `/api/billing/webhook`                                                              | 1 MiB    | no            |
| `auth`       | `/api/auth/*`                                                                       | 64 KiB   | no            |
| `json` (default) | every other POST/PUT/PATCH/DELETE                                             | 1 MiB    | yes, when a body is present |

- If the declared `Content-Length` is over the cap, the request gets a 413 before the body is read.
- Bodies without a declared length (chunked) are counted as the handler streams them. Once the cap is
  crossed, the read fails and the response is replaced with a 413. Nothing is buffered here.
- Writes without a body (for example `POST /applications/:id/withdraw`) need no content type.

To change a cap or add a group, edit `BODY_RULES` in `middleware/request-limits.ts`. Keep the upload cap
at or above each handler's own file limit (`MAX_UPLOAD_BYTES` and similar).

## LLM spend caps

`BudgetedLlm` wraps the real Claude client in `context.ts`. The FakeLlm is not capped. Before every call,
`LlmBudgetGuard` checks two caps:

1. **Global daily cap**: the sum of `llm_calls.cost_micros` since 00:00 UTC across every org and
   org-less work such as discovery. Default **$200/day**.
2. **Org monthly cap**: the sum for `orgId` since the 1st of the month (UTC). Default **$25/org/month**.

| Env var (string)            | Default | Values                                                    |
| --------------------------- | ------- | --------------------------------------------------------- |
| `ORG_MONTHLY_LLM_CAP_USD`   | `25`    | a number in USD; `off` removes the cap                    |
| `GLOBAL_DAILY_LLM_CAP_USD`  | `200`   | a number in USD; **`0` blocks all LLM calls**; `off` removes the cap |

Invalid values fall back to the default. Set these as **secrets**, not in `vars`, so they can be changed
without a deploy (`echo 50 | wrangler secret put ORG_MONTHLY_LLM_CAP_USD`). A name that is already
declared in `vars` cannot also be a secret. The config is read on every request, so a change applies to
the next request.

**Per-plan caps.** `createLlmBudgetGuard(env, db, logger, { orgCapMicros })` accepts a resolver that
returns an org's cap in micro-USD, for example from its subscription plan. If it returns `undefined`,
the env default applies; `null` means no cap.

**Behaviour.**

- Over the org cap: `BudgetExceededError` (an `AppError`, 402 `llm_budget_exceeded`). Over the global
  cap: 429 `llm_capacity_exhausted`. HTTP routes render these directly.
- In Workflows, any `AppError` below 500 becomes a `NonRetryableError`, so the pipeline fails fast.
- In the queue consumer, `isNonRetryableError(err)` acks the message instead of retrying it.
- Sums are cached in each isolate for 60 s, and each finished call's cost is added locally, so a burst
  in one isolate is counted at once. Several isolates and in-flight calls can still push spend past a
  cap, by roughly (isolates × calls in flight × cost per call). If the spend query fails, the guard
  lets the call through and logs `llm_budget.check_failed` at error level.
- A cached sum at 80% or more of its cap logs `llm_budget.near_cap` (warn), at most once a minute per
  isolate.

## Kill switch

Stop all Claude calls right away, without a code deploy:

```sh
echo 0 | pnpm exec wrangler secret put GLOBAL_DAILY_LLM_CAP_USD   # new Worker version, applies at once
# ...investigate...
pnpm exec wrangler secret delete GLOBAL_DAILY_LLM_CAP_USD          # back to the $200 default
```

With the switch on, LLM routes return 429 `llm_capacity_exhausted`, pipeline runs fail non-retryably,
and LLM queue jobs are acked. Everything else (browsing, facts, reviews) keeps working. For an outage
of the guard itself, revoke or rotate `ANTHROPIC_API_KEY`, or lower the workspace spend limit in the
Anthropic console.

To block a single org (an abusive tenant), prefer suspending its subscription. As a stopgap, a
`orgCapMicros` resolver can return `0` for that org.

## Logs (Workers Observability)

`observability` is on in `wrangler.jsonc`. Every API request writes one JSON line:

```json
{"level":"info","msg":"http.request","app":"grant-autopilot","env":"production","requestId":"8f2c…-IAD",
 "method":"POST","route":"/api/orgs/:orgId/applications/:id/regenerate","status":200,"durationMs":812,
 "orgId":"org_…","userId":"usr_…","colo":"IAD","ts":"2026-11-19T17:00:00.000Z"}
```

- The `route` field is the matched pattern (`unmatched` for 404s). Raw paths, query strings, bodies,
  headers and IPs are never logged.
- `durationMs` above 2000 adds `"slow": true` and logs at `warn`. A 5xx logs at `error`.
- Every response carries `x-request-id` (the `cf-ray` value). Ask users to send it with bug reports,
  then search for that `requestId`.
- Durations come from `Date.now()`, which only advances across I/O inside Workers. They measure wall
  time including I/O, not CPU time; CPU time is in Workers Metrics.

**Where to look.** In the Cloudflare dashboard, open Workers & Pages → `grant-autopilot` →
**Observability**. In the Query Builder, filter on the JSON fields:

| Question                       | Filter                                                                 |
| ------------------------------ | ---------------------------------------------------------------------- |
| Slow endpoints                 | `msg = http.request AND slow = true`, group by `route`, p95 `durationMs` |
| Error rate by route            | `msg = http.request AND status >= 500`, group by `route`               |
| Who is being rate limited      | `msg = rate_limit.blocked`, group by `limiter`, `orgId`                |
| Orgs at or near the LLM cap    | `msg = llm_budget.org_cap_reached` / `llm_budget.near_cap`, group by `orgId` |
| Global cap tripped             | `msg = llm_budget.global_cap_reached`                                  |
| Unhandled exceptions           | `msg = unhandled_error`                                                |
| Failed background jobs         | `msg = job.failed`, group by `type`                                    |
| Usage not recorded (spend blind spot) | `msg = llm_usage.record_failed`                                 |

For a live stream, run `pnpm exec wrangler tail grant-autopilot --format json`. Suggested alerts:
any `llm_budget.global_cap_reached`, a 5xx rate above 2% over 5 minutes, and `llm_usage.record_failed`.

## Cost dashboard (SQL on `llm_calls`)

`cost_micros` is in micro-USD (1e-6 USD) and `created_at` is epoch milliseconds. Run these with
`pnpm exec wrangler d1 execute grant-autopilot --remote --command "<sql>"`, or in the dashboard D1
console.

```sql
-- Month-to-date spend per org vs the $25 cap (top 25)
SELECT c.org_id, o.name,
       ROUND(SUM(c.cost_micros) / 1e6, 2)            AS usd,
       ROUND(100.0 * SUM(c.cost_micros) / 25e6, 1)   AS pct_of_cap,
       COUNT(*)                                      AS calls
FROM llm_calls c LEFT JOIN organization o ON o.id = c.org_id
WHERE c.created_at >= strftime('%s', 'now', 'start of month') * 1000
GROUP BY c.org_id ORDER BY usd DESC LIMIT 25;

-- Global spend per UTC day, last 30 days (compare with GLOBAL_DAILY_LLM_CAP_USD)
SELECT date(created_at / 1000, 'unixepoch') AS day,
       ROUND(SUM(cost_micros) / 1e6, 2) AS usd, COUNT(*) AS calls
FROM llm_calls
WHERE created_at >= strftime('%s', 'now', '-30 days') * 1000
GROUP BY day ORDER BY day;

-- Month-to-date spend by purpose and model (where the money goes)
SELECT purpose, model, COUNT(*) AS calls,
       ROUND(SUM(cost_micros) / 1e6, 2) AS usd,
       ROUND(AVG(cost_micros) / 1e6, 4) AS avg_usd,
       ROUND(AVG(latency_ms))           AS avg_ms
FROM llm_calls
WHERE created_at >= strftime('%s', 'now', 'start of month') * 1000
GROUP BY purpose, model ORDER BY usd DESC;

-- Most expensive applications this month
SELECT application_id, org_id, COUNT(*) AS calls, ROUND(SUM(cost_micros) / 1e6, 2) AS usd
FROM llm_calls
WHERE application_id IS NOT NULL
  AND created_at >= strftime('%s', 'now', 'start of month') * 1000
GROUP BY application_id ORDER BY usd DESC LIMIT 20;

-- Prompt-cache hit rate and refusals/errors, last 7 days
SELECT purpose,
       ROUND(100.0 * SUM(cache_read_tokens) / NULLIF(SUM(input_tokens + cache_read_tokens), 0), 1)
         AS cache_hit_pct,
       SUM(stop_reason = 'refusal') AS refusals,
       SUM(error IS NOT NULL)       AS errors
FROM llm_calls
WHERE created_at >= strftime('%s', 'now', '-7 days') * 1000
GROUP BY purpose ORDER BY cache_hit_pct;
```

## Known limits and follow-ups

- The global daily sum scans `llm_calls` by `created_at`, which has no standalone index; only
  `(org_id, created_at)` is indexed. With the 60 s cache this is fine at low volume. Add
  `index("llm_calls_created_idx").on(t.createdAt)` to `db/schema/ops.ts` as the table grows.
- `llm_calls` rows are written only for calls that return a response, so retries inside the Anthropic
  SDK that fail are not counted. Those are rarely billed.
- The rate limits and LLM caps are per org, not per plan. Wire `orgCapMicros` to `src/shared/billing`
  plans when pricing settles.
