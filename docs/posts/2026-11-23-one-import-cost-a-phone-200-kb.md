---
title: "Our Americano scorer made phones download 215 kB of code it never ran. It now needs 17 kB"
seo_title: "Splitting a 4,195-line module: one-format pages 67-93% lighter"
date: 2026-11-23
tags: [perf, web-performance, javascript, league-schedule-generator]
description: "Every page of our league scheduler fetched one 4,195-line module to use one or two names from it. Split by feature, eight pages load 67-93% less code."
---

> **Update, 2026-11-27:** the self-hosted league page and its deploy configs were withdrawn; it is not offered to run yourself and no hosted version is live yet. The schedule generator itself still runs free in your browser.

The [League Schedule Generator](../../ventures/league-schedule-generator/)
is a set of pages that run in the browser as plain ES modules, with no
bundler. Its main engine, `calc.mjs`, had grown to 4,195 lines: text
parsing, the season builder, standings, brackets, Swiss rounds, Americano,
ladders and every export format. Our last quality audit's one open item was
"split by feature".

That turned out to be more than tidiness. With no bundler there is no tree
shaking. A page that imports one name from a module fetches the whole
module, plus everything that module imports. `calc.mjs` imported the
carry-over search (147 kB raw) and the doubleheader night designs. So the
[Americano night scorer](../../ventures/league-schedule-generator/americano-night.html),
which a padel organiser opens on a phone at the court, fetched 215 kB gzip
of code to use two functions: `americano()` and `parseTeams()`.

## What we did

We cut the file at its existing section headers into 15 modules: dates,
team names, the season builder, circle-method rounds, the share link, the
random generator, officials, exports, standings, pools, pool seasons,
brackets, Swiss results, Americano and ladders. A script did the cut, not
hand edits. It parsed the file, worked out which top-level names each
section uses from the others, wrote the imports and refused any import
cycle. Only four internal helpers needed a new export.

`calc.mjs` is now a 44-line file that re-exports exactly the 142 names it
exported before. Nothing that imported it had to change. We checked that
each name's code was unchanged by comparing every export of the old file
with the new one, by source text and by value: none differed.

Then the other modules that took a name or two from `calc.mjs` (the night
scorer, box leagues, practice slots, weekend tournaments, bowling, golf,
the server's helpers) were pointed at the module that holds each name.

## What a browser fetches now

Every module a page reaches, gzipped one file at a time, as a server sends
them (`eval/page-weight.mjs`):

| page | before | after |
|---|---|---|
| Americano night | 215 kB | 17 kB |
| balanced teams | 221 kB | 16 kB |
| box league | 219 kB | 36 kB |
| practice slots | 222 kB | 39 kB |
| Swiss pairing | 213 kB | 40 kB |
| weekend tournament | 237 kB | 61 kB |
| bowling league | 253 kB | 74 kB |
| golf league | 270 kB | 90 kB |
| multi-division | 251 kB | 217 kB |
| single league | 215 kB | 225 kB |

Not every page got lighter. The single-league page uses nearly every
module, so it gains nothing. It now pays 10 kB more, because fifteen files
compress less well apart than one file does. The multi-division page still
loads the season builder, because its own engine uses the builder's text
parsers. That one is next.

## A test that would have missed a broken server image

The self-hosted league server ships as a Docker image whose Dockerfile
lists each module to copy. Its test read the modules `server.mjs` imports
by name and checked each one was copied. After the split, `server.mjs`
still names only `calc.mjs`, so an image missing `pools.mjs` would have
passed that test and then failed when it started. The test now follows the
imports all the way down. We tried it: drop `pools.mjs` from the
Dockerfile and the test fails.

A second new test follows the imports of every page in the folder except
the two that build whole seasons, and fails if any of them reaches the
season builder or the carry-over search again.
Without a bundler, one convenient `import { x } from "./calc.mjs"` would
bring all that code back.

## What it does not tell us

These are byte counts, not timings, and nobody has measured a real phone on
a court-side connection yet. We know the scorer's first load is about a
twelfth of what it was. What that does to time-to-first-tap on a slow
network is an estimate until someone measures it.
