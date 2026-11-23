# agent-defects: do rework metrics find the defects in code written by AI coding agents?

**Live page:** https://marisstella.app/research/agent-defects/

A research programme (proposal: [`PROPOSAL.md`](PROPOSAL.md); log: [`LOG.md`](LOG.md))
on this repository studying itself. Every pull request here is written and merged by
an autonomous coding-agent session with no human review. A separate quality track
audits a random sample of the finished work against a seven-part rubric and names
each defect's file and line (`portfolio/quality/audits/`). That gives something
repository-mining research rarely has: defects located by inspection, not by a
later fix. The question is whether the usual cheap signals of bad changes (SZZ-style
fix links, 14-day follow-up fixes, reverts) point at the pull requests that wrote
those defects. Produced with AI assistance (Claude Code); the auditors are also
agent sessions, which is a stated limitation.

**Headline (milestone 1, 2026-11-23).** 4,085 audited defect lines from 640 audits
were traced with `git blame` to the 794 pull requests that wrote them, and
compared with 5,929 random control lines from the same files and trees. **No
rework proxy separates them.** A later fix-worded PR naming the PR: 2.6% of defect
lines against 2.5% of controls (Mantel-Haenszel odds ratio 1.56, 95% CI 0.88 to
2.77). A fix-worded PR touching the same file within 14 days: 24.0% against 20.2%
(OR 0.80, 0.60 to 1.07). Reverts: none at all. For high-severity defects, any fix
proxy flags 24.8% of defect lines and 25.0% of controls. **The defects surface
late:** the median defect line had been on main 34 days when an audit found it
(37.9 days for high severity), and 92% were older than the 14-day window the rework
metrics use. Both pre-registered hypotheses held (H1: no proxy reaches an odds
ratio of 2 with an interval excluding 1; H2: median latency over 14 days).

**What that means.** In this repository, "no reverts, little rework" (the
[first rework reading](../../docs/reports/rework-first-reading-2026-11-13.md):
0 reverts, median 14-day line survival 0.963) does not mean the work was right. The
defects the audit finds were never fixed inside the window, so a metric built on
fixes cannot see them. A second fact limits any per-PR signal: in 1,575 of the 2,150
audited files, every case and control line was written by the same pull request(s),
because most audited files were written whole in one session. Within those files,
no property of the pull request can tell the defective line from the rest.

## Method

- `experiments/m1_blame/extract.py` reads every audit (667 files, 4,661 defects,
  4,311 with a `path:line`), finds the main commit that added the audit, and runs
  `git blame` on the file at that commit's parent (the tree the auditor read). The
  blamed commit maps to its pull request: a squash commit on main's first-parent
  chain carries `(#N)`, and a commit from a merged branch belongs to the merge's
  PR. For each file it draws three control lines (non-blank, at least 10 lines from
  every defect line of that audit, seeded by audit and path). It writes
  `data/lines.csv.gz` (one row per blamed line) and `data/prs.csv.gz` (every PR on
  main with the PRs it names, how many paths it touched, and which audited paths).
- `experiments/m1_blame/analyse.py` computes each line's exposures from history up
  to min(merge + 14 days, audit date): `named_fix` (a later PR names it and its
  subject reads as a fix), `named_any`, `fix_touch` (a fix-worded PR touched the
  same file), `reverted`, and `big` (the PR touched over 20 paths). Odds ratios are
  Mantel-Haenszel over (audit, file) strata with the Robins-Breslow-Greenland
  interval, checked with a 400-draw cluster bootstrap over audits.
- Snapshot: main at `fa2d7ec276` (PR #18484, 2026-11-23). The audits are from
  2026-11-07 to 2026-11-23.

## Results (from [`experiments/m1_blame/results.txt`](experiments/m1_blame/results.txt))

| subset | defect lines | controls | `named_fix` OR | `fix_touch` OR | any fix proxy, defect vs control |
|---|---:|---:|---|---|---|
| all severities | 4,085 | 5,929 | 1.56 [0.88, 2.77] | 0.80 [0.60, 1.07] | 26.1% vs 22.2% |
| high severity | 347 | 888 | 1.88 [0.31, 11.3] | 0.93 [0.38, 2.27] | 24.8% vs 25.0% |
| full 14-day window only | 3,772 | 5,327 | 2.10 [0.98, 4.48] | 1.02 [0.64, 1.63] | 23.3% vs 18.4% |
| uniform sample audits | 2,786 | 4,112 | 1.23 [0.60, 2.56] | 0.73 [0.52, 1.02] | 26.5% vs 22.9% |

- **One borderline signal.** With both cases and controls restricted to PRs whose
  whole 14-day window closed before the audit, `named_fix` reaches an odds ratio of
  2.10: the RBG interval includes 1 (0.98 to 4.48), the bootstrap does not (1.14 to
  6.0). It flags 2.6% of defect lines, so even if real it would miss 97% of them.
  It is an ablation, not one of the pre-registered tests.
- **Size.** PRs that touched more than 20 paths wrote defect lines a little more
  often (OR 1.34, 1.06 to 1.70; 1.45 in uniform sample audits), mostly in the
  flagship stratum (3.79, 2.31 to 6.22). Milestone 5 tests size properly.
- **Exploratory, by run record.** For the 1,488 defect lines whose PR has a run
  record, defect share of blamed lines is 38.2% for Sonnet-written PRs and 37.1% for
  Opus-written ones, with no adjustment and no interval; not a finding.
- **Quick link check, not the milestone 2 measurement.** Of 12 random defect
  lines read by hand, 10 blamed lines plainly carried the defect (for example a
  `sweeps=300` default for a horizon-confound defect, or a SEPA country list
  missing Gibraltar). One pointed at an unrelated line, probably drift since the
  audit, and one pointed at the section a missing-citation defect belongs in.

## Limitations

The auditors are Claude sessions working to a rubric, not human experts, and
milestone 4 measures their agreement. A line link fits an omission defect badly,
since the auditor points at where the missing thing should be; milestone 2 measures
link validity on a hand-labelled sample. The fix keyword list is a heuristic in the
style of Mockus and Votta (2000). Census audits are not a uniform draw, so the
uniform sample row is the cleaner estimate. All of this is one repository, run by
one owner's agent fleet.

## Reproduce

```bash
git fetch --unshallow --filter=blob:none origin main              # history without blobs, ~25 s
python3 research/agent-defects/experiments/m1_blame/extract.py --jobs 16   # ~10 min; blame fetches blobs it lacks
python3 research/agent-defects/experiments/m1_blame/analyse.py             # ~30 s, writes results.txt
python3 -m pytest -q research/agent-defects/tests                          # 7 tests, standard library only
```

Lazy blob fetches make the first `extract.py` run slow. Fetching the audited paths'
blobs in one batch first (`git fetch origin --filter=blob:none --stdin` with their
object ids) cuts it to about 10 minutes. `analyse.py` needs only the committed
`data/` files.

## Next steps

Milestone 2 (link validity on 60 hand-labelled defects), then milestone 3: run
SZZ forward from the 1,072 audited defects whose fix PR is recorded and score it
against the audit's own location (`PROPOSAL.md`, H4).
