# Chant Forge roadmap

A long-term programme, many sessions deep. Each milestone ships something that
runs or sounds, not just a plan. A run that lands a slice moves its line to
"Landed" with the date and how it was checked.

## Landed

- 2026-11-03: GABC to MIDI converter (`gabc.mjs`, `midi.mjs`, `cli.mjs`) with
  clefs, accidentals, mora, bars, a downbeat fit, transposition to a final, a
  mode/final check and a drone. 8 unit tests; output read back with Python `mido`.

- 2026-11-03: corpus of five pieces (Dies irae, Pange lingua, Veni Creator,
  Te Deum, Salve Regina) from GregoBase (CC0 per its FAQ), each naming its
  book and page; a test parses all of them and checks the mode final. Not
  compared against page scans; Te Deum and Salve Regina come from post-1929
  books (`corpus/README.md`).

- 2026-11-03: genre templates as code (`genre.mjs`, `--genre` in the CLI):
  deep house, EDM, hard rock and metal each write drums (GM channel 10), bass and
  chord parts bar by bar, in the chant's mode (Dorian, Phrygian, Lydian or
  Mixolydian, with a four-bar loop that fits the mode). 5 new tests check
  notes stay inside the mode scale, a kick in every bar, four on the floor, half
  time metal. Not yet listened to through a synthesiser: ear check pending.

- 2026-11-03: release kit (`release.mjs`, `release-cli.mjs`): ISRC and UPC/EAN check
  digits, cover art size, WAV format, the master checks, per-track source edition and
  rights, AI-disclosure level. 7 tests. Not run against a distributor's real form.

- 2026-11-03: GABC reader fixes for real files (CRLF comments, `<sp>`/`<v>`/`<alt>`
  text markup, clef change inside a group): 6 tests on made-up strings.

- 2026-11-03: rhythm option two, `--fit 8 --stretch` (`fitStretch` in `gabc.mjs`):
  lengthens a phrase's longest notes (each at most 2x, phrase-final note on a tie)
  to fill whole bars before padding rest. Padded rest on the five corpus pieces
  falls from 171/19/53/200/13 to 79/6/26/87/6 pulses. 5 tests in `stretch.test.mjs`.
  Not listened to; no ear comparison yet.

- 2026-11-03: real-file batch: GregoBase answered from the cloud proxy (the note below was out of date). 59 Graduale 1908 files in `corpus/gregobase-1908/` ran through the reader with no crash or warning; `batch.test.mjs` (3 tests), `eval/batch-check.mjs`. 48 of 59 end on the mode final; the 11 others are introits, graduals, alleluias and offertories ending on a differentia or verse. Notes not compared with scans.
- 2026-11-03: fuzz test (`fuzz.test.mjs`): 2000 seeded random GABC strings (odd clefs, unclosed groups, CRLF, markup) through the reader and MIDI writer; none throws, every pitch is 0-127, every file has MThd/MTrk. Made-up input only; GregoBase is blocked from the cloud proxy, so real-file batches are still open.

- 2026-11-03: `nabc.test.mjs`: NABC alternation (`(fg|vi|ls)`), neumes split across groups, `!`, `/`, `z`/`Z`, `;2`, backtick and `[ob:...]` markers all keep exactly the GABC pitches. Made-up strings; the real-file batch is still open.
- 2026-11-03: `--halftime` (`halfTime` in `gabc.mjs`): chant durations doubled against an unchanged backing tempo. 3 tests; bar and second counts checked on Dies irae. Not listened to.
- 2026-11-03: `RECORDING-GUIDE.md` (5a): make the guide and cue sheet, learn the line, record, run `master-cli.mjs`. Not tried with real singers.
- 2026-11-03: preview renderer (`render.mjs`, `render-cli.mjs`, `render.test.mjs`, 6 tests): MIDI to stereo WAV with an additive choir pad, organ drone, bass, chord pad and synthesised GM drums. Checked: a D3 note measures 146.8 Hz by autocorrelation, length follows the tempo map, output is deterministic. First reading through `master-cli.mjs` on Dies irae (`--fit 8 --final 50`): deep house at 124 BPM -16.8 LUFS (2.8 LU too quiet), true peak -1.12 dBTP; metal at 170 BPM half-time -14.0 LUFS, -1.67 dBTP, all four checks pass. Mono correlation reads 1.00 (everything is centred; no stereo image yet). Sound quality not judged by a person.
- 2026-11-03: `render-cli.mjs --lufs N` (`targetLufs` in `renderMidi`): gain to a loudness target, capped at -1 dBFS sample peak; 1 test reads the WAV back through `analyze` (reported vs measured within 0.3 LU). Not listened to.
- 2026-11-03: `--fills` (`fillBar` in `genre.mjs`, `fills.test.mjs`, 3 tests): a four-hit snare crescendo on the last beat of every fourth bar, never the final bar; off by default, adds hits only. Not listened to.
- 2026-11-03: `render-cli.mjs --stems DIR` (`stems: true` in `renderMidi`): one WAV per voice (choir, organ, bass, chords, drums) at the mix's scale, so a producer can load them into a DAW and mix by ear. 1 test: the stems sum to the mix within 1e-9; Dies irae metal gives 5 stems. Not listened to.

