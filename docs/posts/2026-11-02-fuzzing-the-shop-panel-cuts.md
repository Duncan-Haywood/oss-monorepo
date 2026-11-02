---
title: "Random walls against the shop-panel cut lines"
date: 2026-11-02
tags: [wall-framing-takeoff, testing, construction]
description: A seeded property test cuts random walls into shop panels and checks that no cut crosses a stud, king, jack or header and no member is lost or doubled.
---

wall-framing-takeoff can split a laid-out wall into shop-built panels no longer than a limit, cutting only where no member crosses the line. Hand tests cover the walls we drew. A new seeded test covers more: 120 random two-wall plans with random openings, 16 or 24 inch spacing and panel limits from 4 to 24 feet.

For every wall the panels must tile it end to end with widths adding up to its length, every cut must clear every framing member, each member must sit in exactly one panel, and a panel may exceed the limit only when it is flagged. Panel weights must be finite, plate pieces must fit their span, and doubling the limit must never need more panels. All hold, and it found no bug. To check the test can fail, we let cuts fall through members, and it failed. Walls are invented, not from a real panel shop.
