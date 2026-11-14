# Chant Forge

Gregorian chant and traditional Catholic hymns, arranged for the gym: all-male
choir lines over deep house, EDM, hard rock and metal. This is a long-term
production project (owner, 2026-11-03: "very masculine stuff for the gym. all
male choirs. would be fun to make as a long term project. also being able to
publish to spotify etc."). The plan is in [`ROADMAP.md`](ROADMAP.md).

The code is open source (MIT). The pipeline goes from public-domain chant to a
released track:

1. **Source:** chant in GABC (the notation Gregorio typesets), each piece
   transcribed from a cited public-domain edition ([`corpus/`](corpus/README.md)).
2. **Convert** (this slice): GABC to a MIDI choir line with Latin lyrics,
   transposed for men's voices and fitted to a grid.
3. **Arrange:** genre templates (drums, bass, synths, guitars) built around
   the line. Not built.
4. **Voice:** a real men's choir (recorded) or a singing synthesiser. Not built.
5. **Release:** loudness (done, `master-cli.mjs`), metadata, credits and AI-disclosure checks before a
   distributor upload (done: `node release-cli.mjs release.json`, 7 tests, 2026-11-03).

## Try it in the browser

[`index.html`](index.html) ([live](https://marisstella.app/chant-forge/)) is a studio page over the same modules: paste GABC (or load one of the five corpus
pieces), pick tempo, genre, bar fitting, half-time and a drone, then press Convert, play the preview and download
the MIDI or a preview WAV. It runs entirely client-side (2026-11-03). To make that possible `midi.mjs` and
`render.mjs` no longer use Node's `Buffer` (`browser-safe.test.mjs` runs the pipeline with `Buffer` deleted).
Checked in headless Chromium on Dies irae and Pange lingua with the metal backing; nobody has listened yet.
Alternatives people use today: Gregorio plus LilyPond/MuseScore by hand (print, not MIDI with a genre backing), and
Gregorio's own web editors (notation only). This one's niche is chant as a source for gym-genre tracks.

## Hear it without a DAW

```sh
node ventures/chant-forge/render-cli.mjs dies-irae.mid -o dies-irae.wav
node ventures/chant-forge/master-cli.mjs dies-irae.wav
```

`render-cli.mjs piece.mid --stems stems/` also writes one WAV per voice (choir, organ, bass, chords, drums) that sum to the mix, for mixing in a DAW.

`render-cli.mjs` is a plain preview synthesiser (choir pad, organ drone, bass,
chord pad, synthesised drums; no dependencies, deterministic, about 2 s for a 3-minute
piece). It is for the ear check and for running the master check on real audio. It is not a
release master and the choir is not a real choir (`RECORDING-GUIDE.md`).

## What works now

```sh
node ventures/chant-forge/cli.mjs ventures/chant-forge/examples/dies-irae-incipit.gabc \
  --bpm 124 --fit 8 --final 50 --drone -o dies-irae.mid
```

```
Dies irae (first line only): 8 notes, C3-F3 (ambitus 5 semitones), final D3
mode 1
2.00 bars, 3.9 s at 124 BPM
wrote dies-irae.mid
```

- `gabc.mjs` reads the following:
  - c and f clefs on lines 1–4, plus the `cb` flat clef;
  - pitches `a`–`m`;
  - flats, naturals and sharps (`x y #`), which last to the end of the word or the next bar;
  - the punctum mora (`.`) and the episema (`_`);
  - custodes (`g+`), which are not sung;
  - the four bars `, ; : ::`.

  Neume shapes (virga, quilisma, liquescents and so on) are treated as plain
  notes. A note before any clef is assumed to be in c4, with a warning.
- `fitStretch` (`--fit 8 --stretch`) lengthens the long notes of a phrase (each at most 2x) to fill the bar first and pads only the remainder; on the five corpus pieces it cuts padded rest by about half. Not yet compared by ear.
- `halfTime` (`--halftime`) doubles every chant duration while the drums, bass and chords keep their tempo, so the chant moves at half speed over a full-time metal backing. Dies irae at 170 BPM goes from 98 to 196 bars (138 s to 277 s). 3 tests in `halftime.test.mjs`. Not listened to.
- `--repeat N` (2026-11-03) plays the whole chant N times in a row (1 to 64), so a one-minute chant can fill a track length a distributor and a listener expect; the genre backing and cue sheet follow the longer piece. 2 tests in `repeat.test.mjs`. Not listened to; a repeated chant with no variation may tire the ear, which only a listener can judge.
- `fitToBars` pads the rest after each full bar so the next phrase starts on a
  downbeat. Chant has no metre, and this is the simplest way to put it on a grid
  without changing any note's length.
- `summarize` reports range, ambitus and final. It also checks the final
  against the `mode:` header (modes 1–2 end on re, 3–4 on mi, 5–6 on fa, 7–8 on
  sol), which catches a transcription that is off by a step.
- `midi.mjs` writes a format-1 MIDI file with no dependencies:
  - a conductor track with tempo, 4/4 and the title;
  - the choir line (GM Choir Aahs) with one lyric event per syllable;
  - an optional drone on the final, an octave down (GM Church Organ).

Tests: `node --test ventures/chant-forge/chant-forge.test.mjs` (8 tests,
passing 2026-11-03). On 2026-11-03 the example's output was also read back with
an independent parser (Python `mido` 1.x): 3 tracks, 3.87 s, lyrics in order.

## Song sections (2026-11-13)

`--sections` (with `--genre`) turns the one groove that ran under the whole chant into a song: intro, verses, builds,
drops and an outro. The chant supplies the form. Every double bar (`::`) closes a section: a verse of a strophic hymn,
a whole antiphon, or one pass of `--repeat`. `sections.mjs` turns those cuts into whole bars, merges sections shorter
than four bars (the simple-tone Te Deum has 28 double bars), makes the first chant section a verse and the last a
drop, and alternates the ones between, counted back from the last. Intro bars (`--intro N`) and the new
`--outro N` bars are sections of their own.

`genre.mjs` makes each energy from the genre's own bar by taking parts away, so all four genres get it: the intro
keeps hats, ride and softer chords; a verse drops the crash and the chord part (the choir carries the harmony) and
softens drums and bass; a drop is the bar as written, with a crash on its first downbeat; the outro keeps hats and
chords, then ends on one held chord and a crash. A section that leads into a drop ends on a build bar: kicks on 1 and 2,
a snare roll that speeds from quarters to sixteenths and swells, bass and chords held under it, and the last eighth
empty for every part, so the drop lands out of silence. `--fills` skips intro, outro and build bars. Each section gets
a MIDI marker named after it (DAW locators). The studio page has a "Song sections" switch (two bars of intro and outro).

```
node cli.mjs corpus/pange-lingua-full.gabc --final 52 --fit 8 --stretch --genre deep-house --sections --intro 2 --outro 2 -o pange.mid
sections: Intro bar 1-2; Verse 1 bar 3-11 (build); Drop 1 bar 12-20; Verse 2 bar 21-29 (build); Drop 2 bar 30-38; ...; Outro bar 57-58
```

Measured on the six-verse Pange lingua through the preview renderer, backing only, mean power per section (verse
bars without their build bar):

| genre | intro | verse | drop | outro |
|---|---|---|---|---|
| deep house, 124 BPM | -29.3 dB | -21.1 dB | -19.3 dB | -25.0 dB |
| EDM, 140 BPM | -31.4 dB | -22.2 dB | -20.5 dB | -27.1 dB |
| hard rock, 140 BPM | -27.0 dB | -21.0 dB | -17.5 dB | -24.4 dB |
| metal, 170 BPM | -26.5 dB | -19.3 dB | -16.9 dB | -26.1 dB |

So a drop is 1.7 to 3.5 dB above its verse and the intro 6 to 9 dB below. Whether that is enough lift, and whether
the air gap before a drop sounds deliberate rather than like a dropout, are ear questions nobody has answered.
`sections.test.mjs` (11 tests): one section per verse of the six-verse hymn, each starting on its verse's first
downbeat; the Te Deum merges to sections of 4+ bars; per genre, the intro has no kick, snare or bass, verses have no
chords or crash, the build's snare gaps shrink and its velocities rise, nothing sounds in the last eighth, the drop
opens on a crash, the outro ends on a held three-note chord, every pitched note stays in the mode; without
`--sections` the backing is byte-for-byte what it was; rendered, intro < verse < drop; markers in the file; the CLI
flags. `eval/browser-e2e.mjs` adds 20 checks (every sample with every genre and sections on): 58, all pass.

### Breakdown and riser (2026-11-13, later)

Three verse/drop turns in a row sound like a loop, so a piece with four or more chant sections now turns the verse
before the last drop into a **breakdown**: drums and bass out, the choir alone for the first half, then one soft held
chord per bar that gets louder into the build. `--no-breakdown` keeps it a verse; the bars are the same either way.
Every **build** bar also changes harmony now: it holds the mode's approach chord (bVII in Dorian and Mixolydian, bII
in Phrygian, II in Lydian; all scale degrees, so nothing leaves the mode) instead of whatever the four-bar loop had
there, so the drop's first chord on the final resolves it, and a riser climbs seven eighths up the mode an octave
above the chords, louder each step, stopping at the air gap.

```
node cli.mjs corpus/pange-lingua-full.gabc --final 52 --fit 8 --stretch --genre deep-house --sections --intro 2 --outro 2 -o pange.mid
sections: Intro bar 1-2; Verse 1 bar 3-11 (build); Drop 1 bar 12-20; Verse 2 bar 21-29 (build); Drop 2 bar 30-38; Breakdown bar 39-47 (build); Drop 3 bar 48-56; Outro bar 57-58
```

Measured by `node eval/section-levels.mjs` (backing only, mean power per kind of bar, build bars counted apart from
their sections; the choir is not in this render, so the breakdown's first half measures as silence):

| genre | intro | verse | drop | breakdown | build | outro |
|---|---|---|---|---|---|---|
| deep house, 124 BPM | -28.8 dB | -20.6 dB | -18.8 dB | -31.9 dB | -18.3 dB | -24.5 dB |
| EDM, 140 BPM | -31.4 dB | -22.2 dB | -20.5 dB | -34.7 dB | -20.9 dB | -27.1 dB |
| hard rock, 140 BPM | -27.0 dB | -21.0 dB | -17.4 dB | -32.4 dB | -18.6 dB | -24.4 dB |
| metal, 170 BPM | -26.5 dB | -19.3 dB | -16.9 dB | -35.3 dB | -21.8 dB | -26.1 dB |

So the breakdown sits 11 to 16 dB under the verses and the last drop comes back 13 to 18 dB above it. The riser is
quiet by design (velocities 50 to 110 on the chord pad); whether it is audible enough over the snare roll,
and whether choir-alone for four bars feels like a breath or a dropout, are ear questions nobody has answered.
`sections.test.mjs` (7 new tests, 18 in all): only the verse before the last drop changes, only on four or more
sections (three with `breakdown: true`), same bars with it off; for each genre and modes 1, 3, 5 and 7, no drums or
bass in the breakdown, two silent bars then rising held chords, both builds hold the approach chord with a riser of
seven rising, swelling eighths ending before the air gap, the bass on the approach root, every note in the mode,
no fills in the breakdown; rendered, breakdown < verse < drop and both drops within 5%; the CLI flag.
The studio page lists the six-verse Pange lingua and seven-verse Veni Creator as samples (before, its samples were all
one-section pieces, so a breakdown could only be heard on pasted GABC); `eval/browser-e2e.mjs` checks the six-verse
hymn shows a breakdown before its last drop: 77 checks, all pass.

### A cappella first verse and a key lift (2026-11-13, latest)

Two moves pop and dance arrangers reach for, now options on `--sections`:

- `--a-cappella`: the first verse is the choir alone. No drums, bass or chords until that verse's last bar, where
  the build's kick and snare roll bring the band in for the first drop. A chant with one section (no inner double
  bar) is refused, since no drop follows.
- `--key-lift N`: the last drop and the outro go up N semitones (2 = a whole tone, the "truck driver's" key change of
  a final chorus). The build bar into that drop is already in the new key, so its approach chord resolves there. With
  a whole-tone lift that chord stands on the old final: in Mixolydian it is the old tonic chord itself, in Dorian
  the old tonic with a major third. The choir's line before the lift ends on the old final, so it sits on that root.
  `--drone` (one note under everything) is refused with a lift.

The lift is the one change here that can push singers out of their range, so it is checked. `--final` still names the
song's key (the last drop sounds N higher); the lifted notes must stay inside the singing range, E2-E4 by default or
`--range LOW-HIGH` in MIDI numbers, or the command stops and names the highest key that fits. `--suggest-final` and
`--auto-final` count the lifted drop when `--key-lift` is given. To make that possible, the pitch choice now happens
after bar fitting, half time and repeats (none of them change a pitch); seven sample commands without the new flags
give byte-identical MIDI and text to before.

```
node cli.mjs corpus/pange-lingua-full.gabc --fit 8 --stretch --genre deep-house --sections --key-lift 2 --final 57 -o p.mid
--key-lift 2 puts the last drop up to A4, above E4; use --final 52 or lower, --auto-final, a smaller lift, or --range
node cli.mjs corpus/pange-lingua-full.gabc --fit 8 --stretch --genre deep-house --sections --key-lift 2 --suggest-final
finals that fit E2-E4 with the last drop lifted 2: F#2 to E3; recommended --final 47 (B2)
node cli.mjs corpus/pange-lingua-full.gabc --auto-final --fit 8 --stretch --genre deep-house --sections --intro 2 --outro 2 --a-cappella --key-lift 2 -o p.mid
sections: Intro bar 1-2; Verse 1 (a cappella) bar 3-11 (build); Drop 1 bar 12-20; Verse 2 bar 21-29 (build); Drop 2 bar 30-38; Breakdown bar 39-47 (build); Drop 3 bar 48-56 (key up 2); Outro bar 57-58
```

Measured by `node eval/key-lift-check.mjs` (`eval/key-lift-check.md`): the rendered bass fundamental in each bar of
the lifted Drop 3 against the Drop 2 bar at the same place in the loop, expected ratio 2^(2/12) = 1.1225:

| genre | bars | median ratio | min | max | a cappella verse backing peak, bars after the first |
|---|---|---|---|---|---|
| deep house | 8 | 1.1216 | 1.1194 | 1.1222 | 0 (silent) |
| EDM | 8 | 1.1239 | 1.1194 | 1.1239 | 0 (silent) |
| hard rock | 8 | 1.1239 | 1.1194 | 1.1239 | 0 (silent) |
| metal | 8 | 1.1203 | 1.1169 | 1.1236 | 0 (silent) |

The spread is the autocorrelation's whole-sample lag at 22.05 kHz. The a cappella verse's first bar carries the
intro's release tail (peak 0.008-0.09), which is a fade rather than a cut. The full lifted arrangement, rendered
with `--lufs -14 --limit`, passes `master-cli.mjs`: -14.0 LUFS, -1.05 dBTP. `lift.test.mjs` (6 tests): the a cappella
bars are empty in every genre and its build has kicks; with the lift, every bar before the build is unchanged,
drums never move, bass and chords from the build on are exactly 2 semitones up; the lifted build chord's root is
the old final; `liftEvents` raises exactly the last verse's notes; the CLI refusal's bound equals
`--suggest-final`'s highest key and one semitone above it is refused; `--auto-final` keeps every note in E2-E4 for
three multi-section pieces at lifts of 1-3. The studio page has "First verse" and "Last drop" switches (a
one-section chant gets a note instead of an error); `eval/browser-e2e.mjs`: 82 checks, all pass. Whether a whole
tone sounds like a lift or a lurch at these tempos, and whether singers can hold the lifted last verse after five
others, are questions for a person and a choir.

### Singer guidance in the cue sheet (2026-11-13)

A singer learning the line against the guide track loses the pitch in three places: an a cappella verse with
nothing under it, a breakdown where the drums and bass drop out, and the key change into the last drop. With
`--sections`, `--cues FILE` now writes a guidance line above the first note of each section (`cues.mjs`
`sectionCues`): what the band does under it, the first note and its interval from the last note sung, when the band
comes in after an a cappella verse or comes back after a breakdown, and, for the lifted drop, the new key's first
note next to the one it would have been. Without `--sections` the sheet is byte-for-byte what it was.

```
node cli.mjs corpus/pange-lingua-full.gabc --auto-final --fit 8 --stretch --genre deep-house --sections --intro 2 --outro 2 --a-cappella --key-lift 2 --cues cues.txt
-- Verse 1 (a cappella), bar 3, 3.87 s: Choir alone, no backing. Come in after the 2-bar intro; first note B2 on "Pan": take it from a pitch pipe or the guide track. The band comes in on the build at bar 11 (19.35 s): hold your pitch, it will not move.
-- Breakdown, bar 39, 73.55 s: Drums and bass drop out; you carry it over a held chord. First note B2 on "Tan", the same as your last note. The band is back at bar 48 (90.97 s).
-- Drop 3, bar 48, 90.97 s: Full band, key up 2 semitones. First note C#3 on "Ge", a whole tone up from your last note (B2). In the old key it would be B2; the build bar before it plays the approach into the new key, so pitch from that.
```

The whole sheet is `eval/cues-sections-pange-lingua.txt` (318 note rows, 6 guidance lines). A section's line goes
on the first note after the double bar that opens it, the same note `liftEvents` starts the lift on, so the last note
of a verse that shares a bar with the next section stays under its own verse. `cues.test.mjs` (4 new tests, 8 in
all): interval names, an unchanged sheet without a plan, one line per sung section with the drop's line on exactly
the first lifted note, and the CLI sheet's rows unchanged in count with the line above bar 48. Whether singers find
the lines useful, or would rather see them in a separate column, is for a choir to say.

### Cue sheet and timed lyrics on the studio page (2026-11-13)

The studio page (`index.html`) now has "Download singer's cue sheet" and "Download timed lyrics (LRC)" beside the
MIDI and WAV buttons, and with song sections on it prints the per-section guidance lines under the summary, so a
singer sees where the band drops out and where the key moves without opening the sheet. Both downloads are built
from the same events as the page's MIDI (the two intro and outro bars included), with `cues.mjs` and `lrc.mjs`, the
modules the CLI uses. `eval/browser-e2e.mjs` (86 checks, all pass) downloads them in headless Chromium for the
six-verse Pange lingua over EDM with an a cappella first verse and a whole-tone lift, runs
`cli.mjs ... --sections --intro 2 --outro 2 --a-cappella --key-lift 2 --cues --lrc` on the same file, and finds both
files byte-for-byte equal (324 lines with 6 guidance lines; 37 LRC lines). Without sections the downloaded sheet has
note rows only. `browser-safe.test.mjs` checks both modules run without `Buffer`. Whether singers use the sheet is
still for a choir to say.

### Phrase markers and stems on the studio page (2026-11-13, later)

The page now has a "Phrase markers" option and a "Download stems (ZIP of WAVs)" button, so the whole DAW hand-off
the command line offers is in the browser. Markers put a MIDI marker (meta 0x06) at each phrase start, beside the
section locators the MIDI already carried. The stems button renders the page's MIDI once more with
`renderMidi(midi, { stems: true })` (only when clicked: a second render costs about as much as the preview) and zips
one 16-bit WAV per part as `chant-<voice>.wav`. The ZIP writer is the new browser-safe `files.mjs`: stored entries
(WAV barely deflates), CRC-32, UTF-8 names and a fixed date, so the same stems give the same archive; the page's WAV
writer moved there too. `files.test.mjs` (4 tests) checks the WAV bytes against `render.mjs`'s `encodeWav`, the CRC
against Node's zlib, the archive against Python's `zipfile` and `unzip -t`, and that the module needs no `Buffer`.

`eval/browser-e2e.mjs` (89 checks, all pass) drives it in headless Chromium on the six-verse Pange lingua over EDM
with sections, an a cappella first verse and a whole-tone lift: the downloaded MIDI equals
`cli.mjs ... --markers -o` byte for byte (16,673 bytes, 36 phrase markers); the ZIP's four stems (bass, choir, chords,
drums) equal `render-cli.mjs chant.mid --stems DIR` file for file; and the stems sum to the downloaded preview WAV to
within 2 steps of 32,767 at every sample (each file rounds to 16 bits on its own). Whether the markers land where a
producer wants them and whether the stems import cleanly is for someone with a DAW to say.

