---
title: "A choir section sings only the notes every singer in it reaches: chant-forge now reads a range test"
seo_title: "Choir section ranges from a singers' range test (CSV)"
date: 2026-11-13
tags: [ventures, chant-forge, music, algorithms]
description: "chant-forge reads a choir's range test: what each section and the full choir can sing, which singer sets each limit, and how to divide an unsorted choir."
---

Chant Forge arranges Gregorian chant for a men's choir. Until today it decided
what the choir could sing from rules of thumb: a "textbook" tenor reaches C3 to
A4, an "amateur" one D3 to F4. A choir director doesn't need to guess. Most
directors run a range test at the first rehearsal and write down each singer's
lowest and highest comfortable note.

`node cli.mjs --singers choir.csv` now takes that sheet directly. Each row needs
a `low` and a `high` (`D3`, `Eb4`, `F#2` or MIDI numbers). A `name` and a
`section` column are optional.

## The rule is strict on purpose

A section can sing a note only if every singer in it reaches that note, so a
section's range is the overlap of its singers' ranges. The unison band is the
overlap of everyone's. This means one singer with a short range sets the limit
for a whole section, which a director should know about, so the report names
that singer:

```
tenors Eb3-F4 (3: Singer A, Singer B, Singer C); low set by Singer C (D3 without); high set by Singer C (G4 without)
basses Bb2-C4 (3: Singer G, Singer H, Singer I); low set by Singer G (A2 without); high set by Singer I (D4 without)
unison Eb3-C4; low set by Singer C (D3 without); high set by Singer I (D4 without)
```

"D3 without" means the tenors would reach a semitone lower if Singer C sat out
the lowest notes. Whether to do that, move Singer C to another section or lower
the final is the director's decision. The tool only shows the trade.

Given a chant, the range test drives the rest of the pipeline. `--suggest-final`
checks the chant against the unison band. When the chant doesn't fit, the tool
names the fewest sections that can sing it. `--split-voices` then gives each
phrase to the sections that can reach it.

## Dividing a choir nobody has sorted yet

When the sheet has no section column, the singers are divided for you. The tool
sorts them by the middle of their range and tries every way of cutting that list
into two, three or four contiguous groups, with the basses lowest. It keeps the
cut whose narrowest section is widest. Ties go to the widest total range, then
to the most even group sizes.

Restricting the search to contiguous cuts is a shortcut, so I checked it against
brute force, which tries every assignment of singers to sections. The test used
290 random choirs of 6 to 12 singers. They are synthetic, so this tests the
algorithm, not real voices. The narrowest section came out the same in all 290.
The total width matched in 285. The five misses lost 1 to 2 semitones of total
range, all with three or four sections. Dividing 200 singers into four sections
takes about 50 ms
([report](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/chant-forge/eval/singers-check-report.md)).

## What is not known

No real choir's range test has been through it yet. The every-singer rule may
also be too strict. Real sections often let one weak voice drop out of an
extreme note, and a `--sit-out N` option could allow that. I'd rather a director
said how strict it should be before building it.

The studio page has the same feature: paste the CSV into the range-test box.
Everything runs in the browser and the code is MIT, in
[`ventures/chant-forge`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/chant-forge).
