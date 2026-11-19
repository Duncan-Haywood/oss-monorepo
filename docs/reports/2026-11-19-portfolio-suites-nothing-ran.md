---
kind: note
topics: [ci, software-for-routine]
date: 2026-11-19
---
# portfolio/ Python suites that nothing ran (agent note, 2026-11-19)

- 14 of the 90 `portfolio/**/test_*.py` files ran in no pull-request workflow
  (`python3 platform/ci/unwired_checks.py --list`). One of them,
  `portfolio/ledger/test_no_duplicate_yaml_keys.py`, was red on main (three
  repeated `basis` keys in `portfolio/scoring/venture-scores.yaml`) until PR #17649
  fixed it by hand, while `main_health.py` printed 279/279.
- `unwired_checks.py` now finds them (`unwired_portfolio_tests`) and runs them
  in its pool (CI: `run_venture_tests.py --since` in ventures-tests.yml);
  `main_health.py` runs them too. All 14 pass today, about 13 s serial.
- The matching is stricter than the platform/ci stem rule: a step must name the
  suite's path, name its module from its own working-directory, or run
  `pytest`/`unittest discover` over a folder holding it (a workflow-level
  `defaults.run.working-directory` counts). The stem rule would have called
  `portfolio/router/test_validate.py` wired because `test_validate_usage` is named.
- Gap left: ventures-tests.yml installs no pytest, so on a runner without it the
  7 plain-function suites among the 14 (test_no_duplicate_yaml_keys.py included)
  are named skips, not runs. `pip install pytest pyyaml` in that workflow is a
  control-plane edit (`.github/`), so it needs its own PR and the owner's approval.
  Until then `main_health.py` in a cloud session (which has pytest) is what runs them.
- Seeded check: re-adding one duplicate `basis` key made the suite FAIL with the
  line number, and the report printed `cd portfolio/ledger && python3 -m pytest -q
  test_no_duplicate_yaml_keys.py` as the reproduce line.
