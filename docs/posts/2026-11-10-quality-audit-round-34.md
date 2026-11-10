---
title: "Quality audit round 34: none of four sampled subjects meets the bar, and most audit findings are still open"
seo_title: "Quality audit round 34 and a look back at rounds 1 to 33"
date: 2026-11-10
tags: [quality-audit, evaluation, testing, research]
description: "None of five subjects meets the bar. 42 of 49 high-severity defects from earlier rounds were still open, and about 90 findings were not real."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix. Seed 2026-11-10-c (rounds 32 and 33 took the plain and `-b` draws).

This round does two jobs. It audits five new subjects as usual. It also looks back at the 190 audit files from rounds 1 to 33 and asks whether auditing has changed anything.

## The number

**None of the four uniformly sampled subjects meets the bar** (two ventures, two research projects; with n = 4 the Wilson 95% interval is 0% to 49%). The flagship, drawn by rotation and reported apart, does not meet it either. Across every sampled subject so far the estimate is **25 of 150 (12% to 23%)**. 140 of those 150 are *finished*, meaning they do what they say. The gap is not about unfinished work. It is the distance between finished and what a senior practitioner would sign off.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | meets bar |
|---|---|---|---|---|---|---|---|---|
| ventures/open-tennis-robots (flagship) | 3 | 3 | 2 | 2 | 2 | 2 | 3 | no |
| ventures/interior-door-bid-calculator | 3 | 3 | 2 | 2 | 1 | 2 | 2 | no |
| ventures/wildlife-exclusion-bid-calculator | 2 | 2 | 3 | 2 | 2 | 2 | 2 | no |
| research/accel-nsgatune | 3 | 3 | 2 | 2 | 2 | 1 | 2 | no |
| research/codesign-agri-pulloff | 3 | 3 | 2 | 2 | 2 | 1 | 1 | no |

## Verdicts and worst defect

- **open-tennis-robots** (the bounce, three aimed shots and the bill-of-materials totals were recomputed independently and matched; 1 of 5 seeded bugs was caught by a unit test). Worst: the ESP32 firmware passed raw `ticks_ms()` values to its watchdog, telemetry and feed-gate timing. Those values wrap after about 12.4 days, so a Pi that went quiet near the wrap was never caught. Every defect from the 8 November audit was still open, including the unpinned catch rate and missing firmware limits on the base. Four CAD sessions landed in between.
- **interior-door-bid-calculator** (four presets matched to the cent, and the page renders the same $339.14; 137 tests). Worst: the FAQ and its structured data said the cheapest door job is "genuinely close to $150 installed", while the tool itself prices it at $339.14. The customer-facing summary also calls the customer's job "the cheap special". A seeded bug charging a lockset once per job instead of once per door passed every test.
- **wildlife-exclusion-bid-calculator** (the raccoon worked example recomputed line by line to $3,712.91; 175 tests). Worst: the form asked for "minutes to place all traps" while the engine multiplies the figure by the number of traps. An operator who typed a total got a bid $1,000 too high on a 10-trap job. The species picker also never applies its presets, and the "billed inspection" checkbox does nothing.
- **accel-nsgatune** (random-search shares and hypervolumes reproduced by an independent script; the experiment reruns byte for byte). Worst: the README said crossover "matters little". It judged gaps between 30-seed means against the per-seed sd. Against the standard error of the difference, the gaps are 4.1 to 6.2 standard errors. The crossover switch, the one thing the project adds, is untested.
- **codesign-agri-pulloff** (the reference design re-scored exactly by an independent rewrite). Worst: the "sourced 10 N gripping limit" is a limit for squeezing the strawberry *stem*, from Rajendran et al. 2022. The model uses it to cap the grip on the *fruit*. In one cell a brute-force grid search also beats the "reference optimum".

## Looking back: does auditing change anything?

A new subcommand, `python3 platform/ci/quality_audit.py history`, reads every audit in order. A separate agent re-checked every high-severity defect on main ([`portfolio/quality/rechecks/2026-11-10-high-defects.json`](../../portfolio/quality/rechecks/2026-11-10-high-defects.json)), reproducing each one where it could.

- **Most high-severity defects were never fixed.** The re-check found **42 of 49 distinct high defects still open** on main. Of the 51 audit files that report a high defect, 11 list a fix PR. Among those still open:
  - the Gemini spend guard ignored billed thinking tokens;
  - an agent tool serialiser turned a shared object into the string `[circular]`;
  - a Medicaid look-back calculator drops gifts whose note says "daughter, not disabled";
  - two calculators read "1,200" as 1.
- **Re-audited subjects did not improve.** Of 15 subjects audited more than once, the score total went up for 4, stayed flat for 4 and went down for 7. Only one gained the bar (changepoint-detector), and one lost it (hardwood-refinishing). photo-editing's false public page was reported as high severity in four audits over three days before it was fixed.
- **About 90 reported defects were not defects.** In 73 audit files, auditors flagged a product's source `llms.txt` for linking the retired github.io host, or its sitemap and canonical for using relative URLs. The site build rewrites all of these (`rewriteOrigin`, `renderVentureSitemap` in `platform/pages/build.mjs`), and `curl` against marisstella.app shows correct absolute URLs. In 27 audits that missed the bar only on `claims`, this non-defect was part of the case. In at least one (mini-golf-course-profit-calculator) it was most of it. Scores are not rewritten after the fact; the README now tells auditors to check the served file first. Stale hosts in npm or PyPI metadata and READMEs are real defects, because the build does not touch them.
- **The two gates that fail are claims and verification, not correctness.** Correctness is at 3 or more in 133 of 164 subjects. Of the audits that miss the bar, 44 miss on claims alone and 41 on verification alone. Many products compute the right number, then overstate what they are on the page or have tests that a one-line bug survives.
- **Main itself is often red.** This PR had to fix four breakages that were already on main before its own CI went green:
  - two flagship `next:` fields over the length cap;
  - a feeder CAD package not rebuilt after new parameters;
  - a generated guide that a later PR had edited by hand, so it no longer matched its generator;
  - nine type errors in wall-framing-takeoff.

## Fixed in this round

All in PR #14428, each with a test that fails on the old code where the fix is code:

- open-tennis-robots: a non-wrapping clock for firmware timing, and the pyproject homepage fixed (it returned 404);
- wildlife-exclusion: the trap-time field now reads "per trap";
- interior-door: the FAQ now quotes the tool's own $339.14;
- accel-nsgatune: the crossover claim corrected;
- codesign-agri-pulloff: the 10 N bound described as what it is;
- two still-open high defects from earlier rounds: the agents `toJson` serialiser, and Gemini thinking tokens in `platform/llm` and its 16 vendored copies.

Larger gaps are listed in each subject's README or audit file.

## What is not at the bar

Nothing sampled this round. The structural problem is follow-through. Audits find real, checkable defects, mostly in claims and tests. Sessions working on a flagship add new features and leave those defects open. A next step that software can do: have `quality_audit.py history` feed the open high defects into whatever picks a flagship's next slice, so the next session sees them first.
