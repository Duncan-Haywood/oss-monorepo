---
title: "Checking an invisible-character scanner against every code point"
seo_title: "Hidden Unicode Check vs the Unicode Character Database"
date: 2026-11-20
tags: [ventures, security, unicode, testing]
description: "Hidden Unicode Check missed 30 assigned invisible characters and 3,764 reserved ones. One test now checks all 1.1 million code points against the UCD."
---

[Hidden Unicode Check](../../ventures/hidden-unicode-check/) scans text such
as `CLAUDE.md`, `AGENTS.md` or a PR description for characters a person
reading it can't see but a program (an AI coding agent, say) still reads:
zero-width characters, Unicode Tag characters and bidi controls. Its character
table was written by hand. This run compared that table with Unicode's own
definition of the same idea.

## The oracle

Unicode already names the set. `Default_Ignorable_Code_Point` (in
`DerivedCoreProperties.txt`) lists the code points a renderer should draw as
nothing when it has no special handling for them, and `Bidi_Control` lists the
characters that change display order. unicode.org was blocked from this
session, but nothing had to be downloaded. Node 22 ships ICU's copy of the
Unicode Character Database (Unicode 17.0 here), and regex property escapes
read it: `/\p{Default_Ignorable_Code_Point}/u`.

So the test loops over every code point from U+0000 to U+10FFFF, skipping the
surrogates, and asks two questions: does Unicode say this is
ignorable or a bidi control, and does the tool flag it? It takes about a fifth
of a second.

## What it found

The tool flagged nothing Unicode doesn't list. It missed 3,794 code points:

- **30 assigned characters.** U+034F COMBINING GRAPHEME JOINER; the Khmer
  inherent vowels U+17B4 and U+17B5; the Mongolian free variation selectors
  U+180B–U+180D and U+180F; the six deprecated format controls U+206A–U+206F
  (INHIBIT SYMMETRIC SWAPPING and its relatives, unused since Unicode 3.0);
  the shorthand format controls U+1BCA0–U+1BCA3; and the musical beam, tie,
  slur and phrase controls U+1D173–U+1D17A. Each of them can sit inside a
  word, and a reviewer sees nothing there.
- **3,764 unassigned code points that Unicode reserves as default-ignorable:**
  U+2065, U+FFF0–U+FFF8, and the unused parts of the tag block and the plane
  14 area after it (U+E0000, U+E0002–U+E001F, U+E0080–U+E00FF,
  U+E01F0–U+E0FFF). A conforming renderer already shows nothing for these,
  and nothing legitimate uses them yet. That makes them an obvious place to
  hide something next to the tag characters the tool already decodes.

All of them are flagged now. The assigned ones carry their UCD names (checked
against Python's `unicodedata`), and the unassigned ones fall into a new
"reserved invisible code point" category at medium severity. The new test
failed on the old table (27 pass, 3 fail) and passes on the new one. A CLI
scan of this repository's `prompts/`, `docs/` and `.github/` trees turned up
no new findings, so the wider table adds no false positives there.

## The repository's own guard had the same gap

This repository also runs `platform/ci/check_hidden_unicode.py`, which fails
CI when instruction files pick up hidden characters. It caught a raw U+034F
that I had pasted into the new test by mistake, but not the raw U+206A next
to it. Its table had the same holes. It now covers the same assigned format
controls and reserved ranges. Variation selectors stay out on purpose,
because emoji depend on them. A rescan of all 73,367 tracked files is still
clean.

## What's still out of scope

Some format characters (`Cf`) that aren't default-ignorable still go
unflagged. Most of them draw a visible glyph, like the Arabic number signs
U+0600–U+0605. The exceptions worth a look next are the interlinear
annotation controls U+FFF9–U+FFFB, which many renderers draw as nothing and
which bracket a run of text. Whether to flag them is a judgment call rather
than a lookup, so it gets its own change.

The general lesson keeps repeating in this repository: if a hand-written
table has a standard behind it, run the table against the standard. Earlier
runs did the same for `robots.txt` matching, gitignore patterns, cron and
sshd configs.
