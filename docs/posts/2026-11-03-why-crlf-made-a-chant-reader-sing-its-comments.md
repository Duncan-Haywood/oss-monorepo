---
title: "Why Windows line endings made a chant reader sing its comments"
seo_title: "GABC parser bugs: CRLF comments, sp tags and clef changes"
date: 2026-11-03
tags: [music, gregorian-chant, midi, open-source]
description: "Reading Gregorio GABC properly fixed four bugs in Chant Forge: CRLF comments, special-character tags, raw TeX text and clef changes inside a group."
---

Chant Forge turns public-domain Gregorian chant, written in the GABC notation, into MIDI choir lines with Latin lyrics. Its first converter had only run on small inputs written for its own tests. Re-reading the format turned up four misreads that real files from GregoBase would hit.

1. **Windows line endings.** The comment stripper split on `\n` and removed `%` to the end of the line. With CRLF files the stray `\r` stopped the match, so a comment's text was sung as a lyric. The fix splits on `\r?\n`.
2. **Special-character tags.** `<sp>R/</sp>` and `<sp>V/</sp>` are the response and versicle signs; the old code stripped every tag and left the syllable empty. They, and `<sp>'ae</sp>`, now keep their characters.
3. **Text that is not sung.** `<v>` holds raw TeX and `<alt>` text printed above the staff. Centre braces, `*` and the cross are also dropped from lyrics.
4. **Clef changes inside a group.** `(::c3)` and `(z c3)` put a clef change after a bar or line break in the same group as other signs. The reader only noticed a clef when it was the whole group, so every later pitch came out in the wrong place.

Six new tests cover these, on made-up strings shaped like real files. A batch run over real GregoBase files is still to do, and NABC alternations are still cut at the first `|`.

The code is MIT in [`ventures/chant-forge`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/chant-forge).
