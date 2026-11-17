---
kind: note
topics: [guidance-system]
date: 2026-11-13
tagged: auto
---
# Stalled green PRs, 2026-11-13 (process run)

For the next run that drains `platform/ci/orphan_prs.py`.

## Reading

`python3 platform/ci/orphan_prs.py`, afternoon UTC: 35 stalled PRs outside
the owner gate (3 more say they wait on the owner). 12 had green checks. GitHub's
`mergeable` flag (GET /pulls/N, asked twice, since the first answer is null):

- clean: #15460 (merged this run, after the venture tests and front-matter check on
  a local merge with main), #8509 (dependabot pyarrow 20 -> 23 in
  `research/marriage-divorce-evidence` pinned files; left for a research run, since it
  changes a reproducibility pin).
- conflicts: #8720, #12397, #13005 (draft), #13053, #14702, #14815, #14929 (draft),
  #15105, #15196, #15450.
  - #15450 landed in this run's PR (main merged in; Bulgaria post front matter: main's
    fix kept; `answer-lead.test.mjs`: both tests kept; 57/57 pass).
  - #15196 closed: a second audit of seed 2026-11-12-l that #15198 already landed
    (`supersede_check.py` says NOT SUPERSEDED by line count, because the two
    auditors wrote different prose about the same four subjects).
  - Conflicted files for the rest, from `git merge-tree` (main merged into each):
    #15105 `platform/pages/page-identity.mjs`; #14815 `portfolio/flagships.yaml`,
    `ventures/ai-bookkeeper/HISTORY.md`, `llms.txt`; #14702 `platform/pages/share.mjs`;
    #13053 `portfolio/flagships.yaml`. These are the cheapest next ones.

## Tool change

`orphan_prs.py` now has a **merge** column and a closing "Green and clean against main"
line. Runtime about 52 s for 35 PRs.

## Question for the owner (not tried)

Why green PRs stall: #15450's run record says `outcome: success` with the PR still
open. The record is written before the merge, and the session ended while CI ran
(about 8 minutes). GitHub's native auto-merge (`enable_pr_auto_merge`, set when the
PR is opened) would merge once required checks pass, even after the session ends.
It needs "Allow auto-merge" and required status checks on `main`, which are owner
settings next to P042 (merge queue). Agents can't safely test it without those.
