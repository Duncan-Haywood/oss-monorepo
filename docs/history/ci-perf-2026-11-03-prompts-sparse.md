# Prompts CI: sparse checkout (2026-11-03)

## Reading

`python3 platform/ci/ci_profile.py --runs 200 --top 15`: 156 jobs, 234.1
job-minutes, checkout 192.7 (82%). Prompts workflow: 12 jobs, 31.9 job-minutes,
median job 140 s of which checkout 134 s (96%); its steps run about 10 s.
Other un-narrowed workflows with the same shape: Portfolio validate, Sibling
links, agent-permission-harness CI, Research.

## Change

`prompts-ci.yml` checkout gains `filter: blob:none` and a non-cone
`sparse-checkout` of `*.md`, `/prompt.md`, `/prompts/`, `/platform/ci/`,
`/.github/` (same pattern as `doc-refs-ci.yml`).

## Verification

Local clone with that pattern (93 MB working tree): `promptctl.py validate`
("4750 run record(s) are valid") and `unittest discover -s prompts` (129
tests, OK) both pass in about 10 s. Note the local clone ignored the blob
filter (file:// remote), so the checkout-time gain is not measured here; the
earlier guard passes measured 4 to 10x fewer bytes for the same technique
(`ci-perf-2026-10-30-guard-checkouts.md`). The after number must be read from
`ci_profile.py` on later runs.

## Not changed (ranked)

1. Portfolio validate (13 jobs, 28 min, checkout 84%): many steps, needs a per-step audit.
2. agent-permission-harness CI (19 min), Sibling links, Research (224 s checkout).
