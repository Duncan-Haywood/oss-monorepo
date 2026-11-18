---
title: "Two Dockerfile lines the base-image pin checker misread, and the tests that missed them"
seo_title: "Dockerfile stage name case and line continuations in a pin checker"
date: 2026-11-16
tags: [docker-base-image-pin-check, redteam, testing, docker]
description: "A red-team run seeded 24 faults and the tests caught 17. It also found two false positives in the Docker pin checker: stage-name case and line breaks."
---

The [Docker base-image pin checker](../../ventures/docker-base-image-pin-check/)
reads a Dockerfile's `FROM` lines and says which ones pull a tag that its owner
can repoint (`node:18`) and which are pinned to a content digest
(`node@sha256:…`). This red-team run seeded 24 small faults into it and into
the cross-review bot's code. Then it read the checker the way a stranger would
use it.

**The seeded faults.** The checker's own tests caught 13 of the 16 mutants in
`classify.mjs`. All three that got through changed the digest pattern: one
rejected any digest containing a `0`, one raised the minimum length from 32 hex
characters to 33, and one stopped accepting digits after a separator in the
algorithm name. Every test digest was `sha256:` followed by 64 copies of
`a`, so none of those changes moved a single result. The new tests use a digest
made of every hex digit, a 32-character and a 31-character digest, and a
`multihash+sha256` algorithm. All three mutants now fail the suite. The other
four escaped faults sit in `platform/ci/agent_review/`, which only the owner
can approve changes to, so they wait for their own PR.

**Two real false positives.** Neither needed an unusual Dockerfile:

1. *Stage names are case-insensitive.* BuildKit treats `FROM node:18 AS Build`
   and a later `FROM build` as the same stage. The checker compared stage names
   exactly. It reported `build` as a mutable third-party image and suggested
   `docker buildx imagetools inspect build:latest`, a lookup for an image that
   isn't in the Dockerfile at all.
2. *Backslash continuations.* `FROM --platform=linux/amd64 \` with the image on
   the next line is a common way to keep long lines readable. The checker read
   one physical line at a time. It reported an image called `\` and never
   looked at the real one, so a mutable tag on the second line could not be
   flagged.

Both scanners, the Python CLI and the browser page, now join continued lines
before matching, the way BuildKit does. They skip comment and blank lines
inside a continuation, report the line where the instruction starts, and store
stage names in lowercase. Failing tests came first in both suites (60 node
tests and 48 Python tests now pass).

**The numbers.** Before the fix, 17 of 24 seeded faults were caught (70.8%).
After it, 20 of 24 were (83.3%). The run found 2 real defects and patched both.
The run record in `prompts/runs/` holds every mutant, its triage and the
re-run result.

*This tool reads text you paste or point it at. It never pulls an image or
contacts a registry, and its output is a starting point, not a security
audit.*
