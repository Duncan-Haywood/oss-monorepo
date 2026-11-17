# Sibling links: blob-less sparse checkout (2026-11-06)

**Reading.** `ci_profile.py --runs 600 --top 25` (579 jobs, 638.8 job-minutes,
checkout 155.1): `Sibling links` ran 21 jobs, 12.5 min, 73% of it checkout
(median job 32 s) with a full-tree checkout, while the gate itself runs in
about 7 s.

**Change.** `sibling-links-ci.yml` uses the same `filter: blob:none` plus
binary-exclusion sparse checkout as `conflict-markers-ci.yml` (no MP3, PNG,
ZIP, WebP, WOFF2, TTF, ICO or GIF; 419 tracked files).

**Verification.** On a copy of the tracked tree without those files (611 MB),
`node --test platform/pages/siblings.test.mjs`: 20 pass, 0 fail, 0 skipped;
`node platform/pages/siblings.mjs --check`: 0 orphans, within budget. Total
7.4 s wall. The after checkout time is not measured here (needs a runner);
the next reading of `ci_profile.py` should show `Sibling links` chk% falling.

**Not changed, ranked.** 1. `Portfolio Pages` site-builder tests remain the
largest consumer (84.6 min of 639). 2. `Page integrity`, `Prompts` and
`Doc references` checkouts are 40-71% of their jobs; same treatment possible
where the scripts read no binaries. 3. `quick-pick-survey CI` simulation tests,
17 min over 4 jobs.
