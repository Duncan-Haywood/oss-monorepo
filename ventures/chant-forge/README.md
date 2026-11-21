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
3. **Arrange:** genre templates built around the line: drums, bass and
   chords as MIDI in `genre.mjs` (`cli.mjs --genre NAME`, with `--sections`
   for intro, verse, build, drop and outro from the chant's double bars).
   Built as MIDI; recorded or rendered guitars and synth sounds are not.
4. **Voice:** a real men's choir (recorded) or a singing synthesiser. A first synthesised choir that sings each syllable's opening consonants, vowel and final consonants is in `sing.mjs` (`render-cli.mjs --sing`, 2026-11-15); a real choir is not.
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

## Build a release folder: `ep-cli.mjs` (2026-11-16)

One plan file in, one folder a distributor upload can be made from out:

```sh
node ventures/chant-forge/ep-cli.mjs ventures/chant-forge/examples/first-ep.json -o lux-in-tenebris --today 2026-11-16
```

The plan (`examples/first-ep.json`) names a title, a release date and, per track, a GABC file and the `cli.mjs`
options for it (genre, BPM, sections, key lift and so on). For each track the builder runs the converter, renders
the singing preview choir with the limiter at -14 LUFS, and writes the MIDI, the WAV, timed lyrics (LRC) and a copy
of the GABC source. Then it draws a 3000 x 3000 cover from the first track's own opening notes (square notation on a
red four-line staff, no text, so nothing on it can disagree with the metadata), writes `release.json` with each
track's source edition, year, transcriber and rights note read from the GABC header, and runs the release check
(`release.mjs`) over the folder. `REPORT.md` lists the tracks with length, loudness and true peak, and splits the
failing checks into **build faults** (exit 1) and **owner steps**: the artist name, p- and c-lines and ISRCs, which
only the owner can supply (exit 0 when those are all that is left).

The example plan (Dies irae as half-time metal, Pange lingua as deep house with an a cappella first verse and a key
lift, Veni Creator as hard rock, the 1908 Te Deum as EDM) builds in 47 s here: 4 tracks, 11:40, every track
-14.0 LUFS and -1.05 dBTP or lower, 69 checks pass, and the 7 that fail are the owner steps. A GABC file that names
no source edition (the typed-from-memory demo in `examples/`) is a build fault, so nothing uncited reaches a release.
The AI disclosure defaults to "assisted" and names the tools and parts; the level is the owner's call. 6 tests in
`ep.test.mjs` (pixel checks on the cover, -14 LUFS read back from the WAV, the filled-in folder passing the check).
Nobody has listened to the tracks; listening before upload is the first line of the report's "Before upload".

### The same folder from the studio page (2026-11-16)

The studio page has a **Build the release folder (ZIP)** button under its downloads. After Convert it renders the
track again limited to -14 LUFS, draws the 3000 px cover from the chant's opening notes, writes `release.json`
and runs the release check, all in the browser, and hands over one ZIP with the same seven files `ep-cli.mjs`
writes for a one-track single. Release title, artist, release date (four weeks out by default) and ISRC are boxes
on the page; empty ones become owner steps in the ZIP's `REPORT.md`. A pasted chant whose GABC names no source
edition is a build fault, as on the command line.

To make that possible the builder's pure parts moved into `ep-core.mjs` (browser-safe: cover pixels, PNG
assembly with a pluggable deflate, `release.json`, the owner-step split, the report) and the release rules into
`release-core.mjs` (`checkReleaseWith`, reading files through an `io` object so the same rules run on a folder
or on files held in memory). `ep.mjs` and `release.mjs` keep their exports and now call the cores, so the two
paths cannot drift. `ep-page.test.mjs` (3 tests) builds Veni Creator both ways with `Buffer` deleted on the page
side: `release.json`, the WAV, MIDI, LRC and source are byte-identical, the 31 check lines match name for name
and level for level, the report differs only in the builder's name, and the two covers decode to the same
27,003,000 bytes of scanlines (the browser compresses with `CompressionStream`, Node with zlib). In headless
Chromium (`eval/browser-e2e.mjs`, 4 new checks, 119 in all) the sung Veni Creator release ZIP took 1.9 s;
`release-cli.mjs` on the unzipped folder fails only the artist, p-line, c-line and ISRC, and passes outright once
an artist and ISRC are typed into the page. Nobody has listened to the track or tried the ZIP in a distributor's
upload form.

### Several tracks from the studio page: the EP queue (2026-11-16)

Under the release boxes the page has an **EP queue**. Convert a chant, press **Add this track to the EP**, change
the chant or any setting, convert and add again. Each queued track keeps what it was converted with (its MIDI,
timed lyrics, GABC text, choir voice and the ISRC typed for it), so Dies irae can be half-time metal and Pange
lingua deep house in one release. Tracks move up and down and can be removed; the queue is kept in the browser's
`localStorage` (MIDI as base64, never audio), so a reload does not lose it. **Build the EP folder (ZIP)** renders
each track at -14 LUFS and hands the list to the same `releaseKit` as the one-track button, so the folder, the
cover (from track 1) and the release check are the ones `ep-cli.mjs` writes. The type follows the track count as
`releaseJson` counts it (1-3 a single, 4-6 an EP, more an album), and the page says which before anything renders.

The queue logic is `ep-queue.mjs` (browser-safe). Two tracks from one chant share one file in `sources/`; two
different texts with one name get `name.gabc` and `name-2.gabc`. `ep-queue.test.mjs` (4 tests) queues Dies irae
and Veni Creator with different options, moves one up, round-trips the queue through its `localStorage` form and
builds it: `release.json`, both WAVs, MIDIs and LRCs and both sources are byte-identical to `buildEp` on the same
two-track plan, the check matches line for line and passes, and the report differs only in the builder's name.
In headless Chromium (`eval/browser-e2e.mjs`, 7 new checks, 126 in all) three sung tracks (Veni Creator as deep house, Dies irae as
metal, Pange lingua as hard rock, each with its own ISRC) were queued, reordered and kept over a reload; the
three-track ZIP (3:45 of audio) took 13.1 s, kept each ISRC and corpus file name, and `release-cli.mjs` passes the
unzipped folder (exit 0). Nobody has listened to the tracks.

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

Tests: `node --test ventures/chant-forge/chant-forge.test.mjs` (14 tests,
passing 2026-11-19). On 2026-11-03 the example's output was also read back with
an independent parser (Python `mido` 1.x): 3 tracks, 3.87 s, lyrics in order.

## A second voice: `--organum` (2026-11-17)

`--repeat 3` used to sing the same unison line three times. `--organum` makes the passes differ the way the
chant's own tradition did: from the second pass on, a second voice sings under the chant in the *modified
parallel organum* of the ninth-century *Musica enchiriadis*. Without `--repeat` it runs under the whole piece.
`organum.mjs` applies three rules:

1. **A fourth below.** The added voice (vox organalis) sings a fourth under the chant (vox principalis),
   on a note the chant itself uses.
2. **A boundary.** It never goes below the nearest chant note a whole tone or more under the final (C under
   a D final, D under an F final). Where the fourth would go lower, it holds the boundary, so the interval narrows
   to a third, a second or a unison as the line comes down to its final. That is the treatise's signature
   sound. Where the fourth below is not a note the chant uses (E over B when the chant has only B flat, the
   tritone the treatise forbids), it takes the third below, then the fifth, then the unison.
3. **Occursus.** Every phrase ends with both voices on the same note.

The voice goes on its own MIDI track, *Organal voice*, a choir program with the chant's lyrics, so
`render-cli.mjs` plays it, `--sing` sings it and `--learn` writes its rehearsal tracks like any section.
Pitch only: rhythm, syllables, bars, backing and cues are the chant's own. With `--key-lift` the lifted drop's
organum moves up with it, boundary included. If the voice would go under E2 (or `--range`), the command
stops and names the lowest `--final` that fits. `--split-voices` is refused with it (the split already
divides the choir), and `--musicxml` warns that the score holds the chant line only. The studio page has a
"Second voice" switch, which applies to the whole piece.

```
node cli.mjs corpus/dies-irae.gabc --repeat 3 --organum --final 50 --fit 8 --genre metal --sections --bpm 170 -o dies.mid
organum on passes 2-3: 1226 notes (fourth 520, major third 216, second 192, unison 298), lowest A2
```

Dies irae's second pass, chant over organal voice (D3 final, boundary C3): *Di-es i-rae* F3/C3 E3/C3 F3/C3
D3/C3, *di-es il-la* E3/C3 C3/C3 D3/C3 D3/D3. The voice sits on C while the line moves above it and joins it
on the final. That is the treatise's own D-mode example.

Measured over the whole corpus (`node eval/organum-corpus.mjs`, `eval/organum-corpus-report.md`): all 68
files, each at its `--auto-final` key, 14,079 notes. The intervals: fourths 51.9%, major thirds 15.6%, minor
thirds 4.4%, seconds 13.5%, unisons 14.6%. No semitones and no tritones. The organal voice stays inside
E2-E4 in 68 of 68. `organum.test.mjs` (10 tests): the rules note by note, on five corpus pieces no interval
wider than a fourth, every organal note in the chant's own scale and every phrase ending in unison, the chant
line itself untouched, pass 1 plain and later passes voiced, the MIDI track the renderer and `--learn` find,
the lift and the refusals. Without `--organum`, four sample commands give byte-identical MIDI and cue sheets
to before. `eval/browser-e2e.mjs` checks the page's switch (127 checks, all pass). Nobody has listened to it.
Whether a fourth below sounds medieval or muddy over a metal bass, and whether singers who learn the line
in unison can hold the organal part, are questions for a person and a choir.

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

### Rehearsal tracks per section: `render-cli.mjs --learn` (2026-11-15)

Choirs learn parts from "learning tracks": one recording per section with that part up front. They are a
paid product today (per-part tracks are sold per piece by rehearsal-track services, or made by hand in a
DAW by a director), and a split chant needs a set per section. `node render-cli.mjs piece.mid --learn DIR`
writes two WAVs per choir section of a chant-forge MIDI:

- `<base>-<section>-part.wav`: that section loud and panned left (pan -0.5, about 6 dB louder in the left
  ear), the other sections 12 dB down and panned right, the band (organ, bass, chords, drums) 6 dB down.
  A singer hears their own line and where it sits against the others; `--others DB` and `--backing DB`
  (-60 to 0) change the two levels.
- `<base>-<section>-minus.wav`: the full mix with that section left out, to sing the part against.

A section is a choir-program MIDI channel named by its track (Tenors, First tenors, Second tenors,
Baritones, Basses with `--split-voices`; a unison chant is one "Choir" section), listed in score order.
`--lufs N` applies to each track. The studio page has the same files as "Download rehearsal tracks"
(a ZIP, `learningTracks` in `render.mjs`).

Checked: `learn.test.mjs` (4 tests) on a two-phrase tenor/bass MIDI measures the part track's own phrase
6.02 dB louder left than right, the other section's phrase mirrored and 9-15 dB under it, and the minus
track silent where only the left-out section sings while keeping the rest; the CLI writes six files for the
Salve Regina split three ways and refuses `--others` without `--learn`. `eval/browser-e2e.mjs` (114 checks,
all pass) downloads the page's ZIP for the split Dies irae and finds its four WAVs byte-for-byte equal to
`render-cli.mjs --learn`. Not checked: whether a singer learns faster from these than from the full mix, and
whether 12 dB is the right drop (rehearsal-track makers vary); the "choir" is still the preview synthesiser.

### The choir sings the vowels: `render-cli.mjs --sing` (2026-11-15)

The preview choir was an additive pad with one fixed "ah" tilt, so every syllable of a chant sounded the
same and nobody could hear where the Latin falls. `--sing` (and "Choir voice: Sing the vowels of the
Latin" on the studio page; `renderMidi(midi, { sing: true })`, `learningTracks(midi, { sing: true })`)
replaces it with a small source-filter singing synthesiser in `sing.mjs`:

- **What it sings:** the vowel of the MIDI lyric on each note (`latinVowel`): a, e, i, o, u, with ae, oe,
  æ and œ as e, y as i, u after q (and after g before a vowel: *lin-gua*, *san-guis*) silent, i opening a
  syllable before a vowel read as j (*iam*, *Ie-su*, *e-ius*), and au, eu, ei and ui as diphthongs that
  glide to their second vowel over the last 40% of the syllable's last note. A melisma keeps its
  syllable's vowel. Every one of the 8,085 sung syllables in the 119 corpus files yields a vowel.
- **How:** five sawtooth voices (detuned -12 to +13 cents, each with its own 4.8-6 Hz vibrato, onset and
  slow pitch wander) plus a little breath noise, through a cascade of five formant resonators (Klatt's
  cascade branch) at the men's averages of Peterson and Barney (1952): /ɑ/ 730/1090/2440, /ɛ/
  530/1840/2480, /i/ 270/2290/3010, /ɔ/ 570/840/2410, /u/ 300/870/2240 Hz. Consecutive notes cross-fade
  in 50 ms instead of the pad's 0.25 s release, since the same singers go straight on.
- **Not:** consonants, words, a soloist (formant tuning on high notes and consonants came later the same
  day, below), or any listener's judgement. It is a vocalise on the right vowels, for hearing which syllables land
  on which notes and beats; it is not a release voice (`RECORDING-GUIDE.md`).

Checked from the audio, never from the synthesiser's settings (`eval/vowel-check.mjs`, report in
`eval/vowel-check-report.md`; `formants.mjs` is an LPC formant estimator: decimate to 11 kHz, order 12,
Durand-Kerner roots):

- the estimator itself reads 29 of 30 vowels right on harmonics weighted by the analytic cascade response
  (E2 to E4), so it can tell the five apart;
- held 2 s notes on *la le li lo lu* through the whole MIDI path: 29 of 30 read as the written vowel at
  six pitches from E2 to E4 (the miss is /o/ at E4, read as /a/); E2 to C4, F1 is off by 5.6% on average,
  F2 by 1.5%, F3 by 0.7%. The pad, as control: 6 of 30;
- every choir note of 0.2 s or more in the five corpus pieces at final D3, 124 BPM: 1,497 of 1,571
  (95.3%) read as the vowel of their syllable; the pad 280 of 1,571 (17.8%). All 74 misses are /i/ on a
  short G3 read as /e/, and they are one waveform: the renderer makes each pitch, length and vowel once,
  and that draw's five voices beat near F1. With 20 other seeds 17 of 20 read /i/; one voice 20 of 20.
- The first corpus run, with the pad's 0.25 s release kept, read 79.7%: the tail of each note covered the
  quieter /i/ and /u/ of the next. That is why sung notes now cross-fade in 50 ms.

`sing.test.mjs` (5 tests): the Latin rules, the root finder, each vowel within 10% F1 and 5% F2 on D3,
a diphthong reading /a/ then /u/, and a three-note MIDI (*li*, melisma, *bo*) read back as i, i, o from the
choir stem. `eval/browser-e2e.mjs` (115 checks) finds the page's sung WAV byte-for-byte equal to
`render-cli.mjs --sing`. Rendering is slower: Dies irae with deep house, 191 s of audio, takes about 4 s
with `--sing --lufs -14 --limit` against 1 s for the pad. Nobody has listened to it.

#### Opening consonants (2026-11-15, later)

A vocalise lets you hear which vowel lands on which note, but not where a word starts: *Dies irae, dies
illa* came out as *ie i-ae ie i-a*. 76.5% of the corpus's 8,085 sung syllables open on a consonant (t 1,013,
s 576, d 564, m 546, n 536, k 535, r 472, l 390 ...). `--sing` now sings them; `sing: 'vowels'` keeps the
old vocalise.

- **Which consonants** (`latinOnset`): the letters before the syllable's vowel, read by the Liber Usualis's
  rules: c and g soft (/tʃ/, /dʒ/) before e, i, y, ae and oe, hard elsewhere; sc before e or i is /ʃ/; gn
  is /ɲ/; ch is k, ph f, th t; qu is kw and gu before a vowel gw; x is ks; h is silent; i opening a
  syllable before a vowel is the glide j. Clusters (*Chri*, *spi*, *tri*, *glo*) are sung in order.
- **How** (`PHONES`, on the same five voices and formant cascade): a stop is a closure (the voices stop;
  a voiced one keeps a low voice bar with F1 at 180 Hz) and a band-limited burst: low and short for p and b,
  high (4.5 kHz) for t and d, a narrow band just above the vowel's F2 for k and g, longer. The formants then
  move to the vowel over 45 ms from halfway between the place's locus (Delattre, Liberman and Cooper 1955:
  F2 near 800 Hz for labials, 1,800 Hz for alveolars) and the vowel. Fricatives are band noise (s at 6.5 kHz,
  sh at 3 kHz, f weak and flat; v and z with the voices on under them); affricates a closure then the sh
  noise; nasals a quieter span with the upper formants damped; l a voiced span with its own formants; r one
  brief tap; j and w start from /i/ and /u/. Before an obstruent or a tap the previous note's cross-fade
  drops from 50 ms to 15 ms, so a closure is silent.
- **Where in time:** choirs sing a consonant before the beat so the vowel lands on it. A syllable's
  consonant takes up to half the previous note (and any rest before it); what does not fit spills into its
  own note, at most 30% of it, shortened in proportion when even that is too little. The first version put
  the consonant inside the note: on the corpus's 0.24 s eighths at 124 BPM it was squeezed to a 30 ms
  closure, and the reader below read 66.9% of openings right; before the beat, 74.7%.
- **Not:** a doubled consonant held (*il-la*), a soloist's diction, or any listener's judgement. Final
  consonants came next (below).

Checked from the audio (`eval/consonant-check.mjs`, report in `eval/consonant-check-report.md`) by a
rule-based acoustic reader written for it, `onsets.mjs`: a closure of 35 ms or more then a release burst is
a stop (voiced when a voice bar sounds under the closure; place from the burst's spectrum, after Stevens
and Blumstein 1978); a closure then 50 ms of noise an affricate; 30 ms of noise above 2.5 kHz a fricative
(/s/ or /ʃ/ by centroid, weak for /f/, voiced when the low band carries on); a quieter low murmur a nasal;
one brief contact a tap; l, j, w and a bare vowel none.

- **Pairs** (*a* then each of 35 syllables, six pitches E2-E4, the set the reader's thresholds were set on):
  184 of 210 (87.6%) read exactly as written (class, voicing and place); the vowel-only choir on the same
  MIDI reads as no consonant 210 of 210, so the reader does not invent them. It misses n and m before /u/
  and /o/ (the vowel is itself a low murmur), l and j against /a/ (read as nasals), and labial bursts at C4.
- **Corpus, held out** (five pieces at final D3, 124 BPM; the first note of every syllable of 0.2 s or more):
  698 of 934 openings (74.7%) read exactly as written, 724 (77.5%) by class. The same notes from the vowel-only
  choir read as the written consonant 6.7% of the time, the chance level. Best: t 95.6%, s 89.3%, voiceless
  affricate 93.3%, k 82.5%; worst: f 42.3%, nasals 52.3%.
- **Vowels after the change** (`eval/vowel-check-report.md`): held vowels 29 of 30, unchanged; corpus notes
  97.6% right, but only 920 of the 1,571 notes still have 0.1 s of steady vowel between their own consonant
  and the next syllable's: on short notes the vowel is now shorter, as it is when people sing.

`sing.test.mjs` gains 3 tests: the consonant rules, nine VCV pairs on D3 read back as their class, voicing and
place (and as none from the vowel-only choir), and a consonant before the beat leaving the vowel on it.

#### Final consonants (2026-11-15)

With openings sung, *Dies irae* still came out as *Di-e i-rae*: 37.4% of the corpus's 8,085 sung syllables
close on a consonant (s 802, n 601, m 528, t 362, r 343, l 134, k 130 ...; 218 on a cluster such as *Sanc*,
*sunt*, *lux*). `--sing` now sings them too.

- **Which** (`latinCoda`): the letters after the syllable's vowel or diphthong (after the last vowel letter
  when one syllable holds two, *tuae*), with c and g hard (no vowel follows), ch k, ph f, th t, x ks, h
  silent. *Sanc* closes on n k, *lux* on k s, *laus* on s.
- **How:** the same recipes as the openings (`paintSeg` in `sing.mjs` now paints both), run the other way:
  the vowel's formants move to the consonant's over 45 ms, then a stop's closure and burst, a fricative's
  noise, a nasal's murmur. After a final obstruent the voices stop, so the release is silent; after a nasal,
  l or r they hum on as the note fades.
- **Where in time** (`codaPlan`): choirs hold the vowel and close it late, so the coda ends where the note's
  sound does (before the next syllable's consonant when that is sung ahead of the beat) and takes at most
  35% of the note, shortened when it needs more (see the second round below: each phone now keeps a floor).
- **Nasals changed too:** reading the first corpus run showed /m/ after /u/ (*-um*, *-num*, *-rum*, very
  common) was the vowel 4 dB down with its upper formants intact: nothing to hear. A nasal's source is now
  low-passed (two one-pole sections at 400 Hz, ramped in over 10 ms), as the nose passes little above a few
  hundred hertz; murmurs now sit about 5 dB under /a/ with the band above 1 kHz 30-45 dB down. Openings get
  the same murmur.

Checked from the audio (`eval/coda-check.mjs`, report in `eval/coda-check-report.md`) by `readCoda` in
`onsets.mjs`, the opening reader's cues run forwards from 60 ms of steady vowel: a closure of 30 ms or more
then one short burst that rises 12 dB and falls 6 dB again within 25 ms (a fade has no burst; the next
vowel does not fall); noise above 2.5 kHz; a murmur 15 dB darker than the vowel, of 45 ms or more when an
obstruent follows (F1 falls into any closure, which looks like a murmur for 30-45 ms) and not followed by the
vowel coming back (a vibrato swing on a high note looks like one too); a brief dip with voice after it.

- **Syllables before a rest** (30 syllables, six pitches E2-E4; the set the reader was tuned on): 129 of 180
  (71.7%) read exactly; the vowel-only choir reads as no consonant 174 of 180 (the six are /i/ read as a
  voiced fricative at G3 and above). Misses: *l* reads as a nasal (both are voiced murmurs to this reader),
  voiced and labial stops often read as nasals or velars, *-unt* and *-unc* read on their stop, and *x*
  on short notes as its s.
- **Corpus** (five pieces at final D3, 124 BPM; the last note of every syllable of 0.2 s or more with room for
  a steady vowel first; 743 shorter notes skipped): 123 of 162 closings (75.9%) read exactly, 129 by class;
  the vowel-only choir reads none on 160 of 162. s 73 of 74, t 14 of 17, nasals 22 of 42 (17 read as
  nothing), r 9 of 14, k 3 of 13. Not a clean held-out score: the first run (60.5%) was read for its misses,
  which led to two fixes (the reader's window ran past the next sound's start and cut off final bursts; the
  /u/ nasal above), and a looser nasal rule that read 84.0% here was dropped because it called 13 of 30
  vowel-only A2 fades nasals.
- **Openings after the change** (`eval/consonant-check-report.md`): a syllable's opening is now often right
  after the last one's coda, and the opening reader, whose window starts 150 ms before the beat, read the
  coda first (74.7% fell to 66.4%). Its window now starts where this syllable's consonant starts (the
  renderer's lead rule) when the syllable before closes on a consonant. With that window: 80.9% without
  codas, 79.8% with them, so singing codas costs openings 1.1 points (745 of 934). The part A pairs are
  unchanged (87.6%).
- **Vowels after the change** (`eval/vowel-check-report.md`): 895 of 920 measurable corpus notes (97.3%,
  was 97.6%).

`sing.test.mjs` gains 3 tests (11 in all): the coda rules, a coda ending at the note's end with a silent
release after an obstruent, and *as et ad an er a* on D3 read back from the MIDI path (and as none from the
vowel-only choir). Nobody has listened to it.

#### Final consonants, second round: *x* and the nasals (2026-11-15)

The first round's misses were mostly two things: *x* (k s, as in *lux*, *dex*, *Rex*) read as a plain s
(3 of 13 corpus velars right), and final /m/ and /n/ read as nothing (22 of 42). Before changing anything,
a held-out set was fixed (part D of the report: every sixth file of `corpus/gregobase-1908`, ten Graduale
pieces) and scored: 58 of 70 closings (82.9%).

- **Each phone keeps a floor** (`CODA_FLOOR`, `codaPlan`): a 45 ms closure and a 10 ms burst, 35 ms of
  frication, 60 ms of murmur. Shortening now cuts the part of each phone above its floor, and when the
  floors need more than 35% of the note (a cluster on an eighth) the coda may take up to half of it. Before,
  everything shrank in proportion, and the *k* of *dex* on a 0.24 s note had a 24 ms closure.
- **A burst into frication is a release** (`readCoda`): a closure, then a burst that runs straight into
  noise above 2.5 kHz with the voices off, is a stop followed by its fricative. The first reader only
  accepted a burst whose energy fell away again, so every *k s* read as its s. Its voice bar is now read
  from the closure's later half (a short closure's first frames reach back into the vowel), and velar place
  uses a 500 Hz band that can sit anywhere from 1 to 4 kHz (a 2.25 kHz burst was split between two fixed
  bands and read as labial).
