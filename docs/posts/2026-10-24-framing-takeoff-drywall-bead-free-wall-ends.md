---
title: "A framing takeoff that could not say a wall was a partition"
date: 2026-10-24
description: "The wall-framing takeoff counted drywall corner bead on free wall ends, but the page had no way to set it. Two new columns close the gap."
tags: [construction, drywall, framing, tools]
---

# A framing takeoff that could not say a wall was a partition

The wall-framing takeoff engine has long known two things about a wall that the
page could not express: a wall can be an interior partition with no sheathing
(drywall goes on both faces), and a wall can have free ends, where it stops
without meeting another wall (each needs corner bead on every drywalled face).

Both lived only in the plan JSON. A person using the page typed their walls into
the table, and the page quietly rebuilt each wall without those keys, so
partitions were counted as exterior walls with drywall on one face only.

Today's change adds two columns to the wall table, "Partition (no sheathing)"
and "Free ends", and keeps both when a plan is saved and reopened. A headless
browser test sets a free end on wall 1 and checks the corner bead footage rises.

The numbers are still hand counts, not a real builder's takeoff. Corner bead
sticks and waste follow the engine's stated rates. A real plan from a framer is
the next test it needs.

Tool: the wall framing takeoff in `ventures/wall-framing-takeoff/`.
