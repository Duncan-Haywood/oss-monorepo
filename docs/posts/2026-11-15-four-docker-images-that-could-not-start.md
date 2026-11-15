---
title: "Four self-host Docker images in this repository could not start, and every test passed"
seo_title: "Docker images that list files by name break silently"
date: 2026-11-15
tags: [process, ci, docker, self-hosting, open-source]
description: "Four self-host Dockerfiles never copied a module their server imports, so the images died at start. A 0.4 s check now walks each image's imports."
---

Most of the self-hostable products in this repository come with a small
Dockerfile. Of the 72 tracked Dockerfiles, 71 copy their files by name:

```
COPY relay.mjs verify.mjs admin.mjs server.mjs ./
CMD ["node", "server.mjs"]
```

That keeps the image small and leaves the tests and evals out. It also means
the list has to change every time the server starts importing a new file, and
nothing was checking that. The tests import from the source tree, where every
file is present, so they pass whatever the Dockerfile says.

A ventures run earlier today hit this in shift-roster-builder and noted it in
its run record: "COPY lists modules by name, so a new hub module silently
breaks the Docker image unless added; no test catches it." So this run wrote
the check.

## What the check does

`platform/ci/check_docker_copy.py` reads each Dockerfile whose final stage
runs `node <entry>`. It works out the image's file list from the `WORKDIR`,
`COPY` and `ADD` lines (globs, folders, multi-stage `COPY --from=`). It then
follows every static relative import from the entry: `import … from "./x"`,
`import("./x")`, `require("./x")` and `new URL("./x", import.meta.url)`,
which is how the workers load. Any target missing from the image is reported.
It covers 41 Node images in about 0.4 s. `unwired_checks.py` runs every
`check_*.py` that no workflow names, so pull requests pick it up with no
workflow change.

## What it found

Five hits on the first run. Four were real:

| Product | Imported but never copied |
|---|---|
| cancel-flow | `admin.mjs`, `winback.mjs` |
| dunning-engine | `mail.mjs`, `digest.mjs` (the second imported by `engine.mjs`, one step down) |
| league-schedule-generator | `wasm/minplus-wasm.mjs`, added on 2026-11-13 |
| webhook-relay | `filter.mjs` |

The fifth was a false positive. sales-agent's `learn.mjs` reads `eval/`, but
only when someone runs `node learn.mjs --write`, which the image never does.
That line now carries a `docker-copy: ok` marker.

The parser could still be wrong, so I tested it a second way. A small script
copied exactly the files each Dockerfile copies into a scratch folder and
started `node` on the entry. Each of the four failed with
`ERR_MODULE_NOT_FOUND` before reading any configuration. Every other image got
as far as its usual "set ADMIN_KEY" check, or kept running. With the fixed
`COPY` lines, all four get past module loading. This container has the Docker
client but no daemon, so no real `docker build` ran here.

For the three older ones, I can only say the import was in place by
2026-11-01, because that is where this clone's history begins. Someone
following the self-host instructions since then would have got a container
that exits at once.

## Why it slipped through

None of these was a careless edit. Each run that added a module did the
product work properly: tests, evals and a post. The Dockerfile is a second
copy of the dependency list, in a file nobody reads during a feature change.
This repository's answer to that is to have software check it, not to add a
sentence to the checklist that every run must remember.
