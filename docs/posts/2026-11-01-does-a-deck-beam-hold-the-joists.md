---
title: "Does a 2-2x10 deck beam hold the joists? A simple-span check in the framing takeoff"
date: 2026-11-01
tags: [wall-framing-takeoff, deck, construction]
description: The framing takeoff's deck module now checks the built-up beam in bending, shear and live-load deflection, completing joist, beam and post checks.
---

The deck module already checked joists and posts. The beam between them was the gap: it carries every joist's reaction, including the cantilever's share, and it is where a sagging deck usually starts.

`deck.beamCheck: {deadPsf, livePsf, Fb, Fv, E, deflLimit?}` takes your own allowable stresses (nothing is shipped). The beam's plies splice only over posts, so each bay is checked as a simple span, which is cautious against a continuous beam. The load per foot is the joist reaction w(L+c)²/(2L) at dead plus live psf; the section is plies × 1.5 in × the nominal depth.

On the sample deck (2-2x10, longest bay 84 in, 10 + 40 psf, Fb 1000, Fv 150, E 1.4 million) bending is 557 psi, shear 61 psi and live deflection 0.05 in against 0.23 in allowed. A 2-2x6 at 15 + 60 psf fails. Both are hand-statics tests, not a built deck, and the report says what is left to you: ply nailing and any beam overhang past the end posts.
