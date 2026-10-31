"""Milestone 2: quantile-loss harness, forward-in-time split and the reference-class baseline.

Stdlib only. One quantile definition everywhere (linear interpolation between order
statistics, "type 7": position (n-1)p), hand-counted in tests/test_harness.py. This replaces
the two definitions that disagreed in LOG.md session 3 (describe.py used floor(p*n)).

Run: python3 src/harness.py DATA_DIR --city sf --target a2i --test-year 2024
Targets: a2i = days applied to issued, i2c = days issued to completed. Negative lags are
dropped and counted. Rows are bucketed by the year of the start date (applied or issued).
Split: train years <= Y-2, calibration Y-1, test Y (never random).
"""
import argparse, csv, datetime, json, math, os, random

TAUS = (0.1, 0.5, 0.9)


def quantile(xs, p):
    """Type-7 quantile of a list: linear interpolation at position (n-1)p."""
    s = sorted(xs)
    if not s:
        raise ValueError("empty")
    h = (len(s) - 1) * p
    lo = math.floor(h)
    hi = min(lo + 1, len(s) - 1)
    return s[lo] + (h - lo) * (s[hi] - s[lo])


def pinball(y, qhat, tau):
    d = y - qhat
    return tau * d if d >= 0 else (tau - 1) * d


def load(path, target):
    """Rows -> dicts(type, start, y) for the target; also returns the count of negative lags."""
    a, b = ("applied", "issued") if target == "a2i" else ("issued", "completed")
    out, neg = [], 0
    with open(path, newline="") as fh:
        for r in csv.DictReader(fh):
            if not (r[a] and r[b]):
                continue
            y = (datetime.date.fromisoformat(r[b]) - datetime.date.fromisoformat(r[a])).days
            if y < 0:
                neg += 1
                continue
            out.append(dict(type=r["permit_type"], start=r[a], y=y))
    return out, neg


def split(rows, test_year):
    yr = lambda r: int(r["start"][:4])
    tr = [r for r in rows if yr(r) <= test_year - 2]
    ca = [r for r in rows if yr(r) == test_year - 1]
    te = [r for r in rows if yr(r) == test_year]
    return tr, ca, te


class ReferenceClass:
    """Per-type empirical quantiles from the training rows; types with fewer than
    `min_n` rows fall back to the all-types quantiles (the reference-class forecast)."""
    def __init__(self, rows, taus=TAUS, min_n=30):
        by = {}
        for r in rows:
            by.setdefault(r["type"], []).append(r["y"])
        self.glob = {t: quantile([r["y"] for r in rows], t) for t in taus}
        self.by = {k: {t: quantile(v, t) for t in taus} for k, v in by.items() if len(v) >= min_n}

    def predict(self, typ):
        return self.by.get(typ, self.glob)


def evaluate(model, rows, taus=TAUS):
    """Per-row losses: pinball per tau, plus the two-part view (same-day indicator).
    The same-day probability is the model's tau-grid mass at 0: the largest tau whose
    predicted quantile is 0 (0 if none), a coarse stand-in until milestone 3 adds a
    classifier; the Brier score of that is reported with the tail pinball on y > 0."""
    L = []
    for r in rows:
        q = model.predict(r["type"])
        pz = max([t for t in taus if q[t] <= 0], default=0.0)
        L.append(dict(start=r["start"], y=r["y"],
                      pin={t: pinball(r["y"], q[t], t) for t in taus},
                      brier=(pz - (r["y"] == 0)) ** 2,
                      tail=({t: pinball(r["y"], q[t], t) for t in taus} if r["y"] > 0 else None)))
    return L


def week(s):
    return datetime.date.fromisoformat(s).isocalendar()[:2]


def week_block_bootstrap(a, b, n_boot=2000, seed=0):
    """Paired block bootstrap over ISO weeks for mean(a) - mean(b). a, b are per-row
    losses of two models on the SAME rows with the same `start` strings."""
    blocks = {}
    for x, y, r in zip(a, b, range(len(a))):
        blocks.setdefault(week(x["start"]), []).append(x["v"] - y["v"])
    ks = list(blocks)
    rng = random.Random(seed)
    stats = []
    for _ in range(n_boot):
        tot = n = 0
        for _k in ks:
            blk = blocks[ks[rng.randrange(len(ks))]]
            tot += sum(blk); n += len(blk)
        stats.append(tot / n)
    stats.sort()
    allv = [d for k in ks for d in blocks[k]]
    return dict(diff=sum(allv) / len(allv), lo=stats[int(.025 * n_boot)], hi=stats[int(.975 * n_boot) - 1])


def run(rows, test_year, neg=0):
    tr, ca, te = split(rows, test_year)
    if not (tr and te):
        raise SystemExit(f"empty split: train {len(tr)}, test {len(te)}")
    m = ReferenceClass(tr)
    L = evaluate(m, te)
    res = dict(test_year=test_year, n_train=len(tr), n_calib=len(ca), n_test=len(te),
               negative_dropped=neg,
               share_same_day_test=sum(r["y"] == 0 for r in te) / len(te),
               pinball={str(t): sum(l["pin"][t] for l in L) / len(L) for t in TAUS},
               brier_same_day=sum(l["brier"] for l in L) / len(L))
    tail = [l for l in L if l["tail"]]
    res["tail_pinball_y_gt_0"] = {str(t): sum(l["tail"][t] for l in tail) / len(tail) for t in TAUS} if tail else None
    res["coverage_80"] = sum(m.predict(r["type"])[0.1] <= r["y"] <= m.predict(r["type"])[0.9] for r in te) / len(te)
    return res


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("data_dir")
    p.add_argument("--city", required=True, choices=["chicago", "sf", "austin"])
    p.add_argument("--target", required=True, choices=["a2i", "i2c"])
    p.add_argument("--test-year", type=int, required=True)
    a = p.parse_args()
    rows, neg = load(os.path.join(a.data_dir, f"{a.city}.csv"), a.target)
    res = run(rows, a.test_year, neg)
    res.update(city=a.city, target=a.target)
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results",
                       f"baseline_{a.city}_{a.target}_{a.test_year}.json")
    json.dump(res, open(out, "w"), indent=1)
    print(json.dumps(res, indent=1))
