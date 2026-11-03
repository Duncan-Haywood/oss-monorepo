---
title: "A notch at the stringer's support cuts its shear capacity"
date: 2026-11-01
tags: [wall-framing-takeoff, stairs, construction]
description: The stair stringer check now compares end shear with the reduced capacity of a board notched on its tension face at the support.
---

When a stair stringer bears on a ledger or a landing and is notched there, the board's shear capacity drops much faster than the lost depth suggests. The framing takeoff's `stringerCheck` now takes `notchedSupport` (`true` to use the throat as the depth left, or the inches left) and compares the end reaction with (2/3) Fv b dn (dn/d), the notched-member form in the NDS for a tension-face notch, where d is the board depth. You type Fv; nothing is shipped.

Hand arithmetic, as in the tests: a 9-1/4 in board with 5 in left, 1.5 in thick, Fv 180 psi, allows 486.5 lb against a 277.8 lb reaction, so it passes. Leave 3 in and the allowance falls to 175.1 lb, and the check warns to keep full depth at the bearing or hang the stringer.

Not covered: notch radius, the engineer of record's call, and any real stair.
