"""Milestone 7n follow-up: H7n-iii (W_R + W_T against the 7j/7k combined width) and a post hoc look at the mean of R.
python3 decomposition.py  ->  results/decomposition.txt   (needs results/residual_width.csv and ../m7m_threshold/results/threshold.csv)"""
import csv, os, importlib.util
import numpy as np
from scipy.stats import spearmanr

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("m7h", os.path.join(HERE, "..", "m7h_uncapped_betting", "uncapped.py"))
m7h = importlib.util.module_from_spec(spec); spec.loader.exec_module(m7h)
rw = {(r["system"], r["pair"], int(r["n"])): r for r in csv.DictReader(open(os.path.join(HERE, "results", "residual_width.csv")))}
errs, wins, agree, tot = [], 0, 0, 0
for c in csv.DictReader(open(os.path.join(HERE, "..", "m7m_threshold", "results", "threshold.csv"))):
    r = rw[(c["system"], c["pair"], int(c["n"]))]; f = c["f"]
    est = float(r[f"W_R_f{f}"]) + float(c["W_T"]); wc = float(c["w_comb"])
    errs.append(abs(est - wc) / wc)
    agree += (est < float(r["w_real"])) == (wc < float(c["w_real"])); tot += 1
L = [f"H7n-iii: median |W_R + W_T - w_comb| / w_comb = {np.median(errs):.3f} (90th percentile {np.percentile(errs, 90):.3f}) over {tot} cells",
     f"win/loss from W_R + W_T < w_real agrees with the 7j/7k outcome in {agree}/{tot} cells"]
rows = list(rw.values())
meanR = np.array([m7h.LOADED[r["system"]][r["pair"]].mean() for r in rows])
for f in (0.1, 0.5):
    q = np.array([float(r[f"W_R_f{f}"]) / float(r["w_real"]) for r in rows]); qv = np.array([float(r[f"q_var_f{f}"]) for r in rows])
    L.append(f"post hoc f={f}: Spearman(q/q_var, mean R) = {spearmanr(q / qv, meanR)[0]:.3f}; q/q_var median pendulum {np.median((q / qv)[[r['system'] == 'pendulum' for r in rows]]):.2f}, cart-pole {np.median((q / qv)[[r['system'] == 'cartpole' for r in rows]]):.2f}")
L.append("mean R by system: " + ", ".join(f"{s} {meanR[[r['system'] == s for r in rows]].mean():.3f}" for s in ("pendulum", "cartpole")))
open(os.path.join(HERE, "results", "decomposition.txt"), "w").write("\n".join(L) + "\n"); print("\n".join(L))
