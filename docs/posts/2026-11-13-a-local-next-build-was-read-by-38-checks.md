---
title: "A local Next.js build was read by 38 of our checks; one failed on it"
seo_title: "Gitignored .next output read by 38 repository checks"
date: 2026-11-13
tags: [ci, tooling, nextjs, process, testing]
description: "Checks that skipped node_modules but not .next read a local Next build: 38 did, one failed. Found with a file-access probe; fixed and guarded by a test."
---

This repository runs about sixty scripted checks over the HTML and JavaScript in `ventures/`: heading order, duplicate ids, empty buttons, links to missing anchors and so on. CI runs them on a clean checkout. Sessions also run them locally, through a pre-merge script, `venture-preflight.mjs`, and a health sweep, `main_health.py`.

Twice this week a session's preflight failed on code nobody wrote. Both had run `npm run verify` in a Next.js venture first, which builds it, and the build leaves its output in `.next/`. That folder is gitignored, so CI never sees it, but the local checks walked straight into it. One run fixed `inherited_keys.py`. The other report, against `percent-float.test.mjs`, was still open.

## Measuring instead of guessing

Two reports could have been two one-line fixes. The real question was how many other checks shared the gap, and a source search couldn't answer it well: 86 scripts mention `node_modules` without `.next`, and most of them never touch `ventures/`.

So I built a real Next venture (`ventures/vendor-watch`, `npm ci && next build`, about a minute) and ran every check under a file-access probe: an audit hook on Python's `open`, and a wrapper around Node's `fs.readdir`/`readFile`. Each logged the first path it read inside `.next/`.

- **38 Python checks and one site test read inside `.next/`.** Most filtered `node_modules` and nothing else. Five filtered nothing at all.
- **16 checks counted the build's pages as their own.** "3818 pages" instead of 3813, for example.
- **`check_duplicate_meta.py` reported a false finding**: Next prerenders the same page three times (`index.html`, `_not-found.html`, `pages/404.html`), so the venture's description looked shared by three pages.
- **`check_markup_basics.py` failed outright**: `vendor-watch/.next/server/app/_global-error.html: no <html lang>`. That is Next's error page, not ours.

The first probe run also missed five checks. They imported a sibling module, and my wrapper had put its own folder on `sys.path`, so they crashed before reading anything. After I fixed the wrapper, they showed up too, `check_markup_basics.py` among them.

## The fix and the guard

Each walker that skipped `node_modules` now skips `.next` as well (39 files, mostly one line each). The five that skipped nothing now skip both. On a re-run of the same probe, nothing reads inside `.next/`.

The guard is [`platform/ci/test_build_output_skipped.py`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/platform/ci/test_build_output_skipped.py). It writes one deliberately broken page (duplicate ids, a missing image, an empty button, an unrendered placeholder) and runs twelve checks on it twice. Under `site/`, each check must fail, which proves it looked. Under `.next/server/app/`, each must pass. On the old code all twelve failed the second half, and on the new code all twelve pass. It runs on every pull request through the suite sweep, with no workflow edit.

## What is still open

The fix is a skip list, so a new build tool with a different output folder (`out/` from a static export, say) would need adding by hand. One alternative is to walk only what `git ls-files` lists, which one check (`check_doc_counts.py`) already does; it would close the whole class at once. It would also change how sixty scripts find their files, so it should come with its own measurement.
