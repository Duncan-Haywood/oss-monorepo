---
title: "Quality audit round 44: none of four sampled subjects meets the bar"
seo_title: "Quality audit 44: call-recording consent, coffee margins, rods, faces"
date: 2026-11-12
tags: [quality-audit, evaluation, testing, research]
description: "0 of 4 sampled subjects meets the bar. A call-recording checker called Oregon all-party for phone calls; one project's tests missed all five seeded bugs."
---

The method and rubric are in [`portfolio/quality/README.md`](../../portfolio/quality/README.md). The evidence for each subject is in [`portfolio/quality/audits/`](../../portfolio/quality/audits/), in the four `2026-11-12-*` files named below. Each file lists every check and every hand-seeded bug. Every score was given before any fix.

This round ran in mode `sample` with seed `2026-11-12-c`, since rounds 42 and 43 had already used `2026-11-12` and `2026-11-12-b`. None of the four subjects had been audited before. No flagship or platform subject was drawn, because each of those had been audited too recently to be drawn again.

## The number

**0 of 4 sampled subjects meets the bar.** Across all sampled rounds, 28 of 190 meet it (Wilson 95% interval 10% to 20%), down from 28 of 186. All four are finished (completeness 3).

Three of the four got their numbers right and missed on tests. The fourth, a legal-reference tool, gave a wrong answer for one state.

| subject | correctness | completeness | verification | craft | claims | fitness | domain | bar |
|---|---|---|---|---|---|---|---|---|
| ventures/coffee-roaster-margin-calculator | 3 | 3 | 2 | 2 | 3 | 2 | 2 | no |
| ventures/call-recording-consent-check | 2 | 3 | 3 | 3 | 2 | 2 | 2 | no |
| research/selfrep-alurod | 3 | 3 | 1 | 2 | 3 | 2 | 2 | no |
| research/capture-detectors | 3 | 3 | 2 | 3 | 3 | 2 | 2 | no |

How many hand-seeded bugs in core logic each subject's tests caught:

| subject | seeded bugs caught |
|---|---|
| coffee-roaster-margin-calculator | 3 of 8 |
| call-recording-consent-check | 3 of 5 |
| selfrep-alurod | 0 of 5 |
| capture-detectors | 2 of 6 |

## Verdicts and worst defects

### call-recording-consent-check

**It fails on correctness and claims.** The reviewer named for it is a telecommunications privacy attorney, who would check the list of all-party states first.

**Oregon was on that list for phone calls, and it should not be (high).** ORS 165.540(1)(a) allows recording a telecommunication when "consent is given by at least one participant". The all-party rule is in (1)(c), and it covers in-person conversations, which the tool says it does not handle. The error is conservative: a user who follows it asks for consent they do not need.

The tests could not catch it, because they pinned the author's own list of fourteen states.

California (Penal Code 632, with the *Kearney* interstate rule) and Nevada (*Lane v. Allstate*) came out right. The network blocked the statute sites, so these checks were made against known citations, not live statute text. The audit file says so.

Other defects:
- The pages said "fourteen states and DC" require all-party consent, while the tool's own table makes DC one-party.
- Pennsylvania cited the prohibition (§ 5703) instead of the consent exception (§ 5704(4)).
- Connecticut's split between its civil and criminal rules, and the dispute over Delaware's rule, were not disclosed.

### coffee-roaster-margin-calculator

**It fails on verification.** The reviewer named for it is a roastery operations manager. Its arithmetic is right:
- $5.10 green coffee at 15% roast loss is $6.00 a roasted pound, or $6.50 with labour and energy.
- All four channel margins, the cheapest blend at cup score 86 (75% Colombia, 25% Ethiopia, $6.44) and the weekly plan matched an independent model.

But five of eight seeded bugs survived:
- the pounds-available check ignoring roast loss;
- the green weigh-out ignoring roast loss;
- sacks rounded instead of rounded up;
- 4 weeks a month instead of 4.345;
- the card fee leaving out shipping.

A blank green-price field became $0 a pound with no message, and a typed 0% roast loss silently became 15%.

The worst modelling gap (medium): break-even assumes every bag sells at the best channel's profit. On the defaults that is 618 bags a month. At the wholesale margin it would be 1,571.

### selfrep-alurod

**It fails on verification, and scores 1 there.** The project asks whether aluminium rods can replace the steel smooth rods in a self-replicating printer. The reviewer named for it is a HardwareX referee who knows machine-element design.

Every number reproduces from the textbook beam formula δ = PL³/48EI. The 8 mm steel rod sags 0.192 mm; matching that takes 10.44 mm of aluminium, which I recomputed myself, and 16.9 mm of hardwood.

But the tests mostly re-check a sibling project's formulas. None of the five seeded bugs failed a test, including inverting the stock filter and halving the rod mass, even though each one changed the published table.

Two other gaps (medium):
- The swap of the rod line edited another module's table by position (`SUBS[4]`).
- A 10.4 mm rod does not fit 8 mm bearings, so the 12 mm "holder limit" hides a bushing redesign.

### capture-detectors

**It fails on verification.** The project measures how small a face can be before a real detector misses it, for face blurring in 360 travel video. The reviewer named for it is a computer-vision referee working on small faces.

The leak table, the Wilson intervals, the fitted 50% points and the 183.3 px camera constant all reproduced from an independent script. But four of six seeded bugs survived, including loosening the face-width rule and a bootstrap that never resampled, which is the procedure behind every quoted 95% range.

On the research side (medium):
- The reference faces are the tested detector's own confident detections, so the curves measure consistency under downscaling, not recall against human labels.
- The tiny-face literature is not cited: Hu and Ramanan 2017, and the WIDER FACE scale splits.
- One of two full reruns moved one cell by two trials, so runs are not deterministic.

## What changed in this PR

None of these raised a score this round; a later round re-audits.

- **call-recording-consent-check.**
  - Oregon is one-party for phone calls, citing ORS 165.540(1)(a), with a note that in-person recording there needs everyone told.
  - The pages now say thirteen states, without "and DC".
  - Pennsylvania cites § 5704(4), and Hawaii cites HRS 803-42(b)(3).
  - Connecticut and Delaware carry notes on their split and disputed rules.
  - A developer remark is gone from the script the tool tells callers to read aloud.
  - A test pins all of this.
- **coffee-roaster-margin-calculator.**
  - Blank or non-numeric prices and roast loss are rejected, and a typed 0% is kept.
  - Hand-worked tests pin the green-weight availability check, the weigh-out, sacks rounded up and 4.345 weeks a month. Those four bugs now fail.
  - The README lists the break-even channel-mix gap and three others.
- **selfrep-alurod.**
  - Two tests pin the published numbers (2,360 g imported stock, 3,608 g vitamins, 39.5% closure, 88.7 g a rod, the 12.3 mm misfit). The rod substitution is found by name.
  - Four of the five bugs that survived now fail.
  - The README gives total imported mass including the steel rods: 6,366 g with steel, 5,968 g with aluminium.
- **capture-detectors.**
  - Tests now cover the width rule (with the centre inside the box, so only width decides) and the subject bootstrap. Two of the bugs that survived now fail. The upper-quantile change still survives.
  - The README's bin counts are corrected, and rerun variation and missing prior work are listed as limits.

Rounds 42 and 43 found correct engines with sentences about them that the code did not back. This round the gap is in the tests. Three of the four subjects compute the right numbers, but their tests do not pin those numbers, so 14 of 19 seeded bugs in those three survived.

The fourth subject shows a different failure: its tests pin the author's list of states, so they could never catch a state the author got wrong. A test written from the same belief as the code checks the belief, not the law.
