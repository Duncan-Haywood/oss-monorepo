#!/usr/bin/env node
// EXPLAIN QUERY PLAN for Grant Autopilot's hot D1 queries against the CURRENT Drizzle schema.
//
//   node scripts/explain-queries.mjs                 # baseline: current schema only
//   node scripts/explain-queries.mjs --proposed      # + the index additions from docs/PERFORMANCE.md
//   node scripts/explain-queries.mjs --verbose       # print every plan row
//   node scripts/explain-queries.mjs --json          # machine-readable output
//   node scripts/explain-queries.mjs --schema f.sql  # use a pre-exported schema instead of drizzle-kit
//   node scripts/explain-queries.mjs --fail-on-scan  # exit 1 on any full SCAN / >100-param query
//
// How it works: `pnpm exec drizzle-kit export --sql` -> in-memory SQLite (node:sqlite, Node >= 22.5;
// stable without a flag from 22.13) -> EXPLAIN QUERY PLAN for hand-written SQL equivalents of the
// Drizzle queries (file:line next to each). No stats (no ANALYZE), so the planner uses its default
// heuristics, which is what a fresh D1 database does too (run `PRAGMA optimize` on D1 after adding
// indexes). Verdicts: OK = SEARCH/covering index; SORT = SEARCH + temp b-tree for ORDER/GROUP BY;
// SCAN = full table scan; PARAM = more than D1's 100 bound parameters. Also reports:
//   - foreign keys whose child column has no index (every parent DELETE / cascade does a full scan
//     of the child table, per parent row: D1 enforces foreign keys),
//   - tenant tables with no index led by their org column (privacy export/delete scan them).
// Read-only: nothing is written to disk.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

// ---------------------------------------------------------------------------------------------
// Proposed indexes (keep in sync with docs/PERFORMANCE.md "Proposed Drizzle index additions").
// ---------------------------------------------------------------------------------------------
export const PROPOSED_INDEXES = [
  // ops.ts
  "CREATE INDEX llm_calls_created_idx ON llm_calls (created_at, cost_micros)",
  "CREATE INDEX llm_calls_org_cost_idx ON llm_calls (org_id, created_at, cost_micros)",
  // applications.ts
  "CREATE INDEX applications_org_updated_idx ON applications (org_id, updated_at)",
  "CREATE INDEX applications_opp_idx ON applications (opportunity_id, org_id)",
  "CREATE INDEX applications_match_idx ON applications (match_id)",
  "CREATE INDEX applications_project_idx ON applications (project_id)",
  "CREATE INDEX versions_org_idx ON application_versions (org_id)",
  "CREATE INDEX flags_version_idx ON application_flags (version_id, status)",
  "CREATE INDEX flags_org_idx ON application_flags (org_id)",
  "CREATE INDEX reviews_version_idx ON reviews (version_id)",
  "CREATE INDEX reviews_org_idx ON reviews (org_id)",
  "CREATE INDEX feedback_app_idx ON feedback (application_id)",
  "CREATE INDEX feedback_version_idx ON feedback (version_id)",
  // knowledge.ts
  "CREATE INDEX facts_org_created_idx ON facts (org_id, created_at)",
  "CREATE INDEX facts_chunk_idx ON facts (source_chunk_id)",
  // opportunities.ts
  "CREATE INDEX matches_org_ev_idx ON opportunity_matches (org_id, expected_value_cents, fit_score)",
  "CREATE INDEX matches_opp_idx ON opportunity_matches (opportunity_id)",
  "CREATE INDEX matches_project_idx ON opportunity_matches (project_id)",
  // submissions.ts
  "CREATE INDEX followups_org_status_due_idx ON followups (org_id, status, due_at)",
  "CREATE INDEX followups_submission_idx ON followups (submission_id)",
  "CREATE INDEX followups_app_idx ON followups (application_id)",
  "CREATE INDEX submissions_version_idx ON submissions (version_id)",
  // interviews.ts
  "CREATE INDEX turns_org_created_idx ON interview_turns (org_id, created_at)",
  "CREATE INDEX interviews_transcript_doc_idx ON interviews (transcript_document_id)",
  "CREATE INDEX interviews_focus_project_idx ON interviews (focus_project_id)",
  // privacy.ts / billing.ts
  "CREATE INDEX data_exports_org_idx ON data_exports (org_id, created_at)",
  "CREATE INDEX billing_events_org_idx ON billing_events (org_id)",
];

