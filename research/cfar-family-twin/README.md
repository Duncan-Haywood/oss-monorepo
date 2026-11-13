# CFAR family in a clutter twin: does a more robust detector survive a Gaussian-clutter simulator?

Pure Python, no dependencies. Follow-up to `radar-clutter-twin`, which showed that a CA-CFAR threshold set in a Gaussian-clutter radar simulation gives a real false-alarm rate 9× (ν=5) to 30× (ν=2) too high at design 1e-4 when clutter has independent gamma texture. Here the same twin calibrates four window detectors: cell-averaging (CA), order-statistic at rank 3N/4 and N/2 (OS75, OS50), and a log-t (geometric-mean) detector. Results: none is meaningfully more robust to the twin's error. At design 1e-4 the inflation is 30/35/41/44× (CA/OS75/OS50/LOG, ν=2) and 9.1/9.2/8.3/9.4× (ν=5); at 1e-2, ν=2 CA is lowest (3.0× vs 3.6–4.7×). A known-scale oracle with no window noise inflates by 2.88× at 1e-2, ν=2 against CA's 3.02×, so at that point nearly all of the error comes from the test cell's own texture, which reference cells cannot see (at 1e-4 the oracle inflates more than CA, 36× against 30×, so this is not a general decomposition). After repairing each threshold to the design rate in real clutter, CA has the best detection probability everywhere (ν=2, 20 dB Rayleigh target, real Pfa 1e-4: CA 0.758, LOG 0.744, OS75 0.732, OS50 0.703), and the twin's promised Pd is too high after repair (0.70 vs 0.43 at ν=2, 15 dB). See `paper/whitepaper.md`. **Known error (quality audit 2026-11-13):** the target is added to clutter in power rather than in complex amplitude, so the Pd figures above come from a non-standard Swerling I model (standard model: twin CA 0.686 rather than 0.700 at ν=2, 15 dB); false-alarm results are unaffected. Details in Known gaps below and the paper's "Known modelling error" paragraph.

**Live page:** https://marisstella.app/research/cfar-family-twin/

```bash
cd research/cfar-family-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 7 tests, ~25 s
PYTHONPATH=src python3 experiments/run.py                 # ~10 min; output in experiments/results.txt
```

**Builds on.** The sensor-simulation and sim-to-real-for-perception direction of the ARPG lab (<https://arpg.colorado.edu/>, radar/lidar perception); no specific ARPG paper is reproduced and nothing here is affiliated with or endorsed by that lab. Detectors are classical: Finn & Johnson (1968, *RCA Review* 29(3)), Rohling (1983, *IEEE Trans. AES* 19(4)) for OS-CFAR and its exact Gaussian Pfa, Ward (1981, *Electronics Letters* 17(16)) for the compound clutter model. Companion to `radar-clutter-twin` and the scalar-LQ twin projects `twin-transfer`, `randomized-twin`.

Stylised: single-pulse square-law detection, unit-mean gamma texture iid across cells, Rayleigh-fluctuating target added in power (see Known gaps), no range/Doppler structure, no real radar data, no interfering targets in the window (where OS-CFAR is normally preferred). MIT.

## Known gaps (quality audit round 59, 2026-11-13)

From [`portfolio/quality/audits/2026-11-13-cfar-family-twin.json`](../../portfolio/quality/audits/2026-11-13-cfar-family-twin.json). The false-alarm results reproduce byte for byte and match the textbook CA and OS formulas; these gaps are in the detection-probability side and the framing.

- **The target is added in power, not amplitude.** `_pd_cond` (`src/cfar_family_twin/model.py`) computes P(τ·e0 + s·e1 > T) with e0, e1 independent Exp(1). A Swerling-1 target in complex-Gaussian clutter of local power τ gives an Exp(τ + s) test cell instead. Against the standard Swerling-1 CA-CFAR formula the twin Pd is overstated by up to 0.014 (0.6996 / 0.8922 / 0.9645 reported against 0.6855 / 0.8843 / 0.9615 at 15 / 20 / 25 dB), and real-clutter Pd by 0.002 to 0.005. The auditor re-ran the detector ranking with the standard model and it did not change. `simulate_direct` uses the same model, so the direct-simulation test cannot catch this. Fixing it means re-running `experiments/run.py` and updating the paper's Pd tables.
- **Prior work not cited.** With texture drawn independently per cell, the clutter is iid K-distributed, and CFAR loss in K clutter is studied in Watts (1985, IEE Proc. F 132), Armstrong and Griffiths (1991, IEE Proc. F 138) and Ward, Tough and Watts, *Sea Clutter* (IET, 2006). There is no baseline that sets the threshold for the K distribution itself.
- `twin_pd` has no test, and a seeded change to its target power passed every test.
