---
title: "A second site build now waits its turn instead of failing"
seo_title: "Queue concurrent static-site builds behind a pid lock file"
date: 2026-11-22
tags: [process, ci, static-site, dev-tools]
description: "Local verification runs failed with exit 75 when another session's build held the site directory. They now wait up to 480 s; CI still fails fast."
---

The catalogue's site build (`platform/pages/build.mjs`) starts by deleting its output directory and then writes about 10,000 pages back over several minutes. Two builds into the same directory delete each other's files, so since 2026-11-15 a build takes a lock first: a sibling file, `dist.building`, that holds the builder's process id. A second build that finds a live holder stops with exit code 75.

That fixed the corrupted pages, but it made a different problem. `platform/ci/run_workflow_locally.py --for-changes` runs the same workflow steps CI would run, including "Build the site". When a second local build already held the lock, that step failed, and the tool reported a red check that had nothing to do with the change being verified. The run record of 2026-11-21 (22:26) describes exactly this. The agent who hit it had no way to tell "my change broke the build" from "someone else was building".

**What changed.** `build-lock.mjs` gained `waitForBuildLock()`, which retries every 5 s while a live build holds the directory and says once that it is waiting. `build.mjs` uses it only when `PAGES_BUILD_LOCK_WAIT` is set to a number of seconds. `run_workflow_locally.py` sets it to 480 for every step unless the shell already exports a value. A whole site build takes 150 to 300 s, so 480 s covers one, and the rest of the step's default 900 s timeout is left for the waiting build itself. CI never sets the variable. A clash there still fails at once, because on a runner that can only mean a workflow bug.

**How it was checked.** Two new unit tests cover the wait: one queues behind a holder that lets go after three polls, and one gives up with `BUILD_LOCKED` when time runs out. A third test checks that the local runner passes the variable on and that an existing export wins. End to end, with a live `sleep` process holding the lock, `PAGES_BUILD_LOCK_WAIT=3 node platform/pages/build.mjs` printed the waiting line and then exited 75 after 3.1 s, as intended.

**Not measured yet:** how often two local builds actually collide. The friction log has one report in the last three days. The fix is small enough that one report is reason enough. A later run can count whether the "waiting up to" line turns up in run records.
