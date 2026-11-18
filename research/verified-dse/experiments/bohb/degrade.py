"""Milestone 63 adds BOHB_PART (env, both|score|features) -> writes degrade_<part>.txt. Milestone 62: causal test of the R2-faithfulness reading. Replays bohb.py with R2 corrupted on purpose
(multiplicative log-normal noise sigma on the R2 score, N(0,sigma) on the standardised KDE features), sigma in SIGMAS.
No flow. Usage: python3 degrade.py (about 10 min). Writes degrade.txt."""
import json, os, subprocess, sys
from pathlib import Path
H = Path(__file__).resolve().parent
SIGMAS = (1.0,) if os.environ.get("BOHB_PART") == "none" else (0.3, 1.0) if os.environ.get("BOHB_PART", "both") != "both" else (0, 0.1, 0.3, 1.0)
PART = os.environ.get("BOHB_PART", "both")
T = []
L = ["sigma | mean tau(R2,R4) over main 40 cells | B | rand | bohb | bohb_r4first | sh_r2 (mean regret %, 100 paired seeds)"]
for sg in SIGMAS:
    tag = f"deg{PART}{sg}"
    subprocess.run([sys.executable, str(H / "bohb.py")], env=dict(os.environ, BOHB_TAG=tag, BOHB_DEGRADE=str(sg)), check=True, capture_output=True)
    sm = json.loads((H / f"summary_{tag}.json").read_text())
    cl = json.loads((H / f"cells_{tag}.json").read_text())
    taus = [c["tau_r2"] for c in cl.values() if c["tau_r2"] is not None]
    for B in (15, 25, 40):
        g = sm[f"mean_B{B}"]
        L.append(f"{sg} | {(sum(taus)/len(taus)) if taus else float('nan'):.2f} | {B} | " + " | ".join(f"{float(g[a]):.2f}" for a in ("rand", "bohb", "bohb_r4first", "sh_r2")))
    # milestone 66: paired test over cells of bohb minus random routing (cells are the unit; each cell is already a mean over the 100 seeds)
    import math, random
    cv = [c for c in cl.values() if all(c.get(f"{a}_B{B}") is not None for a in ("rand", "bohb") for B in (15, 25, 40))]
    for B in (15, 25, 40):
        d = [c[f"bohb_B{B}"] - c[f"rand_B{B}"] for c in cv]
        br = random.Random(66)
        bs = sorted(sum(br.choice(d) for _ in d) / len(d) for _ in range(2000))
        w, l = sum(x < -1e-9 for x in d), sum(x > 1e-9 for x in d); n = w + l
        pv = min(1.0, 2 * sum(math.comb(n, k) for k in range(0, min(w, l) + 1)) / 2 ** n) if n else 1.0
        T.append(f"sigma {sg} part {PART} B {B}: bohb minus random = {sum(d)/len(d):+.2f} points [{bs[50]:+.2f}, {bs[1949]:+.2f}] bootstrap over {len(d)} cells; bohb lower in {w}, higher in {l}, sign test p {pv:.3f}")
    for p in (f"summary_{tag}.json", f"cells_{tag}.json", f"results_{tag}.txt"):
        (H / p).unlink()
(H / ("degrade.txt" if PART == "both" else f"degrade_{PART}.txt")).write_text("\n".join(L) + "\n"); (H / ("degrade_paired.txt" if PART == "both" else f"degrade_paired_{PART}.txt")).write_text("\n".join(T) + "\n"); print("\n".join(L + T))
