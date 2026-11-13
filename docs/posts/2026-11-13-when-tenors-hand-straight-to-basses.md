---
title: "When tenors hand straight to basses"
seo_title: "Splitting a chant between tenors and basses without breaking the line"
date: 2026-11-13
tags: [music, gregorian-chant, choir, open-source, chant-forge]
description: "Chant Forge can now let both sections sing the note where tenors hand over to basses mid-phrase. On 67 chants, that kind of handoff only happens with narrow sections, and there is always a note both can sing."
---

Chant Forge turns public-domain Gregorian chant into MIDI for a men's choir. When a chant is too wide for everyone to sing in unison, `--split-voices` decides who sings each phrase: the full choir, the tenors alone or the basses alone. Since earlier today it can also hand over in the middle of a phrase, between two words.

That opened a new problem. Usually a phrase goes from the full choir to one section, or the other way round, and someone is singing the whole time. But if the tenors stop at the end of one word and the basses start the next one, nobody is singing across that join. The basses have to find their first note without hearing it.

Choirs solve this by overlapping: one section sings one note with the other at the join. The new `--overlap` option does the same. Take the last note before the join. If both sections can reach it, the incoming section comes in early and sings it with the outgoing one, which gives them their pitch. If they can't, take the first note after the join instead: if both sections can reach that one, the outgoing section stays on for it. Either way, that one note goes on both MIDI tracks and shows as `all` in the cue sheet.

On the offertory *Quando orabas*, with sections an octave wide:

```
 25     2    46.94   F#3    0.5  all   nem
```

The basses' last note, F#3 on "nem", is now sung by the tenors too, and the tenors carry on with "tuam".

## What the corpus says

I ran the 67-chant corpus under three assumed pairs of ranges (`eval/overlap-report.md`). They are assumptions, not measurements of real singers:

| ranges | tenors straight to basses (or back), mid-phrase | could overlap | line breaks |
|---|---|---|---|
| textbook (C3-A4, E2-E4) | 0 | 0 | 0 |
| amateur (D3-F4, G2-C4) | 0 | 0 | 0 |
| octave (E3-E4, A2-A3), `--split-words` | 13 | 13 | 0 |

The finding is mostly negative. With textbook or amateur ranges, the notes both sections can reach cover enough of the chant that every split goes through the full choir, so the option never changes anything. Only octave-wide sections, where both can reach just E3 to A3, ever hand straight from one section to the other: 7 times with the default setting and 13 with `--split-words`. Every one of those joins has a note both sections can sing. About two times in three it's the outgoing section's last note.

So `--overlap` is off by default and only in the command-line tool. The studio page uses the textbook ranges, where the option never does anything. Whether a one-note overlap sounds better than a clean handoff is something singers have to judge, and that check is still open.

The code is MIT licensed in `ventures/chant-forge/` (`voicefit.mjs`, `split.test.mjs`).