// ---------------------------------------------------------------------------------------------
// Hot queries: hand-written SQL equivalents of the Drizzle code (paths relative to src/worker).
// `?` placeholders are left unbound (NULL) — EXPLAIN QUERY PLAN does not execute the query.
// ---------------------------------------------------------------------------------------------
const IN = (n) => Array.from({ length: n }, () => "?").join(", ");

export const QUERIES = [
  // --- LLM budget guard (every LLM call; cached 60 s per isolate) ---
  {
    id: "budget.global_daily_sum",
    at: "services/guards/llm-budget.ts:109",
    sql: "SELECT coalesce(sum(cost_micros), 0) FROM llm_calls WHERE created_at >= ?",
  },
  {
    id: "budget.org_monthly_sum",
    at: "services/guards/llm-budget.ts:101",
    sql: "SELECT coalesce(sum(cost_micros), 0) FROM llm_calls WHERE org_id = ? AND created_at >= ?",
  },
  {
    id: "llm.application_cost",
    at: "services/billing/index.ts:216, services/pipeline/steps.ts:208",
    sql: "SELECT sum(cost_micros), count(*) FROM llm_calls WHERE org_id = ? AND application_id = ?",
  },
  // --- billing usage counts ---
  {
    id: "billing.used_in_period",
    at: "services/billing/index.ts:70",
    sql: "SELECT sum(quantity) FROM usage_events WHERE org_id = ? AND period_key = ? AND kind = ?",
  },
  {
    id: "billing.draft_usage_dedupe",
    at: "services/billing/index.ts:146",
    sql: "SELECT id FROM usage_events WHERE org_id = ? AND kind = ? AND subject_id = ? AND period_key = ? LIMIT 1",
  },
  {
    id: "billing.usage_summary",
    at: "services/billing/index.ts:182",
    sql: "SELECT kind, sum(quantity), sum(cost_micros) FROM usage_events WHERE org_id = ? AND period_key = ? GROUP BY kind",
  },
  // --- dashboard (GET /submissions/dashboard) ---
  {
    id: "dashboard.status_counts",
    at: "services/submission/dashboard.ts:40",
    sql: "SELECT status, count(*) FROM applications WHERE org_id = ? GROUP BY status",
  },
  {
    id: "dashboard.awarded_sum",
    at: "services/submission/dashboard.ts:46",
    sql: "SELECT sum(awarded_amount_cents) FROM applications WHERE org_id = ? AND status = 'awarded'",
  },
  {
    id: "dashboard.submitted_this_month",
    at: "services/submission/dashboard.ts:51",
    sql: "SELECT count(*) FROM applications WHERE org_id = ? AND submitted_at >= ?",
  },
  {
    id: "dashboard.open_apps",
    at: "services/submission/dashboard.ts:56",
    note: "unbounded; deadline window filtered in JS",
    sql: `SELECT a.id, a.title, a.status, a.deadline, o.close_date, o.id, o.funder_name
          FROM applications a JOIN opportunities o ON o.id = a.opportunity_id
          WHERE a.org_id = ? AND a.status NOT IN (${IN(8)})`,
  },
  {
    id: "dashboard.recent_activity",
    at: "services/submission/dashboard.ts:75",
    sql: "SELECT id, action FROM audit_log WHERE org_id = ? ORDER BY created_at DESC LIMIT 10",
  },
  // --- lists ---
  {
    id: "documents.list",
    at: "services/ingestion/documents.ts:280",
    sql: "SELECT * FROM documents WHERE org_id = ? ORDER BY created_at DESC, id DESC LIMIT 1000",
  },
  {
    id: "documents.list_by_kind",
    at: "services/ingestion/documents.ts:280",
    sql: "SELECT * FROM documents WHERE org_id = ? AND kind = ? ORDER BY created_at DESC, id DESC LIMIT 1000",
  },
  {
    id: "documents.detail_chunks",
    at: "services/ingestion/documents.ts:300",
    sql: "SELECT * FROM document_chunks WHERE org_id = ? AND document_id = ? ORDER BY ordinal",
  },
  {
    id: "documents.detail_facts",
    at: "services/ingestion/documents.ts:305",
    sql: "SELECT * FROM facts WHERE org_id = ? AND source_document_id = ? ORDER BY created_at",
  },
  {
    id: "facts.list_default",
    at: "services/knowledge/facts.ts:57",
    sql: "SELECT * FROM facts WHERE org_id = ? AND status <> 'superseded' ORDER BY created_at DESC, id ASC LIMIT 1000",
  },
  {
    id: "facts.list_by_status",
    at: "services/knowledge/facts.ts:57",
    sql: "SELECT * FROM facts WHERE org_id = ? AND status IN (?) ORDER BY created_at DESC, id ASC LIMIT 1000",
  },
  {
    id: "facts.for_drafting",
    at: "services/knowledge/facts.ts:118",
    sql: `SELECT * FROM facts WHERE org_id = ? AND status IN (?, ?) AND sensitivity <> 'restricted'
          AND superseded_by_id IS NULL AND project_id IS NULL
          ORDER BY category, confidence DESC, created_at`,
  },
  {
    id: "facts.summary",
    at: "services/knowledge/facts.ts:146",
    sql: "SELECT category, status, count(*) FROM facts WHERE org_id = ? GROUP BY category, status",
  },
  {
    id: "opportunities.list_open_with_match",
    at: "services/discovery/index.ts:99",
    note: "sort key comes from the LEFT JOIN: reads every visible open catalog row, then sorts",
    sql: `SELECT o.*, m.* FROM opportunities o
          LEFT JOIN opportunity_matches m ON m.opportunity_id = o.id AND m.org_id = ?
          WHERE (o.private_to_org_id IS NULL OR o.private_to_org_id = ?)
            AND o.status IN ('forecasted', 'posted')
            AND (o.close_date IS NULL OR o.close_date >= ?)
          ORDER BY m.expected_value_cents IS NULL, m.expected_value_cents DESC,
                   o.close_date IS NULL, o.close_date ASC
          LIMIT 200`,
  },
  {
    id: "matches.list",
    at: "services/matching/matches.ts:34",
    sql: `SELECT m.*, o.* FROM opportunity_matches m JOIN opportunities o ON o.id = m.opportunity_id
          WHERE m.org_id = ? AND (o.private_to_org_id IS NULL OR o.private_to_org_id = ?)
            AND m.status <> 'dismissed'
          ORDER BY m.expected_value_cents DESC, m.fit_score DESC LIMIT 200`,
  },
  {
    id: "applications.list",
    at: "services/pipeline/queries.ts:25",
    sql: `SELECT a.*, o.id, o.title, o.funder_name, o.close_date FROM applications a
          JOIN opportunities o ON o.id = a.opportunity_id
          WHERE a.org_id = ? ORDER BY a.updated_at DESC LIMIT 200`,
  },
  {
    id: "applications.list_by_status",
    at: "services/pipeline/queries.ts:25",
    sql: `SELECT a.*, o.id, o.title FROM applications a JOIN opportunities o ON o.id = a.opportunity_id
          WHERE a.org_id = ? AND a.status IN (?, ?) ORDER BY a.updated_at DESC LIMIT 200`,
  },
  {
    id: "reviews.queue",
    at: "services/review/index.ts:14",
    sql: `SELECT a.*, o.id, o.title FROM applications a JOIN opportunities o ON o.id = a.opportunity_id
          WHERE a.org_id = ? AND a.status IN ('in_review', 'changes_requested')
          ORDER BY a.deadline IS NULL, a.deadline ASC LIMIT 200`,
  },
  {
    id: "reviews.queue_flag_counts",
    at: "services/review/index.ts:39",
    sql: `SELECT f.version_id, f.severity, count(*) FROM application_flags f
          JOIN applications a ON a.current_version_id = f.version_id AND a.org_id = ?
          WHERE f.org_id = ? AND f.status = 'open' AND a.status IN (?, ?)
          GROUP BY f.version_id, f.severity`,
  },
  {
    id: "pipeline.missing_info_flags",
    at: "services/pipeline/steps.ts:478",
    sql: `SELECT * FROM application_flags WHERE org_id = ? AND application_id = ? AND version_id = ?
          AND kind = 'missing_info' AND status = 'open'`,
  },
  {
    id: "pipeline.count_open_flags",
    at: "services/pipeline/steps.ts:222",
    sql: `SELECT severity, kind FROM application_flags WHERE org_id = ? AND application_id = ?
          AND version_id = ? AND status = 'open'`,
  },
  {
    id: "pipeline.active_app_for_opportunity",
    at: "services/pipeline/index.ts:94",
    sql: `SELECT id FROM applications WHERE org_id = ? AND opportunity_id = ?
          AND status NOT IN (?, ?, ?) LIMIT 1`,
  },
  {
    id: "pipeline.route_prior_funder_submissions",
    at: "services/pipeline/steps.ts:562",
    sql: `SELECT count(*) FROM submissions s JOIN applications a ON a.id = s.application_id
          JOIN opportunities o ON o.id = a.opportunity_id
          WHERE s.org_id = ? AND s.status <> 'failed' AND s.application_id <> ? AND o.funder_id = ?`,
  },
  {
    id: "pipeline.route_auto_this_month",
    at: "services/pipeline/steps.ts:576",
    sql: `SELECT count(*) FROM submissions WHERE org_id = ? AND submitted_by_type = 'autopilot'
          AND status <> 'failed' AND created_at >= ?`,
  },
  // --- retrieval keyword search ---
  {
    id: "retrieval.keyword_like",
    at: "services/retrieval/index.ts:143",
    note: "LIKE '%term%' is not sargable: reads EVERY chunk row of the org (up to the 2000-match limit)",
    sql: `SELECT c.id, c.document_id, c.heading, c.text, d.title, d.kind
          FROM document_chunks c JOIN documents d ON d.id = c.document_id
          WHERE c.org_id = ? AND d.org_id = ?
            AND (c.text LIKE ? OR c.heading LIKE ? OR c.text LIKE ? OR c.heading LIKE ?
                 OR c.text LIKE ? OR c.heading LIKE ?)
          LIMIT 2000`,
  },
  {
    id: "retrieval.org_chunk_count",
    at: "services/retrieval/index.ts:150",
    note: "sum(documents.chunk_count): ~1 row per document instead of every org chunk index entry",
    sql: "SELECT coalesce(sum(chunk_count), 0) FROM documents WHERE org_id = ? AND status = 'ready'",
  },
  {
    id: "retrieval.hydrate_by_ids",
    at: "services/retrieval/index.ts:84",
    sql: `SELECT c.id, c.text, d.title FROM document_chunks c JOIN documents d ON d.id = c.document_id
          WHERE c.org_id = ? AND d.org_id = ? AND c.id IN (${IN(20)})`,
  },
  {
    id: "retrieval.style_docs",
    at: "services/retrieval/index.ts:234",
    sql: "SELECT id, past_outcome, past_year, created_at FROM documents WHERE org_id = ? AND kind = 'past_application'",
  },
  // --- matching ---
  {
    id: "matching.prefilter_candidates",
    at: "services/matching/score-org.ts:93",
    note: "OR close_date IS NULL defeats the range: reads every open catalog row, sorts, keeps 500",
    sql: `SELECT o.*, f.type FROM opportunities o LEFT JOIN funders f ON f.id = o.funder_id
          WHERE (o.private_to_org_id IS NULL OR o.private_to_org_id = ?)
            AND o.status IN ('posted', 'forecasted')
            AND (o.close_date IS NULL OR o.close_date >= ?)
          ORDER BY o.close_date LIMIT 500`,
  },
  {
    id: "matching.existing_matches",
    at: "services/matching/score-org.ts:163",
    note: "unbounded: every match row of the org (grows with the catalog)",
    sql: "SELECT opportunity_id, status, scored_at FROM opportunity_matches WHERE org_id = ?",
  },
  {
    id: "matching.knowledge_updated_at",
    at: "services/matching/score-org.ts:100",
    sql: "SELECT max(updated_at) FROM facts WHERE org_id = ?",
  },
  {
    id: "matching.autodraft_picks",
    at: "services/matching/autodraft.ts:55",
    sql: `SELECT m.id FROM opportunity_matches m JOIN opportunities o ON o.id = m.opportunity_id
          WHERE m.org_id = ? AND m.status IN (?, ?) AND m.eligibility <> 'ineligible'
            AND m.fit_score >= ? AND o.status = 'posted'
            AND (o.private_to_org_id IS NULL OR o.private_to_org_id = ?)
            AND (o.close_date IS NULL OR o.close_date >= ?)
            AND NOT EXISTS (SELECT 1 FROM applications a
                            WHERE a.org_id = ? AND a.opportunity_id = m.opportunity_id)
          ORDER BY m.expected_value_cents DESC, m.fit_score DESC LIMIT 3`,
  },
  // --- discovery upserts ---
  {
    id: "discovery.existing_by_source_id",
    at: "services/discovery/run.ts:126",
    sql: `SELECT id, source_id, content_hash FROM opportunities
          WHERE source = 'grants_gov' AND source_id IN (${IN(80)})`,
  },
  {
    id: "discovery.upsert_lookup",
    at: "services/discovery/catalog.ts:105",
    sql: "SELECT * FROM opportunities WHERE source = ? AND source_id = ?",
  },
  {
    id: "discovery.funder_lookup",
    at: "services/discovery/catalog.ts:43",
    sql: "SELECT id, agency_code FROM funders WHERE normalized_name = ?",
  },
  // --- follow-ups ---
  {
    id: "followups.due",
    at: "services/submission/followups.ts:99",
    sql: `SELECT f.*, a.status, a.title FROM followups f
          LEFT JOIN applications a ON a.id = f.application_id AND a.org_id = f.org_id
          WHERE f.status = 'pending' AND f.notified_at IS NULL AND f.due_at <= ?
          ORDER BY f.due_at LIMIT 200`,
  },
  {
    id: "followups.list_by_status",
    at: "services/submission/followups.ts:21",
    sql: `SELECT f.*, a.id, a.title FROM followups f
          LEFT JOIN applications a ON a.id = f.application_id AND a.org_id = ?
          WHERE f.org_id = ? AND f.status = ? ORDER BY f.due_at LIMIT 500`,
  },
  {
    id: "followups.by_submission",
    at: "routes/org/submissions.ts:112",
    sql: "SELECT * FROM followups WHERE org_id = ? AND submission_id = ?",
  },
  // --- privacy ---
  {
    id: "privacy.retention_turns",
    at: "services/privacy/retention.ts:56",
    sql: `SELECT id, audio_r2_key FROM interview_turns
          WHERE org_id = ? AND audio_r2_key IS NOT NULL AND created_at < ?`,
  },
  {
    id: "privacy.retention_exports",
    at: "services/privacy/retention.ts:90",
    note: "tiny global table, daily cron: acceptable",
    sql: "SELECT id, org_id, r2_key FROM data_exports WHERE status = 'ready' AND expires_at < ?",
  },
  {
    id: "privacy.audit_log_page",
    at: "services/privacy/audit-log.ts:46",
    sql: `SELECT * FROM audit_log WHERE org_id = ? AND (created_at < ? OR (created_at = ? AND id < ?))
          ORDER BY created_at DESC, id DESC LIMIT 51`,
  },
  // --- D1 100-bound-parameter limit: unbounded IN lists at realistic sizes ---
  {
    id: "reviews.queue_flag_counts@200",
    at: "services/review/index.ts:39 (queue of 200 rows)",
    note: "joins on applications.current_version_id: 4 params however long the queue (was an IN list of version ids)",
    sql: `SELECT f.version_id, f.severity, count(*) FROM application_flags f
          JOIN applications a ON a.current_version_id = f.version_id AND a.org_id = ?
          WHERE f.org_id = ? AND f.status = 'open' AND a.status IN (?, ?)
          GROUP BY f.version_id, f.severity`,
  },
  {
    id: "applications.cited_facts@120",
    at: "services/pipeline/queries.ts:88, services/pipeline/steps.ts:517",
    note: "120 cited facts, chunked: getFactsByIds (80 per statement) / steps.ts (90 per statement)",
    sql: `SELECT * FROM facts WHERE org_id = ? AND id IN (${IN(90)})`,
  },
  // --- per-request ---
  {
    id: "tenant.membership",
    at: "middleware/tenant.ts:19",
    sql: "SELECT role FROM member WHERE organization_id = ? AND user_id = ?",
  },
];

