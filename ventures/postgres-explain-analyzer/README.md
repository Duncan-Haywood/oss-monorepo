# Postgres EXPLAIN Analyzer

Find out why a PostgreSQL query is slow — from one `EXPLAIN (ANALYZE, BUFFERS)`
plan, text or JSON, before you start guessing at indexes.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/postgres-explain-analyzer/

```
psql -At -c "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT ..." | node cli.mjs analyze -
node cli.mjs analyze plan.txt
node cli.mjs analyze plan.json --max-ms 200      # CI gate: exit 1 over budget
node cli.mjs analyze plan.txt --fail-on warn --json
```

It prints the plan with **self time per node** (time × loops, minus children),
the top time sinks, and findings with a suggested fix:

| rule | level | meaning |
| --- | --- | --- |
| `seq-scan-discards-rows` | warn/error | sequential scan read ≥ 90% more rows than it kept; candidate index shown |
| `index-scan-discards-rows` | warn | index covers only part of the predicate |
| `nested-loop-seq-scan` | error | inner side of a Nested Loop is a Seq Scan run ≥ 100 times |
| `row-misestimate` | warn/error | actual rows differ from the planner's estimate by ≥ 10× |
| `sort-spills-to-disk` | error | `Sort Method: external merge` — suggests a `work_mem` |
| `hash-spills-to-disk` | warn | hash used more than one batch |
| `temp-file-writes`, `heap-fetches`, `parallel-workers-short`, `cold-reads`, `slow-planning`, `dominant-node`, `no-analyze` | info/warn | supporting signals |

Exit 1 on an error finding or when `--max-ms` is exceeded (any warning with
`--fail-on warn`); 2 on bad input.

## What it is not

Heuristics over one plan. It never connects to a database, so it cannot see
your schema, existing indexes, data volume or settings; index suggestions come
from the plan's filter text and are hypotheses to test on your own data. Not
DBA advice, no warranty. `EXPLAIN ANALYZE` executes the statement — wrap
writes in `BEGIN ... ROLLBACK`.

## Privacy

No network call, no account, no analytics vendor. The browser page
(`index.html`) analyses pasted text locally and never uploads it.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
