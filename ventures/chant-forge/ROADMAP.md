# Chant Forge roadmap

A long-term programme, many sessions deep. Each milestone ships something that
runs or sounds, not just a plan. A run that lands a slice moves its line to
"Landed" with the date and how it was checked.

## Landed

- 2026-11-03: GABC to MIDI converter (`gabc.mjs`, `midi.mjs`, `cli.mjs`) with
  clefs, accidentals, mora, bars, a downbeat fit, transposition to a final, a
  mode/final check and a drone. 8 unit tests; output read back with Python `mido`.

## Next

1. **Corpus, first five pieces:**
   - transcribe *Dies irae*, *Pange lingua*, *Veni Creator Spiritus*,
     *Te Deum* (opening) and *Salve Regina* (simple tone) into `corpus/` from a
     cited public-domain scan (the 1908 Graduale or Liber Usualis);
   - each file names its page;
   - the mode/final check must pass on every piece.

   Before taking anything from GregoBase, record its licence in
   `corpus/README.md`. It was not checked on 2026-11-03.
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
4. **Genre templates as code**, each a MIDI drum, bass and harmony generator
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
