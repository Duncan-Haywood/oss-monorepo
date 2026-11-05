---
title: Calling every function in a framing tool with null
date: 2026-11-05
tags: [wall-framing-takeoff, testing, robustness]
description: "Calling every exported function of the wall-framing takeoff with null, nothing, a number and a word gave 397 raw TypeErrors; what we fixed and what we left."
---

We call every exported function of the wall-framing takeoff with `null`,
nothing, a number and a word. That gave 397 raw TypeErrors. Nearly all are
report writers that only ever receive the engine's own output, so we left them.
Four take what a person uploads or types: the IFC reader, bid leveling, the
slab concrete order and wall sheathing. Each now says what it needs instead of
crashing. A new test file pins the behaviour. Everything used invented inputs;
no real plan or bid was involved.