- **The murmur sits 7 dB under its vowel** (`nasalGain`): the first version used one fixed gain, and
  measured over five vowels and E2-E4 the steady murmur sat 9 to 27 dB under the vowel (the calibration's
  reference had been taken during the vowel's attack). The gain is now worked out per note from the
  harmonics' power through the vowel's resonators against the murmur's path, for the middle of
  Fujimura's (1962) 5-10 dB; with one voice it measures 7 dB at every pitch, and the five detuned voices
  beat on the low harmonics around that. The murmur also gets its antiformant (/m/ 1000 Hz, /n/ 1800,
  /gn/ 2200 Hz) and a broad low resonance (280 Hz), and the vowel's formants now move toward the place's
  locus as the lips close instead of toward the murmur's F2, which had made /u/ 14 dB brighter just
  before an /m/.

Results (`eval/coda-check-report.md`):

| set | before | after |
|---|---|---|
| D, held out (10 Graduale pieces) | 58 of 70 (82.9%) | 63 of 70 (90.0%) |
| D: *k s* | 0 of 3 | 3 of 3 |
| D: nasals | 6 of 12 | 8 of 12 (9 of 13 by class, with the *n t* cluster) |
| B, the five pieces (misses read) | 123 of 162 (75.9%) | 134 of 162 (82.7%) |
| B: *k* and *k s* | 3 of 13 | 12 of 13 |
| B: nasals (clusters included) | 22 of 42 | 21 of 42 |
| A, syllables before a rest (tuning set) | 129 of 180 (71.7%) | 134 of 180 (74.4%) |
| vowel-only control, D and B | 68 of 70, 160 of 162 | unchanged |

D's total was printed once in between (61 of 70, after the *x* fix); its misses were not read and no change
was kept or dropped on it. The nasal changes did not move B (22 of 42 before them, 21 after), and in A they
cost two nasal-plus-stop clusters (*ant* on E2, *unc* on G3, now read on their stop). They are kept because
they meet a published level target the fixed gain missed by up to 20 dB, not because the reader liked them.
After a dark vowel the reader still misses most /m/: after /u/ the murmur is 11-12 dB darker above 1 kHz
than the vowel, and the reader asks for 15 (a vowel fading into silence darkens by up to 12). That is the
next thing to fix, in the reader or with a listener. Nobody has listened to it.

Openings and vowels after this round: openings 742 of 934 (79.4%, was 745). Openings keep the first
version's murmur (`ONSET_NASAL_GAIN`): with the new one they fell to 724, nasal openings 96 to 78 of 149,
because the opening reader's -7 dB murmur threshold was set on the old level, and no listener has said
which is right. Vowels: the vowel check's window ran on into a syllable's final consonant, which now takes
more of a short note, so 874 of 920 (95.0%, was 895) read right; ending the window where the final
consonant's transition starts, 695 of the 714 notes left with 0.1 s (97.3%). `sing.test.mjs` gains a test
(12 in all): the murmur 5-9 dB under /a/ and /u/ on E2, D3, A3 and E4 with one voice, and *dex* read as
a voiceless velar stop on 0.24 and 0.5 s notes.

#### Final consonants, third round: /m/ after /u/, and a blip in every final nasal (2026-11-15)

The second round left most final /m/ after a dark vowel unread (*-um*, *-num*, *-rum*: B read 20 of 39
nasals). Before changing anything a second held-out set was fixed (part E of `eval/coda-check-report.md`:
every sixth file of `corpus/gregobase-1908` from the fourth, 3403 to 3459, ten more Graduale pieces, none
in D) and scored: 71 of 86 closings (82.6%), nasals 14 of 22. Its misses were not read.

- **What the reader saw** (part A's *um*, *u*, *a*, frame by frame): after /u/ nearly all the vowel's
  energy is already under 500 Hz, so its murmur is the vowel 10-13 dB down and only 8-12 dB darker above
  1 kHz, not the 15 the reader asks for (a vowel's fade into its release darkens by up to 12, so the
  bar cannot simply drop). What a fade does not do is step: the lips shut in 10 ms and the murmur holds
  its level, while a release falls 1-3 dB per 10 ms. A first version of the rule (a step in the overall
  level) called 13 of 30 vowel-only A2 fades nasals, the same trap as the looser rule dropped in the first
  round: an open vowel's release on A2 loses its upper formants first while its band under 500 Hz holds
  within 3 dB. So the rule asks for the step under 500 Hz.
- **The new cue** (`readCoda` in `onsets.mjs`): a run 6 dB or more under the vowel below 500 Hz and 7 dB
  darker above 1 kHz, entered by a drop of 5 dB or more there within 20 ms and holding within 4 dB for
  45 ms, is a nasal, alongside the old 15 dB rule (the earlier of the two wins).
- **A synthesiser bug it turned up** (`codaTracks` in `sing.mjs`): reading B's *num,* and *num.* frame by
  frame showed a 10-20 ms burst of bright sound (+12-19 dB above 1 kHz) about 45 ms into the murmur, at
  the same place every time. `paintSeg` ramps a nasal's weight down over its last 10 ms, then the hum after
  the note sets it back to 1, so between murmur and hum the nose's low-pass and antiformant were lifted:
  every final *-m* and *-n* since the first round had a 10 ms blip of bare vowel in it, the kind of click
  a listener would hear. The ramp-out of a final nasal is now held at 1. `sing.test.mjs` checks it with
  one voice on /u/ and /a/ at A2, D3 and A3 (it fails on the old code with a 10.2 dB blip).

Results (`eval/coda-check-report.md`; vowel-only controls unchanged in every part):

| set | before | after | synth fix alone | reader rule alone |
|---|---|---|---|---|
| E, held out, fixed this round (10 more Graduale pieces) | 71 of 86 (82.6%) | 75 of 86 (87.2%) | 71 | - |
| E: nasals | 14 of 22 | 18 of 22 | 14 | - |
| D, held out last round (printed four times now) | 63 of 70 (90.0%) | 66 of 70 (94.3%) | 63 | - |
| B, the five pieces (misses read) | 134 of 162 (82.7%) | 142 of 162 (87.7%) | 135 | 139 |
| B: nasals | 20 of 39 | 28 of 39 | 21 | 25 |
| A, syllables before a rest (tuning set) | 134 of 180 (74.4%) | 137 of 180 (76.1%) | 135 | 136 |
| vowel-only control, A / B / D / E | 174, 160, 68, 84 | unchanged | | |

The two changes help each other: the blip broke the plateau the new cue looks for. E was printed three
times (baseline, after, and the synth-only ablation); nothing was changed after its second print.
Openings (742 of 934) and vowels (874 of 920) are unchanged. Left: B's *-num* and *-rum* before a pause
enter the murmur through a 40 ms formant transition rather than a step and still read as nothing (10 of
39), and *-unt*/*-unc* still read on their stop. Nobody has listened to it, so the blip fix is the part of
this round most worth an ear: a final *-um* should now hum without a click.

#### Final consonants, fourth round: a final /l/ is not a nasal (2026-11-15)

After the third round every final *al* in part A of `eval/coda-check-report.md` still read as a nasal (6 of
6 pitches), and *el* on 4 of 6. Both nasal rules in `readCoda` compare the coda with its vowel: a murmur is
quieter and much darker above 1 kHz than the vowel it leaves. The sung /l/ (F1 400 Hz) moves the vowel's
first formant under 500 Hz, which brightens the low band against /a/'s by 9-13 dB, so the *difference*
looks like a murmur's although the /l/ keeps its F2 and F3.

- **What separates them is the coda's own spectrum.** Measured with `sing.mjs` on held 0.5 s syllables, E2
  to E4, after /a/, /e/, /o/ and /u/ (outside the check, before any change): in its steady part the /l/'s
  energy above 1 kHz sits 12-25 dB under its band under 500 Hz, and /m/ and /n/ 38-54 dB, after every
  vowel and at every pitch, since the nose passes little above a few hundred hertz. A gap of 13 dB.
- **The rule** (`MURMUR_TILT` in `onsets.mjs`): a run counts as a coda nasal, by either rule, only when its
  frames' energy above 1 kHz is a median 28 dB or more under their band under 500 Hz. The threshold was
  fixed from those measurements and written, with four predictions, into the header of
  `eval/coda-check.mjs` and committed before the first run with it.
- **A new set, F:** the 51 files of the other `gregobase-1908-*` folders (the scan-check sets), never
  scored by the coda check before, read with the rule and without it.

| set | before | after | prediction |
|---|---|---|---|
| A, syllables before a rest (tuning set) | 137 of 180 (76.1%) | 157 of 180 (87.2%) | no lower: holds |
| A: *al* and *el* read as none | 2 of 12 | 12 of 12 | 11 or more: holds |
| A: stops and taps read as a nasal | 14 | 4 | (not predicted) |
| B, the five pieces | 142 of 162 | 142 of 162 | no lower: holds |
| D, held out (printed five times now) | 66 of 70 | 66 of 70 | no lower: holds |
| E, held out last round | 75 of 86 | 76 of 86 (*NAR*, *bar.* no longer nasals) | no lower: holds |
| F: final /l/ read as a nasal | 1 of 4 | 0 of 4 | 10% or fewer: holds, on 4 notes |
| F: nasals read as nasal | 96 of 137 | 96 of 137 | no fewer: holds |
| vowel-only controls, A / B / D / E | 174, 160, 68, 84 | unchanged | no lower: holds |

The rule also stopped 10 stops and taps in A (*at*, *ad*, *ab*, *ac* and *ar* on A2, and others) reading as nasals:
the vowel's F1 falling into a closure has the same brighter-low-band, darker-top look, and is not dark in
itself. F holds only 4 final /l/ long enough to score (most corpus /l/ codas are *al-le-lu-ia*'s, on
short notes before a consonant), so its /l/ line says little; its nasal line is new held-out evidence that
the rule costs nasals nothing, and that 41 of its 137 final nasals still read wrong, most *-num* and *-um*
read as nothing (the slow transition into the murmur the third round left).

**The same rule on openings failed its registration** (header of `eval/consonant-check.mjs`): it cut the
vowel-only control's false nasals from 123 to 23 of 934, but read B's sung nasal openings 64 of 149
instead of 96, because openings still use the first, brighter murmur (`ONSET_NASAL_GAIN`, no antiformant).
As registered, `readOnset` keeps it off (`murmurTilt: 0`); it can come back if the opening murmur moves to
the coda one.

**Found on the way, not changed:** the sung /l/ is louder than its vowel. `PHONES.l` has a source gain of
1.4, and measured the same way the steady /l/ sits -1 to +8 dB against the vowel, highest after /e/ and
/u/ (and after /u/ 15-20 dB brighter above 1 kHz, as /l/'s F2 of 1250 Hz is above /u/'s 870). A spoken or
sung /l/ is weaker than the vowels around it, so a listener may hear a swell on every final *-l*. Lowering
it changes what both readers see, so it is the next round's change, made against a target level rather
than the reader. `sing.test.mjs` gains a test (15 in all): the tilt of *al*, *el*, *am* and *um* on A2, D3
and C4 at least 3 dB to the right side of the threshold, their reads, and *al* read as a nasal with the
rule off. Nobody has listened to it.

#### Final consonants, fifth round: the final r (2026-11-15)

After the third round (and in parallel with the fourth, above) the final r was the weakest coda: 4 of 11 on held-out set E, 7 of 9 on D, 9 of 14
on the five pieces, and every miss on a short note (0.24 s) and nearly all read as nothing. Before
changing anything a third held-out set was fixed (part H of `eval/coda-check-report.md`: files 1 and 4 of
every six in `corpus/gregobase-1908`, twenty Graduale pieces, none in D or E) and scored with its misses
hidden (`--hide-misses H`): 117 of 134 closings, r 3 of 7. A development set was named at the same time
(part I, the other twenty pieces) to read misses on alongside B.

- **What the reader saw** (I's *tur* and *tor.*, frame by frame): the r was sung like an opening's tap,
  45 ms with its contact in the middle, on the note's last 45 ms. Its contact then sat 15-25 ms from the
  next sound, and the next sound starts where the reader's window ends, so there was no voice after the
  contact inside the note: to the reader the r was the note simply stopping. And where the next syllable
  cut the note (*tur re*), the r was shortened to 34 ms and its 9 ms contact, smeared by 20 ms frames,
  came out only 7-9 dB under the vowel.
- **The synthesis** (`CODA_TAP`, `codaPlan` in `sing.mjs`): a final r is now its contact and then the
  voice open again for a moment, 45 ms of contact (the opening tap's length) and 35 ms of voice with the
  r's formants (floors 40 and 30 ms), so the tongue's flick sits inside the note with sound after it.
  The tail's length is an assumption, not fitted to recordings of singers. An r inside a cluster (*r k*)
  keeps its plain tap.
- **The reader** (`readCoda` in `onsets.mjs`): after /u/ and /o/ the r's own voice either side of the
  contact is up to 7 dB louder than the vowel, so a contact 13-17 dB under its neighbours sat only
  9-12 dB under the vowel, and the reader asked for 12. A dip 6 dB under the vowel now counts when frames
  12 dB louder than it stand on both sides (the old rule, 12 under the vowel with 10 either side, stays).
  And after /a/ the r's voice, darker than /a/ (F1 450 against 730 Hz), met the murmur rule and read as
  a nasal; a murmur that runs into or through a tap's contact is now taken as the r (no Latin coda puts
  a nasal next to an r). That second rule came from the new unit test (*ar* on a 0.197 s note), not from
  any part of the report.

Results, measured before the fourth round's /l/ rule landed on main (`eval/coda-check-report.md`; vowel-only controls and bare-vowel syllables unchanged in every part):

| set | before | first version | final | first synthesis alone | dip rule alone |
|---|---|---|---|---|---|
| H, held out, fixed this round (20 Graduale pieces) | 117 of 134 (87.3%) | 119 | 120 of 134 (89.6%) | - | - |
| H: r | 3 of 7 | 5 | 6 of 7 | - | - |
| E, held out in round 3 (misses not read since) | 75 of 86; r 4 of 11 | 80; r 9 | 81 of 86 (94.2%); r 10 of 11 | - | - |
| D, held out in round 2 | 66 of 70; r 7 of 9 | 68; r 9 | 68 of 70 (97.1%); r 9 of 9 | - | - |
| B, the five pieces (misses read) | 142 of 162; r 9 of 14 | 147; r 14 | 147 of 162 (90.7%); r 14 of 14 | 146; r 13 | 142; r 9 |
| I, development set (misses read) | 130 of 142; r 5 of 9 | 134; r 9 | 134 of 142 (94.4%); r 9 of 9 | 131; r 6 | 130; r 5 |
| A, syllables before a rest (tuning set) | 137 of 180 | 138 | 138 of 180 | 138 | 137 |

Across the three held-out sets (D, E, H), final r went from 14 of 27 to 25 of 27. The "first version" is the
synthesis with a 30 ms contact plus the reader's dip rule; the two ablations were run on the sets whose
misses were read. The two changes help each other (B: 9 with neither, 13 and 9 alone, 14 together). The unit test then showed *ur* on a
0.24 s note still reading as nothing (the 30 ms contact too shallow in 20 ms frames) and *ar* reading as a
nasal, which led to the 45 ms contact and the murmur-into-tap rule. H was printed three times (before,
after the first version, after the final one); its misses were never read, and nothing was changed on its
numbers. The numbers on H are small: 7 r in twenty pieces long enough to read.

Openings are unchanged (742 of 934, `eval/consonant-check-report.md`). Vowels measured before each final
consonant hold at 97.3% (696 of 715, `eval/vowel-check-report.md`); over the whole note, a window that
runs on into the coda, 874 to 865 of 920, because the final r now takes 60-80 ms of a note instead of
35-45. The vowel check also had the coda's position slightly wrong on a note the next consonant cuts
(it planned the coda on the uncut note); fixed, which adds one note to the 715. `sing.test.mjs` gains a
test (15 in all): a final r leaves 25 ms or more of voice after its contact on 0.197-0.5 s notes, and
*ur*, *or*, *er*, *ar* on D3 read as a tap up to the note's end on 0.197 and 0.242 s notes (it fails on
the old code). Nobody has listened to it: whether the r's tail sounds like a flicked r or like an extra
little vowel is the question for an ear.

**After merging the fourth round.** The final-/l/ round above (`MURMUR_TILT`) landed on main while this
one was being measured; the two touch the same nasal rule in `readCoda` and were merged with both
conditions kept (a murmur must be dark in itself and must not run into a tap). Measured again on the merged
code against main with only the /l/ rule (H printed for main with its misses hidden):

| set | main (with the /l/ rule) | merged |
|---|---|---|
| H, held out | 118 of 134 (88.1%); r 4 of 7 | 121 of 134 (90.3%); r 7 of 7 |
| E | 76 of 86; r 5 of 11 | 81 of 86 (94.2%); r 10 of 11 |
| D | 66 of 70; r 7 of 9 | 68 of 70 (97.1%); r 9 of 9 |
| B | 142 of 162; r 9 of 14 | 147 of 162 (90.7%); r 14 of 14 |
| I, development | 132 of 142; r 5 of 9 | 136 of 142 (95.8%); r 9 of 9 |
| A, tuning set | 157 of 180 | 157 of 180 |

Final r across the three held-out sets: 16 of 27 to 26 of 27. The fourth round's part F (final /l/ and the
nasals in the other gregobase-1908-* folders) is unchanged (l none 4 of 4, nasals 96 of 137).

#### Final consonants, sixth round: a final /l/ quieter than its vowel (2026-11-15)

The fourth round found the sung /l/ louder than the vowel it closes: `PHONES.l`'s fixed voicing gain of 1.4
put its steady part -1 to +8 dB against the vowel, loudest after /e/, /i/ and /u/, whose energy the /l/'s
F1 (400 Hz) and F2 (1250 Hz) pass better than their own resonances do. A listener would hear a swell on
every final *-l*.

- **The change** (`lateralGain`, `LATERAL_DB` in `sing.mjs`): a coda /l/'s voicing gain is worked out per
  note, as `nasalGain` does for the murmur. It is the harmonics' power through the vowel's five resonators
  against their power through the /l/'s, set so the /l/ sits 4 dB under the vowel. The 4 dB is an assumption,
  not fitted to recordings of singers: a liquid is quieter than a vowel and louder than a nasal (set 7 dB
  under). The opening /l/ kept its fixed gain, because the opening reader's thresholds were set on it
  (since the round "An opening /l/ at its vowel's level", below, it is set the same way).
  `lateralLevel: false` brings back the fixed gain for comparison.
- **Pre-registered** in the header of `eval/lateral-level-check.mjs`, committed before the first run with the
  change, with four predictions. Prediction (2) was reworded after the baseline run on main and before any run
  with the change: as first written it already failed on main (the /l/'s tilt is 26.7 dB at A2).

| prediction | result |
|---|---|
| (1) one seed: every /l/ (5 vowels x 6 pitches, E2-E4) 1 to 7 dB under its vowel | 20 of 30 (fixed gain: 9 of 30): **fails** |
| (2) the /l/'s own spectral tilt unchanged | 30 of 30: holds |
| (3) `eval/coda-check.mjs` parts A, B, D, E, F, H, I and controls no lower | every line identical: holds |
| (4) `eval/consonant-check.mjs` openings unchanged | 743 to 742 of 934: **fails by one read** (Dies irae: a written-no-consonant opening now reads as a nasal) |

**Why (1) failed.** The middle half of the /l/ is 25 ms long, and in that span the five detuned voices beat, so
one seed's level moves about 5 dB either way from note to note (G3 sat 5-7 dB under, E4 up to 2 dB over).
Not registered, measured afterwards: with power summed over twelve seeds, the fixed gain put the /l/ -5.4 to
+8.6 dB against its vowel (14 of 30 in the window) and the per-note gain -5.0 to -2.4 dB (mean -3.7; 30 of 30).
With one voice and no vibrato (the new test in `sing.test.mjs`) it is -4.0 to -3.8 dB at four pitches after
every vowel, where the fixed gain put it over the vowel on 11 of 20. A second version that summed the gain over
the detuned voices and the vibrato moved no cell by more than 0.2 dB and was dropped.
Report: `eval/lateral-level-check.md`. Nobody has listened to it.

#### Openings on the coda murmur (2026-11-15)

Since the second coda round a syllable's final nasal and its opening nasal were two different sounds. The
coda's murmur has its gain worked out per note (7 dB under its vowel, the middle of Fujimura's 5-10 dB), an
antiformant and a broad low resonance; the opening kept the first version's fixed gain. Measured with one
voice and no vibrato (m and n, five vowels, E2-E4), the old opening murmur sat 6.2 to 16.5 dB under the
vowel it leads into, deepest before /a/ and /o/. The second round had tried the coda murmur on openings and
dropped it, because the opening reader's thresholds were set on the old one (openings 742 to 724 of 934).

- **The synthesis** (`sing.mjs`): an opening nasal now sings the coda's murmur, its gain set against the
  vowel it goes to: 7.6 to 7.8 dB under it after every vowel at every pitch (one voice), its energy above
  1 kHz 42-51 dB under its band under 500 Hz. `onsetMurmur: 'first'` brings the old one back.
- **The reader** (`readOnset` in `onsets.mjs`): a nasal's level bar moves from 7 dB under the vowel to 5
  (`nasalBar`; the old bar sat right on the new murmur's level), and the murmur-tilt rule that keeps a final
  /l/ from reading as a nasal (`MURMUR_TILT`, fourth coda round) now applies to openings. It is taken over
  the nasal run's darkest stretch of three 5 ms-hop frames (`tiltSpan`), not over the whole run (why below).
- **A new held-out set, G:** the openings of the 60 Graduale pieces in `corpus/gregobase-1908`, which no
  run had scored (the coda check reads only their final consonants). Fixed and scored on main with its
  misses hidden before any change; its misses have still not been printed.

Pre-registered twice in the header of `eval/consonant-check.mjs`, each time committed before its first run.
The first registration took the tilt over the whole run and failed five of its nine lines: every nasal
opening in part A read as nothing. Read on A only (the tuning set): the run the level rule finds goes on
into the vowel's quiet attack, so its median tilt sat near -22 dB although its middle reaches -46. The second
registration takes the darkest three frames (chosen on A: 188 of 210; five frames 185; trimming the run's
ends 173).

| set | main | first registration | second (kept) | prediction (second) |
|---|---|---|---|---|
| G, held out: openings read exactly | 1833 of 2349 (78.0%) | 1825 | 1869 of 2349 (79.6%) | no lower: holds |
| G: nasals read exactly | 278 of 404 | 212 | 278 of 404 | no fewer: holds (no gain) |
| G: vowel-only control read as a nasal | 287 of 2349 | 71 | 135 | half or fewer (144): holds |
| B, the five pieces | 742 of 934 (79.4%) | 720 | 753 of 934 (80.6%) | no lower: holds |
| B: nasals read exactly | 96 of 149 | 60 | 95 of 149 | no fewer: **fails by one** |
| B: vowel-only control read as a nasal | 123 of 934 | 38 | 73 | half or fewer (62): **fails** |
| A, the tuning set | 183 of 210 | 172 | 188 of 210 | no lower: holds |
| coda check, every part | | identical | identical | within 2: holds |
| vowel check | | identical | identical | within 2 notes: holds |

The ablation, new murmur with the old reader: A 179, B 724 (nasals 78), G 1790 (nasals 235); the old reader
was set on the old murmur. Kept although two of B's lines fail: on the held-out set every line holds, the
murmur now meets the same level target in both positions, and the reader finds a nasal where none is sung
about half as often. What it does not do is find more of the nasals that are sung: a third of G's (118 of
404 read as nothing) and of B's still go unread, the next thing to look at. Nobody has listened to it: an
opening *m* or *n* is now louder before /a/ and /o/ (by up to 9 dB), which is the change most worth an ear.

**Found on the way, not changed: a short final *-um* is quiet or loud by chance.** The open item from the
third round was *-num* and *-rum* on short notes reading as nothing. With one voice the coda murmur sits
7.0 dB under its vowel at every pitch; with the choir's five detuned voices it sat anywhere from 5.7 dB over
to 20.1 dB under the vowel measured 0.3 s earlier (0.6 s notes, eight seeds, /a e o u/, E2-C4), the same
seed loud or quiet after every vowel. The voices' low harmonics, which are all a murmur passes, beat
against each other (at roughly 0.2-4 Hz, from the detunes of -12 to +13 cents), so the murmur's level against the vowel depends on where in the beat it
falls. A real section beats too; whether this much is natural, and whether the reader should compare a coda
with the vowel just before it rather than at the note's start, is the next round's question.

#### Nasal openings: the mouth closes (2026-11-15)

After the coda-murmur round a third of the sung nasal openings still read as nothing (G 118 of 404, B 54 of
149). Reading B's 54 misses frame by frame (B is now a development set, like A) showed two causes, both on
the corpus's 0.24 s notes:

- **The vowel before covered the murmur.** A sung note cross-fades into the next for 50 ms, cut to 15 ms
  before a stop, an affricate, a fricative or a tap, so their closures are silent. A nasal kept the 50 ms,
  so the previous vowel's tail covered the first 50 ms of the 70 ms murmur and only 20-30 ms of it stayed
  dark. But m and n close the mouth as a stop does (lips, or tongue on the ridge): the oral vowel stops and
  the sound goes on through the nose. `render.mjs` now cuts the cross-fade to 15 ms before a nasal opening
  too (`renderMidi(..., { nasalCut: false })` keeps 50 ms). The murmur is now dark (above 1 kHz 44-51 dB
  under its band under 500 Hz) for 45 ms or more.
- **The reader looked for a quiet murmur, and it is not reliably quiet.** The synthesis sets a murmur 7 dB
  under its vowel, true with one voice; with the five detuned voices, whose low harmonics beat, it sat
  anywhere from 5 dB over to 17 dB under the vowel after it (the same beating found in the last round's
  short final *-um*). Its darkness holds. `readOnset` now reads a frame as murmur when its own tilt is 10 dB
  (`DARK_BY`) darker than both the vowel after it and the sound just before the window, its level from 25
  dB under to 6 dB over the vowel, its low band within 15 dB, and the run dark in itself (`MURMUR_TILT`) as
  before. "Than both" matters: darker than the vowel after alone also read every dark vowel (/u/, /o/)
  before a bright one as a nasal (93-187 of the vowel-only control's 934 notes in B). `darkBy: 0` is the
  old level rule.

Pre-registered in the header of `eval/consonant-check.mjs` and committed before part G was run with either
change; the settings (10 dB, 6 dB, both sides) were chosen on A and B only.

| set | main | the cross-fade alone (dev) | both (kept) | prediction |
|---|---|---|---|---|
| G, held out: openings read exactly | 1869 of 2349 (79.6%) | | 1959 of 2349 (83.4%) | 1869 or more: holds |
| G: nasals read exactly | 278 of 404 (68.8%) | | 347 of 404 (85.9%) | 320 or more: holds |
| G: vowel-only control read as a nasal | 135 of 2349 | | 44 of 2349 | 30 or fewer: **fails** |
| B (development now) | 753 of 934; nasals 95 of 149 | 761; nasals 106 | 780 (83.5%); nasals 123 of 149 | |
| B: vowel-only control read as a nasal | 73 | 73 | 6 | |
| A, tuning set | 188 of 210 | 192 | 195 of 210 (92.9%); control 210 of 210 | 188 or more: holds |
| coda check, every part | | | totals identical | within 2: holds |
| vowel check, corpus notes | 865 of 920 | | 865 of 920 (before the coda 696 to 698 of 715) | within 2: holds |

Kept with the third line failed: the vowel-only choir's false nasals on G fell to a third, not to the
fifth predicted from B. The pairs set in `sing.test.mjs` (m and n before five vowels, 0.24 s notes, A2, D3,
G3) reads 26 of 30 nasals, against 20 of 30 before; at D3 alone it reads 6 of 10, against 8 before, so the
gain is not at every pitch. The test asserts 24 or more, a gain over the old pair, and none from the
vowel-only choir. Nobody has listened to it: whether a 15 ms hand-over into an m sounds clipped is the
question for an ear. Reports: `eval/consonant-check-report.md`, `eval/coda-check-report.md`,
`eval/vowel-check-report.md`.

#### An opening /l/ at its vowel's level (2026-11-15)

The sixth coda round set a final /l/ per note, 4 dB under the vowel it leaves; the opening /l/ kept
`PHONES.l`'s fixed voicing gain of 1.4. Measured from the wave (one voice, no vibrato, the middle half of the
/l/ against 0.30-0.45 s of the vowel), that put an opening /l/ 7.7 dB under to 4.8 dB over the vowel it goes
to, 11 of 30 cells at or over it: loud before /e/, /i/ and /u/ at G3 and E4, quiet at C4. A listener would
hear *lux*, *laudate* and *lumen* open with a swell on some notes and a dip on others.

- **The change** (`sing.mjs`): an opening /l/'s gain is worked out by `lateralGain` against the vowel it goes
  to, as the coda's is. `onsetLateral: 'first'` keeps the fixed gain on openings; `lateralLevel: false` on both.
- **Pre-registered** in the header of `eval/onset-lateral-check.mjs`, committed before the first run with the
  change. Report: `eval/onset-lateral-check.md`.

| prediction | main | after |
|---|---|---|
| (1) one voice: spread 4 dB or less, every cell under its vowel | -7.7 to +4.8 dB (spread 12.5), 11 of 30 at or over | -6.4 to -5.7 dB (spread 0.7), 0 over: holds |
| (2) five voices, 12 seeds: spread 6 dB or less, every cell under | -7.7 to +6.3 dB (spread 13.9), 13 of 30 over | -6.6 to -4.2 dB (spread 2.4), 0 over: holds |
| (3) the /l/'s own tilt unchanged to 0.5 dB | | 0.00 dB: holds |
| (4) `eval/consonant-check.mjs` A, B, G within 2; written-none rows within 2 | A 195, B 780, G 1959 | byte-identical report: holds |
| (5) `eval/coda-check.mjs` within 2, `eval/vowel-check.mjs` within 2 notes | | both byte-identical: hold |

The measured level sits about 2 dB under the 4 dB target in every cell: the voices swell over 30 ms when a
consonant leads and start up to 20 ms apart, which covers the /l/'s first half and which the steady-state sum
does not see. That was expected and written into the registration. The reader's output did not move by one
read: an /l/ is read as no consonant whether it sits 5 dB over its vowel or 6 under, so this round changes
what is heard and nothing the checks can see. A new test in `sing.test.mjs` holds the opening /l/ within 2 dB
of one level across five pitches and five vowels (the fixed gain spread over 8). Nobody has listened to it:
whether a 6 dB step from /l/ into the vowel sounds like a Latin *l* or like a late entry is the question for
an ear.

#### A short final -um against the vowel just before it (2026-11-15)

The coda-murmur round left a question: with the choir's five detuned voices a short final *-um* sat
anywhere from 5.7 dB over to 20.1 dB under the vowel measured at the note's start, because a murmur passes
only the voices' lowest harmonics and those beat against each other at 0.2-4 Hz. `readCoda` compared every
frame of the coda with 60 ms of vowel taken at the note's start, so a murmur caught at a low point of the
beat was too quiet for its nasal rule and one caught at a high point too loud. On the corpus's 0.24 s notes
that was most of the nasal misses: *-num*, *-tum*, *-rum* and *-um* read as nothing (B 10 of 39 nasals).

Read frame by frame (B, a development set), the vowel's own level drifts with the same beat in the 100 ms
before the closure: a *num* at D3 whose murmur sat 12 dB under the note's start sat 3-6 dB under the vowel
just before it. What holds is the step: at the closure the sound turns 10-15 dB darker within 10 ms and stays
there.

- **The change** (`onsets.mjs`): a third nasal rule reads a run as a murmur when, against the vowel 25-45 ms
  before it, every frame is 8 dB or more darker (`NEAR.dark`) and from 0 to 18 dB quieter, its level and its
  darkness each held within 4 dB over its first 30 ms (`hold`, `tiltHold`), 45 ms long, dark in itself
  (`MURMUR_TILT`) and with no vowel coming back after it. `readCoda(..., { nearVowel: false })` is the reader
  before; `node eval/coda-check.mjs --near off` prints the old report, byte for byte.
- **The first registration was withdrawn.** Without `tiltHold` it read 9 of 9 vowel-only /u/ and /o/ notes on
  F3 as nasals: as those vowels release, their darkness wanders by 8 dB while their level holds. That was
  found on a synthetic set (*num tum rum um cum am em om* and bare vowels, eighth and quarter notes, E2-E4,
  124 BPM) before any held-out part had finished, so the run was stopped unread, the darkness hold added,
  and the predictions registered again (header of `eval/coda-check.mjs`, both commits on the branch).

| prediction (second registration) | main (`--near off`) | after |
|---|---|---|
| (1) held-out nasals no fewer in D, E or H; 71 of 80 or more together | D 11 of 12, E 18 of 22, H 38 of 46 (67) | D 11, E 19, H 43 (73 of 80): holds |
| (2) D, E, H totals no lower | 68 of 70, 81 of 86, 121 of 134 | 68, 82, 126 of 134 (94.0%): holds |
| (2) their vowel-only controls and bare vowels within 1 | 68, 84, 131; 180, 216 bare | identical: holds |
| (3) F's nasals 104 of 137 or more; its /l/ none on 4 of 4 | 96 of 137 | 106 of 137 (77.4%); /l/ 4 of 4: holds |
| (4) vowel and consonant checks cannot move | | nothing else calls readCoda; synthesis untouched |
| development: A, B, I | A 157, B 147 (nasals 28 of 39), I 136 | A 160, B 155 (nasals 36), I 138; controls identical |

The synthetic set is now a test (`sing.test.mjs`): 27 of 32 short final nasals read with the rule, 23
without, and no vowel-only or bare-vowel note read as anything. Still missed: *-unt* and *-sunt* read on
their stop, *in* read as a voiced fricative, and a few *-num*/*-lum* after a dark vowel on E4 and in F's
pages. Nothing in the synthesis changed, so the beat is still there: whether five real voices beat this
much on a held *-um*, and whether a listener hears the murmur come and go, is a question for an ear.

#### -unt read on its stop: the n of a cluster (2026-11-16)

The last round left *-unt* and *-sunt* read on their t. Part A, the set the reader was tuned on, missed *unt* at
four of six pitches and *ant* at E2, and F's misses held eleven such clusters (*sunt*, *bunt*, *runt*, *tent*).
Read frame by frame on a synthetic set, the n is there: a murmur of 50-70 ms (`codaPlan`), 17-55 dB darker
(energy above 1 kHz against under 500 Hz) than the vowel before it, until the t's closure. Every nasal rule
missed it for its own reason:

- the level rule wants the murmur 5 dB or more under the vowel, and with five beating voices at E2 and A2 it
  sits only 2-4 dB under;
- the step rule wants a drop under 500 Hz, and there is none;
- the rule against the vowel just before it wants the darkness held within 4 dB, and it wobbles by 6.

- **The change** (`onsets.mjs` `PRE`): a run also counts as a murmur when every frame is 6 dB or more darker
  than the vowel 25-45 ms before it, at -18 to +4 dB of its level, dark in itself (`MURMUR_TILT`), 40 ms or
  more long, entered by a step of 8 dB or more within two 5 ms hops of its start, and ending no more than 5
  frames before a stop's closure or a fricative. The step is what tells a murmur from the vowel's own run-in
  to a closure. A vowel darkens into a /p/, /k/ or /b/ as well, most of all /u/, whose formants move to the
  lips' or the velum's locus, but it does that as a ramp of 2-5 dB per hop. The first draft, without the
  step, read 14 of those (*up*, *uc*, *ub*, *ux*, *ap*) as nasals. With no obstruent after it (the
  vowel-only choir, or a final *-m*) the rule cannot fire. `readCoda(..., { preObstruent: false })` is the
  reader before, and `node eval/coda-check.mjs --pre off` prints the old report.
- **Tuned on synthetic syllables only.** That is part J of `eval/coda-check.mjs`: 11 clusters (*unt ant ent int
  sunt nunc tunc ens mens ans ont*) and 28 others, at E2-E4 in quarter and eighth notes, sung and
  vowel-only. Cluster nasals went from 46 to 124 of 132, the others stayed at 304 of 336 and the control at
  445 of 468. No corpus part has been clean held-out data since the last rounds printed their misses, so the
  predictions were written into the script's header and committed before any corpus part was run with the
  rule.

| prediction | `--pre off` | after |
|---|---|---|
| (1) A's *unt* and *ant* nasal on 10 or more of 12; A 163 of 180 or more | 7 of 12; 160 | 12 of 12; 168 of 180 (93.3%): holds |
| (2) F's nasals 112 of 137 or more; its /l/ none on 4 of 4 | 106 | 116 of 137 (84.7%); 4 of 4: holds |
| (3) B, D, E, H, I totals no lower; their cluster nasals 9 of 11 or more | 155, 68, 82, 126, 138; 7 of 11 | 157, 68, 82, 128, 138; 11 of 11: holds |
| (4) every vowel-only control and bare-vowel row identical | | identical: holds |
| (5) vowel and consonant checks cannot move | | readOnset and the synthesis untouched |

Still missed: one *sunt* in F (3550, read as a voiced t), and on J *nunc*, *tunc* and *mens* at C4 and E4,
where the murmur comes in with no 8 dB step. A's remaining misses are the old ones: *ab*, *ad* and *ap* read
as nasals at E2, G3 and D3 (the step rule, not this one), and /i/ read as a voiced fricative from G3 up.
`sing.test.mjs` holds the rule: 15 cluster syllables at three pitches read on their n, at least 4 more than
without it, and no other syllable gains a nasal. Nothing in the synthesis changed. This round makes the
check see the n that was already sung. Whether a listener hears *sunt* or *sut* is a question for an ear.

#### /i/ is not a voiced fricative (2026-11-16)

Part K's other misses were mostly one fault: /i/ read as a voiced fricative (83 of 119), sung or vowel-only, on
*i*, *ip*, *ic*, *im*, *in* and *hinc*. Read frame by frame, a vowel-only /i/ on A3 holds its level for 100 ms,
then its band under 500 Hz sinks 8-18 dB for about 250 ms and comes back. That is the five detuned voices
(`detunes: [-12, -4, 0, 5, 13]` cents) beating: their fundamentals drift out of phase and cancel. Every vowel
does it, but /i/ keeps almost all its energy in its lowest harmonics (F1 270 Hz), so its level goes with them.
In the trough the share of energy above 2.5 kHz rises past 0.12, which is the voiced-fricative rule, and on a
short note's attack past 0.5, which is the fricative rule, then labelled voiced by its low band. The release of
/i/ does the same as it fades.

- **The change** (`onsets.mjs` `VFRIC_HI5`): a frame counts as frication, voiced or not, only when it carries
  12 dB or more energy above 5 kHz than the vowel did. Frication is noise high up (sing.mjs centres /s/ and /z/
  on 6.5 kHz, /f/ and /v/ on 5 kHz). A beating /i/ adds nothing there. `readCoda(..., { vfricHi5: false })` is the
  reader before; `node eval/coda-check.mjs --vfric off` prints the old report.
- **Chosen on synthetic syllables at K's pitches only**: sung *az ez iz oz uz av iv* frames sit 66 to 110 dB
  over the vowel above 5 kHz, and the /i/ frames that misread sit -13 to +3 dB. The two groups are far
  apart, so 12 dB was not tuned further. Every part had printed its misses, so a new part L was written: 16
  syllables on /i/, four voiced-fricative codas (*iz az ev uv*, not Latin, there to show a real one still
  reads) and 12 others. None had been sung in any part before. They run at G2, C3, D#3, G#3 and C#4 (no pitch of A,
  J or K), 96 BPM, half and quarter notes. Its predictions were committed in the script's header before L or
  any other part was run with the change.

| prediction | `--vfric off` | after |
|---|---|---|
| (1) L's /i/ syllables, at least 8 more | 110 of 160 | 153 of 160 (95.6%): holds |
| (2) L's vowel-only /i/ read as none, at least 8 more | 128 of 160 | 160 of 160: holds |
| (3) L's other syllables within 2; the rest of its control no lower | 113 of 120; 158 of 160 | 113; 160: holds |
| (4) L's voiced-fricative codas within 4 | 39 of 40 | 39 of 40: holds |
| (5) A, B, D, E, H, I, F, J, K totals no lower, nasals no fewer, controls no lower; K's others 172 or more | | every one holds (below) |
| (6) vowel and consonant checks cannot move | | readOnset and the synthesis untouched |

Every other part rose. A went from 168 to 173 of 180, and its vowel-only control from 174 to 180, which clears
the six "/i/ read as a voiced fricative at G3 and above" written up in the first coda round. B went from 157 to
159 of 162, D 68 to 69, E 82 to 83, H 128 to 129, I 138 to 138, F's nasals 116 to 120 of 137, J's cluster nasals
127 to 128 and its control 445 to 453 of 468. K's cluster nasals went from 127 to 131 of 140, its other syllables
from 166 to 198 of 220 and its control from 295 to 343 of 360. The vowel-only control of every corpus part (B, D,
E, H, I) now reads as none on every syllable that closes on its vowel. One line no prediction named went the
wrong way: K's other syllables read as a nasal went from 6 to 7. L's misses left: *sub* and *cum* read as nothing (3, 2), *vir*
as nothing (2), *fid* five ways (its d), *lu* as a nasal (2), and one *uv* as nothing. `sing.test.mjs` holds
this round: *i*, *ip*, *im*, *in* on F3 and A3 never read as a voiced fricative (4 or more did without the
test), and *az*, *oz*, *ev* still do.

What this round found about the synthesis: the trough is in the sound, not only in the reader. Five voices whose
fundamentals begin within half a cycle of each other and drift apart give a low-band swell of 8-18 dB on /i/
every few hundred milliseconds. A listener may hear that as tremolo on the bass of a held /i/, or as an
ordinary choir sound. That question is added to the listening test; random start phases or uneven detunes
would change it. Nothing in the synthesis changed this round. Not listened to.

#### /i/ checked out of sample: a second session's set, and a second rule (2026-11-16)

A second session took the same item in parallel and wrote its own fix before the round above merged: a
coda's voiced fricative needing its energy above 2.5 kHz 6 dB over the vowel's (it scored the /i/ beat at -14
to +4 dB there, a sung z 12-51, a v 2-21), pre-registered on its own held-out set. That set is now part M of
`eval/coda-check.mjs`: 24 syllables (*id il ir if ist ins li di ri mi*; *ag eg og ul ol ur or ed od uf*; *iz az iv
ev*), 19 of them in no other part, at G2, C3, E3, G#3, C#4 and D#4, 96 BPM. It was written before that session
saw `VFRIC_HI5` or part L, so it is an out-of-sample check of the rule on main. Nothing was tuned on it.

| part M | reader before | `VFRIC_HI5` (main) | the 2.5 kHz rise (not merged) |
|---|---|---|---|
| /i/ syllables read exactly | 62 of 120 | 105 of 120 (87.5%) | 99 of 120 |
| other syllables read exactly | 106 of 120 | 106 | 106 |
| z codas read as a voiced fricative | 24 of 24 | 24 | 24 |
| v codas read as a voiced fricative | 23 of 24 | 23 | 16 |
| vowel-only control read as none | 228 of 288 | 288 of 288 | 288 |

`VFRIC_HI5` holds on data it never saw, and it beats the other rule. A v puts its noise near 5 kHz, which a
test against the vowel's 2.5 kHz band only half sees after /i/ and /e/. The other rule was not merged. M's
misses left: *if* read as an s (7, the place rule's centroid after /i/), *uf* as an s (4), and *id*, *ir*,
*ur* read as nothing (2 each). Reader only; not listened to.

#### nunc and mens on C4: the murmur thrown out by what follows it (2026-11-16)

The cluster round left *nunc*, *tunc* and *mens* missed on C4 quarter notes in part J. Read frame by frame, the
murmur was there and one rule had already found it: the reading against the vowel just before it (`NEAR`) saw
*nunc*'s n as 60 ms 8 dB or more darker than the /u/, its level and darkness both holding. It was then thrown out
by `vowelAgain`, the check that a murmur closes the syllable and the vowel does not come back after it (a vibrato
swing on a high note can look like a murmur for 30 ms). `vowelAgain` read every frame after the run to the end of
the window, so it also read the obstruent: the /s/ of *mens* is bright and only 8 dB under the vowel, which
passed for vowel. On *nunc* and *tunc* one frame did it: as the murmur hands over to the k's closure it
brightens for 5-10 ms.

- **The change** (`onsets.mjs` `AGAIN`): when a stop's closure or a fricative starts within 5 frames of the
  run's end, `vowelAgain` reads only the frames between and needs 2 or more vowel-like ones. Elsewhere it reads
  as before. `readCoda(..., { againGap: false })` is the reader before; `node eval/coda-check.mjs --again off`
  prints the old report.
- **Chosen on part J only** (cluster nasals 124 to 127 of 132, the others 304 of 336 and the vowel-only control
  445 of 468 unchanged). Every corpus part has printed its misses, so none is clean held-out data. A new part K
  was written for this round: 14 cluster syllables (*fons dens pons mons gens hinc runt bunt tent cant frons
  sanct lunt quent*) and 22 others never sung in any part, at B2, F3, A3, B3 and D4 (no pitch of A or J), 104 BPM.
  Its predictions were committed in the script's header before K or any other part was run with the change.

| prediction | `--again off` | after |
|---|---|---|
| (1) K's cluster nasals no fewer, at least 1 more | 121 of 140 | 127 of 140 (90.7%): holds |
| (2) K's other syllables within 1; no more read as a nasal | 166 of 220; 6 nasal | 166; 6: holds |
| (3) K's vowel-only control identical | 295 of 360 | 295: holds |
| (4) A, B, D, E, H, I, F totals no lower, nasals no fewer, controls identical | | every one byte-identical: holds |
| (5) vowel and consonant checks cannot move | | readOnset and the synthesis untouched |

What K found that it was not built to test: on pitches the reader was not tuned on, it reads K's other
syllables right only 75.5% of the time and the vowel-only control as none 81.9%, against 90.5% and 95.1% on J.
Most of the gap is one known fault: /i/ is read as a voiced fricative (83 of the 119 misses, on *i*, *ip*, *ic*,
*ib*, *ix*, *im*, *in* and *hinc*, sung or vowel-only). The other 36: 23 syllables on /o/ and /u/ read as a nasal, once each (17 vowel-only, 6 sung), *ep*, *ip* and *op* read as a k (3 each), *ef* as an s (3) and *ix* as a tap (1).
The cluster misses left: *fons* on every eighth note read as nothing, *hinc* as a voiced fricative (its /i/
again), and on E4 eighth notes (J) *nunc*, *tunc*, *mens* and *sunt* read as a voiced labial stop. There the
murmur is 18-33 dB under the vowel and only 20-30 dB dark in itself (one harmonic of a 330 Hz voice passes
under 500 Hz), so it meets the closure rule instead of a murmur rule. That is the next item. `sing.test.mjs`
holds this round: *nunc*, *tunc*, *mens* and *unt* on C4 all read on their n, at least 2 more than without the
change, and none of *up uc ub us es ec* reads as a nasal. Nothing in the synthesis changed. Not listened to.

#### E4 eighth notes: a murmur read as a closure (2026-11-16; a rule that failed its registration, kept off)

The cluster rounds left four misses in part J, all on E4 eighth notes: *nunc*, *tunc* and *mens* read as a voiced
labial stop, *sunt* as a voiceless t. Read frame by frame (5 ms hops, levels against the reference vowel), the n
is there: 50-70 ms at -19 to -32 dB, 15-30 dB dark in itself, then the k or t closure falls to -100 dB and bursts,
or the /s/ of *mens* starts. It is too deep for every nasal rule (PRE stops at -18 dB, `murmurTilt` wants 28 dB
of darkness, and one harmonic of a 330 Hz voice under 500 Hz does not give that). Inside it, a dip of the five
detuned voices' beat to -31 dB met the closure rule, and the murmur's swell back counted as its burst.

- **The rule** (`onsets.mjs` `DEEP`, `readCoda(..., { deepMurmur: true })`): a run of 60 ms or more at -12 to
  -35 dB of the vowel (the louder of the reference and the vowel's peak in the 50 ms before the run), a median
  15 dB dark in itself, that runs into frication outlasting it, or within 5 frames into a closure that reaches
  -50 dB and ends in a burst. A voiced stop's voice bar holds at -24 to -43 dB up to its burst, so it should not
  qualify; a vowel falling into a voiceless closure passes through the band in 15-35 ms.
- **First registration, failed.** Chosen on J alone (a fall of 18 dB under the run in place of -50 dB, 50 ms,
  no peak), with a new part N (10 clusters, 20 others, F#2 to E4, 108 BPM) written and committed before it ran.
  It missed three of five predictions. N's D#4 and E4 eighths were already read right 19 of 20 times without it
  (an eighth at 108 BPM is 0.28 s, longer than J's 0.25), N's voiced stops read as a nasal 5 times against 1,
  and K, L and M each lost a syllable. Two faults: on an eighth note the reference vowel, taken 45 ms in, is still
  in its attack, so a *lud* voice bar on D#4 sat only 24 dB under it; and after the -15 dB tail of a dark vowel
  (*rud* on A#3) a voice bar at -36 to -41 dB was "18 dB under the run".
- **Second registration, failed too.** The peak, the -50 dB silence and the 60 ms were set on J and N (887 to 891
  of 936, 689 to 691 of 720, nothing worse on either). A new part O (10 clusters and 20 others sung in no other
  part, F2 to E4, 126 BPM, eighths of 0.24 s) was committed with its predictions before it ran.

| prediction (against `deepMurmur: false`) | off | on |
|---|---|---|
| (1) O's cluster nasals no fewer, 2 more on D4-E4 eighths | 111 of 120; 25 of 30 | 113; 25 of 30: fails |
| (2) O's others within 1, voiced stops read as a nasal no more | 210 of 240; 3 | 210; 4: fails |
| (3) O's vowel-only control identical | 356 of 360 | 356: holds |
| (4) A-N totals no lower, nasals no fewer, controls identical | | M's others 106 to 105: fails; the rest hold |
| (5) vowel and consonant checks cannot move | | readOnset and the synthesis untouched: holds |

Across every part the rule gains 8 reads (J's four, N's *fans* and *font* on D#4, O's *ment* and *pens*) and loses
one (*og* in M), and it never moves A, B, D, E, H, I, F, K or L. But it was registered to fix short high notes
and on O it fixed none of them, so it ships as registered: off by default. `node eval/coda-check.mjs --deep on`
runs every part with it, and parts N and O print both columns. O's five D4-E4 eighth misses (*punc* twice as a k,
*tunt* and *ment* as a t, *sons* as an s twice in all) were not read frame by frame, and they are the next item.
That needs a part P, since O's misses are now printed. `sing.test.mjs` holds the opt-in: with `deepMurmur: true`
all four of J's E4 eighths read on their n (at least 3 more than without), and *ad*, *ud*, *ab*, *ub* on E2
and A2 eighths read as stops with it and without. Reader only; nothing in the synthesis changed. Not listened to.

#### A voice bar read as a murmur (2026-11-16; failed its registration, opt-in)

The round before left T's voiced stops read as a nasal (*tag*, *pob*, *hag*, *vob*, 11 of 22 misses). Read frame by
frame (`eval/vstop-diag.mjs T`, which now names the nasal rule that fired and where a stop's closure starts), all 10
of those four syllables' nasal misses came from the plain level rule, and on 7 of them a stop's closure, burst found,
starts 1 to 7 frames (5-35 ms) after the "murmur" run starts. *tag* on F#3, eighth note: the five voices' beat lifts
the vowel 10 dB over the 60 ms reference just before the closure, so the voice bar sits 26 dB under that vowel, which
the closure rule (against the vowel before it) accepts, and 16 dB under the reference, which the level rule (-5 to
-25 dB of the reference, dark) accepts too. Both runs start on the same frames, and the nasal run sorts first.

- **The rule** (`readCoda`'s `barLead: N`, opt-in; `--bar N` in `eval/coda-check.mjs` and `eval/vstop-diag.mjs`): a
  level-rule run that a burst-ended closure starts inside of, within N frames of the run's start, is that closure's
  voice bar and is dropped. A cluster's n is a 40-70 ms murmur before its stop's closure, so it starts earlier.
  `readCoda` now also returns which rule read a nasal (`rule`, `at`, `ms`, `stopAt`), for diagnostics.
- **Development** (A-T): with `barLead` 3 and 8 nothing fell anywhere. With 8: T's voiced stops 122 to 125 of 144
  (as a nasal 11 to 6), P's others 214 to 218, J's 321 to 325, Q's voiced stops 106 to 107, A 177 to 178, L and O +1.
- **Pre-registered on a new part U** (`eval/coda-check.mjs` header, seventeenth round, committed before U ran):
  12 voiced-stop codas, 4 nasal codas, 4 n-clusters (the rule's risk) and 8 others, none sung before, at A2, D3,
  G#3, A#3, C#4 and D#4, 110 BPM.

| U, against the default | default | `barLead: 8` | wanted |
|---|---|---|---|
| voiced-stop codas read exactly (of 144) | 127 | 128 | 2 or more better: **fails** |
| voiced stops read as a nasal | 6 | 4 | 2 or more fewer: holds |
| nasal codas (of 48) | 46 | 46 | no fewer: holds |
| n-clusters read as their nasal (of 48) | 46 | 46 | no fewer: holds |
| others (of 96) | 93 | 93 | no fewer: holds |
| vowel-only control read as none (of 336) | 332 | 332 | no fewer: holds |

So `barLead` stays opt-in and the default reader did not change. The registration quoted U's control as "of 288",
copied from T; U has 28 syllables, so 336. The rule does what it was written to do on held-out data (two nasal misses
fewer, nothing lost), but one of the two came back as the wrong stop. Read after the run (`eval/vstop-diag.mjs U
--bar 8`): *dag* on A#3 turned from a nasal into a voiced *labial* stop, as did *tag* and *hag* on F#3-B3 in T, and
the voiced stops still read as a nasal on C#4-E4 (*bob*, *lag*, *pob*, *hag*) have no burst found at all, so no
closure for the rule to see. The next faults are the burst's place for g on F#3-A#3 (read as b) and the burst
search on C#4-E4, not the murmur rule. Reader only; nothing in the synthesis changed. Not listened to.

#### A g's burst read as a b (2026-11-16; failed its registration, opt-in)

The round before left voiced g codas on F#3-A#3 read as a b (*tag*, *hag* in T, *dag*, *lag* in U). Read burst by
burst (`eval/vstop-diag.mjs`, which now prints each stop's burst centroid, share of energy above 1 kHz and sliding
500 Hz compactness), every velar read as labial on K, N, T and U had a compact burst, 0.68 to 0.83 of its 1-11 kHz
energy in one 500 Hz band centred at 1.9 to 2.8 kHz, but only 32 to 50% of its energy above 1 kHz. readCoda's place
test asks "is most of the energy under 1 kHz?" before it asks "is it compact?", and the voice bar's low harmonics,
still running under a voiced g's burst on these pitches, answer the first question for it.

- **The rule** (`readCoda`'s `compactVelar`, `COMPACT_VELAR` = 0.65 compact at 1.65 kHz or above; opt-in; `--velar on`
  in `eval/coda-check.mjs`): a burst that compact, that high, is velar before the low test. On K, N, T and U, labial
  bursts as compact as that all peaked at the 1.25 kHz floor, and those peaking at 1.5 kHz or above were 0.58 compact
  or less.
- **Development** (A-U): +7 cells, nothing lost: K, N, O and P's others +1 each, T's voiced stops 122 to 123, U's 127
  to 129 (with `barLead: 8`, 128 to 131). Every vowel-only control and the corpus parts identical.
- **Pre-registered on a new part V** (`eval/coda-check.mjs` header, eighteenth round, committed before V ran):
  16 velar codas (10 g, 6 c), 9 labial, 5 alveolar and 5 others, none sung before, at G2, F3, G3, A3, B3 and D4, 114 BPM.

| V, against the default | default | `compactVelar` | wanted |
|---|---|---|---|
| velar codas read exactly (of 192) | 175 | 176 | 3 or more better: **fails** |
| velars read as a labial stop | 1 | 0 | 3 or more fewer: **fails** |
| labial codas read exactly (of 108) | 86 | 86 | no fewer: holds |
| labials read as a velar stop | 14 | 14 | at most 1 more: holds |
| alveolar (of 60), others (of 60), vowel-only control (of 420) | 57, 59, 420 | 57, 59, 420 | identical: holds |

So `compactVelar` stays opt-in and the default reader did not change. The rule did what it was written to do: V's
one velar read as a labial (*sog*) came back, and nothing else moved. But V had only one such cell to fix. The fault
was common on the development cells that had been read (T and U on F#3-A#3), and the registration took that rate for
the rate everywhere. `compact-velar.test.mjs` (2 tests) keeps U's *lag* on A#3 and checks no other coda in that cell
moves.

V found a larger fault the other way round: 14 of its 108 labial codas read as a velar stop, 12 of them a voiceless
p on A3 and B3 (*lap*, *rup*, *sep*, *fip*, *mop*, *dap*). `sing.mjs` sings p's burst in a band at 500 Hz, yet on those
cells the burst the reader finds has a 2.1-2.3 kHz centroid with 54-66% of its energy above 1 kHz; the same syllables
on G2 and F3 read 33-44%. Where that energy comes from (the burst search's timing, or the vowel's release reaching
into the 10 ms window) is the next thing to read, frame by frame, before any rule. Reader only; not listened to.

#### The murmur inside an E4 quarter (2026-11-21, latest; registration failed, the reader unchanged)

The last round left part f's sung *crun* and *frun* on E4 quarters read as nasals only from a near-rule run 198 ms
after the note's end, so `nearRelease` turned them to nothing: the n sung inside the note was never caught. Read frame
by frame with the new `eval/e4-quarter-diag.mjs` (every frame from 350 ms before the note's end: level, band under
500 Hz and band above 1 kHz against the reference, the frame's own tilt, the near rule's view of it, and which frames
`codaPlan` gave the n):

- **The n is there and plain.** In the note's last 70 ms the band above 1 kHz drops 25-30 dB in 15 ms and stays 18 dB
  or more under the vowel to the window's end. The vowel-only take of the same cell never takes that band 20 dB under.
- **Every nasal rule turns it away, each by a little.** It is as loud as the reference, so the level rule's "5 dB under"
  fails. It is 1 dB louder than the vowel 25-45 ms before it, which sits in the dip of the transition into the n, so the
  near rule's ceiling (`hi: 0`) cuts its run to 35 ms of the 45 needed. And `lipShut`'s upper band, far under the vowel,
  still wobbles 8 dB over its first 30 ms with the five voices' beating, against `hiHold: 6`.
- **The rule tried** (`--shut hiHold=8` in `eval/coda-check.mjs`; no code change, `LIP_SHUT` takes it as an option):
  8 dB, the smallest hold that admits that cell, read off it before any part ran. Development (A-f, every part,
  `eval/hihold-sweep.md`): +7 cells and none lost: O's and Y's nasals +1 each, b's dark-vowel nasals 133 to 135 of 144,
  d's 136 to 137, f's 300 to 302 of 312; every vowel-only control identical. 10 dB, run beside it: +9, none lost.
- **Pre-registered on a new part g** (`eval/coda-check.mjs` header, thirty-first round, committed as b65b403b3 before g
  ran): 12 dark-vowel nasals, 5 voiced stops, 4 bright-vowel nasals, 4 n-clusters, 3 voiceless stops and 4 others, none
  sung before, on f's thirteen pitches, quarters and eighths, at 82 BPM.

| g | default | `hiHold: 8` | wanted |
|---|---|---|---|
| dark-vowel nasals missed by the default (test condition: 4 or more) | 11 | | holds |
| nasals after /u/ or /o/ read exactly (of 312) | 301 | 301 | 1 or more better: **fails** |
| nasals after a bright vowel, n-clusters as their nasal (of 104 each) | 104, 102 | 104, 103 | no fewer: holds |
| stops and others read exactly (of 312); read as a nasal | 295; 0 | 295; 0 | no fewer; no more: holds |
| vowel-only control read as none (of 832) | 832 | 832 | no fewer: holds |

So `hiHold` stays 6. The rule did no harm anywhere, but g had none of the cells it was written for. Read with the same
diagnostic (`PART=g`), g's E4-quarter misses are two other shapes:

- ***flun***: a clean lip step (upper band -14 to -17 dB, flat), which `lipShut` turns away because its level sits 2-5
  dB *over* the vowel 25-45 ms before it, its ceiling being `hi: 0`. That window again lands in the transition dip. So
  *crun*'s near rule and *flun*'s lip rule fail on the same thing: a reference taken where the vowel is already
  closing. That is the next rule to try: a level reference taken before the transition (`codaPlan`'s TRANSITION, scaled
  as it scales).
- ***sprun*, *strun***: the n is not dark in itself (tilt -18 to -21 dB against `murmurTilt`'s 28) and sits 21-25 dB
  under the vowel. That is the synthesised murmur's beat phase after a cluster onset (`eval/cluster-um-report.md`), not
  a reader fault.

The third column of g's table re-ran f's failed `nearRelease` prediction with `hiHold: 8`: nasal rows together 507 to
508 of 520 and the control 832 of 832, so on g it held. With `hiHold` not adopted, that is noted, not acted on. Reader
only; nothing in the synthesis changed. Not listened to.

#### Held out where the release lands (2026-11-19; both rounds opt-in)

The rounds below left `levelFade` and `longTilt` untested: on part d no vowel-only release reached the end of the
reader's window. This round built a held-out part where it should.

- **Part e, registered on `eval/release-cells-report.md`'s cells** (`eval/coda-check.mjs` header, twenty-ninth round,
  committed as a1fa70e76 before e ran): 84 BPM, the one tempo of that table no other part uses, its twelve cells that
  land 4 or more of 8, 32 syllables sung in no other part. The default read 14 of 384 vowel-only cells as a nasal, so
  the test condition held. Neither rule moved any of them (control 370, 370 and 370 of 384), `longTilt` cost two
  dark-vowel nasals (139 to 137 of 144), and none of the 14 fell on the table's 8-of-8 cells: all were /u/ on E4
  eighths. **Both registrations failed; both rules stay opt-in.**
- **The table measured the wrong rule.** `eval/e4-eighth-diag.mjs` shows the 14 are not the level rule's at all. They
  are the murmur against the vowel just before it (NEAR), firing on a 55 ms run that starts 95 ms after the note has
  ended, where a /u/ fades held-level and dark. Release-cells scores the level rule's band (5-25 dB under), and those
  /u/ releases are already below it.
- **The same fault on the development parts, and where it starts.** `node eval/level-tail-sweep.mjs --rule near`
  (`eval/near-tail-sweep.txt`) lists every near-rule nasal on parts K-c. Of 196 right reads, 195 start 26-175 ms
  *before* the note's end; of 50 wrong ones, 48 (all vowel-only /u/ or /o/) start 19-171 ms *after* it. That fits how
  the choir sings: `sing.mjs` places a coda so it finishes with its note (`codaPlan`), so a murmur that only begins
  after the note is over is the vowel's release, not a nasal.
- **The rule** (`readCoda`'s `nearRelease`, opt-in; `--near-release on` in `eval/coda-check.mjs`, which now passes
  every read the note's end as `noteEnd`): a near-rule run that starts at or after `noteEnd` is thrown out. Read off
  the sweep, not tuned. Without `noteEnd` it does nothing.
- **Development** (A-e): vowel-only controls +70 cells (K 343 to 360 of 360, O 356 to 360, R 238 to 240, S 246 to
  250, W 338 to 346, X 292 to 300, Y 335 to 348, e 370 to 384), others +1 on K, L, O and W. It lost one sung *glum*
  (c) and one *snum* (d). The corpus parts (B, D, E, F, H) are unchanged in every row.
- **Part f, pre-registered** (thirtieth round, committed as 4f7edcc58 before f ran): 86 BPM, all thirteen table
  pitches, quarters and eighths (26 cells), 32 new syllables.

| f | default | `nearRelease` | wanted |
|---|---|---|---|
| vowel-only near-rule nasals (test condition: 3 or more) | 15 | 0 | 80% cleared: holds |
| vowel-only control read as none (of 832) | 806 | 821 | 3 or more better: holds |
| nasal rows together (of 520) | 504 | 502 | at most 1 fewer: **fails** |
| stops and others read exactly (of 312); read as a nasal | 290; 1 | 290; 1 | no fewer; no more: holds |

So `nearRelease` stays opt-in. It did what it was written to do: every vowel-only near-rule nasal on f (all /o/ on
D3 quarters) went. The two it cost are sung *crun* and *frun* on E4 quarters. By default they were read as nasals
from a near run starting 198 ms after the note's end, which is the right answer for the wrong reason: the real
murmur inside the note was not caught. So the next step is in the reader's murmur search on E4 quarters, not this
guard. f's other 11 vowel-only misses, every /u/ on C4 quarters, are the level rule's, and they start outside
`levelFade`'s 6 frames. A further lesson for the next held-out part: pick its cells with a measure of the rule being
tested. `near-release.test.mjs` (2 tests) keeps K's /o/ on A3 quarters (a near-rule nasal by default, none with the
rule, unchanged without `noteEnd`) and K's and X's sung cells unmoved. Reader only; nothing in the synthesis changed.
Not listened to.

#### Cluster onsets before -um: a murmur no reference can find (2026-11-17; opt-in, not registered)

Part c's misses were 21 dark-vowel nasals read as nothing, 18 of them after a two-consonant onset (*brum*, *glum*,
*stum*, *flum*, *prun*, A#3-E4). Read frame by frame (`eval/dark-nasal-diag.mjs c`, and the new
`eval/cluster-um-diag.mjs`, report `eval/cluster-um-report.md`):

- **The reference was one cause, and a fix for it is below.** Five detuned voices beat, so a held /u/'s tilt (above
  1 kHz against under 500 Hz) swings 10-25 dB through the note. On D4 *brum* the reader's 60 ms reference sat on a dark
  stretch, -46 dB, darker than the m itself.
- **But the m is not dark enough against any stretch of its vowel.** Against the median tilt of its own vowel, the
  darkest 40 ms of a sung m or n after a single onset is 26 dB darker (median; 18 at the 90th percentile), and 77 of 84
  pass the level rule's 15 dB. After a cluster onset the read ones are 13 dB darker, and the 21 missed ones 10 dB
  (1 dB at the 90th percentile), at or above their vowel's darkest 40 ms. Only 2 of the 21 pass 15 dB.
- **The cluster isn't the cause; its timing is.** Sung alone with `singNote` on D4, *bum* given *brum*'s 103 ms lead
  gets *brum*'s darkness exactly (15 dB), and *brum* given *bum*'s 70 ms lead gets *bum*'s (4 dB). Sweeping *bum*'s lead
  from 40 to 200 ms in 10 ms steps moves its m between 19 dB darker than the vowel and 2 dB brighter, on A#3, D4 and E4,
  quarters and eighths. The synthesised murmur's darkness depends on where its closure falls in the voices' beating.
  Cluster onsets are longer, so they move the closure. No reader threshold separates a murmur that is not darker than
  its vowel, so the next step is in `sing.mjs`: a murmur dark in every phase of the beating (its low band held up while
  the voices' fundamentals cancel), checked by ear as well as by `eval/coda-check.mjs`.

The reference fix, measured but not registered:

- **The rule** (`readCoda`'s `longTilt`, `LONG_TILT = { span: 0.3, gap: 0.45 }` in `onsets.mjs`, opt-in; `--long-tilt on`
  in `eval/coda-check.mjs`): the plain level rule's darkness test (15 dB darker than the reference) is taken against the
  median tilt of the frames from the reference's start to 0.3 s on (ending at least 0.45 s before the window's end, so
  the coda stays out), not the 60 ms reference's average.
- **Development** (every part, `--long-tilt on` against the default; the default run is byte-identical to the
  committed report): vowel-only controls read as a nasal fall by 47 cells (J 453 to 468 of 468, T 284 to 288, Z 359 to
  372, c 369 to 384, all four parts now clean); K's others read as a nasal 5 to 1; voiced stops +2 on T, +3 on X, +4 on Z.
  It costs dark-vowel nasals: a 116 to 112 of 144, b 133 to 128, d 136 to 134, Z's nasal codas and n-clusters -1 and -2,
  and 6 controls on R and S. c's cluster misses do not move (123 to 123): the early vowel after a cluster is dark too.
- So `longTilt` stays opt-in: it clears the vowel-only fault on cells `levelFade` cannot reach (Z's C#4 eighths and T,
  whose false runs start 14-19 frames from the window's end), at a price in right reads that `levelFade` does not pay.
  Neither is registered on held-out data yet. For that, `eval/release-cells.mjs` (report `eval/release-cells-report.md`)
  scores 234 tempo, pitch and note-length cells by how many vowel-only /u/ and /o/ notes sit at the level rule's depth
  in the window's last 30 ms. It uses frame levels only and never runs `readCoda`, so a held-out part can be built on its
  cells before any reader sees them. Most cells land 4 or 8 of 8 (the vowel decides, not the onset), so landing is
  necessary for a false nasal but not enough: the next registration should take its cells from that table and its
  predictions from both columns. `long-tilt.test.mjs` (2 tests) keeps c's vowel-only /u/ on A#3 (a nasal by default,
  none with the rule) and c's C3 quarters (nasals still read, stops and others unmoved). Reader only; nothing in the
  synthesis changed. Not listened to.

#### One voice at the chorus's level (2026-11-18, latest; opt-in)

The round below left a question: the one-voice murmur gained on the dark-vowel parts but lost the Graduale nasals
at final D3 (held-out D 12 to 8 of 12). `eval/murmur-one-diag.mjs` reads part D's final nasals both ways. All four
losses are 242 ms eighth notes, and on each the one-voice murmur came out 7 to 11 dB louder against its vowel than
the chorus's, too loud for the reader's level rule (a murmur more than 5 dB under the vowel). The cause is the
divisor. `'one'` sets the voice at the chorus's *average* power, but on a short D3 note the five voices (0.6 to 2 Hz
apart at the fundamental) barely drift in phase, so each note's chorus is frozen at one random alignment, its low
band anywhere from near nothing to five times the average. The vowel shares that alignment; the one voice did not.

`murmurSource: 'match'` (`--murmur match`) keeps the single voice but follows the chorus's low-passed power,
averaged over 20 ms, and holds that gain from the moment a coda's murmur starts. Pre-registered before any other
part was run with it ([`eval/murmur-match-check.md`](eval/murmur-match-check.md)), then the full read-back:

- **More nasals read than either.** Summed over every nasal row: 2,220 against the default's 2,141 and `one`'s 2,163.
  Held-out D 12 of 12, E 20 to 22 of 22, F 209 to 213 of 218, the dark-vowel parts a-d 116/133/123/136 to
  134/137/135/141 of 144.
- **No vowel-only control moved** (all 108 control and bare-vowel cells identical).
- **But the registration partly failed.** R's nasal codas 48 to 47 of 48 and Z's 46 to 44 of 48, where it predicted no
  loss, and the tuned set A 179 to 177 of 180 (E2 *am*, *an* read as a voiced labial stop). So it stays opt-in.

Four of the five new misses read as a voiced labial stop: perhaps a held-level murmur fading with the release looks
like a voice bar and a burst. Next: test that on fresh cells. Not listened to: `--murmur match` is the version to
play first. `murmur-match.test.mjs` (2 tests): the level follows the chorus note by note (12 D3 seeds: `one` up to
8 dB off, `match` within 5), and everything before the closure is the same samples.

#### A murmur dark in every phase (2026-11-18; opt-in)

The round above traced the cluster-onset -um misses to the synthesis: the murmur is the five detuned voices
low-passed, the voices beat, and where the closure lands in the beating decides how dark the murmur is.
`murmurSource: 'one'` in `sing.mjs` (`renderMidi`'s `murmurSource`, `--murmur one` in `eval/coda-check.mjs`) takes
the murmur, and a final nasal's hum, from one voice at the chorus's average power. Everything before the closure is
the same samples. Measured in [`eval/murmur-one-check.md`](eval/murmur-one-check.md):

- **The murmur is steady now.** `eval/murmur-phase.mjs` sweeps the onset's lead 40-200 ms on 306 notes (*bum*, *brum*,
  *bun*, A#3-E4). With one voice the murmur's brightest 40 ms is -42 dB at every lead (the chorus: -19 dB at worst),
  and its low band dips 3 dB at most (the chorus: 23 dB, a hum that drops out). That is the audible part of the fault.
- **It is not darker against its /u/.** The darkest 40 ms of the coda is 10 dB under the vowel at the median either
  way. The chorus reached the level rule's 15 dB on 61 of 306 notes by landing in a dark beat; one voice on 4.
- **Read back, it is mixed.** The dark-vowel parts gain (c 123 to 131 of 144, a 116 to 124), as do the cluster
  syllables (P 114 to 119 of 120). The Graduale pieces at final D3 lose (held-out D's nasals 12 to 8 of 12, F 209 to
  200 of 218, Z 46 to 43 of 48). No vowel-only control moved. Nothing was pre-registered, so this is not a held-out
  result, and the option stays opt-in.
- **Louder is worse.** At the level `nasalGain` assumes (the voice not divided), B's nasals fell 37 to 15 of 39: the
  reader needs the murmur well under the vowel.

Why the D3 Graduale nasals lose, and a level that fixes most of it: the round above. `murmur-one.test.mjs` (3 tests).

#### A /u/ release read as a nasal (2026-11-17; registration untested, opt-in)

The round before found a fault in the default reader: on part c's A#3 quarter notes every /u/ syllable sung on vowels
only (*nun*, *brum*, *mut*, *nul* and 11 more) read as a final nasal, by the plain level rule. Read frame by frame
(`eval/dark-nasal-diag.mjs c`):

- **The vowel swells, then fades after the note.** Through the note the /u/ grows 12 dB over the reference the reader
  takes at its start, and darkens (its tilt from -25 to -45 dB). After the note ends it fades 2-3 dB per 5 ms, and in
  the last 40 ms before the reader's window closes it passes the level rule's test: 5-25 dB under the reference and
  15 dB darker above 1 kHz than under 500 Hz.
- **Two guards that did not work.** Asking the run to be darker in itself than the vowel 25-45 ms before it took back
  all 15 cells, and J's 15, but lost 60 or more sung nasals: a dark-vowel m is no darker than its vowel (README "A
  dark-vowel m"). Asking the run's level not to keep falling lost 34 right reads for every 34 wrong ones it fixed: a
  sung m also falls into its murmur.
- **Where it starts is what marks it.** `eval/level-tail-sweep.mjs` lists every level-rule nasal on parts K-c, sung and
  vowel-only, with where its run starts against the window's last frame. Every vowel-only one on c (A#3 quarters) and W
  (E3 eighths) starts 5-6 frames (25-30 ms) from it; of 636 right reads the earliest starts 7 frames out, and nearly
  all 60 or more.

- **The rule** (`readCoda`'s `levelFade`, `LEVEL_FADE = { tail: 6 }` in `onsets.mjs`, opt-in; `--fade on` in
  `eval/coda-check.mjs`): a level-rule run that starts within 6 frames of the window's last frame is the vowel's release,
  not a nasal. A sung coda's murmur starts well before the next sound. Read off that sweep, not tuned.
- **Development** (A-c, `--fade on` against the default): J's vowel-only control 453 to 468 of 468 and its others 332
  to 333; W's control 338 to 352 of 360 and its others 32 to 33; c's control 369 to 384 of 384; L's others 117 to 118.
  Lost: one O *lum* read as none. Every nasal row of every part identical. Z's 13 vowel-only misses (C#4 eighths) and
  T's 4 start 14-19 frames out, and the rule does not touch them.
- **Pre-registered on a new part d** (`eval/coda-check.mjs` header, twenty-sixth round, committed as 41e188357 before d
  ran): the same mix as c, none sung before, at D#3, E3, A3, A#3, B3 and C#4, 92 BPM.

| d | default | `levelFade` | wanted |
|---|---|---|---|
| vowel-only control read as none (of 384) | 384 | 384 | 3 or more better: **untested** |
| nasals after /u/ or /o/ (of 144), after a bright vowel (of 48), n-clusters (of 48) | 136, 48, 47 | 136, 48, 47 | no fewer: holds |
| voiced stops (of 60), voiceless (of 36), others (of 48) | 56, 36, 47 | 56, 36, 47 | no fewer: holds |
| stops, others and vowel-only cells read as a nasal | 1 | 1 | no more: holds |

So `levelFade` stays opt-in and the default reader did not change. The registration said the gain counts only if the
default misses 3 or more of d's vowel-only cells, and it missed none: at 92 BPM on those six pitches no /u/ release
lasted into the window's last 30 ms at the level rule's depth. The rule lost nothing on d either. The fault shows on
some tempo and note-length pairs (c's A#3 quarters at 88 BPM, W's E3 eighths at 122) and not others, and a fair test
needs a held-out part built to land on them: the next registration should pick its cells by where the release ends
against the window, measured on the vowel-only render before any reader runs. `level-fade.test.mjs` (2 tests) keeps
c's vowel-only /u/ on A#3 (a nasal by default, none with the rule), the sung cell unmoved, and b's *run* on D#4 eighths
(a right level-rule read 7 frames from the end) still a nasal. Reader only; nothing in the synthesis changed. Not
listened to.

#### A dark-vowel m that closes slowly (2026-11-17; failed its registration, opt-in)

The round before left part b's dark-vowel nasals read as nothing on 11 cells: *num* 3, *mum*, *bun*, *cun* 2 each, *run*
and *vun*. Read frame by frame (`eval/dark-nasal-diag.mjs b`; part b is now in `eval/vstop-parts.mjs`, which the
diagnostics read):

- **The lips close, but slowly.** On D#4-E4 *num*'s band above 1 kHz falls 15-19 dB into the m, as `lipShut` expects,
  but over four or five 5 ms hops rather than two (E4 quarter: 0, -3, -5, -9, -13, -15 against the vowel).
- **And the level settles late.** The m's level slides 4-8 dB over the next 10-15 ms (-2, -5, -7, -8, -7, -8) and only
  then holds within 1-2 dB, so `lipShut`'s 30 ms hold, measured from the fall, fails by 2 dB.

- **The rule** (`readCoda`'s `lipShut: { span: 4, settle: 2, rise: 4 }`, opt-in; `--shut span=4,settle=2,rise=4` in
  `eval/coda-check.mjs`): the fall counted from any of the four frames before, the hold looked for from the fall or up
  to two frames after it, and a hold that starts late counts only when the band above 1 kHz never climbs back more
  than 4 dB over its lowest point since the fall. Without that last guard the first try read A's vowel-only /u/ on
  C4 (6 cells) and 15 of J's controls as nasals: a fading /u/'s upper band dips 15 dB and its vibrato brings it back
  8. A hold from the fall itself is checked as before. `LIP_SHUT`'s defaults (`span: 2, settle: 0`) are the reader as
  it was, and the report rebuilt with them is byte-identical.
- **Development** (A-b, 16 cells gained, 2 lost): B 159 to 160 of 162 (*tum*), I 140 to 141 (*men*), F's nasals 206
  to 207 (*plum*), L's others +1 (*cum*), N's +1 (*dum*), O's +2 (*lum*), T's nasal codas +1 (*fun*), U's and Y's
  n-clusters +1 each, Z's nasal codas +1 (*dun*), a's n-clusters +1 (*munc*), b's dark-vowel nasals 133 to 137 of 144.
  Lost: one Y *sob* and one a *bu* read as a nasal. Every vowel-only control identical.
- **Pre-registered on a new part c** (`eval/coda-check.mjs` header, twenty-fifth round, committed as a236e0f before c
  ran): 12 nasal codas after /u/ or /o/, most after a nasal, labial or cluster onset, 5 voiced stops, 4 nasals after a
  bright vowel, 4 n-clusters, 3 voiceless stops and 4 others, none sung before, at C3, A#3, C4, D4, D#4 and E4, 88 BPM.

| c | default | slow `lipShut` | wanted |
|---|---|---|---|
| nasals after /u/ or /o/ read exactly (of 144) | 123 | 125 | 3 or more better: **fails** |
| nasals after a bright vowel (of 48), n-clusters as their nasal (of 48) | 48, 44 | 48, 45 | no fewer: holds |
| voiced stops (of 60), voiceless stops (of 36), others (of 48) | 60, 36, 48 | 60, 36, 48 | no fewer: holds |
| stops, others and vowel-only cells read as a nasal | 15 | 15 | at most 1 more: holds |
| vowel-only control (of 384) | 369 | 369 | identical: holds |

So the slow closure stays opt-in and the default reader did not change. The gain was tested (the default missed 21
of c's dark-vowel nasals), but this time the held-out misses were a different shape from the ones the rule was
written on. 18 of the 21 are a two-consonant onset before -um: *brum* 6, *glum* 5, *stum* 4, *flum* 3, on A#3-E4. The
rule takes back two *prun* and one *flum* and none of those. Moving the reference vowel 100 ms later takes back only
2 of the 21 misses on those four and *prun*, so the reference landing in the onset is not the cause. That shape is the next thing to read frame by
frame.

Part c also found a fault in the default reader that no earlier part showed: all 15 of its vowel-only misses are one
cell, A#3 quarter notes, where every /u/ syllable's vowel-only take (*nun*, *brum*, *mut*, *nul* and 11 more) reads as
a nasal by the plain level rule. The bright vowels and /o/ in that cell read as none. `lip-shut-slow.test.mjs`
(2 tests) keeps b's *num* on E4 (nothing by default, a nasal with the slow form, its stops and others unmoved) and A's
vowel-only /u/ on C4 (none with the guard, a nasal without it). Reader only; nothing in the synthesis changed. Not
listened to.

#### A dark-vowel m that holds level (2026-11-17; failed its registration, opt-in)

With `lipShut` as the default, part a's misses were still *bum*, *hum* and *fum* (D4-E4 quarters, C4 and D4 eighths),
*mun*, *gun* and *vum*, all read as nothing. Read frame by frame (`eval/dark-nasal-diag.mjs a`, which now finds part a
in `eval/vstop-parts.mjs`):

- **The lips' blip is there.** The band above 1 kHz rises 3-15 dB over the vowel as the lips meet and falls 11-15 dB
  within two or three 5 ms hops, as on Z's *lum*.
- **But the vowel got there first.** The /u/'s own upper band had already fallen 3-8 dB over the 30 ms before the
  closure, so the m sits no lower in that band than the vowel 25-45 ms before it, and `lipShut`'s darkness test (8 dB
  under) fails. On D4 *hum* the m's upper band is -5 to -19 dB against a vowel at -2 to -8.
- **What it does is hold.** Its level settles 4-11 dB under the vowel and stays within 1-2 dB for 30 ms and more (*hum*
  on D4: -13, -14, -14, -15, -15, -15). A vowel fading at the note's end falls 1-3 dB per 10 ms.

- **The rule** (`readCoda`'s `lipHold`, `LIP_HOLD` in `onsets.mjs`, opt-in; `--hold on` in `eval/coda-check.mjs`): a run
  counts as a nasal when it is entered by a fall of 12 dB or more in the band above 1 kHz from any of the three frames
  before it, every frame sits 3 to 20 dB under the vowel's level 25-45 ms before and is dark in itself (`murmurTilt`),
  its level holds within 2 dB over its first 30 ms, it lasts 45 ms, and the vowel does not come back. Written from a's
  D4 *bum*, *hum* and *fum* cells and its C4 and D4 eighths, then not tuned.
- **Development** (A-a, `--hold on` against the default, `lipShut` on in both): +22 cells, none lost in any part. a's
  nasals after /u/ or /o/ 121 to 128 of 144 and its n-clusters 43 to 44 of 48; H 131 to 132 of 134; I 140 to 141 of
  142; F's nasals 206 to 208 of 215; N's others 231 to 233; O's 227 to 228; P's 233 to 235; V's 59 to 60 of 60; X's
  nasal codas 43 to 45 of 48; Y's 46 to 47 and its n-clusters 42 to 43. Every vowel-only control identical.
- **Pre-registered on a new part b** (`eval/coda-check.mjs` header, twenty-fourth round, committed as 87d1968 before b
  ran): 12 nasal codas after /u/ or /o/, 5 voiced stops after them, 4 nasals after a bright vowel, 4 n-clusters, 3
  voiceless stops and 4 others, none sung before, at C#3, A3, C#4, D4, D#4 and E4, 90 BPM.

| b | default | `lipHold` | wanted |
|---|---|---|---|
| nasals after /u/ or /o/ read exactly (of 144) | 133 | 135 | 3 or more better: **fails** |
| nasals after a bright vowel (of 48), n-clusters as their nasal (of 48) | 48, 47 | 48, 47 | no fewer: holds |
| voiced stops (of 60), voiceless stops (of 36), others (of 48) | 57, 33, 47 | 57, 33, 47 | no fewer: holds |
| stops, others and vowel-only cells read as a nasal | 3 | 3 | no more: holds |
| vowel-only control (of 384) | 384 | 384 | identical: holds |

So `lipHold` stays opt-in and the default reader did not change. The gain was tested (the default missed 11 of b's
dark-vowel nasals) and the rule lost nothing anywhere, but it took back 2 of the 11 (*cun* on one cell, *vun* on one),
one short of the bar. The registration's mistake was the same as the eighteenth round's: a's misses were mostly /u/
before m on D4-E4, and the rate of that shape on a was taken for its rate on b. On b the default already reads the -om
syllables, and what is left is *num* (3 cells), *mum*, *bun* (2 each), *run* and *cun* (1 each): an m or n after /u/
7 of those 9 after a nasal or labial onset (*num*, *mum*, *bun*), which is the next thing to read frame by frame. `lip-hold.test.mjs` (2 tests)
keeps a's *hum* and *bum* on D4 (nothing by default, a nasal by the level-hold rule with it) and checks that the cell's
vowel-only takes still read as none and its stops and others do not move. Reader only; nothing in the synthesis
changed. Not listened to.

#### A dark-vowel m (2026-11-17; registration held, now the default)

The round before left Z's *lum* (4 cells) and *dun* (2) and X's *tum* (6) read as nothing on C#4-E4: a final nasal after
/u/, sung, but missed by every nasal rule. Read frame by frame (`eval/dark-nasal-diag.mjs`, which prints each frame's
level, band under 500 Hz and band above 1 kHz against the vowel, and the frame's own tilt, sung and vowel-only):

- **The m is dark, but not darker.** On D#4 *lum*'s m sits 12-17 dB under the reference with a tilt of -36 to -43 dB,
  dark in itself (`murmurTilt` wants -28), but the /u/ before it already had a tilt of -45. Its band above 1 kHz is
  only 4-6 dB further under the vowel's than its band under 500 Hz, where the level rule wants 15 and the step rule
  7. On D#4 eighths the m is not even quieter than the reference, which falls in the note's attack.
- **The closure marks it.** As the lips meet, the band above 1 kHz blips up to 5-18 dB over the vowel's for 10-15 ms
  and then falls 14-19 dB within two 5 ms hops, and the m holds there, its level within 1 dB for 30 ms and more. In the
  vowel-only takes of the same cells read here, the vibrato moved that band by at most 9 dB over two hops.

- **The rule** (`readCoda`'s `lipShut`, `LIP_SHUT` in `onsets.mjs`, now the default; `lipShut: false` and
  `--shut off` in `eval/coda-check.mjs` are the reader before): a run counts as a nasal when it is entered by a fall
  of 12 dB or more in the band above 1 kHz from either of the two frames before it, every frame sits 8 dB or more under
  that band in the vowel 25-45 ms before and from 0 to 20 dB under that vowel's level, is dark in itself
  (`murmurTilt`), holds its level within 4 dB and its upper band within 6 dB over its first 30 ms, lasts 45 ms, and the
  vowel does not come back after it. The settings were written from Z's *lum* and *dun* cells (4 of their 6 misses
  taken back, no vowel-only cell moved) and not tuned after.
- **Development** (A-Z, `--shut on` against the default): +31 cells, none lost in any part. The corpus parts gained
  most: F's nasals 194 to 206 of 215, D 69 to 70 of 70, H 130 to 131 of 134, I 138 to 140 of 142. Also T's nasal codas
  45 to 47 of 48, U's 46 to 48, X's 42 to 43 and its n-clusters read as their nasal 51 to 54 of 60 (read as a stop 9 to
  6), Y's nasal codas 45 to 46, Z's 42 to 46, and one cell each in K, L, N, O, P and Q. A, B, E, M, R, S, V, W and
  every vowel-only control identical.
- **Pre-registered on a new part a** (`eval/coda-check.mjs` header, twenty-third round, committed as b88e9d9 before a
  ran): 12 nasal codas after /u/ or /o/, 5 voiced stops after them (the risk: a voice bar read through the rule), 4
  nasals after a bright vowel, 4 n-clusters, 3 voiceless stops and 4 others, none sung before, at D3, G#3, C4, D4, D#4
  and E4, 94 BPM.

| a | default | `lipShut` | wanted |
|---|---|---|---|
| nasals after /u/ or /o/ read exactly (of 144) | 116 | 121 | 3 or more better: **holds** |
| nasals after a bright vowel (of 48), n-clusters as their nasal (of 48) | 48, 42 | 48, 43 | no fewer: holds |
| voiced stops (of 60), voiceless stops (of 36), others (of 48) | 54, 36, 44 | 54, 36, 44 | no fewer: holds |
| stops, others and vowel-only cells read as a nasal | 3 | 3 | no more: holds |
| vowel-only control (of 384) | 384 | 384 | identical: holds |

The gain was tested (the default missed 28 of a's dark-vowel nasals) and every prediction held, so `lipShut` is
readCoda's default. `lip-shut.test.mjs` (2 tests) keeps Z's *lum* on D#4 (nothing without the rule, a nasal by the
lip-closure rule with it and by default), and checks that the cell's vowel-only takes still read as none and its voiced
stops and n-clusters do not move. One check moved: `bar-burst.test.mjs` reads U's *bob* on D#4 with the voice-bar rule
off (the reader of two rounds ago), where the new rule now reads the bar's entry as a nasal; with the voice-bar rule on,
as by default, *bob* is still its voiced labial stop (the voice-bar rule's closure takes the run as the stop's lead). The
test now pins that older reader with `lipShut: false` as well. Two margin tests in `sing.test.mjs` moved the same way:
NEAR's (short final *-um*) and PRE's (cluster n) contribution is measured with and without the rule, and `lipShut` now
reads most of those cells either way (*-um* 31 of 32 with or without NEAR, 27 before; clusters 15 of 15). Both now
measure their rule's share with `lipShut: false` in both arms, check that the default reads at least as many, and check
that no vowel-only take or obstruent coda reads as a nasal with it.

The gain is real but partial: a's misses with the rule are still *bum* and *hum* (5 cells each), *fum*, *mun*, *gun*
and *vum* (3 each), all read as nothing. The rule took back the cells where the closure is a clean step; the rest are
the next thing to read frame by frame. What this does not show: a real singer's lips do not close the way this
synthesiser's m does, and the blip-then-fall at the closure is the synthesiser's own transition. Reader only; nothing
in the synthesis changed. Not listened to.

#### A voiced closure that holds to its burst (2026-11-17; registration held, now the default)

The round before ("A g's voice bar read as a nasal") dropped a nasal-rule run that ends at or inside a voiced stop's
closure, but only when the voice-bar rule found that closure. On held-out part Y most of the nasal misses (*sob*, *hog*,
*mog*, *cob*) ended on a closure the ordinary closure rule found, so it took back 1 of 10. Applying it to every
voiced-reading closure lost n-t and n-c clusters (*mant*, *dant*, *hanc*): an n's murmur runs into the t's silent
closure and its tail makes the closure's later half read voiced.

- **The rule** (readCoda's `voicedLead: { hold: true }`, now the default; `voicedLead: false` is the reader before,
  `true` the bar form): a closure the closure rule found counts too when it passes the voice-bar rule's own release test
  (`barRel`): a burst that does not run into frication, and the 20 ms just before it still voiced, above -40 dB and
  within 6 dB of the run's median. An n-t closure is silent at its end and an n-s runs into its s; a voiced stop's bar
  runs on up to its burst. The run it drops must also start at most 20 frames (100 ms) before the closure.
- **Why the span**: a first form (the hold measured on any burst, no span) lost K's *om* and *on*, V's *gum* and Y's
  *son* (a final nasal read as a voiced labial stop) and N's *fans*, *rens* and O's *pens* (the n-s's frication taken
  for a burst). Listing every run the rule drops on parts K, N, T, U, V, W, X and Y: a voiced stop's lead started 1 to
  14 frames (5-70 ms) before its closure, while the final nasals it wrongly dropped started 37 to 55 frames (185-275 ms)
  before a release blip the closure rule took for a burst. No case sat between 15 and 36.
- **Development** (A-Y, `--vlead hold2` against the default then): no nasal coda, n-cluster, voiceless stop, other
  syllable or vowel-only cell lost in any part; the corpus parts B, D, E, H, I and F identical. Gains: A's E2 29 to 30
  of 30; K's others 206 to 208 of 220; N's 227 to 230 of 240 (voiced stops read as a nasal 6 to 3); R's third column
  112 to 117 of 120 (as a nasal 6 to 1); T's columns 131-133 to 133-136 of 144; V's velars 182 to 186 of 192, labials
  101 to 103 of 108; W's voiced stops 76 to 78 of 84; X's 130 to 134 of 144; Y's 173 to 176 of 192 (as a nasal 10 to
  4), and one cell each in M and Q (O's deep-murmur column gained one too, before the exemption below). Some voiced velars that read as a nasal now read as a voiced labial (V's velars
  read as a labial 4 to 5): a place miss, still counted as a miss.
- **Pre-registered on a new part Z** (`eval/coda-check.mjs` header, twenty-second round, committed as d66844f before Z
  ran): 16 voiced stop codas, most after /o/ or /u/, 4 nasal codas, 6 n-clusters, 3 voiceless stops and 2 others, none
  sung before, at A2, F#3, B3, C#4, D#4 and E4, 98 BPM.

| Z | default (before) | bar form | hold form | wanted (hold against default) |
|---|---|---|---|---|
| voiced stop codas read exactly (of 192) | 171 | 172 | 177 | 2 or more better: **holds** |
| voiced stops read as a nasal | 9 | 8 | 2 | 2 or more fewer: **holds** |
| nasal codas (of 48), n-clusters as their nasal (of 72), either read as a stop | 42, 68, 3 | 42, 68, 3 | 42, 68, 3 | no fewer, no more: holds |
| voiceless stops (of 36), others (of 24), vowel-only control (of 372) | 36, 24, 359 | 36, 24, 359 | 36, 24, 359 | identical: holds |

The gain was tested (the default read 9 of Z's voiced stops as a nasal), every prediction held, and the report
rebuilt on the shipped code (`eval/coda-check-report.md`) matches the development figures above, so the hold form is
readCoda's default. One change after the result: with the opt-in `deepMurmur` rule on, the hold form dropped its
runs on J's E4 eighths (*sunt*, *nunc* read as their nasal 4 to 2, `sing.test.mjs`). That rule fires only on a murmur
running into frication or a silent closure, never a voiced lead, so its runs are exempt; the default reader, which
has it off, is unchanged. `voiced-lead.test.mjs` (4 tests) keeps Y's *sob* on C4 (a nasal without the rule and with the bar
form, a voiced labial stop with the hold form) and K's *om* on F3 (a nasal with the 100 ms span, a stop without it).

What is left on Z: *lum* read as nothing on 4 cells and *dun* on 2 (the dark-vowel nasal X's *tum* showed: an m only
4-6 dB darker than an /u/ with almost nothing above 1 kHz), *dunt* and *hunt* read on their t, and place misses
(*neb*, *mob*, *hub*, *bub*, *rab* as velars; *pog*, *gog*, *cug*, *log*, *heg* as labials). Reader only; nothing in the
synthesis changed. Not listened to.

#### A g's voice bar read as a nasal (2026-11-17; failed its registration, opt-in)

The round before left X's *cog* read as a nasal on 5 of its 12 cells, all on C#4-E4 or a G3 eighth. Read with
`eval/burst-diag.mjs` (which now also prints the nasal rule that won and where its run starts), each of those cells
had its closure and burst found, by the voice-bar rule (`barBurst`) or the closure rule. What beat it was a level- or
step-rule "murmur" starting 7-8 frames earlier and running up to the closure or into it: /o/ darkening as the tongue
rises for the g (F1 falling), then the voice bar's first frames. readCoda takes whichever candidate starts first, so
the nasal won. No Latin coda puts a nasal before a voiced stop: the clusters are -nt, -nc, -ns and -nx, and their
stops are voiceless.

- **The rule** (`readCoda`'s `voicedLead`, opt-in; `--vlead bar2` in `eval/coda-check.mjs`): a nasal-rule run that
  starts before the closure readCoda chose and ends at most 2 frames before it, or inside it, is that stop's lead
  when the closure is one the voice-bar rule found and reads voiced (bar above -40 dB, as the stop's own voicing test).
- **A first form, dropped**: on any closure that reads voiced (`--vlead 2`) it gained more (X 130 to 134 of 144,
  V's velars 182 to 186) but lost 9 n-t and n-c clusters, among them the corpus's *mant*, *dant*, *hanc* and *BANT*
  and N's *rens* and *fans*. An n's murmur runs into the t's silent closure and its tail makes the closure's later
  half read voiced. Closures found by the voice-bar rule have its cluster guards (no closure with its own burst
  within 8 frames after the run, no burst running into frication), so the rule kept only those.
- **Development** (A-X, `--vlead bar2` against the default): K's others 206 to 207 of 220, N's 227 to 229 of 240
  (voiced stops read as a nasal 6 to 4), R's third column 112 to 113, T's first and third columns 131 to 132 and 132
  to 133, V's velars 182 to 183 and alveolars 58 to 59, X's voiced stops 130 to 133 of 144 (*cog* read as a nasal 5
  to 3). Nothing was lost in any part. The corpus parts B, D, E, H, I and F and every vowel-only control were
  identical.
- **Pre-registered on a new part Y** (`eval/coda-check.mjs` header, twenty-first round, committed as 40910f4 before Y
  ran): 16 voiced stop codas, most after /o/ or /u/, 4 nasal codas, 4 n-clusters, 3 voiceless stops and 2 others,
  none sung before, at G#2, A3, C4, C#4, D4 and E4, 102 BPM.

| Y | default | `voicedLead` | wanted |
|---|---|---|---|
| voiced stop codas read exactly (of 192) | 173 | 174 | 2 or more better: **fails** |
| voiced stops read as a nasal | 10 | 9 | 2 or more fewer: **fails** |
| nasal codas (of 48), n-clusters as their nasal (of 48), either read as a voiced stop | 45, 42, 0 | 45, 42, 0 | no fewer, no more: holds |
| voiceless stops (of 36), others (of 24), vowel-only control (of 348) | 36, 23, 335 | 36, 23, 335 | identical: holds |

The gain was tested, since the default read 10 of Y's voiced stops as a nasal. But the rule took back only 1 of them,
so `voicedLead` stays opt-in and the default reader is unchanged. `voiced-lead.test.mjs` (2 tests) keeps X's *cog*
on C#4: a nasal by default, a voiced velar stop with the rule. It also checks that the cell's nasals and n-clusters
read the same either way.

Why Y gave so little, read after the result (`node eval/burst-diag.mjs Y sob,hog,cob,mog 60,61,62`): most of Y's
nasal misses (*hog* and *mog* on C#4, *cob*, *fog* and *hog* on D4 eighths) end on a closure the ordinary closure rule
found, not the voice-bar rule, with the murmur ending 1-2 frames before it or overlapping it. That is exactly the case
the dropped first form caught and the shipped form skips. On development the voice-bar rule's closures were most of
the cases. On Y they were the minority. The next step is a cluster-safe test that a closure belongs to a voiced
stop and not to an n-t: for instance, voicing held through the closure's last 20 ms up to the burst, as `barRel`
already asks, applied to closure-rule closures as well.

X's *tum* read as nothing (6 cells) is a different fault. Diffed against the vowel-only render, the sung m on D4 and
E4 is there: about 7 dB under the /u/, a step held within 1 dB for 60 ms. But it is only 4-6 dB darker than an /u/
that already has almost nothing above 1 kHz. The step rule asks for 7 dB darker, and the level rule asks for 15.
Reader only; nothing in the synthesis changed. Not listened to.

#### No burst on C#4-E4 (2026-11-17; registration held, now the default)

The rounds before left voiced stop codas on C#4-E4 read as a nasal or as nothing (*bob*, *lag*, *pob*, *hag*), with
no burst found at all. Read closure by closure (`eval/burst-diag.mjs`, which prints every closure readCoda finds, its
burst search's window, baseline and each candidate it tried; readCoda's new `trace` option feeds it), two faults:

- **The closure rule never saw the voice bar.** On C#4-E4 the bar sits 19-23 dB under the vowel in all, but only 4-7
  dB under it below 500 Hz: there both the bar and the vowel are little more than the fundamental. The closure rule
  wants 12 dB under 500 Hz, so it passed the bar by, and the nasal rule, which wants -5 to -25 dB and dark, read it.
  The one "closure" the reader did find on *bob* and *lag* on C#4/D#4 was the silence after the release.
- **b's burst sits under the bar's harmonics.** `sing.mjs` sings b's burst in a band at 500 Hz. Above 600 Hz, where
  the burst search listens, a C#4-E4 voice bar's second and third harmonics stand within 2-9 dB of it, and the bar
  fades 5-9 dB through the closure, so a search measured against the closure's first 2 ms (*bob* on D#4) found no
  rise of 12 dB. Above 2 kHz the same burst stands 30 dB over the bar.

- **The rule** (`readCoda`'s `barBurst`, `BAR_BURST` in `onsets.mjs`, now the default; `barBurst: false` and
  `--barburst off` in `eval/coda-check.mjs` are the reader before): when the 600 Hz search finds no burst, search
  again above 2 kHz, rising against the bar in the 10 ms before; and a voiced, dark run (10 dB or more under the
  vowel, above -40 dB, 30 dB under it above 1 kHz) is a voiced closure when a burst ends it with the bar still at
  its own level in the 20 ms before the release. A murmur the nasal rules read that starts at most 4 frames before
  such a closure is its voice bar.
- **The cluster guards**, added after a first form lost 9 cluster cells on J, K, N, O and P (*int*, *tent*, *hinc*,
  *mens* read as a voiced stop): no burst running into frication (a cluster's s), and no closure with a burst of its
  own starting within 8 frames of the run's end (an n hands over to its stop's silent closure with one frame that
  brightens above 2 kHz, which the retry took for a burst).
- **Development** (A-W): Q's voiced stops 106 to 112 of 120, R's 103 to 114, S's 108 to 114, T's 122 to 131 of 144,
  U's 127 to 136, V's velars 175 to 182 of 192 and labials 98 to 101 of 108, W's voiced stops 71 to 76 of 84; other
  syllables J +8, K +2, L +2, N +6, O +4, P +17 (P's voiced stops read as a nasal 7 to 0). Lost: one corpus cell in
  H (3438's *ab*, a b read as a g), one of F's 215 nasals, and V's velars read as a labial rose from 1 to 4 (inside
  the +7). Every cluster nasal and every vowel-only control identical.
- **Pre-registered on a new part X** (`eval/coda-check.mjs` header, twentieth round, committed before X ran): 12
  voiced stop codas, 4 nasal codas and 5 n-clusters (the risk), 2 voiceless stops and 2 others, none sung before, at
  A#2, G3, C#4, D4, D#4 and E4, 106 BPM.

| X | before | `barBurst` | wanted |
|---|---|---|---|
| voiced stop codas read exactly (of 144) | 102 | 130 | 4 or more better: holds |
| voiced stops on C#4-E4 read as a nasal or nothing | 30 | 6 | 4 or more fewer: holds |
| nasal codas (of 48), n-clusters as their nasal (of 60), n-clusters as a stop | 42, 51, 9 | 42, 51, 9 | no fewer, at most 1 fewer, at most 1 more: holds |
| voiceless stops (of 24), others (of 24), vowel-only control (of 300) | 23, 23, 292 | 23, 23, 292 | at most 1 fewer, identical control: holds |

The registration also asked that the default read at least 4 of X's C#4-E4 voiced stops as a nasal or nothing, so
the gain was tested at all; it read 30. So `barBurst` is readCoda's default. `bar-burst.test.mjs` (3 tests) keeps U's
*lag* and *bob* on D#4, read as a nasal and as nothing without the rule and as their stops with it, checks that the
cell's nasals and n-clusters do not move, and that a `trace` changes nothing. Left on X: *cog* read as a nasal (5
cells), *tum* read as nothing (6), the cluster stops (*sunc*, *gonc*, *fant* read on their stop, unchanged). What
this does not show: a real singer's voice bar is not this synthesiser's, and in a room the 2 kHz band holds noise a
synthetic closure does not. Reader only; nothing in the synthesis changed. Not listened to.

#### A p's burst read as a k (2026-11-16; registration held, now the default)

The round before left 14 of part V's 108 labial codas read as a velar stop, 12 of them voiceless p on A3 and B3,
whose bursts held 54-66% of their energy above 1 kHz although `sing.mjs` sings p's burst in a band at 500 Hz. Read
burst by burst (`eval/place-sweep.mjs`, every stop coda of K, N, T, U and V with its burst's features, 964 read as a
stop), that energy is the burst's own, not the search's timing or the vowel's release:

- **One 8 ms noise draw is not a spectrum.** p's burst is white noise through a fourth-order band at 500 Hz, 1500 Hz
  wide. Synthesised alone 200 times and read through the reader's 10 ms window, it puts 22-65% of its energy above
  1 kHz (10th to 90th percentile), over half on 31% of draws. In the choir the voiceless labial bursts read 0.11-0.79
  above 1 kHz (median 0.39), with no trend by pitch: A3 and B3 are not special.
- **The draw belongs to the cell, not the syllable.** `render.mjs` seeds a note's noise from its pitch and length,
  so every syllable sung on B3 for four pulses gets nearly the same burst: 97% of the variance among the 136 p codas
  lies between the 58 pitch-and-length cells. V's 12 misses were three draws. Earlier registrations counted cells of
  syllables as if each were a separate trial, which is part of why two of them overrated how often a fault occurs.
- **Nothing else sounds low there.** After a silent closure, every voiceless velar burst held 0.99-1.00 of its energy
  above 1 kHz and every alveolar 1.00. The 0.5 test ("most of it under 1 kHz") was set for voiced stops, where the
  voice bar runs on under the burst (README "A g's burst read as a b").

- **The rule** (`readCoda`'s `voicelessLow`, `VOICELESS_LOW` = 0.9, now the default; `voicelessLow: false` and
  `--vlow off` in `eval/coda-check.mjs` are the reader before): after a closure read as voiceless, a burst with 0.9
  or less of its energy above 1 kHz is labial, midway between 0.79 and 0.99, not tuned further. A voiced stop keeps
  the 0.5 test.
- **Development** (A-V): +31 cells, none lost. A 177 to 178 of 180 (*ap* on C4), J's others 321 to 323, K's 193 to
  204, N's 220 to 221, P's 214 to 215, Q's 75 to 76, U's 93 to 95, V's labial codas 86 to 98 of 108 (read as a velar
  14 to 2; the two left are voiced b). The corpus parts B, D, E, H, I and F, and every vowel-only control, identical.
- **Pre-registered on a new part W** (`eval/coda-check.mjs` header, nineteenth round, committed before W ran): 10
  voiceless labial codas, 8 voiceless velar (the rule's risk), 7 voiced stops, 2 alveolar and 3 others, none sung
  before, at A2, E3, G#3, A#3, B3 and C#4, 122 BPM.

| W | before | `voicelessLow` | wanted |
|---|---|---|---|
| voiceless labials read as a velar stop | 18 | 0 | at most 1: holds |
| voiceless labial codas read exactly (of 120) | 100 | 118 | 117 or more: holds |
| voiceless velars read as a labial stop | 0 | 0 | at most 1 more: holds |
| voiceless velar codas read exactly (of 96) | 95 | 95 | at most 1 fewer: holds |
| voiced stops (of 84), alveolar (of 24), others (of 36), vowel-only control (of 360) | 71, 23, 32, 338 | 71, 23, 32, 338 | identical: holds |

The registration also asked that the default read at least one of W's p codas as a k, so that the gain was
tested at all (with the sweep's rate, W's 12 cells were expected to hold about two such cells, and none about one time
in nine). It read 18, in two of the 12 cells (all 10 p codas on A2 for four pulses, 8 of 10 on B3 for two): the
expected two. So `voicelessLow` is readCoda's default. `voiceless-low.test.mjs` (2 tests) keeps V's
*rup* on B3, read as a k without the rule and as a p with it, and checks that no other coda in that cell moves. What
this does not show: real singers' bursts are not one seeded draw per note, and on a real recording a room's noise
floor would put energy under 1 kHz in a k's burst too. The threshold is a reading of this synthesiser, not of
speech. Reader only; nothing in the synthesis changed. Not listened to.

#### The wall in codas only (2026-11-16; failed its registration, both stay opt-in)

The round before left one unregistered figure: with `closeAnchor` and the voice-bar wall together, R's voiced stops
read 107 of 120 against the default's 103. The wall had been turned down because it moved the openings, so this round
gave it a coda-only form, `voiceBarWall: 'coda'` (`sing.mjs`; `--wall coda` in `eval/coda-check.mjs` and
`eval/consonant-check.mjs`): a closing b, d or g is low-passed through the walls of the shut tract, an opening one is
sung as before (`sing.test.mjs` checks both). The candidate, `closeAnchor` read on the choir with the coda wall, was
measured on every development part (A to S) and then pre-registered against a new part T, committed before T ran
(`eval/coda-check.mjs` header, sixteenth round). T has 12 voiced-stop codas, 4 nasal codas and 8 others, none sung in
any other part, at B2, F#3, B3, D4, D#4 and E4, 118 BPM.

| T, read exactly | default (`localRef`) | `closeAnchor` | coda wall | `closeAnchor` + coda wall |
|---|---|---|---|---|
| voiced-stop codas (of 144) | **122** | 124 | 120 | 121 |
| voiced stops read as nothing | 8 | 7 | 9 | 6 |
| voiced stops read as a nasal | 11 | 9 | 13 | 14 |
| nasal codas (of 48) | 45 | 45 | 45 | 45 |
| others (of 96) | 93 | 93 | 93 | 93 |
| vowel-only control read as none (of 288) | 284 | 284 | 284 | 284 |

The registration wanted 4 or more of 144 better; the candidate read one worse, so it failed. Openings were to stay
byte-identical; one cell of the held-out corpus set moved (consonant-check G 2055 to 2054 of 2349, a d opening in
3417 after a walled coda), so that failed too. Nothing else moved past its allowance. On the development parts the
candidate had looked good (R 103 to 107, S 108 to 113, N's others 220 to 226) but it also read P's voiced stops as a
nasal 7 to 11 times, and on T that is where it lost: it hears fewer stops as nothing and more as a nasal. R's 107 was
a development figure, and T shows what that was worth. Across the three held-out sets for this question, `closeAnchor`
alone reads 332 of 384 voiced stops against `localRef`'s 333: on these sets the two cannot be told apart. Both stay
opt-in; the default reader and the default choir did not change.

What T's misses say (default): half are a voiced stop read as a nasal (*tag*, *pob*, *hag*, *vob*, 11 of 22), the
rest read as nothing. The voice bar under a closure that the reader takes for a murmur is the next fault to read frame
by frame, on T's cells, before any rule is written. Reader and synthesis defaults unchanged; not listened to.

#### Two anchors for one closure (2026-11-16, head to head, the default stays)

Two scheduled sessions took the same item (K's *eb*/*ib*, N's *nab*/*gab*) within the hour. Both found the same
fault on D4. The five detuned voices beat slowly (over one held /e/ on D4 the band under 500 Hz swung 7 to 40 dB),
so the 60 ms reference falls on a random point of the swing, while a voice bar beats in step with the vowel just
before it. Each session wrote its own rule and pre-registered it on its own new held-out set. One merged first:
`localRef`, the section below. The other rule is kept as an opt-in, `closeAnchor`
(`onsets.mjs` `ANCHOR`). It reads a closure against the loudest of the last 10 vowel-like frames (within 12 dB of
that level), the total and the band under 500 Hz each against its own anchor, with no cap. Its diagnostic is
`eval/voice-bar-diag.mjs`.

Neither rule had been run on the other's held-out set. The decision rule was committed before that cross run
(`eval/coda-check.mjs` header, fifteenth round): `localRef` stays the default unless `closeAnchor` reads R's and S's
voiced stops together 3 or more better and loses nothing anywhere else. Part S is the second session's set: 12
voiced stops and 13 others at G#2, A#2, E3, C4 and F4, 112 BPM.

| voiced stops read exactly | reference only | `localRef` (default) | `closeAnchor` |
|---|---|---|---|
| R (held out for `localRef`) | 99 of 120 | 103 | 100 |
| S (held out for `closeAnchor`) | 101 of 120 | 108 | 108 |
| together | 200 of 240 | **211** | 208 |

`localRef` stays the default. Its gain on S, +7 on a set written without sight of it, is the strongest evidence
for it so far. `closeAnchor` generalised less well to R (+1). Elsewhere, against the default, `closeAnchor` read
K's others 193 to 195, N's 220 to 222 (voiced stops read as a nasal 6 to 4), O's 222 to 223, P's 214 to 216 (its
clusters 114 to 115, voiced stops read as a nasal 7 to 8), Q's voiced stops 106 to 105 and others 75 to 76, and S's
others 127 to 128. A, B, D, E, H, I, F, J, L and M were byte-identical, and every vowel-only control was identical.

One observation not in the registration, so not acted on: with `closeAnchor`, the opt-in voice-bar wall
(`voiceBarWall`) read R's voiced stops 107 of 120 (read as nothing 3, as a nasal 9). With `localRef` it read 103.
The wall's burst fix and an anchor that holds its band under 500 Hz apart may need each other. That is a
candidate for its own round with a new held-out set.

#### A closure against the vowel before it (2026-11-16; shipped, pre-registration held)

The round before left K's *ib*/*eb* and N's *nab*/*gab* reading as nothing or as a nasal. Read frame by frame
(`eval/vstop-diag.mjs`), nearly all of those misses sat on D4-E4, for two reasons. (a) On D4 the five detuned voices
swing the vowel's level by 15-20 dB through the note, and the reader's 60 ms reference fell in a trough. The *ib*
voice bar sat 25 dB under the vowel just before it but only 13 dB under the reference, so the closure rule (22 dB
under) did not see it. (b) On D#4 and E4 the per-note gain lifts the bar's harmonics above 600 Hz, and the release
burst stood only 9 dB over the bar there, short of the 12 dB the burst search wants.

- **The change** (`onsets.mjs` `LOCAL_REF`, readCoda's `localRef`): a frame counts as closed when it sits 22 dB under
  the louder of the reference and the vowel before it. "The vowel before it" is the loudest five-frame median 30-120
  ms back, capped at 20 dB over the reference. The nasal rule keeps the reference. Read against the vowel before, a
  vowel-only release fading through -5 to -25 dB of it read as a murmur, and the vowel-only controls of J, K, L, M and
  N lost 33 cells. A closure also needs a burst, which a fade never has. `localRef: false` (`--local off` in
  `eval/coda-check.mjs`) is the reader before. The synthesis did not change.
- **Tried for (b), not shipped:** the voice bar low-passed through the walls of the shut tract (`voiceBarWall: true`
  in `sing.mjs`, `--wall on`). A closed mouth radiates voicing through the cheeks and throat, which pass little above
  a few hundred hertz. On the development parts it read 7 more of N's syllables but cost A 2 and P's voiced stops
  (7 to 12 read as a nasal), and the openings dropped (`eval/consonant-check.mjs` A 195 to 192, B 812 to 808). So it is
  off by default.
- **Pre-registered on a new part R** (in `eval/coda-check.mjs`'s header, committed before R ran). R has 10 voiced-stop
  codas, 4 nasal codas and 6 other syllables, none sung in any other part, at A#2, G3, C#4, D4, E4 and F4, 112 BPM.

| prediction (against `localRef: false`) | before | the reader | |
|---|---|---|---|
| (1) R's voiced stops read exactly, 4 or more of 120 better | 99 | 103 | holds, exactly at the bar |
| (2) R's nasal codas no fewer | 48 of 48 | 48 | holds |
| (3) R's others within 2 | 72 of 72 | 72 | holds |
| (4) R's vowel-only control identical | 238 of 240 | 238 | holds |
| (5) the development parts as registered | | | holds (one figure was misquoted in the registration: Q's others are 75 of 80 both ways, not 75 to 73) |
| (6) openings (`eval/consonant-check.mjs`) cannot move | | | holds: the report is byte-identical |
| (7) the wall: R's voiced stops read as nothing fewer, control identical | 8 (wall off) | 3 (wall on) | holds, but it gains no voiced stop (103 either way: 5 more read as a nasal), so it stays off |

On the development parts, against `--local off`: J's others 318 to 321 of 336, K's 191 to 193 of 220, M 107 to 109 and
108 to 109, N's others 212 to 220 of 240, O 217 to 222, P 209 to 214 (its clusters 116 to 114, one D4 and one F4
pulse-2 cell), Q's voiced stops 102 to 106 of 120, H's voiced alveolar stops 1 to 2 of 2, L +1. A, B, D, E, F, I and every
vowel-only control were identical. Shipped on. The gain is small on held-out data (+4 of 120, at the bar) and larger on
the parts whose misses had been read. R's misses now: *nob*, *rog*, *hob* read as a nasal (7) and *dib*, *sib* read as
nothing (8). Not yet read frame by frame; (b), which this round did not fix, is the likely cause. Reader only; not listened to.

#### A voice bar at one level (2026-11-16; shipped, two predictions failed)

Part L left *sub* read as nothing on 3 of its 10 cells. Read frame by frame (`eval/sub-cum-diag.mjs`), the b was
there: a closure, a voice bar, a burst. But on the missed cells (G#3 half notes, G2 and C3 quarters) the voice bar
sat 17-20 dB under the /u/. The closure rule wants a closure 22 dB or more under the vowel. On the cells it read, the
bar sat 23-38 dB under. The bar was a fixed gain (`VOICE_BAR` 0.08) through a 180 Hz first resonance, so its level
swung with how close a harmonic fell to 180 Hz. Worked out in steady state over five vowels from E2 to E4, it sat
19.7 to 42.3 dB under the vowel, median 27. This was the same fault the nasal murmur and the final /l/ had before
their gains were set per note.

- **The change** (`sing.mjs` `voiceBarGain`, `VOICE_BAR_DB`): a voiced closure's bar is set per note to sit 28 dB
  under the vowel beside it, in codas and in openings, the same way `nasalGain` and `lateralGain` set theirs. The
  28 dB is the median above, rounded. It is an assumption, not fitted to recordings or to any part. With one voice
  and no vibrato the bar now sits 27.8-28.6 dB under its vowel at E2-E4 after any vowel, where the fixed gain gave
  21.0-42.1 (`sing.test.mjs`). `voiceBarLevel: false` (a singNote option; `renderMidi(..., { voiceBar: false })`,
  `node eval/coda-check.mjs --voice-bar off`) keeps the fixed gain. The reader did not change.
- **Pre-registered on a new part Q** (in `eval/coda-check.mjs`'s header, committed before Q or any other part ran
  with the change). Q has 12 voiced-stop codas, 10 of them sung in no other part, and 8 other syllables, at A2, F3,
  A#3, C4 and D#4, 100 BPM.

| prediction (against `--voice-bar off`) | fixed gain | per note |
|---|---|---|
| (1) Q's voiced stops read exactly, 4 or more of 120 better | 95 | 102: holds |
| (2) Q's voiced stops read as nothing, fewer | 10 | 8: holds |
| (3) Q's other syllables within 2 | 75 of 80 | 75: holds |
| (4) Q's vowel-only control identical | 200 of 200 | 200: holds |
| (5) every other coda part within 3, voiced stops no worse, controls identical | | fails on K's others (198 to 191 of 220: *ib*, *eb* read as nothing, *ob* as a nasal) and N's voiced stops read as a nasal (1 to 5: *nab*, *gab*) |
| (6) openings (`eval/consonant-check.mjs`) A and B within 3 | A 195 of 210, B 780 of 934 | A 195; B 812: fails upward |

Everywhere else the coda parts rose: A 173 to 177 of 180, B 129 to 130, J's others 306 to 318, L's /i/ syllables
153 to 157, M 105 to 108, O 210 to 217, P 202 to 209. Every vowel-only control was identical. L's *sub* went from 3
misses to 2 (one read as nothing, one as velar). The openings gained most, which no prediction foresaw. The held-out
Graduale part G went from 1959 to 2055 of 2349 (83.4% to 87.5%), with voiced alveolar openings 116 to 172 of 227
and labial 65 to 98 of 115. Before, a d or b opening's bar was often loud enough to be read as no closure at all.

Shipped on. The net gain is large and mostly on held-out data (G, Q). The losses are named: K's *ib*/*eb* and N's
*nab*/*gab*, where a quieter bar after /i/, /e/ and /a/ now reads as nothing or as a murmur. Those are the next
items. L's *cum* (2 misses) is untouched: it is a nasal and this round changed only voiced closures. Not listened
to. Whether a voice bar 28 dB down sounds like a b is a listening-test question.

#### A murmur louder than the dip before it (2026-11-16; shipped, one prediction failed)

O's five misses on its D4-E4 pulse-2 notes, read frame by frame (5 ms hops, levels against the reference vowel):
*punc* and *tunt* on D#4 and *sons* on D4 and D#4 each hold an n about 50 ms long, a median 37-48 dB dark in itself
and 20 dB or more darker than the vowel just before. They were not too quiet, as the DEEP round assumed for J; they
were too loud. As the vowel darkens into the n its level dips 7-16 dB, and the murmur then swells back to -8 to +4 dB
of the reference (on these notes the nasal resonance sits near the fundamental). Every nasal rule caps the level:
`nasal` at -5 dB of the reference, NEAR at 0 and the cluster rule PRE at +4 dB over the vowel 25-45 ms before it,
which here is the dip. The murmur sat 5-12 dB over it, and the t, k or s after it was read.

- **The change:** `PRE.hi` 4 to 12 in `onsets.mjs`, nothing else. PRE still needs the run entered by an 8 dB step
  into darkness, 40 ms long, dark in itself and ending within 5 frames of a closure or a fricative, so it cannot fire
  on the vowel-only choir or a final -m.
- **Set on J, N and O only** (hi 4, 8, 12, 16): J 128 of 132 clusters, 306 others, 453 control every time; N
  clusters 114, 116, 116, 116; O's D4-E4 pulse-2 clusters 25, 27, 28, 28 of 30; other syllables, voiced stops read
  as a nasal, and controls unchanged in both. Two misses are left and are different faults: *sons* on D4 (its step
  into the murmur is 7.9 dB of the 8 PRE wants; not moved to rescue one syllable) and *rint* on D4 (a quiet
  -24 to -30 dB murmur that the closure rule takes as part of the closure).
- **Pre-registered on a new part P**, committed before it ran: 10 cluster syllables and 20 others sung in no other
  part, at G2, D3, G#3, C#4, D4 and F4 (F4 new), 116 BPM.

| prediction (against `preOpts: { hi: 4 }`) | before | after |
|---|---|---|
| (1) P's cluster nasals no fewer, 2 more on its C#4-F4 pulse-2 notes | 115 of 120; 29 of 30 | 116; 29 of 30: fails |
| (2) P's others within 1, voiced stops read as a nasal no more | 202 of 240; 7 | 202; 7: holds |
| (3) P's vowel-only control identical | 360 of 360 | 360: holds |
| (4) A, B, D, E, H, I, F, K, L, M totals no lower, nasals no fewer, controls identical | | every part byte-identical but K, whose clusters gain one (*hinc* on D4, 125 to 126 of 140 with AGAIN, 131 to 132 without): holds |
| (5) vowel and consonant checks cannot move | | readOnset and the synthesis untouched: holds |

Prediction (1) failed on a ceiling: P's high pulse-2 clusters already read 29 of 30 before the change, so there
was no room for the 2 it promised. P's syllables at 116 BPM did not dip the way O's did at 126. Unlike DEEP, the
change costs nothing anywhere it was measured: no syllable on any part reads worse, and it gains O's three, N's two
and one on P. So it ships on, with its target gain resting on development parts (N, O) and one held-out syllable;
that is a choice against the DEEP round's precedent of keeping a failed registration off, made because DEEP also
lost a syllable and this does not. `--pre hi=4` runs every part with the old ceiling. `sing.test.mjs` holds it:
*punc*, *tunt* and *sons* on D#4 pulse-2 notes at 126 BPM all read on their n (at least 2 more than with hi 4), and
*mad*, *bod*, *nod*, *reg* read as a nasal only where hi 4 did too.

A naming slip found on the way: parts J to O call their pulse-2 notes eighth notes, but `eventsToMidi` puts two
pulses in a beat, so a pulse-2 note is a quarter (0.48 s at 126 BPM, not 0.24 s) and a pulse-4 note a half. The
measurements stand; only the names are wrong. Part P's report says pulses. Reader only; nothing in the synthesis
changed. Not listened to.

#### Formant tuning on high notes (2026-11-15)

The vowels were fixed at Peterson and Barney's spoken values at every pitch. That is fine for basses, but
a tenor's G4 is 392 Hz and A4 440 Hz, above the first formant of /i/ (270 Hz) and /u/ (300 Hz): every
harmonic then sits on the falling side of the first resonance and the vowel loses most of its strength.
Trained singers avoid this by opening the jaw on high notes so F1 rises with the pitch, the "formant
tuning" Sundberg describes (*The Science of the Singing Voice*, 1987), at the price of /i/ drifting
toward /e/. `sing.mjs` now does the same: `tuneF1` raises a vowel's F1 (for a diphthong, both ends;
the consonants' transitions follow the tuned vowel) to at least 1.1 x f0, and leaves F2, F3 and every
vowel whose F1 is already higher alone (`SING_DEFAULTS.f1Tune`, 0 turns it off). The ratio 1.1 is an
assumption (F1 just above the first harmonic), not fitted to singers.

Pre-registered in the header of `eval/f1-tune-check.mjs` before its first run, with the ratio fixed:
(1) at G4 and A4, /i/ and /u/ gain 2 dB or more against /a/ at the same pitch; (2) the vowel reader gets
no fewer of the held notes right from E2 to A4; (3) the corpus vowels, openings and codas at final D3
stay within 0.5 points. Results (held 2 s notes, five seeds each, `eval/f1-tune-check-report.md`):

| | off | on |
|---|---|---|
| /i/ against /a/, E4 / G4 / A4 (dB) | -9.1 / -16.5 / -14.8 | -2.5 / -3.7 / +0.9 |
| /u/ against /a/, E4 / G4 / A4 (dB) | -3.6 / -11.6 / -9.8 | -1.5 / -1.9 / +3.5 |
| line 1: mean gain, /i/ /u/ at G4 A4 | | 12.9 dB (holds) |
| line 2: held vowels read right, E2-A4 | 179 of 200 | 180 of 200 (holds) |
| line 3: corpus vowels (`vowel-check`, C) | 1,497 of 1,571 | identical |
| line 3: corpus openings (`consonant-check`) | 742 of 934 | 743 of 934 |
| line 3: closings (`coda-check`, A, B, D, E) | | identical |

Nothing moves below B3: 1.1 x f0 first passes /i/'s 270 Hz at 245 Hz and /u/'s 300 Hz at 273 Hz, and
never reaches /e/, /o/ or /a/ under A4. So basses sound as before, the top of the default E2-E4 unison
range changes a little (E4 /i/ -9.1 to -2.5 dB), and the main gain is for tenors in `--split-voices`,
`--second-tenors` and `--choir` arrangements. The tuning set of the consonant check loses one (E4 *bi*'s b read voiceless).
What the reader cannot say: at G4 and A4 the LPC reader finds F1 at about f0 whether or not the filter
was tuned (only 1 of 5 /i/ at G4 and none at A4 read as /i/ either way), so line 2 shows the change does
no harm to what it can measure, not that the tuned /i/ sounds like /i/. That, and whether 1.1 is the right
ratio, is a question for a listener.

### A score for the choir: `--musicxml` (2026-11-14)

The MIDI file is for a DAW; a choir director prints parts. `--musicxml FILE` writes the same
line as a MusicXML 4.0 score that MuseScore (free), Dorico, Sibelius and Finale open, and the
studio page has the same file as "Download the score (MusicXML)":

```sh
node ventures/chant-forge/cli.mjs corpus/dies-irae.gabc --split-voices --baritones --second-tenors --musicxml dies-irae.musicxml
```

- **One part per section**, the same split as the MIDI tracks: Choir in unison, or Tenors (First and
  Second tenors with `--second-tenors`), Baritones and Basses. A note the full choir sings is in
  every part, so each part is complete on its own; elsewhere a part rests. Tenors read the
  treble clef an octave down, baritones and basses the bass clef.
- **Words under the notes**: each syllable a lyric with its syllabic (begin, middle, end,
  single) from the GABC word starts, and an extender under a melisma.
- **Timing as the track has it**: 4/4 at the backing's bar, one chant note an eighth, a note
  across a barline tied, rests for `--fit` padding and the `--intro`/`--outro` bars, a breath
  mark at each GABC bar, the tempo, and with `--sections` the section names (Verse, Drop,
  Breakdown) as rehearsal marks.
- **Spelling**: the key signature (6 flats to 6 sharps) whose scale holds the most of the
  line's notes, so a chant moved to any final reads without accidentals but its own B flats;
  `--key-lift` gets its own key from the bar of the first lifted note. Accidentals hold for
  their bar and octave, with a courtesy accidental the bar after a change.

Checked (`eval/musicxml-check-report.md`): all 68 corpus files under five option sets
(unison, stretched, half time, TTBB with overlaps and word handoffs, a full song with
sections, key lift, intro and outro), 304 scores in all, are valid against the MusicXML 4.0 XSD, and
music21, an independent parser, reads back every one of their 97,705 part-notes at the
pitch, onset, length and syllable the MIDI has. The accidentals printed match music21's
own rule on 97,923 of 97,929 printed notes (a tied note counts once per piece). The other six are a cross-octave style choice. Planted
wrong pitches, syllables and ties fail the check. Not done: no notation program has opened a
file here, and no choir has sung from one.

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
both 4x meters under-read and ours is the closer). Checked 2026-11-14 against
EBU Tech 3341's test signals built from its text (below), not yet the EBU's own
files or a real mix; the true-peak filter is a windowed sinc, compared with the
Annex 2 coefficients below. Distributor targets change: read
theirs before release.

`master-cli.mjs` also prints the gain each service's loudness normalisation would apply
(`platformPlayback` in `master.mjs`). Read on the services' own pages on 2026-11-14
(eval/ebu-tech3341-2026-11-14.md): only Spotify publishes a level. It plays at
-14 LUFS, lifts quiet tracks only while 1 dB of true-peak headroom remains (its
example: -20 LUFS peaking at -5 dBTP is lifted to -16, not -14), and asks masters
louder than -14 LUFS to keep the true peak under -2 dBTP; the CLI now applies all
three. Apple Music (-16), YouTube (-14), Amazon Music (-14), Tidal (-14) and
Deezer (-15) are commonly reported figures with no level on the service's own
help page (Apple, YouTube, Deezer read; Amazon and Tidal answered 403), and the
CLI marks them with `*`.

### Checked against EBU Tech 3341 (2026-11-14)

```sh
node ventures/chant-forge/eval/ebu-tech3341.mjs   # exit 0 when every case passes
```

The minimum-requirements signals of EBU Tech 3341 (2023) Table 1, synthesised from
the table's text at 48 kHz (the EBU's own WAV set answered 403): cases 1-5
(integrated, both gates), 9 and 12 (short-term and momentary constant), 10 and 13
(short-term and momentary max, 20 files each at shifted offsets) and 15-23 (true
peak). 69 of 69 readings inside tolerance; the plain sample peak fails 7 of the 9
true-peak cases, so they do test the oversampling. The CLI now prints the loudest
momentary (400 ms) and short-term (3 s) window, found over every sample offset
(a 100 ms grid misses case 13 by up to 0.58 dB). The BS.1770-5 Annex 2 FIR is in
`master.mjs` too (`truePeakAnnex2`): inside tolerance, but 0.2-0.3 dB under on
cases 15 and 17, so the windowed sinc stays the true peak. Cases 20-23 depend on
an anti-aliasing filter the table does not give (here a 20 kHz cut, which itself
leaves the peak at -0.24 dBTP); not run: 5.0 channels and the authentic programme
files.

### Loudness range, EBU Tech 3342 (2026-11-14)

```sh
node ventures/chant-forge/eval/ebu-tech3342.mjs      # Table 1 cases 1-4, exit 0 when all pass
node ventures/chant-forge/eval/ffmpeg-lra-check.mjs  # against ffmpeg's ebur128 (needs ffmpeg)
```

`master-cli.mjs` now prints the loudness range (LRA): how far the 3 s loudness moves,
95th minus 10th percentile, after a -70 LUFS and a -20 LU gate, as Tech 3342 (2023)
defines it, with its MATLAB listing's percentile ranks. Cases 1-4 of its Table 1,
built from the text, read 10.000, 5.000, 20.000 and 15.000 LU (wanted +/-1), the same
when repeated two and three times and with 1.5 s of trailing silence; with
BS.1770's -10 LU gate instead, case 3 reads 1.33, so the cases test the gate. Against
ffmpeg, 11 of 12 signals (tones, pink noise with steps, a fade and a quiet bed, and
four of this tool's own preview renders) agree within 0.2 LU; the 12th is 0.45 apart
because the two meters pick a different rank among 100 widely spaced windows
(eval/ebu-tech3342-2026-11-14.md). The renders read 0.8 LU (metal, steady) to 5.0 LU
(EDM with `--sections`). No service sets an LRA limit, so it is reported, not checked.
Open: the EBU's own WAVs (cases 5 and 6, programme material) and a real mix.

## Real Gregorio files (2026-11-03)

Fixed after reading the format, tested on made-up strings shaped like real files
(`real-files.test.mjs`, 6 tests), not yet run on a batch of GregoBase files (on 2026-11-03; since run on 139, see "Not checked yet"):
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

### Quilisma version 3 (2026-11-14)

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
2,641 squares called rhombi, more than before (looked at: next section).

### Tilted pages straightened (2026-11-14, latest)

```sh
node ventures/chant-forge/eval/deskew-synthetic.mjs   # drawn pages, no network
node ventures/chant-forge/eval/deskew-check.mjs       # every page scanned so far; needs archive.org
```

A page scanned a little turned prints its staff lines at a slope, and a line that drifts more
than its own thickness across the staff stops being one band of rows: leaf 424 of the 1908
Graduale shows 2 of its 9 staves. `readPage` now finds the slope (`estimateSkew`: shear the ink by
trial slopes within 3 degrees, keep the sharpest row profile) and moves each column up or down a
whole number of pixels (`shearColumns`, no resampling) before it looks for staves. Note `y` is
given back on the page as scanned, each staff carries its `skew`, and `{ deskew: false }` reads
square. A page is straightened only if the slope moves a line 10 px or more across it
(`DESKEW_MIN_DRIFT`, 0.29 degrees at 2000 px), so pages that read square are read as before.

On drawn pages (nine staves, 99 heads) the square reader holds to 0.3 to 0.4 degrees, reads 1
or 36 heads at 0.5 and 4 at most from 0.8; straightened, all 99 from 0.3 to 2.5 degrees, the slope
found to 0.01 degrees. **On the real pages** (all 185 scanned so far, `eval/deskew-report.md`),
two are tilted enough to straighten. Leaf 424 (-0.94 degrees) goes from 2 of its 9 staves to 9 and
from 15 notes to 345. Leaf 585 reads the same either way, and no page loses anything. The staves
gained end the gradual *Qui timetis* (GregoBase 3670, now in the corpus and in `scan-pages.json`).
Straightened, 290 of its 299 notes agree with the book and none differs. Square, the alignment
reached only note 180. `eval/scan-check.mjs --no-deskew` reruns the square reading. Details, the
threshold and the one cost found (specks touching a line once the mask is tight again):
`eval/deskew-check.md`.

### Bivirga and tristropha sung as printed (2026-11-14)

GABC writes a doubled or tripled virga or stropha on one letter: `gvv` (bivirga), `gvvv`, `gss`
(distropha), `gsss` (tristropha). The book prints, and a choir sings, one head per shape letter.
The converter played each as a single note, so the corpus's 26 bivirgas (15 of 68 files) came out
one note short. Now each further `v` or `s` is a note on the same pitch, with no syllable of its
own (a mora after it lengthens the last head). The scan check's `gabcSteps` counts them the same way.
That clears two disagreements and three "scan only" marks in `eval/scan-check-report.md`, where
the reader had read both printed heads (`eval/deskew-check.md`, "Bivirga").

### Staff lines at their own thickness (2026-11-14)

```sh
node ventures/chant-forge/eval/thick-line-check.mjs   # same scans and cache as scan-check
```

A staff line is a run of rows whose ink covers a fifth of the page. On a line crowded with heads
(a recitation on one pitch) the heads alone do that in the rows beside it, so a 6 px line came
out 19 px thick, and the reader, which drops a line's rows unless ink crosses them, erased the
heads on it. The line's centre moved too, and the staff's even-spacing test then missed whole
staves: 23 on 22 of the 185 pages scanned so far, plus two staves matched a line too low. Now
each line is trimmed to the rows with long horizontal runs of ink (`trimLine` in `scan.mjs`),
a staff's spacing is also taken from its outer two lines, and a "staff" far tighter than the
page's own is dropped.

| on the 185 pages | before | after |
|---|---|---|
| staves found | 1,361 | 1,384 |
| lines half a staff space or more thick | 38 | 3 |
| notes read | 46,079 | 47,864 |

No piece agrees with its GABC on fewer notes; GregoBase 3407 goes from 207 to 216 of 219 and
3429 from 208 of 210 to 286 of 287 (its missing staff found). Rhombi, quilismas and liquescents
are read more often in every set, and squares called rhombi fall from 6 to 3 of the pieces the
height floor was chosen on: several of the "worn squares" below were squares on an oversized
line mask. Not held out (two thresholds were set on these pages). Tilted pages are next: leaf
424 shows 2 of its 9 staves. Details: `eval/thick-line-check.md`.

### Rhombus height floor (2026-11-14)

```sh
node ventures/chant-forge/eval/rhombus-check.mjs --held-out --sweep   # same cache as scan-check
```

Ten of those fourteen false rhombi were on two staves, and the crops show ordinary squares in
worn type: white flecks inside the head cut its edge columns, so it measures narrow (0.35 to
0.40 spaces) and tapered, just like a rhombus. It is not taller, though. A rhombus is a square on
its corner and stands 0.63 spaces or more; the worn squares stand 0.56 to 0.61. So a head is now
a rhombus only if it is also at least 0.62 spaces tall (`RHOMBUS_MIN_H` in `scan.mjs`).

| set | rhombi read | squares called rhombi |
|---|---|---|
| 50 pieces it was chosen on, before | 1,026 of 1,033 | 18 of 7,501 |
| the same, after | 1,024 of 1,033 | 6 of 7,501 |
| 6 held-out pieces (listed before download), before | 103 of 103 | 1 of 596 |
| the same, after | 103 of 103 | 1 of 596 |

On the eighteen pieces that raised it, squares called rhombi went from 14 to 4 of 2,641
(`eval/shape-check-report.md`). The held-out pieces show the floor loses no rhombus but had too
few worn squares to show the gain; their one false call is the same fault at 0.62, on the floor.
A ceiling for merged stacks was tried and dropped (real rhombi touching a neighbour read up to
1.09). Crops, measurements and what is left: `eval/rhombus-height-check.md`.

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
by direction, and `<` and `>` are not.

### Liquescents that end a porrectus

These were listed as "not looked for", on the guess that the 1908 type hangs the small note off a
porrectus stroke. It does not: a porrectus liquescent (`hfg~`, `dcd~`) is printed as two separate
heads, the second carrying the same short rising tail as an epiphonus, so `liquescentTail` already
covers it. Measured on twelve more GregoBase 1908 pieces (every piece with one among ids 3461-3999,
split into a tuning half and a held-out half, both lists committed before any page was read) plus the
three such notes in pieces scanned earlier:

| set | porrectus liquescents | read as liquescent at their pitch | other heads called liquescent |
|---|---|---|---|
| tuning (6 new pieces) and earlier pieces | 9 | 8 | 0 of 939 (new pieces) |
| held out (6 pieces) | 10 | 8 | 1 of 1,060 |

A looser end-width cap gained no liquescent on the 50 earlier pieces and added false calls, so the
rule is unchanged. Two of the three misses are a one-step hook whose small note sits on a staff line;
the third is a print fleck. The scan note check on the twelve new pieces: 2,030 notes agree with the
book, 5 differ (looked at below). Details: `eval/porrectus-liquescent-check.md`; run
`node eval/porrectus-liquescent-check.mjs`.

### Porrectus tops, and one more transcription slip (2026-11-14, latest)

The five differences above were each looked at on the scan. One is a slip in GregoBase 3912
(*Hic est qui venit*, p. 472, staff 4): on "et hi tres" the book's second clivis falls a third, e to
c, the cadence the respond sings on "aqua"; the file had e to d. It is corrected, with a
`correction:` header pointing at the page. The other four were the reader, all one fault: the 1908
porrectus stroke thins as it falls, its thin end drops under the head-height floor, and the 0.9-space
piece left was read as a head at its mean height, a step below the stroke's first note. Now a head
whose centre falls 0.4 staff spaces or more across it (`STROKE_TOP_FALL` in `scan.mjs`), with nothing
touching it on the left, is read at its left end. If no foot follows it, its right end is read as the
stroke's second note too. The 0.4 was picked from an unlabelled histogram of 56,646 heads on 212 pages,
where falls between 0.35 and 0.45 are rare.

Across the 74 piece checks in the eight scan lists, differences fell from 88 to 73 and agreements rose
from 13,917 to 13,932. All fifteen were porrectus first notes, fourteen distinct places. No piece gained a
difference, and no note was lost or added. The "nothing touching on the left" condition was added
after the first full run showed two broken-up strokes given an extra note, so this is not a held-out
figure. `node eval/scan-check.mjs --no-stroke-top` reads as before. Details:
`eval/porrectus-top-check.md`.

### A clef printed inside a staff, and a slip in GregoBase 3775 (2026-11-14, latest)

GregoBase 3437 (*Adhaesi*) had 16 of the 73 differences left. They were one reader fault: the verse
starts mid-staff after a double bar with a new C clef (`(z0::c3)`), and the reader only looked for a
clef at a staff's start, so it read the clef as a podatus and the rest of the staff two steps low. The
MIDI was never wrong (`parseGabc` follows the change); the check was. `findClefChanges` in `scan.mjs`
now finds a C clef inside a staff: two blocks a third apart either side of a line, joined on their left
(a podatus is joined on its right). Notes after it are read against it.

On the 74 earlier piece checks, differences fell from 73 to 57 and no piece got worse; all 11 clefs the
reader found on those 212 pages were looked at and are real. On fourteen pieces with a clef change,
listed and committed before their pages were read (`eval/clef-change-fresh-pages.json`), differences
fell from 129 to 13 and marks the GABC lacks from 46 to 10; all 12 clefs found there are real and read on
the right line, including two changes back from c3 to c4. Four of the 13 were a slip in GregoBase 3775
(*Domine spes mea*, p. 458): *et confirmásti* is printed h h h h, the file had f f f f. Corrected, with
a `correction:` header. `node eval/scan-check.mjs --no-clef-change` reads as before. Details:
`eval/clef-change-check.md`.

### A staff that curls on a flat page

The nine differences left on that fresh list were each cropped from the scan and looked at
(`eval/staff-curl-check.md`). Three were one-step slips in the GregoBase files, now corrected with a
`correction:` header (3461 *aquárum:* prints j, 3500 *mihi* prints the porrectus j i k, 3706 *meos*
prints the clivis g e); a second human reader is wanted. Two are reader faults seen once (a cephalicus
with its stem on the left, a porrectus top read a step low). The other four were a page that curls at
its head: on leaf 764 the top three staves slope 9-11 px across while the rest lie flat, so the
whole-page straightening does not fire, the tilted lines are measured 11-16 px thick, and the heads on
them are erased (staff 1: 18 of 38 notes read).

`staffSkew` in `scan.mjs` now measures each staff's own slope the same way and, when it moves a line
10 px or more, reads that staff from the page sheared by it. Level staves read exactly as before.
On the 88 earlier piece checks, notes agreeing went from 17,205 to 17,272, differences 66 to 63 and
notes not read 495 to 457. Held out, ten fresh pieces chosen only because a staff on their page slopes
(7 of 173 leaves surveyed), listed before reading (`eval/staff-curl-fresh-pages.json`): agreeing 1,611
to 1,688, differences 28 to 21, notes not read 78 to 41, no piece worse. `--no-staff-deskew` reads as
before.

### The last two reader faults on that list (2026-11-15)

The two differences left (`eval/broken-stroke-check.md`) are fixed. GregoBase 3506's cephalicus was not
a left-stem problem: the reader found the small note at the right height, but it was named against the
staff's first clef rather than the C clef printed earlier on that staff, because the small note carried
no left edge for the clef lookup. 3679's porrectus top was a stroke the reader broke in two near its
top; the short top piece fell too little on its own to be read at its left end. A head whose right
edge runs into a wide falling piece at its own height is now read as that stroke's top
(`BROKEN_STROKE` in `scan.mjs`, `--no-broken-stroke` reads as before). On the 98 earlier piece checks,
differences 81 to 78 (3506, 3679 and 3403, one each), none worse. Held out, fifteen pieces with a
porrectus listed before their pages were read (`eval/broken-stroke-fresh-pages.json`): identical both
ways, 2,869 agreeing and 2 differing. The rule fires on 43 of 303 leaves; 12 crops looked at are all
real stroke tops.

### A liquescent whose small note sits on a staff line (2026-11-16)

GregoBase 3464's *sanc-* `fd~` was read e for d: a cephalicus whose hook straddles a line that, crowded
with heads, was measured 8 px thick where its ink is 3 px. The reader counts a line's rows as ink only
where ink runs out past them, so the hook was traced only to the line's near edge and its small note
read a step too close to the head. Now an accepted tail whose end stops at a line's near edge is moved
to the line's far edge when the small note straddles the line (its ink crosses at least 0.08 spaces
further than the line's own ink beside it; `LIQ.onLine`, `LIQ.straddle` in `scan.mjs`,
`readPage(img, { hookOnLine: false })` reads as before). Set on the 113 pieces of the eleven earlier
lists in four tries (the first three broke up to 8 small notes printed in the space beside a line);
frozen, it moves two notes, both wrong to right, and nothing else. Held out, fifteen pieces with 25
liquescents whose small note is on a line, listed and committed before their pages were read
(`eval/hook-fresh-pages.json`): the registered gain **failed**, since the rule moved nothing, and
nothing got worse. Main already reads 22 of the 25. Two of the three misses are a different shape, a
one-step cephalicus whose head and small note the reader takes for one head at the small note's pitch:
next. Details: `eval/hook-on-line-check.md`; run `node eval/hook-on-line-check.mjs <lists>`.

### A one-step cephalicus read as one head (2026-11-16, later)

Those two misses (GregoBase 3490 *con-* and 3508 *et*, both `gf~`) are a one-step cephalicus: the head
in a space, a hairline stem down its left side, the small note on the line just below, joined under the
head's right half. Head and small note together are about a space tall, so the reader either lost the
small note (its run too short to be a head where it stands alone, split off too narrow where it touches)
or split the block into two plain heads and read them bottom-up, f then g, as it reads a podatus. Now a
head with no tail is checked for one (`oneStepCephalicus`, `ONE_STEP` in `scan.mjs`;
`readPage(img, { oneStep: false })` reads as before): ink under the head's right half 0.55-0.85 spaces
below its centre, wider than a stem and ending by 0.95 spaces, none under its left half, a level head,
and a hairline stem down its left side. The small note is read one step under the head, after it.
Set on the 128 pieces of the twelve earlier lists in three tries; the second looked clean in the counts
but its changes, looked at, included the upper heads of quilisma podatus and a porrectus top, which the
hairline-stem and level-head tests removed. Frozen: one-step cephalici 69 to 74 of 84, notes agreeing
+5, differing and false liquescents unchanged, all 14 places it changes looked at and true. Held out,
twelve pieces on leaves no earlier list reads, listed and committed before their pages were downloaded
(`eval/one-step-fresh-pages.json`): 16 to 17 of 17, agreeing +1, nothing worse; one of four predictions
failed as worded (an overlapping column). The fault is rare: main already read most of them. Details:
`eval/one-step-cephalicus-check.md`; run `node eval/one-step-check.mjs <lists>`.

### A one-step cephalicus with a hollow small note (2026-11-18)

The ten one-step cephalici still missed on the tuning lists were each looked at (crops at 4x, the rule's
window ink row by row; `node eval/one-step-check.mjs` now lists every miss with its page, staff and x).
Four had the same cause in the print: this Graduale draws many small notes with a white counter, so in
the rule's window their upper rows are two bars either side of a 2-3 px gap and only their last 3-5
rows are solid, too few to count. The run-width test now bridges a gap up to 0.1 spaces
(`ONE_STEP.gap`; `readPage(img, { oneStepGap: false })` reads without it). Tuning lists: 74 to 77 of
84, agreeing +3, differing and false liquescents unchanged, all four places changed looked at and true.
The 1908 Graduale on GregoBase is used up (one unread piece left), so the held-out check, committed
before its pages were downloaded, was that piece (no change) plus 31 Graduale leaves no list reads,
read both ways: two places changed, both one-step cephalici with a hollow small note, nothing moved or
removed. Four predictions, four held. Seven misses are left, two of them `liquescentTail` claiming the
cephalicus first. Details: `eval/one-step-hollow-check.md`.

### A head split by a white fleck (2026-11-18, later)

Two misses were put down to `liquescentTail` claiming a one-step cephalicus first. Looked at pair by
pair, neither was: on 3439 the cephalicus is read right and the square after it was lost, and 3357's
page prints `hg~` where GregoBase has `gf~`. The square on 3439 has a white fleck three columns wide
under the line; every run in those columns is under the head-height cut and the halves either side
are each under the width cut, so both were dropped. Two such pieces, close (0.12 spaces), level, a
head's width together, inked across the gap and on or near the staff, are now joined (`FLECK` in
`scan.mjs`; `readPage(img, { fleck: false })` reads without it). The same cut was dropping far more
than flecked squares: the upper head of a podatus (its concave underside leaves its middle columns
short), quilismas and porrectus end heads. Tuning lists: agreeing 24,367 to 24,397, GABC only 603 to
572, differing +1, scan only +1, one-step cephalici 77 to 78 of 84, false liquescents 13 to 12; 20 of
20 sampled additions outside the aligned pieces were real heads, and the four liquescents it turned
into plain heads were podatus read as epiphonus. A first version also joined two letters of a bold
lyric; the staff-reach test removed that. Held out, 29 Graduale leaves no list reads, committed before
they were downloaded: 13 notes added on 236 staves, 13 of 13 real heads; two false liquescents (quilisma
podatus) became plain heads; nothing moved or removed. Three predictions, three held. Details:
`eval/fleck-check.md`.

### Staff lines broken by a short white gap (2026-11-18, later)

Of the three one-step cephalici listed as "small note read as a rhombus", two were not cephalicus
faults: the place named was a climacus the alignment paired with them. 3421 *non* was never read,
because leaf 434's staff 3 has a white break 5 px wide in every line after *re-*, and the reader kept
only the longest unbroken stretch of a staff (gaps of 4 px allowed), dropping *gum, et non con-*.
On the 323 tuning pages 21 staves had such a break of 0.4 spaces or less; the side lost held up to
1,158 px of staff, and on some staves the clef (leaf 489 staff 2). Two stretches over 3 spaces long
are now one staff across a gap of up to 0.5 spaces, unless one is a decorated initial's box (over
35% inked between the lines; `STAFF_JOIN` in `scan.mjs`; `readPage(img, { staffJoin: false })`
reads as before). It changes 17 of 2,411 staves, every one a real break looked at as a crop, and no
initial. Tuning lists: notes agreeing 24,397 to 24,479, GABC only 572 to 569; differing +6, all on
434 staff 3, whose F clef is read two steps low with or without the join (next). Held out, 72
Graduale leaves no list reads, committed before they were downloaded: the join changed none of their
530 staves, so the registered "2 to 20 staves" failed; nothing got worse. The breaks cluster in parts
of the book the held-out pick barely sampled. Details: `eval/staff-gap-check.md`; look at a place
with `node eval/one-step-rhombus-diag.mjs ITEM:LEAF:STAFF:X`.

### An F clef whose stem stands apart from its blocks (2026-11-19)

Leaf 434 staff 3 (3421 *Narraverunt*) was read two steps high from end to end. The 1908 F clef is a
square with a stem down its right side, then the C clef's two blocks. `findClef` takes the first
columns whose ink runs 0.9 spaces or more and spreads over the tall columns next to them; there a
white gap two pixels wide parts the stem from the blocks' curve, so the stem alone was the clef and
its middle rounded a line low. The run now crosses a gap of up to 0.15 spaces to more tall columns,
unless their ink reaches the edge of the search window, as a page border's does (`CLEF_BRIDGE` in
`scan.mjs`; `readPage(img, { clefBridge: false })` reads as before). Tuning lists: notes agreeing
24,479 to 24,538, differing 89 to 73, GABC only 569 to 564, scan only 91 to 86, one-step cephalici 78
to 80 of 85 (3421 *non*'s included). All 240 moved notes are on six staves, each an F clef with a
parted stem, looked at as a crop. Held out, 60 Graduale leaves no list reads, committed before they
were downloaded: no clef changed on their 473 staves; three predictions held, but there was nothing
there to fix. Details: `eval/clef-bridge-check.md`; look at a staff's start with
`node eval/clef-diag.mjs ITEM:LEAF:STAFF`.

## Not checked yet

- `examples/dies-irae-incipit.gabc` is the widely quoted opening motif
  (F E F D E C D D), typed from memory. It has not been transcribed from a scan.
  It is a demo input, not a corpus entry.
- The converter has run on 64 real GregoBase files (the five corpus pieces and
  `corpus/gregobase-1908/`, 59 Vatican Graduale 1908 pieces, 2026-11-03;
  `node eval/batch-check.mjs`, `batch.test.mjs`). Checked: no crash, no warning,
  pitches 36-84, no markup left in lyrics, valid MIDI, communions, tracts, hymns
  and sequences end on their mode final. Not checked: the notes against the page
  scans (except the ones below), or by ear. 10 of the 60 now in that folder end off the mode final (introits, graduals,
  alleluias and offertories finish on a psalm-tone differentia or a verse). `node eval/offfinal-report.mjs` lists them with last notes and syllables
  (`eval/offfinal-report.md`); 5 are introits ending on "euouae". Seven of the
  11 were read against the 1908 scan on 2026-11-13 (next section): their
  endings are the book's. The other four cite the supplement's bracketed pages, which
  the same scan does carry (leaf = page + 585); read on 2026-11-14
  (`eval/offfinal-supplement-report.md`), three end as printed (3419's page prints only its
  changed middle and sends the singer to *Gaudeamus*, p. 486, where its ending is) and one,
  3427, was a transcription slip: its last three notes were a step low, now corrected, and it
  ends on its mode final. So 10 files end off the final because the book does.
- GregoBase 3357 (*Ecce oculi*, in `corpus/gregobase-1908-onestep/`, unmodified) has *e-* `gf~`
  where leaf 455, staff 2 prints the cephalicus a step higher, on the line of the clivis after it
  (`hg~`; eval/fleck-check.md). Left as downloaded until a second copy of the page is read.
- `fuzz.test.mjs` throws 2000 random made-up GABC strings at the reader and
  MIDI writer (no crash, pitches in range); it says nothing about real files.
- Nothing has been arranged, sung, mixed or published.
- **Open from the 2026-11-19 quality audit** ([`portfolio/quality/audits/2026-11-19-chant-forge.json`](../../portfolio/quality/audits/2026-11-19-chant-forge.json)):
  introit files sing their psalm-tone cue literally. A bare "Gloria Patri" and the vowel placeholder
  "E u o u a e" (for *saeculorum. Amen*) become sung notes in the MIDI, cue sheet and `--sing` preview,
  and the track ends on the differentia instead of the antiphon repeat (32 corpus files). The scan
  reader also fills vertical white gaps of a fixed 3 px whatever the staff spacing, so a head that
  clears a staff line by 1 to 3 px can be read as two notes (`scan.mjs:74`). The mode-2 pieces
  ending on A (3426, 3429, 3434, 3451) are the transposed second mode ending on its affinal, not
  differentiae; the mode check should accept them.

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
