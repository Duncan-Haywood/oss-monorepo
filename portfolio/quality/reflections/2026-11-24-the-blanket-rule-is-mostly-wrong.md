# The blanket "fixed" rule is mostly wrong, and the re-audit loop runs one day in ten

Reflection 3, 2026-11-24. The data is the 667 audit files in
[`../audits/`](../audits/) (620 subjects, 4,368 defects in the latest audit
of each), read with `python3 platform/ci/quality_audit.py metrics --md` and
the commands quoted below. The last reflection was
[2026-11-17](2026-11-17-the-fix-loop-is-open.md). `quality_audit.py mode`
forced this one because none had been written for seven days.

**Limits.** The main new measurement (finding 1) rests on 9 re-audits and
77 re-checked defects, all from one day (2026-11-21). They were not a
random draw: `reaudit` puts fixed highs first. The intervals are wide and
are quoted with every rate. In the "on arrival" status of each defect,
"partly closed" is the re-auditor's own call; I copied it and did not
re-judge it. For four files, the basis (`marked` or `assumed`) comes from
the prior audit's git history, because the re-audit's own PR later added
`fixed_by` marks to the prior file (patio-door, mortgage-escrow). The
evidence is that history: `git show fcadeff06:` and `git show 283171ed2^:`
on those files.

## The headline

The sampled share meeting the senior-professional bar, structured audits
only: **13 of 290 (4%, Wilson 95% 3% to 8%)**, against 8 of 160 (5%) a week
ago. That is flat. No sampled subject was built under the new guidance, so
it could not have moved yet (finding 3).

## Three findings

### 1. The blanket rule is right less than half the time (stage: the audit loop)

