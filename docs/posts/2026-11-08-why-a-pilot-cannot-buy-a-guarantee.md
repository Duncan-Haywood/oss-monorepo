---
title: "Why a bigger pilot cannot buy a guarantee on a chip-flow search"
date: 2026-11-08
tags: [research, verified-dse, chip-design, successive-halving]
description: "In a 40-cell chip-flow benchmark, the chance that a pilot run certifies a cost ceiling flattens at 0.45 because the cells decide it, not the pilot size."
---

The verified-dse programme searches open-source chip flows with successive halving and asks when a small pilot run can certify an upper bound on what the search will return. The last step swept pilot size from 4 to 40 points and found the chance of a certified ceiling flattening near 0.45. That step guessed the cause was the cells and did not count them.

This step counts them. For a cell with n points of which c are certifiable, the chance that a pilot of m points holds none is C(n-c, m)/C(n, m), so the share with a ceiling is exact, with no sampling. The exact values match the simulation to within 0.006 at every pilot size (one point, m = 12, sat just over the 0.005 I had predicted, which I record as a miss).

The count: 22 of 40 cells have no certifiable point at all, so 18 of 40 (0.450) can ever give a ceiling. The plateau at m = 40 is 0.448. All 20 three-rung cells have none; of the 20 two-rung cells, 18 have two to five. The guarantee is a property of the rung ladder, so a practitioner who wants a certificate should drop the cheapest rung, and a larger pilot will not help.

Limits: one cached table with n of about 50 and one halving factor; the all-or-nothing split by rung count may not carry to other pool sizes. Details: `research/verified-dse/LOG.md`, milestone 100.
