# Radar detection twin: what a Gaussian-clutter simulator promises about detection, for CA- and OS-CFAR

Pure Python, no dependencies. Follow-up to `radar-clutter-twin`: CA-CFAR and OS-CFAR (`k=8,12,14` of `N=16`) with thresholds set in a Gaussian-clutter *radar-simulation twin* and deployed against clutter with iid gamma texture (K-distributed power), now with a Swerling-I target. Results: an exact one-dimensional Pfa/Pd law for OS-CFAR in textured clutter (matches 400k-trial simulation to ~1%); OS-CFAR is inflated much like CA (design 1e-4, ν=2: CA 30×, OS k=12 35×); repairing the threshold costs 3.7–4.6 dB at ν=2, but the SNR needed for Pd=0.9 at Pfa 1e-4 is 6.3 dB above the twin's promise (CA; 2.8 dB at ν=5, 0.8 dB at ν=20), more than the threshold repair alone; at the twin's own threshold and promised SNR real Pd is 0.84 while Pfa is 30× design; and the detector ranking CA < OS is *not* reversed by texture (a negative result). See `paper/whitepaper.md`.

```bash
cd research/radar-detection-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 8 tests, ~15 s
PYTHONPATH=src python3 experiments/run.py                 # ~70 s; output in experiments/results.txt
```

**Builds on.** The sensor-simulation and sim-to-real-for-perception direction of the ARPG lab (<https://arpg.colorado.edu/>, radar/lidar perception); no specific ARPG paper is reproduced and nothing here is affiliated with or endorsed by that lab. Detector and clutter models are classical: Finn & Johnson (1968, *RCA Review* 29(3)), Rohling (1983, *IEEE Trans. AES* 19(4)), Ward (1981, *Electronics Letters* 17(16)). Extends `radar-clutter-twin` (its texture quadrature and CA-CFAR law are repeated here so the project stands alone).

Stylised: single-pulse square-law detection, iid unit-mean gamma texture per reference cell, target of constant local SNR sharing the test cell's texture, no interferers, no real radar data. MIT.
