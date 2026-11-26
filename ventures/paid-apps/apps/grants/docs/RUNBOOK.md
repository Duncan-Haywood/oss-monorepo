# Grant Autopilot: Incident runbook

Playbooks for production incidents, plus the backup policy and the monthly restore drill. Companion
docs: [MONITORING.md](MONITORING.md) (alerts, health checks, on-call checklist), [OPERATIONS.md](OPERATIONS.md)
(caps, kill switch, logs, cost SQL), [WORKFLOWS.md](WORKFLOWS.md) (pipeline states), [DEPLOY.md](DEPLOY.md)
(pipeline, secrets), [DATA_POLICY.md](DATA_POLICY.md) (deletion promises). Scripts: [`scripts/ops/`](../scripts/ops/README.md).

**Conventions**

- Run every command from `apps/grants` with Cloudflare credentials (`CLOUDFLARE_API_TOKEN` +
  `CLOUDFLARE_ACCOUNT_ID`, or `pnpm exec wrangler login`). Always pass `--name grant-autopilot` to Worker
  commands: `wrangler.jsonc` is the local-dev config, the deploy uses a generated one.
- Commands were checked against `pnpm exec wrangler <cmd> --help` for **wrangler 4.165.0** and the
  Cloudflare docs (2026-11-19). Anything marked **[unverified]** was not confirmed in either; check it
  before you rely on it in an incident, and fix this doc when you do.
- SQL runs with `pnpm exec wrangler d1 execute grant-autopilot --remote --command "<sql>"` (add `--json`
  to save output). Timestamps in D1 are epoch **milliseconds**.
- Keep a UTC timeline of every action in the incident record. Security incidents (sections 8 and 9)
  go in a private channel, not in a GitHub issue: `incident` issues are visible to every repo reader.

| Resource | Production | Demo |
| --- | --- | --- |
| Worker | `grant-autopilot` | `grant-autopilot-demo` |
| D1 (binding `DB`) | `grant-autopilot` | `grant-autopilot-demo` |
| R2 (binding `FILES`) | `grant-autopilot-files` | `grant-autopilot-demo-files` |
| Vectorize | `grant-autopilot-chunks` | `grant-autopilot-demo-chunks` |
| Queue / DLQ | `grant-autopilot-jobs` / `grant-autopilot-jobs-dlq` | `grant-autopilot-demo-jobs` / `-dlq` |
| Workflow | `grant-autopilot-application-pipeline` | `grant-autopilot-demo-application-pipeline` |

**Severity.** SEV1: site down, data loss, any cross-tenant exposure or leaked credential. SEV2: a core
flow broken (drafting, submission, sign-up email), spend out of control. SEV3: degraded or delayed
(discovery stale, DLQ growing slowly). SEV1/2 get an incident lead and status updates every 30 min.

---

## 1. Site down or 5xx spike

