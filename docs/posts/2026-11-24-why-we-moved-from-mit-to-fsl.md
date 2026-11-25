---
title: "Why our 1,400 free tools moved from MIT to the Functional Source License"
seo_title: "MIT to FSL-1.1-MIT: relicensing a public repo, and what stays MIT"
date: 2026-11-24
tags: [licensing, fsl, open-source, source-available, business]
description: "The tools here are now FSL-1.1-MIT: free to use, change and run, except as a competing product, and MIT after two years. What changed, what didn't, and why FSL."
---

Until today, everything in this repository was MIT licensed. From today, new
work on the free tools is under the **Functional Source License 1.1 with an MIT
future licence** (FSL-1.1-MIT). This post says what that means for you, what
stays MIT, and why we picked this licence over the others.

## What you can still do

Almost everything. You can read the code, run it, change it, share it, use it
inside your business, teach with it, do non-commercial research with it, and use
it for client work. A plumber can still price jobs with the quote calculator,
and a bookkeeper can still run the CSV checker on a client's export.

The one thing the licence rules out is a **Competing Use**: offering the
software, or something substantially like it, to others as a commercial product
or service. Taking a tool from here and selling it as your own is no longer
allowed.

And it doesn't last: **every version becomes MIT on the second anniversary of
its release**. That grant is in the licence text and can't be withdrawn.

## What stays MIT

- **Everything published before today.** An MIT grant can't be taken back, so
  every commit up to the relicensing one stays usable under MIT, by anyone,
  for good.
- **The research portfolio** (`research/`), which is there to be cited,
  reproduced and built on.
- **Tools built for outside website requests**, because the intake form promises
  MIT. Each one gets an MIT `LICENSE` in its own directory.
- **Third-party code and data**, which keep their own licences, listed in
  `THIRD_PARTY.md`.

## Why change at all

The repository's goal has moved to paid products with real depth, sold by
subscription or as one-off licences, with the free tools as front doors to them.
A public MIT codebase lets anyone copy a product and sell it against us on day
one. FSL closes that one gap and leaves everything else as it was.

## Why FSL, not the alternatives

- **PolyForm Noncommercial** would block commercial use of any kind, which
  would stop a tradesperson from using a free calculator for work, and that's
  the whole point of a free tool.
- **Business Source License (BUSL)** needs a custom "additional use grant" and
  a hand-chosen change date for each product, and more corporate licence
  scanners flag it.
- **AGPL** is open source. It makes a hosted competitor publish their changes,
  but it doesn't stop them competing.
- **FSL** is short, fixed text with one restriction and an automatic switch to
  MIT after two years. Sentry wrote it, and it's on the SPDX licence list as
  `FSL-1.1-MIT`.

## What we changed on the pages

FSL isn't an open-source licence in the Open Source Initiative's sense, so we
stopped calling the tools "open source". Footers that said "Free and open
source (MIT)" now say "Free to use and source available (FSL-1.1-MIT)". The npm,
PyPI, Homebrew, container and MCP packages declare the new licence too.

A script did the rewrite (`portfolio/monetization/relicense_fsl.py`). It
replaced the 1,447 licence files that held our MIT text, and rewrote the
licence statements in 6,382 other files under `ventures/`: pages, READMEs,
`llms.txt` files, manifests and the tests that check them. It left alone every sentence about
someone else's project, like the open-source Kokoro voice or a dataset credited
as "(MIT)". Its `--check` mode fails if anything is left to rewrite.

This is a plain-language summary, not legal advice. The `LICENSE` file in each
directory is what governs.
