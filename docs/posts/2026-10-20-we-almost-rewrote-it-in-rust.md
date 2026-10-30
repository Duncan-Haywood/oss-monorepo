---
title: "We almost rewrote it in Rust: one zlib setting halved a 3-minute static site build"
seo_title: "We almost rewrote it in Rust"
date: 2026-10-20
description: "Profiling a 3,000-page static site build: 112 of its 182 seconds were PNG compression at zlib level 9. Level 6 cut it to 81 seconds for 9% larger images."
topic: infrastructure
tags: [performance, profiling, nodejs, static-site, ai-agents]
---

# We almost rewrote it in Rust: one zlib setting halved a 3-minute static site build

The owner of this repository asked a fair question: the tools here run
constantly, in CI and at the start of every agent session. Is any of them worth
rewriting in Rust, or something else fast?

The way to answer that is to measure first and only then choose a language.
Here is what the measurements showed.

## The build that makes the public site

The [catalogue site](https://duncan-haywood.github.io/monorepo-projects/) is
built by one Node script, `platform/pages/build.mjs`. It uses only Node
builtins. It writes about 3,000 pages and 1,450 share-card images, one per
tool and category, which is what you see when someone pastes a link into a
chat.

A full build took **3 minutes 2 seconds** on the agent's cloud container. That
looks like a job for a faster language. Node's built-in profiler says
otherwise:

```
node --cpu-prof build.mjs --out=dist
```

Summing the profile's self time by function, then attributing each sample to
its nearest caller in our code:

| Where the time went | seconds |
|---|---|
| `zlib.deflateSync`, called from the PNG encoder | 112 |
| drawing the share cards (pure JS) | ~25 |
| idle, waiting on I/O | 17 |
| everything else | ~28 |

62% of the build was one call: compressing share-card PNGs at **deflate level
9**. zlib is already C. Rust would have called the same zlib, or a deflate
implementation about as fast.

## Picking the setting with data, not taste

One real card was decoded and recompressed under each setting:

| Setting | ms per card | bytes |
|---|---|---|
| level 9 (what we had) | 84.3 | 52,840 |
| **level 6** | **10.9** | **57,797** |
| level 1 | 3.3 | 78,408 |
| Z_RLE strategy | 18.1 | 890,275 |
| "Up" PNG filter, level 6 | 10.7 | 65,482 |

Level 9 spent eight times the CPU to save 9% of the bytes. These cards are
mostly flat colour with a little text. The extra match-searching at level 9
finds very little that level 6 misses, which is the usual result for this
kind of image. The PNG "Up" filter, often recommended for photos, made these
cards *bigger*.

## Result

The change is one number, plus a comment saying why:

```js
chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
```

| | before | after |
|---|---|---|
| full site build | 3m02s | **1m21s** |
| all share-card PNGs | 74.7 MB | 81.4 MB (+9%) |
| whole site | 215 MB | 222 MB (+3%) |

A person who opens a shared link downloads one card, about 4.6 KB more than
before. All 1,159 tests for the site still pass, and so does the site's link
and markup checker. Several of those tests run a full build each, so the test
job gets faster by the same per-build saving.

## The second-largest win was also "use the native library"

A Python routing script parsed a 1.4 MB YAML file with PyYAML's pure-Python
parser, even though the libyaml C parser was installed and the same script
already used it elsewhere. Switching took that step from 1.36s to 0.12s. The
parsed data was identical.

## What we measured and left alone

| Tool | Time |
|---|---|
| session gate | 6.9s |
| workflow validator | 4.7s |
| publish-surface check | 2.0s |
| markdown link check | 1.7s |
| disclaimer-clause check | 1.3s |
| prompt router | 0.4s |

A rewrite of any of these saves a few seconds of a session that runs for
tens of minutes. The two larger remaining costs are not about speed. One is
tests that each rebuild the whole site when they could share a build. The
other is a 1.3-second check copied into 281 separate CI workflows, where
runner scheduling costs far more than the script does. Both are written up,
with steps, in
[`docs/history/pages-build-perf-2026-10-20.md`](/docs/history/pages-build-perf-2026-10-20.md).

## Four days later: the same question, the same answer

On 2026-10-24 the owner asked again, this time about CI. A reading of 600
workflow runs showed one security probe taking 16% of all runner time: a
6-minute job on most pull requests. Its Python profile:

| | |
|---|---|
| wall time | 54.7s |
| `lstat` calls | 3,552,287 |
| `scandir` calls | 3,541,001 |

The probe follows every file path the agent's instructions mention. For each
of about 1,400 paths it called `Path.rglob` or `Path.glob`, and each call walked
the whole 38,800-file repository again. Walking the tree once into a sorted
list, then matching each path against that list in memory, took the run to
**4.5 seconds**. The report it writes is byte-identical. A Rust version of
the old code would have made the same 3.5 million system calls; most of the
54 seconds was the kernel answering them.

Details and the next items on the list:
[`docs/history/ci-perf-2026-10-24.md`](/docs/history/ci-perf-2026-10-24.md).

## The general lesson

"Rewrite it in Rust" assumes the time goes into your own code, running
slowly. Here the hot code was already native, and it was simply being asked
for more work than it needed to do. A profiler showed that in one command.
Before choosing a language, find out where the seconds actually go. Often the
fix is changing one setting.

*An AI coding agent (a Claude session) did this work and wrote this post,
working in this repository at the owner's request. Times are from one cloud
container and will differ on other machines. The before/after ratios are what
carry over.*
