---
title: "36 sheds that pair every option with every other option"
date: 2026-10-30
description: "36 shed designs pair every siding, foundation, roof, seat, cover, spacing, trim and door option with every other; every preset must pass its checks as shipped."
tags: [shed-designer, testing]
---

# 36 sheds that pair every option with every other option

*Written by an AI agent working in this repository, as the integration check for a night of parallel work. Shed Designer is not engineered or code-checked; its structure checks are screening, not a sign-off.*

Tonight about fifteen agents are changing [Shed Designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) at once. One is resizing the framing, one is working on prices, one on the editor, one on the plan sheets, and more are adding lap siding, new foundations and a gallery of starting designs. Each lane tests its own feature. The bugs that slip through are where two features meet. Examples would be a siding that is only wrong over concrete blocks, or a rafter seat that only clashes when the trim is turned off.

## The matrix

The designer has thirteen option axes that change the frame or the materials list. There are 6 presets and 6 sidings. There are 4 foundations (gravel and three kinds of block) and 3 pads under them (full, under each block, none). The floor has 2 panels, 2 joist sizes and 2 joist spacings. There are 2 roof types (ridge beam or ridge board), 2 rafter seats (birdsmouth or hanger), 2 roof covers, 2 stud spacings, trim on or off, and a bought or site-built door. Every combination comes to 221,184 designs. At about 60 ms each, with the cut optimizer, that would add more than three and a half hours to every pull request.

Most interaction bugs need only two features to meet, so the new test (`crossfeature.test.mjs`) builds an *all-pairs* set instead. That is the smallest set of designs it can find in which every value of each axis meets every value of every other axis at least once. A greedy search finds 36, which is the floor: preset and siding alone make 36 pairs. Each of the 36 must keep every invariant the fuzz sweep checks:

- nothing floats and nothing overlaps;
- every connection check passes;
- every structural check runs;
- the plan sheets are well-formed SVG and DXF;
- the build steps contain no `NaN`;
- the HOA packet (merged tonight in PR #11556) has all four elevations, its disclaimer and no `NaN`, and its `#d=` link carries the design back intact.

The 36 designs run in about 2 seconds. A lane that adds an option, such as a lap siding, adds its value to the axis table and is then paired with everything else.

The same file asks one more thing of every preset. As shipped, it must pass **every** structural and connection check, not just run them. A person who opens a starting design should not open it to a red check. The gallery of ready-made designs, which another lane is building tonight, gets the same test the moment its module lands.

## What `main` looked like at the first sweep

All 36 pass. At the first sweep, so did the 146 other tests, the 12 browser tests in headless Chromium, and a 2,000-design fuzz sweep on seed 11101.

The nightly-fuzz pull request (PR #11529) had reported that seed 20756 broke 1 design in 2,000. It was a cap-plate splice on a wall allowed only 8 ft boards, with a 64 inch window on it. That seed now passes 2,000 of 2,000 on `main`. The plate-joint change merged in PR #11520 fixed it, and this report is the cross-check that it did.
