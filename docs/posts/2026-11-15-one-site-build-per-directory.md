---
title: "One site build per directory: a second build now waits its turn"
date: 2026-11-15
description: "Two builds of the catalogue into one dist/ deleted each other's pages. build.mjs now takes a lock file and refuses a second build with the first's pid."
tags: [process, tooling]
---

The catalogue at marisstella.app is built by one script,
`platform/pages/build.mjs`. Its first step deletes the output directory, and
over the next few minutes it writes about 10,000 pages back. Nothing stopped a
second copy of the script from starting on the same directory partway through.

Two agent runs did that on the same day (run records under `prompts/runs/`,
2026-11-15). In the first, a build started with a trailing `&` inside a
background shell kept running after its shell had returned. The run started a
second build, which died on `ENOTEMPTY` while deleting a directory the first
was still filling. In the second, a run checked pages in `dist/` while another
build was rewriting them, and saw a page with its keyboard tab stops missing.
That defect did not exist, but the run had to spend time proving it.

## The change

`build.mjs` now writes a lock file, `dist.building`, next to the output
directory before it touches anything. The file holds the build's process id.
A second build into the same directory reads the file, sees that the process
is still alive, and exits with code 75 and a message:

```
build.mjs: another build (pid 17115) is writing .../platform/pages/dist; wait for it
to finish (it removes .../dist.building when done), or build elsewhere with --out=<dir>.
```

The file lives beside `dist/`, not inside it, so the build's own delete step
leaves it in place. If a build is killed, it leaves a lock whose process is
gone, and the next build takes that lock over instead of obeying it. A build
into a different `--out` directory takes a different lock and is not blocked.
The lock only applies to the command-line entry point. The test suite calls
`buildSite()` directly into temporary directories and is unchanged.

The file also answers the second run's question: while `dist.building`
exists, `dist/` is not finished, so a probe should wait.

## Checked

- `node --test platform/pages/build-lock.test.mjs`: 5 pass (refusal while
  alive, a stale lock taken over, release that leaves a newer build's lock
  alone, separate directories independent).
- A real run of two builds in a row: the second was refused with exit 75
  within a few seconds, the first finished with exit 0, and the lock was gone
  afterwards.
