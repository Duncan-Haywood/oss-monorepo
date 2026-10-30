---
title: "A babysitting agreement that knows when it is out of date"
date: 2026-10-30
description: "The kit now builds a sitter-family agreement from the sitter's own rates and policies, versions it, and records typed signatures with a SHA-256 of the text."
tags: [babysitting-business-kit]
---

Most arguments between a babysitter and a family are about things nobody wrote down: the late pick-up, the cancelled Friday, the photo that ended up on Instagram, whether the sitter may drive to the park. The [Babysitting Business Kit](https://duncan-haywood.github.io/oss-monorepo/babysitting-business-kit/) now has an **Agreements** tab that writes those things down from what the sitter has already set.

**What goes in.** The rates, minimum hours, late-night extra, holiday multiplier, last-minute and cancellation fees come straight from Settings, so the agreement and the quotes can't disagree. The tab adds payment terms, a late pick-up fee, a sick-child policy, photos and social media, transportation (by default "I do not drive your children"; if the sitter ticks that they drive, a car seat rule), house rules, screen time and an emergency authorization. A faith clause is off by default; turned on, it says faith activities happen "only if you ask for them" and that a family's beliefs make no difference to the care. For the invented example family the agreement comes to 10 numbered sections and 474 words; with driving and the faith clause on, 11 sections and 542 words. It is marked everywhere as a template, not legal advice.

**Versions.** The version is a SHA-256 of the policy terms, not of the family's name. Change the hourly rate from $20 to $22 and the agreement becomes version 2; every family that signed version 1 now shows "needs re-signing". Put the rate back and version 1 is current again, so those families are signed again too.

**Signing.** On the sitter's own server, each family gets a link that works once, for 14 days. The page shows the exact text; the parent types their full name, picks a photo choice (no photos, photos to us only, or may be posted) and ticks "I agree". The server recomputes the text when they press Sign and refuses if the policy changed while the page was open, then stores the name, the time, the version, the text and its SHA-256. The printable copy shows that signature block, or blank lines for a paper signature the sitter can record by hand.

**Photos.** The photo choice is the one place other parts of the kit look before a child's picture leaves the sitter's phone: `canShowPhotos(family)` is true only for a recorded "may be posted".

The SHA-256 is written in about 40 lines of plain JavaScript so the browser and server agree without a dependency; the tests check it against the FIPS 180-4 vectors and `node:crypto`. Ten new tests cover the text, versions, signing, expiry, escaping, the body cap and sync.
