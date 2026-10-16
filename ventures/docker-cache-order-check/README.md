# Docker Cache Order Check

A free tool that scans a Dockerfile's instruction order for three documented
Docker build-cache-invalidation mistakes: a dependency manifest copied and
installed **after** a whole-build-context `COPY . .` already ran, an install
command with **no isolated manifest copy** at all, and an `apt-get update`
run **without install** in the same layer.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/docker-cache-order-check/

**What it is not:** a Dockerfile linter that checks individual instructions
against a rule (that is `docker-base-image-pin-check` and
`docker-build-secrets-check`, this portfolio's other two Dockerfile
checkers — both about security, not cache performance), a build tool, or
anything that runs `docker build`. It never contacts a registry and never
pulls or builds an image.

After using this, you can now **catch a Dockerfile that will silently
reinstall dependencies on every single build** before it merges, instead of
noticing it from a slow CI pipeline months later.

## Why this exists

Docker builds an image layer by layer, one per instruction, and caches each
layer keyed on that instruction and everything that fed it — the moment one
layer's cache key changes, every layer after it re-runs from scratch. Three
separate, well-documented ways to break that chain earlier than necessary:

1. `COPY . .` before installing dependencies — Docker's own "Leverage build
   cache" documentation gives the canonical fix (copy the manifest, install,
   *then* copy the rest of the source), and getting the order backwards is a
   long-documented developer pain point ("docker build always reinstalling
   npm packages", recurring on Stack Overflow and r/docker).
2. An install with no isolated manifest copy at all — reordering existing
   lines does not fix this; the manifest needs its own `COPY`.
3. `apt-get update` split from `apt-get install` across two `RUN`
   instructions — Docker's own Dockerfile best practices documentation names
   this exact split directly, because a cached, stale `update` layer can
   leave a later, separately-cached `install` layer resolving against a
   package index that no longer matches the registry.

`docker-cache-order-check` is a new object for this portfolio's deterministic
checker family: it reasons about the *relative order* of instructions across
a Dockerfile, not about any one instruction in isolation, which is a
different job than `docker-base-image-pin-check` (a `FROM` line's pinning)
and `docker-build-secrets-check` (a leaked secret).

## Try it without installing anything

[`index.html`](index.html) computes everything entirely in the browser from
the Dockerfile text you paste in. Nothing you type is uploaded.

## Quickstart (CLI)

Zero dependencies, one file, Node 18+. No network call, ever.

```sh
node cli.mjs                       # scan every Dockerfile under .
node cli.mjs /path/to/repo         # scan a specific checkout
node cli.mjs --format json
node cli.mjs --fail-on-risk        # exit 2 if any finding exists
```

More, including wiring this into CI and this tool's own named limitations:
[the docs page](why-docker-build-cache-gets-busted.html).

## What's checked

| Check | Source |
|---|---|
| Manifest copy/install after a broad copy | A dependency manifest (npm/yarn/pnpm, pip, Go modules, Bundler, Composer, Cargo) is copied and installed, but only after a whole-build-context `COPY . .` already ran earlier in the same build stage |
| Install with no isolated manifest copy | An install command runs with no earlier instruction naming its manifest file specifically — only a broad copy ever reaches it |
| apt update/install split | A `RUN` instruction runs `apt-get update`/`apt update` without also running `install`/`upgrade`/`dist-upgrade` in that same instruction |

Each build stage (every section between `FROM` lines) is checked
independently, and `COPY --from=<stage>` is never treated as a broad context
copy, since it copies another stage's output rather than your source tree.

## Disclaimers

This tool reports whether a Dockerfile's instruction order matches one of
three documented cache-busting patterns — nothing more. It does not know
whether a flagged pattern was deliberate in your case (some multi-stage
builds intentionally copy broadly in a stage that is never cache-sensitive),
and it does not measure your actual build's cache hit rate. Verify against a
real build before relying on it.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`dockerfile_checked`,
`example_loaded`) in `localStorage` only — never transmitted, never tied to
the Dockerfile text you typed. Do Not Track and Global Privacy Control are
honoured, and a button on the page turns it off entirely. The CLI records
nothing and makes no network call.

## Development

```sh
node --test engine.test.mjs cli.test.mjs page.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The engine, CLI, and
browser page are built and tested; no external user contact has happened
yet — that is the next, non-code step (see `kill_criteria` in
`VENTURE.yaml`).
