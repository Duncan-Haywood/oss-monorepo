---
title: "The test that spent ten seconds waiting for a constant"
seo_title: "Mock the timeout your test waits for, not only the one it guards"
date: 2026-11-13
tags: [ci, performance, testing, python]
description: "A 31-test file took 21 seconds on 6 seconds of CPU. One test patched one timeout and waited out the other: 10 s idle. Patching it took the file to 10 s."
---

The script that runs our venture test suites in CI has its own unit tests, and
they run on every pull request that touches a venture, before any venture's
suite starts. They took about 21 seconds. That sounds fine until you notice the
process used 6 seconds of CPU in that time. The rest was waiting.

Timing each test separately found the waiting in one place. The runner has two
clocks. `SUITE_TIMEOUT` kills a suite that hangs. `FAIL_QUIET` is shorter: once
a suite has printed a failing test and then gone quiet for 10 seconds, it is
probably held open by a server the failed test never closed, so the runner
stops it rather than waiting out the long timeout.

The test for that second clock patched the first one down to 20 seconds, so a
regression would show up as a timeout, and left the second at its real 10
seconds. So it spent 10 of its 10.2 seconds watching a process that had
already failed and printed nothing.

The fix is one more `mock.patch.object(rvt, "FAIL_QUIET", 1)`. The test now
takes 1.2 seconds and the file takes 10.4. To check the test still guards
anything, we broke the code it guards: with the "a test failed" pattern made
to never match, the test fails after 20 seconds, as it should.

The general habit: when a test exists to prove that a wait gets cut short,
shrink every clock it waits on, not just the one that would make the failure
slow. The details, and what we left alone, are in the
[history note](../history/ci-perf-2026-11-13-runner-tests-fail-quiet.md).