## Tenors and basses by phrase (2026-11-13)

`--split-voices` is for a chant that a full men's choir cannot sing in unison. The E2-E4 range above is the textbook
**bass** range. With the textbook tenor range (C3-A4), the band where both sections can sing is C3-E4, 16 semitones.
Of the 67 corpus files (the 59-file 1908 Graduale batch and the 8 pieces), 60 fit that band and **7 do not**: each
spans 17 semitones, one more than the band holds. None is wider than E2-E4, so `--auto-final` never refused one
(the ROADMAP's "none needs it" was about E2-E4).

`splitVoices` (`voicefit.mjs`) picks one final and, for each phrase (the notes between two bars of any kind), who
sings it: the full choir when every note is in C3-E4, otherwise the tenors or the basses alone. Two half-choirs
trading phrases is the old *alternatim* habit. It maximises the notes the full choir sings, then keeps changes of
singer to a minimum, then centres the line. With `--final` it keeps your final and refuses if a phrase is out of
both ranges. `--tenor L-H` and `--bass L-H` change the ranges. The MIDI then has a **Tenors** track and a **Basses** track
(channels 1 and 5, both Choir Aahs, lyrics on each). Unison notes appear in both tracks, so each section's part is
complete on its own. The cue sheet gets a `who` column (`all`, `T`, `B`). The studio page has it as the Final note
option "Tenors and basses by phrase".

```
node cli.mjs corpus/dies-irae.gabc --split-voices --fit 8 --cues dies.txt -o dies.mid
voices: full choir on 600 of 613 notes (C3-E4); tenors alone on phrase 54 (13 notes); final F3
```

| file | piece | final | full choir | alone |
|---|---|---|---|---|
| gregobase-1908/3407 | Benedictus Dominus (Alleluia) | E3 | 198 of 219 (90.4%) | basses, 21 notes, B2-B3 |
| gregobase-1908/3422 | Confiteantur tibi (Gradual) | F3 | 243 of 254 (95.7%) | tenors, 11 notes, A3-F4 |
| gregobase-1908/3432 | Solemnitas (Alleluia) | F3 | 184 of 216 (85.2%) | tenors, 15 notes, Bb3-F4 |
| gregobase-1908/3444 | Constitues eos principes (Gradual) | E3 | 214 of 236 (90.7%) | basses, 22 notes, B2-A3 |
| gregobase-1908/3445 | Sapientia aedificavit (Gradual) | E3 | 199 of 215 (92.6%) | basses, 16 notes, B2-B3 |
| dies-irae | Dies irae (Sequence) | F3 | 600 of 613 (97.9%) | tenors, 13 notes, F3-F4 |
| salve-regina | Salve Regina (Antiphon) | E3 | 227 of 231 (98.3%) | basses, 4 notes, B2-E3 |

In every one of the seven, a single phrase goes to one section and the full choir sings the rest (two changes of
singer). The more common fix, a falsetto top note or a basses-only low note inside a phrase, is not what this does:
by default the split is at a bar, where singers breathe (see "Handing over at a word" below for when it is not). Not checked: the ranges are textbook ranges, not measured on
real singers, and the preview renderer sums unison notes from both tracks, so full-choir phrases sound about 6 dB
louder than solo-section ones in the preview WAV. Real sections would add about 3 dB.
`split.test.mjs` (7 tests): every note of all 67 files is in its singers' range and exactly 7 files split; a
synthetic line gives a high phrase to tenors and a low one to basses; a phrase wider than both sections and an out-of-reach
`--final` are refused; phrases are cut at every bar kind; the Dies irae MIDI has 613 tenor and 600 bass notes; the cue
sheet's who column counts 13 T and 600 all; without the flag the choir line is unchanged. `eval/browser-e2e.mjs`
(95 checks since the word split) finds the page's split MIDI and cue sheet byte-equal to the CLI's, with and without `--split-words`.

**Fixed on the way:** the CLI judged "final matches the mode" after `--final` or `--auto-final` had moved the line,
so a Dies irae moved to F3 said "check the transcription". It now judges the final as written, as the studio page
already did.

## Handing over at a word (2026-11-13, later)

A phrase is the smallest unit `--split-voices` used to hand over. That fails when one phrase is wider than either
section can sing, and it gives a whole phrase to one section when only one word in it is out of the shared band.
`splitVoices` now walks **words** (a new word starts at a syllable that begins one) and can hand over between two words
of a phrase, never inside a word. Three settings, each an exact minimum over every split at word boundaries and every
final (a dynamic programme; `split.test.mjs` checks it against brute force on 300 random lines):

- **default:** hand over inside a phrase only when no whole-phrase split fits, and then as few times as possible. On
  the textbook ranges this gives byte-identical results to the bar-only split on all 67 files (tested).
- **`--split-words`:** also hand over at a word when each handoff wins the full choir **more than** `--word-cost`
  notes (default 3; a section taking one word and handing back is two handoffs, so it must win more than 6).
- `words: 'never'` in the API keeps the bar-only behaviour.

The Dies irae's phrase 54 needed the tenors only for its first word:

```
node cli.mjs corpus/dies-irae.gabc --split-voices --split-words -o dies.mid
voices: full choir on 607 of 613 notes (C3-E4); tenors alone on part of one shared phrase (6 notes); phrase 54 handed over at a word: tenors "Judicándus", all "homo reus:"; final F3
```

`eval/word-split.mjs` (report: `eval/word-split-report.md`) runs the corpus under three pairs of section ranges. The
ranges are assumptions, not measured singers:

| ranges | bar-only: files that fit | default: files that fit (handoffs) | full choir, bars / `--split-words` |
|---|---|---|---|
| textbook, T C3-A4, B E2-E4 | 67 | 67 (0) | 99.1% / 99.2% |
| amateur, T D3-F4, B G2-C4 | 67 | 67 (0) | 74.6% / 82.2% (129 handoffs in 43 files) |
| octave, T E3-E4, B A2-A3 | 50 | 56 (7 handoffs in 6 files) | 12.3%* / 27.0% |

\* over the 50 files that fit at bars; the 56 that fit with words give 10.5% by default. The corpus's widest phrase is
14 semitones, so with real men's sections (21 and 24 semitones) the default never needs a word; words matter for
narrow or beginner sections, and `--split-words` matters most for the amateur pair, where 7.6 points more of the notes
go to the full choir for about three handoffs per file. Whether a handoff between two words sounds better to a
congregation than a whole phrase sung by one section is a question for singers, not this measurement. A word wider than
both ranges, or one that straddles the gap between them at every final, is still refused, and the message names the
widest word. The cue sheet's `who` column and the two MIDI tracks already work note by note, so they needed no change.

## Overlapped handoffs (2026-11-13, latest)

A handoff inside a phrase from the tenors straight to the basses (or back) leaves a gap in the line between two words:
one section stops and the other has to find its first note cold. `--overlap` (with `--split-voices`) closes it where
it can: if the outgoing section's last note before the seam is in both ranges, the incoming section **joins early** and
sings it too, taking its pitch from the singers it relieves; otherwise, if the incoming section's first note is in both
ranges, the outgoing section **holds on** for it. That note is tagged `all`, so the MIDI puts it on both tracks and the
cue sheet's `who` column says `all`. A handoff to or from the full choir never breaks the line, and a seam at a bar is a
breath, so neither is touched. Where neither seam note is in both ranges the summary says how many handoffs break.

```
node cli.mjs corpus/gregobase-1908/3408.gabc --split-voices --split-words --overlap --tenor 52-64 --bass 45-57 --cues q.txt
voices: ...; phrase 12 handed over at a word: basses "nem", tenors "tuam"; phrase 12: tenors join basses on F#3 ("nem") and take over; final F#3
```

`eval/overlap-check.mjs` (report: `eval/overlap-report.md`) runs the corpus under the same three range pairs as the
word split. The finding: **direct swaps are rare, and every one in the corpus can overlap.** With textbook or amateur
ranges the shared band is wide enough that the split always passes through the full choir (0 direct swaps, so
`--overlap` changes nothing); only octave-wide sections (shared band E3-A3) produce them: 7 with the default
setting, 13 with `--split-words`, 9 with `--word-cost 0`, and in every case a seam note is in both ranges (0 breaks;
about two in three join early). The full-choir share moves by 0.1 point. The option is off by default because whether
a one-note overlap sounds better than a clean handoff is for singers to judge; the studio page uses the textbook
ranges, where it never fires, so it has no switch there. `split.test.mjs` covers join, hold, break, bars and full-choir
neighbours, and checks every overlapped note against both ranges on the corpus.

## Three sections: baritones between tenors and basses (2026-11-13, latest)

Many men's choirs sing in three sections, not two. `--baritones` (with `--split-voices`) adds a baritone section
between the tenors and the basses (default A2-F4, MIDI 45-65; `--baritone LOW-HIGH` sets it and implies
`--baritones`). A phrase, or a word when a handoff inside a phrase is allowed, can then go to all three sections, to
two of them (tenors and baritones, baritones and basses) or to one. The DP now counts **section-notes left out**
(a note one of three sections sings leaves out two) and keeps that as low as it can, then the changes of singer, as
before. With two sections this is exactly the old count of notes the full choir does not sing, so every
two-section result is unchanged (all 18 earlier `split.test.mjs` tests pass untouched). `--overlap` generalises
too: any handoff between two sets with no section in common (tenors to basses, tenors and baritones to basses) gets
a seam note sung by both sets where one fits. The MIDI gets a Baritones track (channel 6) between the Tenors and
the Basses, each note on every section's track that sings it; the cue sheet's `who` column says `T+Bar`, `Bar+B`,
`Bar` and so on; the studio page has a "Tenors, baritones and basses by phrase" choice, byte-equal to the CLI's
(`eval/browser-e2e.mjs`).

```
node cli.mjs corpus/dies-irae.gabc --split-voices --baritones
voices: full choir on 600 of 613 notes (C3-E4); tenors and baritones together on phrase 54 (13 notes); final F3
```

`eval/three-sections.mjs` (report: `eval/three-sections-report.md`) runs the corpus under the same three range
sets as the word split, each with a baritone section between its tenors and basses. Those ranges are assumptions,
not measurements. What baritones buy:

- **Textbook ranges:** nothing changes in what fits (67 of 67 either way) or in the full-choir share (99.1%), but
  the 0.9% of notes one section sang alone now always have two sections on them (100% two or more).
- **Amateur ranges:** notes one section carries alone fall from 25.4% to 2.5%. The full-choir share moves from
  74.6% to 74.4%, because the count now prefers two sections on many notes over three on a few; changes of
  singer go from 261 to 280.
- **Octave-wide sections:** 64 of 67 files fit instead of 56 (the Dies irae, the Salve Regina and six 1908
  hymns become singable), and notes on one section alone fall from 89.4% to 29.9%. The cost is changes of singer:
  484 against 166, over more files. Whether that many entrances and exits sound like a choir or a relay is for
  singers to say.

`split.test.mjs` (5 new tests, 23 in all) checks every note against the range of every section that sings it on
all 67 files under two range sets, brute-forces the DP against every assignment on 150 random chants, checks the
MIDI tracks against the per-section note counts and the CLI's flag checks. Not tried with singers.

## Short entrances: a cost per section entrance (2026-11-13, latest)

The three-section split raised changes of singer from 166 to 484 with octave-wide ranges, and the open question was
whether those were sections popping in for a few notes, which a cost on short entrances could trade back.
`--entrance-cost N` (with `--split-voices`; `entranceCost` in `splitVoices`) charges every section entrance after
the first note N section-notes, in the same currency as the notes a section leaves out. A section that joins for a
passage and leaves again therefore comes in only when it sings more than N notes there (at exactly N, the fewer
changes of singer win the tie). The DP stays exact: an entrance is a property of one transition, so it adds to the
cost like anything else (brute-forced on 150 random chants). The default is 0, which keeps every earlier result.

```
node cli.mjs corpus/dies-irae.gabc --split-voices --baritones --tenor 52-64 --baritone 48-60 --bass 45-57 --entrance-cost 8
```

`eval/entrance-cost.mjs` (report: `eval/entrance-cost-report.md`) measured it on the corpus, and the answer to the
question is mostly no:

- **The entrances were not short.** With three octave-wide sections and no cost, a section that enters and later
  leaves sings a median of 19 notes before it leaves; 1 of 238 such entrances lasts under 4 notes and 18 under 8.
  The changes of singer come from whole phrases alternating between sections the ranges force, not from cameos.
- **So the cost buys little until it is large.** Octave-wide, three sections: cost 8 cuts changes of singer from
  484 to 435 (10%) for 200 more section-notes left out (15,513 to 15,713, 1.3%); cost 16 cuts them to 342 (29%)
  for 6.7% more left out, and the share of notes two or more sections sing falls from 70.1% to 65.9%. Two
  octave-wide sections: 166 to 123 changes at cost 8. Amateur ranges barely move below cost 12.

The option is there for a director who would rather have fewer entrances than fuller texture; it is not a default.
If the changes of singer are a problem for real singers, the lever is the ranges (or a fourth section), not a
penalty. `split.test.mjs` (4 new tests, 27 in all) covers the tie at N, the brute-force check, the corpus count and
the CLI flag. Not tried with singers.

## Four sections: first and second tenors (TTBB, 2026-11-13, latest)

Most men's choral writing is in four parts, TTBB. `--second-tenors` (with `--split-voices`, usually with
`--baritones`) splits the tenors into first and second tenors; `--tenor` is then the first tenors' range and
`--tenor2 LOW-HIGH` (default C3-G4, MIDI 48-67, a rule of thumb; it implies `--second-tenors`) the second tenors'.
The DP is the same one: a phrase or word goes to any of the 15 sets of four sections whose common range holds it,
leaving out as few section-notes as possible, then with as few changes of singer (brute-forced against every
assignment on 120 random chants). Without the flag every one-, two- and three-section result is unchanged. The MIDI
gets a Second tenors track (channel 7) after a track now named First tenors; the cue sheet's `who` column says `T1`,
`T2`, `T1+T2+Bar` and so on; the studio page has a "First and second tenors, baritones and basses (TTBB)" choice.

