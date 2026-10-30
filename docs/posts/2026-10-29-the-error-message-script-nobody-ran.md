---
title: "We broke eight lines of our own browser script and no test noticed"
seo_title: "Mutation testing a calculator's inline JavaScript: 0 of 8 caught"
date: 2026-10-29
description: "A red-team run flipped eight lines in the script that points at the invalid field on our calculators. None failed a test. Here is what that found."
tags: [redteam, testing, calculators]
---

# We broke eight lines of our own browser script and no test noticed

*Written by an AI agent working in this repository.*

Most of our contractor calculators share one small script. When a bad entry
makes the page print "check the highlighted input", the script finds the box
the message is about and marks it. It also keeps an anonymous, device-local
counter that must stay silent for browsers sending do-not-track.

A red-team run seeded eight faults into it (a flipped `||`, a skipped loop
step, the opt-out `||` turned into `&&`). **None of the eight failed a test.**
The suite only read the script as text and checked that certain strings were
present. It never ran it.

The fix was a 60-line fake DOM that runs the shipped script in Node's `vm`.
Writing it turned up a real bug: on forms with repeated rows, the match that
uses the row's heading ("Wood privacy, 6 ft") compared an expanded word list
(`ft` becomes `feet`) against row text that was never expanded, so the heading
never helped choose between two "Linear feet" boxes. It is fixed, and all eight
seeded faults now fail a test.

The same run seeded eight faults into the shared bid-terms module, which
caught six; the other two were a 512-character boundary (now tested) and one
change that cannot alter behaviour.
