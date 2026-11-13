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
38 checks, no page error. It cannot hear anything: a person still has to listen.

## Not checked yet

- `examples/dies-irae-incipit.gabc` is the widely quoted opening motif
  (F E F D E C D D), typed from memory. It has not been transcribed from a scan.
  It is a demo input, not a corpus entry.
- The converter has run on 64 real GregoBase files (the five corpus pieces and
  `corpus/gregobase-1908/`, 59 Vatican Graduale 1908 pieces, 2026-11-03;
  `node eval/batch-check.mjs`, `batch.test.mjs`). Checked: no crash, no warning,
  pitches 36-84, no markup left in lyrics, valid MIDI, communions, tracts, hymns
  and sequences end on their mode final. The five corpus pieces were read note by
  note against pre-1929 page scans on 2026-11-13 and match exactly
  (`eval/scan-check/README.md`); the 59 batch files have not been, and nothing has
  been checked by ear. 11 of the 59 end off the mode final (introits, graduals,
  alleluias and offertories finish on a psalm-tone differentia or a verse); that
  is read from the files; only 3407's ending has been confirmed against the book. `node eval/offfinal-report.mjs` lists them with last notes and syllables
  (`eval/offfinal-report.md`); 5 are introits ending on "euouae".
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

Browser studio page (ventures/chant-forge/index.html: GABC in, preview and MIDI/WAV out, client-side; browser-safe.test.mjs) landed 2026-11-03; driven end to end in headless Chromium 2026-11-03 (eval/browser-e2e.mjs, 38 checks: every sample x backing, downloads, Play/Stop, 375 px); listen to it by ear and put it in front of users. History is in the README and git. Mix/master check (master-cli.mjs: LUFS, true peak, mono, clipping, 6 tests) landed 2026-11-03; checked against ffmpeg ebur128 2026-11-03 (eval/ffmpeg-check.mjs: 0.05 LU, 0.33 dB on synthetic signals); EBU test files and a real mix remain. Release kit (release.mjs: ISRC/UPC, cover, WAV, rights, AI disclosure, 7 tests) landed 2026-11-03; check it against a distributor's real upload form. GABC reader fixes for CRLF, <sp>/<v>/<alt> and in-group clefs landed 2026-11-03 (made-up strings); NABC and split-neume pitch test (nabc.test.mjs) landed 2026-11-03. `--fit 8 --stretch` (2026-11-03) lengthens long notes to fill bars, halving padded rest on the corpus; ear check pending. `--repeat N` (2026-11-03) loops the chant for full-length tracks; ear check pending. `--halftime` (2026-11-03) doubles chant durations over an unchanged backing for metal; ear check pending. Real-file batch landed 2026-11-03: 59 Graduale 1908 files, no crash or warning (batch.test.mjs, eval/batch-check.mjs). `--fills` (2026-11-03, genre.mjs fillBar, 3 tests) adds a snare roll every fourth bar; ear check pending. `--lrc FILE` timed lyrics (lrc.mjs, 3 tests, 2026-11-03; try in a real player). `--cues FILE` singer cue sheet (cues.mjs, 3 tests) landed 2026-11-03; try it with real singers; RECORDING-GUIDE.md (2026-11-03) is the protocol to try. `--suggest-final` (voicefit.mjs, 2026-11-03) lists finals that fit E2-E4; check the range with real singers. `--auto-final` (2026-11-03) applies that recommendation in one step. Preview renderer (render-cli.mjs: MIDI to WAV, 6 tests, 2026-11-03) lets master-cli run on real audio: metal preview passes all four checks, deep house is 2.8 LU quiet; a person must listen. `--limit` with `--lufs` (2026-11-03) limiter reaches -14 LUFS under -1 dBTP on deep house; listen for pumping. master-cli now prints a suggested gain (suggestGain, capped by true-peak room, 2026-11-03). `render-cli.mjs --stems DIR` (2026-11-03, 1 test) writes per-voice WAV stems that sum to the mix; load them in a DAW and judge by ear. Corpus read against pre-1929 scans 2026-11-13: five pieces, 1,492 notes, 0 differences; full Pange lingua and Veni Creator added (eval/scan-check/). Next: the Te Deum solemn tone and Salve simple tone as new files, a sample of the 59 batch files against the scan, a second reader, and listen to the --stretch output (ROADMAP.md).

Added on main the same day (moved from flagships.yaml): master-cli prints per-service playback gain (platformPlayback, 2026-11-03; service targets from memory, verify against their pages). `--intro N` (2026-11-03, intro.test.mjs) puts N silent bars before the chant, backing under them; ear check pending. `--markers` (2026-11-03, markers.test.mjs) adds a MIDI marker at each phrase start; check the locators in a DAW.
