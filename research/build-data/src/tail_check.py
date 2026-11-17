"""Session 75: do the transfer sources' completion tails differ from Seattle's within one work class?

Session 74 found that naming the work type (cascade2) makes Seattle issue-to-completion transfer
worse at q0.9 (+2.2 days) and read it, untested, as: the sources (SF and Austin) give new
construction a long completion tail that Seattle's new-construction permits do not share. This
script checks the data side of that reading, with no model:

  for each cascade2 class, the q0.5 and q0.9 of the target (days) among the sources' training
  rows (years <= Y-2) and among the held-out city's test-year rows, and the ratio
  source q0.9 / held-out q0.9 with a 95% bootstrap interval (rows resampled within each side).

Run: python3 src/tail_check.py DATA_DIR [--target i2c] [--held seattle] [--test-year 2024]
Writes results/tail_check_<held>_<target>_<year>.json. Needs pandas, numpy (via transfer.py).
"""
import argparse, json, os, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import transfer  # noqa: E402


def quantile_ratio(src, held, q=0.9, n_boot=2000, seed=0):
    """Ratio of the q-quantiles src/held and a 95% percentile bootstrap interval.
    Returns None for the ratio when the held-out quantile is 0."""
    src, held = np.asarray(src, float), np.asarray(held, float)
    qs, qh = float(np.quantile(src, q)), float(np.quantile(held, q))
    rng = np.random.default_rng(seed)
    r = []
    for _ in range(n_boot):
        a = np.quantile(rng.choice(src, len(src)), q)
        b = np.quantile(rng.choice(held, len(held)), q)
        if b > 0:
            r.append(a / b)
    r = np.sort(r)
    lo, hi = (float(r[int(.025 * len(r))]), float(r[int(.975 * len(r)) - 1])) if len(r) else (None, None)
    return dict(q_source=qs, q_held=qh, ratio=qs / qh if qh > 0 else None, lo=lo, hi=hi)


def check(frames, held, test_year, min_n=50):
    src = [c for c in transfer.CITIES if c != held and c in frames]
    import pandas as pd
    tr = pd.concat([frames[c][frames[c].year <= test_year - 2] for c in src])
    te = frames[held][frames[held].year == test_year]
    out = dict(held_out=held, sources=src, test_year=test_year, classes={})
    for c in transfer.CLASSES:
        a, b = tr.y[tr.cls == c].to_numpy(float), te.y[te.cls == c].to_numpy(float)
        row = dict(n_source=len(a), n_held=len(b))
        if len(a) >= min_n and len(b) >= min_n:
            row["q50_source"], row["q50_held"] = float(np.quantile(a, .5)), float(np.quantile(b, .5))
            row["q90"] = quantile_ratio(a, b)
        out["classes"][c] = row
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir")
    ap.add_argument("--target", default="i2c", choices=["a2i", "i2c"])
    ap.add_argument("--held", default="seattle")
    ap.add_argument("--test-year", type=int, default=2024)
    a = ap.parse_args()
    cities = [c for c in transfer.CITIES if os.path.exists(os.path.join(a.data_dir, f"{c}.csv"))]
    if a.target == "i2c":
        cities = [c for c in cities if c != "chicago"]  # no completion date
    frames = {c: transfer.frame(os.path.join(a.data_dir, f"{c}.csv"), a.target, "cascade2")[0] for c in cities}
    res = check(frames, a.held, a.test_year)
    res["target"] = a.target
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results",
                       f"tail_check_{a.held}_{a.target}_{a.test_year}.json")
    json.dump(res, open(out, "w"), indent=1)
    for c, r in res["classes"].items():
        print(c, json.dumps(r))
