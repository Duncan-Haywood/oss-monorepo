---
title: "Quality audit round 46: one of four sampled subjects meets the bar"
seo_title: "Quality audit 46: COI renewal gaps, pool replaster bids, gripper transfer, git backfill"
date: 2026-11-12
tags: [quality-audit, evaluation, testing, research]
description: "1 of 4 sampled subjects meets the bar. A certificate-of-insurance checker called a one-day coverage lapse continuous, and a research headline leaned on 282 designs that pick almost no fruit."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence is in [`portfolio/quality/audits/`](../../portfolio/quality/audits/), in the four `2026-11-12-*` files named below. Each file lists every check and every hand-seeded bug. Every score was given before any fix.

This round ran in mode `sample` with seed `2026-11-12-e`, because rounds 42 to 45 had already used today's first four seeds. None of the four subjects had been audited before. No flagship or platform subject was drawn, because each one had been audited too recently to come up again.

## The number

**1 of 4 sampled subjects meets the bar.** Across all sampled rounds, 29 of 198 now meet it (Wilson 95% interval 10% to 20%), up from 28 of 194. All four are finished (completeness 3).

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/pool-plaster-bid-calculator | 3 | 3 | 3 | 3 | 3 | 2 | 2 | **yes** |
| ventures/coi-expiry-gap-checker | 2 | 3 | 2 | 2 | 2 | 2 | 2 | no |
| research/codesign-transfer | 3 | 3 | 1 | 3 | 2 | 2 | 2 | no |
| research/swe-backfill | 2 | 3 | 1 | 2 | 2 | 2 | 2 | no |

Across the four subjects, the tests caught 14 of 28 hand-seeded bugs in core logic:

| subject | seeded bugs caught |
|---|---|
| pool-plaster-bid-calculator | 8 of 8 |
| coi-expiry-gap-checker | 5 of 9 |
| codesign-transfer | 1 of 6 |
| swe-backfill | 0 of 5 |

## Verdicts and worst defects

### pool-plaster-bid-calculator: meets the bar

The reviewer named for it is a pool replastering contractor who bids drain-and-replaster jobs. The auditor rebuilt the geometry from first principles, using a US gallon of 231 cubic inches. Every one of the four job presets matched to the cent. On the 16 × 32 ft pool, 3.5 to 8 ft deep, that is 1,064 sf of plaster, 22,022.65 gallons, 53.38 crew-hours and a $7,825.99 price at a 26% margin. A 26% markup would have given $7,296.96, which is only a 20.6% margin, so the tool correctly prices on margin. All eight seeded bugs failed a test, the only perfect result this round.

It still falls short in two places, domain and fitness:
- The freeform takeoff is water surface × a multiplier, so the price does not change with depth: a 12 ft deep end prices the same plaster as an 8.5 ft one (medium).
- The full chip-out default of 0.14 h/sf is uncited. Trade guides suggest it runs 2 to 3 times too high (medium).
- There is no bag count or crew-day line, though contractors order finish by the 80 lb bag (medium).

### coi-expiry-gap-checker

**It fails on correctness, verification and claims.** The reviewer named for it is a commercial insurance broker who tracks ACORD 25 certificates. Their first check would be the policy period. A standard policy runs from 12:01 a.m. on the effective date to 12:01 a.m. on the expiration date.

**The renewal-gap formula was off by one day (high).** A policy that expired on 1 June, followed by a renewal effective 2 June, leaves 1 June uncovered. The tool reported no gap and marked the vendor clear. I reran this and got status `ok` with no findings. Every other gap was a day short: the sample's 1 to 20 June case showed 18 days when the true gap is 19. The test suite asserted the wrong convention.

**Any line containing the word "liability" counted as general liability (high).** So a vendor holding only a $1M pollution, liquor or cyber policy passed the general-liability requirement.

Other gaps:
- A renewal certificate already on the list does not clear the expiring policy from the chase list.
- The ACORD 25's own column headings are not recognised.
- An unreadable requirement such as "1 million" silently becomes 0, which switches that check off.

The arithmetic that remains (days left, shortfalls, umbrella offsets) matched an independent model on both sample lists.

### codesign-transfer

