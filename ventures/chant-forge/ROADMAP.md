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

## Next

1. **Corpus hardening:** compare the five files against a pre-1929 scan,
   find a pre-1929 source for the Te Deum and Salve Regina, and add the
   remaining verses of Pange lingua and Veni Creator.
2. **Real-file robustness:** run the converter over a batch of Gregorio files
   and fix whatever it misreads:
   - multi-clef pieces;
   - `<sp>` and markup inside text;
   - NABC sections;
   - neumes split across groups.
3. **Rhythm options beyond padding:**
   - (stretching landed above; ear-compare it against padding on two pieces);
   - a "half-time chant over full-time drums" mode for metal;
   - compare the options by ear on two pieces.
4. **Genre templates as code** (first version landed above; ear check, fills,
   and transitions between sections remain), each a MIDI drum, bass and harmony generator
   keyed to the mode:
   - deep house at 122–124 BPM;
   - EDM and hard rock at 140–150;
   - metal at 160–180, or half time.

   Dorian and Phrygian voicings come first.
5. **Voices:**
   - (a) a guide for recording a real men's choir or multi-tracking one singer
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
