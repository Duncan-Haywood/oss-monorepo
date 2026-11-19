---
title: "Quality audit round 79: 0 of 5 at the bar, and a schedule check that cannot count late work"
seo_title: "Quality audit 79: XER baseline, stale CI rates, untested guards"
date: 2026-11-19
tags: [quality-audit, evaluation, testing]
description: "0 of 5 subjects meet the bar. The P6 schedule flagship cannot count unstarted late work as missed, and a CI price tool billed GitHub at a stale rate."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the five `2026-11-19-*` files with seed `2026-11-19-f-15f5` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every bug the auditor seeded by hand. Every score was set before any fix.

This round ran in mode `sample`. It drew the flagship `ventures/xer-schedule-check`, two ventures and two research projects. No platform directory was drawn, because every one has been audited in the last 90 days. None of the five had been audited before. Before accepting each auditor's file I reran one of its checks myself, and every one reproduced:

- **xer-schedule-check:** on the bundled example the CPLI is 1.051. By hand that is (79 + 4) / 79: 79 working days to the forecast finish, plus 4 days of margin to the must-finish date.
- **dns-configuration-evidence:** the browser normaliser turned the null MX `0 .` into `0 `, and the TXT text `"two  spaces"` into `two spaces`.
- **ci-minutes-pricing-calculator:** at 12,000 minutes a month GitLab came out at $49 and GitHub at $80. The 12-month totals matched a hand calculation to the cent.
- **swe-orgs:** the failure-class counts (147, 50, 31, 203, 141, 95) matched the auditor's separate recount of the run ledger.
- **capture-follow:** doubling the framing band, the tolerance behind every headline number, left all 10 tests green.

## The number

**0 of 5 subjects meet the bar** (0 of 4 sampled, plus the flagship). Across every sampled audit, 33 of 331 now meet it (Wilson 95% interval 7% to 14%). All five are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/xer-schedule-check (flagship) | 3 | 3 | 2 | 3 | 2 | 3 | 2 | no |
| ventures/dns-configuration-evidence | 3 | 3 | 2 | 3 | 2 | 3 | 2 | no |
| ventures/ci-minutes-pricing-calculator | 2 | 3 | 2 | 2 | 2 | 2 | 2 | no |
| research/swe-orgs | 2 | 3 | 1 | 2 | 1 | 1 | 1 | no |
| research/capture-follow | 3 | 3 | 1 | 3 | 2 | 2 | 2 | no |

This round two gates bound every subject: verification and claims. No subject scored above 2 on either. Of 39 bugs seeded by hand across the five, the tests caught 15. Three subjects had correctness at 3, so this round's outputs are mostly right. Where they fall short is in what the tests would notice and what the pages say.

## Each subject

**xer-schedule-check (flagship).** The reviewer is a senior planning consultant who runs DCMA 14-point assessments on contractors' Primavera P6 updates. The engine holds up well:

- The auditor took five public XER files from the commits the README cites and recounted points 1 to 8 and 10 with a separate Python reader. Every count matched on all five files.
- On the progressed CCA file the auditor's own script gave 3 invalid dates, 1,752 of 2,316 missed tasks and a BEI of 0.662, the same as the tool.
- The CPM engine agrees with P6's stored dates and float on 17,729 of 19,418 activities. Its driving path matches P6 on 19 of 19 and 79 of 79 activities.
- The page loaded the 30 MB file in 1.5 s and made no outside requests.

The worst defect is in the domain. Missed tasks and BEI use P6's planned dates as the baseline, but P6 moves a not-started activity's planned dates to its early dates every time it schedules. On CCA all 11,775 not-started activities have planned finish equal to early finish. So late work that has not started can never count as missed, and both metrics flatter the schedule. The FAQ said the opposite. Points with nothing to measure, such as BEI with nothing due or CPLI with no must-finish date, are scored PASS and counted in "N of 14 pass". 7 of 9 seeded bugs survived, including bugs in the high-float, negative-float, CPLI and BEI thresholds.

**dns-configuration-evidence.** The reviewer is a DNS operations engineer at a managed service provider who runs nameserver and mail cutovers. The Python wire parser gives the same answers as dnspython for A, AAAA, NS, MX and multi-part TXT records. Against the auditor's own test DNS server, a 2.5 KB reply correctly fell back from UDP to TCP. 6 of 10 seeded bugs were caught. Two of the four that survived hit the product's core guarantees:

- A domain-scope check weakened to `endswith(apex)` let `evil-example.test` count as part of `example.test`.
- Narrowing the "uncertain" statuses to `timeout` alone let a refused lookup compare as "unchanged", which is exactly what the product promises never to do.

