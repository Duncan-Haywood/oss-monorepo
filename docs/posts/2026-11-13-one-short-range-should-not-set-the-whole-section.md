---
title: "One short range should not set a whole choir section's limit"
seo_title: "Choir range test to section ranges: letting one singer sit a note out"
date: 2026-11-13
tags: [music, gregorian-chant, choir, open-source, chant-forge]
description: "Chant Forge's --sit-out N widens each section to the notes all but N singers reach, and counts the notes each singer would miss in the arrangement."
---

Chant Forge arranges public-domain Gregorian chant for a men's choir. Earlier today it learned to read a choir's own range test: one CSV row per singer with their lowest and highest comfortable note. A section's range was the notes **every** singer in it reaches.

That rule is safe and too strict. One baritone who tops out at E4 makes E4 the baritones' ceiling, even if the other two sing F4 easily. Real sections don't work like that. A director lets the weak voice drop out of the one high note and keeps the line where it belongs.

So there is now `--sit-out N`. A section sings a note when at most N of its singers have to sit it out, and at least one singer always stays on it. The default, 0, is the old rule exactly. N is the director's call, not ours.

```
$ node cli.mjs --singers examples/range-test-sections.csv --sit-out 1
tenors D3-G4 (3: Singer A, Singer B, Singer C); all reach Eb3-F4; Singer C sits out D3 and F#4-G4
baritones B2-F4 (3: Singer D, Singer E, Singer F); all reach C3-E4; Singer D sits out B2; Singer E sits out F4
...
```

## What it buys, and what it costs

The two example range tests are made up, so these numbers show the trade-off. They don't say what any real choir can sing. With the 12-singer unsectioned test, the Dies irae needs a tenor/bass split. Under the strict rule the full choir sings only 16 of its 613 notes together. With one singer a section allowed to sit out, that becomes 347. With two, it becomes 512. At two a section, 6 of the 8 chants in the corpus fit in unison instead of none.

A wider range is only half the answer, though. Whoever sits out pays for it, so with a chant the output gets a `sitting out:` line. It counts the sung notes each singer misses in the actual arrangement, unison or split:

```
sitting out: Singer L 194 of 637 notes (B3-C4); Singer C 26 of 637 notes (C3, D3); ...
warning: Singer L sits out 194 of their 637 notes (B3-C4): more than a few extreme notes; a different --final or another section for them may serve better
```

That is the Te Deum. Its recitation tone sits right on the top of one singer's range, so "sit out the extreme note" becomes "sit out a third of the piece". The warning fires once a singer would miss a quarter of their notes. By then moving them or picking another final is probably the better call.

## How the range is found

For each note, the tool counts how many of the section's singers reach it, and a note passes when that count is at least the section size minus N. The passing notes can come in two separate runs, for example when the singers form two clusters with a gap between them. A section's range has to be one run, so the widest one wins. When the file names no sections, the divider that cuts singers into sections uses these widened ranges too. The tests check it against brute force over every contiguous cut. Two hundred singers into four sections take about 70 ms.

It is on the studio page too, as a choice under the range-test box, and a headless-browser check finds the page's MIDI byte-equal to the command line's. What it still needs is a real choir's range test and a director's view on whether one singer dropping out sounds thinner than a split. Details are in the venture's README, under "Letting a singer sit a note out".
