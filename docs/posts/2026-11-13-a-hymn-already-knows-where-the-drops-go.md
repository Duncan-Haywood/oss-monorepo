---
title: "A hymn already knows where the drops go: song sections from Gregorian double bars"
seo_title: "Gregorian chant as EDM: intro, build and drop from the double bars"
date: 2026-11-13
tags: [ventures, chant-forge, music]
description: "Chant Forge now arranges its backing as a song. Each double bar in the chant ends a section, so a six-verse hymn becomes verse, build, drop three times over."
---

Until today Chant Forge put one groove under a whole chant. The kick started in
bar one and the same four-bar loop ran to the end. A chant over a drum loop is
a demo. A track needs somewhere to go: an intro, a quieter stretch, a build,
and a drop.

**The chant already says where the sections are.** Gregorian notation has a
double bar (`::` in GABC). It ends a verse of a hymn, a whole antiphon, or one
pass of a repeated chant. So the new `--sections` option cuts the backing at
every double bar. The six verses of *Pange lingua* become six sections, and
each one starts on the first downbeat of its verse. Nobody has to mark the
form by hand.

Two rules keep this musical rather than mechanical. Sections shorter than four
bars are merged into the one before. Without that rule, the simple-tone Te
Deum, which has 28 double bars, would switch energy every couple of bars. And
the last chant section is always a drop, while the first is a verse when there
is more than one. The sections between alternate, counted back from the end,
so the track finishes at full energy.

**Every energy comes from the drop.** Each genre template (deep house, EDM,
hard rock, metal) writes one full bar. That bar is the drop. The other
sections are made by taking parts away:

- the intro keeps hats, ride and softened chords, with no kick, snare or bass;
- a verse loses the crash and the chord part, since the choir carries the harmony;
- the outro thins back to hats and chords, then ends on one held chord and a crash.

Because of this, all four genres got sections from one piece of code, not four.

**The build is the one new bar.** A section that leads into a drop ends on a
build bar. It has kicks on beats 1 and 2, and a snare roll that speeds up from
quarters to eighths to sixteenths while it gets louder. Bass and chords are
held underneath. The last eighth of the bar is empty for every part, so the
drop lands out of a moment of silence.

**What it measures like.** We rendered the six-verse *Pange lingua* backing
through the project's preview synthesiser and took the mean power of each
section. The drop sits 1.7 to 3.5 dB above the verse in every genre: 1.8 dB
for deep house, 3.5 for hard rock. The intro is 6 to 9 dB below the verse.
The tests check the structure as well as the levels. The intro has no kick,
the build's gaps shrink, nothing sounds in the air gap, and every bass and
chord note stays in the chant's mode. A file built without `--sections` is
unchanged, byte for byte.

**What this does not tell us.** The numbers show the sections differ. They do
not show the difference feels like a drop. Is under 2 dB of lift in deep house
enough? Does the empty eighth sound deliberate, or like a glitch? Those are
ear questions, and nobody has listened yet. The next steps are musical too:
a riser or a chord change in the build, not only drums, and a breakdown where
the drums stop and the choir sings alone, for long hymns.

Try it on the [studio page](https://marisstella.app/chant-forge/) (turn on
"Song sections"), or from the command line:

```
node cli.mjs corpus/pange-lingua-full.gabc --final 52 --fit 8 --stretch \
  --genre deep-house --sections --intro 2 --outro 2 -o pange.mid
```

Each section also becomes a MIDI marker, so a DAW shows "Verse 1", "Drop 1"
and so on as locators. Source, tests and numbers:
[ventures/chant-forge](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/chant-forge),
MIT licensed.
