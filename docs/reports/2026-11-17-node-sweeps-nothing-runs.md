---
kind: note
topics: [ci]
tagged: manual
---
# Node sweeps and suites in platform/ci that nothing ran (agent note, 2026-11-17)

Process run 2026-11-17, from a doc_friction row ("nothing lists unwired checkers").

**Fixed in this PR.** `unwired_checks.py` found unwired `check_*.py`, `test_*.py`
and `platform/**/*.test.mjs`, but not `test_*.mjs`. The six node unit suites in
`platform/ci` (`test_check_{comma_input,enter_reload,float_noise,locale_drift,numeric_sort,thousands_input}.mjs`)
use that name, are named by no workflow, and so ran on no pull request. They now
run through `run_venture_tests.py --since` (ventures-tests.yml). All 22 tests pass;
the six files take under 3 s. `test_check_thousands_input.mjs` launches Chromium,
and the CI runner has no playwright, so it now skips by name when playwright
does not resolve (checked with `env -u NODE_PATH`).

**Still open (not fixed here).** The 14 browser sweeps themselves
(`platform/ci/check_*.mjs` and `check_*.js`: blank_inputs, button_clicks,
comma_input, enter_reload, float_noise, input_edges, locale_drift,
mobile_overflow, numeric_sort, page_runtime, redos, select_keys,
thousands_input, timezone_drift) are named by no workflow, and
`browser_checks.py` registers only the eight `platform/pages` checks. Each is
run by hand by the session that wrote it, then never again. They need
playwright and minutes per sweep, so they belong in the nightly
`browser-checks-ci.yml` (control plane: an owner-approved PR), or in
`browser_checks.py`'s `CHECKS` if that can run a `platform/ci` script. Check
with `grep -rlw check_<name> .github/workflows platform/ci/browser_checks.py`.
