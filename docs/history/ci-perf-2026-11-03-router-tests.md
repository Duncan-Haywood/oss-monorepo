# Router ranking-logic tests: 119 s to 25 s (2026-11-03)

**Reading.** `ci_profile.py --runs 200` put "Router ranking-logic unit tests"
(`portfolio-validate.yml`) at the heaviest step of Portfolio validate (1.8 min).
**Profile.** Per-test timing of `python3 -m unittest test_allocate` (71 tests,
119 s): twelve tests each called `load_ventures(VENTURES_DIR)`, parsing about
1,300 VENTURE.yaml files in pure-Python YAML (~10 s each, no libyaml).
**Change.** `portfolio/router/test_allocate.py` wraps `load_ventures`: the
default tree is parsed once and each caller gets a deep copy; calls with their
own directory (the temp-dir test) still parse fresh. No test or assertion
removed, no production code touched.
**Verification.** Same 71 tests, all OK. Before 119.1 s, after 25.4 s wall
(same machine, `time`).
**Not changed (ranked).** 1) the remaining 25 s is `count_portfolio_mentions`
and ledger scans in a few tests; 2) `allocate.py` itself could cache parsed
YAML by mtime for agents running the router repeatedly; 3) use the C YAML loader
when available.
