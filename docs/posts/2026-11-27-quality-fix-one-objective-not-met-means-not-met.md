---
title: "Quality fix: our CMMC score counted a requirement as met when one of its objectives was not"
seo_title: "SPRS score: one objective not met means the requirement is not met"
date: 2026-11-27
tags: [quality-audit, cmmc, for-customers, defense-contractors, compliance]
description: "Under 32 CFR 170.24, a CMMC requirement is NOT MET if any assessment objective is not satisfied. CMMC Workspace now scores it that way and flags it."
---

The SPRS score is 110 minus the point value of every NIST SP 800-171
requirement you have not met. Each requirement has one or more assessment
objectives in NIST SP 800-171A, 320 in all. The CMMC rule decides how the
two fit together. 32 CFR 170.24(b)(2) says a requirement is **Not Met** when
"one or more applicable objectives for the security requirement is not
satisfied". We read the rule on eCFR on 2026-11-27.

The quality audit of 2026-11-26
([audit file](../../portfolio/quality/audits/2026-11-26-cmmc.json), defect 0)
found that CMMC Workspace did not apply this rule. The app records two things
for each requirement: its status (implemented, partially implemented and so
on) and a met or not-met result for each objective. The score read only the
status. So if you marked AC.L2-3.1.1 implemented and one of its six
objectives not met, the score still gave you all 5 points. That is the
number your affirming official types into SPRS, and it was too high with no
warning. Our own FAQ page already said "a requirement counts as met only when
every one of its NIST SP 800-171A assessment objectives is met". The app did
not follow it.

## What changed

- **The score reads the objectives.** A requirement counts as met only when
  its status is implemented or not applicable *and* none of its objectives is
  recorded as not met. In the case above, the score is now 105, not 110. Level
  1 works the same way: one objective not met fails that requirement, and so
  the whole level.
- **The conflict is shown, not just scored.** The dashboard now lists each
  requirement whose status says met while an objective says not met. The
  generated System Security Plan says the same in its self-assessment
  summary. You can then fix the status or re-assess the objective before the
  score goes to SPRS.
- **The SSP rule follows the objectives too.** If an objective of 3.12.4 (the
  system security plan) is not met, the app now produces no score. The
  methodology produces none without an SSP.
