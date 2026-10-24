---
title: "The site was not slow to build. It was slow to ship."
date: 2026-10-24
description: "Merges took a median 48 minutes to reach this site. The build was 7 of them. What the rest was, and why a faster language or WASM would not have helped."
tags: [engineering, ci, performance, github-pages]
---

The owner asked whether this site should move to another framework, another
language, or WebAssembly, so it would build faster and run faster. They had
heard the build took two hours.

It didn't, and it did. One run of the Pages workflow took 12 to 16 minutes, and
about 7 of those were between a merge and the live site. But on 2026-10-24 only
6 of the last 100 runs on `main` deployed anything. 64 failed and 29 were
cancelled while queued behind them. Counted from each merge to the next
successful deploy, the median was **48 minutes and the worst was 169**. So
"two hours" was a fair report of what a person saw.

## What failed

60 of the 64 failures were the same step, "Build the site", and the same kind
of error: one blog post's `description` was over the 160-character limit, and
`loadPosts` throws on a malformed post. That rule exists for a good reason (a
search result shows about 160 characters). But it meant one bad file stopped
every page on the site from updating until someone noticed and fixed it, and
posts land several times an hour.

Pull requests still fail on a bad post. A deploy now leaves that one post out
and puts a warning on the run, and the `test` job still goes red on `main`.

## Where the 7 minutes went

On a run that passed, the build job's steps took:

| Step | Seconds |
|---|---|
| Checkout (3,000 commits of history) | 97 |
| Development dashboard (GitHub API) | 103 |
| `build.mjs` | 96 |
| `check.mjs` | 59 |
| Upload and deploy | 60 |

A CPU profile of `build.mjs` showed only about 7 seconds of JavaScript doing
real work. A faster language could shave seconds off that 7, and WASM speeds up
code in a visitor's browser, where these pages run almost none. The pages are
already plain static HTML: the median page is 14.5 KB.

A timer on each phase found the rest:

- **Drawing share cards: about 55 s.** Every page has a 1200×630 PNG for link
  previews, about 2,700 in all, rasterised in JavaScript on every deploy, and
  nearly all of them identical to the last deploy's.
- **One file at a time: about 25 s.** The chrome, share-tag and offline passes
  each read and rewrote 4,400 pages in sequence, waiting on the disk between
  each.
- **Moving bytes that had not changed.** 424 MB of the 776 MB artifact was 78
  MP3 files, copied, hashed, uploaded and deployed again on every merge.
- **Waiting in line.** The dashboard's 103 seconds of GitHub API calls ran
  after the build, though they need nothing from it.

## What changed

- Share cards are cached between runs, keyed by their text and a hash of the
  renderer and fonts. A cached card is the same bytes a fresh draw would make:
  a cold build and a warm build of the whole site came out byte-identical.
- The three per-page passes run 16 to 32 at a time.
- The MP3s stay in git. The build links each one to jsDelivr, pinned to the
  last commit that changed it, and leaves it out of the artifact. jsDelivr
  serves `audio/mpeg` with byte ranges and a one-year cache, and because the
  URL only changes when the file does, podcast apps don't re-download.
- The dashboard's API calls run in the background while the site builds.

The same build on the same machine went from **110 s to 50 s** with a warm card
cache, and the artifact from 776 MB to 371 MB. The first runs on `main` will
say what the hosted runner makes of it.

One idea didn't survive measurement. The checkout downloads 3,000 commits with
every old version of every file, 5.2 GB, and a "blob-less" clone of the same
history took 59 seconds instead of 264. But one page, the daily engineering
brief, counts changed lines over two weeks, and git then fetched those files
back commit by commit, more slowly than the full clone. Most of them were
compressed files from an old mirror that was deleted on 19 October. That clone
stays as it was until that churn leaves the two-week window.

The lesson is an old one and still true. Before choosing a faster tool, find
out what the slow one is waiting for. Here it was waiting on one bad file, on
the network, and on redoing work it had already done, never on the language.
