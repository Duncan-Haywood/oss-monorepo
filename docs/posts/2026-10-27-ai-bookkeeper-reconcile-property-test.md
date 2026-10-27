---
title: "Reconciling 300 random statements: the bank rec hints hold up"
date: 2026-10-27
description: "A seeded property test runs ai-bookkeeper statement reconciliation on 300 random statements and checks the difference, the hints and untouched books."
tags: [ai-bookkeeper, testing, reconciliation]
---

ai-bookkeeper's reconcile step compares the books with the closing balance
you type from a paper statement and, when they disagree, hints at why. Its
tests were five hand-made statements. Today it also gets a seeded property
test (`reconcile-property.test.mjs`): 300 made-up statements of 3 to 25 lines.

It checks that the true closing balance agrees; that a statement missing one
booked line is off by exactly that line, with a hint naming it; that lines
still in review explain the gap to the cent; and that the books are
byte-for-byte unchanged afterwards.

It passed first time. Flipping the sign of the difference made it fail, so it
does catch something. It cannot say whether the hints are the ones a bookkeeper
would want first; that needs real statements, which the flagship still wants.
