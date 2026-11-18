"""Milestone 27: a neural quantile baseline against the boosted models (the proposal's
neural-net comparator, never run before session 33).

Needs pandas, numpy, scipy, torch (CPU). Run:
  python3 src/neural.py DATA_DIR --city sf --target a2i --test-year 2024 [--seeds 3]

Same split, features, quantile levels, week-block bootstrap and test year as src/boosted.py
(imported, not copied). One network per seed: embeddings for permit type, work class, area,
month and weekday; log cost with a missing flag; log description length; two hidden layers.
Three monotone quantile outputs (cumulative softplus, so q0.1 <= q0.5 <= q0.9) trained on the
pinball loss summed over the three levels, plus a logit head for P(same day). Targets are
scaled by 30 days. The calibration year chooses the epoch (early stopping on its mean pinball);
the test year is touched once. Writes results/neural_<city>_<target>_<year>.json.
"""
import argparse, json, os, sys
import numpy as np, pandas as pd, torch
import torch.nn as nn

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import boosted, harness  # noqa: E402

TAUS = harness.TAUS
SCALE = 30.0


def encode(tr, others):
    """Integer codes for the categoricals (unseen -> 0) and standardised numerics."""
    top = set(tr["area"].value_counts().head(60).index)
    maps = {}
    for c in ("permit_type", "work_class"):
        maps[c] = {v: i + 1 for i, v in enumerate(sorted(tr[c].unique()))}
    maps["area"] = {v: i + 1 for i, v in enumerate(sorted(top))}
    lc = tr["log_cost"].dropna()
    ld = np.log1p(tr["desc_len"].fillna(0))
    mu = (float(lc.mean()) if len(lc) else 0.0, float(ld.mean()))
    sd = (float(lc.std()) or 1.0 if len(lc) else 1.0, float(ld.std()) or 1.0)
    out = []
    for d in [tr] + others:
        cats = np.stack([d["permit_type"].map(maps["permit_type"]).fillna(0).to_numpy(np.int64),
                         d["work_class"].map(maps["work_class"]).fillna(0).to_numpy(np.int64),
                         d["area"].map(maps["area"]).fillna(0).to_numpy(np.int64),
                         (d["month"].to_numpy() - 1).astype(np.int64),
                         d["dow"].to_numpy().astype(np.int64)], 1)
        miss = d["log_cost"].isna().to_numpy()
        num = np.stack([((d["log_cost"].fillna(mu[0]) - mu[0]) / sd[0]).to_numpy(),
                        miss.astype(float),
                        ((np.log1p(d["desc_len"].fillna(0)) - mu[1]) / sd[1]).to_numpy()], 1)
        out.append((torch.tensor(cats), torch.tensor(num, dtype=torch.float32)))
    sizes = [len(maps["permit_type"]) + 1, len(maps["work_class"]) + 1, len(maps["area"]) + 1, 12, 7]
    return out, sizes


class Net(nn.Module):
    def __init__(self, sizes, emb=(16, 16, 16, 4, 3), hidden=128):
        super().__init__()
        self.embs = nn.ModuleList(nn.Embedding(n, e) for n, e in zip(sizes, emb))
        d = sum(emb) + 3
        self.body = nn.Sequential(nn.Linear(d, hidden), nn.ReLU(), nn.Linear(hidden, hidden), nn.ReLU())
        self.q = nn.Linear(hidden, len(TAUS))
        self.z = nn.Linear(hidden, 1)

    def forward(self, cats, num):
        h = torch.cat([e(cats[:, i]) for i, e in enumerate(self.embs)] + [num], 1)
        h = self.body(h)
        inc = nn.functional.softplus(self.q(h))
        return torch.cumsum(inc, 1), self.z(h).squeeze(1)      # days / SCALE, monotone in tau


def pin_t(y, q):
    t = torch.tensor(TAUS, dtype=torch.float32)
    d = y.unsqueeze(1) - q
    return torch.maximum(t * d, (t - 1) * d)


def predict(net, cats, num):
    net.eval()
    qs, zs = [], []
    with torch.no_grad():
        for i in range(0, len(cats), 65536):
            q, z = net(cats[i:i + 65536], num[i:i + 65536])
            qs.append(q); zs.append(torch.sigmoid(z))
    return torch.cat(qs).numpy() * SCALE, torch.cat(zs).numpy()


