# Payment-key check: literal prefilter (2026-11-04, perf run)

Reading: `ci_profile.py --runs 600` put Portfolio validate second (111 job-min
of 600). Its steps are many short ones; `check_payment_keys.py` and its unit
tests were the two largest (4.2 and 4.0 min over 43 jobs, ~5.5 s each).

Profile (`python3 -m cProfile`): 8.97 s total, 6.84 s of it in 76,002
`re.Pattern.search` calls over ~25,400 files under `ventures/`.

Change: each pattern now carries a literal every match must contain
(`k_live_`, `stripe.com/`, `hosted_button_id`). A bytes `in` test on the raw
file gates both the UTF-8 decode and the regex, so they run on the few files
that hold a literal.

| | before | after |
|---|---|---|
| `check_payment_keys.py` (warm) | ~9.0 s (profiled) | 1.15 s wall |
| `unittest test_check_payment_keys` | 7.4 s | 1.2 s |

Same answers: output unchanged ("no hardcoded payment account found"), all 21
unit tests pass, including the seeded-key fixtures. One theoretical difference:
a key split by an invalid UTF-8 byte (which `errors="ignore"` would have
dropped, re-joining the key) no longer matches; no such file exists and the
raw literal is what a reader or a scanner would see.

Not changed, ranked: other ~3-4 s validate steps (privacy checker tests, agent
CLI callable check, adopt-stranded tests) likely share the same whole-tree
walk; checkout is 14.5 of 111 min in this workflow.
