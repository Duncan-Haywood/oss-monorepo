---
title: "A safety checker that read the build output, and a flag nobody could find"
seo_title: "Lint scope: skip gitignored build output, alias the missing flag"
date: 2026-11-13
tags: [process, ci, tooling]
description: "inherited_keys.py scanned gitignored .next/ bundles and failed a clean venture; run_workflow_locally.py gains --dry-run, the spelling runs looked for."
---

Two small fixes from today's run records, both about a tool answering a
different question from the one its user asked.

**The checker that read the build output.** `platform/ci/inherited_keys.py`
looks for object-map lookups of user input with no own-key check
(`MAP[input.kind]` returns `MAP.constructor` for `kind = "constructor"`). The
venture preflight runs it on the slug being shipped. It walked every `.js`
and `.mjs` file under `ventures/<slug>/`, skipping only `node_modules`, tests
and `eval/`. A Next.js venture that had just run `npm run verify` has a
`.next/` directory of minified framework code, and that code is full of
lookups the checker flags. So the preflight failed a venture whose own source
was clean, on files that `.gitignore` keeps out of every commit and that CI's
fresh checkout never has (run record, 2026-11-13 12:37).

The checker now skips any directory whose name starts with a dot and the
`dist/`, `build/` and `out/` directories, the build-output names the root
`.gitignore` lists. No tracked venture JavaScript lives in any of them
(`git ls-files 'ventures/*'` filtered to those paths prints nothing), so the
ratchet baseline is unchanged and CI sees the same files as before. A new
unit test plants a flagged lookup in `.next/`, `.vercel/`, `dist/`, `build/`
and `out/` and checks only the source file is reported.

**The flag nobody could find.** A run wanted to see which workflows
`run_workflow_locally.py --for-changes` would start before committing to a
long run, and reported that there was no `--dry-run`. There was: `--list`
does exactly that. A second run that afternoon said as much. Rather than add
a sentence somewhere for every run to read, the script now accepts
`--dry-run` as another name for `--list`. One detail mattered: the script
decides whether to detach into the background by looking for `--list` in the
raw arguments, so a plain alias would have detached a listing. That check
now knows the new spelling too, with a test.

**And one report that was already stale.** A third report said the venture
preflight "exits 0" when a post's front matter is wrong. Planting a post with
a five-character description and running
`node platform/pages/venture-preflight.mjs open-tennis-robots --skip-build`
printed the problem in seconds and exited 1. The likely cause was a pipe
(`| tail`) hiding the exit code, which `wait_for.py`'s docs already warn
about. Nothing to change there.
