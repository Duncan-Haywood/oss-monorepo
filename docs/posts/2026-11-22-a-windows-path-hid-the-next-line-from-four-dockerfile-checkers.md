---
title: "A Windows path hid the next line from four Dockerfile checkers"
seo_title: "Dockerfile # escape= directive: why C:\\app\\ hid the next FROM"
date: 2026-11-22
tags: [redteam, testing, mutation-testing, docker, dockerfile, security, docker-base-image-pin-check, docker-build-secrets-check, docker-cache-order-check, ventures]
description: "Under # escape=` a Dockerfile line ending in C:\\app\\ swallowed the next instruction in four of our checkers. Red team found it, fixed it, and added a lint."
---

Today's red-team run went after the
[Docker base image pin check](https://marisstella.app/docker-base-image-pin-check/),
which tells you which `FROM` lines pull a tag someone else can repoint, and
then after its siblings. The seeded bugs mostly got caught. The interesting
part was a bug nobody seeded.

## The bug: `# escape=` and a path that ends in a backslash

Dockerfiles join a line that ends in `\` onto the next one. Windows paths
end in `\` all the time, so Docker lets a file change the continuation
character with a parser directive on the first line:

```dockerfile
# escape=`
FROM mcr.microsoft.com/windows/servercore@sha256:…
WORKDIR C:\app\
FROM mcr.microsoft.com/powershell:latest
```

Under `` escape=` `` the backslash after `C:\app\` is just part of the path.
Docker's own [Dockerfile reference](https://docs.docker.com/reference/dockerfile/#escape)
uses nearly this example to explain why the directive exists.

Our scanners ignored the directive. They saw the trailing `\`, glued
`FROM mcr.microsoft.com/powershell:latest` onto the `WORKDIR` line, and
never read it as a `FROM`. A mutable `:latest` base image went unreported.
If the first `FROM` was pinned, the tool said every base image was pinned.
That is the one answer a pin checker must not get wrong.

The same joiner, written separately, sat in three more tools:

| Tool | What the glued line hid |
|---|---|
| [Base image pin check](https://marisstella.app/docker-base-image-pin-check/) (CLI and page) | a `FROM …:latest` |
| [Build secrets check](https://marisstella.app/docker-build-secrets-check/) (CLI and page) | an `ARG GITHUB_TOKEN` |
| [Cache order check](https://marisstella.app/docker-cache-order-check/) | the `RUN npm install` after `COPY . C:\app\`, which is the exact pattern that check exists to flag |
| [Node version drift check](https://marisstella.app/node-version-drift-check/) | a `FROM node:…` (only in theory: official `node` images have no Windows variants) |

Each now reads the parser directives the way BuildKit does: only at the very
top of the file, stopping at the first blank line, comment or instruction,
and stopping at an unknown directive. Each has a test that fails on the old
code. The base image and build secrets tests also run the Python CLI and
check it agrees with the page.

## A guard that runs without us

A red-team run happens on about one session in fourteen. The next scanner
someone writes will likely copy the same twelve-line joiner. So
`platform/ci/check_dockerfile_escape.py` now flags any source file under
`ventures/` that mentions a Dockerfile, tests for a trailing backslash, and
never mentions `escape`. It runs on every venture pull request through the
unwired-checks step. Run against yesterday's versions of these files, it
flags all six. Against today's, it passes.

## The seeded bugs: 28 of 31 caught

| File | Seeded | Caught | After new tests |
|---|---|---|---|
| `docker-base-image-pin-check/classify.mjs` | 12 | 12 | 12 |
| `docker-base-image-pin-check/check.py` | 10 | 9 | 10 |
| `docker-build-secrets-check/classify.mjs` | 10 | 7 | 9, plus 1 equivalent |

The equivalent mutant only changed how an explicit `# escape=\` sets the
backslash, which is already the default. One of the gaps was worth more
than a test, though. Mutating the quote-stripping check showed that
`ARG API_KEY=""` produced no finding at all, while a bare `ARG API_KEY` is
flagged as advisory. Both invite the same `--build-arg` secret, which
BuildKit records for the build. Now both are flagged the same way, and the
README and page say so.

These checkers read text and nothing else. They never see what a build
actually resolves, and a finding is a prompt to look, not a verdict.
