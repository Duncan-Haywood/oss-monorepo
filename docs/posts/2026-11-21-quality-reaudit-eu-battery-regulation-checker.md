---
title: "Re-audit: the EU battery checker closed 8 of 10 defects, and why a power-tool pack is a portable battery"
seo_title: "Is a cordless-tool battery a portable battery under EU 2023/1542?"
date: 2026-11-21
tags: [quality-audit, evaluation, testing, compliance]
description: "Two fix PRs were credited with ten defects in the EU Batteries Regulation checker. A re-audit finds eight closed, both highs included. One label still misstated Article 3."
---

The [EU Batteries Regulation checker](https://marisstella.app/eu-battery-regulation-checker/) gives a maker, importer or seller a dated list of the duties that apply to their battery under Regulation (EU) 2023/1542: the QR code, the battery passport, removability, due diligence and the rest. The [2026-11-15 census audit](../../portfolio/quality/audits/2026-11-15-eu-battery-regulation-checker.json) found ten defects, two of them high, and scored it below the bar. PRs #16236 and #16276 followed and were credited with fixing them. Today's [re-audit](../../portfolio/quality/audits/2026-11-21-eu-battery-regulation-checker.json) checked all ten against the code on `main`.

## What the fixes closed: 8 of 10

I ran the shipped `compute()` on 15 cases dated 2026-11-21:

- **Power bank, EU manufacturer.** The timeline now has the QR code from 18 Feb 2027. Article 13(6) requires one on all batteries. Before the fix, portable batteries got none, and a test asserted the omission.
- **EU fulfilment house, no EU operator named.** The checker used to say "every duty ... is marked done". It now says that under Regulation (EU) 2019/1020 Art 4 the fulfilment house is the responsible economic operator, and it lists that duty.
- **Due diligence.** The question is now the Article 47 test: net turnover under EUR 40 million, group-consolidated. Before, it asked whether the firm was an SME. "Not sure" keeps the duty on the list. The date is 18 Aug 2027, as amended by Regulation (EU) 2025/1561.
- **Nuclear-safety equipment.** These batteries used to be treated as outside the Regulation. Now they lose only the Chapter III and VIII rows (label, collection symbol, QR code, producer registration), which is what Art 1(6) says.
- **Distributors.** They now see producer registration (Art 3(47), Art 55(2)).
- **Collection symbol.** It is now its own row, applying from 18 Aug 2025, a year before the general label.
- **Tests.** The three seeded bugs that survived last time are now caught: due diligence moved back to its pre-amendment date, EPR moved a year, and SLI batteries dropped from recycled content. 8 of 9 seeded bugs are caught this round, and 39 of 39 tests pass.

The one surviving mutant removes the guard that stops the "all done" message on an empty list. Today every in-scope role gets at least one row, so removing it changes nothing yet, but no test would notice if a future change emptied the list.

## What was still open

The portable option said "under 5 kg, for consumer use". Article 3(9) says something else: a portable battery is sealed, **weighs 5 kg or less**, and is **not designed specifically for industrial use**. A sealed cordless-drill pack sold to tradespeople is therefore a portable battery. Someone reading "for consumer use" would pick "industrial battery of 2 kWh or less" instead, and the timeline would drop the Article 11 removability duty (from 18 Feb 2027). The light-transport and EV options also left out the 25 kg line. An e-motorbike traction pack over 25 kg is an EV battery, not a light-transport one.

The re-audit also found two smaller problems. An "importer" established outside the EU was accepted without comment, although Article 3 defines an importer as established in the EU. And the page's category labels were a hand-copied duplicate of the calculator's, with no test checking that the two matched.

This PR fixes all three:

- the labels now state the Article 3 limits;
- an out-of-EU importer gets a high finding saying it is really the manufacturer and needs an EU importer or authorised representative;
- a page test now requires each option's text to match `calc.mjs`.

A seeded change to each of these is caught. Two gaps stay in the README's Known gaps. There is no weight or capacity input to check the user's category. Article 12 (stationary storage safety), Article 14 (state of health), Article 10 (performance) and Article 11(7) (spare parts) are not modelled.

## The score

| | 2026-11-15 | 2026-11-21 |
|---|---|---|
| correctness | 2 | 3 |
| completeness | 3 | 3 |
| verification | 2 | 3 |
| craft | 3 | 3 |
| claims | 2 | 3 |
| fitness | 2 | 2 |
| domain | 2 | 3 |
| meets the bar | no | **yes** |

The scores were set before this PR's fixes, so the label error is counted against claims. Fitness stays at 2. A compliance manager still has to classify the battery without help, and the Article 12 and 14 duties, which already apply, are missing.

One limit on this round: every EU legal-text host (publications.europa.eu, eur-lex.europa.eu) refused connections through this session's proxy. The article wording I checked against is the Official Journal text quoted in the earlier audit file, which that auditor fetched from publications.europa.eu. The checker is a first read, not legal advice.
