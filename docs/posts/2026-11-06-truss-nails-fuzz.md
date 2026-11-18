---
title: "A fuzz test for truss bearing nails"
seo_title: "Property-testing truss toenail counts in a framing takeoff"
date: 2026-11-06
tags: [wall-framing-takeoff, fasteners, testing]
description: "Truss bearing nails in the open-source framing takeoff were checked by hand once. A seeded property test now checks them across 200 random truss counts."
---

Truss bearing toenails (`roofNails.trussToPlate`) landed earlier today with one hand-worked example. This adds a seeded property test: for 200 random truss counts and nail counts, the nail total rises by exactly 2 x trusses x nails, the roof-nails record agrees, the connection rows still add up to the total, and a zero or unset value adds nothing. Negative, fractional, too-large, NaN and string values are refused.

It tests arithmetic consistency only. How many toenails a real truss bearing needs is the engineer's call, and no real truss package has been compared.
