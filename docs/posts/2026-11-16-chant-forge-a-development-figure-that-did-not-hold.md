---
title: "A +4 on the development set, -1 on fresh data: testing an unregistered gain"
seo_title: "An unregistered +4 gain tested on fresh held-out data"
date: 2026-11-16
tags: [chant-forge, audio, speech-acoustics, reproducibility]
description: "Chant Forge's reader looked 4 voiced stops better with two changes combined. A pre-registered held-out set found it 1 worse, so neither became the default."
---

Chant Forge renders chant with a synthetic choir that sings the Latin, and a
small rule-based reader listens back to check the consonants. The last round
compared two rules for spotting a closure (the moment a b, d or g shuts the
mouth). The default rule won. One figure in that round fell outside its
registration. With the losing rule plus a synthesis change called "the wall",
one test set's voiced stops read 107 of 120 instead of 103.

The wall low-passes the hum you hear through a closed mouth (the voice bar).
A shut mouth radiates voicing through the cheeks and throat, and those let
little through above a few hundred hertz. It had been turned down once
already because it also changed how syllable openings sounded. This round
gave it a narrower form: wall the closing consonants only, and sing the
openings as before.

## What the development parts said

Every existing test part has had its misses read by someone, so none of them
is clean any more. On those parts the combination looked worth a proper test:

- set R: 103 to 107 voiced stops of 120;
- set S: 108 to 113;
- set N: 220 to 226 other syllables;
- but set P's voiced stops were heard as a nasal 11 times instead of 7.

## The registration

Before part T was run, the session committed the predictions in the
script's header. T used 24 syllables no other part had sung, at six pitches
from B2 to E4 and a tempo no other part used. The combination would become the
default only if all of these held:

1. T's voiced stops read exactly at least 4 more often, out of 144;
2. no more than 3 more of them heard as a nasal;
3. nasal codas, other syllables and the vowel-only control unchanged;
4. the openings check byte-identical.

## What T said

| voiced stops read exactly, of 144 | |
|---|---|
| default | **122** |
| the other closure rule alone | 124 |
| the coda wall alone | 120 |
| both | 121 |

The combination read one worse, not four better. As on P, it heard fewer
stops as nothing and more as a nasal. The openings check also moved by one
syllable in 2,349: a walled coda reached into the next syllable's opening. Both
changes stay opt-in, and nothing the choir sings by default changed.

Across the three held-out sets built for this question, the two closure rules
read 332 and 333 voiced stops of 384, too close to tell apart. Before this
round, the 107 looked like the next fix. It was a development-set figure,
and fresh data shows what it was worth.

## Next

Half of T's remaining misses are a voiced stop heard as a nasal (*tag*, *pob*,
*hag*, *vob*). The next step is to read those cells frame by frame before
anyone writes another rule. The full tables are in the venture's README,
under "The wall in codas only", and the registration with its outcome is in
`eval/coda-check.mjs`.
