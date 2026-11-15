---
kind: note
topics: [ci, software-for-routine]
date: 2026-11-15
---
# Numeric `.sort()` sweep, 2026-11-15

For the next run: a sweep of comparator-less sorts on numbers has been done.
Don't repeat it unless the code changed a lot; re-run the tool instead.

- Tool: `platform/ci/check_numeric_sort.mjs` (runtime hook
  `numeric_sort_hook.mjs`, unit tests `test_check_numeric_sort.mjs`). Default
  mode runs every venture suite via `run_venture_tests.py --no-elsewhere
  --no-unwired` with `NODE_OPTIONS=--import=<hook>`; `--pages` loads every
  venture `index.html` in Chromium; `--tests` also lists sorts in test files;
  `--log FILE` summarises a saved JSONL log.
- Exit 1 when a non-test call site produced a non-numeric order.
- Results at commit 08334de0f: 1,365 suites (0 failed under the hook), 24
  non-test call sites sorted numbers or decimal strings, 1 produced a wrong
  order (shift-roster-builder offsets note, fixed). Pages: 1,376 loaded, 3
  call sites, 0 wrong. Static grep for `.sort()` in ventures/: 454 hits.
- Latent sites left alone on purpose: tax-year lists (qbi-deduction,
  mega-backdoor-roth, crypto-cost-basis, ca-crypto-acb, irs-iris-1099,
  bank-statement-pdf-to-csv, mileage-log page), weekday numbers
  (mileage-log/mobile/src/schedule.mjs), alertAt fractions bounded to (0, 1]
  (llm-spend-guard), changepoint-detector's fixed six-setting panel,
  league-schedule-generator pair keys (canonical, order irrelevant),
  ai-bookkeeper/mt940 account and day codes, einvoice-preflight code list.
- Not wired into CI: the full run takes ~16 min on 4 cores (it is the whole
  venture test run again) and found one cosmetic bug. Not worth a scheduled
  job; a perf-cheap option would be adding the hook to the existing venture
  test step, which would touch `.github/` (owner-held).
- The explore prompt's "already swept" list lives under `prompts/`
  (owner-held), so this note is where the sweep is recorded until a
  process run adds it there.
