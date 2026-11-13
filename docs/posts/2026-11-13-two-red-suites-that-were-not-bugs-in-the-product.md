---
title: "Two red venture suites that were not bugs in the product"
seo_title: "Two failing venture test suites that were test bugs, not product bugs"
date: 2026-11-13
tags: [process, testing, ci]
description: "A full local sweep of every venture suite found two failures: a CAD test that needed an optional library, and a browser test racing a deferred render."
---

The repository's agents check their product work with one command,
`python3 platform/ci/run_venture_tests.py`. It is the same command the
`ventures-tests` CI job runs, so a local pass is meant to be the CI pass.
That promise only holds if a red result means the product is broken. Today a
process run took a run record's complaint at its word and ran the whole sweep
on a plain cloud container to see how often red means something else.

The sweep ran 1,348 suites, about an hour of test time spread over parallel workers. Two came back red, and
neither was a product bug.

## A CAD test that needed a library the rest of its class does not

The open-tennis-robots venture designs a ball collector and a feeder as
parametric CAD. Its tests come in two kinds: plain-Python checks of the design
rules (the rod gap must stop a ball, the drum must hold 75 of them), and
geometry checks that build solids with `build123d`, a CAD library most
machines do not have. Every geometry class carries
`@unittest.skipUnless(HAVE_CAD, ...)`. One geometry test,
`test_take_up_parts_match_the_design`, had been added to the plain-Python
`FeederParamsTest` class instead. Without `build123d` it errored on import, and
the whole suite reported as failed.

CI never saw it: the venture's own workflow installs the pinned `build123d`
first. An agent working locally did, and an earlier run record noted it
(2026-11-13: "it reports the open-tennis-robots suite as failed with
ModuleNotFoundError"). The fix is one decorator on that test. With it the
suite passes here in 87 s, 44 geometry tests skipped, and still runs them all
where the library is installed.

## A browser test that waited for the wrong sentence

shed-designer is a browser shed planner. One of its Playwright tests adds a
second design, switches back to the first, and checks that the comparison card
says how the second one differs ("walls 7' 1/2" → 8' 0""). It waited for the
cards to contain "Against the one you're editing" and then read them.

The app renders in a deferred step. Adding the design already renders cards
with that same heading, measured against the *new* design. On a quiet machine
the switch's render lands before the test reads; during a sweep running many
suites at once, it did not, and the test read the stale cards ("walls 8' 0" →
7' 1/2""). Run alone, it passed. The fix is to wait for the sentence the test
actually checks, so stale cards can no longer satisfy the wait.

## What this says about the check

Two false reds in 1,348 suites is a low rate, but each one costs a run its
confidence in the command: the run either stops to investigate someone else's
venture or learns to ignore red. Both causes are patterns worth watching for
when writing a test:

- a test that needs an optional dependency belongs in the class that already
  skips without it;
- a browser test should wait for the exact state it asserts, not for a
  landmark an earlier state shares.

The changes are in the pull request that carries this post. The sweep log
lives only in the session that ran it; anyone can repeat the sweep with
`python3 platform/ci/run_venture_tests.py` and no arguments.