1. **Confirm and scope.** `curl -fsS https://marisstella.app/grants/api/health` (`$APP_URL`; the Worker's own host answers `https://$APP_DOMAIN/grants/api/health` even when the catalogue forward is down). In Workers Observability:
   `msg = http.request AND status >= 500`, grouped by `route`; `msg = unhandled_error`. Live:
   ```sh
   pnpm exec wrangler tail grant-autopilot --format json --status error
   ```
   Check the Cloudflare status page and `GET /api/health/deep` (MONITORING.md) for D1 / Workers AI.
2. **Did it start with a deploy?** Compare the start time with:
   ```sh
   pnpm exec wrangler deployments list --name grant-autopilot
   pnpm exec wrangler versions list --name grant-autopilot
   ```
3. **Roll back** to the last good version (rollback swaps code and vars; it does **not** touch D1):
   ```sh
   pnpm exec wrangler rollback <version-id> --name grant-autopilot -m "INC-<n>: 5xx after <sha>"
   ```
   - Without `<version-id>` wrangler offers the previous version. Only the 100 most recent versions
     can be targeted, and a rollback is refused if the target binds a queue or bucket that no longer exists.
   - If wrangler warns "The following secrets have changed since version … was deployed" and a listed
     secret was rotated for security, answer **no**: whether the older version brings back the old
     secret value is **[unverified]**, so assume it does.
   - If the bad release ran a migration, the old code must still work on the new schema (migrations are
     expand-only by policy). If it does not, see section 6.
4. **Stop the bleeding from `main`.** Every push to `main` redeploys. Hold merges, then land a revert PR;
   the normal pipeline redeploys the fixed code (the durable fix, DEPLOY.md "Rollback").
5. **Not a deploy?** One route failing usually means one dependency: LLM routes (section 2), uploads
   (Workers AI `toMarkdown`, R2), sign-in (D1, Better Auth). `pnpm exec wrangler d1 info grant-autopilot`
   shows D1 size and state. A Cloudflare-side incident: post a status note and wait; nothing to roll back.

## 2. Claude outage or refusals

**What already happens on its own**

| Layer | Behaviour |
| --- | --- |
| Anthropic SDK | `maxRetries: 3` (retries 408/409/429/5xx and connection errors) per call |
| Queue jobs | consumer retries 3 times, delays `min(300, 10 x 2^attempts)` s, then the DLQ |
| Workflow LLM steps | 3 retries, 30 s exponential, 10 min timeout, then the application becomes `failed` |
| Refusals | server-side fallback (`fallbacks: "default"`); if the chain still refuses: `LlmRefusalError`, which queue jobs **ack** (no retry, no DLQ) and drafting turns into gaps/flags |

`llm_calls` rows exist only for calls that returned a response, so an outage barely shows there. Look at
logs instead: `msg = job.failed` grouped by `type`, and `stuck_applications` in the deep health check.

**Outage (5xx/529/timeouts from the API)**

1. Confirm on the Anthropic status page and in logs (`job.failed` errors mention the HTTP status).
2. Shorter than ~10 minutes: do nothing. Retries cover it.
3. Longer: pause queue delivery so jobs wait instead of exhausting their retries into the DLQ.
   ```sh
   pnpm exec wrangler queues pause-delivery grant-autopilot-jobs
   # ... when the API is healthy again:
   pnpm exec wrangler queues resume-delivery grant-autopilot-jobs
   ```
   This pauses **every** job type (document processing, privacy export/deletion, digests). Messages wait
   up to the queue's retention period (`pnpm exec wrangler queues info grant-autopilot-jobs`; default
   **[unverified]**, max 14 days on Workers Paid). Workflow steps cannot be paused in bulk: they fail
   after their retries.
4. Afterwards: replay the DLQ (section 4) and restart `failed` pipelines (section 5).

**Do not use the kill switch for a plain outage.** With `GLOBAL_DAILY_LLM_CAP_USD=0`, LLM queue jobs are
acked (dropped, not dead-lettered) and pipeline runs fail non-retryably, so work is lost rather than
delayed. Use it when calls *succeed* but must stop: a runaway loop, garbage or harmful output at scale,
a compromised key, or a cost spike (section 3).
```sh
echo 0 | pnpm exec wrangler secret put GLOBAL_DAILY_LLM_CAP_USD --name grant-autopilot   # applies to the next request
pnpm exec wrangler secret delete GLOBAL_DAILY_LLM_CAP_USD --name grant-autopilot         # back to the $200/day default
```
The deploy never syncs this secret, so a deploy does not undo it.

**Refusal spike**

```sql
SELECT purpose, COUNT(*) AS calls, SUM(stop_reason = 'refusal') AS refusals
FROM llm_calls WHERE created_at >= (strftime('%s','now') - 86400) * 1000
GROUP BY purpose HAVING refusals > 0 ORDER BY refusals DESC;
```
- Logs carry the category: `job.failed` errors read `Model declined request for <purpose> (<category>)`.
- Started with a deploy (prompt change)? Roll back (section 1). Started with one org's documents? That
  org's content trips a classifier: drafts degrade to gaps, nothing to fix in infra; tell the org.
- A 404 `not_found_error` for the model means `LLM_MODEL` (a `vars` entry) names a model the key cannot
  use. Fix it in `wrangler.jsonc` through a PR; do not hardcode another model.

## 3. Cost spike

1. **Signals:** `llm_budget.near_cap` / `llm_budget.global_cap_reached` logs, Anthropic Console usage,
   the deep check's `llm_spend`. If spend is still climbing fast, use the kill switch first (section 2)
   and investigate with it on.
2. **Find the org** (`org_id` NULL is org-less work such as discovery):
   ```sql
   -- Spend per org, last 24 hours
   SELECT c.org_id, o.name, COUNT(*) AS calls, ROUND(SUM(c.cost_micros) / 1e6, 2) AS usd
   FROM llm_calls c LEFT JOIN organization o ON o.id = c.org_id
   WHERE c.created_at >= (strftime('%s','now') - 86400) * 1000
   GROUP BY c.org_id ORDER BY usd DESC LIMIT 10;

   -- One org by hour and purpose: what is looping?
   SELECT strftime('%Y-%m-%d %H:00', created_at / 1000, 'unixepoch') AS hour, purpose, application_id,
          COUNT(*) AS calls, ROUND(SUM(cost_micros) / 1e6, 2) AS usd
   FROM llm_calls
   WHERE org_id = 'org_REPLACE' AND created_at >= (strftime('%s','now') - 86400) * 1000
   GROUP BY hour, purpose, application_id ORDER BY hour DESC, usd DESC LIMIT 50;
   ```
   OPERATIONS.md "Cost dashboard" has the month-to-date and per-application queries.