Reflection 2 found 1,313 defects counted as fixed only because their audit
listed some fix PR and marked no defect (`defect_fixed`'s older reading).
It spot-checked 8 highs drawn at random and found all 8 addressed, so it did
not flip the default. The re-audits since then give the first measurement
across every severity. Each re-audit checked every earlier defect against
the code as it stood when the re-auditor arrived. I joined each one to how
the earlier record counted it:

| how the earlier audit counted the defect | re-checked | closed on arrival | partly | still open | closed, 95% |
|---|---|---|---|---|---|
| marked fixed, its own `fixed_by` | 29 | 25 | 3 | 1 | 86% (69% to 95%) |
| assumed fixed, the blanket `fix_prs` reading | 27 | 11 | 6 | 10 | **41% (25% to 59%)** |
| counted open | 21 | 0 | 0 | 21 | 0% (0% to 15%) |

Subjects, by basis: marked in rev-rec, youtube-chapters-check, eu-battery-regulation-checker,
tiktok-shop-settlement-analyzer, sudoers-check and patio-door-bid-calculator;
assumed in freelance-writer-rate-calculator, mrr-pulse and
mortgage-escrow-analysis-checker. Among the 4 assumed highs, 1 was closed
(mortgage-escrow's deficiency rule), 1 partly (mrr-pulse's tiered prices)
and 2 open (mrr-pulse's per-subscription logo churn, freelance-writer's
headline comparison).

Three readings:

- **`fixed_by` marks are trustworthy.** 28 of 29 were at least partly
  closed. The one miss is sudoers-check: its untested runas-root guard was
  marked fixed by PR #16361, but the mutant still survived on `main`.
- **The open count is accurate.** None of the 21 defects counted open had
  been quietly fixed. The queue's open rows are real work.
- **The blanket reading is not.** It closed fully 11 of 27. Applied to the
  1,260 defects it still covers, about 750 (520 to 950) are not fully closed.
  The 1,260 include 136 highs, and the "31 high defects open" headline counts
  none of them (1 of the 4 assumed highs re-checked was closed).
  Reflection 2's random draw of highs was the favourable case. Fix
  sessions take the worst defect first, and the blanket rule then hides the
  rest of the audit along with it.

Why it fails: in the three assumed audits, the PR in `fix_prs` was a fix PR
for one or two defects (PRs #15342, #15653, #15569), and the rest were
written into README "Known gaps". Mortgage-escrow's verdict says so: "Three
were only written into README Known gaps and remain". The defect was
recorded where a reader of the subject sees it, but not in a form the queue
can count.

**Shipped:**
- `quality_metrics.reaudit_outcomes` and a `metrics --md` line print the
  table above from the audit files.
- `validate` now requires every re-audit to carry `prior_audit` and one
  `prior_defects` row per earlier defect, `{index, severity, basis, status,
  what}`. Three of the first nine re-audits wrote this only in prose, under
  three different keys (`reaudits`, `reaudit_of`, none), so I tallied them
  by hand. I backfilled all nine with the tally above; each carries a
  `prior_defects_note` saying so. Seeding `if False:` over the basis check
  fails the new test (`quality_mutate.py`, `caught: true`).

**Not shipped, and why:** flipping `defect_fixed` so that assumed defects
count as open. That is now the better-supported reading (41% closed), but it
would put about 1,260 rows in the fix queue at once and double the fix mode
for weeks. A large share of those rows are fixed (11 of 27), so fix sessions
would spend their first hour on each one re-discovering that. The cheaper
route is the re-audit, which resolves a whole audit in one session and
records the result. Finding 2 makes that route faster. If the assumed count
has not fallen below 1,000 by reflection 4, flip it.

### 2. The re-audit loop runs one day in ten (stage: the audit loop)

Reflection 2 added `reaudit` at 10% of quality sessions. It ran on exactly
one day: 2026-11-21, with nine files. The mode is drawn once per date
(`mode_for(date)`), so every quality session on a given day runs the same
mode. Since 2026-11-17 the days went fix, sample, census, reaudit, sample,
sample (`quality_audit.py mode --date 2026-11-18` … `-23`, as replayed on
today's state). Meanwhile census and sample kept adding audits, and fix
sessions kept adding fix PRs. The queue awaiting a re-check grew from 248 to
**511**, faster than one reaudit day a week can drain it (about 57 such days
at 9 a day).

Re-audits are also the most productive audits the programme has run. Five of
the nine subjects met the bar as found on `main` (rev-rec,
youtube-chapters-check, eu-battery-regulation-checker,
mortgage-escrow-analysis-checker and sudoers-check, by `meets_bar` on their
scores). Across all sampled structured audits the rate is 4%. Every one of
the nine also lists a fix PR of its own for what it found; patio-door's
PR #18138 closed seven defects. The selection explains part of this:
re-audits go to subjects someone already fixed.

**Shipped:**
- `MODE_WEIGHTS`: reaudit 0.10 to 0.20, sample 0.35 to 0.30, census 0.20
  to 0.15. Sample stays the largest share because it is the only unbiased
  estimate. Census gives up the most because coverage (24.3%) is the least
  urgent of the three.
- `reaudit_due` now puts audits whose fixes are only assumed ahead of
  marked ones within each group. That is where finding 1 says the record is
  least reliable: 179 of the 511 audits are assumed-only, 99 of them with a
  high. Dropping the new sort key fails
  `test_reaudit_puts_assumed_before_marked_within_highs` (`caught: true`).

### 3. Build-side guidance: in place for ventures, unused for research, untested (stage: the process loop)

Reflection 2 put two pre-merge checks in `PRODUCT_PLAYBOOK.md` §7: a "Spec
sources" line with a test pinned to an outside worked example, and one
seeded mutation before merge. Uptake so far: **16 of the 44 venture
READMEs** first added since 2026-11-18 have a "Spec sources" line (`git log
--diff-filter=A --since=2026-11-18 -- 'ventures/*/README.md'`, then `grep -c
"Spec sources"`; some of the 44 may be renames). Only 4 of the 44 have been
audited: pairwise-ranking met the bar, and xer-schedule-check,
ifc-quantity-takeoff and home-battery-planner did not. Their seeded mutants
were killed 12 of 27 times. That is too few to say anything, so the
definition-of-done metric is still unmeasured, not failed.

Kill rates by audit date (structured audits, all subjects):

| stratum | audits to 2026-11-17 | after |
|---|---|---|
| venture mutants killed | 429 of 825, 52% (49% to 55%) | 332 of 598, 56% (52% to 59%) |
| research mutants killed | 211 of 615, 34% (31% to 38%) | 151 of 409, 37% (32% to 42%) |
| research verification at 3+ | 4 of 120 | 2 of 82 |

These are audits of subjects drawn from the never-audited population, mostly
built before 2026-11-17, so the small venture rise is not evidence for the
new lines.

Research is still where verification is weakest: 2 of the last 82
research audits pass it. The research equivalent of the definition-of-done
lines, which reflection 2 said "belongs in a small control-plane PR of its
own", was never opened. `research/CLAUDE.md` still has no mutation step.
That is one of at least 19 open pull requests titled "control plane" waiting
on the owner, the oldest from 2026-11-10 (#14612). They include #14434,
the quality-share change this programme's own README cites. The binding
constraint named in reflection 2, ownership of the build guidance, has not
moved, and adding a twentieth PR to that queue would not move it. This
reflection names it again for the owner instead.

## What changed since reflection 2

| fix | metric | 2026-11-17 | 2026-11-24 |
|---|---|---|---|
| reaudit mode | subjects re-audited after a recorded fix | 2 of 250 | 16 of 527 (511 await) |
| reaudit mode | defects assumed fixed (no `fixed_by`) | 1,313 | 1,260 |
| reaudit mode | awaiting re-audit with a README listing the audit as open | 74 of 248 | 188 of 511 |
| reaudit mode | of re-checked "fixed" defects, the share still not fully closed | not measured | marked 4 of 29; assumed 16 of 27 |
| kill-rate metric | seeded bugs killed, structured audits | 47% | 48% (1,312 of 2,760) |
| definition-of-done lines | venture mutants killed, ventures built after 2026-11-17 | 53% (all) | 12 of 27, 4 audits: too few |
| definition-of-done lines | venture `domain-rule` defects per audit | 1.27 | 1.28 (audits after 11-17; mostly older ventures) |
| instrument split | sampled share, structured audits only | 5% (8 of 160) | 4% (13 of 290) |
| research DoD (owner PR) | research verification pass, structured audits | 6 of 97 | 2 of 82 since 11-17 (PR never opened) |
| (fix mode) | high defects open in the queue | 0 | 31 (the marks surfaced what the blanket rule hid) |

## What to check in reflection 4

| fix | metric | now |
|---|---|---|
| reaudit weight 0.20 | re-audit files written per week | 9 (one day) |
| reaudit weight 0.20 | subjects awaiting re-audit | 511 |
| assumed-first queue order | defects assumed fixed | 1,260; flip `defect_fixed` if still above 1,000 |
| `prior_defects` rows | assumed-basis defects closed on re-check | 11 of 27 (41%, 25% to 59%) |
| `prior_defects` rows | marked defects closed on re-check | 25 of 29 (86%) |
| definition-of-done lines | new venture READMEs with "Spec sources" | 16 of 44 |
| definition-of-done lines | mutants killed in audits of ventures built after 2026-11-17 | 12 of 27 (4 audits) |
| research DoD (owner) | research verification at 3+, audits after 2026-11-17 | 2 of 82 |
