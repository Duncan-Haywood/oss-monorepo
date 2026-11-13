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
  and the off-final pieces ran afterwards with nothing changed. 8 tests on drawn pages
  (`scan.test.mjs`). Only Vatican-edition printing has been tried.
- **Read by eye as well:** a separate reading by eye covered every note of the five pieces,
  including the ones the reader cannot see, and found no differences in 1,492 notes
  (`eval/scan-read-by-eye/README.md`, `scan-read-by-eye.test.mjs`). The earlier
  Solesmes 1974 Te Deum is kept as `corpus/te-deum-simple.gabc`. It is the 1913 Liber
  Usualis *tonus simplex*, note for note.
- **Full hymns:** `corpus/pange-lingua-full.gabc` (6 verses, 85.6 s at 124 BPM) and
  `corpus/veni-creator-full.gabc` (7 verses, 83.0 s) set every verse printed in the 1908
  Graduale to the checked first verse (`eval/scan-read-by-eye/build-hymns.mjs`).

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
