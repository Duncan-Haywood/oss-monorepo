---
title: "A 61-character tagline: sixteen seeded faults in the launch-kit and GitHub Action generators"
seo_title: "Launch kit drafts now stay inside every venue's length limit"
date: 2026-11-12
tags: [testing, mutation-testing, distribution, redteam]
description: "Sixteen faults seeded into two distribution scripts; nine caught. A manual hunt found the launch kit could write a Product Hunt tagline one character over the limit."
---

The [launch kit](../../platform/distribution/launch-kit.mjs) writes drafts the
owner pastes by hand into Show HN, Product Hunt, AlternativeTo, awesome-lists
and Reddit. Nothing in it posts anything. Its whole job is to produce text that
fits each venue's form: an 80-character Show HN title, a 60-character Product
Hunt tagline, a 260-character description. Today's red-team run seeded faults
into it and into its sibling, the generator for the
[GitHub Actions](../../platform/distribution/actions/) that wrap our stdlib
checkers (`redteam.py campaign`: change one constant or flip one comparison,
run the tests, put the file back).

| File | Seeded | Caught before | Caught after the new tests |
|---|---|---|---|
| `distribution/launch-kit.mjs` | 8 | 1 | 8 of 8 |
| `distribution/ghaction.mjs` | 8 | 7 | 8 of 8 |

## What got through

The launch kit's tests used one short description, so every length limit
passed whatever it was set to. Raising the Show HN limit to 81, the Product
Hunt description to 261 or AlternativeTo's to 301 changed nothing a test could
see. Neither did clipping from the second character instead of the first. The
command-line half was never run at all: reading flags from `argv.slice(3)`
(which drops the first flag), ignoring `--days`, or never firing the
entry-point guard all passed.

The new tests run the composer over 90 descriptions with words from 1 to 12
letters long and check each limit, that clipped text keeps its start and ends
with an ellipsis, that `run()` honours `--days` and `--max`, and that the
script works from the command line.

The GitHub Action generator was well covered. The one survivor was `write()`,
which no test called: making its `mkdir` non-recursive passed. A test now
writes into an empty temporary tree and checks the result is current.

## The real bug

Titles and taglines are cut at a whole word, not with an ellipsis. The helper
took the first `n + 1` characters and removed the last partial word. That works
when there is a space in that window. When the first word is longer than the
limit, there is no space, nothing is removed, and the result is `n + 1`
characters. For a tagline that opens with a long hyphenated compound, the kit
wrote 61 characters into a 60-character field, and Product Hunt would refuse
the form. The helper now cuts hard at the limit when no whole word fits. A test
failed on the old code and passes on the new.

I checked the other places in the repository that cut text at a word boundary
(the devlog, the daily digest, the Nix and pre-commit descriptions and a few
venture pages). They slice to the limit first and strip after, so they cannot
go over. The launch kit was the only one that sliced past the limit.
