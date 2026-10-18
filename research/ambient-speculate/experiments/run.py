"""Run the speculative-start sweep and write results.txt.

    python experiments/run.py
"""
import json
from pathlib import Path
import numpy as np
from ambient_speculate.model import (Pauses, chains, delta, baseline, hold, eager, p_any,
                                     extra_runs_hold, talkover_eager)

HERE = Path(__file__).resolve().parent
INP = json.loads((HERE / "inputs.json").read_text())
C, D = chains(INP), delta(INP)
HS = [200, 300, 400, 500, 650, 800, 1000, 1200]
SS = [0, 100, 150, 200, 300]
PAUSES = {"short (median 150 ms)": Pauses(2.0, 150.0, 0.8),
          "medium (median 250 ms)": Pauses(2.0, 250.0, 0.8),
          "long (median 400 ms)": Pauses(2.0, 400.0, 0.8),
          "medium, 4 pauses/turn": Pauses(4.0, 250.0, 0.8),
          "medium, wide (sigma 1.2)": Pauses(2.0, 250.0, 1.2)}
BUDGETS = [0.02, 0.05, 0.10]
out = []
w = out.append
w(f"inputs: {INP['source']}")
w(f"chain ASR+LLM+TTS per utterance (ms): {[int(c) for c in C]}  median {np.median(C):.0f}  mean {C.mean():.0f}")
w(f"endpoint offset delta (mean of 4 measured): {D:.1f} ms")
w("")
w("baseline reply latency (median over 6 measured utterances), ms")
w("  H:  " + "  ".join(f"{h:5d}" for h in HS))
w("      " + "  ".join(f"{np.median(baseline(C, D, h)):5.0f}" for h in HS))
for name, p in PAUSES.items():
    w("")
    w(f"== pause model: {name} ==")
    w("  P(turn is cut off) by hangover H: " + "  ".join(f"H{h}:{p_any(p, h):.3f}" for h in HS))
    for b in BUDGETS:
        ok = [h for h in HS if p_any(p, h) <= b]
        if not ok:
            w(f"  cut-off budget {b:.0%}: no H in the grid meets it")
            continue
        H = ok[0]
        w(f"  cut-off budget {b:.0%} -> smallest H = {H} ms (cut-off {p_any(p, H):.3f}); baseline median {np.median(baseline(C, D, H)):.0f} ms")
        for S in SS:
            if S >= H:
                continue
            r = hold(C, D, S, H)
            w(f"    hold  S={S:4d}: median {np.median(r):5.0f} ms (saves {np.median(baseline(C, D, H)) - np.median(r):4.0f}), extra runs/turn {extra_runs_hold(p, S, H):.3f}")
        S = max(0.0, H - float(np.max(C)))   # latest start that still hides the slowest measured chain
        w(f"    hold  just-in-time S={S:4.0f}: median {np.median(hold(C, D, S, H)):5.0f} ms (saves {np.median(baseline(C, D, H)) - np.median(hold(C, D, S, H)):4.0f}), extra runs/turn {extra_runs_hold(p, S, H):.3f}")
        for S in SS:
            w(f"    eager S={S:4d}: median {np.median(eager(C, D, S)):5.0f} ms, talk-over {talkover_eager(p, C, D, S):.3f} per turn")
w("")
w("== latency vs speculative start S (hangover H = 1000 ms, medium pauses) ==")
w("  S_ms  hold_ms  eager_ms  baseline_ms  extra_runs_per_turn  talkover_eager")
for S in range(0, 1000, 100):
    w(f"  {S:4d}  {np.median(hold(C, D, S, 1000)):7.0f}  {np.median(eager(C, D, S)):8.0f}  {np.median(baseline(C, D, 1000)):11.0f}  "
      f"{extra_runs_hold(PAUSES['medium (median 250 ms)'], S, 1000):19.3f}  {talkover_eager(PAUSES['medium (median 250 ms)'], C, D, S):14.3f}")
print("\n".join(out))
(HERE / "results.txt").write_text("\n".join(out) + "\n")
