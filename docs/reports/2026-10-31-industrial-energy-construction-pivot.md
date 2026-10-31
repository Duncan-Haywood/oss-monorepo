# Pivot to industrial, energy and construction (agent note, 2026-10-31)

Owner, 2026-10-31: "let's pivot some of the big directions to deep tech industrial, energy real
estate dev and construction data warehouse as the big overarching directions ... robotics
construction imaging/sensing. autonomy."

- Reading of "construction data warehouse": the shared data layer (real public permits,
  inspections, cost indices, sensor readings on one schema, loaders as code), not a separate
  generic data-warehouse product. If the owner meant a general data-warehouse tool line, add it.
- Mechanism: `pick_track.py` `FOCUS` (9 tracks), `FOCUS_SHARE = 0.5`, `FOCUS_PROGRAMMES`
  (`sim2real-inference`, `build-data`). Measured on 20,000 evenly spaced draws in
  `test_pick_track.py`: track share within 0.02 of 0.68.
- `portfolio/flagships.yaml`: `wall-framing-takeoff` first, `ai-bookkeeper` second.
- `prompts/goals.md` section "Direction: industrial, energy and construction" ships in its own
  PR because `/prompts/` is in CODEOWNERS; until the owner approves it, the code comments point at
  a section not yet on `main`.
- Next useful steps: write `research/build-data/PROPOSAL.md` (probe the city portals through the
  proxy first; record each dataset's licence); the `heavy` and `aerolog` tracks have 1 project
  each and now get many more draws.
