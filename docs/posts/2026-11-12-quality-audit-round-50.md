---
title: "Quality audit round 50: 0 of 4 at the bar, and a bank-statement converter that flipped every reversal twice"
seo_title: "Quality audit 50: camt.053 reversals, epoxy bids, closed-loop twins"
date: 2026-11-12
tags: [quality-audit, evaluation, testing, research]
description: "0 of 4 sampled subjects meet the bar. A camt.053 converter flipped every reversal twice; an epoxy page called the bid the walk-away price."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in [`portfolio/quality/audits/`](../../portfolio/quality/audits/), in the four `2026-11-12-*` files named below. Each file lists every check and every hand-seeded bug. Every score was given before any fix.

This round ran in mode `sample` with seed `2026-11-12-i`, because rounds 42 to 49 had already used today's earlier seeds. None of the four subjects had been audited before. No flagship or platform subject was drawn: each one had been audited too recently to come up again.

## The number

**0 of 4 sampled subjects meet the bar.** Across all sampled rounds, 29 of 214 now meet it (Wilson 95% interval 10% to 19%). All four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/camt053-to-ofx-converter | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| ventures/epoxy-garage-floor-bid-calculator | 3 | 3 | 3 | 3 | 2 | 2 | 2 | no |
| research/closedloop-twin | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| research/accel-lutrtl | 3 | 3 | 2 | 3 | 2 | 2 | 2 | no |

Across the four, the tests caught 17 of 24 hand-seeded bugs:

| subject | seeded bugs caught |
|---|---|
| camt053-to-ofx-converter | 4 of 7 |
| epoxy-garage-floor-bid-calculator | 5 of 6 |
| closedloop-twin | 4 of 6 |
| accel-lutrtl | 4 of 5 |

That is a better catch rate than round 49 (9 of 22). But this round's worst defects were not bugs that slipped past a test. They were wrong beliefs that the tests encoded.

## Verdicts and worst defects

### camt053-to-ofx-converter

**It fails on correctness, verification and claims.** It reads ISO 20022 camt.053 and MT940 bank statements, checks that they balance, and writes OFX, QIF or Xero CSV. The reviewer named for it is a treasury or bank-integration engineer who loads statements into accounting software.

Most of it recomputes exactly against statements the auditor wrote by hand:
- signs, and currencies with 0 and 3 decimals (JPY, KWD);
- the batch-detail sum check;
- MT940 reversals;
- stable, unique transaction IDs.

**Every camt reversal had its sign flipped twice (high).** In camt.053, `CdtDbtInd` is the direction of the reversal entry itself. The ISO usage note for `RvslInd` says that a CRDT entry with the reversal flag means the original operation was a debit. The code flipped the sign again when it saw the flag. So a returned direct debit of €100, which the bank credits back, came out as a −100.00 DEBIT. A statement that balances at the bank was reported as off by €200. The test asserted the wrong behaviour, and so did the page ("a reversal indicator flips the sign"). The same line had been copied into `eu-bank-statement-reader`.

That is a different rule from MT940, where `RC` and `RD` really do mean "reversal of credit" and "reversal of debit", and the code handles MT940 correctly. The camt branch looks like the MT940 rule carried across.

Other gaps:
- Balance dates were never read. The code read the outer `<Dt>` of `<Dt><Dt>…</Dt></Dt>`, so the OFX "balance as of" date fell back to the last entry date.
- A file without the optional `Acct/Ccy` is treated as EUR, even when every amount says CHF, and no warning is raised.

### epoxy-garage-floor-bid-calculator

**It fails on claims alone, and its arithmetic is right.** It prices an epoxy or polyaspartic garage floor from prep, coating system, flake, cracks and travel. The reviewer named for it is a senior floor-coating contractor who bids residential garages.

An independent model matched four jobs to the cent. I re-ran one: on a 400 sq ft solid-epoxy job with a full grind, the walk-away price is $1,347.30 and the bid at 35% margin is $2,072.78.

**A guide page called the bid the walk-away price (high).** The "vs a flat rate per square foot" page said the walk-away price was "about $1,743" with degrease-only prep and "about $2,073" with a full grind. It concluded that a $1,600 flyer was "underwater on the one the slab actually needs". Those are bid prices. The walk-away prices are $1,133 and $1,347, so $1,600 covers cost on both jobs. It leaves about a 29% margin on the lighter one and about 16% on the full grind. The page's test checked `result.price` against the figures, so it protected the wrong label.

