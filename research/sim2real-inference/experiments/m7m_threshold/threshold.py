"""Milestone 7m: is the finite-twin win a threshold on w_real / W_T? Cut fitted on pendulum cells, scored on cart-pole cells.
python3 threshold.py  ->  results/threshold.csv, results/summary.txt   (pre-registration: LOG.md, 2026-10-25 milestone 7m; no new pair simulation)"""
import csv, os, importlib.util
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def load(name, rel):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, "..", rel))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


m7k = load("m7k", "m7k_cartpole_large_n/large_n.py")  # interval_chunked, CAP, A, LOADED
LOADED, interval_chunked, CAP, A = m7k.LOADED, m7k.interval_chunked, m7k.CAP, m7k.A
SRC = {"pendulum": ("m7j_n_sweep", "n_sweep.csv", (4000, 20000)), "cartpole": ("m7k_cartpole_large_n", "large_n.csv", (20000, 100000))}
FS, DRAWS = (0.1, 0.5), 40


def twin_width(sysname, N, f, rng):
    T = LOADED[sysname]["twin"]
    w = [np.subtract(*interval_chunked(rng.choice(T, N, replace=True), A * f, CAP)[::-1]) for _ in range(DRAWS)]
    return float(np.median(w))


def best_cut(x, win):
    """Win when x > cut; returns (cut, accuracy) with the highest accuracy."""
    s = np.sort(np.unique(x)); cuts = np.concatenate([[s[0] - 1], (s[1:] + s[:-1]) / 2, [s[-1] + 1]])
    acc = [((x > c) == win).mean() for c in cuts]; k = int(np.argmax(acc)); return float(cuts[k]), float(acc[k])


if __name__ == "__main__":
    rng = np.random.default_rng(7)
    cells = []
    for sysname, (d, f, Ns) in SRC.items():
        WT = {(N, fr): twin_width(sysname, N, fr, rng) for N in Ns for fr in FS}
        for r in csv.DictReader(open(os.path.join(HERE, "..", d, "results", f))):
            for N in Ns:
                for fr in FS:
                    wc = float(r[f"w_N{N}_f{fr}"]); wr = float(r["w_real"])
                    cells.append(dict(system=sysname, pair=r["pair"], n=int(r["n"]), N=N, f=fr, w_real=wr, w_comb=wc, W_T=WT[(N, fr)], x=wr / WT[(N, fr)], win=int(wc < wr)))
    with open(os.path.join(HERE, "results", "threshold.csv"), "w", newline="") as fh:
        w = csv.DictWriter(fh, list(cells[0])); w.writeheader(); w.writerows(cells)
    P = [c for c in cells if c["system"] == "pendulum"]; C = [c for c in cells if c["system"] == "cartpole"]
    arr = lambda q, k: np.array([c[k] for c in q], float)
    L = [f"cells: pendulum {len(P)}, cart-pole {len(C)}; W_T = median of {DRAWS} twin-mean betting intervals"]
    for sysname in SRC:
        L.append(f"  {sysname} W_T by (N, f): " + ", ".join(f"({c['N']},{c['f']}) {c['W_T']:.4f}" for c in {(c['N'], c['f']): c for c in cells if c['system'] == sysname}.values()))
    L.append(f"wins: pendulum {int(arr(P, 'win').sum())}/{len(P)}, cart-pole {int(arr(C, 'win').sum())}/{len(C)}")
    for name, key in (("x = w_real / W_T", "x"), ("w_real only", "w_real")):
        k, a = best_cut(arr(P, key), arr(P, "win") == 1)
        pred = arr(C, key) > k; ta = float((pred == (arr(C, "win") == 1)).mean())
        L.append(f"{name}: cut fitted on pendulum {k:.4f} (train accuracy {a:.3f}); cart-pole accuracy {ta:.3f}")
    open(os.path.join(HERE, "results", "summary.txt"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))
