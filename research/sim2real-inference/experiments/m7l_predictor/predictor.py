"""Milestone 7l: does rho or the residual spread s_res/s_R predict the finite-twin betting win of 7j (pendulum) and 7k (cart-pole)?
python3 predictor.py  ->  results/predictor.csv, results/summary.txt   (pre-registration: LOG.md, 2026-10-25 milestone 7l; analysis only, no new simulation)"""
import csv, os, importlib.util
import numpy as np
from scipy.stats import spearmanr

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("m7h", os.path.join(HERE, "..", "m7h_uncapped_betting", "uncapped.py"))
m7h = importlib.util.module_from_spec(spec); spec.loader.exec_module(m7h)
LOADED = m7h.LOADED
SRC = {"pendulum": ("m7j_n_sweep", "n_sweep.csv", "N20000_f0.1"), "cartpole": ("m7k_cartpole_large_n", "large_n.csv", "N20000_f0.1")}


def rows():
    out = []
    for sysname, (d, f, tag) in SRC.items():
        T = LOADED[sysname]["twin"]
        for r in csv.DictReader(open(os.path.join(HERE, "..", d, "results", f))):
            R = LOADED[sysname][r["pair"]]
            out.append(dict(system=sysname, pair=r["pair"], n=int(r["n"]), rho=float(np.corrcoef(R, T)[0, 1]), sres=float((R - T).std() / R.std()),
                            ratio=float(r["w_" + tag]) / float(r["w_real"]), w_real=float(r["w_real"]), w_comb=float(r["w_" + tag])))
    return out


def best_cut(x, win):
    """Threshold on x (win when x < cut) with the highest accuracy; returns (cut, accuracy)."""
    s = np.sort(np.unique(x)); cuts = np.concatenate([[s[0] - 1], (s[1:] + s[:-1]) / 2, [s[-1] + 1]])
    acc = [((x < c) == win).mean() for c in cuts]
    k = int(np.argmax(acc)); return float(cuts[k]), float(acc[k])


if __name__ == "__main__":
    R = rows()
    with open(os.path.join(HERE, "results", "predictor.csv"), "w", newline="") as fh:
        w = csv.DictWriter(fh, list(R[0])); w.writeheader(); w.writerows(R)
    L = ["N = 20,000, f = 0.1; ratio = combined width / real-only width (m7j, m7k CSVs); sres = sd(R - T) / sd(R) from the m7 pools"]
    for n in (240, 960):
        q = [r for r in R if r["n"] == n]
        ratio = np.array([r["ratio"] for r in q]); rho = np.array([r["rho"] for r in q]); sres = np.array([r["sres"] for r in q])
        win = ratio < 1; wr = np.array([r["w_real"] for r in q])
        L.append(f"n={n}: pairs {len(q)}, wins {int(win.sum())}; Spearman(ratio, sres) {spearmanr(ratio, sres)[0]:.3f}, Spearman(ratio, rho) {spearmanr(ratio, rho)[0]:.3f}")
        for name, x in (("sres", sres), ("-rho", -rho)):
            c, a = best_cut(x, win); L.append(f"  best single cut on {name}: {c:.3f}, accuracy {a:.3f}")
        L.append(f"  (post hoc) Spearman(ratio, real-only width) {spearmanr(ratio, wr)[0]:.3f}; best single cut on real-only width: {best_cut(-wr, win)[1]:.3f} accuracy")
        for sysname in SRC:
            m = np.array([r["system"] == sysname for r in q])
            L.append(f"  {sysname}: sres range {sres[m].min():.3f} to {sres[m].max():.3f}, rho range {rho[m].min():.3f} to {rho[m].max():.3f}, ratio median {np.median(ratio[m]):.3f}, wins {int(win[m].sum())}/{int(m.sum())}")
            if m.sum() > 3: L.append(f"  {sysname} (post hoc) real-only width median {np.median(wr[m]):.4f}")
            if m.sum() > 3: L.append(f"  {sysname} within-system Spearman(ratio, sres) {spearmanr(ratio[m], sres[m])[0]:.3f}")
    open(os.path.join(HERE, "results", "summary.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))
