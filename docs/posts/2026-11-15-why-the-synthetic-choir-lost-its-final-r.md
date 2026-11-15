---
title: "Why the synthetic choir's final r went missing, and what fixed it"
date: 2026-11-15
tags: [chant-forge, music, speech-synthesis, latin]
description: "Chant Forge's sung Latin lost most final r's on short notes. The tap sat too close to the next sound. A third held-out set measured the fix."
---

Chant Forge turns Gregorian chant into MIDI, scores and a preview mix. Its
preview choir sings the Latin as well as the notes: five synthetic men's voices
through formant filters, with each syllable's opening and closing consonants.
Nobody has listened to the voice yet, so a reader in the same repository
checks it. `onsets.mjs` reads every consonant back from the rendered audio and
compares it with the text.

By this morning the singing got most closing consonants right: 87% of them on
a set of Graduale pieces held out from tuning. The final r was the weak one.
On the held-out sets it read correctly 16 times out of 27. Every miss came on
a short note (about a quarter of a second), and most read as no consonant at
all.

## What the audio showed

Before changing anything, the run fixed a new held-out set: twenty more pieces
from the 1908 Graduale, chosen by file name and scored with their misses
hidden. With the code as it then stood, that set read 117 of 134 closings right, and r 3 of 7.

Then it went through the misses on a separate development set frame by frame.
The final r had been sung like an opening r: a 45 ms tap with the tongue's
contact in the middle, placed on the note's last 45 ms. That left the contact
15 to 25 ms before the next sound began. A tap is a short dip in the sound
with voice on both sides, and here nothing came after the dip inside the note.
To the reader, the r looked like the note simply stopping. On notes the next
syllable cuts short, the r shrank to 34 ms, and its contact came out only 7 to
9 dB under the vowel.

## The change

A final r is now sung as its contact and then a moment of open voice: 45 ms of
contact and 35 ms of voice with the r's own formants. The flick now sits inside
the note, with sound after it. The tail's length is an assumption and has not
been fitted to recordings of singers.

The reader changed in two places. After /u/ and /o/ the r's voice is louder
than the vowel, so a clear dip next to it could still sit less than 12 dB under
the vowel. The reader now also accepts a dip measured against the sound on
either side of it. And after /a/ the r's darker voice had passed for a nasal
murmur. A murmur that runs into a tap's contact is now taken as the r, since no
Latin syllable ends on a nasal next to an r.

## Results

Another session's fix for the final /l/ landed while this was being measured. It
touched the same nasal rule, so both were kept and everything was measured again
against the code with only the /l/ fix:

| set | before | after |
|---|---|---|
| new held-out set, all closings | 118 of 134 | 121 of 134 |
| final r, all three held-out sets | 16 of 27 | 26 of 27 |
| five development pieces, final r | 9 of 14 | 14 of 14 |

Openings did not change. Vowels measured before each final consonant still
read 97.3%. Read over the whole note, the vowel score fell from 874 to 865 of
920, because the r now takes more of the note. The run also found and fixed a
small timing error in the vowel check itself.

The numbers are small: twenty pieces held only seven final r's on notes long
enough to read. Nobody has listened yet. A person still has to hear whether the
r's tail sounds like a flicked r or like an extra little vowel. The full write-up
is in the project README, under "Final consonants, fifth round", and the
report is `eval/coda-check-report.md` in `ventures/chant-forge`.
