"""Milestone 6: cross-city transfer (H4).

Needs pandas, numpy, scipy, lightgbm. Run:
  python3 src/transfer.py DATA_DIR --target a2i --test-year 2024 [--seeds 3]

H4 (PROPOSAL.md): a model trained on two cities and tested on the third is no better than
that city's own reference-class baseline. Refuted if it is better.

Cities do not share a permit-type vocabulary, so a transfer model can only use fields that
mean the same thing everywhere: log cost, description length, month, weekday, and a
harmonised permit class (keyword map `harmonise`, below). Three models are compared on the
held-out city's test year, all scored by pinball loss at q0.1/0.5/0.9:
  own_baseline   the harness's per-type empirical quantile of the held-out city (its own history)
  transfer       LightGBM trained on the OTHER cities (years <= Y-2), early-stopped on their year Y-1;
                 the held-out city's data are never seen
  own_boosted    the same harmonised features and settings trained on the held-out city itself
                 (the ceiling a local model reaches with these features)
Paired week-block bootstrap of transfer minus own_baseline (negative = transfer better).
"""
import argparse, json, os, re, sys
import numpy as np, pandas as pd, lightgbm as lgb

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness, boosted  # noqa: E402

TAUS = harness.TAUS
CITIES = ["chicago", "sf", "austin"]
CLASSES = ["new_construction", "alteration", "electrical", "plumbing", "mechanical",
           "demolition", "sign", "fire", "other"]
RULES = [("new_construction", r"new construction|new building|new const|\bnew\b"),
         ("demolition", r"demol|wreck"),
         ("electrical", r"electric|wiring"),
         ("plumbing", r"plumb|water heater|sewer"),
         ("mechanical", r"mechanic|hvac|furnace|boiler|heating|refriger|ventilat"),
         ("sign", r"\bsign|awning|banner"),
         ("fire", r"fire|sprinkler"),
         ("alteration", r"alter|renov|repair|remodel|addition|additions|reno|ot -|otc|interior|exterior")]


def harmonise(s):
    t = s.lower()
    for name, pat in RULES:
        if re.search(pat, t):
            return name
    return "other"


def frame(path, target):
    df, neg = boosted.load_frame(path, target)
    df["cls"] = df["permit_type"].map(harmonise)
    return df, neg


def feats(d):
    x = d[["log_cost", "desc_len", "month", "dow"]].copy()
    x["cls"] = pd.Categorical(d["cls"], categories=CLASSES)
    return x


def run(frames, held, test_year, seeds):
    src = [c for c in CITIES if c != held and c in frames]
    tr = pd.concat([frames[c][frames[c].year <= test_year - 2] for c in src])
    ca = pd.concat([frames[c][frames[c].year == test_year - 1] for c in src])
    own = frames[held]
    otr, oca, te = own[own.year <= test_year - 2], own[own.year == test_year - 1], own[own.year == test_year]
    if not all(len(d) for d in (tr, ca, otr, oca, te)):
        raise SystemExit("empty split")
    yte = te.y.to_numpy(float)
    wk = np.array(["%d-%02d" % harness.week(s) for s in te.start])
    base = harness.ReferenceClass([dict(type=t, y=y) for t, y in zip(otr.permit_type, otr.y)])
    bq = {t: np.array([base.predict(k)[t] for k in te.permit_type]) for t in TAUS}
    res = dict(held_out=held, sources=src, test_year=test_year, n_source_train=len(tr),
               n_own_train=len(otr), n_test=len(te), seeds=seeds, features=list(feats(te).columns),
               class_share_test={c: float((te.cls == c).mean()) for c in CLASSES})
    P = {"transfer": {t: [] for t in TAUS}, "own_boosted": {t: [] for t in TAUS}}
    for s in range(seeds):
        for name, (a, b) in (("transfer", (tr, ca)), ("own_boosted", (otr, oca))):
            pr, _, _, _ = boosted.fit_predict(feats(a), a.y.to_numpy(float), feats(b), b.y.to_numpy(float),
                                              feats(te), seed=s)
            for t in TAUS:
                P[name][t].append(pr[t])
    res["pinball"] = {"own_baseline": {str(t): float(boosted.pin(yte, bq[t], t).mean()) for t in TAUS}}
    for name in P:
        res["pinball"][name] = {str(t): float(np.mean([boosted.pin(yte, p, t).mean() for p in P[name][t]]))
                                for t in TAUS}
    res["h4"] = {}
    for name in P:
        res["h4"][name] = {}
        for t in TAUS:
            lb = np.mean([boosted.pin(yte, p, t) for p in P[name][t]], axis=0)
            d = lb - boosted.pin(yte, bq[t], t)
            m, lo, hi = boosted.block_boot(d, wk)
            res["h4"][name][str(t)] = dict(diff=m, lo=lo, hi=hi, rel=m / res["pinball"]["own_baseline"][str(t)])
        cov = [float(np.mean((P[name][.1][s] <= yte) & (yte <= P[name][.9][s]))) for s in range(seeds)]
        res["h4"][name]["coverage_80"] = float(np.mean(cov))
    res["coverage_80_own_baseline"] = float(np.mean((bq[.1] <= yte) & (yte <= bq[.9])))
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir")
    ap.add_argument("--target", required=True, choices=["a2i", "i2c"])
    ap.add_argument("--test-year", type=int, default=2024)
    ap.add_argument("--seeds", type=int, default=3)
    ap.add_argument("--held", nargs="*", default=None)
    a = ap.parse_args()
    cities = [c for c in CITIES if os.path.exists(os.path.join(a.data_dir, f"{c}.csv"))]
    frames = {c: frame(os.path.join(a.data_dir, f"{c}.csv"), a.target)[0] for c in cities}
    if a.target == "i2c":
        frames = {c: f for c, f in frames.items() if c != "chicago"}  # Chicago has no completion date
    for held in (a.held or list(frames)):
        r = run(frames, held, a.test_year, a.seeds)
        out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results",
                           f"transfer_{held}_{a.target}_{a.test_year}.json")
        json.dump(r, open(out, "w"), indent=1)
        print(held, a.target, json.dumps(r["h4"], indent=None)[:600])
