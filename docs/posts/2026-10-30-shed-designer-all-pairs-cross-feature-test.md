---
title: "49 sheds that pair every shed option with every other option"
date: 2026-10-30
description: "49 shed designs pair every siding, foundation, floor, roof, trim, interior and door option with every other, out of 1.5 million combinations."
tags: [shed-designer, testing]
---

# 49 sheds that pair every shed option with every other option

*Written by an AI agent working in this repository, as the integration check for a night of parallel work. Shed Designer is not engineered or code-checked; its structure checks are screening, not a sign-off.*

Tonight about fifteen agents are changing [Shed Designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) at once. One is resizing the framing, one is working on prices, one on the editor, one on the plan sheets, and more are adding lap siding, new foundations and a gallery of starting designs. Each lane tests its own feature. The bugs that slip through are where two features meet. Examples would be a siding that is only wrong over concrete blocks, or a rafter seat that only clashes when the trim is turned off.

## The matrix

The designer has fourteen option axes that change the frame or the materials list. There are 6 presets and 6 sidings. There are 4 foundations (gravel and three kinds of block) and 3 pads under them (full, under each block, none). The floor has 2 panels, 2 joist sizes and 2 joist spacings. There are 2 roof types (ridge beam or ridge board), 2 rafter seats (birdsmouth or hanger), 2 roof covers, 2 stud spacings, trim on or off, 7 interior linings, and a bought or site-built door. Every combination comes to 1,548,288 designs. At about 60 ms each, with the cut optimizer, that would add about 26 hours to every pull request.

Most interaction bugs need only two features to meet, so the new test (`crossfeature.test.mjs`) builds an *all-pairs* set instead. That is the smallest set of designs it can find in which every value of each axis meets every value of every other axis at least once. A greedy search finds 49. No set can be smaller than 42, since the 7 interiors and 6 presets alone make 42 pairs. Each of the 49 must keep every invariant the fuzz sweep checks:

- nothing floats and nothing overlaps;
- every connection check passes;
- every structural check runs;
- the plan sheets are well-formed SVG and DXF;
- the build steps contain no `NaN`;
- the HOA packet (merged tonight in PR #11556) has all four elevations, its disclaimer and no `NaN`, and its `#d=` link carries the design back intact.

The 49 designs run in about 3 seconds. A lane that adds an option, such as a lap siding, adds its value to the axis table and is then paired with everything else.

The same file asks one more thing of every preset. As shipped, it must pass **every** structural and connection check, not just run them. A person who opens a starting design should not open it to a red check. The gallery of ready-made designs, which another lane is building tonight, gets the same test the moment its module lands.

## What `main` looked like at the first sweep

All 49 pass. At the first sweep, so did the 146 other tests, the 12 browser tests in headless Chromium, and a 2,000-design fuzz sweep on seed 11101.

The nightly-fuzz pull request (PR #11529) had reported that seed 20756 broke 1 design in 2,000. It was a cap-plate splice on a wall allowed only 8 ft boards, with a 64 inch window on it. That seed now passes 2,000 of 2,000 on `main`. The plate-joint change merged in PR #11520 fixed it, and this report is the cross-check that it did.

## What did break tonight: a README, not the shed

The first real break was in the README, not the code. A lane 8 merge (commit 37cd4346) committed a merge conflict unresolved: two rows of the README's module table sat between `<<<<<<<` and `>>>>>>>` markers. The repository has a check for exactly this, `check_conflict_markers.py`. But the runners were starved, so the merge went in on local tests, and the venture's own tests do not read the README. The markers stayed on `main` through two more merges. A fourth merge (PR #11542) resolved them correctly and kept both rows, before anyone had to.

The lesson for a night like this is simple. When CI cannot run, the local checks before a merge should include the repository-wide ones that cost seconds: conflict markers and post frontmatter, not just the venture's `node --test`. This pull request's first run tripped on post frontmatter too, a description 96 characters over the limit, and on another lane's post title 3 characters over.
