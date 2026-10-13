# Chirp twin: what does an FMCW radar twin without range–Doppler coupling get wrong about a moving target?

Pure Python, no dependencies. Real system: a sawtooth FMCW radar, whose beat tone `2SR/c + 2vf_c/c` makes the range read `R + κv`, `κ = f_cT/B`; the twin reads the true `R`. Results (all from `experiments/results.txt`): (1) a signal-level simulation of the beat tone (exact two-way delay, Hann FFT, parabolic peak) matches `R₀ + κv + vT` to ≤ 1e-4 range cells at ±25 m/s for three presets; (2) the bias is `f_D T` cells, independent of bandwidth: 0.62, 3.1, 4.8 cells (9 cm, 46 cm, 2.9 m) at 30 m/s for fast 77 GHz, mid 77 GHz and slow 24 GHz ramps; (3) for `|v| ≤ V` it is at most `T/(2T_pri)` ≈ 0.33–0.42 cells, but `V` is 16.2, 3.9, 2.6 m/s here; (4) compensating with the radar's own wrapped Doppler leaves `k·T/T_pri` cells (`k = round(v/2V)`), which is worse than no compensation on exactly half of the over-range speeds; (5) for a stationary scene seen by a forward-moving radar (±60° field of view) a centroid fit absorbs an along-track position error `0.707κv` (6.5 cm, 33 cm, 2.0 m at 30 m/s) and leaves a distortion of rms `0.455κv`.

```bash
cd research/chirp-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, under 1 s
PYTHONPATH=src python3 experiments/run.py                 # a few seconds; output in experiments/results.txt
```

**Builds on.** The radar sensor-simulation and sim-to-real perception direction of ARPG (<https://arpg.colorado.edu/>) and the field-robot direction of the Autonomous Systems IRT (<https://www.colorado.edu/irt/autonomous-systems/>); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. Range–Doppler coupling is textbook (Richards 2005; Winkler 2007); Doppler ego-motion follows Kellner et al. (2013). Companion to `alias-twin` and `aliasing-twin` (Doppler folding), `doppler-twin`, `mount-twin` and `multipath-twin` in this repository. See `paper/whitepaper.md`.

Stylised: single up ramp, one target or one ring of stationary points, noise-free beat tone, a simulated "real" radar and no radar data; the map result applies the verified per-point range shift analytically rather than rendering a point cloud through the signal model; triangular ramps, range migration over a frame and multi-target pairing are not modelled. Preliminary. MIT.