def fit(tr, ca, ytr, yca, sizes, seed, epochs=20, patience=3, bs=4096):
    torch.manual_seed(seed); np.random.seed(seed)
    net = Net(sizes)
    opt = torch.optim.Adam(net.parameters(), lr=2e-3)
    y = torch.tensor(ytr / SCALE, dtype=torch.float32)
    zt = torch.tensor((ytr == 0).astype(np.float32))
    yc = torch.tensor(yca / SCALE, dtype=torch.float32)
    best, best_state, bad, hist = 1e18, None, 0, []
    for ep in range(epochs):
        net.train()
        perm = torch.randperm(len(y))
        for i in range(0, len(y), bs):
            ix = perm[i:i + bs]
            q, z = net(tr[0][ix], tr[1][ix])
            loss = pin_t(y[ix], q).mean() + 0.1 * nn.functional.binary_cross_entropy_with_logits(z, zt[ix])
            opt.zero_grad(); loss.backward(); opt.step()
        net.eval()
        with torch.no_grad():
            q, _ = net(ca[0], ca[1])
            v = float(pin_t(yc, q).mean()) * SCALE
        hist.append(v)
        if v < best - 1e-4:
            best, bad = v, 0
            best_state = {k: t.clone() for k, t in net.state_dict().items()}
        else:
            bad += 1
            if bad >= patience:
                break
    net.load_state_dict(best_state)
    return net, hist


def run(df, test_year, seeds, neg=0):
    tr, ca, te = (df[df.year <= test_year - 2], df[df.year == test_year - 1], df[df.year == test_year])
    if not (len(tr) and len(ca) and len(te)):
        raise SystemExit(f"empty split {len(tr)}/{len(ca)}/{len(te)}")
    (etr, eca, ete), sizes = encode(tr, [ca, te])
    ytr, yca, yte = tr.y.to_numpy(float), ca.y.to_numpy(float), te.y.to_numpy(float)
    base = harness.ReferenceClass([dict(type=t, y=y) for t, y in zip(tr.permit_type, tr.y)])
    bq = {t: np.array([base.predict(k)[t] for k in te.permit_type]) for t in TAUS}
    wk = np.array(["%d-%02d" % harness.week(s) for s in te.start])
    res = dict(test_year=test_year, n_train=len(tr), n_calib=len(ca), n_test=len(te),
               negative_dropped=neg, seeds=seeds, hidden=128, batch=4096, lr=2e-3, max_epochs=20, patience=3)
    P = {t: [] for t in TAUS}; PZ = []; H = []
    for s in range(seeds):
        net, hist = fit(etr, eca, ytr, yca, sizes, s)
        q, pz = predict(net, *ete)
        q = np.maximum(q, 0)
        for j, t in enumerate(TAUS):
            P[t].append(q[:, j])
        PZ.append(pz); H.append(hist)
    res["calib_pinball_by_epoch"] = H
    res["baseline_pinball"] = {str(t): float(boosted.pin(yte, bq[t], t).mean()) for t in TAUS}
    res["neural_pinball_per_seed"] = {str(t): [float(boosted.pin(yte, p, t).mean()) for p in P[t]] for t in TAUS}
    res["neural_pinball"] = {str(t): float(np.mean(v)) for t, v in res["neural_pinball_per_seed"].items()}
    res["vs_baseline"] = {}
    for t in TAUS:
        lb = np.mean([boosted.pin(yte, p, t) for p in P[t]], axis=0)
        d = lb - boosted.pin(yte, bq[t], t)
        m, lo, hi = boosted.block_boot(d, wk)
        res["vs_baseline"][str(t)] = dict(diff=m, lo=lo, hi=hi, rel=m / res["baseline_pinball"][str(t)])
    bpath = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results",
                         f"boosted_{{city}}_{{target}}_{test_year}.json")
    res["coverage_80_per_seed"] = [float(np.mean((P[.1][s] <= yte) & (yte <= P[.9][s]))) for s in range(seeds)]
    res["coverage_80"] = float(np.mean(res["coverage_80_per_seed"]))
    z = (yte == 0).astype(float)
    res["share_same_day_test"] = float(z.mean())
    res["brier_same_day_neural"] = float(np.mean([np.mean((pz - z) ** 2) for pz in PZ]))
    res["_bpath"] = bpath
    return res, P, wk, yte


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir")
    ap.add_argument("--city", required=True, choices=["chicago", "sf", "austin"])
    ap.add_argument("--target", required=True, choices=["a2i", "i2c"])
    ap.add_argument("--test-year", type=int, required=True)
    ap.add_argument("--seeds", type=int, default=3)
    a = ap.parse_args()
    torch.set_num_threads(4)
    df, neg = boosted.load_frame(os.path.join(a.data_dir, f"{a.city}.csv"), a.target)
    r, P, wk, yte = run(df, a.test_year, a.seeds, neg)
    r.update(city=a.city, target=a.target)
    bj = r.pop("_bpath").format(city=a.city, target=a.target)
    if os.path.exists(bj):          # compare with the committed boosted run, same rows
        b = json.load(open(bj))["boosted_pinball"]
        r["boosted_pinball_committed"] = b
        r["neural_vs_boosted_rel"] = {k: r["neural_pinball"][k] / b[k] - 1 for k in b}
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results",
                       f"neural_{a.city}_{a.target}_{a.test_year}.json")
    json.dump(r, open(out, "w"), indent=1)
    print(json.dumps({k: v for k, v in r.items() if k != "calib_pinball_by_epoch"}, indent=1))