- **Citations corrected.** The POA&M reasons cited 32 CFR 170.21(a)(2)(iii)
  for the 1-point rule and (a)(2)(iv) for the six requirements that can never
  be on a POA&M. The rule numbers them (a)(2)(ii) and (a)(2)(iii), and there
  is no (a)(2)(iv). Defect 3 in the same audit. The free
  [SPRS score calculator](https://marisstella.app/cmmc/sprs-score-calculator)
  carried the same wrong number and is corrected too.

## Tests that would have caught it

The audit also found three POA&M checks with no test. A mutant could let a
3-point requirement such as 3.1.5 or 3.8.8 onto a Conditional-status POA&M,
reject a score of exactly 88, or report "all 110 met" while gaps were open,
and every test stayed green (defects 1 and 4). We added tests for all of
these:

| seeded change | before | now |
|---|---|---|
| status alone decides met (objectives ignored) | not tested | 4 tests fail |
| `weight === 1` → `weight <= 3` in POA&M eligibility | survived | 1 test fails |
| `score < 88` → `score <= 88` | survived | 1 test fails |
| `allMet` hard-wired to true | survived | 3 tests fail |

The unit suite has 508 tests and passes, and the typecheck is clean. The
worker suite and the run record are in the pull request.

## What is still open

The audit's defect 2 is still open. 32 CFR 170.24(b)(1)(i) and (ii) assess
two more cases as MET: enduring exceptions described in the SSP, and
temporary deficiencies under an operational plan of action. The app does not
model either yet. A requirement under one of them has to be recorded as
implemented, with the reason in its notes. A later audit will re-check all
of this.

## The re-check, 2026-11-28

A re-audit the next day
([audit file](../../portfolio/quality/audits/2026-11-28-cmmc-reaudit.json))
checked every defect from the first audit against the code as it now is.
The four this fix marked are closed. The case above scores 105, lists the
conflict, and blocks Conditional status, because 3.1.1 is worth 5 points
and only 1-point requirements may be on the POA&M. All three mutants that
used to survive now fail a test.

We redid the arithmetic by hand from the DoD Assessment Methodology and
32 CFR 170.21. Seven cases match:

| case | by hand | app |
|---|---|---|
| 3.1.1 not met, 3.1.3 partial, 3.5.3 MFA for remote and privileged users only | 110 − 5 − 1 − 3 = 101 | 101 |
| 3.13.11 encrypted, not FIPS-validated | 107, may be on the POA&M | 107, eligible |
| 3.1.1 implemented, objective [a] not met | 105 | 105, flagged |
| nothing implemented but the SSP | −203 | −203 |
| 22 one-point items open, then 23 | 88 passes, 87 does not | same |
| POA&M closeout from 2026-01-15 and from 2028-01-15 | 2026-07-14, 2028-07-13 (leap year) | same |

We also scored 2,000 random assessments with the app and with the free
SPRS calculator. The two engines were written separately, and they gave
the same score every time.

The re-audit found three small defects the fix had not touched, plus one
new one. All four are fixed in the same pull request:

- **A result can now be cleared.** Once an objective was marked met, not
  met or N/A, there was no way to set it back to unanswered. Choosing "—"
  now clears it.
- **The two Level 1 lists are now checked against each other.** The app's
  list of the 15 Level 1 requirements was typed out a second time, apart from
  the list behind the free
  [Level 1 checklist](2026-11-25-cmmc-level-1-self-assessment-checklist.md),
  and nothing kept the two the same. A new test checks every requirement and
  all 59 objectives. The wording matches word for word, but the test found
  one difference. Where NIST gives a requirement only one objective (3.10.4
  and 3.14.4), the free page calls it "3.10.4" and the app calls it
  "3.10.4[a]". The test now pins that this is the only difference.
- **A new test for the conflict list.** A requirement you already marked not
  implemented, with an objective not met, is consistent, and it should not
  appear in the conflict warning. Nothing tested that until now.

Re-audit result: the app now **meets the bar** on correctness, claims and
tests. It still falls short on fitness, because of the gap above:
operational plans of action and enduring exceptions. That is the next fix.

## Enduring exceptions and temporary deficiencies, 2026-11-28

A second re-check the same day
([audit file](../../portfolio/quality/audits/2026-11-28-cmmc-reaudit-b.json))
confirmed the four fixes above and closed the gap. 32 CFR 170.24(b)(1) assesses
two Level 2 cases as **Met** even when an objective is not:

- **An enduring exception.** Full compliance is not feasible, for example a
  CNC controller or test bench on an operating system the vendor locks. You
  describe it, with its mitigations, in the system security plan.
- **A temporary deficiency.** A control you had implemented lapsed and the fix
  is known or under way. You address it in an operational plan of action, with
  reviews, milestones and progress. This is not the POA&M for Conditional
  status, and it is not for a control you have not yet implemented.

On a requirement marked Implemented, CMMC Workspace now lets you pick either
one and write the description. With a description, the requirement counts as
met, the dashboard lists it apart from the conflicts, and the SSP prints it
under the requirement and in its summary. If you leave the description blank,
it does not count.

| case | by hand | app |
|---|---|---|
| 3.5.3 implemented, objective [a] not met, temporary deficiency with its plan | Met: 110 | 110, all met |
| the same with no plan text | Not Met: 110 − 5 = 105, and a 5-point item cannot go on a POA&M | 105, Conditional blocked |
| 3.13.11 not FIPS-validated, 3.1.8 and 3.3.1 not implemented | 110 − 3 − 1 − 5 = 101, 3.3.1 blocks | 101, 3.3.1 blocks |

Level 1 has no such exception. It needs every requirement met, so the app
refuses an exception there. Five seeded bugs in the new rules each make a test
fail.

Two small points are still open. The app accepts an exception on 3.12.4, the
SSP itself, even though the exception has to be described in the SSP. And the
rule's wording comes from the first audit's reading: eCFR could not be reached
from the session on 2026-11-28, so the text has not been re-read. Check
170.24(b)(1) and the definitions in 170.4 before you rely on an exception.

This is a planning aid, not a determination. Your affirming official makes
the self-assessment and the affirmation in SPRS, and this is not legal
advice.
