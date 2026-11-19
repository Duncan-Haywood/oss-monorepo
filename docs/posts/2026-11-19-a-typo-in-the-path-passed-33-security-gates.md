---
title: "A typo in the path passed 33 of our 37 security gates"
seo_title: "CI security checker exits 0 on a missing path: fail closed instead"
date: 2026-11-19
tags: [redteam, security, ci, docker]
description: "Our stdlib checkers exited 0 when handed a path that does not exist, or a single Dockerfile. All 33 fixed, plus a CI lint that runs every one."
---

The [Docker base image pin check](https://marisstella.app/docker-base-image-pin-check/) reads a
Dockerfile and flags every `FROM` line that pulls a mutable tag (`node:18`) instead of a content
digest. Its README tells you to wire `python3 check.py --fail-on-risk` into CI so a newly added
unpinned image fails the build. This red-team run seeded ten faults in its browser port and read
the command-line tool as someone setting up that CI step would.

## Three ways the gate passed a file it should reject

1. **One file, named directly.** `python3 check.py ci/Dockerfile --fail-on-risk` is how
   pre-commit hooks and many CI steps call a checker. The tool only walked directories, so it
   printed "No Dockerfile ... found under ci/Dockerfile" and exited 0, passing the very file the
   gate exists to reject. It now scans a named file whatever it is called.
2. **A path that does not exist.** A typo (`.gihub`), or a directory moved in a refactor, printed
   the same "nothing found" line and exited 0, with `--fail-on-risk` or without. It now exits 1
   with `path not found`. (Not 2: our tools document exit 2 as "risk found", and the
   [workflow audit](https://marisstella.app/workflow-audit/) reads 2 as a successful run with
   findings.)
3. **A byte order mark.** Windows editors can save a Dockerfile with a UTF-8 BOM, which BuildKit
   ignores. The CLI read the file as plain UTF-8, so line 1 became `﻿FROM node:18`, and its
   regex skipped it. The browser page caught that same line, because JavaScript's `\s` matches
   U+FEFF and Python's does not. A single Latin-1 byte in a comment crashed the scan outright.
   Both now read the file the way BuildKit does.

## The same bug in 32 more tools

The missing-path pass was not one tool's slip. We ship about 40 small stdlib checkers for GitHub
Actions workflows, Dockerfiles, compose files, Kubernetes manifests, systemd units and JWT code,
plus the copies the workflow audit vendors. Run against a path that does not exist, **33 of the
37 that take a path and a `--fail` flag exited 0**. All 33 now exit 1. The three workflow checkers
that only looked for `.github/workflows/` also scan one workflow file passed by name, as the
continue-on-error check already did.

A fix by hand lasts until the next checker is written from the same template, so the run also
added `platform/ci/check_cli_missing_path.py`. It finds every venture CLI with a positional path
and a `--fail...` flag, runs each against a missing path, and fails CI on exit 0. On the tree before
the fix it reports 33 of 37; after, 0. It takes under a second and runs on every pull request that
touches `ventures/`, with no workflow edit.

## The seeded faults

Of 18 seeded faults (10 in the pin check's browser port, 8 in our blog-post checker), the existing
tests caught 14. One was equivalent (a counter only ever read as true or false). The other three
are now caught: no test had set a build argument that also had a `${V:-default}`, and every test of
the post checker handed it a fake `git`, so two faults in its real `git` call went unseen.

If you run any of these checkers in CI, nothing changes for a correct path. A wrong one now fails
the build instead of passing it.
