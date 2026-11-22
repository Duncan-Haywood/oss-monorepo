---
title: "Three Dockerfile checkers read the inside of a heredoc as instructions"
seo_title: "Dockerfile heredocs fooled 3 line-by-line checkers (fixed + lint)"
date: 2026-11-22
tags: [redteam, testing, mutation-testing, docker, dockerfile, buildkit, docker-base-image-pin-check, docker-cache-order-check, node-version-drift-check]
description: "RUN <<EOF heredocs broke three Dockerfile tools: a nested FROM read as the outer base image, an npm ci never seen. All fixed, plus a lint."
---

BuildKit's Dockerfile syntax has let `RUN`, `COPY` and `ADD` take a heredoc
since version 1.4, and it is the default frontend now:

```dockerfile
FROM node:20
WORKDIR /app
COPY . .
RUN <<EOF
set -e
npm ci
EOF
```

Everything between `<<EOF` and the line that reads `EOF` is the heredoc's
body: the script a `RUN` runs, or the content of the file a `COPY` writes.
None of it is a Dockerfile instruction. Three of the small Dockerfile
checkers in this repository read those lines one by one, the way they read
every other line, and treated them as instructions.

## What each tool got wrong

| Tool | Input | Before | After |
|---|---|---|---|
| docker-base-image-pin-check (page and CLI) | `COPY <<EOF /srv/Dockerfile` writing `FROM alpine:latest` | reported `alpine:latest` as a mutable base image of this file | no finding: that `FROM` belongs to another file |
| docker-cache-order-check | `COPY . .` then the `RUN <<EOF` above | clean: the `RUN` read as `<<EOF`, the `npm ci` line read as an instruction called `NPM` | flagged, the same as `RUN npm ci` on one line |
| node-version-drift-check | a `FROM node:16` inside `COPY <<EOF`, with `.nvmrc` at 22 | a major-version disagreement: Node 16 in the Dockerfile, 22 in `.nvmrc` | no disagreement |

The second row matters most. A checker that says "clean" when it never read
the install step gives false reassurance. The first and third are false alarms,
which cost less, but they teach people to ignore the tool.

All three now read heredocs the way BuildKit does. A word of a `RUN`, `COPY`
or `ADD` shaped `<<NAME`, `<<-NAME`, `<<"NAME"` or `2<<NAME` opens a heredoc,
and the body runs to a line equal to `NAME` (leading tabs ignored for `<<-`).
One instruction can open several heredocs, and they close in order. A shell
shift such as `$((1<<2))` or a here-string `<<<` opens nothing. The cache-order
check also keeps a `RUN` heredoc's body as that `RUN`'s command, so an install
inside it counts.

## The seeded faults

The run started as an ordinary mutation campaign. `prompts/redteam.py` seeded
10 faults into the pin checker's `classify.mjs` and 8 into
subscription-price-impact's `calc.mjs`. The suites caught 15 of 18. One
escape cannot change any output: `at !== -2` in place of `at !== -1` still
fails on an empty digest. The other two were real gaps, each now covered by a
test:

- a sha512 digest of exactly 128 hex characters was never tested, so making
  the required length 129 went unnoticed;
- a `FROM` line whose `\` continuation runs off the end of the file was never
  tested, so dropping that last instruction went unnoticed.

The catch rate was 15 of 17 behaviour-changing faults (88%) before and 17 of
17 after. The heredoc bug came from reading the code, not from the
campaign.

## The guard

`platform/ci/check_dockerfile_heredoc.py` sits beside this morning's
`# escape=` lint. It flags any source file under `ventures/` that mentions
Dockerfiles and joins backslash continuations but never mentions heredocs.
On its first run it found the third tool, node-version-drift-check, which this
post would otherwise have missed. Its `test_repository_is_clean` runs in CI
through `unwired_checks.py`, so the next Dockerfile scanner someone adds has to
say how it reads a heredoc.

The heuristic has a blind spot. A joiner that tests `endsWith(escape)`
through a variable, as the pin checker does, does not match the
continuation pattern, so the lint never looks at it. The pin checker is fixed
and tested here, but a new tool written that way would get past the lint.

One sibling was left as it is on purpose. docker-build-secrets-check also
reads heredoc lines, and a literal `GITHUB_TOKEN=ghp_...` inside a `RUN`
heredoc is still baked into a layer. A secret scanner is right to report it.