3. **Cap it.** What exists today:

   | Lever | Command / action | Scope |
   | --- | --- | --- |
   | Kill switch | `echo 0 \| pnpm exec wrangler secret put GLOBAL_DAILY_LLM_CAP_USD --name grant-autopilot` | every org |
   | Lower the org cap for everyone | `echo 5 \| pnpm exec wrangler secret put ORG_MONTHLY_LLM_CAP_USD --name grant-autopilot` | every org at or above $5 this month gets 402 |
   | Stop one loop | terminate the application's Workflow instance (section 5); pause the queue (section 2) | one application / all jobs |
   | Per-org cap | **not wired**: `context.ts` calls `createLlmBudgetGuard(env, db, logger)` without an `orgCapMicros` resolver, so there is no runtime switch for a single org. It needs a code change and a deploy. | one org |
   | Abusive tenant | contact the owner; cancel the plan in the billing provider. There is no suspension flag (`routes/admin.ts`). | one org |

   Restore the org cap afterwards: `pnpm exec wrangler secret delete ORG_MONTHLY_LLM_CAP_USD --name grant-autopilot`.
4. **Backstop:** keep the Anthropic Console workspace spend limit slightly above 30 x the global cap.
5. **After:** reconcile `llm_calls` with Anthropic Console usage. Any `llm_usage.record_failed` log
   means spend the guard could not see.

## 4. Queue backlog or DLQ growth

Anything in `grant-autopilot-jobs-dlq` is a job that failed 4 deliveries (first try + 3 retries).

1. **Look.**
   ```sh
   pnpm exec wrangler queues info grant-autopilot-jobs
   pnpm exec wrangler queues info grant-autopilot-jobs-dlq
   pnpm exec wrangler queues consumer list grant-autopilot-jobs
   node scripts/ops/dlq-replay.mjs            # DLQ summary by job type (changes nothing)
   node scripts/ops/dlq-replay.mjs --list     # one line per message: id, type, attempts, age, *Id fields
   ```
   Logs: `msg = job.failed`, grouped by `type`; the `error` field says why.
2. **Main queue backlog, DLQ flat:** the consumer is slow or something enqueues in a loop. Check
   `job.failed` volume and which type dominates (`--search job.failed` on `wrangler tail`). A loop that
   burns LLM spend: section 3.
3. **DLQ growing:** fix the cause first (deploy), or replayed jobs fail 4 more times and come straight back.
   ```sh
   node scripts/ops/dlq-replay.mjs --replay --type document.process --limit 50 --dry-run
   node scripts/ops/dlq-replay.mjs --replay --type document.process --limit 50
   ```
   - Replay is at-least-once: the script pushes to the main queue, then acks in the DLQ.
   - `privacy.delete_org` and `privacy.export_org`: replay them; a deletion must finish.
   - `followups.run_due`, `discovery.run`, `privacy.retention_sweep`, `digest.*`: the next cron run does
     the same work. Replaying a stale `digest.*` can email people twice, so leave those to expire.
   - Unknown or undecodable messages are never replayed unless `--type` names them.
4. **Retention.** A DLQ message is deleted when its retention period ends (4 days for a DLQ without a
   consumer per the docs; check `queues info`). During an incident, raise it to the maximum:
   `pnpm exec wrangler queues update grant-autopilot-jobs-dlq --message-retention-period-secs 1209600`.
5. **Last resort**, deletes every message: `pnpm exec wrangler queues purge grant-autopilot-jobs-dlq`
   (asks for confirmation; `--force` skips it). Run the summary first and keep its output.

One-time setup the script needs (Appendix A): an HTTP pull consumer on the DLQ.

## 5. Stuck Workflow instances

The instance id is the application id (`app_…`). Read WORKFLOWS.md "Inspecting, terminating,
restarting" for the state machine; the flags below are from wrangler 4.165.

