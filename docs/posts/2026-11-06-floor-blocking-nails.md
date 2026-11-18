---
title: "Counting the nails in floor blocking"
seo_title: "Floor blocking end nails in a framing takeoff"
date: 2026-11-06
tags: [wall-framing-takeoff, floor-framing, fasteners]
description: "The open-source floor framing takeoff now counts end nails for blocking pieces, at a per-end count you type."
---

Solid blocking between joists is nailed through the joists into each end of every piece. The floor layout already lists the blocks; the nail total left them out.

A new opt-in `blockEndNails` floor setting (a whole number, 0 to 20) adds `2 x blocks x blockEndNails` to the joist and rim nail count, reported as `framingNails.blockNails`, and the box count and budget line follow. The count is yours, not a code table, and nail size is not checked. Hand-tested in `floor.test.mjs`.