**It fails on verification and claims.** The project asks whether gripper designs that rank well in a nominal simulated orchard still rank well when friction, fruit size, placement error and print tolerance shift. The reviewer named for it is a robust-design and sim-to-real researcher.

Every number reproduces. A fresh run is byte-identical to the committed results, and an independent rebuild matched the headlines to three decimals. Its contact pressure uses the line-contact formula from Johnson's *Contact Mechanics*.

**The headline correlation is inflated (medium).** The README led with a Spearman of 0.993 over 600 designs. But 282 of those designs pick almost no fruit (nominal J below 0.05), so most of that number comes from separating designs that work from designs that don't. Within the nominal top 10%, the correlation is 0.838. I reran the auditor's script and got 0.9934 overall, 0.838 in the top 60 and 282 near-zero designs.

Other gaps:
- Five of six seeded bugs survived, including flipping the sign of the bruised-fruit value.
- The reality-gap and robust-design literature was not cited.
- The README undersold one result. It warned that another seed could erase the robust optimum's gain, but across 6 seed pairs the gain was positive every time, from +0.010 to +0.023.

### swe-backfill

**It fails on correctness, verification and claims.** This project reads the repository's own git history to measure the research loop. The reviewer named for it is a mining-software-repositories researcher. Their first check would be how fix commits are detected.

Every headline count recomputes from the extract with independent code. Three sampled commits match the GitHub API.

**Its one correctness figure contained a false positive (medium).** The figure was a "lower bound" of 6 of 234 projects corrected in-tree, found by keyword match. Nobody had read the six hits. One of them, `556272fb434`, is "Add eiv-twin: ... and repair costs", which finishes a project and only matched on "repair". I read all six. The true count is 5 of 234 (2.1%).

Other gaps:
- The README said its data "cannot tell apart" a duplicate claim from a deliberate series. Yet the extract holds five commits whose messages say a parallel run had already taken the slug.
- The tests caught none of five seeded bugs.

## What changed in this PR

None of these raised a score this round; a later round re-audits.

- **coi-expiry-gap-checker.**
  - Renewal gaps now follow the 12:01 a.m. period. A renewal effective on the expiration date is continuous, and one effective the next day is a 1-day gap. The page explains the convention.
  - Pollution, liquor, cyber, garage and other named liability lines no longer satisfy general liability.
  - Tests pin both changes.
  - The README's test command works on Node 22, and a "Known gaps" section lists the rest.
- **pool-plaster-bid-calculator.**
  - A shallow end deeper than the deep end is now an error, with a test for each shape.
  - The README's limitations list the depth-blind freeform takeoff, the flat floor, the uncited chip-out rate and the missing bag count.
- **codesign-transfer.**
  - The headline now leads with the top-10% overlap and the 0.838 within-top-10% correlation, and says why 0.993 is inflated.
  - Two new tests pin the nominal optimum's score (0.6526) and its held-out mean (0.567). The sign-flip and bruise-threshold bugs that survived now fail.
  - The README cites Jakobi 1995, Koos et al. 2013, Beyer and Sendhoff 2007 and Taguchi.
  - The results header names the fruit population it actually uses (seed 1000), and the figure's axes now show the 181 designs with negative J.
- **swe-backfill.**
  - Hand-checked non-fixes go in `NOT_A_FIX`, and the headline is now 5 of 234.
  - A new test pins 5 of 234 and 7 of 396 on the real extract.
  - The README counts the five slug collisions and cites the SZZ and Herzig et al. work on keyword fix detection.

## What the round says about the process

The subject that met the bar is the one whose tests caught every seeded bug. Its 128 tests pin dollar figures, not just shapes. The three that missed share round 44's and 45's pattern: tests that check the code runs, not the numbers it reports. Both research projects let all but one seeded bug through.

Two of the four had a headline that a reviewer would have caught by reading the raw rows: the six keyword hits, and the 282 designs that pick no fruit. Neither defect needed new data, only a look at what the headline counted.

The certificate checker's off-by-one is a different kind of defect: a domain convention got encoded in a test, so the test locked the wrong behaviour in. A test checks only what its author believed, which is why each audit recomputes outputs from a source the author did not write.
