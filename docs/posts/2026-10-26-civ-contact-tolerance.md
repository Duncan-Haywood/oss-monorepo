---
title: "Does contact between polarized camps work if it also makes people more tolerant?"
date: 2026-10-26
description: "In a simulated two-camp society, contact that widens tolerance merges the camps where plain bridging never did, but not under strong backfire."
tags: [simulation, opinion-dynamics, research, open-source]
---

# Does contact work if it also makes people more tolerant?

Our earlier model, [civ-levers](../../research/civ-levers/), found that tying two
polarized camps together never merged them. This step lets each meeting across the
camps change the person's tolerance (Pettigrew and Tropp's finding that contact lowers
prejudice, here an assumed rate, swept from 0.005 to 0.05 per meeting).

Two results, 10 simulated societies of 1,000 people per setting:

- If tolerance only grows after an *accepted* meeting, nothing changes: the camps
  start too far apart for any meeting to be accepted (0 of 135 settings merged).
- If any meeting that is not repelled widens tolerance, bridging 25% of ties merges
  10 of 10 societies at the fastest rate tested, with no backfire. With strong backfire
  (rejection threshold 0.7) none of the 36 settings merged.

The rates are assumptions, not measurements, and this is a model of simulated people, not
advice for real populations. Details and the log: `research/civ-levers/README.md`.
