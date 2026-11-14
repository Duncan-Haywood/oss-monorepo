---
title: "Quality fixes: a fee cut bigger than the fee, a promised summary, an untested month"
seo_title: "Quality fixes: a fee cut bigger than the fee"
date: 2026-11-14
tags: [quality-audit, ventures, small-business]
description: "A fix-mode session closed three medium defects in three ventures. One told vendors to ask for a $480 cut off a $150 booth fee."
---

This session ran the quality programme in `fix` mode. `python3 platform/ci/quality_audit.py mode` drew it for 2026-11-14, with no high-severity defects open, so it worked through medium ones from the 2026-11-07 audits. It closed three defects in three ventures. Each fix comes with a test that fails on the old code. The audits keep their scores from before the fixes, and a later round will re-audit all three.

## market-event-picker: the fee cut it suggested was more than the fee

The tool picks which markets and festivals a vendor should work. When it skips an event that is close to winning, it says how big a fee cut would make that event the better pick. On the shipped example it said: "A fee cut of $480.00 would make Harvest Fair the better pick." Harvest Fair charges a flat $150 and no percentage, so no cut could get it there. And a cut of exactly $480 would only tie the two plans. A vendor could have walked into a negotiation with that number.

Now the finding only appears when the event's whole fee (the flat fee plus the percentage at expected sales) is bigger than the shortfall. It also says "more than", for example "more than $130.00 (of its $500.00 fee)". The new tests check three things:

- Harvest Fair is no longer offered.
- Cutting the fee by the ask plus $1 flips the pick, and cutting it by exactly the ask only ties.
- The 1.5× close-call threshold, the long-week warning and the plan-flips warning all fire on cases built to trigger them.

The audit had changed that threshold from `* 1.5` to `* 3` and every test still passed. That mutation now fails a test.

## home-inspection-report-builder: the summary the page promised

The page said the report would be "sorted with safety and major items first", and the structured data listed a "summary of safety and major items". Neither report had one. Both grouped findings by system (roof, electrical and so on) and sorted by severity only inside each group, so a safety item under Plumbing could land below minor roof notes. The tool already built a list sorted across all systems but never used it.

Both the text and the HTML report now open with a "Safety and major items" list that covers every system, safety items first, with each item's system named. The full details still follow under each system. A test checks the order, the count, and that a report with no such items has no summary.

## lash-studio-profit-calculator: the month nobody checked

The headline number is about how much profit a month the schedule earns, which is weekly profit × 52 / 12. No test covered it. The audit replaced it with weekly × 4 (about 8% low) and all 23 tests still passed. A new hand-worked case with two services and no overhead pins the result:

- weekly profit $609, 7 hours, $700 revenue, 20% of open hours used;
- $2,639 a month, also checked in the shared result text;
- a client's lifetime numbers over 0.75 expected fills.

The ×4 mutation now fails a test.

## Still open in these three

- **lash-studio-profit-calculator:** the client-lifetime figure still uses only the first full set and the first fill.
- **home-inspection-report-builder:** the report has no limitations or "not inspected" section, and a saved file with a bad cost or an unknown severity still loads without a warning.
- **market-event-picker:** no other defects in this audit are still open.

The queue command lists everything that is open: `python3 platform/ci/quality_audit.py queue --severity medium`.
