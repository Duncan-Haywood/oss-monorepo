---
kind: polish
subjects: [uk-sole-trader-vs-limited-company-calculator]
date: 2026-11-13
tagged: auto
---
# Polish 2026-11-13: answer-first lead on uk-sole-trader-vs-limited-company-calculator, and a salary bug

**Why.** Item 3 of "Still weakest" in `polish-2026-11-13-last-intro-walls.md`: answer leads are still
missing on about 31 high-intent tools, with "economic-nexus-threshold-tracker and
uk-sole-trader-vs-limited-company-calculator first". Items 1 and 2 were weighed first. The shared
`.jump` component would change nothing a visitor sees, and moving the CSS into the site chrome
would leave self-hosted copies, which don't load `pf-chrome.css`, with unstyled jump rows. Two of the
ten copies (shed-designer, ebay) use `.jump` for something else, so a shared rule needs a new class
name. Lowering `MAX_LINKS` is a one-line follow-up.

## Sources (read 2026-11-13, all 200 through the proxy)

GOV.UK "Corporation Tax rates and reliefs" (19%, 25%, £50,000), "Tax on dividends" (10.75 / 35.75 /
39.35%, £500), "Self-employed National Insurance rates" (6% £12,570 to £50,270, 2% above),
"Rates and thresholds for employers 2026 to 2027" (secondary threshold £5,000, 15%, Employment
Allowance £10,500). Every rate in `calc.mjs` `R` matched.

## Bug found and fixed (`calc.mjs`)

`bestSalary` searched salaries up to `profit - costs` without the employer NI on that salary. At
£50,000 profit with £1,200 of costs it chose £48,800 salary + £6,570 employer NI out of £48,800, and
`limitedCompany` floored corporation-tax profit at 0, so the company's take-home was overstated by
£661 (38,655.60 vs 37,994.44). In the old module's sensitivity table (costs £1,200), 8 of 10 rows
overspent: £20k to £50k and £80k to £150k. Only £60k and £200k were affordable.
Fix: `maxAffordableSalary(available, ea)` (bisection on salary + employerNi ≤ available) caps the
search and is a candidate itself; a custom salary over the cap is refused with the cap in the
message; the sensitivity table's custom branch uses the same test. 3 new tests in `calc.test.mjs`
(sweep £10k to £250k × costs × EA; the cap's closed form; custom refusal).

| profit (costs 1,200) | old best salary | old company take-home | new best salary | new take-home |
|---|---|---|---|---|
| 30,000 | 28,800 | 24,255.60 | 12,570 | 23,535.94 |
| 50,000 | 48,800 | 38,655.60 | 12,570 | 37,994.44 |
| 100,000 | 98,800 | 67,861.40 | 12,570 | 64,642.94 |
| 150,000 | 148,800 | 90,650.40 | 86,600 | 86,895.19 |

The sole trader beat the company at all of these before the fix too, so the verdict didn't change.
The size of the gap did.

## The lead

`<p class="answer-source" data-answer-lead>` under the `h1`: "Usually not, if you take all the
profit out", the £50,000 worked example, GOV.UK source, as-of date. The FAQ answer "Is it still worth
setting up a limited company in 2026/27?" (visible and JSON-LD, kept identical) now states the grid
result. `llms.txt` gained a "Key facts" section. Test: `platform/pages/answer-lead.test.mjs` (a pound
version of the pilot check). Every £ figure has to be produced by the calculator, and the
company-never-wins claim is re-run on a £1,000 grid from £10k to £300k. I checked that it fails when
the old £38,656 is put back.

## Measured (local build, Chromium, third-party blocked, reduced motion)

| | 390 first input | 320 first input | 1,280 first input | lead height 390 | sideways scroll |
|---|---|---|---|---|---|
| before | 594 | 662 | 455 | none | no |
| first draft (rates listed) | 1,156 | | 670 | 546 | no |
| after | 784 | 926 | 521 | 198 | no |

The first draft was cut to keep the form near the fold. The rates are already in "How it works".
The intro paragraph after the lead lost one line.

Screenshots: [390 before](img/polish-2026-11-13-uk-ltd-lead-390-before.png) ·
[390 after](img/polish-2026-11-13-uk-ltd-lead-390-after.png) ·
[1,280 before](img/polish-2026-11-13-uk-ltd-lead-1280-before.png) ·
[1,280 after](img/polish-2026-11-13-uk-ltd-lead-1280-after.png).

## Still weakest, and what I would do next

1. **economic-nexus-threshold-tracker lead.** The other half of the item. The common answer is
   "$100,000 in sales in most states; some also count 200 transactions", but the states differ
   (California and Texas $500,000; several have dropped the transaction count). A sourced lead
   needs each state's figure checked against `calc.mjs`'s table. Worth a run on its own.
2. **Leads on the other ~29 high-intent tools.** Pick ones whose answer is a stable statutory or
   published figure. Before writing a lead, check the calculator's worked example against the
   source: this run found a bug that way.
3. **Lead height.** A lead costs about 190 px above the form on a phone. If more leads go in,
   consider one shared rule for `.answer-source` at ≤480 px (a slightly smaller size) and measure
   it across the ~50 lead pages.
4. Carried over: the shared `.jump` component (needs a new class name, and self-hosted copies need
   a fallback); `MAX_LINKS` 8 → 6; topic-page titles four lines on phones; the ticker's third line
   at 320 px.
