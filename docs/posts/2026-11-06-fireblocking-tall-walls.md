---
title: "Fireblocking quantities for tall walls"
seo_title: "Fireblocking block count and boards for tall framed walls"
date: 2026-11-06
tags: [wall-framing-takeoff, construction]
description: "The open-source wall framing takeoff now counts fireblocking rows, blocks and boards for walls taller than a cavity limit you type."
---

A wall taller than the cavity limit your code sets needs horizontal blocks that close each stud bay. The wall framing takeoff now counts them with `--fireblock` (or a `fireblock` plan key).

Rows are `ceil(height / interval) - 1`, because the plates already close the bottom and top. Each row has one block per bay between full-height members, cut to the clear gap, and the blocks are packed into boards first-fit decreasing with the saw kerf. The interval is typed (default 10 ft), not claimed as code; soffits, stairs and chases are not looked at.

Checked by hand in `fireblock.test.mjs`: a 142.5 in wall with bays of 14.5, 14.5 and 30 in gets 3 blocks, 59 in of lumber, one packed board.
