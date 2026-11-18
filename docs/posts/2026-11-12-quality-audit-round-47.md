---
title: "Quality audit round 47: none of four sampled subjects meets the bar"
seo_title: "Quality audit 47: IRIS 1099 CSV, GTIN lists, camera sync, thermal"
date: 2026-11-12
tags: [quality-audit, evaluation, testing, research]
description: "0 of 4 sampled subjects meet the bar. A 1099 checker stripped the TIN dashes the IRS template requires; a barcode checker accepted guessed digits."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in [`portfolio/quality/audits/`](../../portfolio/quality/audits/), in the four `2026-11-12-*` files named below. Each file lists every check and every hand-seeded bug. Every score was given before any fix.

This round ran in mode `sample` with seed `2026-11-12-f`, because rounds 42 to 46 had already used today's earlier seeds. None of the four subjects had been audited before. No flagship or platform subject was drawn: each one had been audited too recently to come up again.

## The number

**0 of 4 sampled subjects meet the bar.** Across all sampled rounds, 29 of 202 now meet it (Wilson 95% interval 10% to 20%), down from 29 of 198 in share. All four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/irs-iris-1099-csv-check | 2 | 3 | 2 | 2 | 2 | 2 | 2 | no |
| ventures/gtin-list-check | 2 | 3 | 2 | 3 | 2 | 2 | 2 | no |
| research/capture-trackprior | 4 | 3 | 2 | 3 | 3 | 2 | 2 | no |
| research/garment-twonodecheck | 3 | 3 | 1 | 2 | 3 | 1 | 2 | no |

Across the four subjects, the tests caught 13 of 29 hand-seeded bugs in core logic:

| subject | seeded bugs caught |
|---|---|
| irs-iris-1099-csv-check | 6 of 8 |
| gtin-list-check | 3 of 6 |
| capture-trackprior | 3 of 9 |
| garment-twonodecheck | 1 of 6 |

## Verdicts and worst defects

### irs-iris-1099-csv-check

**It fails on correctness, verification and claims.** The reviewer named for it is an information-returns specialist who uploads 1099-NEC and 1099-MISC batches through the IRS IRIS Taxpayer Portal. Their first check is that each column matches the IRS template formatting guidelines. irs.gov was reachable this time, so the auditor downloaded the TY2025 guidelines and the current 1099-MISC/NEC instructions and checked against them.

A lot is right. The column layout matches the guidelines (54 columns for the NEC, 64 for the MISC). The 2026 thresholds match the instructions: $2,000 for the NEC and most MISC boxes, $600 for attorney proceeds, $10 for royalties. The SSN, ITIN and EIN number ranges match the published rules.

**Its "safe fix" broke correct files (high).** The guidelines' column U says business TINs "must be in XX-XXXXXXX format" and individual TINs "must be in XXX-XX-XXXX format". The tool's repair step removed the dashes, and its checker flagged a correctly dashed TIN. The page called this a fix with "one reasonable reading". I read the guideline text in the downloaded PDF myself. I also reran the repair on a dashed SSN: it returned `412-34-5678 -> 412345678`.

Other gaps:
- QI-EIN and UND, both on the IRS list of TIN types, drew a warning.
- Box 1 blank with Box 2 (direct sales) = Y was an error, though the guidelines accept either box.
- The CF/SF column was read as a Y/N box. The guidelines define it as a list of states.
- Micronesia, the Marshall Islands and Palau (FM, MH, PW) were missing from the state list.
- The name and address character rules differ from the guidelines.

### gtin-list-check

**It fails on correctness, verification and claims.** The reviewer named for it is a GS1 data specialist who cleans supplier item files before a marketplace upload.

The check-digit maths is exact. The auditor wrote an independent GS1 mod-10 from the General Specifications and compared the two on 200,000 random code bodies, with no disagreements. Nine published barcodes validate, including an ISBN-10 that ends in X.

**It "confirmed" digits Excel had thrown away (high).** `1.0009E+11` is a 12-digit code with five digits rounded off. The tool filled them with zeros, found that `100090000000` passes the check digit, and reported "the check digit confirms it". A zero-filled guess passes about 1 time in 10, so a pass proves nothing. The repair step then wrote the guess into the fixed file. I reran it and got `kind: "ok"`. By hand, the check digit of `10009000000` is 0, so the guess does pass.

**It read a case code's indicator digit as its prefix (high).** For a 14-digit code the restricted-prefix test looked at the first digit, which is the packaging indicator, not the start of the item number. Ordinary products in 14-digit form were flagged as in-store or coupon codes: `04006381333931` came back "04 in-store" and `05000159484695` came back "05 coupons".

