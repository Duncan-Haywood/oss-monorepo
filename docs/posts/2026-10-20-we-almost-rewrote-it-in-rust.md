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

## A month later: half of CI was copying files

On 2026-11-25 a reading of 1,000 workflow runs came to 806 job-minutes.
**374 of them, 46%, were `git checkout`.** The repository now holds 51,000
files, and dozens of small product test workflows each copied all of them
to run a few seconds of tests in one directory. The median such job spent
43 seconds checking out and under 10 seconds on everything else.

The fix is two lines of configuration per workflow: a blob-less, sparse
checkout of that product's directory and `.github`. A configuration change
still has to give the same answers, and "the tests still pass" is a weaker
check than it sounds, because a test that skips itself when a file is
missing passes either way. So we wrote a small script that runs each
workflow's steps in a full tree and in a sparse one, and compares the exit
codes and the test counts: tests run, passed, skipped.

It earned its keep. Of 66 candidate workflows it rejected six: one product's
browser suite ran 2,328 tests instead of 2,332, another's site suite 41
instead of 48, and others reached into shared code outside their folder.
Those keep the full checkout. 44 matched test for test and now check out
only what they read: their median checkout went from 43 seconds to 2, and
the median job from about 50 seconds to 8. Sixteen more could not be checked in this container
and were left alone.

Notes and the ranked list of what is left:
[`docs/history/ci-perf-2026-11-25-venture-workflow-sparse.md`](/docs/history/ci-perf-2026-11-25-venture-workflow-sparse.md).

### The same trick, made slower

Encouraged, we tried it on the biggest validation job: 106 checks, a
198-second median, and a 43-second checkout. Tracing every file each check
opened showed none of them read the 22,000 research files, so we skipped
those (and later the audio files too). The checks gave the same answers in
both trees. The checkout took 49 seconds, then 44.

The reason is how a blob-less checkout gets its files. It downloads the
missing ones in one batch, and on GitHub's runners that batch costs about
0.7 ms per file no matter how large the files are. For the same 58,700
files, downloading 900 MB or 340 MB took the same time. A
plain checkout streams the whole pack for 80,700 files in about the same
43 seconds. So the trick pays when you keep a few thousand files, and costs
you when you keep most of them. One older job that keeps 99% of the tree
this way is about 5 seconds slower than doing nothing. We reverted the change and
wrote down the cost model:
[`docs/history/ci-perf-2026-11-25-validate-sparse.md`](/docs/history/ci-perf-2026-11-25-validate-sparse.md).

## Same day: the blog's search box downloaded 18 MB

The blog's search box searches whole posts, not just titles, so it fetches
a full-text index on the first keystroke. That index was every post's body
in full: 18.3 MB, or 6.7 MB compressed, at 7,749 posts. On a slow mobile
link (1.6 Mbit/s), a reader waited 40 seconds for the first result.

The search only asks one question: does a typed word appear somewhere in a
post? A typed word has no spaces, so it can only match inside a single word
of the post. That means each distinct word can be stored once for the whole
blog, with the list of posts it appears in. This is an inverted index, the
oldest trick in search engines. The file fell to 2.5 MB compressed, parsing
went from 121 ms to 17 ms, and the same throttled search now answers in 18
seconds.

The check that the answers did not change was a direct comparison. On the
real corpus, 21 search terms, from single letters to accented characters,
returned identical post sets from the old full-text file and from the new
index. A seeded test now keeps it that way. Notes:
[`docs/history/pages-build-perf-2026-11-25-writing-search-index.md`](/docs/history/pages-build-perf-2026-11-25-writing-search-index.md).

## Same day: a contractor's bid page loaded 119 trades to show a menu

The free bid page for contractors offers a takeoff for 119 trades, from
duct cleaning to window replacement. Every visitor downloaded every trade's
rates and line items at load, 28 kB compressed and 44% of the page, though a
first visit shows only a menu of trade names. The page now loads a 2.8 kB
list of names and fetches the rates the moment someone picks a trade (or
points at the menu, which usually hides the wait). On a throttled slow
connection, load fell from 811 ms to 645 ms. A browser script drove the old
and new pages through the same picks, edits and links, and every figure
matched. Notes:
[`docs/history/trade-bid-studio-page-perf-2026-11-25.md`](/docs/history/trade-bid-studio-page-perf-2026-11-25.md).

## Same day: the router's tests parsed the same YAML 5,933 times

The script that ranks this repository's products for the next agent session
reads about 1,400 small YAML files. Its tests run the whole ranking several
times, so they parsed those files 5,933 times. With the C YAML parser that was
7.5 of the suite's 8.3 seconds; with the pure-Python one most agent
containers have, the suite took 50 seconds. The parser now remembers each
file's result by its text, stored pickled so every caller still gets its own
fresh copy, and a sort over 10,000 file paths compares names instead of path
objects. The suite takes 17 seconds without the C parser and about 6 with it,
and the ranking's output is byte-identical. Notes:
[`docs/history/ci-perf-2026-11-25-router-yaml-memo.md`](/docs/history/ci-perf-2026-11-25-router-yaml-memo.md).

## 2026-11-26: a 25 MB part file built 3 million strings

The free [stock-size page](/ventures/machine-shop-guides/stock-size-from-step-file.html)
for job shops reads an STL mesh to suggest bar or plate stock. A 500,000-triangle
file, a normal size for a fine CAD export or a scan, took 5.4 s, and 3.5 s of
that was bookkeeping: a text key like `"12.5,0,3"` for every triangle corner,
another for every edge, then a lookup table keyed by those strings. The box
search then walked all 1.5 million corners of a mesh with 250,000 distinct
points. Matching vertices by their raw number bits in a small hash table, and
measuring each vertex once, brought it to 0.65 s (2 million triangles: 23 s to
3.3 s). Two agent runs got there in two steps the same morning: one measured
each vertex once, the other replaced the text keys. Old and new agreed on
6,798 comparisons, down to the sign of a zero.
Notes: [`docs/history/stock-size-stl-perf-2026-11-26.md`](/docs/history/stock-size-stl-perf-2026-11-26.md).

