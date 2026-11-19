---
title: "A timed-out git fetch no longer locks the clone for everyone after it"
seo_title: "A timed-out git fetch no longer strands shallow.lock"
date: 2026-11-19
tags: [process, agents, tooling, git]
description: "Python's subprocess timeout SIGKILLs git, skipping its lock cleanup, so .git/shallow.lock stays. The fetch helper now sends SIGTERM and clears stale locks."
---

The scripts that route work in this repository often fetch more of `main` before they answer: seven days of history for commit counts, fourteen for dating friction reports. Cloud clones start shallow, so each of those is a `git fetch --shallow-since=...` with a timeout. The timeout is there so a slow fetch can't hang the run.

The timeout was the cause of the bug. When `subprocess.run(..., timeout=50)` runs out of time, it ends the child with SIGKILL. A process can't catch SIGKILL, so git never gets to run the cleanup that removes its lock files. `.git/shallow.lock` stays on disk, and every later fetch in that clone fails at once:

```
fatal: Unable to create '/home/user/oss-monorepo/.git/shallow.lock': File exists.
Another git process seems to be running in this repository
```

Nothing is running. Two run records (16 and 18 November) say `allocate.py`'s background fetch went past its 50 seconds and left the lock behind, and a later `git fetch` failed until someone deleted the file by hand. `friction_rank.py` made it worse in its own way: it politely *waits* for the lock to go away, and a stranded lock never does.

## Reproduced

With a 4-second timeout on a `--shallow-since=20 days ago` fetch in this clone, the lock was there afterwards and the next `git fetch --depth=1` failed with the message above. Then the same fetch run with `start_new_session=True`, and on timeout `os.killpg(pid, SIGTERM)` in place of the kill: exit -15, and no lock left. git's lockfile code removes its locks on SIGTERM.

## The change

`platform/ci/shallow_repair.py` already wrapped most of these fetches (it fixes a different shallow-clone fault). It now also:

- runs the fetch through `run_gently`. On timeout that sends SIGTERM to the fetch's whole process group (git and the helpers it forks), waits up to 10 seconds, and only then sends SIGKILL. It still raises `TimeoutExpired`, so every caller's existing "fetch timed out, carry on" path is unchanged;
- calls `clear_stale_lock` before each fetch. That removes `.git/shallow.lock` when no running git process has its working directory in the clone, read from `/proc`. It can't take a lock from a live fetch: a git that starts afterwards finds the existing file and fails instead of taking the lock over. With no `/proc`, nothing counts as stale;
- clears a stale lock when run by hand: `python3 platform/ci/shallow_repair.py`.

Three fetches that skipped the helper now go through it: `allocate.py`'s plain refresh of `main`, `quality_audit.py`'s `fetch_main` and `friction_rank.py --live`'s deepen. Before `friction_rank` waits on a lock, it checks whether the lock is stale.

Checked end to end on this clone: the timed-out fetch left no lock, and a fetch run after I planted a lock by hand removed it and succeeded (exit 0). Seven new tests cover the gentle timeout, the SIGKILL fallback for a child that ignores SIGTERM, a stale lock being removed, a lock being kept while a git-named process runs in the repository, and the case with no `/proc`.

One fault is left. Tools that call `subprocess.run(["git", "fetch", ...], timeout=...)` directly still SIGKILL on timeout. One of them is `promptctl.py measure`'s 180-second fetch, which sits under the owner-reviewed `prompts/` path, so changing it goes in a separate small PR. The next fetch through any helper-backed tool now clears the lock they leave, so the damage stops there.
