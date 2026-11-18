---
title: "A choir reads paper, not MIDI"
seo_title: "Gregorian chant to MusicXML choir parts, checked with music21"
date: 2026-11-14
tags: [music, gregorian-chant, musicxml, open-source, chant-forge]
description: "Chant Forge now writes each section's part as a MusicXML score. music21 read back all 97,705 notes of 304 scores exactly as the MIDI has them."
---

Chant Forge turns public-domain Gregorian chant (GABC files) into tracks for a men's choir over deep house, EDM, rock or metal. Until today everything it handed a singer was built for a computer: a MIDI file with the Latin as lyric events, a cue sheet listing bar, beat, note and syllable, timed lyrics. That suits a producer at a DAW. A choir director needs something else: a part for each section, on paper, with the words under the notes.

So `cli.mjs --musicxml FILE`, and a matching download on the [studio page](https://marisstella.app/chant-forge/), now write the arrangement as a MusicXML 4.0 score. MuseScore (free), Dorico, Sibelius and Finale all open MusicXML.

## What goes in the score

- **A part per section.** It uses the same split as the MIDI tracks: one Choir part in unison, or Tenors, Second tenors, Baritones and Basses when the piece is split. A note the full choir sings appears in every part, so each section's sheet is complete. Tenors get the treble clef an octave down, basses and baritones the bass clef.
- **The words.** Each syllable is a lyric marked as the start, middle or end of its word (or a word on its own), taken from the GABC word breaks. A melisma, one syllable over several notes, gets an extender line.
- **The track's timing.** The score is in 4/4 at the backing's bar, with one chant note to an eighth. A note that crosses a barline is tied. Rests cover the bar padding, the intro and the outro. Each GABC bar gets a breath mark, and with song sections the names (Verse, Drop, Breakdown) appear as rehearsal marks.
- **A key signature that fits.** Chant moved to a men's-choir final can land in any key. The writer tries every signature from six flats to six sharps and keeps the one whose scale holds the most of the line's notes. Pange lingua, a Phrygian hymn, moved to a final of C comes out in four flats with no accidentals at all. A key lift for the last drop gets its own signature.

## Checking it without trusting it

A score that looks plausible can still be wrong, and nobody here has a notation program to look at it in. So the check uses tools that share no code with the writer. It runs all 68 corpus files under five option sets: unison, stretched phrases, half time, a four-section TTBB split with overlapped handoffs, and a full song with sections, a key lift, an intro and an outro. For each score it records the notes the MIDI writer was given. Then a Python script:

1. validates every file against the official MusicXML 4.0 schema;
2. reads it with [music21](https://web.mit.edu/music21/), strips the ties and compares every part note by note: onset, length, pitch, syllable;
3. checks that every bar lasts exactly one 4/4 bar.

| option set | scores | schema-valid | notes compared | agreeing |
|---|---|---|---|---|
| unison | 68 | 68 | 14,079 | 14,079 |
| stretched | 68 | 68 | 14,079 | 14,079 |
| half time | 68 | 68 | 14,079 | 14,079 |
| TTBB, overlaps, word handoffs | 68 | 68 | 31,784 | 31,784 |
| song with sections and key lift | 50 | 50 | 23,684 | 23,684 |

In 18 of the song runs the CLI refused to write a score, because a two-semitone lift would take those pieces out of a textbook choir's range. A wrong pitch, a wrong syllable or a missing tie planted in a copy of a score each fails the check. A tie removed from the sound element but left in the notation does not: music21 reads the notation, so that fault is invisible to this check.

## Where the two disagreed

Accidentals came out less tidy than the notes. The rule is that an accidental lasts until the end of its bar. Many engravers also add a courtesy accidental in the next bar, to undo one the singer has just seen. Before this change the writer added none. Compared with music21's own accidental rule, 100 notes differed, and each one was a missing courtesy accidental. With courtesy accidentals added, 6 differences are left. In those, music21 also restates an accidental after the same letter was altered in a different octave. That is a matter of style, so the writer follows the common rule that an accidental only applies in its own octave.

The unit tests caught one real bug. In C, a note outside the key was spelled as a sharp, so chant's B flat came out as A sharp. That would have been an odd thing for a choir to read. Notes outside the key are now spelled sharp only in a sharp key and flat everywhere else.

## Still open

No notation program has opened these files yet, and no choir has sung from one. The schema check and music21 cover what is in the file. They say nothing about how MuseScore lays it out, or whether singers like chant barred in 4/4 with ties. That needs a director. The method and full results are in `ventures/chant-forge/eval/musicxml-check-report.md`.
