# CFAR family in a clutter twin: does a more robust detector survive a Gaussian-clutter simulator?

Pure Python, no dependencies. Follow-up to `radar-clutter-twin`, which showed that a CA-CFAR threshold set in a Gaussian-clutter radar simulation gives a real false-alarm rate 9× (ν=5) to 30× (ν=2) too high at design 1e-4 when clutter has independent gamma texture. Here the same twin calibrates four window detectors: cell-averaging (CA), order-statistic at rank 3N/4 and N/2 (OS75, OS50), and a log-t (geometric-mean) detector. Results: none is meaningfully more robust to the twin's error. At design 1e-4 the inflation is 30/35/41/44× (CA/OS75/OS50/LOG, ν=2) and 9.1/9.2/8.3/9.4× (ν=5); at 1e-2, ν=2 CA is lowest (3.0× vs 3.6–4.7×). A known-scale oracle with no window noise inflates by 2.88× at 1e-2, ν=2 against CA's 3.02×, so nearly all of the error comes from the test cell's own texture, which reference cells cannot see. After repairing each threshold to the design rate in real clutter, CA has the best detection probability everywhere (ν=2, 20 dB Rayleigh target, real Pfa 1e-4: CA 0.758, LOG 0.744, OS75 0.732, OS50 0.703), and the twin's promised Pd is too high after repair (0.70 vs 0.43 at ν=2, 15 dB). See `paper/whitepaper.md`.

```bash
cd research/cfar-family-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests, ~25 s
PYTHONPATH=src python3 experiments/run.py                 # ~10 min; output in experiments/results.txt
```

**Builds on.** The sensor-simulation and sim-to-real-for-perception direction of the ARPG lab (<https://arpg.colorado.edu/>, radar/lidar perception); no specific ARPG paper is reproduced and nothing here is affiliated with or endorsed by that lab. Detectors are classical: Finn & Johnson (1968, *RCA Review* 29(3)), Rohling (1983, *IEEE Trans. AES* 19(4)) for OS-CFAR and its exact Gaussian Pfa, Ward (1981, *Electronics Letters* 17(16)) for the compound clutter model. Companion to `radar-clutter-twin` and the scalar-LQ twin projects `twin-transfer`, `randomized-twin`.

Stylised: single-pulse square-law detection, unit-mean gamma texture iid across cells, Rayleigh-fluctuating additive target, no range/Doppler structure, no real radar data, no interfering targets in the window (where OS-CFAR is normally preferred). MIT.
