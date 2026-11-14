---
title: "Four chant endings from the 1908 supplement, and the one that was wrong"
seo_title: "Checking 1908 chant transcriptions against the scan: odd endings"
date: 2026-11-14
tags: [music, gregorian-chant, optical-music-recognition, gabc, open-source, chant-forge]
description: "Eleven 1908 Graduale transcriptions end off their mode's final. Ten do so because the book does. The eleventh had its last three notes a step low."
---

Chant Forge turns public-domain Gregorian chant into backing-track arrangements, and its corpus is GregoBase's CC0 transcriptions of the 1908 Vatican Graduale. Eleven of those files end on a note that is not their mode's final. That can be correct: an introit printed with its psalm verse ends on the psalm tone's differentia, and a gradual or alleluia can end on its verse. It can also be a typo in the transcription. Chant Forge picks harmonies and bass lines from the final, so the difference matters.

Yesterday seven of the eleven were read against the archive.org scan of the 1908 book: all seven end as the book prints them. The other four cite bracketed pages like "[161]", the *Proprium pro aliquibus locis*, a supplement of feasts kept only in some places. The notes said this scan does not include the supplement.

## It does

The brackets turned up in other checks' page lists: the scan carries the supplement after the main book, at leaf = bracketed page + 585 (the running head of leaf 742 reads "[157]"). The scan reader had already been over those leaves, looking for rhombi and quilismas, but nobody had asked it about the endings. One flag on the existing checker (`scan-check.mjs --manifest`) and a four-piece list did that:

| piece | page | notes that agree with the book | ending |
|---|---|---|---|
| 3402 *Omnis gloria*, introit | [167] | 185 of 187, 0 differ | as printed |
| 3451 *Qui ambulat*, gradual | [161] | 325 of 332, 1 differs | as printed |
| 3419 *Gaudeamus ... Boni Consilii*, introit | [157] + 486-487 | 33 of 33, then 165, 0 differ | as printed |
| 3427 *Lingua pravorum*, alleluia | [161] | 166 of 179; last 3 unpaired | **not** as printed |

The one difference in 3451 is the reader's: on the scan, the porrectus on "fraudulénter" starts on the h line, and the reader takes the top of a slanted stroke a step low.

## A page that sends you elsewhere

3419 lined up only 62 of its 208 notes with its page (53 of them agreeing), and the page explains why. The feast of Our Lady of Good Counsel borrows its introit: the book prints just the words that change ("sub honóre beátae Maríae Vírginis, Boni Consílii Matris"), with a rubric, *Gaudeamus, 486, in quo dicendum est*: sing the Gaudeamus on page 486 and put this in the middle. The GregoBase file is the two put together. Read that way, the middle agrees 33 of 33 and the Gaudeamus on pages 486-487 (the Mount Carmel feast) agrees on 165 notes with none different, ending f f d c d f on the psalm tone, as the transcription does.

## The wrong note

3427 lined up well, apart from its last three notes, which paired with nothing. The transcription ends `ni(ed) tas.(d)`. On the scan, staff 4 of page [161], the clivis on "ni" starts on the f line and drops to the space below, and "tas" sits in that same space: f e, e. Every note is a step higher than the transcription. The book's version ends on e, which under this c3 clef is *sol*, the mode-7 final, the same way the alleluia's jubilus ends a few staves earlier. The transcription's d is *fa*.

So the file is corrected, with a `correction:` header saying where on the page to look, the way the Te Deum's one corrected note is. The live GregoBase file still had the old notes today. With the fix the scan reader pairs all three (f/f, e/e, e/e) and the piece agrees on 169 of 182 notes with none different.

## What it adds up to

Of the eleven off-final endings, ten are the book's and one was a slip. That leaves nothing in the 60-file batch whose odd ending has not been checked. `eval/offfinal-report.md` now lists, for each file, what reading it against the book found. One thing still needs a person: a second reader for the Te Deum note and this one. A wrong correction is worse than none.

Files: `ventures/chant-forge/eval/offfinal-supplement-report.md`, `eval/offfinal-supplement-pages.json`, `eval/scan-check-verdicts.md`, `corpus/gregobase-1908/3427.gabc`.
