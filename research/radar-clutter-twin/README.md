# Radar clutter twin: what a Gaussian-clutter simulator does to a CFAR detector's false-alarm rate

Pure Python, no dependencies. A cell-averaging CFAR (CA-CFAR) detector with `N` reference cells has its threshold multiplier set in a *radar-simulation twin* whose clutter is Gaussian (exponential power), then is deployed against clutter with gamma-distributed texture (K-distributed power), drawn independently per cell. Results: the real false-alarm probability has an exact one-dimensional form `Pfa = E_τ0 Π_i E_τi[1/(1+ατ_i/(Nτ0))]` that matches direct Monte Carlo to ~1% (design 1e-2 → 0.030 at ν=2, 0.020 at ν=5); at design 1e-4 the real rate is 9× (ν=5) to 30× (ν=2) too high, at 1e-6 it is 50× to 358×; as α→∞ the inflation tends to `Γ(ν+N)/(Γ(ν)(ν−1)^N)` (verified numerically, but only reached at astronomically small Pfa); restoring the design rate costs a 1.9 dB (ν=5) to 3.7 dB (ν=2) higher threshold at 1e-4; if the texture is shared across the window, CA-CFAR is unaffected (0.0101 vs 0.0100); and a moment-fit of ν from `n` real clutter-only cells recovers the design rate to a median 1.1× at n=1000, though the 90th percentile is still 2× and small n (≤300) is worse than useful. See `paper/whitepaper.md`.

```bash
cd research/radar-clutter-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, ~15 s
PYTHONPATH=src python3 experiments/run.py                 # ~3 min; output in experiments/results.txt
```

**Builds on.** The sensor-simulation and sim-to-real-for-perception direction of the ARPG lab (<https://arpg.colorado.edu/>, radar/lidar perception); no specific ARPG paper is reproduced and nothing here is affiliated with or endorsed by that lab. Detector and clutter models are classical: Finn & Johnson (1968, *RCA Review* 29(3)), Rohling (1983, *IEEE Trans. AES* 19(4)), Ward (1981, *Electronics Letters* 17(16)). Companion to the scalar-LQ twin projects `twin-transfer`, `randomized-twin`, `twin-upkeep`.

Stylised: single-pulse square-law detection, unit-mean gamma texture iid across cells, no target, no range/Doppler structure, no real radar data. MIT.
