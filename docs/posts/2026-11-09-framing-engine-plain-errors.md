---
title: "Calling every framing-engine export with garbage"
date: 2026-11-09
tags: [construction, wall-framing-takeoff, testing]
description: "Probing the wall-framing engine's exports with null, numbers and empty objects found three layout functions that failed with raw JavaScript errors."
---

A quick probe: import every module in the wall-framing takeoff, call each exported function with `null`, `5`, `"x"`, `{}` and `[]`, and list what throws a bare `TypeError`.

Most of the output was formatters handed something that is not a result, which is fair. Three were real entry points: `layoutWall`, `layoutFasteners` and `layoutInsulation`. Given a missing plan or result they said "Cannot read properties of undefined (reading 'walls')", which tells a caller nothing about which argument was wrong.

They now throw a plain message naming the function and what it needs. One test covers all three.

Limits: the sketch, dxf and stock-optimiser helpers also throw raw errors on garbage and were left alone, since only internal callers reach them. The inputs were invented, and no real plan was involved.
