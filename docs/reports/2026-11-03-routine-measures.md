# Routine measures moved from agents to software (2026-11-03)

For the next run: four measurements that runs kept doing by hand, or never
did, now have a script. Read their output instead of redoing the work.

| Question | Command | First reading (2026-11-03) |
|---|---|---|
| Which doc friction do runs keep hitting? | `python3 platform/ci/friction_rank.py [--days 14]` | prompt.md step 0 `security-alerts`: 134 to 135 sessions in 7 to 14 days; then flagships.yaml (ai-bookkeeper data blocked, 26), research/CLAUDE.md env notes (49 over 14 days) |
| Has a number a doc quotes gone stale? | `python3 platform/ci/check_doc_counts.py [--fix] [--list]` | PRODUCT_PLAYBOOK.md said 1,236 ventures; tree has 1,331 (fixed with a marker) |
| Do research results still reproduce? | `python3 research/_shared/repro_watch.py [--n 12] [--out DIR]` | local sample of 7: 4 identical, 3 tool-missing (yosys, scipy), 0 differ |
| Which flagships do people open? | `python3 portfolio/usage/flagship_usage.py [--days 14]` | 0 human loads for all 11 flagships, 2026-10-21..11-03; shed-designer 20, hearth-and-horizon 4 |

## How each works, and its limits

- **friction_rank** groups `doc_friction` entries by normalised file, then
  single-link clusters issues at Jaccard ≥ 0.25 on content words, and ranks
  by distinct sessions. It skips "none" entries (same regex as
  `promptctl.py`). Clusters can still split one problem in two, or merge two
  near-identical complaints about the same file. Read the example line.
  `promptctl.py measure`'s "Doc friction by file" is the per-file view with
  freshness dating; this is the per-problem view.
- **check_doc_counts**: `<!-- count:NAME -->N<!-- /count -->` in any tracked
  `.md` outside dated records (`docs/posts`, `docs/history`, `prompts/runs`).
  NAME must be in `platform/ci/doc_counts.json` (a glob, or an argv plus a
  regex), so a doc edit can never run code. Add a count there before you quote
  it. `--tolerance 0.1` allows approximate numbers. This is not a PR gate
  (counts move with every merge); the weekly workflow reports drift.
- **repro_watch** wraps `research/swe-audit`'s harness (temporary copies,
  sibling `src/` on PYTHONPATH). The seed is YYYYWW, so each week samples
  different projects. Projects touched by a non-bulk commit (≤ 20 projects)
  in the last 7 days go first, and in a shallow clone that is only what the
  fetched history shows. Exit 1 only on `differs`; `--strict` adds `crashed`.
  `tool-missing` and `timeout` are environment findings.
- **flagship_usage** reads `site-visits.json` from the `usage-data` branch
  (`git fetch --depth=1 origin usage-data`), else the copy on main. Loads are
  cookieless counts, not people. "Crawled" means any crawler beacon, and
  almost all of those are `bot:headless` (57k), probably including this
  repository's own browser checks. That is worth separating some day.

## Still waiting on the owner

- `.github/workflows/weekly-measures.yml` runs all four, plus a seeded weekly
  mutation campaign, report-only (no pushes, no paid API). It ships in its own
  control-plane PR with the `prompts/redteam.py` fixes: campaigns are saved
  without `--record`, `attach` and `recover` commands, pre-mutation backups so
  a hard kill no longer leaves a mutant in the file, a SIGTERM guard on `rerun`,
  and a warning past the 600 s tool limit.
- The step-0 fix: 16 duplicate PRs were consolidated into
  [PR 12885](https://github.com/duncan-haywood/oss-monorepo/pull/12885). The
  other 15 were closed, with their 7 unique run records carried into this
  change. Approving 12885 ends the most-reported friction in the repository.
  Do not open another copy.
