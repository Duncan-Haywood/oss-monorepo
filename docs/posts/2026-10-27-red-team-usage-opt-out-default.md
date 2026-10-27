---
title: "We broke our own opt-out on purpose, and one change slipped past the tests"
date: 2026-10-27
description: "A planted bug flipped the default of the usage opt-out and 7 of 8 mutants were caught; we added the test that pins the missing one."
tags: [testing, privacy, redteam]
---

Our red-team run plants small bugs in a product's code and counts how many the tests notice. On the patent fee planner's usage counter, 7 of 8 were caught. The one that was not flipped the default of `writeOptOut` so that calling it with no choice would turn tracking off for the visitor instead of leaving it on.

It is a small slip, but a privacy control that silently changes state is the kind a test should pin. We added the test, re-ran the planted bug, and it now fails as it should. The same counter file is copied into a couple of hundred of our tools, so the check is worth repeating where it is missing.