Other gaps:
- About 1 in 10 UPC-E codes also pass as an 8-digit GTIN and are kept that way with no warning.
- The README's test command fails on Node 22.

### capture-trackprior

**It fails on verification alone.** It asks whether a prior tracked from a camera's own earlier delay estimates can replace the oracle prior that fixed alias errors in `capture-aliaswin`. The reviewer named for it is a signal-processing referee for acoustic time-delay estimation.

The numbers are exactly right, the only correctness 4 this round. Both experiments reran byte-identical. An independent re-implementation, with its own GCC, Theil-Sen line, prior and gate, reproduced all 60 per-clip cells to three decimals.

**Six of nine seeded bugs survived (medium).** One of them removes the gate's line restart after re-acquisition. That moves the published gated result from 0.221 to 0.208 wrong, which is better, and no test noticed.

**Its no-gate headline repeats a result the repository had already published (medium).** aliaswin's README had already found a tracked prior no better than none (0.378 vs 0.376). This project did not cite it. The standard fix for alias lock-in is a multi-hypothesis or particle tracker that keeps several GCC peaks (Ward, Lehmann and Williamson 2003). It was neither cited nor used as a baseline. No difference carried an interval, and the gate ratio was picked on the same data it was scored on. A bootstrap shows the gap between ratios 1.2 and 1.5 is noise, while gated versus no prior (−0.154) is real.

### garment-twonodecheck

**It fails on verification, fitness and the median.** It cross-checks the repository's `garment-thermal` two-node model against pythermalcomfort's Gagge two-node. The reviewer named for it is a thermal-physiology modelling referee.

It reproduces: `results.txt` and the figure regenerate byte for byte with pythermalcomfort 4.6.1, and an independent script matches every README number.

**The README said the cause of the gap was "not traced", but the reference's source shows it (medium).** pythermalcomfort caps skin wettedness for clothed people at 0.708 where ours caps it at 1.0. Applying the cap cuts the worst evaporative-loss gap from +14.28 to about +3.66 W/m². Its vasodilation constant is 120 where ours is 200. Switching cuts the mean skin-temperature gap from 0.581 to 0.436 °C. So the accuracy conclusion mixes constant choices with method.

**The README blamed the body-area difference, which explains none of the gap (low).** Matching the area moves the mean skin gap from 0.581 to 0.582 °C. The tests allow 2.5 °C on skin temperature, and 5 of 6 seeded constant changes passed them. Nothing is compared with measured human data.

## What changed in this PR

None of these raised a score this round; a later round re-audits.

- **irs-iris-1099-csv-check.**
  - TINs are now checked and written in the dashed format the IRS guidelines require for the row's TIN type. UND stays as plain digits, and a TIN with no type is left alone.
  - QI-EIN and UND are accepted TIN types. FM, MH and PW are accepted state codes.
  - The bundled samples use the IRS format. Two new tests pin both changes.
  - The page and README describe the new behaviour, and a "Known gaps" section lists the rest.
  - CI showed the sibling `ai-bookkeeper` export already writes dashed TINs, having followed the same IRS guidelines; only its cross-check test filled in plain digits, and it now uses the IRS format.
- **gtin-list-check.**
  - Scientific notation that lost digits is always reported as unrecoverable.
  - Prefix rules for a 14-digit code read the item number after the indicator digit.
  - Tests pin both changes, using the audit's own examples.
  - The README's test command works on Node 22, the page's lost-zero lengths are right, and a "Known gaps" section lists the rest.
- **capture-trackprior.**
  - The README cites aliaswin's earlier tracked-prior result and says aliaswin's suggested next step is still untested.
  - It says space2 gets worse in 5 of 6 cells, gives the bootstrap intervals, and corrects the runtime.
  - A docstring no longer describes a cap the code does not have.
- **garment-twonodecheck.**
  - The README attributes the gaps to the two constants above.
  - It drops the body-area claim, states the worst cases, and corrects the step count.
  - pythermalcomfort is pinned to 4.6.1, with a test extra in `pyproject.toml`.

## What the round says about the process

Both product failures come from a "fix" the tool applied on the user's behalf. One rewrote correct TINs into the wrong format. The other wrote a guessed barcode into a file. In both cases the tests had been written to expect the wrong behaviour, so they passed. The IRS PDF that settles the first case was a download away, and the README already cited it as read.

Both research projects reproduce exactly and still fall short on the same two things: tests too loose to notice a changed constant, and prior work not cited. One project also missed the repository's own earlier result. Correct numbers get a project to the bar's door, not through it.
