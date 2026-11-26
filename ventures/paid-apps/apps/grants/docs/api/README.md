# Grant Autopilot HTTP API

This folder documents the API **as implemented** in `src/worker/routes/**` and mounted in
`src/worker/app.ts`. The planned contract lives in `docs/ARCHITECTURE.md`. Where the two differ,
the code is what's described here.

| File                             | What it is                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `openapi.yaml`                   | OpenAPI 3.1 spec: every path and method, params, bodies, responses, error codes, roles |
| `../../scripts/check-openapi.mjs` | Checks the spec against the route registrations. Exits 1 on a mismatch       |

```sh
node scripts/check-openapi.mjs            # from apps/grants
node scripts/check-openapi.mjs --verbose  # list every matched endpoint + role
```

The checker reads mount points from `app.ts` and the `routes.get|post|put|patch|delete(...)`,
chained `.get(...)` and `routes.on([...])` registrations in each mounted router. It reports
endpoints missing from the spec, extra endpoints in the spec, and `x-required-role` values that
differ from the `requireRole()` / `requireOrg()` / `requireUser` middleware. It also warns about
route files that are not mounted. It has no dependencies. Its small YAML parser reads only a
block-style subset, so the spec has no anchors and no flow collections other than `[]` and `{}`.
Quote any key that is not a plain identifier.

Spec extensions:

- `x-required-role`: the minimum role.
- `x-error-codes`: the `error.code` values a status can carry.
- `x-body-limit`: which request-limits rule applies.
- `x-rate-limit`: which limiters apply.

## Conventions

- JSON everywhere, except for file downloads and multipart uploads.
- Timestamps are ISO-8601 strings.
- Money is integer US cents (`*Cents`). LLM cost is integer micro-USD (`costMicros`).
- IDs are prefixed strings (`doc_`, `fct_`, `app_`, `sub_`, ...).
- Single resources return the object itself: the DB row serialized (`src/shared/api/types.ts`),
  sometimes with joined extras such as `match`, `opportunity`, `turns`, `facts`, `chunks`,
  `factCount`, `openBlockers`, `application` or `followups`.
- Every response carries `x-request-id`, which is the `cf-ray` value when present. Quote it in
  bug reports; it is also in the structured access log.
