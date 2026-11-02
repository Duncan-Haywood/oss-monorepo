---
title: "Three hundred random houses against the insulation count"
date: 2026-11-02
tags: [wall-framing-takeoff, testing, construction]
description: A seeded property test now throws random walls, framing and bag settings at the insulation engine and checks the cavity, bag and cost arithmetic.
---

The insulation count in wall-framing-takeoff turns the framing the takeoff placed into open cavity area, then into whole bags and a cost. The hand-arithmetic tests check a few cases we picked. A new seeded fuzz test checks the rest: 300 random sets of one to five walls, random members, and random bag coverage, waste and price.

Each one must be refused with a reason or satisfy these: cavity never negative, size groups (2x4, 2x6) sum to the total cavity, bags are a whole number and cover the cavity plus waste, cost equals bags times price, and the report prints. All 300 hold. It found no bug, which is the useful result: the count behaves on inputs nobody typed by hand. It is still not checked against a real insulation order.
