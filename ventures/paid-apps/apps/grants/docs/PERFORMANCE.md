# Grant Autopilot: D1 performance review

Status: **report and proposed diffs only**. This review edits no schema or service files. The integration
engineer generates migrations from the Drizzle diffs below (`pnpm exec drizzle-kit generate`), then runs
`PRAGMA optimize` on D1 after applying them.

Tooling: `node scripts/explain-queries.mjs [--proposed] [--verbose] [--json] [--fail-on-scan]`. The script
loads the current schema (`drizzle-kit export --sql`) into an in-memory SQLite (`node:sqlite`, Node 22)
and runs `EXPLAIN QUERY PLAN` on 50 hand-written equivalents of the hot Drizzle queries. It also lists
every foreign key whose child column has no index and every tenant table with no index that starts with
its org column. `--proposed` adds the indexes from this document so you can compare before and after.

| Run                         | OK (SEARCH) | SEARCH + temp sort | full SCAN | > 100 params | unindexed FKs | tenant tables w/o org index |
| --------------------------- | ----------- | ------------------ | --------- | ------------ | ------------- | --------------------------- |
| current schema              | 28          | 15                 | **5**     | **2**        | **41**        | **6**                       |
| current + proposed indexes  | 36          | 11                 | 1 (ok)    | 2 (code fix) | 18 (all → `user`/`funders`, accepted) | 0 |

D1 facts this relies on: queries on one database run one at a time, so a slow scan stalls every tenant.
D1 bills **rows read = rows scanned**, including index entries. Every index on a written column adds a
row written. D1 enforces foreign keys, so a parent `DELETE` looks up every FK child. Without an index on
the child column, that lookup is a full table scan per deleted parent row. The bound-parameter limit is
**100 per statement**, and Drizzle binds every literal: `eq(status, "open")` counts as one parameter.
A batch holds about 1,000 statements.

Sizing assumptions for the row estimates (a mature deployment): 200 orgs; per org about 40 documents,
3,000 chunks, 1,500 facts, 60 applications, 200 versions, 1,500 flags and 1,500 matches; about 3,000
open catalog opportunities; about 1M `llm_calls` rows per year across all orgs; 300k `application_flags`
and 300k `facts` rows globally.

---

## Findings ranked by impact

### 1. Global LLM budget check is a full scan of `llm_calls` (runs before every LLM call)

`services/guards/llm-budget.ts:109-115` runs `SELECT coalesce(sum(cost_micros),0) FROM llm_calls WHERE created_at >= ?`.
The only index is `(org_id, created_at)`, so the plan is **SCAN llm_calls**. The result is cached for 60 s
per isolate. Each cache miss reads the whole table, and the table only ever grows.

- **Cost:** about 1M rows per check after a year. One busy isolate for 12 h is about 720 checks, which
  is about 720M rows/day or about 21B rows/month. That uses most of the Workers Paid included 25B rows
  read/month on its own, and more isolates push it into overage. Each check also costs hundreds of ms
  of serialized D1 time that every tenant waits behind.
- **Fix:** index `(created_at, cost_micros)`, which makes the sum a covering range read of today's rows
  only (about 3-5k). Also add a covering `(org_id, created_at, cost_micros)` index for the per-org
  monthly sum, which removes one table lookup per row. No code change is needed.

### 2. Deletes cascade into unindexed FK columns (org deletion and document reprocess/delete will time out)

`scripts/explain-queries.mjs` lists 41 FKs with an unindexed child column. The dangerous ones are:

| Parent delete (who triggers it)                                                    | Unindexed child column(s)                                                                 | Cost per parent row               |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------- |
| `document_chunks` (reprocess `services/ingestion/jobs.ts:135`, delete `documents.ts:376`, org delete) | `facts.source_chunk_id` (SET NULL)                                                        | full scan of `facts` (300k)       |
| `application_versions` (application delete, org delete)                           | `application_flags.version_id`, `reviews.version_id`, `feedback.version_id`, `submissions.version_id` (RESTRICT) | 4 full scans                      |
| `opportunity_matches` (org delete)                                                 | `applications.match_id`                                                                   | full scan of `applications`       |
| `applications`                                                                     | `feedback.application_id`, `followups.application_id`                                     | 2 full scans                      |
| `submissions`                                                                      | `followups.submission_id`                                                                 | full scan of `followups`          |
| `projects`                                                                         | `applications.project_id`, `opportunity_matches.project_id`, `interviews.focus_project_id` | 3 full scans                      |
| `documents`                                                                        | `interviews.transcript_document_id`                                                       | full scan of `interviews`         |
| `opportunities` (private imports on org delete)                                    | `applications.opportunity_id` (RESTRICT), `opportunity_matches.opportunity_id`            | 2 full scans                      |

