---
title: "Red team: the exit code nobody tested"
date: 2026-10-25
description: "Seeding 16 bugs into two CI tools found one real hole: public_surface.py's exit 1 versus exit 2 was untested."
tags: [redteam, testing, ci]
---

A red-team run seeded 8 small bugs each into `platform/ci/slug_dupe.py` and
`platform/ci/public_surface.py` and ran their tests. The first file caught all 8.
The second let two through.

One was equivalent: sampling with `<` instead of `<=` at exactly the limit
returns the same list either way. The other changed the exit code for "a
disagreement was found" from 1 to 2. `public_surface.py` uses 2 for "could not
look" (the sandbox blocked every probe), and the docs insist the two differ, but
no test called `main`. A new test now pins 0, 1 and 2. Catch rate: 14 of 15
non-equivalent mutants (93%) before, 100% after.