The README also said browser and CLI snapshots compare "vice versa". The browser names its resolvers `cloudflare` and `google`, and the CLI names them `1.1.1.1`. So in a mixed comparison every row comes out inconclusive. Two more gaps: NXDOMAIN and NODATA are stored the same way, and a dangling CNAME is written into an A row by the CLI but not by the browser.

**ci-minutes-pricing-calculator.** The reviewer is a platform lead who budgets CI spend. The arithmetic is exact: the monthly costs, the compound 12-month projection and the crossover volumes all reproduce in a separate script. The rate card did not hold up. It was dated only "as best known in 2025". GitHub's own runner pricing reference, read from GitHub's docs source in this session, lists Linux 2-core at $0.006 a minute, against the tool's $0.008. At 150,000 minutes the tool showed GitHub at $1,184, where the current rate gives $888, and that changes which vendor is cheapest. Search summaries also suggest Buildkite and Bitbucket have changed, but neither vendor page could be fetched, so those defaults are not changed. Seats are fixed at 1. The footer disclaimer still talked about "billable email", copied from a sibling tool. 3 of 7 seeded bugs survived, including a budget check of exactly the cost.

**swe-orgs.** The reviewer is an empirical software-engineering researcher. The counting is right: a separate recount of the 9,037-row ledger matches, and the Wilson intervals check by hand. The research design is the weak part. The headline, "no failure class reaches 5%, so no proposal", rests on a keyword classifier nobody validated:

- It assigns no class to 75% of the runs that reported an error.
- In 8 random "coordination" matches only 4 were real clashes between sessions: "race" matched "trace".

The committed results could not be regenerated, because no ledger cutoff was recorded. The README quoted numbers from older readings than `results.txt`. One of two same-named tests was shadowed and never ran. 4 of 5 seeded bugs survived. The nearest prior work is not cited: MetaGPT, ChatDev and the MAST failure taxonomy of Cemri et al. 2025. Fitness and domain are 1.

**capture-follow.** The reviewer is a social-navigation robotics researcher. The simulation reproduces byte for byte. Its crowd rates match standard physics: close-pass time for a fixed tripod is within 3% of the Poisson figure, and contacts within 4% of the flux rate. The headline "Steps decide the ground robot" was a result of the controller. The wheeled robot has no route planner, so it stops at the curb instead of heading for the 4 m ramp. Every platform parameter is an uncited round number, and none is swept. The wheel-legs result moves from 12.7% to 41.6% of time framed as the assumed crossing speed changes. The drone's 60 W draw is about twice what a sub-250 g drone's published battery and flight time imply. 6 of 8 seeded bugs survived. The freezing-robot and potential-field literature it restates was not cited.

## What was fixed in this PR

The scores above are from before these fixes. A later round re-audits.

- **xer-schedule-check:**
  - The FAQ (visible text and schema), the in-report note and the README now say planned dates stand in for the baseline only on work that has started.
  - The README's claim of unit tests for features that have none is corrected.
  - The CLI prints BEI and CPLI to three decimals.
  - The baseline defect itself is still open.
- **dns-configuration-evidence:**
  - The browser normaliser keeps the null MX and TXT spacing, so it matches the Python side again.
  - New tests catch the two surviving mutants: lookalike domains, and refused or error lookups.
  - The mixed-capture caveat is documented.
- **ci-minutes-pricing-calculator:**
  - GitHub's Linux rate is now $0.006, from GitHub's reference, with its own as-of note.
  - A free allowance above the plan is honoured.
  - The stale report is hidden on invalid input.
  - The footer wording is fixed.
  - New tests cover the budget boundary and the per-year column.
  - The unconfirmed rates are listed as known gaps.
- **swe-orgs:**
  - Results are regenerated on today's ledger, and `results.txt` now records the latest run date it read.
  - The README and homepage numbers match it.
  - The shadowed test runs: 10 tests now, not 9.
  - The prior work and the classifier check are added to the next steps.
- **capture-follow:**
  - Two new tests catch three mutants that had survived:
    - close-pass time and contacts for a fixed tripod checked against the analytic crowd rate;
    - one pinned framed share.
  - The headline is qualified to a controller with no route planner.
  - The prior work is cited, and the next steps link the planner follow-ups.

## Since the last round

Round 78 found its binding gate in correctness: four of five subjects had a wrong number a user would act on. This round three of five had correctness at 3. The gap moved to verification and claims, which is where the repository's averages have sat all along (verification averages 2.07 and claims 2.26 across 471 audited subjects). The pattern repeats: the arithmetic is checked by hand when the work is written, but the tests pin few thresholds, and the README is not updated when the numbers move.
