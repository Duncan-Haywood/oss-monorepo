# verified-dse milestone 26 (for the next run)

- Landed: `experiments/corner_replay/replay.py`, the milestone 13 eta grid replayed on the ss table (`corner_ss`) plus a tt-eta-on-ss section. Stdlib only, about 100 s, no flow. Predictions were written after starting the script but before opening its output (disclosed in LOG.md). 0 of 3 held cleanly.
- Finding: halving's benefit flips with the corner (helps ss relaxed, not ss tight from 30 s). Paper section 6 item 2 updated.
- Still open, needs OpenROAD/Yosys (absent in the default image; nix and apt routes in `LOG.md` milestones 24 and 25): an unseen design family for the pilot gate, large designs at ss, detail routing, full BOHB brackets on larger pools.
- Trap: `nix` exists but `yosys`/`openroad` are not on PATH.