- **Cost:** reprocessing a 75-chunk document reads 75 × 300k = **22.5M rows**, and a 1,000-chunk PDF
  reads 300M. `DELETE /privacy/org` for one org deletes 3,000 chunks, which is about 900M rows from
  `facts` alone. It will hit D1's query time limit. That is a GDPR/DATA_POLICY obligation failing, not
  just a cost problem.
- **Fix:** the FK indexes in tier 1 and tier 3 below. With them, each cascade becomes one index probe
  per parent row.
- **Not covered, on purpose:** the 17 FKs to `user.id` (`created_by`, `confirmed_by` and similar) and
  `opportunities.funder_id`. Users and funders are almost never deleted, so the extra write cost of
  those indexes isn't worth it.

### 3. `application_flags` has no `version_id` (or `org_id`) index, and three hot paths scan it globally

- `services/review/index.ts:38-54` (review queue counts) does **SCAN application_flags** across all
  tenants on every `GET /reviews/queue`. That is about 300k rows per page view.
- `services/pipeline/steps.ts:473-487` (missing-info flags, run on every verify) also does
  **SCAN application_flags**.
- Cascades from version deletes hit the same column (see finding 2), and privacy export/delete by
  `org_id` scans the table too.
- **Fix:** `flags_version_idx (version_id, status)` and `flags_org_idx (org_id)`. After the fix the
  queue reads about 200 rows.
- **Interim code fix with no migration:** add `eq(applicationFlags.applicationId, ids.applicationId)`
  to steps.ts:478 so it can use `flags_app_idx`.

### 4. Statements that exceed D1's 100 bound parameters (fail once the data grows)

`explain-queries.mjs` marks these with the `PARAM` verdict.

| Where                                                       | What                                                                              | Breaks when                                    |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------- |
| `services/pipeline/steps.ts:420`                            | One multi-row `insert(applicationFlags).values(allFlags…)`; Drizzle binds **12 params per row** (measured) | **9 or more flags on one draft**, so verify fails (common on long RFPs) |
| `services/review/index.ts:48`                               | `inArray(applicationFlags.versionId, versionIds)`; versionIds come from up to 200 queue rows | 98 or more applications in review              |
| `services/pipeline/queries.ts:88`, `services/pipeline/steps.ts:517` | `inArray(facts.id, citedIds)`, not chunked                                         | 99 or more distinct cited facts (application detail and stepRoute fail) |
| `services/knowledge/facts.ts:393` (`bulkConfirmFacts`)      | 90 ids + 6 other params = 96                                                      | OK today, but one added column breaks it; lower `IN_CHUNK` to 80 |

The remaining IN lists are already chunked (retrieval 80, discovery 80, matching 50, facts 90,
ingestion insert 8 × 11 = 88, interview turns 8 × 12). Keyword retrieval peaks at about 62 parameters.

### 5. Retrieval keyword search reads every chunk in the org, twice

`services/retrieval/index.ts:142-151`:

- `LIKE '%term%'` is not sargable. The plan is a SEARCH on `chunks_org_idx (org_id=?)` followed by a
  LIKE over every chunk's text, up to the 2,000-match limit.
- `count()` walks every org chunk index entry, only to get the BM25 corpus size.
- **Cost:** about 6,000 rows read and several MB of string matching per search. Drafting calls this
  from `retrieveStyleExamples` (`services/drafting/deps.ts:26`) on top of `POST /search`.
- **Fix, step 1 (cheap):** replace the count with
  `SELECT coalesce(sum(chunk_count),0) FROM documents WHERE org_id = ? AND status = 'ready'`, which
  reads about 40 rows. The total is only used for IDF, so an approximation is fine.
