# agent-defects research log

## 2026-11-23 · Milestone 1 result: no rework proxy separates the 4,085 audited defect lines from 5,929 random lines of the same files (odds ratios 0.80 to 1.56, every interval spanning 1), and defects sat on main a median 34 days before an audit found them; H1 and H2 held

- **Run.** `extract.py --jobs 16` over 2,256 (audit, file) pairs took about 10 minutes after a batched blob fetch (lazy per-blob fetches had made the first attempts unusably slow; see the README's Reproduce). `analyse.py` takes about 30 s. 7 tests pass.
- **Coverage.** Of 4,661 defects: 4,136 blamed to a non-blank line, 397 without a `path:line`, 103 on a blank line, 19 out of range, 6 file absent, 51 on a commit with no PR on main. 4,085 case lines (640 audits, 794 PRs) and 5,929 controls in strata that have a case.
- **H1 held.** All severities: `named_fix` 2.6% of defect lines against 2.5% of controls, MH OR 1.56 [0.88, 2.77]; `fix_touch` 24.0% against 20.2%, OR 0.80 [0.60, 1.07]; `reverted` 0 against 0. High severity: 1.88 [0.31, 11.3] and 0.93 [0.38, 2.27]. No proxy reached OR 2 with an interval excluding 1.
- **H2 held.** Median merge-to-audit latency 34.3 days (high severity 37.9), p10 18.0, 92.3% over 14 days.
- **Ablations.** Full 14-day window for cases and controls: `named_fix` OR 2.10, RBG [0.98, 4.48], cluster bootstrap [1.14, 6.0], flagging 2.6% of defect lines, so borderline and of no practical use. `big` (over 20 paths): OR 1.34 [1.06, 1.70] overall, 3.79 [2.31, 6.22] in the flagship stratum.
- **Unplanned, and it limits the design.** In 1,575 of 2,150 strata the same PR(s) wrote every case and control line, so the odds ratios rest on the other 575. Most audited files were written whole in one session, so a per-PR signal cannot pick out the defective line in them. Milestone 3's SZZ comparison and milestone 5's per-PR features have to account for this.
- **Link check (12 random, informal).** 10 plainly right, 1 unrelated (drift likely), 1 an omission pointed at its section. Milestone 2 measures this properly.

## 2026-11-23 · Milestone 1 planned: link each audited defect line to the pull request that wrote it, and test whether 14-day rework proxies flag those PRs more than PRs that wrote random lines of the same file

Written before the full extraction finished. **Seen before this plan:** a debugging
run of `extract.py --limit 60` (60 of 2,256 audit-file pairs, 92 usable case
lines from 21 audits) printed odds ratios with intervals from about 0.2 to 30, so
nothing in it settles a hypothesis; the hypotheses and thresholds below are the
ones in `PROPOSAL.md`, written before that run.

- **Data.** 667 audits in `portfolio/quality/audits/` (4,661 defects, 4,311 with
  a `path:line`), main's full first-parent history (blob-less clone plus a
  batched fetch of the ~16,800 blob versions of the audited paths).
- **Case.** The defect's line, blamed at the first parent of the main commit
  that added its audit file. **Control.** Three non-blank lines of the same file
  at the same tree, at least 10 lines from every defect line that audit names
  there, drawn with a seed from the audit and path.
- **Exposures** of the PR that wrote the line, using history up to
  min(merge + 14 days, audit date): `named_fix` (a later PR names it and reads
  as a fix), `named_any`, `fix_touch` (a fix-worded PR touched the same file),
  `reverted`, and `big` (the PR touched over 20 paths).
- **H1** is tested on `named_fix`, `fix_touch` and `reverted`, all severities and
  high only: refuted if any has a Mantel-Haenszel odds ratio of 2 or more with a
  95% interval excluding 1. **H2**: refuted if the median merge-to-audit latency
  of case lines is 14 days or less.
- **Ablations reported, not scored:** high or medium severity; lines whose full
  window closed before the audit (cases and controls); uniform sample audits
  only; each stratum.
- **Caveat set in advance.** A line-level link: an omission defect ("no lag after
  the period") is blamed on whatever line the auditor pointed at; milestone 2
  measures how often the link is wrong. The auditors are agent sessions with a
  rubric, not people.
