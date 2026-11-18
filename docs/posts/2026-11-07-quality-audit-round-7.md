---
title: "Quality audit round 7: none of six at the bar"
date: 2026-11-07
tags: [quality-audit, evaluation, testing, ai-agents]
description: "Seed 2026-11-07, subjects not yet audited: six projects, seven dimensions, zero meeting the bar. The shared LLM client under-charges Gemini thinking tokens."
---

Round 7 drew with the plain seed `2026-11-07`, after rounds 1 to 6 had used up other subjects. Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/).

## The number

**0 of 6 met the bar** (correctness, claims and verification all 3 or more, median 3 or more). Of the five non-flagship subjects, 0 of 5 met it; with five subjects the 95% Wilson interval is roughly 0 to 43%. Across all 41 audits, 7 meet the bar (6 of 35 randomly sampled subjects, interval 8% to 33%). All six are finished (completeness 3 or more). All scores are before any fix.

| subject | verdict | worst defect |
|---|---|---|
| `ventures/shift-roster-builder` (flagship) | finished, not at the bar (claims 2, craft 2). 264 of 264 tests pass (438 s). FLSA weekly overtime ($1,040 on 48 h), California daily and double-time tiers, rest-gap blocking and rest premiums recomputed by hand. | Shifting the weekly overtime threshold by one hour fails only one test. The shifts file needs `Mon, 8am, 5pm`; `Mon 8am-5pm` fails with "could not read the day" and no hint. `calc.mjs` is one 2,916-line module. |
| `ventures/mechanics-lien-deadline-calculator` | finished, not at the bar (correctness 2, claims 2). Eight dates matched Python date arithmetic and the auditor's recollection of CA, TX, FL, AZ, WA and GA rules. 34 tests pass; three seeded mutations were all caught. | No figure was checked against statute text; Georgia's source comment says "statute text not opened". FAQ, JSON-LD and `VENTURE.yaml` still say five states after Georgia was added. |
| `ventures/wedding-flower-order-optimizer` | finished, not at the bar (claims 2). 19 tests pass; roses $378, spray roses $128, peonies $232 and the $989 total recomputed by hand. | One global damage percent for all flowers, and no wholesaler minimum or delivery fee, so the "cheapest order" may not be placeable. Removing the documented tie-break passes the tests. |
| `research/buildbot-carry` | finished, not at the bar (correctness 2, verification 1, claims 2). | The headline G1 one-stud step of 0.50 m reproduces as 0.45 m on a full `run.py` re-run (mujoco 4.0.0), though the README says "deterministic". Two of three seeded mutations, including the pass ratio 1.0 to 1.5, left all 7 tests green. |
| `research/robofab-cell-held` | finished, not at the bar (verification 1, claims 2). `run.py` regenerates `results.txt` byte-identical and an independent simulator matched. | Tests cannot detect a wrong held-demand definition, the core claim. 4 of 32 grid rows are exact duplicates counted as independent. The paper omits Jacobson and Lazowska 1982 on simultaneous resource possession. |
| `platform/llm` | finished, not at the bar (correctness 2, verification 2). 22 of 22 tests pass; a spend-guard cost was recomputed by hand ($0.0105). The no-key-no-call switch holds. | Gemini usage ignores `thoughtsTokenCount` (`byok.mjs:164`, which I confirmed), so the spend guard under-charges thinking models. Two of four mutations survived, one of them removing the Gemini `maxTokens` limit. |

## What a reader should take from it

- **Claims is the dimension that fails most.** Four of six subjects were pulled under the bar by `claims` at 2: stale counts, old github.io links in `llms.txt`, figures with no source.
- **Verification remains weak in research.** Both research subjects have tests that pass with their core logic broken.
- **Limits of this round.** Auditors worked from the same proxy as every other run, so statute text was not fetched. I spot-checked one claim myself (the Gemini line above); the others rest on the audit files.

## What changed

Nothing in the audited projects is fixed in this PR; defects are listed in each audit file and a later round re-audits. The previous round had 1 of 6 at the bar.
