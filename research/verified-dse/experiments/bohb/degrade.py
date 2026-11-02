"""Milestone 62: causal test of the R2-faithfulness reading. Replays bohb.py with R2 corrupted on purpose
(multiplicative log-normal noise sigma on the R2 score, N(0,sigma) on the standardised KDE features), sigma in SIGMAS.
No flow. Usage: python3 degrade.py (about 10 min). Writes degrade.txt."""
import json, os, subprocess, sys
from pathlib import Path
H = Path(__file__).resolve().parent
SIGMAS = (0, 0.1, 0.3, 1.0)
L = ["sigma | mean tau(R2,R4) over main 40 cells | B | rand | bohb | bohb_r4first | sh_r2 (mean regret %, 100 paired seeds)"]
for sg in SIGMAS:
    tag = f"deg{sg}"
    subprocess.run([sys.executable, str(H / "bohb.py")], env=dict(os.environ, BOHB_TAG=tag, BOHB_DEGRADE=str(sg)), check=True, capture_output=True)
    sm = json.loads((H / f"summary_{tag}.json").read_text())
    cl = json.loads((H / f"cells_{tag}.json").read_text())
    taus = [c["tau_r2"] for c in cl.values() if c["tau_r2"] is not None]
    for B in (15, 25, 40):
        g = sm[f"mean_B{B}"]
        L.append(f"{sg} | {sum(taus)/len(taus):.2f} | {B} | " + " | ".join(f"{float(g[a]):.2f}" for a in ("rand", "bohb", "bohb_r4first", "sh_r2")))
    for p in (f"summary_{tag}.json", f"cells_{tag}.json", f"results_{tag}.txt"):
        (H / p).unlink()
(H / "degrade.txt").write_text("\n".join(L) + "\n"); print("\n".join(L))
