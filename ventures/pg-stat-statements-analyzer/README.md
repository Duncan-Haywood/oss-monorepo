# pg_stat_statements Analyzer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/pg-stat-statements-analyzer/>

A free browser tool (and small Node CLI) for anyone running Postgres: **run one
read-only query against `pg_stat_statements`, paste the output, and see which
query shapes use the most database time, which look like N+1 loops, which miss
cache or spill to temp files, and what fixing the top few would be worth.** It
never connects to your database and the pasted text is not uploaded.

After using this, you can now **name the three queries behind most of your
database load and know which one to run `EXPLAIN (ANALYZE, BUFFERS)` on first**,
without installing an agent or giving a SaaS access to your database, which used
to mean a paid monitoring product or an afternoon of sorting a 5,000-row view by hand.

## Use

1. Open `index.html` (or `node cli.mjs --query` to print the query).
2. Run the query, export as CSV.
3. Paste or choose the file. CLI: `node cli.mjs statements.csv`
   (`--json` for the summary; `--fail-on temp,chatty` exits 1 when a named rule
   fires, so a scheduled job can gate on it).

## Rules

- **Shapes**: entries differing only in IN-list length, VALUES row count,
  comments or parameter numbering are merged. Ranked by total execution time.
- **hot** 5%+ of all time. **chatty** SELECT, 1,000+ calls, 10%+ of calls, ≤2 ms,
  ~1 row per call (N+1 suspect). **cold** 100 MB+ read and hit ratio <95%.
  **temp** 10 MB+ written to temp files. **slow** ≥250 ms mean over 10+ calls.
  **swing** stddev ≥3× mean. **rows** ≥10,000 rows per call.
- Payoff table is Amdahl arithmetic on the shares: "top 3 twice as fast" saves
  half of their combined share.

Not modelled: plans, indexes, locks, the application, replicas, counter age.
A flag is a reason to look, never a diagnosis. No warranty; see the page footer.

Sibling tools: `postgres-index-auditor` (unused and duplicate indexes),
`postgres-explain-analyzer` (one plan), `sql-migration-lock-check`.

Tests: `node --test`. MIT licensed (`LICENSE`); no secrets, no private
dependencies, no personal data.
