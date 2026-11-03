---
title: "Deck joists, checked instead of guessed"
date: 2026-11-01
tags: [construction, wall-framing-takeoff]
description: The deck planner now checks joist bending, shear and deflection from stresses you type in, and says plainly when a 2x8 is too long.
---

The deck planner in wall-framing-takeoff already counted joists, posts, footings and decking. Until now it only warned about a joist if you pasted in a span table. This change adds `deck.joistCheck`: type your dead and live load and the Fb, Fv and E you got from your lumber table, and each joist is checked as a beam on the ledger and the beam, with the cantilever past it.

On the 16 x 12 ft example (2x8 at 16 in, 10 + 40 psf, Fb 1000, Fv 150, E 1.4 million) it passes: bending 885 of 1000 psi, midspan live deflection 0.25 of 0.36 in. Stretch the deck to 16 ft out and the same 2x8 fails (bending 1669 psi, deflection 0.88 in against 0.50); a 2x10 gets bending to 1025 psi, 3% over, so it fails too. A 2x6 on the 12 ft deck fails as well.

The figures are only as good as the stresses you type. Nothing is shipped, notches, holes and hangers are not checked, and the tests are hand statics, not a real deck or an engineer's sign-off.
