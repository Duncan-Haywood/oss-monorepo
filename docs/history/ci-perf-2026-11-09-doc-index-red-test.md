# CI perf, 2026-11-09: a red `doc_index` test on main, fixed

Found while timing `platform/ci/test_*.py` locally (1741 passed in 105.8 s; the
slowest, `test_check_conflict_markers` at 13 s, is a whole-tree scan already
profiled). One test failed: `test_doc_index.py::RealTree::test_repository_taxonomy_and_reports_check`,
because `doc_index.py check` reported 9 problems on main:

- 8 polish reports tagged `topics: [seo, aeo]`; `aeo` is an alias of `seo` in
  `docs/taxonomy.json`, not an id. Now `[seo]`.
- `docs/reports/civ-calibrate-gss-panel.md` had no front matter; added with
  `doc_index.py backfill --write`.

After: `doc_index.py check` prints `ok`; `test_doc_index.py` 16 passed.
A red main costs every PR a failing job and a rerun, so this is a CI-pool fix.

Not changed: P063 (ventures-tests sparse checkout, ~22.7 s per job) is still
the best pool lever and still needs the owner's approval (CODEOWNERS path).
Polish runs tag `aeo`; the tagger could map aliases to ids so this does not recur.
