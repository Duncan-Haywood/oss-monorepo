---
title: "Quality audit round 66: 0 of 4 at the bar, and a JWT checker that ran the token's script"
seo_title: "Quality audit 66: JWT XSS, laundromat payback, ADU tap fees"
date: 2026-11-13
tags: [quality-audit, evaluation, testing, security]
description: "0 of 4 sampled subjects meet the bar. A JWT checker ran script from a pasted token's kid; two sister tools had the same bug. All three are fixed."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in the four `2026-11-13-*` files with seed `2026-11-13-l` in [`portfolio/quality/audits/`](../../portfolio/quality/audits/). Each file lists every check and every hand-seeded bug. All scores were set before any fix.

This round ran in mode `sample`, seed `2026-11-13-l`. None of the four subjects had been audited before. No flagship or platform subject was drawn, because each had been audited within its re-audit window.

## The number

**0 of 4 sampled subjects meet the bar.** Across every sampled audit, 31 of 278 meet it (Wilson 95% interval 8% to 15%). All four are finished (completeness 3): each does what its README says it does. None meets the bar.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/jwt-security-check | 2 | 3 | 3 | 2 | 2 | 2 | 2 | no |
| ventures/laundromat-machine-payback-calculator | 2 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| research/chip-cse-style | 3 | 3 | 2 | 2 | 2 | 1 | 2 | no |
| research/house-adufees | 2 | 3 | 2 | 2 | 1 | 1 | 2 | no |

Seeded bugs caught by the subjects' own tests: 5 of 6 (jwt), 2 of 5 (laundromat), 2 of 4 (chip), 1 of 5 (adufees). That is 10 of 20 overall.

## The subjects

**jwt-security-check** has the best tests in the round, but it had the worst defect. The reviewer is an application security engineer. Their first check is what happens to an attacker-shaped token, and the answer was bad. Findings quote the token's own `kid` header, and the page wrote them into the page with `innerHTML`. A token whose `kid` was `<img src=x onerror=...>` therefore ran script on the shared site origin, in a tool whose whole purpose is to be pasted untrusted tokens. The auditor confirmed this in headless Chromium. The second defect: the standard unsigned token from RFC 7519 §6.1 (`alg: none`, empty signature) stopped at "invalid structure" before the `alg` check ran. So the page's claim that `alg: none` is flagged "whenever it appears" was false for the most common form of that token. A token whose `exp` equals the current time was also not reported as expired, although §4.1.4 says the current time must be before `exp`. The auditor's independent HMAC and base64url decoder agreed with the tool on the jwt.io and RFC §3.1 tokens.

**laundromat-machine-payback-calculator** is right to the cent on its own sample. An independent exact-fraction script reproduced payback periods of 11.21, 12.30, 17.35 and 195.12 months. Typed input is where it breaks. An installed cost of `$4,800`, typed without quotes in the comma-separated box, split at the comma. The tool then priced the machine at $4, reported a payback of 0.009 months and said "Every line pays back inside 60 months", with no warning. Three of five seeded bugs survived the tests, including hard-coding 30 open days in place of the days-open input. The model has no repairs line and no financing line, and the page says so. Its FAQ also presents full-line payback as the basis for replacing machines. A replacement decision is about the gain over the old machines, which the tool cannot take as input.

**chip-cse-style** reproduces byte for byte. The auditor installed the recorded Yosys 0.33 and rebuilt every netlist with their own Verilog and scripts. Every cell and depth count matched. An Icarus simulation of all six styles ran 300,000 vectors with no mismatches. The defects are in what the numbers are said to mean. The title said the regrouped adder is "17-22% smaller". It actually has 14-17% *more* cells and 27-33% less depth. Only the cells × depth product is lower. It is also 5% worse under the `dc2` script, which `flow.py` defines and the README did not report. And the result is the textbook area-versus-delay trade between a carry-increment adder and a dual-adder carry-select adder, which the project did not name or cite.

**house-adufees** reads one Denver Water fee table correctly. Search summaries of Denver Water's pages gave the same schedule. The proxy blocked the pages themselves, so the file records that check as partial. The headline compares a 480 sq ft ADU with a house "charged on 2,000 sq ft", and concludes the ADU pays more per square foot. Denver Water's own example, also seen only as a search summary, is $10,450 for a home on a 7,000 sq ft *lot*. That is exactly $3,380 + $1.01 × 7,000, which points to the rate being charged on lot area. The project's own `run.py` already solves for that 7,000 and calls it "lot-sized". On a typical 6,250 sq ft lot, a 2,000 sq ft house pays $9,692.50, which is $4.85 per floor square foot. That reverses the headline, and the ADU saves 78%, not 60%. One of five seeded bugs was caught. No prior work on ADU fees is cited, for example Terner Center or California's AB 68 and SB 13.

## What was fixed in the same PR

The scores above are from before these fixes. A later round re-audits.

- **jwt-security-check:** findings are now inserted as text, never as HTML. The RFC §6.1 token reports `alg-none`, and `exp == now` counts as expired. There are tests for all three, and the auditor's token no longer creates an element in headless Chromium.
- **The same XSS in two sister tools.** A scan for the pattern found **mcp-config-risk-check** and **skill-manifest-check** writing pasted server and skill names through `innerHTML`. In headless Chromium, the old mcp-config page ran script from a server named `<img onerror=...>` and the fixed page does not. Both pages are fixed and carry a page test against the pattern.
- **laundromat:** a line with more than six cells is now skipped, with a warning naming the likely unquoted comma. A test covers it.
- **chip-cse-style:** the "smaller" claim now gives the product, with both cell and depth changes, in the README title and in the research index. The missing prior work and the unreported `dc2` result are listed under Limitations. A Yosys output the parser cannot read now raises an error instead of scoring 0.
- **house-adufees:** exact tests for the headline ratios and the 22,000 sq ft tier cap, which kill two of the surviving mutants. A dead constant is gone, and a hard-coded rate in `run.py` now reads from the schedule. The lot-area evidence is in Next steps. The headline itself still needs a direct read of Denver Water's page before it is restated.

## Not yet done

- A heuristic scan for the same `innerHTML` pattern flagged 12 other venture pages. Several of the flagged values are already escaped or are numbers. In the one I read, `retainage-cashflow-calculator`, the value is text the user typed themselves, which is self-XSS at worst. None of the 12 has been reviewed one by one, and none is fixed. The scan output is in this run's record.
- No session could load `marisstella.app` through the proxy, so no claim about the served pages was checked against the live site.
