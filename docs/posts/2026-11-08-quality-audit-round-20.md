---
title: "Quality audit round 20: two of five sampled subjects meet the bar, and a shared-object bug drops the winning option"
seo_title: "Quality audit round 20: two of five subjects meet the bar"
date: 2026-11-08
tags: [quality-audit, evaluation, testing, ai-agents]
description: "Seed 2026-11-08: two ventures, two research projects, a platform directory and the photo-editing flagship audited. Two of five sampled subjects meet the bar."
---

Method and rubric: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). Evidence per subject: [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Scores are before any fix; this round shipped none.

## The number

**2 of 5 randomly sampled subjects meet the bar** (Wilson 95% interval 12% to 77%; five subjects is a small sample). The flagship is chosen, not sampled, and is reported apart. Across all rounds the sampled share is 19 of 99 before this round's six audits.

## Subjects

| subject | stratum | meets bar | worst defect |
|---|---|---|---|
| `research/watchdog-twin` | research | yes | Novelty overstated: run-length maths, Gilbert-Elliott loss and (m,K) constraints are classical, and the i.i.d.-versus-bursty gap follows by construction. A seeded bug in `m_twin_approx` passed all 12 tests. |
| `research/selfrep-reconcile` | research | yes | The comparison is not like-for-like: two chains start at n=1, the kit-stock chain starts empty and must wait for a kit. Truncation is untested. |
| `platform/agents` | platform | no | `toJson` prints any object reached twice as "[circular]", although nothing is circular. The 401(k) tool's `ranked[0]`, the winning option, comes out as that string. No test covers it. |
| `ventures/mobile-welding-job-price-calculator` | venture | no | `opts()` silently replaces a blank field with the example default: clearing "Materials" prices the job at $951, entering 0 gives $766. A seeded bug (rig wear on weld hours instead of on-site hours) passed all 31 tests. |
| `ventures/cabinet-refinishing-bid-calculator` | venture | no | The README says to open `index.html` directly, but over `file://` the script does not run. Dark-to-light adds labour but no paint gallons. |
| `ventures/photo-editing` (flagship, round 2) | flagship | no | `site/index.html` still says the renderers are dry-run and that it does not grade, which is false, and gives a command that is not installed. Two of three seeded mutations survived. |

## What was checked

Test suites ran everywhere (watchdog-twin 12/12, agents 16/16, welding 31/31, cabinet 120/120, reconcile 4/4). Outputs were recomputed with independent code: eight watchdog-twin numbers against a numpy absorbing-chain solve, three welding jobs against a separately written gross-up model (the default job: 589.5/0.77 + 180/0.97 = $951.14, the calculator says $951.15), three cabinet bids by hand, the photo-editing tilt meter and four image metrics against numpy.

## Not at the bar

Four of six. Common causes: tests that do not pin the numbers a user acts on (mutations survived in four subjects), READMEs that tell a user to open an HTML file that needs a server, and a public page contradicting the code. The welding calculator headline margin is 19%, not the 20% typed, which its audit also notes.

## Since the last round

The photo-editing page defects are unchanged since round 1 (lines 34, 40, 47, 51 of `site/index.html`); the score did not move.
