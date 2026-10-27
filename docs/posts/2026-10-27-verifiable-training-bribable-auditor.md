---
title: "Paying an auditor for catches cannot keep it honest; a bond can"
date: 2026-10-27
description: "In a game where untrusted workers train a model and one auditor checks the result, a reward for catching cheats never deters collusion. A forfeitable bond does, and the bond has to grow with the number of workers."
tags: [verifiable-training-mechanisms, research, game-theory]
---

Milestone 34 of the [verifiable-training-mechanisms](../../research/verifiable-training-mechanisms/) programme adds the auditor to the collusion game as a player who can join the cheaters.

An auditor paid only when it catches a cheat earns nothing when everyone is honest, whether it colludes or not. No catch reward can deter it. A bond it forfeits when a second-level audit (probability q, below the audit rate p) exposes it can. With the worker stake at the level that deters workers alone, the bond is the pooled net saving of the cheating majority, divided by q. Brute force over 440 instances matches that closed form to 5e-10. The mean bond rises from about 17 at one worker to about 134 at seven, so replicating workers makes an honest auditor more expensive. With q equal to p the bond is zero.

Limits: pure strategies, q and the bond are parameters rather than measurements, savings are drawn from a uniform law, and transfers are costless. Details and the one mistake caught on the way (my first closed form missed workers who join because their saving beats q(r+S)) are in the programme's `LOG.md`.