```sh
W=grant-autopilot-application-pipeline
pnpm exec wrangler workflows instances list $W --status errored        # queued|running|paused|errored|terminated|complete
pnpm exec wrangler workflows instances list $W --status running --date-start 2026-11-01
pnpm exec wrangler workflows instances describe $W app_123             # steps, attempts, errors
pnpm exec wrangler workflows instances terminate $W app_123
pnpm exec wrangler workflows instances restart $W app_123              # from the start; steps are idempotent
pnpm exec wrangler workflows instances restart $W app_123 --from-step-name draft-0   # [unverified for this pipeline]
pnpm exec wrangler workflows instances send-event $W app_123 --type info_provided --payload '{"redraft":false}'
```

Find candidates in D1:
```sql
SELECT id, org_id, status, substr(last_error, 1, 120) AS last_error, workflow_instance_id,
       datetime(updated_at / 1000, 'unixepoch') AS updated
FROM applications
WHERE status IN ('draft_queued', 'drafting', 'verifying', 'submitting')
  AND updated_at < (strftime('%s','now') - 7200) * 1000
ORDER BY updated_at LIMIT 50;
```

| Application status | Instance | Action |
| --- | --- | --- |
| `needs_info` / `in_review` | `complete` (wait timed out) or `errored` | Nothing. The next human action runs inline. |
| `failed` | `errored` | Fix the cause, then `restart`, or let a user edit/regenerate (inline). |
| `drafting` / `verifying` for hours | `running` with a step retrying | `describe`; if the error is permanent, fix and `restart`; if it is an outage, wait. |
| any non-final | `terminated` or missing | Routes fall back to inline. To put it back on a Workflow, create an instance with `id = applicationId` (WORKFLOWS.md). |
| `approved` | `errored` after submit retries | Submission channel refused (section 11 for email). Fix, then `restart`. |

Never change `applications.status` by hand while an instance is live; send the matching event or
terminate the instance first.

## 6. Bad migration

Migrations run **before** the new code goes live, and a code rollback does not undo them.

1. **Classify.**
   - The migration step failed in `grants-deploy`: the new code was not deployed. See what applied:
     `pnpm exec wrangler d1 migrations list DB --remote` (lists unapplied migrations). Whether a failed
     file leaves earlier statements applied is **[unverified]**: inspect the schema
     (`SELECT name, sql FROM sqlite_master WHERE type = 'table'`).
   - It applied and the code is broken: roll back the code (section 1). Expand-only migrations make this safe.
   - It applied and destroyed or corrupted data (dropped column, bad `UPDATE`): Time Travel, below.
2. **Time Travel restore** (Workers Paid keeps 30 days). It overwrites the **whole shared database in
   place, for every tenant**: all writes after the restore point are lost and in-flight queries are
   cancelled. Restoring to another database is not supported.
   1. Hold merges to `main` and roll back the Worker to the version that matches the old schema.
   2. Pause the queue (`pnpm exec wrangler queues pause-delivery grant-autopilot-jobs`). If LLM work must
      stop too, turn on the kill switch.
   3. Export the current state, so nothing becomes unrecoverable:
      `node scripts/ops/d1-backup.mjs --out-dir <secure dir>` (section 12).
   4. Record org deletions after the restore point; the restore would bring those orgs back (section 7):
      ```sql
      SELECT target_id AS org_id, actor_id, created_at FROM audit_log
      WHERE action = 'organization.deleted' AND created_at >= <restore point, epoch ms>;
      ```
   5. Find the bookmark and restore:
      ```sh
      pnpm exec wrangler d1 time-travel info grant-autopilot --timestamp 2026-11-19T16:59:00Z
      pnpm exec wrangler d1 time-travel restore grant-autopilot --bookmark <bookmark>
      # or: pnpm exec wrangler d1 time-travel restore grant-autopilot --timestamp <RFC3339 or unix seconds>
      ```
      The restore prints a bookmark that undoes it. Record it in the incident log.
   6. Verify (row counts, `/api/health/deep`), resume the queue, turn off the kill switch.
   7. Re-run the deletions from step 4, and reconcile anything sent to the outside world after the
      restore point (`submissions` to funders, emails, billing events) from the step 3 export.
   8. `d1_migrations` was restored too, so the bad migration will **re-apply on the next deploy**.
      Remove or fix it on `main` before anything else merges.
3. **Prevention.** Record a bookmark before every migration:
   `pnpm exec wrangler d1 time-travel info grant-autopilot --json` (not automated in `grants-deploy` yet).

## 7. Accidental deletion