- API responses carry `Cache-Control: no-store` unless the handler sets something else.
  `GET /api/legal*` sets `public, max-age=300`, and downloads set `private, no-store`.
  The API also sends `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and HSTS in production.

## Authentication

| Kind              | Used by                         | How                                                                                 |
| ----------------- | ------------------------------- | ----------------------------------------------------------------------------------- |
| Session cookie    | `/api/me/*`, `/api/orgs/**`, `/api/demo/*` | Better Auth cookie `better-auth.session_token` (`__Secure-` prefix over HTTPS). HttpOnly, SameSite=Lax, Secure on hardened deploys. 14-day expiry, refreshed at most daily (the refreshed `Set-Cookie` is forwarded on any API response). |
| None              | `/api/health`, `/api/legal*`, `/api/auth/*` | Public.                                                                      |
| Bearer token      | `/api/internal/*`               | `Authorization: Bearer $INTERNAL_API_TOKEN`, compared in constant time. All internal routes return 404 when the token is not configured. |
| Signature         | `POST /api/billing/webhook`     | Provider signature only (see [Webhooks](#webhooks)).                                |

Sign-up and sign-in go through Better Auth at `/api/auth/*`. Only GET and POST are routed. The
main endpoints are:

- `POST /sign-up/email` `{name,email,password}`. Passwords are 10 to 128 characters.
- `POST /sign-in/email`. Refused until the email address is verified. Verification is
  required on HTTPS and production deploys. It is skipped in tests and in the plain-http offline
  demo (`FAKE_EXTERNALS=true`).
- `POST /sign-out` and `GET /get-session`.
- Email verification: `GET /verify-email?token=` and `POST /send-verification-email`.
- Password reset: `POST /request-password-reset` and `POST /reset-password`.
- `POST /change-password` and `POST /update-user`.
- Google OAuth, when configured: `POST /sign-in/social` `{provider:"google"}` and
  `GET /callback/google`.

`/list-sessions` is disabled; use `GET /api/me/sessions` instead. Better Auth's request and
response bodies, including its errors, use Better Auth's own format, not the envelope below.

Without a valid session, `/api/me/*` and `/api/orgs/**` return
`401 {"error":{"code":"unauthorized"}}`.

**CSRF.** State-changing requests (anything but GET, HEAD and OPTIONS) under `/api/*` that send
an `Origin` header must match `APP_URL` or the request's own origin. Otherwise the response is
`403 bad_origin`. Requests without an `Origin` header (non-browser clients) pass. The webhook,
internal, health and legal routes are mounted before this check. JSON bodies must also be sent as
`application/json` (see [Request limits](#request-limits)), which blocks "simple" cross-site form
posts.

**Tests only.** When `APP_ENV=test`, the header `x-test-user-id: <userId>` signs the request in
as that user. This header is never honored in any other environment.

## Roles and tenancy

All org data lives under **`/api/orgs/{orgId}/...`**, behind `requireOrg("viewer")`:

- **Not a member, or an unknown org:** `404 not_found`, never 403, so org ids cannot be probed.
- **Member without the required role:** `403 forbidden`.
- **The org comes only from the path.** Services filter every query by the path's org.
  An `orgId` in a request body is never trusted.
- **Ids from other orgs return 404.** This includes looking up a resource id that belongs to
  another org.

Roles, from most to least privileged, are `owner > admin > editor > reviewer > viewer`. Each
operation's minimum role is in `x-required-role`:

| Role       | Can do                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| `viewer`   | All reads (including `POST /search`, member and invitation lists, the dashboard and billing overview) and user-level consents (`terms_of_service`, `privacy_policy`, `ai_interview`) |
| `reviewer` | Review decisions (`POST /reviews/{id}/decision`, the one-click approve), feedback, and confirming a manual submission (`POST /submissions/{id}/confirm`) |
| `editor`   | Content writes: profile, documents, facts, projects, interviews, transcribe, imports (URL / RFP), matches, applications, follow-ups, confirming submission emails |
| `admin`    | `PATCH /settings`, member and invitation management, `POST /imports/website`, org-level consents, audit log, data exports, billing checkout and portal |
| `owner`    | `DELETE /privacy/org`. Only owners can grant the owner role, invite owners or remove owners. The last owner cannot be removed or demoted (`409`). |

Values that are not member roles: `public` (no auth), `authenticated` (any signed-in user, no org
needed), `internal-token` and `webhook-signature`.

The org overview is served at both `GET /api/orgs/{orgId}` and `GET /api/orgs/{orgId}/`, because
Hono routing is strict about trailing slashes.

Opportunities are a global public catalog. Rows that an org imports by URL or RFP have
`privateToOrgId` set and are visible only to that org.

## Errors

The standard envelope, used for every `AppError`, zod error, `HTTPException`, the 404 handler, the
Origin check and the request/rate limits:

```json
{ "error": { "code": "validation_error", "message": "Invalid request", "details": [ /* zod issues */ ] } }
```

`code` is stable and safe to switch on. `message` is meant for humans. `details` is optional:
zod issues, `{ currentVersion }`, `{ documentId, title }`, `{ reason }`, `{ scope }`, `{ orgs }`
and so on. Each response in the spec lists its codes in `x-error-codes`.

| Status | Codes                                                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `validation_error`, `bad_request` (also malformed JSON or an invalid Content-Length), `consent_required` (upload without consent), `terms_not_accepted`, `policy_version_mismatch` |
| 401    | `unauthorized`, `invalid_signature` (webhook)                                                                                              |
| 402    | `payment_required` (no active plan, or no draft quota left), `llm_budget_exceeded` (the org's monthly AI cap)                               |
| 403    | `forbidden`, `bad_origin`, `consent_required` (AI interview or website crawl consent), `crawl_not_enabled`, `invalid_password`, `reauth_required` |
| 404    | `not_found`                                                                                                                                |
| 409    | `conflict`, `duplicate_document`, `document_processing`, `open_blockers`, `email_changed`, `last_owner`                                    |
| 410    | `invitation_expired`, `original_unavailable` (`details.reason`: `retention_purged` or `missing`), `expired` (data export)                    |
| 413    | `payload_too_large` (request-limits middleware), `file_too_large` (documents, RFP), `too_large` (audio, transcript)                         |
| 415    | `unsupported_media_type` (a JSON body without a JSON content type, or non-audio for transcribe), `unsupported_file_type`, `file_content_mismatch` |
| 422    | Imports and watchlist only: `unsupported_content`, `too_large`, `fetch_failed`, `robots_disallowed`, `robots_unavailable`, `no_text`, `not_an_opportunity`, `too_many_sources` |
| 429    | `rate_limited` (with `Retry-After`), `llm_capacity_exhausted` (the global daily AI cap), `org_limit` (25 owned orgs per user)                |
| 500    | `internal_error`. Other `HTTPException`s map to `http_error`.                                                                              |
| 502    | `transcription_failed`                                                                                                                     |
| 503    | `billing_unavailable`                                                                                                                      |

Every router validates with `validate(target, schema)` from `src/worker/lib/validate.ts` (a
`zValidator` wrapper), so input that fails validation always returns the standard envelope above
with `code: "validation_error"` and the zod issues in `details`.

## Pagination

Every list returns `{ "items": [...] }`. Almost none of them paginate. Each returns its newest or
most relevant rows up to a fixed cap:

| Endpoint                                              | Cap / order                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| `GET /privacy/audit-log?cursor=&limit=`               | **Keyset cursor.** `limit` 1-200 (default 50). Pass `nextCursor` back as `cursor`; `null` means the end. 400 `bad_request` for a bad cursor |
| `GET /facts`                                          | `limit` 1-2000 (default 1000), newest first. `nextCursor: null`    |
| `GET /projects`, `GET /interviews`                    | All projects, or 100 interviews. `nextCursor: null`                |
| `GET /opportunities`                                  | `limit` 1-500 (default 200), by match expected value, then deadline |
| `GET /matches`, `/applications`, `/reviews/queue`, `/submissions` | 200                                                     |
| `GET /submissions/followups`, `/privacy/consents`     | 500                                                                |
| `GET /documents`                                      | 1000                                                               |
| `GET /privacy/exports`, `GET /api/me/invitations`     | 50                                                                 |
| `GET /api/internal/discovery/runs?limit=`             | 1-200 (default 50)                                                 |

Filters that accept several values take comma-separated lists: `status` and `category` on
`/facts`, `status` on `/matches` (which also accepts `all`), and `status` on `/applications`
(unknown values are dropped silently).

## Idempotency

There is no `Idempotency-Key` header. These are the retry semantics that matter:

| Operation                                                       | Behavior on repeat                                                     |
| --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `POST /api/billing/webhook`                                     | Deduplicated by provider event id (unique index): `outcome: "duplicate"` |
| `POST /documents`, `POST /documents/text`                       | Same bytes in the org: `409 duplicate_document` (`details.documentId`) |
| `POST /interviews/transcript`                                   | The same transcript returns the existing interview (no duplicate facts) |
| `POST /imports/opportunity-url`                                 | The same URL refreshes the org's existing private opportunity          |
| `POST /applications`                                            | `409 conflict` while an application for that opportunity is active     |
| `POST /privacy/exports`                                         | `409 conflict` while an export from the last 10 minutes is pending     |
| `POST /members/invitations`                                     | Re-inviting cancels the previous pending invitation and sends a new one |
| `POST /api/me/invitations/{id}/accept`                          | Single use: the second accept gets `409`                               |
| `POST /facts/{id}/confirm`, `POST /interviews/{id}/complete`, `POST /submissions/{id}/confirm`, `POST /opportunities/{id}/confirm-submission-email`, `PATCH /matches/{id}` (same status), `PATCH /profile`, `PATCH /settings` (no changes) | No-op: returns the current state |
| `POST /privacy/consents`                                        | Append-only: every call writes a new consent record                    |
| `POST /matches/rescore`, `POST /imports/website`, `DELETE /privacy/org`, `POST /api/internal/discovery/run` | Each call enqueues a job (`202 {queued:true}`) |

## Rate limits

Rate limits come from `middleware/rate-limit.ts`, mounted in `app.ts`. In production the counters
live in Workers Rate Limiting bindings (`ratelimits` in `wrangler.jsonc`), counted per Cloudflare
location. Without the bindings, a per-isolate fixed window is used. A blocked request gets
`429 {"error":{"code":"rate_limited"}}` with `Retry-After` in seconds. If the binding errors, the
limiter fails open.

| Limiter          | Key                | Applies to                                                                                                                                  | Limit        |
| ---------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `auth`           | client IP          | `POST /api/auth/*`                                                                                                                          | 20 / 60 s    |
| `llm`            | org + user         | `POST /applications`, `POST /applications/{id}/regenerate`, `PATCH /applications/{id}/sections/{key}`, `POST /interviews`, `POST /interviews/{id}/answer\|complete`, `POST /interviews/transcript`, `POST /imports/*`, `POST /matches/rescore`, `POST /transcribe`, `POST /documents/{id}/reprocess` | 30 / 60 s |
| `upload`         | org                | `POST /documents`, `POST /documents/text`, `POST /imports/rfp`, `POST /interviews/transcript`, `POST /transcribe`                            | 20 / 60 s    |
| `account-delete` | user (per isolate) | `DELETE /api/me`                                                                                                                            | 5 / 15 min   |
| watchlist check  | source             | `POST /watchlist/{id}/check` (service-level: 10-minute manual cooldown, per-host spacing)                                                    | 1 / 10 min   |

Paths in this table are relative to `/api/orgs/{orgId}` unless shown in full.

Other limits:

- **Better Auth** has its own per-IP limiter on hardened deploys, with Better Auth's own error
  format. The defaults are 100/60 s, sign-in 10/60 s, sign-up 5/60 s,
  send-verification-email 3/60 s, request-password-reset 3/60 s and reset-password 10/60 s.
- **AI spend caps** (`services/guards/llm-budget.ts`): `402 llm_budget_exceeded` when the org's
  monthly cap is hit, `429 llm_capacity_exhausted` when the global daily cap is hit.
- **Plan quota**: `402 payment_required` on `POST /applications`. Regenerating an existing
  application doesn't use quota.
- **Org creation**: `429 org_limit` once a user owns 25 orgs.

In worker tests (`APP_ENV=test`), the preset limiters apply only to requests that send
`x-test-rate-limit: enforce`.

## Request limits

`requestLimits()` covers `/api/*` and applies to POST, PUT, PATCH and DELETE. The first matching
rule wins. A declared `Content-Length` over the cap gets `413 payload_too_large` before the body
is read. Bodies without a declared length are counted while they stream. A JSON route with a body
must send `Content-Type: application/json` or a `+json` type, or it gets
`415 unsupported_media_type`.

| Rule         | Routes                                                                          | Max body | JSON required |
| ------------ | ------------------------------------------------------------------------------- | -------- | ------------- |
| `upload`     | `POST /api/orgs/{orgId}/{documents, imports/rfp, interviews/transcript, transcribe}` | 26 MiB | no        |
| `large_json` | `POST /api/orgs/{orgId}/documents/text`                                         | 8 MiB    | yes           |
| `webhook`    | `/api/billing/webhook`                                                          | 1 MiB    | no            |
| `auth`       | `/api/auth/*`                                                                   | 64 KiB   | no            |
| `json`       | everything else (including `/api/internal/*`)                                   | 1 MiB    | yes, if a body is sent |

Handlers also enforce their own file limits:

- Documents: 25 MB. Allowed extensions are pdf, docx, doc, txt, md, html, csv, xlsx, rtf, png
  and jpg. The bytes must match the declared type.
- RFPs: 20 MB, PDF, DOCX or TXT.
- Audio: 20 MB, `audio/*`.
- Transcript files: 5 MB, .txt, .md, .vtt or .srt.
- Pasted text: 2,000,000 characters.

## Webhooks

**Inbound: `POST /api/billing/webhook`.** This endpoint receives billing events from the merchant
of record. It is mounted before the Origin check and the session middleware, so only the provider
signature is trusted:

- **Paddle:** `Paddle-Signature: ts=<unix>;h1=<hex HMAC-SHA256 of "<ts>:<rawBody>">`.
- **Fake provider** (tests, demo): `x-fake-signature: <hex HMAC-SHA256(secret, body)>`.

| Response | Code / body                                                      | When                               |
| -------- | ---------------------------------------------------------------- | ---------------------------------- |
| 200      | `{ received: true, outcome: "applied" \| "duplicate" \| "ignored" }` | Event accepted                     |
| 401      | `invalid_signature`                                              | Signature check failed             |
| 400      | `bad_request`                                                    | Event id missing                   |
| 503      | `billing_unavailable`                                            | No provider configured             |

Events are recorded in `billing_events`, and the unique index on (provider, event id) makes
replays safe. An `ignored` outcome means the event was recorded but did not change anything: no
subscription data, an unknown org or plan, or a stale subscription.

**Outbound.** There are none. Grant Autopilot does not call customer webhooks. Notifications go
out by email (Resend), and background work runs on the `JOBS` queue, a cron schedule and the
`ApplicationPipeline` Workflow.

**Operator triggers.** These take the bearer token:

- `POST /api/internal/discovery/run` `{source?}` returns `202 {queued, sources}`.
- `GET /api/internal/discovery/runs` lists recent discovery runs.
- `POST /api/internal/discovery/seed-samples` adds the sample opportunities.

## Not (yet) part of the API

- `src/worker/routes/org/{eligibility,prospects}.ts` exist but are not mounted in `app.ts`, so
  they are not in the spec. The checker warns about them. Add them to the spec when they are
  mounted.
- `POST /api/demo/seed` is in the spec, but it only answers when `FAKE_EXTERNALS=true`,
  `DEMO_MODE=true` or `APP_ENV` is not production. Otherwise it returns a plain 404.
