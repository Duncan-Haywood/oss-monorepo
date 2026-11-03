# Prompts workflow: sparse checkout (2026-11-03)

Reading: `ci_profile.py --runs 100`: the Prompts workflow had 10 jobs, 4.5
job-minutes, 70% of it checkout (the highest share of any workflow).

Change: `prompts-ci.yml` checks out `*.md`, `prompts/`, `.github/prompts/` and
`platform/ci/` with `blob:none`. Found by trial: `*.md` alone fails validate
(system.json names markdown under portfolio/), and `platform/ci/` is needed by
`test_promptctl.py` (`check_post_frontmatter.py`).

Verification (sparse worktree, 10,721 files, 89 MB): `promptctl.py validate`
ok (4,644 records); `unittest discover -s prompts` 129 tests OK, same as the
full tree. Not measured in CI yet: the after number is the next
`ci_profile.py` reading of this workflow's checkout share.

Not changed: ventures tests (4.0 min of real test time, inherent); Portfolio
validate install step (0.6 min).