```
node cli.mjs corpus/dies-irae.gabc --split-voices --baritones --second-tenors --tenor 52-64 --tenor2 50-62 --baritone 48-60 --bass 45-57
```

`eval/four-sections.mjs` (report: `eval/four-sections-report.md`) measured TTBB against the three-section choirs of
`eval/three-sections.mjs` on the corpus, building the fourth section two ways: **split** (the same tenors divided, the
second tenors two semitones lower at the top, so the choir's compass is unchanged) and **higher** (a first-tenor
section a minor third above the old tenors). Ranges are assumptions. Because a full choir of four is harder to reach
than one of three, the fair comparison is the share of the choir singing an average note, not the full-choir share.

- **A fourth section helps in the middle, not on top.** Octave-wide sections, split: 65 of 67 files fit instead of 64
  (`3407.gabc` gained); notes one section carries alone fall from 29.9% to 13.7%, notes with three or more sections
  rise from 10.2% to 49.8%, and the share of the choir per note moves from 59.9% to 61.4%. The cost is changes of
  singer, 484 to 569, and entrances, 319 to 487. Octave-wide, higher: nothing gained (64 files) and the share falls to
  47.3%, because the new top section reaches few of the chant's notes once the line sits for the lower three.
- **With wide ranges there is nothing to buy.** Textbook ranges fit all 67 files with three sections at 99.8% of the
  choir per note; TTBB is the same (99.7%) with 17 changes of singer instead of 14. Amateur ranges, split: three or
  more sections on 87.6% of notes instead of 74.4%, the same share of the choir (90.7% against 91.0%) and the same
  280 changes, but 223 entrances instead of 160.