**Org deletion is intentional, not an accident.** `DELETE /api/orgs/:orgId/privacy/org` requires the owner
and the org name, and `privacy.delete_org` really deletes: R2 objects under `orgs/{orgId}/`, vectors, every
row including that org's audit log. It leaves only a receipt (`audit_log` with `org_id` NULL, `action =
'organization.deleted'`, `target_id` = org id). Do not restore a deleted org from Time Travel or a backup;
that breaks the promise in DATA_POLICY.md, and its files and vectors are gone anyway. Exception: the
deletion was made by an attacker (account takeover). Confirm with the verified owner and counsel first,
then recover the rows only, through a scratch database (below).

**Any full restore brings deleted orgs back.** Before a Time Travel restore or a backup import, run the
step 4 query in section 6. Afterwards, re-run each deletion by pushing the job to the main queue:
```sh
QID=$(curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/queues?name=grant-autopilot-jobs" \
  | jq -r '.result[] | select(.queue_name == "grant-autopilot-jobs") | .queue_id')
curl -fsS -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/queues/$QID/messages/batch" \
  -d '{"messages":[{"content_type":"json","body":{"type":"privacy.delete_org","orgId":"org_REPLACE","requestedBy":"usr_REPLACE"}}]}'
```
The daily `privacy.retention_sweep` re-applies raw-file retention by itself.

**D1 rows deleted by a bug or by hand**

| Situation | Recovery |
| --- | --- |
| Rows existed at the last nightly backup | Surgical: download the backup, import it into a scratch DB (section 12 drill, steps 2-3), `SELECT` the rows, write `INSERT`s for production (`PRAGMA defer_foreign_keys = true` first if FKs get in the way). Delete the scratch DB. |
| Rows created today | Only Time Travel has them, and it restores in place. Either a full restore (section 6), or restore to before the deletion, export the rows (`wrangler d1 export … --table <t>` or `d1 execute --json`), then restore forward with the undo bookmark and re-insert. Writes made between the two restores are lost; **[unverified]**, rehearse it on the demo DB first. |

**R2 objects.** R2 has no versioning and this bucket has no copy, so a deleted object is gone.

| Object | What survives / rebuild |
| --- | --- |
| Original uploads | Extracted text and chunks stay in D1. Ask the org to re-upload if the original is needed. |
| Voice audio | Transcripts stay in D1. |
| Data exports | Re-request (`POST /privacy/exports`). |
| Submission packages | The SHA-256 stays in `submissions.package_sha256`; the bytes do not. The funder's copy (or the email in Resend's logs) is the remaining record. |
| Vectors | Rebuild with `POST /api/orgs/:orgId/documents/:id/reprocess`. If the index itself was deleted, `node scripts/provision.mjs` recreates it and its metadata indexes, then reprocess every document. |

R2 bucket lock rules would prevent deletes, but they would also block org deletion, so do not lock
`orgs/` prefixes.

## 8. Secret leak

Rules for every secret:

1. **Update the GitHub secret first.** Every deploy uploads every non-empty GitHub secret
   (`grants-deploy`, "Sync secrets"). If only the Worker is rotated, the next deploy puts the leaked value back.
2. Put the new value on the Worker; this creates a new version and applies at once. Use the prompt (or
   stdin) so the value stays out of shell history:
   `pnpm exec wrangler secret put <NAME> --name grant-autopilot`.
3. Revoke the old credential at the provider, then confirm the app works (`/api/health/deep`).
4. Do not roll back to a version created before the rotation (section 1, step 3).
5. Check the provider's logs for use of the old credential since the leak.

| Secret | Rotate | Side effects / checks |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` (GitHub only) | Cloudflare dashboard: My Profile, API Tokens, Roll; update the GitHub secret | Review the account audit log for actions by the token. |
| `ANTHROPIC_API_KEY` | Anthropic Console: create a key; GitHub secret; `wrangler secret put`; delete the old key | Check Console usage for spend you did not make. Kill switch if spend is live. |
| `AUTH_SECRET` | `openssl rand -hex 32 \| pnpm exec wrangler secret put AUTH_SECRET --name grant-autopilot`; also update the GitHub secret `AUTH_SECRET` if one exists | **Signs everyone out** (Better Auth session cookies), invalidates pending checkout tokens, and new consent IP hashes no longer match older ones. Also revoke DB sessions: `DELETE FROM session` (all) or `DELETE FROM session WHERE user_id = 'usr_…'` (one user). |
| `INTERNAL_API_TOKEN` | `openssl rand -hex 32 \| pnpm exec wrangler secret put INTERNAL_API_TOKEN --name grant-autopilot` | Update the GitHub secret too, or the `grants-monitor` deep check fails with 401 (MONITORING.md "Enabling the deep check from GitHub"). |
| `GOOGLE_CLIENT_SECRET` | Google Cloud console, OAuth client: add a new secret, deploy it, then disable the old one **[unverified UI path]** | Google sign-in fails while the values differ. |
| `RESEND_API_KEY` | Resend dashboard: new key, delete the old one | Check Resend logs for mail you did not send; spam from your domain damages deliverability (section 11). |
| `BILLING_API_KEY`, `BILLING_WEBHOOK_SECRET` | Billing provider dashboard (Paddle: see PRICING.md) **[unverified UI path]** | Webhooks fail signature checks until both sides match; replay missed events from the provider. |
| `SIMPLER_GRANTS_API_KEY` | simpler.grants.gov developer account **[unverified]** | Low impact: discovery falls back to Grants.gov. |
| `PLATFORM_ADMIN_EMAILS` | not a credential; reset the list | If it was tampered with, review admin actions in `audit_log`. |
| A D1 dump, backup or presigned export URL | the URL expires after 1 hour | Treat as a cross-tenant exposure (section 9). |

## 9. Suspected cross-tenant exposure

Any report that one org saw another org's data (documents, facts, drafts, files, search results) is SEV1
until disproven. Tenant data includes nonprofit finances and staff/client details.

| When | Do |
| --- | --- |
| T+0 | Open a private incident record (not a GitHub issue). Name an incident lead. Start the UTC timeline. |
| T+1 h | **Contain:** roll back if a deploy introduced it (section 1); otherwise revert the route or feature. If the leak path is LLM context, turn on the kill switch. |
| T+4 h | **Preserve evidence** (before any cleanup, below). |
| T+24 h | **Scope:** which orgs, which records, which users, from when to when. Decide with counsel whether personal data was involved. |
| T+72 h | **Notify** the owners of affected orgs (internal target; earlier if scope is clear). |
| Law | `privacy.md` promises notice "as required by law". New Mexico (first tenant) requires notice to residents within 45 days of discovery, and more if over 1,000 residents **[verify with counsel]**. Other states and the EU have their own deadlines. |
| T+14 d | Post-incident review; regression test (CLAUDE.md requires a cross-tenant test per router). |

**Preserve evidence**

1. Stop pruning backups: run `grants-backup` by hand with `keep` = 0, or disable the workflow, so older
   nightly copies survive the investigation.
2. Bookmark the current D1 state: `pnpm exec wrangler d1 time-travel info grant-autopilot --json`.
3. Full export to a restricted location (it blocks D1 while it runs):
   `node scripts/ops/d1-backup.mjs --out-dir <restricted dir>`. For the audit log alone:
   `pnpm exec wrangler d1 export grant-autopilot --remote --table audit_log --output audit_log.sql --skip-confirmation`.
4. Workers Observability keeps logs for a limited time (7 days on Workers Paid **[unverified]**). Export
   the relevant `http.request` lines (`requestId`, `route`, `orgId`, `userId`, `ts`) now.
5. **Do not delete the affected orgs.** Their `audit_log` rows cascade with the org. If an affected owner
   asks for deletion during the investigation, export first, then honor it (ask counsel about a hold).
6. `sha256sum` each evidence file and record the hashes in the timeline.

**Scope queries**

```sql
-- Users acting in an org they are not a member of (platform admins and since-removed members also show up)
SELECT a.created_at, a.org_id, a.actor_id, a.action, a.target_type, a.target_id, a.request_id
FROM audit_log a
WHERE a.actor_type = 'user' AND a.org_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM member m WHERE m.organization_id = a.org_id AND m.user_id = a.actor_id)
ORDER BY a.created_at DESC LIMIT 200;

-- Documents whose R2 key is outside their own org prefix
SELECT id, org_id, r2_key FROM documents WHERE r2_key NOT LIKE 'orgs/' || org_id || '/%';
```
Then follow `request_id` values into Observability.

**Notice content:** what happened, which data, the time window, what we did, what they should do (for an
org that *received* data: delete it), and a contact. If a subprocessor (Cloudflare, Anthropic, Resend) is
involved, open a ticket with them.

## 10. Grants.gov API changes

Symptoms: logs `discovery.grants_gov.failed`, `discovery.grants_gov.search_failed`, `fetch_failed`,
`detail_id_mismatch`; failed or empty runs; the deep check's discovery result. Impact is limited: the
existing catalog, matching and drafting keep working, but new opportunities stop appearing.

```sql
SELECT source, status, found, created, updated, substr(error, 1, 200) AS error,
       datetime(started_at / 1000, 'unixepoch') AS started
FROM discovery_runs ORDER BY started_at DESC LIMIT 14;
```

Probe the public API by hand (keyless) and compare the fields with the zod schemas in
`src/worker/services/discovery/grants-gov.ts`:
```sh
curl -sS -X POST https://api.grants.gov/v1/api/search2 -H 'Content-Type: application/json' \
  -d '{"keyword":"community","oppStatuses":"posted","rows":1}' \
  | jq '{errorcode, msg, hitCount: .data.hitCount, hitKeys: (.data.oppHits[0] // {} | keys)}'
```

1. Fix the adapter (`grants-gov.ts`, keep its "Verified API quirks" comment current) with fixture tests
   (`services/discovery/discovery.test.ts`), then deploy.
2. Re-run discovery: admin UI, or
   `curl -fsS -X POST "https://marisstella.app/grants/api/internal/discovery/run" -H "Authorization: Bearer $INTERNAL_API_TOKEN" -H 'Content-Type: application/json' -d '{"source":"grants_gov"}'`.
3. Fallback source: Simpler.Grants.gov (`simpler-grants.ts`) runs daily when `SIMPLER_GRANTS_API_KEY` is set.
4. References: https://www.grants.gov/api/api-guide and https://api.simpler.grants.gov/openapi.json.

## 11. Email deliverability

Production requires email verification, so broken email blocks sign-up. It also breaks invitations,
email submissions to funders and follow-up reminders.

Symptoms: `submission.email_failed`, `submission.notify_failed`, `followup.notify_failed` logs; errors
`Email send failed: <status> <name>: <message>` (from `ports/resend-email.ts`); applications `failed`:
```sql
SELECT id, org_id, status, substr(last_error, 1, 160) AS last_error,
       datetime(updated_at / 1000, 'unixepoch') AS updated
FROM applications WHERE last_error LIKE 'Email send failed%' ORDER BY updated_at DESC LIMIT 50;
```

Checks, in order:
1. Is real email on? `pnpm exec wrangler secret list --name grant-autopilot` must list `RESEND_API_KEY`.
   Without it the app only logs emails and sends none.
2. Sender: `EMAIL_FROM` defaults to the placeholder `no-reply@example.org` in `wrangler.jsonc`, and the
   deploy does not override it (LAUNCH_CHECKLIST.md blocker 2). Resend rejects unverified senders.
3. Domain authentication, in the Resend dashboard (domain status) and DNS:
   `dig +short TXT <domain>` (SPF), `dig +short TXT _dmarc.<domain>` (DMARC); the DKIM record name is
   shown in the Resend dashboard **[unverified selector]**.
4. Reputation: bounce and complaint rates and the suppression list in Resend. Large mailbox providers
   expect a spam-complaint rate well under 0.3% and a DMARC record **[verify current thresholds]**.

After the fix: users retry the action. Submissions are deduplicated per (application, version), so
approving again does not send twice. Failed pipeline instances: section 5.

## 12. Backups and the restore drill

### Backup policy

| Layer | How | Recovery point | Retention | Restore |
| --- | --- | --- | --- | --- |
| D1 Time Travel | automatic (Workers Paid) | any minute | 30 days | in place, whole DB (section 6) |
| D1 nightly export | `grants-backup.yml` at 09:43 UTC: `d1 export` → gzip → `r2://grant-autopilot-files/backups/d1/` (or `vars.GRANTS_BACKUP_BUCKET`) | 24 h | newest 30 copies | scratch DB import (drill steps 2-3) |
| Pre-migration bookmark | manual (section 6) | the migration | 30 days | `time-travel restore --bookmark` |
| R2 files | **none** | - | - | not recoverable (section 7) |
| Vectorize | derived from D1 | - | - | re-embed (reprocess) |
| Queue messages | not backed up | - | queue retention | DLQ replay (section 4) |
| Secrets | owner secrets live in GitHub; generated `AUTH_SECRET` / `INTERNAL_API_TOKEN` are write-only | - | - | losing them means rotating (section 8) |

Rules:
- A dump holds **every tenant's** data. Only people with the Cloudflare token can read it. Download it
  only for a drill or an incident, keep it outside the git checkout (the script refuses), and delete it after.
- `wrangler d1 export` prints a one-hour download URL for the dump; `d1-backup.mjs` redacts it from logs.
- A running export blocks other D1 queries, so it runs at 02:43 Gallup time.
- Deleted orgs stay in Time Travel and in nightly copies for up to 30 days. That is the "backups roll off"
  in `privacy.md`; do not raise `keep` above 30 without updating the policy. A restore re-runs deletions (section 7).
- Recommended: a dedicated bucket, because the Worker's `FILES` binding can delete anything in
  `grant-autopilot-files`, so a bad bulk delete there could take the backups with it:
  ```sh
  pnpm exec wrangler r2 bucket create grant-autopilot-backups
  pnpm exec wrangler r2 bucket lifecycle add grant-autopilot-backups d1-expire backups/d1/ --expire-days 45
  ```
  Then set the repository variable `GRANTS_BACKUP_BUCKET=grant-autopilot-backups`. The lifecycle rule
  bounds retention if the prune ever stops working; keep it above 30 days.
- `wrangler r2 object put` uploads at most 300 MiB, so the gzipped dump must stay below that. The script
  fails loudly above it; then switch the upload to an S3-compatible multipart client.

### Monthly restore drill

First business day of each month, about 45 minutes. Record date, backup key, sizes, timings, counts
and problems in the incident log under "restore drill". A failed drill is a SEV2.

```sh
cd apps/grants
DRILL=$(mktemp -d); DB=grant-autopilot-drill-$(date -u +%Y%m)
KEY=backups/d1/grant-autopilot-<timestamp>.sql.gz   # from the latest grants-backup run summary
```
1. **Backup ran:** the last `grants-backup` run is green and its summary shows `uploaded` and `retention`.
2. **Download and check:**
   ```sh
   pnpm exec wrangler r2 object get grant-autopilot-files/$KEY --remote --file "$DRILL/backup.sql.gz"
   sha256sum "$DRILL/backup.sql.gz"            # equals the "gzipped" hash in the run summary
   gunzip "$DRILL/backup.sql.gz"
   ```
3. **Restore into a scratch database, and time it:**
   ```sh
   pnpm exec wrangler d1 create $DB
   time pnpm exec wrangler d1 execute $DB --remote --file "$DRILL/backup.sql" --yes
   ```
4. **Verify:**
   ```sh
   pnpm exec wrangler d1 execute $DB --remote --command "PRAGMA foreign_key_check"
   pnpm exec wrangler d1 execute $DB --remote --command "SELECT 'organization', COUNT(*) FROM organization UNION ALL SELECT 'user', COUNT(*) FROM user UNION ALL SELECT 'documents', COUNT(*) FROM documents UNION ALL SELECT 'facts', COUNT(*) FROM facts UNION ALL SELECT 'applications', COUNT(*) FROM applications UNION ALL SELECT 'submissions', COUNT(*) FROM submissions UNION ALL SELECT 'audit_log', COUNT(*) FROM audit_log"
   pnpm exec wrangler d1 execute $DB --remote --command "SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1"
   ```
   Counts should be close to production at backup time (run the same count query against
   `grant-autopilot`); the last migration should be the newest file in `migrations/`.
5. **Time Travel is available** (read-only):
   `pnpm exec wrangler d1 time-travel info grant-autopilot --timestamp $(date -u -d '-29 days' +%Y-%m-%dT%H:%M:%SZ)`.
6. **Clean up:** `pnpm exec wrangler d1 delete $DB` and `rm -rf "$DRILL"`.

Each quarter, also rehearse an in-place Time Travel restore and its undo on the **demo** database
(`grant-autopilot-demo`), including the "restore, export, restore forward" path from section 7.

---

## Appendix A: one-time setup for these playbooks

```sh
# HTTP pull consumer on the DLQ (needed by dlq-replay.mjs). Wrangler config cannot declare one:
# wrangler 4 rejects `type: "http_pull"` in queues.consumers, so this is not in wrangler.jsonc.
pnpm exec wrangler queues consumer http add grant-autopilot-jobs-dlq --message-retries 100
pnpm exec wrangler queues consumer http list grant-autopilot-jobs-dlq
# Keep dead letters 14 days instead of the default.
pnpm exec wrangler queues update grant-autopilot-jobs-dlq --message-retention-period-secs 1209600
```
Each pull by `dlq-replay.mjs` counts as a delivery attempt on the DLQ. `--message-retries 100` allows about
100 inspections before a message would be dropped (the DLQ has no DLQ of its own).

Tokens:
- `dlq-replay.mjs`: Account, Queues, Edit (pull and ack write queue state).
- `d1-backup.mjs` / `grants-backup`: D1 Edit (the export endpoint's exact permission is **[unverified]**)
  and Workers R2 Storage Edit (put, delete and list). The workflow uses the repository's
  `CLOUDFLARE_API_TOKEN`; a narrower token needs its own secret name or a GitHub environment.
