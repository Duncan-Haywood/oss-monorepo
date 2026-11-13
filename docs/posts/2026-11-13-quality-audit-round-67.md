---
title: "Quality audit round 67: 0 of 4 at the bar, and a VAT tool that withheld the first-year discount"
seo_title: "Quality audit 67: UK VAT flat rate, business valuation, lidar fog"
date: 2026-11-13
tags: [quality-audit, evaluation, testing]
description: "0 of 4 sampled subjects meet the bar. A UK VAT tool gave new limited cost traders the wrong verdict; a valuation tool mispriced its fix list. Both fixed."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the four `2026-11-13-*` files with seed `2026-11-13-m` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every hand-seeded bug. All scores were set before any fix.

This round ran in mode `sample`, seed `2026-11-13-m`. None of the four subjects had been audited before. No flagship or platform subject was drawn, because each had been audited within its re-audit window.

## The number

**0 of 4 sampled subjects meet the bar.** Across every sampled audit, 31 of 282 meet it (Wilson 95% interval 8% to 15%). Three of the four are finished (completeness 3). The UK VAT tool is not, because two features its page claims do not work end to end.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/uk-vat-flat-rate-scheme-calculator | 2 | 2 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/online-business-valuation-calculator | 2 | 3 | 1 | 2 | 2 | 2 | 2 | no |
| research/fog-twin | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/accel-planefpga | 3 | 3 | 1 | 3 | 3 | 2 | 2 | no |

Seeded bugs caught by the subjects' own tests: 2 of 5 (VAT), 1 of 4 (valuation), 3 of 4 (fog-twin), 1 of 5 (accel). That is 7 of 18 overall. Verification is again the gate that binds most often: all four subjects scored below 3 on it.

## The subjects

**uk-vat-flat-rate-scheme-calculator.** The reviewer is a UK accountant who files Flat Rate Scheme returns. The tool's arithmetic is right. The auditor recomputed three cases by hand, a builder on the sector rate, the 2% limited cost boundary and the £2,000 capital asset boundary, and all three matched. The defect is in a rule. The tool took the 1% first-year discount off the sector rate but not off the 16.5% limited cost trader rate, and a test locked that in. The 2017 amending regulations (SI 2017/295) set the first-year limited cost rate at 15.5%. Take a newly registered IT contractor on £60,000 a year before VAT, with £300 of goods and £1,000 of other purchases. The tool said standard accounting wins by £140. At 15.5% the scheme costs £11,160 against £11,740 under standard accounting, so the scheme wins by £580. That reverses the advice for exactly the new contractors the tool is aimed at. Two other gaps: the sector list left out catering (12.5%) and the catch-all "any other activity" (12%). A business over the £230,000 leave limit still gets a "the scheme wins" verdict, with only a note beside it. gov.uk returned 403 through the proxy, so the rule was confirmed against the regulation's text as reported by search results, not a live read of Notice 733.

**online-business-valuation-calculator.** The reviewer is a business broker who sells small online businesses on SDE multiples. The core arithmetic recomputes, and the page is honest that its multiples are rules of thumb. The worst defect was in the "what to fix" table, which the README sells as the feature. Each row priced a fix as the penalty times SDE. For a SaaS business valued on both SDE and ARR, that ignores the ARR half. Cutting owner hours was shown as worth $50,000, but it moves the midpoint by $92,500. In a business already at the 0.8x floor, the table promised $70,000 for fixing concentration, which moved the price by $0. Its other gaps: the base multiples (SaaS 3.3x, e-commerce 2.6x and so on) cite no source. The 50/50 SDE and ARR average is not how brokers price, and it values the tool's own sample at 5.3x SDE, outside the page's "2 to 4 times SDE". Three of four seeded bugs survived the tests.

**fog-twin.** The reviewer is an automotive lidar and atmospheric-optics researcher. Every number checked reproduces. The auditor wrote an independent bisection and normal-distribution script, and the experiment reruns byte-identical. The defects are in the words. The whitepaper title said a policy trained on the *mean* fog is unsafe half the time. The results give 0.345 for the mean-fog policy; 0.500 belongs to the *median*-fog policy. The README said "up to 29%" where the table says −31.4%, and "±0.001" where the gap is 0.0012. Halving the fog-bank start left all 15 tests green, because no test pinned headline result 4. The nearest lidar-in-fog work is not cited: Bijelic et al. 2018, Hahner et al. 2021 and Kim et al. 2001. Visibility uses Koschmieder's 2% constant (3.912/V). The WMO's meteorological optical range uses 5%, so the same V gives about 23% less extinction under the WMO convention (31% more under the 2% one).

**accel-planefpga.** The reviewer is an FPGA accelerator architect. The flip-flop counts follow from the RTL exactly. Each added lane in the output-stationary engine costs 52 bits, less one counter bit per doubling, and the committed counts step by 51, 103, 207 and 415 as that predicts. The cycle counts also match. But no Yosys, nextpnr or simulator was available in this container, and no raw tool reports are committed, so the logic-cell and Fmax table could only be checked for internal consistency, not regenerated. The repository's own tests have the same blind spot. Both tool-flow tests skip without a native `yosys`, no CI job installs one, and 4 of 5 seeded bugs survived. The README concludes that DSP mapping fails above 8 lanes. That reflects Yosys putting one multiplier in each SB_MAC16. Packing two 8×8 products, or two 4-bit weights, into one block was not tried. Lattice sensAI on the same UP5K, FINN and hls4ml are not cited.

## What was fixed in the same PR

The scores above are from before these fixes. A later round re-audits.

- **uk-vat-flat-rate-scheme-calculator:** the first-year discount now applies to the limited cost rate (15.5%). The FAQ says so in the page text and the structured data. Catering and "any other activity" are appended to the sector list; the existing ids are unchanged. New tests pin the £580 case and the 15.5% rate, and they fail on the old code. The leave limit and the per-period limited cost test are listed under known gaps in the README.
- **online-business-valuation-calculator:** each fix's value is now the change in the midpoint when that penalty is removed, so it respects both the floor and the SDE and ARR average. Two tests pin the $92,500 case and the floor case, and they fail on the old code. The uncited multiples and the averaging are listed under known gaps in the README.
- **fog-twin:** the title now gives the median policy as the 50% case and the mean policy as 34%. The README numbers now match `results.txt`. A new test pins the fog-bank range at 52.78 m, and it catches the bank-start mutant that survived the audit. The missing prior work and the 2% versus 5% visibility convention are under known gaps.
- **accel-planefpga:** the DSP saving now reads "13 to 42%" (RTp at 8 lanes: 1,042 to 601 cells, which is 42.3%). A known gaps section lists the skipped tests, the uncommitted tool reports, the DSP packing and the prior work.

## Not yet done

- None of the four is at the bar after these fixes either. Each still has a gap a professional would hit: sourced multiples for the valuation tool, prior work and the WMO convention for fog-twin, a tool run in CI for accel-planefpga, and the leave limit for the VAT tool.
- The accel-planefpga synthesis numbers have still not been regenerated by anyone outside the session that produced them.
- No session could load `marisstella.app` or gov.uk through the proxy, so nothing was checked against the served pages.
