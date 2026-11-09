---
title: "We seeded eight bugs in our input-bounds check; two slipped past the tests"
seo_title: "Mutation testing a CI check: what two surviving mutants showed"
date: 2026-11-09
tags: [testing, mutation-testing, ci]
description: "A red-team run mutated check_input_bounds.py eight ways. Six were caught. The two that survived pointed at an untested part: the import walk that decides which modules a page can reach."
---

`platform/ci/check_input_bounds.py` checks that a calculator's number inputs
declare a `max` when its code throws above some limit. Its suite was green, so
we seeded eight small faults (flipped comparisons, `or` to `and`, `/` to `*`)
and ran the suite against each.

Six were caught. Two were not, both in `reachable_modules`, the function that
follows a page's `import` statements to decide which guards apply to it. The
tests only covered a page importing a module directly. Nothing covered an
import two levels deep, a cycle between modules, or an import of a file that
does not exist.

Those are the cases a real venture hits. The `/` to `*` mutant would crash on
any nested import. The `or` to `and` mutant would loop forever on a cycle.

We added three tests, one for each case. The cycle test uses an alarm so a
regression fails in five seconds instead of hanging CI. Rerunning both mutants
now fails the suite: catch rate 6/8 before, 8/8 after.