// ---------------------------------------------------------------------------------------------

function loadSchemaSql() {
  const file = opt("--schema");
  if (file) return readFileSync(resolve(file), "utf8");
  return execFileSync("pnpm", ["exec", "drizzle-kit", "export", "--sql"], {
    cwd: APP_DIR,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 32 * 1024 * 1024,
  });
}

async function openDb() {
  let DatabaseSync;
  try {
    ({ DatabaseSync } = await import("node:sqlite"));
  } catch {
    console.error(
      "node:sqlite is unavailable (needs Node >= 22.5; on 22.5-22.12 run with --experimental-sqlite).\n" +
        "Fallback: export the schema with `pnpm exec drizzle-kit export --sql > /tmp/schema.sql` and run\n" +
        "the EXPLAIN statements with `wrangler d1 execute DB --local --persist-to <scratch dir> --file ...`.",
    );
    process.exit(2);
  }
  return new DatabaseSync(":memory:");
}

/** Plan rows -> verdict. SCAN of a table (with or without an index) = full read of that table. */
function classify(plan) {
  const scans = plan.filter((r) => /^SCAN\b/.test(r.detail) && !/CONSTANT ROW/.test(r.detail));
  const temp = plan.filter((r) => /USE TEMP B-TREE/.test(r.detail));
  const searches = plan.filter((r) => /^SEARCH\b/.test(r.detail));
  const verdict = scans.length ? "SCAN" : temp.length ? "SORT" : searches.length ? "OK" : "OK?";
  return { verdict, scans, temp, searches };
}