## Same day: a drawing's line art went through a regex per character

The free [drawing review page](/ventures/machine-shop-guides/drawing-review.html)
reads a part drawing's title block, revisions and notes from the PDF. A
drawing exported from CAD is mostly line art: hundreds of thousands of short
line segments, megabytes of numbers to step over to reach a few dozen lines of
text. The reader tested every character against a regular expression to find
the spaces between them, then ran another one on every word to see whether it
was a number. A 3.6 MB drawing took 630 ms on our build machine, which is a
couple of seconds on a phone. Comparing character codes against a 256-entry
table and reading each number in the same pass brought it to 318 ms, and the
plan takeoff tool, which keeps every segment, went from 1.28 s to 0.61 s. The
old tokenizer stays in the tests as the reference: same tokens and the same
floating-point values, down to the sign of a zero.
Notes: [`docs/history/drawing-review-perf-2026-11-26.md`](/docs/history/drawing-review-perf-2026-11-26.md).

## Same day: 299 checks ran for a change none of them could see

Every pull request here runs about 300 repository checks that have no
workflow step of their own. Half of the recent merges added only an agent's
notes file, and every one of those checks ran each time, twice. We ran every
check once under `strace` and recorded which folders it reads. Now a change
with no code in it runs only the checks that read a folder it touched: 100 of
302 for a new note, and 37 s instead of 81 s. Any doubt runs more, never less:
code changed, a check is new, or a check was edited since the trace. Tracing
also found two checks that ran nowhere at all, because a comment in a
workflow file mentioned their names.
Notes: [`docs/history/ci-perf-2026-11-26-unwired-reads-map.md`](/docs/history/ci-perf-2026-11-26-unwired-reads-map.md).

## Same day: a big P6 schedule counted its working days one at a time

The free [XER schedule check](/ventures/xer-schedule-check/) recomputes every
activity's dates and float from a Primavera P6 export. Asking "how many working
minutes between these two dates" walked the calendar a day at a time, and the
scheduler asks that for every activity and link, often across the whole job.
So the run grew with the square of the schedule: an invented 8,800-activity
schedule took 3.2 s, 17,600 activities took 12 s, almost all of it in that one
loop. Counting whole weeks at once and looking up the holidays in between by
binary search brought them to 0.48 s and 0.88 s. Every report, CSV and JSON
output is byte-identical to before, and a test holds the new count to the old
day walk on 12,000 random spans across four calendars, holidays included.
Notes: [`docs/history/xer-schedule-check-cpm-perf-2026-11-26.md`](/docs/history/xer-schedule-check-cpm-perf-2026-11-26.md).

## Same day: a drawing set was read twice, page by page

The free [PDF plan takeoff](/ventures/pdf-plan-takeoff/) reads every sheet of
a drawing set for its line work, so clicks snap to walls, and for its text,
to find the printed scale. It did that by reading each page's drawing
instructions twice, and on a real 19-sheet set that is 5 million numbers and
operators each time. Keeping the first reading in a few compact arrays, so
the second pass is a cheap walk, took a third off. Our first try saved
nothing: keeping a million small objects alive between passes just moved the
time into the garbage collector. Storing each point as two plain numbers
instead of a tiny array, and decoding the plain-text parts of the file with
the browser's built-in decoder, did the rest. That set now reads in 1.4 s in
the browser instead of 2.1 s, with every segment and text run identical.
Notes: [`docs/history/pdf-plan-takeoff-perf-2026-11-26.md`](/docs/history/pdf-plan-takeoff-perf-2026-11-26.md).

## Next day: a long note was tidied once per line

The free [drawing review](/ventures/machine-shop-guides/drawing-review.html)
reads a part drawing's numbered notes, and a note that wraps onto more lines
was glued together line by line, tidying the spacing of the *whole* note
again after every line. On a sheet dense with text the last note runs on for
thousands of pieces, so that tidying grew with the square of its length.
Gluing first and tidying once gives exactly the same text (spacing rules do
not care where the joins were), and a drawing with 4,000 extra labels now
reads in 18 ms instead of 45 ms, 16,000 in 66 ms instead of 158 ms, every
field identical. Notes:
[`docs/history/drawing-review-perf-2026-11-27-notes-cleaned-once.md`](/docs/history/drawing-review-perf-2026-11-27-notes-cleaned-once.md).

## Same day: a regular expression that tried every letter

Every venture pull request runs a lint that looks for a choice looked up in
an object by the user's own text (`MAP[input.key]`, where "constructor"
finds the object's prototype instead of nothing). It read 57 MB of tool code
with a pattern that began "a word boundary, then a capital letter", and
Python's regular-expression engine has no shortcut for that: it tried every
one of the 57 million positions. Starting the search from text that is
always there, the word `const` and each file's own map names found with a
plain string search, gives the same 413 findings in 0.18 s instead of 0.96 s,
and the whole command takes 0.73 s instead of 1.6. In the same job, the test
runner checked its child process on a fixed 0.2 s tick, so every suite
waited up to a fifth of a second after it had finished. Waiting on the
process itself took the runner's own unit tests from 17.0 s to 12.5 s.
Notes:
[`docs/history/ci-perf-2026-11-27-runner-poll-and-lookup-scan.md`](/docs/history/ci-perf-2026-11-27-runner-poll-and-lookup-scan.md).

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
