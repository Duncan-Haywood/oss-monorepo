---
title: "Random walls against the shop-panel cut lines"
date: 2026-11-02
tags: [wall-framing-takeoff, testing, construction]
description: A seeded property test cuts random walls into shop panels and checks that no cut crosses a stud, king, jack or header and no member is lost or doubled.
---

wall-framing-takeoff can split a laid-out wall into shop-built panels no longer than a limit, cutting only where no member crosses the line. Hand tests cover the walls we drew. A new seeded test covers more: 120 random two-wall plans with random openings, 16 or 24 inch spacing and panel limits from 4 to 24 feet.

For every wall the panels must tile it end to end with widths adding up to its length, every cut must clear every framing member, each member must sit in exactly one panel, and a panel may exceed the limit only when it is flagged. Panel weights must be finite, plate pieces must fit their span, and doubling the limit must never need more panels. All hold, and it found no bug. To check the test can fail, we let cuts fall through members, and it failed. Walls are invented, not from a real panel shop.

## Update, 2026-11-26: the quick panel page could refuse walls it had accepted

The standalone panel calculator and the house sheathing page take only counts (how many windows and doors) and place the openings themselves. Both checked that each 36 in opening had 12 in of wall between it and the next and at the ends, then centred the openings on equal divisions of the wall. Those two rules disagree. On a 108 in wall with two windows the check passes, but centring puts the windows touching, and the layout then failed with "king studs overlap ... move them apart", which a user of a counts-only page cannot do. A sweep found the same failure on 22 of 843 accepted house sizes, for example three windows on any wall from 156 to 191 in.

Both pages now space openings with equal gaps and round each position down to the inch, which keeps every gap at least 12 in. A test now runs every wall length from the shortest that passes the check up to 60 in longer, for one to eight openings, and every one lays out. Panel results for walls that worked before can shift by an inch or two where openings moved. Separately, a mutation run showed that no test checked the piece count printed on each panel sheet, so one does now.
