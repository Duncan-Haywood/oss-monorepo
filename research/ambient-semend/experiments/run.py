"""Sweep cue quality d', complete-point pause share q and pause model; write results.txt.

    python experiments/run.py
"""
import json
from pathlib import Path
import numpy as np
from ambient_semend.model import Pauses, best, best_fixed, simulate, p_cutoff, mean_wait

HERE = Path(__file__).resolve().parent
INP = json.loads((HERE / "inputs.json").read_text())
CHAIN = float(np.median(np.array(INP["asr_ms"]) + np.array(INP["llm_first_sentence_ms"]) + np.array(INP["tts_first_chunk_ms"])))
DELTA = float(np.mean(INP["endpoint_offset_ms"]))
HS = list(range(50, 1001, 50))
HL = list(range(100, 3001, 50))
TAUS = [x / 4 for x in range(-12, 13)]
DS = [0.0, 0.5, 1.0, 2.0, 3.0, 4.0]
QS = [0.0, 0.25, 0.5]
PAUSES = {"short (median 150 ms)": Pauses(2.0, 150.0, 0.8),
          "medium (median 250 ms)": Pauses(2.0, 250.0, 0.8),
          "long (median 400 ms)": Pauses(2.0, 400.0, 0.8),
          "medium, wide (sigma 1.2)": Pauses(2.0, 250.0, 1.2)}
out = []
w = out.append
w(f"inputs: {INP['source']}")
w(f"median chain {CHAIN:.0f} ms, endpoint offset {DELTA:.1f} ms; reply latency = mean wait + offset + chain")
w("cue: end ~ N(+d/2,1), mid-clause pause ~ N(-d/2,1), a share q of pauses sits at a complete point (cue blind)")
w("wait = expected silence before the assistant decides the turn is over, minimised over Hs<=Hl and threshold")
for name, p in PAUSES.items():
    for b in (0.05, 0.10):
        fx = best_fixed(p, b)
        w("")
        w(f"== wait vs d, {name}, cut-off budget {b:.0%} (fixed hangover {fx:.0f} ms) ==")
        w("  d    " + "  ".join(f"q={q:<4}" for q in QS) + "   (mean wait ms; fixed in header)")
        for d in DS:
            row = []
            for q in QS:
                r = best(p, d, q, b, HS, HL, TAUS)
                row.append(f"{r[0]:7.0f}" if r else "   none")
            w(f"  {d:<4} " + "  ".join(row))
p = PAUSES["medium (median 250 ms)"]
w("")
w("== chosen settings, medium pauses, budget 10%: d, q, Hs, Hl, tau, cutoff, wait, reply latency ==")
for q in (0.0, 0.5):
    for d in (1.0, 2.0, 4.0):
        r = best(p, d, q, 0.10, HS, HL, TAUS)
        w(f"  d={d} q={q}: Hs={r[1]} Hl={r[2]} tau={r[3]:+.2f} cutoff={r[4]:.3f} wait={r[0]:.0f} reply={r[0] + DELTA + CHAIN:.0f}")
w("")
w("== Monte Carlo check of the closed forms (200,000 turns), medium pauses ==")
for d, tau, q, Hs, Hl in [(2.0, 0.0, 0.0, 300, 900), (2.0, 0.5, 0.25, 200, 1000), (4.0, 0.0, 0.5, 150, 800)]:
    c, wt = simulate(p, d, tau, q, Hs, Hl, n=200000, seed=3)
    w(f"  d={d} tau={tau} q={q} Hs={Hs} Hl={Hl}: cutoff mc {c:.4f} closed {p_cutoff(p, d, tau, q, Hs, Hl):.4f}; "
      f"wait mc {wt:.1f} closed {mean_wait(d, tau, q, Hs, Hl):.1f}")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
