# Node Version Drift Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/node-version-drift-check/>

A free tool that finds **Node.js version drift inside a repo**: the places a
project declares which Node.js it wants (`engines.node` and `volta.node` in
`package.json`, `.nvmrc`, `.node-version`, `.tool-versions`, a Dockerfile's
`FROM node:<tag>`, and GitHub Actions `actions/setup-node`) and whether they
agree with each other.

**What it is not:** a version manager, an installer, or a registry lookup. It
never runs `node`, `npm`, `nvm` or `docker` and never makes a network call. It
compares what your own files already say.

After using this, you can now **see in one pass that your `.nvmrc`,
Dockerfile and CI workflow are running different Node.js majors, or one of
them is past end-of-life**, instead of finding out from a "works on my
machine" bug.

## What's checked

| Finding | Meaning |
|---|---|
| `pin-violates-engines` | A pinned version (`.nvmrc`, `.node-version`, `.tool-versions`, Dockerfile, `volta.node`, `setup-node`, matrix entries included) that no matching version can satisfy against `engines.node`. A partial pin such as `20` means "any 20.x", so it is flagged only if no 20.x fits |
| `major-disagreement` | Non-matrix pins in different files naming different majors (per package in a monorepo). A CI matrix is meant to test several majors, so it is exempt |
| `eol-node` | A pin or matrix entry whose major is past its end-of-life date in the embedded table (notice `eol-soon` within 90 days) |
| `engines-unbounded` | `engines.node` has no upper bound (for example `>=18`) and no file pins a Node.js version |

Notices that never fail `--fail-on-risk`: `unresolved-pin` (aliases such as
`lts/*`, `latest`, `node` and untagged `FROM node` are not guessed),
`engines-allows-eol` (the range's lower bound still admits an end-of-life
major) and `unreadable-input`.

The semver range parser is hand-written and supports `^`, `~`, `>=`, `>`,
`<=`, `<`, `=`, hyphen ranges, x-ranges, spaces as AND and `||`. Prerelease
and build tags are ignored.

### The end-of-life table

`engine.mjs` embeds a small table copied from
<https://nodejs.org/en/about/previous-releases> on **2026-10-11**: 18 ended
2025-04-30, 20 ended 2026-04-30, 22 ends 2027-04-30, 24 ends 2028-04-30; odd
majors are never long-term support and end about six months after release
(dates marked approximate). It is a snapshot. Every finding says "per the
table dated ...", a major newer than the table is reported as unknown rather
than supported, and `--today YYYY-MM-DD` fixes the date the verdict is judged
against so tests and CI runs are reproducible. Confirm anything that matters
on nodejs.org.

## Try it without installing anything

[`index.html`](index.html) computes everything in the browser from the text
you paste in. Nothing is uploaded.

## Quickstart (CLI)

Zero dependencies, Node.js 18+. No network call, ever.

```sh
node cli.mjs                       # scan the current directory
node cli.mjs /path/to/repo
node cli.mjs --format json
node cli.mjs --fail-on-risk        # exit 2 if any risk finding exists
node cli.mjs --today 2026-10-11    # judge end-of-life as of a fixed date
```

`cli.mjs` imports `engine.mjs`; keep the two files together. See
[the docs page](why-node-version-drift-happens.html) and
[the comparison with eyeballing and npm's engine-strict](vs-eyeballing-and-npm-engine-strict.html).

## Disclaimers

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not engineering advice, and it does not
replace running your tests on the Node.js version you actually deploy. The
end-of-life dates come from a static table and may be out of date. **You are
responsible for reviewing and verifying its output before relying on it.** To
the maximum extent permitted by law, the authors accept no liability for any
loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do not
use this as a system of record. If a tool needs to survive, run it yourself.

Node.js is a trademark of the OpenJS Foundation; Volta and nvm are the names of
independent projects. They are named only to describe which files are read.
Not affiliated with, endorsed by, or sponsored by any of them.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. Your data is never uploaded, and there are no
accounts, tracking cookies, or analytics vendor. The page counts anonymous
feature events (`versions_checked`, `example_loaded`) in `localStorage` only,
never transmitted and never tied to what you typed. Do Not Track and Global
Privacy Control are honoured and a button turns counting off. The CLI records
nothing.

## Development

```sh
node --test
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). Engine, CLI and page are
built and tested; no external user contact yet (see `kill_criteria`).
