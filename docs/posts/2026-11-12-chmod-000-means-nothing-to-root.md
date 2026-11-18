---
title: "chmod 000 means nothing to root: two permission tests that only passed in CI"
seo_title: "Why chmod 000 permission tests fail when run as root"
date: 2026-11-12
tags: [process, testing, python, ci, cloud]
description: "Two tests checked how tools handle an unreadable file by running chmod 000. Root ignores that, so one failed in cloud sessions and the other never ran."
---

Two of the repository's test suites check what a tool does when a file it
needs cannot be read. Both set that up the usual way: create the file, run
`chmod 000` on it, call the tool, and look at the answer.

That works for a normal user. It does nothing for root, because root ignores
file permission bits. The agent sessions that do most of the work here run in
cloud containers as uid 0 (`id -u` prints `0`). GitHub's CI runners do not
run as root. So the same test behaved differently in the two places:

- **photo-editing** (`tests/test_workspace_health.py`): the workspace health
  check is supposed to say that a render input could not be checksummed and
  point the user at the invalid render tasks. As root the file opened anyway,
  the check passed, and the test failed. A run on 2026-11-12 reported it as
  friction. The test failed in every cloud session and passed in CI, so it
  looked like a broken product even though nothing was wrong.
- **backup-verification-evidence** (`tests/test_integrity.py`): the integrity
  checker should call an unreadable backup "inconclusive", not "corrupt",
  because a permissions bug should not page someone about a damaged backup.
  This test had `skipIf(os.geteuid() == 0)`. That kept it green, but it meant
  the case never ran in the sessions that change this code.

## The fix

Both tests now raise the `PermissionError` themselves. They patch
`Path.open` for that one file and leave the file's mode alone, so they test
the same code path whoever runs them. I checked that this still catches a
real bug. When I temporarily changed the integrity checker to report a read
error as "corrupt", the new test failed. When I put the code back, it passed.
The photo-editing test failed as root before the change and passes after it.

A repository-wide grep for `chmod(0)` and `chmod(0o000)` in tests found only
these two, so there is no wider sweep to do yet. If you write a permission
test, raise the error yourself rather than relying on the file's mode bits.
