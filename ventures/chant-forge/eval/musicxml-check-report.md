# MusicXML score: read back by an independent parser (2026-11-14)

`cli.mjs --musicxml FILE` (and the studio page's score download) writes the choir line as a
MusicXML 4.0 partwise score (`musicxml.mjs`): one part per section, Latin syllables under the
notes, 4/4 at the backing's bar with ties across barlines, rests for padding, intro and outro,
breath marks at the GABC bars, song sections as rehearsal marks, and the key signature that
holds most of the line (a lifted last drop gets its own).

## How it was checked

```sh
node ventures/chant-forge/eval/musicxml-check.mjs OUT        # write the scores and the expected notes
python -I ventures/chant-forge/eval/musicxml-check.py OUT XSD_DIR --report FILE
```

`musicxml-check.mjs` runs the CLI over all 68 corpus GABC files under five option sets and,
next to each score, writes the notes it must hold, taken from the CLI's final events (the
ones the MIDI writer gets), per section with midi.mjs's rule for who sings what.
`musicxml-check.py` then, for every score:

1. validates it against the MusicXML 4.0 XSD (w3c/musicxml, tag v4.0, with its two imports,
   xml.xsd and xlink.xsd, pointed at local copies);
2. reads it with music21 10.5.2, which shares no code with the writer, strips the ties and
   compares each part note by note: onset and length in quarters, MIDI pitch, syllable;
3. checks that each measure lasts one 4/4 bar and each part lasts the whole piece;
4. compares the accidentals the score prints with those music21's own `makeAccidentals`
   prints for the same notes.

## Result

| option set | flags | scores written | refused by the CLI | XSD valid | read back exactly | parts | notes compared | notes agreeing |
|---|---|---|---|---|---|---|---|---|
| unison | `--auto-final` | 68 | 0 | 68 | 68 | 68 | 14079 | 14079 |
| stretch | `--fit 8 --stretch --auto-final` | 68 | 0 | 68 | 68 | 68 | 14079 | 14079 |
| halftime | `--fit 8 --halftime --auto-final` | 68 | 0 | 68 | 68 | 68 | 14079 | 14079 |
| ttbb | `--split-voices --baritones --second-tenors --overlap --split-words` | 68 | 0 | 68 | 68 | 149 | 31784 | 31784 |
| song | `--genre deep-house --sections --key-lift 2 --a-cappella --intro 2 --outro 2 --choir textbook --split-voices` | 50 | 18 | 50 | 50 | 100 | 23684 | 23684 |

music21 10.5.2, lxml 6.1.3; 68 GABC files. Accidentals music21 reads on the notes: natural 55584, flat 25184, sharp 16937.

Accidentals shown: 97923 of 97929 notes as music21's makeAccidentals would show them; differences:
- song--3411: Tenors bar 16 D#4: music21 shows it, the score omits it
- song--3411: Basses bar 16 D#4: music21 shows it, the score omits it
- song--3422: Tenors bar 19 E4: music21 shows it, the score omits it
- song--3422: Basses bar 19 E4: music21 shows it, the score omits it
- song--3453: Tenors bar 16 E-4: music21 shows it, the score omits it
- song--3453: Basses bar 16 E-4: music21 shows it, the score omits it

Failures: 0


The 18 refusals in the `song` set are the CLI declining a two-semitone key lift that leaves a
textbook choir's range (it says so and names the highest key that fits). No score was written
for them, so none was checked.

**Planted faults.** On copies of three scores, a pitch changed from D to E, a syllable changed
and one tie removed (both the `<tie>` and the `<tied>` elements) each failed the check. A tie
whose `<tie>` is removed but whose `<tied>` notation stays is *not* caught: music21 reads the
tie from the notation, and a notation program may do the same, so that fault is invisible to
this check.

**Accidentals.** The first run differed from music21 on 100 notes. All were courtesy
accidentals: the bar after a G was naturalised, music21 restates the key's G flat. The writer now does too
(the first note of a step in a bar, after the last bar altered it otherwise), which leaves 6
differences. All six are one style choice: music21 also restates an accidental the last bar
gave the same letter in a different octave (D natural in D3, then D sharp in D4). The writer
follows the common rule that an accidental holds for its own octave, and leaves these out.

**Spelling bug found by the unit tests.** In C (no sharps or flats), a note outside the key was
spelled sharp, so chant's B flat came out as A sharp. Outside notes are now spelled sharp only
in a sharp key and flat otherwise.

## Not checked

- No notation program has opened the files here (none installs in this container). music21
  and the XSD cover the file's content and grammar, not how MuseScore, Dorico, Sibelius or
  Finale lay it out. A person should open one TTBB score and one key-lift score in MuseScore.
- The bar grid is the backing's 4/4. Whether a choir reads chant comfortably in 4/4 with ties,
  or would rather have unbarred notation with the beat marked, is a director's call.
- A key lift whose first lifted note falls mid-bar changes the key signature at the start of
  that bar, so the bar's earlier notes are spelled in the new key (right pitches, possibly an
  accidental more).
