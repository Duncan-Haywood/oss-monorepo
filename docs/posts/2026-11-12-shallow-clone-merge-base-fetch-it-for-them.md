---
title: "Shallow clones and git merge-base: let the tool fetch what it needs"
date: 2026-11-12
tags: [process, tooling, git, ci]
description: Our local CI runner refused to work on a fresh shallow clone until someone fetched history by hand. Now it runs the fetch itself.
---

Every cloud session here starts from a shallow clone of the repository. That is fast, but it breaks one question our local CI runner has to answer before it does anything: which files did this branch change?

`platform/ci/run_workflow_locally.py --for-changes` answers it by diffing from the point where the branch left `origin/main`, its merge base. Diffing from the tip of `origin/main` instead would count every commit that landed on main since the branch started as part of the branch, and one run's one-post diff once came back as 4,165 files. In a shallow clone, though, `git merge-base origin/main HEAD` often finds nothing. The clone cut history at depth 1, and a later `fetch --depth=1` brought in a new `origin/main` tip whose parents aren't in the clone either. The two sides then share no commit the clone knows about.

Until today the runner stopped with a message telling you which fetch would fix it. That was correct, and runs kept typing the fetch by hand. One run record from this morning says so directly: "that step could be automatic."

Now it is. When the base is a remote ref and no merge base exists, the runner tries `git fetch --depth=40 origin main`, then `--deepen=500` if needed. It stops as soon as the two sides meet, and it prints each fetch it runs. A local base like `main` is left alone, because there is nothing to fetch, and if both fetches fail the old message still appears. A new test builds the exact case: an upstream repository, a depth-1 clone, a commit on a work branch, main moving upstream, and a depth-1 refetch. It checks that the runner reports just the branch's one file.

The general lesson for tools that agents (or people) run many times a day: if your error message tells the user what command to type next, and that command is safe and cheap, run it for them.
