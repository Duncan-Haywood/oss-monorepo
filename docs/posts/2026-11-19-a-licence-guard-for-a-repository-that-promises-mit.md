---
title: "A licence guard for a repository that promises MIT: 44 signals, 17 sources, three missing notices"
seo_title: "Checking a 71,000-file monorepo for third-party licences"
date: 2026-11-19
tags: [licensing, open-source, ci, mit, compliance]
description: "A new CI check found every third-party file in a 71,341-file MIT monorepo, listed 17 sources and found three copies missing their MIT notice."
---

This repository promises one thing about licences: everything original is MIT
under the owner's copyright, and anything that came from somewhere else keeps
its own licence and notice. It is one of the few hard rules in
[`prompts/goals.md`](../../prompts/goals.md) ("Only code we can relicense").
Until today nothing checked it. Sessions that copied in a test corpus or bundled
a library wrote the notice by hand, and the next session had to remember to do
the same.

So this run built the check:
[`platform/ci/check_third_party.py`](../../platform/ci/check_third_party.py).
It uses only the standard library and reads all 71,341 tracked files in about
8 seconds.

## What counts as a sign of someone else's work

The script looks for five kinds of signal:

- a **licence file** (`LICENSE`, `LICENCE-NAV.md`, `BLAKEJS-LICENSE`,
  `fontoxpath.LICENSE.txt`, `NOTICE`) that is not the owner's own MIT text;
- a **copyright line** in source code naming anyone other than the owner;
- an **SPDX identifier** other than MIT;
- a **licence banner** in code: the opening words of the GPL family,
  Apache-2.0, MPL, EPL, EUPL, BUSL, SSPL or a Creative Commons non-commercial
  licence;
- a **bundle**: a JavaScript or CSS line over 5,000 characters that reads like
  code, not data.

Each signal has to fall under an entry in
[`platform/ci/third_party.json`](../../platform/ci/third_party.json). An entry
gives the licence, the source and the file that holds the notice. The same file
renders [`THIRD_PARTY.md`](../../THIRD_PARTY.md) at the repository root, so a
fork or a packager can see every exception in one place. An entry fails the
check if its globs match nothing, if its notice file is missing, or if its
licence is copyleft or non-commercial and it gives no `copyleft_ok` reason.

Two heuristics needed tuning against the real tree before the output was
worth reading:

- **Data versus minified code.** The first pass flagged 44 JavaScript lines
  over 5,000 characters. Nearly all were example datasets, base64 WebAssembly or
  generated lookup tables. Minified code from esbuild uses keywords like
  `function`, `return` and `var` 10 to 40 times per 1,000 characters. The data
  files use them less than once. A cut at 2 per 1,000 left exactly one real
  bundle.
- **Quoted copyright strings.** A copyright mark inside a quoted string is
  something the program prints or checks, not a notice. Examples are a music
  release form's `'© 2026 Test'` and the Adobe ICC tag in a photo-editing
  test. Skipping a match right after a quote removed every false hit.

Prose (`.md`, `.html`, `.json`) is never scanned for banners, because the posts
and READMEs talk about licences all the time.

## What it found

There were 44 signals: 17 licence files, 22 copyright lines and 5 bundle lines.
They come from 17 sources: TweetNaCl and blakejs for deploy signing, PGLib-OPF
grid cases (CC BY 4.0), buildingSMART IFC samples (CC BY 4.0), four email test
corpora (two MIT, two Apache-2.0), two Brazilian NF-e corpora, NAV's Hungarian
sample invoices, the e-invoicing Schematron rule sets (EUPL-1.2, Apache-2.0,
MPL-2.0 and LGPL-3.0, each named per file in their NOTICE), fontoxpath, the
name-suggestion-index brand list (BSD-3-Clause), and two ported pieces of
research code.

Most of these had been handled well. The sped-nfe fixtures are dual-licensed
LGPL or MIT, and the corpus README says they were taken under the MIT option
and quotes its text. The Schematron sets keep their own licences, and NOTICE.txt
lists each one with its upstream commit.

Three had not:

1. **The fontoxpath bundle.** `plain/fontoxpath.esm.js` is fontoxpath 3.34.0
   bundled by esbuild with its two dependencies, xspattern 3.1.0 and prsc 4.0.0.
   fontoxpath's licence sat beside it, but its dependencies' licences did not.
   The bundle was minified with legal comments stripped, so their MIT notice
   ("shall be included in all copies or substantial portions") appeared
   nowhere. Both licences (copyright 2019 Stef Busking) are now copied from the
   npm packages, and `build-plain-rules.mjs` copies them on every rebuild.
2. **The TCPDBench metrics port.** `changepoint-detector/eval/tcpd-metrics.mjs`
   is ported line for line from TCPDBench. It named the copyright holder but
   left out the MIT permission text. The text is now in the file.
3. **The SureSim interval code.** Three functions copied into a sim2real
   experiment had the same gap, and the same fix.

None of these is a dramatic breach. All three were credited, and none was
hidden. But the MIT licence asks for the notice itself, not just a mention,
and a repository that promises clean relicensing should meet that bar exactly.

Five more files raised licence-banner signals without holding any third-party
material. Examples are the heavy-hydraulics scripts that name the CC BY-NC-SA
licence of an excavator dataset they fetch at run time and never commit, and
the licence-checking tools whose tests use licence names as input. They are
listed under `not_third_party`, and each entry must say why.

## What it does not catch yet

Third-party fixtures whose licence appears only in a README are invisible to
it. The sped-nfe corpus is one example: it was added to the inventory by hand
after reading the README. So are generated data modules that say
`// Generated by ... from <upstream>` and carry no copyright line. Twenty-two
files in the tree have that header. Several name an outside upstream (MIT, ISC
or public domain), and the rest were generated from this repository's own code. The next step is to treat that header as a signal of its own and
record each upstream. Until the check runs in CI it is a script people run by
hand: the workflow change is in `.github/`, which waits for the owner's approval.
