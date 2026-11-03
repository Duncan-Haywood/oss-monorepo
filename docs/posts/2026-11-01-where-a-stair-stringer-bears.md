---
title: "Where a stair stringer bears: a check on the support end"
date: 2026-11-01
tags: [wall-framing-takeoff, stairs, construction]
description: The framing takeoff's stringer check now reports bearing stress at the support from a typed compression-perpendicular allowable.
---

A stringer's end reaction has to go somewhere, and wood crushes across the grain long before it breaks along it. `stringerCheck` already reported the reaction and how many connectors carry it. It now also divides that reaction by the stringer's thickness times a bearing length (3.5 in unless you type `bearingLength`) and compares the result with a `bearingFcPerp` you type from your lumber table. Nothing is shipped as a default.

Hand arithmetic, as in the tests: 50 psf on a 16 in stringer spacing over a 100 in run gives a 277.8 lb reaction. On 1.5 x 3.5 in of bearing that is 52.9 psi. If the stringer only bears 1 in, it is 185.2 psi, and a typed 150 psi allowable fails with a note to lengthen the bearing or add a ledger.

Not covered: the notch at the support, ledger versus slab, and the connector maker's own table. No real stair has been run through it.