So for a chant, TTBB is a texture choice rather than a range fix: it puts more sections on each note when the
sections are narrow, and it never makes a chant singable that three sections at textbook ranges cannot sing. A
director with an octave-wide amateur choir gains most from it. `split.test.mjs` (5 new tests, 32 in all) checks every
note against the ranges of every section singing it on all 67 files under two TTBB range sets, the corpus counts, the
brute-force check, the MIDI tracks against per-section counts and the T1/T2 cue column. Not tried with singers.

## A choir by name: `--choir` (2026-11-13, latest)

Four range flags were a lot to ask of a choir director, and the eval scripts had been comparing the same three
range sets all day. `--choir textbook|amateur|octave` makes each set one option (also a "Choir ranges" choice on the
studio page):

| `--choir` | tenors | second tenors | baritones | basses | unison band |
|---|---|---|---|---|---|
| `textbook` | C3-A4 | C3-G4 | A2-F4 | E2-E4 | C3-E4 |
| `amateur` | D3-F4 | D3-Eb4 | B2-D4 | G2-C4 | D3-C4 |
| `octave` (beginners) | E3-E4 | D3-D4 | C3-C4 | A2-A3 | E3-A3 |

The ranges are rules of thumb, not measurements of any choir. `--tenor`, `--bass` and the others still override
one section at a time. Without `--split-voices`, the preset also sets the unison range for `--suggest-final`,
`--auto-final` and the key-lift check to the **band every section reaches**, and when the chant does not fit it, the
message names the fewest sections that can sing it and the flags to add:

```
$ node cli.mjs corpus/dies-irae.gabc --choir octave --suggest-final
ambitus 17 semitones is 12 wider than E3-A3; the octave choir can sing it as tenors, baritones and basses: add --split-voices --baritones
```

With no `--choir`, nothing changes: the unison range stays E2-E4. `eval/choir-presets.mjs` (report:
`eval/choir-presets-report.md`) asked, for every corpus file, the fewest sections each preset needs:

| choir | unison | T+B | T+Bar+B | TTBB | none fits |
|---|---|---|---|---|---|
| textbook | 60 | 7 | 0 | 0 | 0 |
| amateur | 12 | 55 | 0 | 0 | 0 |
| octave | 0 | 56 | 8 | 1 | 2 |

- **The default E2-E4 overstates what a whole choir sings in unison.** It fits all 67 files, but it is the textbook
  bass range; the band textbook tenors *and* basses share, C3-E4, fits 60. The other 7 are the files
  `--split-voices` was built for.
- **An amateur choir splits almost everything,** but never needs more than two sections.
- **A beginners' choir with octave-wide sections never sings unison** (the shared band is five semitones), needs a
  third section for 8 files and TTBB for one (`3407`), and cannot sing two 1908 chants (`3405`, `3427`) in any
  voicing tried. These counts agree with the three- and four-section reports (64 and 65 files fit).

`choir.test.mjs` (5 tests) checks that each preset's unison band lies inside every section, that on all 67 files
under every preset the voicing `fewestSections` names fits and the one before it does not, the CLI messages and JSON,
the overrides, and that `--choir textbook` with `--split-voices` is byte-identical to no `--choir`.
`eval/browser-e2e.mjs` checks the studio page's octave choir against the CLI (cue sheet and MIDI byte-equal) and its
unison note. Not tried with singers: whether these three presets describe real choirs is the open question.

## Your own choir: `--singers` (2026-11-13, latest)

The presets above are rules of thumb. A director who has run a range test knows their singers, so `--singers
choir.csv` takes it directly: one row per singer, `low` and `high` (note names such as `D3`, `Eb4`, `F#2`, or MIDI
numbers), and optionally `name` and `section` (`T`, `T2`, `Bar`, `B` and the usual spellings; comma, semicolon or
tab separated). It replaces `--choir`, and `--tenor` and the others still override one section.

