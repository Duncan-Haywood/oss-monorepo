---
title: "A .dockerignore is not a .gitignore: five lines that do something else in Docker"
seo_title: ".dockerignore traps checked against BuildKit's code"
date: 2026-11-23
tags: [explore, dockerignore-explainer, docker, buildkit, developer-tools]
description: "*.log misses logs/app.log and !docs re-includes nothing. A port of BuildKit's context filter, checked against its Go code on 30,000 random trees."
---

Most `.dockerignore` files begin as a copy of the project's `.gitignore`. The two
look the same but are read by different code. That code decides what `docker build` sends to
the builder, and so what `COPY . .` can bake into an image.

The new [.dockerignore explainer](../../ventures/dockerignore-explainer/) answers,
for every path in a build context, whether BuildKit sends it and which line decided.
I wanted those answers to be BuildKit's, not mine. So the engine is a line-by-line JavaScript port of the
two pieces of Go that do the work:

- `moby/patternmatcher` v0.6.1 reads the file and matches the patterns;
- `tonistiigi/fsutil` walks the context and skips folders.

A small Go program in the venture (`oracle/main.go`) runs the real code over real temporary
directories. A seeded generator makes trees and patterns aimed at the corners, and the test
suite replays 5,000 recorded cases on every run: 2,980 of them exclude something and 392 make
BuildKit refuse the file. Before the fixture was recorded, 25,000 more cases on other seeds ran
with no disagreements. The licences of the translated code are kept in the venture's
`THIRD_PARTY_NOTICES.md`.

## What the real code does

Each of these was run through BuildKit's code, not reasoned out:

| `.dockerignore` | Files | Sent |
| --- | --- | --- |
| `*.log` | `a.log`, `logs/b.log` | `logs/b.log` |
| `**/*.md` then `!docs` | `docs/README.md`, `docs/a.txt`, `x.md` | `docs/a.txt` only |
| `**/*.md` then `!docs/**` | same | `docs/README.md`, `docs/a.txt` |
| `[!a]` | `a`, `b`, `!` | `b` |
| `a[^x]b` | `a/b/c` | nothing |
| `  # not a comment` | a file named `# not a comment` | not sent |
| `node_modules # deps` | `node_modules/x` | `node_modules/x` |

Three of these surprised me.

**Patterns start at the root.** Git matches a slash-free pattern at any depth; Docker
matches every pattern against the whole path. `*.log` therefore keeps out only the top-level logs.
`node_modules` likewise misses `packages/web/node_modules` in a monorepo.

**`!docs` does nothing here.** For each line, the matcher remembers whether that line matched a
parent folder. An exception line is checked at a folder only while that folder is excluded.
`docs` was never excluded, so `!docs` was skipped there. Then `**/*.md` matched
`docs/README.md` directly and nothing undid it. `!docs/**` matches the files themselves
and works. The reverse, `*` then `!src`, does send all of `src/`, because `src`
was excluded first.

**Patterns become regular expressions.** `[` and `]` go through to Go's `regexp` untouched.
So `[^x]` matches a slash, a backslash before most letters is an error that fails every build,
and `[!a]` means "`!` or `a`". The port has a translator from the Go regexp text to a JS one,
following RE2 where the two disagree: ASCII-only `\d`, `[:alpha:]`, and a leading `]` in a class.

## What the tool does with that

Given the Dockerfile too, it checks every `COPY`, `ADD` and `RUN --mount=type=bind` source
against what is sent. An excluded source is the usual cause of a COPY that fails with
`not found` while the file is right there. It also reports:

- `.env` files, keys and credentials still sent, rated high when a `COPY` in the Dockerfile
  takes them into a layer;
- `.git` and `node_modules` still sent, with their sizes;
- lines that do nothing.

It then writes a corrected file and runs the engine again over the same list. On the page's
example, the fix makes 12 paths come out as intended and changes no other path.

It runs in the browser: you can pick a folder, and only names and sizes are read. A CLI with no
dependencies runs over a real context: `node ventures/dockerignore-explainer/cli/check.mjs .`
(`--strict` for CI, `--fixed` to print the corrected file).

## Limits

It models BuildKit, the default builder since Docker Engine 23, and not the legacy builder. It
spots secrets by file name, never by content. A COPY wildcard is matched the way Go's
`filepath.Match` does it. If you find a path where its answer and your `docker build` disagree,
that is a bug in the port: the README says how to add the case to the fixture.
