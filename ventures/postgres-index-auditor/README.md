# Postgres Index Auditor

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/postgres-index-auditor/>

A free browser tool (and small Node CLI) for anyone running Postgres: **run one
read-only query, paste the output, and see which indexes are unused, duplicate,
redundant or invalid, how much disk dropping them frees, and
`DROP INDEX CONCURRENTLY` statements to review.** It never connects to your
database and the pasted text is not uploaded.

After using this, you can now **cut write amplification and disk by removing the
indexes nothing reads**, without installing an extension or giving a SaaS
access to your database, which used to mean a paid monitoring product or a
careful afternoon with `pg_stat_user_indexes`.

## Use

1. Open `index.html` (or `node cli.mjs --query` to print the query).
2. Run the query on the primary and on any read replica, export as CSV.
3. Paste or choose the file. CLI: `node cli.mjs indexes.csv` (exit 1 when
   something is flagged, so it can gate a CI job; `--json`, `--min-mb N`).

## Rules

- **invalid**: `indisvalid = false`.
- **duplicate**: same method, columns, INCLUDE list, WHERE clause and uniqueness.
- **redundant**: plain btree whose columns lead another btree with the same WHERE
  clause. Not flagged if the longer index is itself being dropped.
- **unused**: `idx_scan = 0` and not unique, primary, or behind a constraint.

Not modelled: foreign keys that need a supporting index, replicas, statistics
age, bloat. Statistics reset and are per-server; the output is a list of
candidates to check, never a decision. No warranty; see the page footer.

Tests: `node --test`. MIT licensed (`LICENSE`); no secrets, no private
dependencies, no personal data.