- **A section sings the notes all its singers reach,** and the unison band is the notes *every* singer reaches.
  So one singer with a short range sets a whole section's limit, and the report says who, and how far that end
  moves if that one singer is excused from the extreme notes (or moved, or the final lowered: a director's call).
- **No section column?** The singers are divided for you, into tenors and basses (with `--baritones` or
  `--second-tenors`, three or four sections): sorted by the middle of their range and cut into contiguous groups,
  basses lowest, choosing the cut that makes the narrowest section widest, then the widest total, then the most
  even group sizes. Every cut is tried. For the "can these singers sing it at all" hint, the singers are divided
  afresh for two, three and four sections.
- **A sectioned file sets the voicing:** with `--split-voices`, a file that names baritones brings them in.

Alone, it prints the section report (the two example files are made up; the names are placeholders):

```
$ node cli.mjs --singers examples/range-test-sections.csv
9 singers
tenors Eb3-F4 (3: Singer A, Singer B, Singer C); low set by Singer C (D3 without); high set by Singer C (G4 without)
baritones C3-E4 (3: Singer D, Singer E, Singer F); low set by Singer D (B2 without); high set by Singer E (F4 without)
basses Bb2-C4 (3: Singer G, Singer H, Singer I); low set by Singer G (A2 without); high set by Singer I (D4 without)
unison Eb3-C4; low set by Singer C (D3 without); high set by Singer I (D4 without)

$ node cli.mjs corpus/dies-irae.gabc --singers examples/range-test.csv --suggest-final
ambitus 17 semitones is 10 wider than Eb3-Bb3; the singers in examples/range-test.csv can sing it as tenors and basses: add --split-voices
```

The studio page has a "range test" box under the options: paste the CSV and it wins over the "Choir ranges"
choice, prints the section ranges, and the split options use them.

**Is the contiguous cut good enough?** `eval/singers-check.mjs` (report: `eval/singers-check-report.md`) compared
the divider with brute force (every assignment of singers to labelled sections) on 290 random choirs of 6 to 12
singers, two to four sections. These choirs are synthetic, so this checks the algorithm, not singers. The
narrowest section matched brute force in all 290; the total width matched in 285 (the five misses, all with
three or four sections, lose 1-2 semitones of total). 200 singers into four sections take about 50 ms.

`singers.test.mjs` (17 tests, 7 for `--sit-out`): note and section parsing, CSV errors with row numbers, who sets each end, the divider
against brute force on 60 small random choirs, that the voicing `fewestSectionsForSingers` names fits and unison
does not, the CLI report, JSON and refusals. `eval/browser-e2e.mjs` checks the page's range-test box against the CLI
(cue sheet and MIDI byte-equal) and its unison hint. **Not tried with a real choir's range test;** whether the
overlap rule (every singer, every note) is too strict for real sections, which usually let one weak voice drop
out of an extreme note, is for a director to say.

### Letting a singer sit a note out: `--sit-out N` (2026-11-13, latest)

The rule above makes one short range the limit of a whole section. Real sections usually let a weak voice drop
out of an extreme note instead, so `--sit-out N` (with `--singers`; also a choice under the studio page's
range-test box) widens each section to the notes **all but N of its singers** reach, with at least one singer
left on every note. The unison band takes the same rule over the whole choir. How strict to be is the
director's choice, so N is theirs to set; 0 (the default) is the old rule exactly.

- **The report says who pays for it:** each section's range, the notes everyone still reaches, and who sits out
  which notes. With a chant, a `sitting out:` line counts the sung notes each singer misses in the actual
  arrangement (unison, or the split's who-sings-what), and a warning fires when one singer would sit out a
  quarter or more of their notes: by then moving them or picking another final is probably the better call.
- When the passing notes come in two runs (two clusters of singers with a gap), the widest run is the range.
- Dividing an unsectioned file uses the widened widths too (checked against brute force over the contiguous
  cuts in `singers.test.mjs`); 200 singers into four sections take about 70 ms.

```
$ node cli.mjs --singers examples/range-test-sections.csv --sit-out 1
9 singers; each section's range is the notes all but 1 of its singers reach
tenors D3-G4 (3: Singer A, Singer B, Singer C); all reach Eb3-F4; Singer C sits out D3 and F#4-G4
baritones B2-F4 (3: Singer D, Singer E, Singer F); all reach C3-E4; Singer D sits out B2; Singer E sits out F4
basses A2-D4 (3: Singer G, Singer H, Singer I); all reach Bb2-C4; Singer G sits out A2; Singer I sits out C#4-D4
unison D3-D4; all reach Eb3-C4; Singer C sits out D3; Singer I sits out C#4-D4
```

What it trades, on the corpus with the two **made-up** example range tests (`eval/sit-out.mjs`, report
`eval/sit-out-report.md`): with the 12-singer unsectioned test, the Dies irae split goes from 16 of 613 notes for
the full choir to 347 with one singer a section sitting out (two singers miss 38 and 36 notes) and 512 with two;
with two a section, 6 of the 8 chants fit in unison instead of none. The cost is visible too: on the Te Deum one
singer would sit out 194 of 637 notes (the recitation tone sits above their range), and the warning says so. **Not
tried with a real choir:** whether N = 1 sounds thinner than a split, and whether a director would rather move
the singer, is theirs to judge.

## Mix and master check

```sh
node ventures/chant-forge/master-cli.mjs track.wav   # exit 0 pass, 1 fail, 2 unreadable
```

`master.mjs` reads 16/24/32-bit PCM and float WAV (mono or stereo) and reports
BS.1770-4 integrated loudness (K-weighting, 400 ms blocks, -70 LUFS and -10 LU
gates), true peak (4x oversampled), mono-sum loss with L/R correlation, and runs
of full-scale samples. Targets: -14 LUFS +/- 1.5, true peak at most -1 dBTP,
mono loss at most 3 dB, no clipping. Checked 2026-11-03 against the standard's
calibration points (a 0 dBFS 997 Hz sine reads -3.01 LUFS mono, 0.0 stereo), a
fs/4 sine whose samples miss the peak by 3 dB, and phase-inverted and
over-driven files (6 tests). Checked 2026-11-03 against ffmpeg's `ebur128`
filter (`node eval/ffmpeg-check.mjs`; six synthetic stereo 48 kHz signals: three
sines, pink and white noise, a gated loud/quiet noise): integrated loudness
within 0.05 LU on all six, true peak within 0.33 dB (the worst case, white
noise, reads -13.47 here and -13.8 in ffmpeg; 16x oversampling gives -12.9, so
both 4x meters under-read and ours is the closer). Not checked against EBU test
files or a real mix; the true-peak filter is a windowed sinc, not the Annex 2
coefficients. Distributor targets change: read
theirs before release.

`master-cli.mjs` also prints the gain each service's loudness normalisation would apply
(Spotify and Apple Music turn quiet tracks up; YouTube, Amazon, Tidal and Deezer only
turn loud ones down; `platformPlayback` in `master.mjs`, 2026-11-03, 1 test). The
per-service targets (-14, -16, -14, -14, -14, -15 LUFS) are from memory, not read
from the services' current pages: verify before relying on them.

## Real Gregorio files (2026-11-03)

Fixed after reading the format, tested on made-up strings shaped like real files
(`real-files.test.mjs`, 6 tests), not yet run on a batch of GregoBase files:
CRLF line endings no longer defeat `%` comment stripping (a comment's text was
being sung as a lyric); `<sp>R/</sp>`, `<sp>V/</sp>` and `<sp>'ae</sp>` keep their
signs; `<v>` (raw TeX) and `<alt>` text, `{}` centre braces, `*` and the cross
are not lyrics; a clef change inside a group, as in `(::c3)` or `(z c3)`, now
moves the staff. NABC alternations are still cut at the first `|`.

## Choosing a final (2026-11-03)

`node cli.mjs piece.gabc --suggest-final` lists the finals that keep the whole
chant inside E2-E4 (MIDI 40-64, a rule-of-thumb men's unison range) and picks
the one that centres the line; use it as `--final N`. A piece wider than the
range is reported with how far over it is, not forced. Corpus results: Dies
irae and Salve Regina A2-E3 (recommended C#3), Pange lingua F#2-F#3, Te Deum
Ab2-Ab3 (D3), Veni Creator F#2-G3. The range is a guess, not checked with
singers (`voicefit.test.mjs`, 4 tests).
`--auto-final` (2026-11-03) does both steps: it transposes to the recommended
final, and refuses a chant wider than the range (`autofinal.test.mjs`, 3 tests).

## Browser check

`node eval/browser-e2e.mjs` (2026-11-03) drives `index.html` in headless
Chromium through Playwright: all 6 samples times all 5 backings convert, the MIDI
(`MThd`) and WAV (`RIFF/WAVE`, not silent) downloads work, Play and Stop toggle,
bad input and a zero tempo give messages, and there is no sideways scroll at 375 px.
38 checks, no page error (58 since 2026-11-13, with song sections). It cannot hear anything: a person still has to listen.

## Corpus read against the printed book (2026-11-13)

```sh
node ventures/chant-forge/eval/scan-check.mjs     # needs curl and ffmpeg; about 1 min the first time
```

`scan.mjs` reads square notation off a page scan with no dependencies: it finds the
four-line staves, takes the lines out, finds the heads (squares, rhombi, the two ends of
a porrectus stroke, stacked notes read bottom-up), places each relative to the clef line,
and lines the sequence up with the GABC by edit distance. `eval/scan-check.mjs` does this
for every piece in `eval/scan-pages.json` against public-domain scans on archive.org
(Graduale Romanum, Vatican 1908; Antiphonale Romanum, Vatican 1912) and writes
`eval/scan-check-report.md`. What looking at each flagged spot said is in
`eval/scan-check-verdicts.md`. Results:

| piece | book | notes read | agree with the GABC |
|---|---|---|---|
| Dies irae | Graduale 1908, pp. 83*-86* | 604 | 604 |
| Veni Creator (verse 1) | Graduale 1908, p. 121* | 43 | 43 |
| Pange lingua (verse 1) | Graduale 1908, p. 123* | 53 | 53 |
| Te Deum (1908 Roman tone) | Graduale 1908, pp. 118*-121* | 631 | 630 after one correction (the other is a reader error) |
| Salve Regina (1961 file) | Antiphonale 1912, pp. 56-57 | 214 | 214 |
| 7 off-final Graduale pieces | Graduale 1908 | 972 | 971 (the other is a reader error) |

- **One transcription error found:** GregoBase 3656 (the 1908 Te Deum) has `si(f)ne`
  where the book prints e. Corrected in `corpus/te-deum.gabc`.
- **The Te Deum changed source.** The old corpus file (Solesmes 1974) is a different tone
  from the 1908 book's (75 notes differ, 85 extra); the corpus now carries the 1908
  "juxta morem Romanum" tone. **The Salve Regina** (1961 file) matches the 1912
  Antiphonale, so it now has a pre-1929 source.
- **Control:** moving one agreeing GABC note a step (200 seeded trials per piece) is
  flagged 189-200 times in 200. Notes the reader cannot see (some rhombi, quilismas,
  liquescents, ledger-line notes: 4-17 per piece) are not checked; those spots on two
  Salve Regina staves were looked at by eye and agree.
- **Tuning:** thresholds were set on the Dies irae and Te Deum pages; the Salve Regina
  and the off-final pieces ran afterwards with nothing changed. 10 tests on drawn pages
  (`scan.test.mjs`). Only Vatican-edition printing has been tried.
- **Read by eye as well:** a separate reading by eye covered every note of the five pieces,
  including the ones the reader cannot see, and found no differences in 1,492 notes
  (`eval/scan-read-by-eye/README.md`, `scan-read-by-eye.test.mjs`). The earlier
  Solesmes 1974 Te Deum is kept as `corpus/te-deum-simple.gabc`. It is the 1913 Liber
  Usualis *tonus simplex*, note for note.
- **Full hymns:** `corpus/pange-lingua-full.gabc` (6 verses, 85.6 s at 124 BPM) and
  `corpus/veni-creator-full.gabc` (7 verses, 83.0 s) set every verse printed in the 1908
  Graduale to the checked first verse (`eval/scan-read-by-eye/build-hymns.mjs`).
- **The 1908 Te Deum by eye** (later on 2026-11-13): all 637 notes of the current
  `corpus/te-deum.gabc` match the 1908 Graduale, pp. 118*-121*, read system by system,
  including the 7 quilismas, 18 rhombi and 3 liquescents the machine does not check.
  Every corpus piece outside the `gregobase-1908/` batch is now read by eye: 2,129 notes,
  no differences.

### Rhombus or square (2026-11-13)

```sh
node ventures/chant-forge/eval/shape-check.mjs    # same scans and cache as scan-check
```

Each head the reader finds now carries a `shape`: `rhombus` (punctum inclinatum) or
`square`. A rhombus in the 1908 type is narrow (about 0.34 staff spaces wide against a
square's 0.53) and tapers at both ends, so two measurements tell them apart: width under
0.42 spaces and end columns under 0.8 of the middle ones' height (`headShape` in
`scan.mjs`). `gabcShape` reads the shape the GABC asks for (upper case = rhombus, `w`
quilisma, `~ < >` liquescent, `v` virga, `o` oriscus, `s` stropha). On notes that agree in
pitch (`eval/shape-check-report.md`):

| set | rhombi read as rhombi | squares called rhombi |
|---|---|---|
| tuned on (the five corpus pieces) | 68 of 68 | 0 of 1,470 |
| held out (seven GregoBase pieces, 1908 Graduale) | 118 of 120 (2 not measured) | 1 of 1,031 |

The one false call (GregoBase 3434, *et*, leaf 354, staff 5) is a square with a white
flaw in the print; the GABC is right. So a GABC that writes a rhombus as a square, or the
other way round, is now caught by machine. **Not done:** quilismas and liquescents. The
reader pairs 24 of 33 quilismas by pitch but sees them as squares: an edge-zigzag and a
split-column measure were tried and overlap with ordinary squares on stems: an edge
zigzag of 0.15 spaces per column or more keeps 5 of 6 tuned-on quilismas but only 5 of 18
held out, and calls 58 and 63 squares quilismas. Liquescents are mostly not read at all
(2 of 33 paired): the small upper head of a liquescent podatus sits on its neighbour's
stem and falls under the reader's minimum head height. Both need a dedicated detector.
(Quilismas: done, next section.)

### Quilisma (2026-11-13)

A quilisma in the 1908 type is a small saw-tooth: two or three teeth on its upper edge with
white notches between them, over a solid base. The earlier edge-zigzag measure looked at the
whole outline, so a stem or a neighbour's edge read as zigzag too. `notchRows` in `scan.mjs`
looks only inside the head's own upper half (from 0.27 staff spaces above its centre to the
centre) and counts the rows that cross two or more separate runs of ink; three or more such rows
make a quilisma (`QUILISMA_ROWS`). Rows higher than that are left out, because that is where a
liquescent's small head or the note stacked above sits. The rule was fixed on the five tuning
pieces only (6 of 6 quilismas, 3 of 1,538 other heads). Then nine GregoBase pieces from the 1908
Graduale with quilismas or liquescents were picked and scanned for the first time
(`eval/shape-fresh-pages.json`):

| set | paired quilismas read as quilismas | other heads called quilismas |
|---|---|---|
| tuned on (five corpus pieces) | 6 of 6 | 3 of 1,538 |
| held out for the rhombus rule (seven pieces; seen while choosing the measure) | 18 of 18 | 9 of 1,153 |
| fresh (nine pieces, scanned after the rule was fixed) | 15 of 17 | 18 of 1,849 (version 1), 12 (version 2) |

Every fresh call was cropped and looked at (`eval/quilisma-eye-check.md`). Of the 18, six are
real quilismas that the pitch alignment paired with a neighbouring note, eleven are the lower end
of a porrectus stroke that the reader cut off as its own head (white flecks where the stroke meets
the head on its stem look like notches), one is two stacked heads. A quilisma never continues a
stroke, so version 2 adds `afterStroke`: a notched head whose left neighbour at its height is
wider than 0.8 spaces and ends within 0.2 spaces of it is not a quilisma. That removes six of the
eleven with no quilisma lost; it was chosen after the look, so the 12 is not a held-out figure.
The reader's own false calls on the fresh pieces are 6 of 1,849 (five porrectus ends, one
stacked pair). The two misses: a quilisma stacked under the next note, narrow enough to pass the
rhombus test first, and one with no visible teeth in the scan. On the same nine pieces the
rhombus rule, untouched, read 243 of 245 rhombi and called none of 1,604 squares a rhombus.

**Not done** (then): liquescents (25 in the fresh GABC, none paired; done 2026-11-14, next section). Pairing is also the limit for
quilismas: 22 of the 39 fresh ones are not paired by pitch, so a GABC that drops a quilisma's
`w` is only caught where the reader and the alignment both find the note.

### Quilisma version 3 (2026-11-14, latest)

The eleven pieces scanned for liquescents showed more false quilismas than before (17 of 1,631
other heads). Each was cropped and looked at: five were pieces of a porrectus stroke read as one
head, seven were one of two heads stacked a step apart, one an epiphonus head whose concave top
looks like teeth, four mottled squares. Measured on all 32 pieces scanned so far, three things
separate them from real quilismas: a stroke piece's centre **falls** from left to right (every
real quilisma falls 0.01 spaces or less; it is level, or rises when merged with the note above),
a quilisma never has a head printed **straight under** it (it is the lowest note of its neume),
and it never carries a **liquescent tail**. `isQuilisma` in `scan.mjs` drops a notched head that
falls 0.06 spaces or more, sits on another head, or has a tail. The rule was committed and then
run on eighteen pieces listed beforehand and never scanned before
(`eval/quilisma-fresh-pages.json`):

| held-out set (18 pieces) | version 2 | version 3 |
|---|---|---|
| paired quilismas read as quilismas | 47 of 55 | 47 of 55 |
| other heads called quilismas | 29 of 3,080 (0.94%) | 6 of 3,080 (0.19%) |

Of the six left, one is a real quilisma the alignment paired with a neighbour, one a porrectus
end falling 0.05 (just under the cut), one the lower head of a stacked pair and three mottled
squares. Details, the measurements and the crops' verdicts: `eval/quilisma-stroke-check.md`.
The same pieces were a clean test of the untouched rhombus rule: 417 of 420 rhombi, but 14 of
2,641 squares called rhombi, more than before and not looked at yet.

### Liquescent (2026-11-14)

```sh
node ventures/chant-forge/eval/shape-check.mjs    # same scans and cache as scan-check
```

A liquescent in the 1908 type is a small note hung off the head before it on a short, thick
stem at the head's right edge: a small head above (epiphonus, `gh~`) or a hook below
(cephalicus, `fe~`). It is under the reader's minimum head height, so until now it was never
read. `liquescentTail` in `scan.mjs` follows the ink up and down from each head's right-hand
columns and calls it a liquescent when the tail runs 0.6-2.4 spaces from the head's centre,
ends on no other head, is thicker than a virga's stem and ends 0.2-0.4 spaces wide; the
small note's pitch is read 0.25 spaces in from the tail's end, and the note is read straight
after its head. Thresholds were set on the 21 pieces already scanned (51 of 57 liquescents at
the right pitch, 2 of 4,524 other heads given a tail), then frozen and run on eleven more
GregoBase pieces listed and scanned only afterwards (`eval/liquescent-fresh-pages.json`):

| set | GABC liquescents | read as liquescent at their pitch | other heads called liquescent |
|---|---|---|---|
| set on (21 pieces) | 60 | 54 | 2 of 4,584 |
| held out (11 pieces) | 26 | 20 | 1 of 1,622, plus 1 added note that pairs with nothing |

With the small notes read, `scan-check.mjs` checks 33 more notes against the book with no
new disagreement (Te Deum 633 of 634 agree, Salve Regina 219, the GregoBase pieces 1,196).
The same eleven pieces also test the older rules: rhombi 180 of 182, 5 of 1,428 squares
called rhombi; quilismas 10 of 12, 17 of 1,631 other heads called quilismas (more than
before, not looked at yet). Details and the false calls, looked at on the scan:
`eval/liquescent-check-report.md`. **Not done:** epiphonus and cephalicus are told apart only
by direction, `<` and `>` are not, and a liquescent after a porrectus end is not looked for.

## Not checked yet

- `examples/dies-irae-incipit.gabc` is the widely quoted opening motif
  (F E F D E C D D), typed from memory. It has not been transcribed from a scan.
  It is a demo input, not a corpus entry.
- The converter has run on 64 real GregoBase files (the five corpus pieces and
  `corpus/gregobase-1908/`, 59 Vatican Graduale 1908 pieces, 2026-11-03;
  `node eval/batch-check.mjs`, `batch.test.mjs`). Checked: no crash, no warning,
  pitches 36-84, no markup left in lyrics, valid MIDI, communions, tracts, hymns
  and sequences end on their mode final. Not checked: the notes against the page
  scans (except the ones below), or by ear. 11 of the 59 end off the mode final (introits, graduals,
  alleluias and offertories finish on a psalm-tone differentia or a verse). `node eval/offfinal-report.mjs` lists them with last notes and syllables
  (`eval/offfinal-report.md`); 5 are introits ending on "euouae". Seven of the
  11 were read against the 1908 scan on 2026-11-13 (next section): their
  endings are the book's.
- `fuzz.test.mjs` throws 2000 random made-up GABC strings at the reader and
  MIDI writer (no crash, pitches in range); it says nothing about real files.
- Nothing has been arranged, sung, mixed or published.

## Rules this project keeps

- **Sources must be public domain and cited.** The melodies and Latin texts in
  the 1908 Vatican edition and other pre-1929 printings are public domain in the
  US. Modern editions, translations and recordings can still be under
  copyright. **Never sample an existing recording.**
- **Publishing needs the owner.** A distributor account (DistroKid or similar)
  needs the owner's card, name and choice of artist name. Agents prepare
  releases; they don't upload them.
- **Honest credits:**
  - say which parts are synthesised and use the distributor's AI-disclosure
    fields;
  - never imply a real monastery or choir sang it;
  - no bought streams or fake listener numbers.
- **Treat the texts with respect.** These are liturgical texts. Use them whole
  and in their sense, not as jokes.

See [RECORDING-GUIDE.md](RECORDING-GUIDE.md) for recording a choir line against the MIDI guide and cue sheet.

## Landed on 2026-11-03 (moved from flagships.yaml)

The flagship `next:` line had grown past the 2,000-character cap in `portfolio/router/validate.py`, so its history moved here word for word; `flagships.yaml` keeps the open items.

Browser studio page (ventures/chant-forge/index.html: GABC in, preview and MIDI/WAV out, client-side; browser-safe.test.mjs) landed 2026-11-03; driven end to end in headless Chromium 2026-11-03 (eval/browser-e2e.mjs, 38 checks: every sample x backing, downloads, Play/Stop, 375 px); listen to it by ear and put it in front of users. History is in the README and git. Mix/master check (master-cli.mjs: LUFS, true peak, mono, clipping, 6 tests) landed 2026-11-03; checked against ffmpeg ebur128 2026-11-03 (eval/ffmpeg-check.mjs: 0.05 LU, 0.33 dB on synthetic signals); EBU test files and a real mix remain. Release kit (release.mjs: ISRC/UPC, cover, WAV, rights, AI disclosure, 7 tests) landed 2026-11-03; check it against a distributor's real upload form. GABC reader fixes for CRLF, <sp>/<v>/<alt> and in-group clefs landed 2026-11-03 (made-up strings); NABC and split-neume pitch test (nabc.test.mjs) landed 2026-11-03. `--fit 8 --stretch` (2026-11-03) lengthens long notes to fill bars, halving padded rest on the corpus; ear check pending. `--repeat N` (2026-11-03) loops the chant for full-length tracks; ear check pending. `--halftime` (2026-11-03) doubles chant durations over an unchanged backing for metal; ear check pending. Real-file batch landed 2026-11-03: 59 Graduale 1908 files, no crash or warning (batch.test.mjs, eval/batch-check.mjs). `--fills` (2026-11-03, genre.mjs fillBar, 3 tests) adds a snare roll every fourth bar; ear check pending. `--lrc FILE` timed lyrics (lrc.mjs, 3 tests, 2026-11-03; try in a real player). `--cues FILE` singer cue sheet (cues.mjs, 3 tests) landed 2026-11-03; try it with real singers; RECORDING-GUIDE.md (2026-11-03) is the protocol to try. `--suggest-final` (voicefit.mjs, 2026-11-03) lists finals that fit E2-E4; check the range with real singers. `--auto-final` (2026-11-03) applies that recommendation in one step. Preview renderer (render-cli.mjs: MIDI to WAV, 6 tests, 2026-11-03) lets master-cli run on real audio: metal preview passes all four checks, deep house is 2.8 LU quiet; a person must listen. `--limit` with `--lufs` (2026-11-03) limiter reaches -14 LUFS under -1 dBTP on deep house; listen for pumping. master-cli now prints a suggested gain (suggestGain, capped by true-peak room, 2026-11-03). `render-cli.mjs --stems DIR` (2026-11-03, 1 test) writes per-voice WAV stems that sum to the mix; load them in a DAW and judge by ear. Next: compare a sample of the files against a pre-1929 scan (notes, not just parse), source the Te Deum and Salve Regina from a pre-1929 book, read the 11 off-final endings against the book, and listen to the --stretch output (ROADMAP.md).

Added on main the same day (moved from flagships.yaml): master-cli prints per-service playback gain (platformPlayback, 2026-11-03; service targets from memory, verify against their pages). `--intro N` (2026-11-03, intro.test.mjs) puts N silent bars before the chant, backing under them; ear check pending. `--markers` (2026-11-03, markers.test.mjs) adds a MIDI marker at each phrase start; check the locators in a DAW.
