---
title: "Sole trader or limited company in 2026/27: the company never came out ahead"
seo_title: "Sole trader vs limited company 2026/27: take-home at £10k to £300k profit"
date: 2026-11-13
tags: [uk-sole-trader-vs-limited-company-calculator, uk-tax, dividends, aeo, polish]
description: "At £50,000 profit a UK sole trader keeps £40,268 and a one-director company £37,994. On a £1,000 grid from £10k to £300k the company never wins. And a bug fix."
---

Our [UK sole trader vs limited company calculator](https://marisstella.app/uk-sole-trader-vs-limited-company-calculator/) now opens with a direct answer to the question people actually type: is a limited company cheaper in 2026/27?

**Usually not, if you take all the profit out.** At £50,000 profit a sole trader keeps **£40,268**. A one-director company paying a £12,570 salary and the rest as dividends keeps **£37,994** after £1,200 a year of accountant and filing costs, or £38,862 with none.

We ran the calculator on every profit from £10,000 to £300,000 in £1,000 steps: no running costs, no Employment Allowance (a company whose only employee is its director can't claim it), all profit paid out. **The company never came out ahead.** The closest it got was £20 behind, at £60,000. That is where the sole trader has just gone into the 40% band and the company's dividends are still inside the basic band.

## Why the company stopped winning

The rates come from GOV.UK pages we read on 13 November 2026:

- **Dividend tax** rose two points in April 2026, to 10.75% (basic), 35.75% (higher) and 39.35% (additional) above a £500 allowance ("Tax on dividends").
- **Corporation tax** is 19% on profits up to £50,000, 25% from £250,000, with marginal relief in between ("Corporation Tax rates and reliefs").
- **Employer NI** is 15% above £5,000 a year, and the Employment Allowance of £10,500 isn't available to a sole-director company ("Rates and thresholds for employers 2026 to 2027").
- **The sole trader** pays Class 4 NI of only 6% from £12,570 to £50,270 and 2% above it ("Self-employed National Insurance rates").

Take a basic-rate pound of profit paid out as a dividend. It loses 19% to corporation tax, then 10.75% of the 81p that's left, about 27.7% in all. As a sole trader the same pound costs 20% income tax plus 6% Class 4, which is 26%. Add the company's own running costs and the gap gets wider.

## What the answer leaves out

Leaving profit in the company defers dividend tax, and that can change the answer for someone who doesn't need all the money this year. Pension contributions through the company, Scottish income tax bands, IR35 and limited liability aren't in the numbers. The calculator says so on the page, and lets you set how much profit to leave in. It's an estimate, not tax advice.

## A bug the lead turned up

To write the lead we had to check every figure in it against the calculator. One figure didn't hold up. At £50,000 profit the best-salary search picked a salary of £48,800. With £1,200 of costs, that salary was every pound the company had. The search then charged £6,570 of employer NI on top, which the company didn't have, and the take-home figure ignored the shortfall. So the company looked about £661 better than it is. The same overspend hit 8 of the 10 rows in the calculator's profit table. At £150,000 it overstated the company by £3,755. The sole trader still came out ahead in every row, so the verdict was the same, but the gap shown was wrong.

The search now caps the salary at what the company can pay *including* its own employer NI on it. A salary typed in by hand that breaks that limit is refused, and the error says the most the company can afford. With the fix, the best salary is £12,570 at every profit from £20,000 to £100,000. Three new tests guard it. The lead has a test of its own: every £ figure in it has to be one the calculator produces, and the "usually not" claim is checked again across the whole £10,000 to £300,000 grid. If next April's rates change the answer, the test fails and the lead gets rewritten.

On a 390 px phone the lead adds about 190 px above the first input (594 to 784 px). An earlier draft that listed every rate was 546 px tall. We cut it, because the method section already lists the rates.
