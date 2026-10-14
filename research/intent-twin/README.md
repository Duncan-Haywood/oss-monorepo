# Intent twin: a robot that infers a human's goal with a threshold tuned against a simulated human is only as safe as the twin's assumed rationality

Pure Python, no dependencies. A robot infers which of two goals a human is heading to from binary motion cues (each points at the true goal with probability `p`) and commits when the lead reaches `h` (a sequential probability ratio test). Against a real human of accuracy `p` the wrong-goal probability is exactly `1/(1+r^h)` (`r=p/(1−p)`), the expected time `h(1−2e)/(2p−1)`, both matched to simulation (0.0326 vs 0.0331 at p=0.7, h=4). A threshold designed for `α=10⁻³` in a twin with `p_s=0.9` (`h=4`) gives real error 3.9× / 33× / 165× the target at p = 0.8 / 0.7 / 0.6; a twin with `p_s=0.6` (`h=18`) is safe (error ≤ 2.4·10⁻⁷) but 2.0–4.5× slower. A heterogeneous population (`Beta`, sd 0.08–0.10, mean 0.7) doubles the error of the mean-human threshold (0.033 → 0.070–0.088) and humans with `p<½` put a floor `P(p<½)` under any threshold. Calibrating `p_s` from `n=10…1000` real cues misses the target with probability 0.38 / 0.42 / 0.33 / 0.30 / 0.14 (n=10/20/50/200/1000) even where the mean error is under target; a lower-confidence-bound design cuts that to ≤ 4% at the price of longer commitment times. See `paper/whitepaper.md`.

```bash
cd research/intent-twin
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests, ~3 s
PYTHONPATH=src python3 experiments/run.py                 # seconds; output in experiments/results.txt
```

**Builds on.** The simulated-human-model direction of the CAIRO Lab (<https://cairo-lab.com/>) and the embodied/social intelligence direction of the HIRO Group (<https://hiro-group.ronc.one/>); no specific paper from those groups is reproduced and nothing here is affiliated with or endorsed by them. The method is Wald's sequential test (1945) and gambler's ruin, with goal inference as inverse planning (Baker, Saxe & Tenenbaum 2009; Ziebart et al. 2008) and legibility (Dragan et al. 2013). Companion to `handover-twin` and `explanation-twin` in this repository.

Stylised: two goals, binary i.i.d. cues, a fixed cue accuracy per human, equal prior, error is committing to the wrong goal, `Beta` populations assumed, simulated humans only. The `α^θ` law in the paper is loose (2–3× off with integer thresholds). MIT.