- 2026-11-13: corpus read against pre-1929 scans by machine (`scan.mjs`, `eval/scan-check.mjs`,
  8 tests): Dies irae, Veni Creator, Pange lingua (1908 Graduale) and Salve Regina (1912
  Antiphonale) agree on every note read (604, 43, 53, 214); the Te Deum is now the 1908 Roman
  tone (GregoBase 3656) with one transcription error corrected from the scan; seven of the
  11 off-final Graduale endings are the book's. Planted one-step errors caught 189-200 of 200.
  Verdicts: `eval/scan-check-verdicts.md`.
- 2026-11-13: an independent reading by eye (`eval/scan-read-by-eye/`, `corpus/scan-read-by-eye.json`,
  `scan-read-by-eye.test.mjs`, 5 tests), covering every note including rhombi, quilismas and
  liquescents. Dies irae, Veni Creator and Pange lingua against the 1908 Graduale, the Salve
  Regina and the earlier Te Deum file (now `corpus/te-deum-simple.gabc`) against the 1913 Liber
  Usualis: 1,492 notes, 0 differences. The 1974 Te Deum is the 1913 *tonus simplex*. Strophic
  hymns landed: `pange-lingua-full.gabc` (6 verses) and `veni-creator-full.gabc` (7 verses),
  texts from the 1908 pages, by `eval/scan-read-by-eye/build-hymns.mjs`.

## Next

1. **Corpus hardening:** add the remaining verses of Pange lingua and Veni
   Creator (the 1908 book prints them as text under the first verse's
   melody), find the four supplement-page off-final pieces in a scan that has
   the "pro aliquibus locis" supplement, teach the reader quilismas and
   liquescents, and have a person look at the Te Deum correction.
2. **Real-file robustness:** run the converter over a batch of Gregorio files
   and fix whatever it misreads:
   - multi-clef pieces;
   - `<sp>` and markup inside text;
   - NABC sections;
   - neumes split across groups.
3. **Rhythm options beyond padding:**
   - (stretching landed above; ear-compare it against padding on two pieces);
   - (half-time mode landed above, `--halftime`; ear check pending);
   - compare the options by ear on two pieces.
4. **Genre templates as code** (first version landed above; ear check, fills,
   and transitions between sections remain), each a MIDI drum, bass and harmony generator
   keyed to the mode:
   - deep house at 122–124 BPM;
   - EDM and hard rock at 140–150;
   - metal at 160–180, or half time.

   Dorian and Phrygian voicings come first.
5. **Voices:**
   - (a) (landed 2026-11-03, `RECORDING-GUIDE.md`, untried) a guide for recording a real men's choir or multi-tracking one singer
     against the MIDI line;
   - (b) a research spike on whether an open singing synthesiser can sing
     ecclesiastical Latin as a men's choir at acceptable quality, with a
     listening test and a written protocol.
6. **Mix and master checks:**
   - a script that measures integrated LUFS, true peak, mono compatibility and
     clipping against streaming targets;
   - it runs locally and costs nothing per track.
   - landed 2026-11-03: `master-cli.mjs` (LUFS, true peak, mono, clipping).
7. **Release kit:**
   - metadata, credits, ISRC slots, the AI-disclosure answers, cover-art spec
     and a per-track source note;
   - the owner opens the distributor account and uploads. Agents prepare
     everything up to that step.
8. **First release:** an EP of three to five tracks, then a steady cadence.
   Afterwards, use the existing `distrokid-royalty-to-journal` tool on the
   real earnings export.

## Owner decisions this needs (later, not now)

- Artist name and whether it is published under the portfolio's name.
- Distributor account (card, about $20–25 a year) and whether to pay singers.
- 2026-11-03: `render-cli.mjs --lufs N --limit` (`limiterCurve` in `render.mjs`): 5 ms lookahead limiter looping on LUFS and true peak. Dies irae deep house: -14.00 LUFS, -1.05 dBTP (without `--limit` -15.91, -0.19); metal unchanged. 1 test; stems sum to the mix. Not listened to (pumping is an ear judgement).
