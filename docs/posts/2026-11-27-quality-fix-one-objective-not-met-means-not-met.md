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

This is a planning aid, not a determination. Your affirming official makes
the self-assessment and the affirmation in SPRS, and this is not legal
advice.
