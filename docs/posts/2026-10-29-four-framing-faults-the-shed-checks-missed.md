---
title: "Four framing faults the shed designer's checks missed"
date: 2026-10-29
tags: [shed-designer, framing, structure]
description: "A 1,400 lb post landing on one floor joist, eave walls checked with too little roof, a skid joint between blocks and siding joints with no stud behind them."
---

The [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) frames every board of a gable shed and runs two kinds of check on the result. Structural checks size the members against snow and wind, and connection checks make sure each piece bears on the piece below it. Both passed on every preset. We wrote new checks for the paths a load takes on its way down, and for where each sheet of siding, subfloor and roof sheathing gets nailed. Then we worked the numbers by hand. That turned up four faults.

**A ridge-beam post landed on one floor joist.** A ridge beam carries half the roof to a post in each gable wall, and the post brings that load down to the floor. With three skids, the middle one sits right under the post. With four, for example a 10 ft wide shed at the default 48" skid spacing, the post stands about 19" from the nearest skid, mid-span on the end floor joist. On the 10x12 that is 1,403 lb on a single 2x6. As a simple span between skid centres at 30 psf snow, that is 1.38 times the joist's allowable bending stress. No check looked at it. A ridge-beam shed now always gets an odd number of skids, and a new check confirms there is a skid under every post stud.

**Eave walls were checked with too little roof on them.** Under a ridge beam, the beam carries the upper half of each rafter, so each eave wall carries the lower half plus the overhang. Under a ridge board, the board carries nothing: each rafter pair and its tie work as a truss, so each eave wall carries the whole half roof, from ridge to eave tip. The check used the ridge-beam load for both roofs. On the 8x12 classic that is about 37" of roof instead of 60", so the door header and the wall studs were checked with about 40% too little roof load. They still pass, because a short shed header has plenty of capacity, but the margin shown was wrong. Two new tests work the header and the stud check out longhand, the stud as NDS's combined bending and compression with wind governing.

**A skid joint fell between two blocks.** If you tell the tool your longest board is 10 ft, a 12 ft skid is spliced in the middle. The tool's note said to land the joint on a block, but the blocks were spaced evenly from end to end, so the joint at 72" sat in the gap between two blocks, with both board ends hanging in the air. The block layout now starts from the joints: a block under each joint, one at each end, and more in between so none are over 4 ft apart.

**Siding joints had no stud behind them.** T1-11 and LP panels are 4 ft wide, so their vertical joints fall every 48". That is a stud line, and the panel makers want both sheets nailed to framing there. Two kinds of opening broke that line:

- A 32" window with one stud line inside it got its sill cripples only at its two ends, so for 46" under the window the joint had nothing behind it. Sill cripples now stay on the layout.
- On the default design the back window starts 1-3/4" past the 96" line, so its king stud takes the line's place. Above the header, the panel to the right of the joint had only 1/4" of wood to nail into. A cripple over the jack on that side now backs it.

The fixes add two or three short cripples to the presets and, on some ridge-beam sheds, one more skid. On the classic preset that is $4.15; on the default it fits in the offcuts and costs nothing.

The tool's checks are a screening aid, the kind of thing a span table encodes, not an engineer's review. Connections, uplift, racking and the foundation are not checked, and a building department may want stamped drawings.