- **Fix, step 2:** an FTS5 external-content table. This is a raw-SQL migration, because Drizzle doesn't
  model virtual tables:

  ```sql
  CREATE VIRTUAL TABLE chunks_fts USING fts5(org_id UNINDEXED, heading, text, content='document_chunks', content_rowid='rowid', tokenize='porter unicode61');
  -- + AFTER INSERT/DELETE/UPDATE triggers on document_chunks to keep it in sync
  SELECT c.id FROM chunks_fts f JOIN document_chunks c ON c.rowid = f.rowid
   WHERE chunks_fts MATCH ? AND f.org_id = ? ORDER BY bm25(chunks_fts) LIMIT 200;
  ```

  Rows read drop to the matching postings. Check the caveat before adopting it: `wrangler d1 export`
  has historically refused databases that contain virtual tables. Time Travel restore is unaffected.

### 6. List endpoints sort the whole tenant slice (temp B-tree) and have no cursor pagination

Every list except `GET /privacy/audit-log` uses `limit(200..2000)` without a `nextCursor`, even though
ARCHITECTURE.md specifies `{ items, nextCursor? }`.

| Endpoint (file:line)                                                            | Plan today                                                                                  | Rows read today                              | Fix                                                                                      | After                                  |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------- |
| `GET /matches`: `services/matching/matches.ts:34`                               | SEARCH `(org_id)` + TEMP B-TREE ORDER BY (`status <> 'dismissed'` can't use `matches_org_rank_idx`) | about 1,700                                  | `matches_org_ev_idx (org_id, expected_value_cents, fit_score)`, walked backwards, LIMIT stops early | about 250                              |
| `GET /applications`: `services/pipeline/queries.ts:25`                          | TEMP B-TREE ORDER BY `updated_at`                                                           | about 120                                    | `applications_org_updated_idx`                                                           | ≤ limit                                |
| `GET /facts`: `services/knowledge/facts.ts:57`                                  | TEMP B-TREE ORDER BY `created_at DESC, id`                                                  | about 1,500 (limit 1,000 to 2,000)           | `facts_org_created_idx`, plus a cursor `(created_at, id)` with page size 100             | about 100                              |
| `GET /opportunities`: `services/discovery/index.ts:99`                          | LEFT JOIN, ORDER BY an expression on the joined match, so it reads all visible open rows    | about 6,000 (3k opps + 3k match probes), full rows incl. `description` | Rewrite below                                                                            | about 2 × page                         |
| `GET /documents`: `services/ingestion/documents.ts:280`                         | SEARCH `(org_id, created_at)`; temp sort for the `id` tie-break only                        | ≤ 1,000                                      | Add a cursor                                                                             |                                        |
| `GET /documents/:id`: `services/ingestion/documents.ts:300`                     | SEARCH `chunks_doc_idx`, **unbounded**: every chunk with its full text                      | 1 row per chunk (a 1,000-chunk PDF returns several MB) | Page the chunks (`?chunkCursor=` by ordinal) or return only previews                      |                                        |
| `GET /submissions/followups`: `services/submission/followups.ts:21`             | `followups_due_idx (status=?)`, cross-tenant prefix, then filters `org_id`                  | all pending follow-ups of **all orgs**       | `followups_org_status_due_idx (org_id, status, due_at)`                                  | ≤ limit                                |
| `GET /reviews/queue`: `services/review/index.ts:14`                             | TEMP B-TREE (ORDER BY `deadline IS NULL`)                                                   | about 20                                     | Fine; the count query is the problem (finding 3)                                         |                                        |

**Rewrite for `listOpportunities`** (`services/discovery/index.ts:99-116`). Run two index-ordered
queries instead of one sort over the whole catalog:

1. Matched first:
   `FROM opportunity_matches m JOIN opportunities o … WHERE m.org_id=? AND <visible/open on o> ORDER BY m.expected_value_cents DESC LIMIT :n`.
   This uses `matches_org_ev_idx`.
2. If phase 1 returned fewer than `:n` rows, fill with unmatched:
   `FROM opportunities o WHERE <visible/open> AND NOT EXISTS (SELECT 1 FROM opportunity_matches m WHERE m.org_id=? AND m.opportunity_id=o.id) ORDER BY o.close_date LIMIT :n - phase1`.
   This uses `opportunities_close_idx` and `matches_org_opp_uq`.
3. Select only the list DTO columns, not `opportunities.*`. `description`, `eligibility_text` and
   `requirements` belong in the detail view.

### 7. Autopilot pick and "active application" checks scan every application in the org

- `services/matching/autodraft.ts:73-83` uses
  `NOT EXISTS (SELECT 1 FROM applications WHERE org_id=? AND opportunity_id=m.opportunity_id)`. The only
  usable index is `(org_id, …)`, so each candidate match scans the org's applications: about 1,500 × 60
  = 90k rows per scoring run.
- `services/pipeline/index.ts:94` (create application) has the same shape.
- **Fix:** `applications_opp_idx (opportunity_id, org_id)`, which also covers the RESTRICT FK. Both
  become covering index probes.

### 8. Privacy export/delete: six tenant tables have no index led by `org_id`, and export is unbounded in memory

- `application_flags`, `application_versions`, `reviews`, `interview_turns`, `data_exports` and
  `billing_events` are each read with `SELECT *` (`services/privacy/export.ts:50`) and deleted
  (`services/privacy/deletion.ts:96`) by `org_id` with a **full scan of every tenant's rows**.
- `interview_turns` is also scanned on every daily retention sweep, for every org that has a retention
  policy (`services/privacy/retention.ts:56`).
- **Fix:** the org indexes in tier 2 and tier 3.
- **Code fix:** `buildOrgExport` loads every table and **every R2 object** into memory before
  `zipSync`. Workers have 128 MB, so a large org fails. Page each table by keyset (`rowid > ? LIMIT
  1000`) and stream the zip (fflate `Zip` plus R2 multipart upload).

### 9. N+1 and sequential round trips

| Where                                                             | Pattern                                                                                          | Fix                                                                                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `services/ingestion/jobs.ts:151-153`                              | `await insert(documentChunks)` per 8 rows: 63 sequential round trips for 500 chunks              | `ctx.db.batch(parts.map(p => ctx.db.insert(documentChunks).values(p)))`: one round trip, atomic (≤ 1,000 statements) |
| `services/submission/followups.ts:117-176`                        | 1 or 2 sequential UPDATEs per due follow-up (up to 200 per cron run)                             | Claim everything in one `UPDATE … WHERE id IN (chunk of 90) AND notified_at IS NULL RETURNING id`, then batch the skips |
| `services/privacy/retention.ts:44-75`                             | INSERT `purged_files` / UPDATE turn per row                                                      | `db.batch` per 50 rows                                                                                     |
| `services/discovery/run.ts:72-83`                                 | One queue `send` per org                                                                         | `JOBS.sendBatch` (100 per call)                                                                            |
| `services/pipeline/queries.ts:44-97` (`GET /applications/:id`)    | 6 sequential queries                                                                             | Run versions, flags, cited facts and submissions together in one `db.batch`, or with `Promise.all`         |
| `services/pipeline/steps.ts:537-600` (`stepRoute`)                | 5 independent sequential queries                                                                 | `Promise.all`                                                                                              |

Not N+1: the review queue (one grouped count), discovery upsert (dominated by the polite 400 ms
throttle to Grants.gov) and matching score upserts (dominated by LLM latency).

### 10. Smaller items

- **Matching prefilter** (`services/matching/score-org.ts:70-94`):
  - `status IN (…) AND (close_date IS NULL OR close_date >= ?) ORDER BY close_date LIMIT 500` reads
    every open catalog row and sorts it. That's about 3,000 rows per org per discovery run, or about
    600k/day across 200 orgs, which is acceptable.
  - Behaviour bug: SQLite sorts NULLs first, so opportunities with rolling deadlines (`close_date
    NULL`) fill the 500-row cap before dated ones. Use `ORDER BY close_date IS NULL, close_date` if
    that isn't intended.
  - `existing` (line 163) loads every match row in the org, and that grows with the catalog. Restrict
    it to `passed` ids in chunks of 90, or accept it.
- **Dashboard** (`services/submission/dashboard.ts:56-74`): `openApps` is unbounded and filters the
  30-day window in JS. Move it into SQL with `coalesce(a.deadline, o.close_date) BETWEEN ? AND ?`
  plus `ORDER BY` and `LIMIT 20`. The other dashboard queries already hit `(org_id, status)` and
  `audit_org_idx`. Total is about 250 rows per load, which is fine.
- **`knowledgeUpdatedAt`** (`score-org.ts:100`): `max(updated_at)` reads every fact in the org. An
  `(org_id, updated_at)` index would make it O(1). It's optional, since it runs once per scoring run.
- **JSON columns:** nothing is filtered in SQL. `focus_areas`, `service_areas`, `keywords`,
  `categories` and `applicant_types` are parsed and matched in JS (`services/matching/prefilter.ts`).
  Keep it that way. If one is ever needed in a `WHERE`, add a generated column plus an index rather
  than `json_each`.
- **Org slug lookup** (`services/orgs/service.ts:64`): `slug LIKE 'base-%'` can't use the unique index
  because LIKE is case-insensitive. This only matters at org creation, so it's acceptable.
- **`retention_exports`:** the SCAN on `data_exports (status, expires_at)` hits a tiny table from a
  daily cron, so it's acceptable.
- **Already fine:** `usage_events (org_id, period_key, kind)` serves every billing count and the draft
  dedupe. `facts (source_document_id)` already exists as `facts_doc_idx`, so no
  `(org_id, source_document_id)` composite is needed. The followups-due cron uses
  `followups_due_idx (status, due_at)`. Discovery upserts use `opportunities_source_uq` and
  `funders_normalized_uq`. Tenant membership uses `member_org_user_uq`.

---

## Proposed Drizzle index additions (copy-pasteable)

Tiers: **[1]** fixes a full scan or timeout on a hot or critical path. **[2]** lists, sorting and
retention. **[3]** FK and privacy hygiene: cheap, and it prevents cascade scans. Every new index costs
one extra row written per insert or update that touches its columns. The tables involved are
write-light except `llm_calls`, which gains 2 index writes per LLM call. That is negligible next to
the LLM call itself.

### `src/worker/db/schema/ops.ts` (`llmCalls`)

```ts
  (t) => [
    index("llm_calls_org_idx").on(t.orgId, t.createdAt),
    index("llm_calls_app_idx").on(t.applicationId),
    // [1] global daily budget sum (llm-budget.ts globalSpendSince): covering range read
    index("llm_calls_created_idx").on(t.createdAt, t.costMicros),
    // [1] org monthly budget sum: covering; makes llm_calls_org_idx redundant (drop it in a later migration)
    index("llm_calls_org_cost_idx").on(t.orgId, t.createdAt, t.costMicros),
  ],
```

### `src/worker/db/schema/applications.ts`

```ts
// applications
  (t) => [
    index("applications_org_status_idx").on(t.orgId, t.status),
    index("applications_org_deadline_idx").on(t.orgId, t.deadline),
    // [2] GET /applications ORDER BY updated_at DESC
    index("applications_org_updated_idx").on(t.orgId, t.updatedAt),
    // [1] autodraft NOT EXISTS, createApplication dedupe, RESTRICT FK from opportunities
    index("applications_opp_idx").on(t.opportunityId, t.orgId),
    // [3] FK SET NULL from opportunity_matches / projects
    index("applications_match_idx").on(t.matchId),
    index("applications_project_idx").on(t.projectId),
  ],

// applicationVersions
  (t) => [
    uniqueIndex("versions_app_num_uq").on(t.applicationId, t.versionNumber),
    // [3] privacy export/delete by org
    index("versions_org_idx").on(t.orgId),
  ],

// applicationFlags
  (t) => [
    index("flags_app_idx").on(t.applicationId, t.status),
    // [1] review-queue counts, missing-info lookup, FK cascade from application_versions
    index("flags_version_idx").on(t.versionId, t.status),
    // [2] privacy export/delete by org
    index("flags_org_idx").on(t.orgId),
  ],

// reviews
  (t) => [
    index("reviews_app_idx").on(t.applicationId),
    // [3] FK cascade from application_versions; privacy export/delete
    index("reviews_version_idx").on(t.versionId),
    index("reviews_org_idx").on(t.orgId),
  ],

// feedback
  (t) => [
    index("feedback_org_idx").on(t.orgId, t.rating),
    // [3] FK cascade from applications / SET NULL from application_versions; listFeedback
    index("feedback_app_idx").on(t.applicationId),
    index("feedback_version_idx").on(t.versionId),
  ],
```

### `src/worker/db/schema/knowledge.ts` (`facts`)

```ts
  (t) => [
    index("facts_project_idx").on(t.projectId),
    index("facts_interview_idx").on(t.sourceInterviewId),
    index("facts_org_status_idx").on(t.orgId, t.status),
    index("facts_org_category_idx").on(t.orgId, t.category),
    index("facts_doc_idx").on(t.sourceDocumentId),
    // [2] GET /facts ORDER BY created_at DESC (+ cursor)
    index("facts_org_created_idx").on(t.orgId, t.createdAt),
    // [1] FK SET NULL from document_chunks: reprocess/delete/org-delete otherwise scan all facts per chunk
    index("facts_chunk_idx").on(t.sourceChunkId),
  ],
```

### `src/worker/db/schema/opportunities.ts` (`opportunityMatches`)

```ts
  (t) => [
    uniqueIndex("matches_org_opp_uq").on(t.orgId, t.opportunityId),
    index("matches_org_rank_idx").on(t.orgId, t.status, t.expectedValueCents),
    // [2] GET /matches + autodraft ORDER BY expected_value DESC, fit DESC with early LIMIT
    //     (supersedes matches_org_rank_idx, which `status <> 'dismissed'` can't use; drop it later)
    index("matches_org_ev_idx").on(t.orgId, t.expectedValueCents, t.fitScore),
    // [3] FK cascade from opportunities / SET NULL from projects
    index("matches_opp_idx").on(t.opportunityId),
    index("matches_project_idx").on(t.projectId),
  ],
```

`opportunities` needs no change. `(status, close_date)` is already used. Appending
`private_to_org_id` doesn't help, because the `close_date IS NULL OR …` predicate is what defeats the
range (see the rewrite in finding 6).

### `src/worker/db/schema/submissions.ts`

```ts
// submissions
  (t) => [
    index("submissions_org_idx").on(t.orgId, t.createdAt),
    index("submissions_app_idx").on(t.applicationId),
    // [3] RESTRICT FK from application_versions
    index("submissions_version_idx").on(t.versionId),
  ],

// followups
  (t) => [
    index("followups_due_idx").on(t.status, t.dueAt),
    index("followups_org_idx").on(t.orgId),
    uniqueIndex("followups_dedupe_uq").on(t.orgId, t.dedupeKey),
    // [2] GET /submissions/followups?status= ORDER BY due_at (supersedes followups_org_idx)
    index("followups_org_status_due_idx").on(t.orgId, t.status, t.dueAt),
    // [3] FK cascade from submissions / applications; GET /submissions/:id
    index("followups_submission_idx").on(t.submissionId),
    index("followups_app_idx").on(t.applicationId),
  ],
```

### `src/worker/db/schema/interviews.ts`

```ts
// interviews
  (t) => [
    index("interviews_org_idx").on(t.orgId, t.createdAt),
    // [3] FK SET NULL from documents / projects; knowledge/jobs.ts transcript lookup
    index("interviews_transcript_doc_idx").on(t.transcriptDocumentId),
    index("interviews_focus_project_idx").on(t.focusProjectId),
  ],

// interviewTurns
  (t) => [
    index("turns_interview_idx").on(t.interviewId, t.ordinal),
    // [2] retention sweep (org_id, created_at < cutoff); privacy export/delete
    index("turns_org_created_idx").on(t.orgId, t.createdAt),
  ],
```

### `src/worker/db/schema/privacy.ts` (`dataExports`: add the third argument)

```ts
export const dataExports = sqliteTable(
  "data_exports",
  {
    /* …columns unchanged… */
  },
  // [3] privacy export/delete by org
  (t) => [index("data_exports_org_idx").on(t.orgId, t.createdAt)],
);
```

### `src/worker/db/schema/billing.ts` (`billingEvents`)

```ts
  (t) => [
    uniqueIndex("billing_events_provider_uq").on(t.provider, t.providerEventId),
    // [3] privacy export/delete by org
    index("billing_events_org_idx").on(t.orgId),
  ],
```

All of these files already import `index` (and `uniqueIndex` where it's used). Keep
`PROPOSED_INDEXES` in `scripts/explain-queries.mjs` in sync with this section.

---

## Proposed query rewrites (by file:line)

1. **`services/pipeline/steps.ts:420`**: chunk the flag insert. This fixes a hard failure at 9 or more flags.

   ```ts
   if (allFlags.length > 0) {
     const rows = allFlags.map((f) => ({ id: newId("flg"), orgId: ids.orgId, applicationId: ids.applicationId, versionId, ...f }));
     const [first, ...rest] = rows.map((r) => ctx.db.insert(applicationFlags).values(r)); // 12 params each
     if (first) await ctx.db.batch([first, ...rest]);
   }
   ```

2. **`services/review/index.ts:35-54`**: drop the IN list and join through `current_version_id`. This
   uses 4 parameters regardless of queue size, and `flags_version_idx`.

   ```ts
   const counts = await ctx.db
     .select({ versionId: applicationFlags.versionId, severity: applicationFlags.severity, n: sql<number>`count(*)` })
     .from(applicationFlags)
     .innerJoin(applications, and(eq(applications.currentVersionId, applicationFlags.versionId), eq(applications.orgId, orgId)))
     .where(and(eq(applicationFlags.orgId, orgId), eq(applicationFlags.status, "open"),
                inArray(applications.status, ["in_review", "changes_requested"])))
     .groupBy(applicationFlags.versionId, applicationFlags.severity)
     .all();
   ```

3. **`services/pipeline/queries.ts:83-90`** and **`services/pipeline/steps.ts:512-518`**: replace the
   unchunked `inArray(facts.id, …)` with `getFactsByIds(ctx, orgId, ids)` from
   `services/knowledge/facts.ts:76`, which chunks at 90.
4. **`services/pipeline/steps.ts:478`**: add `eq(applicationFlags.applicationId, ids.applicationId)`.
   It uses `flags_app_idx` today and costs nothing once `flags_version_idx` exists.
5. **`services/retrieval/index.ts:150`**: `ctx.db.select({ n: sql<number>\`coalesce(sum(${documents.chunkCount}),0)\` }).from(documents).where(and(eq(documents.orgId, orgId), eq(documents.status, "ready"))).get()`.
   FTS5 is a follow-up (finding 5).
6. **`services/discovery/index.ts:99-116`**: two-phase matched/unmatched query plus a column projection
   and a cursor (finding 6).
7. **`services/ingestion/jobs.ts:151-153`**: `db.batch` the chunk inserts (finding 9).
8. **`services/submission/followups.ts:117-140`**: claim due follow-ups in chunked
   `UPDATE … RETURNING` statements instead of one per row.
9. **`services/privacy/export.ts:49-53`**: keyset-page each table, and stream the zip and the R2
   reads instead of buffering them.
10. **`services/submission/dashboard.ts:56-74`**: SQL deadline window plus `LIMIT 20`.
11. **Pagination:** add `nextCursor` keyset paging on `(created_at, id)` to documents, facts, matches,
    applications, submissions, followups, consents and interviews. Reuse `encodeCursor`/`decodeCursor`
    from `services/privacy/audit-log.ts`. Also page `GET /documents/:id` chunks.
12. **`services/knowledge/facts.ts:16`**: change `IN_CHUNK = 90` to `80` for headroom in
    `bulkConfirmFacts`, which binds 96 parameters today.

---

## D1 cost per request (rows read, sizing assumptions above)

| Request / job                                    | Today                                                        | With indexes + rewrites      |
| ------------------------------------------------ | ------------------------------------------------------------ | ---------------------------- |
| LLM budget check (per cache miss, every LLM call path) | about 1M (global SCAN) + about 2k (org)                       | about 5k + about 2k (covering) |
| `DELETE /privacy/org`                            | up to about 1B (FK cascade scans): **times out**              | about the org's own rows (about 15k) |
| Document reprocess/delete (75 chunks)            | about 22.5M                                                  | about 150                    |
| `GET /reviews/queue`                             | about 300k (flags SCAN); **fails at 98 or more in review**    | about 250                    |
| Verify step (missing-info flags)                 | about 300k                                                   | about 10                     |
| `POST /search` / style retrieval                 | about 6k                                                     | about 3k (count fix); about 100s with FTS5 |
| `GET /opportunities`                             | about 6k, plus multi-MB rows                                  | about 400                    |
| `GET /matches`                                   | about 1.7k                                                   | about 250                    |
| `GET /facts`                                     | about 1.5k                                                   | about 100 (paged)            |
| Matching run per org (prefilter + autodraft)     | about 3k + 1.5k + 1.5k + 90k                                 | about 6k                     |
| `GET /submissions/dashboard`                     | about 250                                                    | about 200                    |
| Retention sweep, per org with a policy           | full `interview_turns` SCAN (all tenants)                    | turns older than the cutoff only |
| Follow-ups cron                                  | ≤ 200 reads, ≤ 400 sequential writes                         | ≤ 200 reads, about 5 batched writes |

Billing context (Workers Paid, check current pricing): 25B rows read and 50M rows written per month
are included, then about $0.001 per 1M rows read and $1.00 per 1M rows written. Finding 1 alone can
use up the included reads. Findings 2-4 are availability problems (timeouts and hard errors) more
than billing problems. The proposed indexes add about 1-3 rows written per affected insert, which is
small: the write-heavy tables are `llm_calls` (+2) and `document_chunks` (unchanged).