function explain(db, sql) {
  return db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all();
}

/** Columns of every index on `table` (leftmost first), including the implicit PK/unique ones. */
function indexesOf(db, table) {
  return db
    .prepare(`PRAGMA index_list(${JSON.stringify(table)})`)
    .all()
    .map((ix) => ({
      name: ix.name,
      cols: db
        .prepare(`PRAGMA index_info(${JSON.stringify(ix.name)})`)
        .all()
        .sort((a, b) => a.seqno - b.seqno)
        .map((c) => c.name),
    }));
}

function tables(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((r) => r.name);
}

function pkCols(db, table) {
  return db
    .prepare(`PRAGMA table_info(${JSON.stringify(table)})`)
    .all()
    .filter((c) => c.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((c) => c.name);
}

const leads = (cols, idxCols) => cols.every((c, i) => idxCols[i] === c);

/** FKs whose child column(s) are not the leftmost columns of any index (or the PK). */
function unindexedForeignKeys(db) {
  const out = [];
  for (const t of tables(db)) {
    const idx = indexesOf(db, t).map((i) => i.cols);
    const pk = pkCols(db, t);
    if (pk.length) idx.push(pk);
    const fks = new Map();
    for (const fk of db.prepare(`PRAGMA foreign_key_list(${JSON.stringify(t)})`).all()) {
      const e = fks.get(fk.id) ?? { table: t, parent: fk.table, cols: [], onDelete: fk.on_delete };
      e.cols.push(fk.from);
      fks.set(fk.id, e);
    }
    for (const fk of fks.values()) if (!idx.some((c) => leads(fk.cols, c))) out.push(fk);
  }
  return out;
}

/** D1 rejects statements with more than 100 bound parameters. */
const D1_MAX_PARAMS = 100;

const ORG_COLS = ["org_id", "organization_id", "private_to_org_id"];

/** Tenant tables where `WHERE <orgcol> = ?` (privacy export/delete) cannot use an index. */
function tenantTablesWithoutOrgIndex(db) {
  const out = [];
  for (const t of tables(db)) {
    if (t === "organization") continue;
    const cols = db
      .prepare(`PRAGMA table_info(${JSON.stringify(t)})`)
      .all()
      .map((c) => c.name);
    const orgCol = ORG_COLS.find((c) => cols.includes(c));
    if (!orgCol) continue;
    const idx = indexesOf(db, t).map((i) => i.cols);
    const pk = pkCols(db, t);
    if (pk.length) idx.push(pk);
    if (!idx.some((c) => c[0] === orgCol)) out.push({ table: t, orgCol });
  }
  return out;
}

async function main() {
  const db = await openDb();
  db.exec(loadSchemaSql());
  const proposed = flag("--proposed");
  // IF NOT EXISTS: most proposed indexes are now in the schema; --proposed stays a no-op for those.
  if (proposed)
    for (const ddl of PROPOSED_INDEXES)
      db.exec(ddl.replace(/^CREATE INDEX /, "CREATE INDEX IF NOT EXISTS "));

  const results = [];
  for (const q of QUERIES) {
    let plan;
    try {
      plan = explain(db, q.sql);
    } catch (e) {
      results.push({ ...q, verdict: "ERROR", error: String(e), plan: [] });
      continue;
    }
    const c = classify(plan);
    const params = (q.sql.match(/\?/g) ?? []).length;
    if (params > D1_MAX_PARAMS) c.verdict = "PARAM";
    results.push({ ...q, ...c, params, plan });
  }
  // privacy export (SELECT * WHERE org = ?) and delete (DELETE WHERE org = ?) per tenant table
  const exportScans = tenantTablesWithoutOrgIndex(db);
  const fks = unindexedForeignKeys(db);

  if (flag("--json")) {
    console.log(
      JSON.stringify(
        {
          proposed,
          queries: results.map(({ id, at, verdict, plan, error, note, params }) => ({
            id,
            at,
            verdict,
            params,
            note,
            plan: plan.map((p) => p.detail),
            error,
          })),
          tenantTablesWithoutOrgIndex: exportScans,
          unindexedForeignKeys: fks,
        },
        null,
        2,
      ),
    );
  } else {
    const verbose = flag("--verbose");
    console.log(
      `\nEXPLAIN QUERY PLAN — ${proposed ? "current schema + PROPOSED indexes" : "current schema"}\n`,
    );
    const pad = (s, n) => String(s).padEnd(n);
    for (const r of results) {
      const why =
        r.verdict === "ERROR"
          ? r.error
          : r.verdict === "PARAM"
            ? `${r.params} bound parameters > D1 limit ${D1_MAX_PARAMS}`
            : [...r.scans, ...r.temp].map((p) => p.detail).join(" | ") ||
              r.searches.map((p) => p.detail).join(" | ");
      console.log(`${pad(r.verdict, 5)} ${pad(r.id, 40)} ${why}`);
      if (r.note) console.log(`${" ".repeat(47)}note: ${r.note}`);
      if (verbose) {
        console.log(`      at ${r.at}`);
        for (const p of r.plan) console.log(`      - ${p.detail}`);
      }
    }
    const n = (v) => results.filter((r) => r.verdict === v).length;
    console.log(
      `\n${results.length} queries: ${n("OK")} index-only/SEARCH, ${n("SORT")} SEARCH + temp b-tree sort, ${n("SCAN")} full SCAN, ${n("PARAM")} over D1's ${D1_MAX_PARAMS}-parameter limit, ${n("ERROR")} errors`,
    );

    console.log(
      `\nTenant tables with no index led by the org column (privacy export/delete do a full SCAN): ${exportScans.length}`,
    );
    for (const t of exportScans) console.log(`  SCAN  ${t.table} (${t.orgCol})`);

    console.log(
      `\nForeign keys with an unindexed child column (each parent DELETE scans the child table): ${fks.length}`,
    );
    for (const fk of fks)
      console.log(
        `  ${pad(`${fk.table}.${fk.cols.join(",")}`, 44)} -> ${pad(fk.parent, 22)} ON DELETE ${fk.onDelete}`,
      );
    console.log("");
  }

  const scanning = results.filter((r) => ["SCAN", "PARAM", "ERROR"].includes(r.verdict)).length;
  if (flag("--fail-on-scan") && scanning > 0) process.exit(1);
}

await main();