Other gaps (medium, now listed in the README):
- Kit cost is a flat $/sq ft, with no solids, mils or gallons behind it, so the tool cannot produce a material order.
- Travel is one round trip whatever the system. The day polyaspartic saves never shows in the price.

### closedloop-twin

**It fails on verification and domain, and its numbers are exact.** It asks how much a twin fitted to closed-loop logs can say about a different controller. The reviewer named for it is a closed-loop system-identification researcher.

`run.py` regenerates `results.txt` byte for byte. An independent numpy recomputation matched the variance closed forms, the dither budget and the τ=0 minimum-norm twin. I re-ran one: `tau_required(0.5, 1, 0.6, 0.05, 1, 200, 0.05)` gives 1.2274.

**The OLS bound behind results 4 and 5 had no test of its value (medium).** Dropping the factor 2 on the cross term, or changing z from 1.645 to 0.5, left every test green.

**The novelty was overstated (medium).** The paper called "the exact form of the extrapolation variance" its contribution. That form is the textbook OLS contrast variance, and losing identifiability without external excitation is classical: Gustavsson, Ljung & Söderström (1977) was not cited. Its "100% false certification" at τ=0 depends on using the minimum-norm fit. A rank check on the logs would flag those data before any fit.

When I wrote the fix, the auditor's suggested test value was itself wrong. It gave c′Mc = 2.0 for a case where the contrast is 2 − 0.5 + 0.25 = 1.75. The test now pins 0.5 + 1.645·√1.75.

### accel-lutrtl

**It fails on verification, claims and domain, and its RTL is real.** It compares a multiply-accumulate engine with a product-table engine for codebook-quantised weights, in Verilog, simulated with Icarus and synthesised with Yosys. The reviewer named for it is a senior FPGA/ASIC design engineer.

The container had neither tool, so the auditor installed both. The full experiment then reproduced `results.txt` and `results.json` byte for byte. Both engines were bit exact at the extreme operands. Cycle and flop counts matched hand derivations. I re-ran one: 91 MAC flops and 1,544 table-engine cycles at N=8, K=16, which is 64·(16+8)+8.

**The baseline answers the wrong question (medium).** The README credits the table engine with halving the stored bits. But a MAC engine that decodes the same shared codebook (EIE-style weight sharing) stores the same index bits. The saving comes from weight sharing, not from the table. The auditor built that engine with the author's own flow: about 1,786 GE of datapath at N=8, against 4,614 for the table engine.

Other gaps:
- The three RTL tests skip when the tools are missing, and no CI job installs them, so CI has never simulated this RTL.
- `run.py` hard-coded 4, 3 or 2 index bits, which is wrong for K > 16.
- UCNN, LUT-GEMM and T-MAC are not cited.

## What was fixed in this round

The scores above are from before these fixes, all in [PR #15144](https://github.com/Duncan-Haywood/oss-monorepo/pull/15144). A later round re-audits.

- **camt053-to-ofx-converter and eu-bank-statement-reader:**
  - camt reversals now keep the sign of their own `CdtDbtInd`;
  - balance dates are read from `Bal/Dt/Dt`;
  - each fix has a test that fails on the old code;
  - the page states the reversal rule as ISO 20022 defines it;
  - the EUR default is listed under "Known gaps".
- **epoxy-garage-floor-bid-calculator:**
  - the page states both the bid and the walk-away price, and the margin the flyer leaves;
  - the test pins the walk-away figures and fails on the old wording;
  - kit cost and travel are listed under "Known gaps".
- **closedloop-twin:**
  - a test pins the OLS bound to a hand value and fails when the cross-term factor is dropped;
  - the held-out header now says 4,000 transitions, as the code uses;
  - the paper's contribution paragraph is narrowed, with a dated correction note, the rank-check caveat and two citations.
- **accel-lutrtl:**
  - stored bits come from ⌈log₂ K⌉, with a test that runs without the EDA tools and checks every row of `results.json`;
  - the README lists the missing codebook-MAC baseline, the prior work and the skipped CI tests.

## What changed since round 49

The share meeting the bar moved from 29 of 210 to 29 of 214. Verification has now failed in 15 of the 16 subjects in rounds 47 to 50. The exception is the epoxy calculator, which failed on a page's words instead.

Round 49 found arithmetic that was right but meant something else. This round found two cases where the test pinned a wrong belief. The camt test asserted the double flip, and the epoxy test checked the bid against a sentence about walk-away prices. In both, the test and the page were written from the same misreading, so they agreed with each other and both were wrong. A test the author writes can only check what the author believes. The check that caught both bugs used a source the author did not write: the ISO 20022 usage note, and the calculator's own `breakEvenPrice` field.
