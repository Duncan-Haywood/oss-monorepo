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

- 2026-11-03: mix and master check (`mastercheck.mjs`, `node mastercheck.mjs track.wav [--json]`): integrated loudness (BS.1770-4 K-weighting, EBU R128 gates), 4x oversampled true peak, clipped samples, channel correlation and mono fold-down, against -14 LUFS / -1 dBTP guidance. 8 tests: a 997 Hz stereo sine reads its own dBFS (0.0 and -20.0 LUFS within 0.1), a quiet tail under the gate does not move the reading, an inter-sample peak reads near full scale, clipping and out-of-phase mixes are flagged. Only synthetic signals checked; not compared with a reference meter (ffmpeg ebur128 or similar) on a real mix. The true-peak filter is a windowed sinc, a close estimate, not the standard's exact filter.

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
   - fit each phrase to a whole number of bars by stretching a few long notes,
     marked with the mora and episema the edition gives;
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
6. **Mix and master checks** (first version landed above; compare with a reference meter on a real render):
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
