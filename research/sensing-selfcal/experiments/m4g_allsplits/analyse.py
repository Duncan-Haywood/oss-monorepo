"""Milestone 4g: the f-alone update test on every disjoint split, with a plain and a robust jackknife.

    python3 experiments/m4g_allsplits/analyse.py      # under a minute; no new solve

Reads milestone 4f's stored cornerSubPix 5x5 solves (every subset of 3..13 of the 13 views, both
cameras), forms each set's leave-one-view-out variance of f two ways (J: the plain jackknife of
milestones 4b-4f; R: the same with 1.4826 MAD of the delete-one focal lengths in place of their
standard deviation), scores the f-alone test z^2 = (f_new - f_old)^2 / (v_old + s^2 v_new) on every
disjoint split (old 7 views, new k = 4, 5, 6; and old 9, new 4, unscored), scores H52-H55 (LOG.md,
2026-11-13, milestone 4g planned) and writes summary.json and power.png.
"""
import gzip, itertools, json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CAMS = ("left", "right")
OTHER = {"left": "right", "right": "left"}
NV = 13
MAD = 1.4826
CHI2_1_99 = 6.634896601021214
S_LIST = (0.96, 0.98, 0.99, 0.995, 1.005, 1.01, 1.02, 1.04)   # milestone 4b's focal changes
SCEN = [("S0", 1.0)] + [("S1", s) for s in S_LIST] + [("S3", 1.0)]
DESIGNS = [(7, 4), (7, 5), (7, 6), (9, 4)]                       # (old views, new views); (9, 4) unscored
GATE = 0.005                                                     # milestone 4's adoption gate on sigma_f / f
HARM = 0.005                                                     # an adoption is harmful if it worsens f by > 0.5%


def mask(views):
    m = 0
    for v in views:
        m |= 1 << v
    return m


def ok(s):
    return s is not None and s["status"] > 0 and np.isfinite(s["f"])


def load(path=os.path.join(ROOT, "experiments", "m4f_setsize", "results.json.gz")):
    with gzip.open(path, "rt") as fh:
        res = json.load(fh)
    out = {cam: {} for cam in CAMS}
    for r in res["solutions"]:
        out[r["cam"]][tuple(r["views"])] = r["sol"]
    return out


def variances(f_loo):
    """(J, R) from the usable delete-one focal lengths of one set (see the module docstring)."""
    a = np.asarray(f_loo, float)
    m = len(a)
    J = (m - 1) / m * np.sum((a - a.mean()) ** 2)
    R = (m - 1) ** 2 / m * (MAD * np.median(np.abs(a - np.median(a)))) ** 2
    return float(J), float(R)


def per_set(sols):
    """Arrays indexed by view mask: f, reported sigma_f, J, R, usable (the set and >= n - 1 of its
    n delete-one solves converged)."""
    size = 1 << NV
    f = np.full(size, np.nan)
    sf = np.full(size, np.nan)
    J = np.full(size, np.nan)
    R = np.full(size, np.nan)
    for v, s in sols.items():
        if ok(s):
            f[mask(v)], sf[mask(v)] = s["f"], s["sf"]
    for v in sols:
        n = len(v)
        if n < 4 or n == NV or not np.isfinite(f[mask(v)]):
            continue
        loo = [f[mask(v) & ~(1 << w)] for w in v]
        loo = [x for x in loo if np.isfinite(x)]
        if len(loo) >= n - 1:
            J[mask(v)], R[mask(v)] = variances(loo)
    usable = np.isfinite(J)
    return dict(f=f, sf=sf, J=J, R=R, usable=usable, f13=f[(1 << NV) - 1])


def splits(n_old, k):
    """Every (old, new) pair of disjoint view sets, as mask arrays."""
    om, nm = [], []
    for o in itertools.combinations(range(NV), n_old):
        rest = [v for v in range(NV) if v not in o]
        for n in itertools.combinations(rest, k):
            om.append(mask(o)), nm.append(mask(n))
    return np.array(om), np.array(nm)


def decisions(T, n_old, k):
    """All decisions for one design: dict of arrays keyed by camera and scenario."""
    om, nm = splits(n_old, k)
    out = {}
    for cam in CAMS:
        for name, s in SCEN:
            src = T[OTHER[cam]] if name == "S3" else T[cam]
            new = T[cam]
            keep = src["usable"][om] & new["usable"][nm]
            o, n = om[keep], nm[keep]
            f_old, f_new = src["f"][o], s * new["f"][n]
            truth = s * new["f13"]
            d = f_new - f_old
            row = dict(old=o, new=n, d=d, f_new=f_new, sf_new=s * new["sf"][n],
                       e_old=np.abs(f_old - truth) / truth, e_new=np.abs(f_new - truth) / truth)
            for est in ("J", "R"):
                var = src[est][o] + s * s * new[est][n]
                with np.errstate(divide="ignore", invalid="ignore"):
                    row["z2_" + est] = np.where(var > 0, d * d / var, np.inf)
                row["var_" + est] = var
            out[(cam, name, s)] = row
    return out


def fired(row, ref, q):
    """ref: 'J' or 'R' against chi^2_1 at 1%; 'E1': J against the other camera's S0 99th percentile."""
    if ref == "E1":
        return row["z2_J"] > q
    return row["z2_" + ref] > CHI2_1_99


def harmful(row, f):
    adopt = f & (row["sf_new"] / row["f_new"] <= GATE)
    return adopt & (row["e_new"] - row["e_old"] > HARM)


def run(T, drop=None):
    """Rates per design, camera, scenario and reference. `drop` leaves out every split using that view."""
    res = {}
    D = {des: decisions(T, *des) for des in DESIGNS}
    if drop is not None:
        bit = 1 << drop
        for des in D:
            for key, row in D[des].items():
                keep = ((row["old"] & bit) == 0) & ((row["new"] & bit) == 0)
                D[des][key] = {a: b[keep] for a, b in row.items()}
    # E1 thresholds: each camera's S0 99th percentile of z^2 under J, old 7 and k = 4-6 pooled
    q = {cam: float(np.quantile(np.concatenate([D[(7, k)][(cam, "S0", 1.0)]["z2_J"] for k in (4, 5, 6)]), 0.99))
         for cam in CAMS}
    for des, dd in D.items():
        for (cam, name, s), row in dd.items():
            for ref in ("J", "R", "E1"):
                f = fired(row, ref, q[OTHER[cam]])
                res[(des, cam, name, s, ref)] = dict(n=int(len(f)), det=int(f.sum()), harm=int(harmful(row, f).sum()))
    return res, q, D


def rate(res, ref, design=None, cams=CAMS, scen="S0", s_set=(1.0,), ks=None):
    designs = [design] if design else [(7, k) for k in (ks or (4, 5, 6))]
    n = det = 0
    for des in designs:
        for cam in cams:
            for s in s_set:
                r = res.get((des, cam, scen, s, ref))
                if r:
                    n, det = n + r["n"], det + r["det"]
    return det / n if n else float("nan")


def scale_ratio(D, cam, est, des=(7, 6)):
    row = D[des][(cam, "S0", 1.0)]
    real = np.std(row["d"], ddof=1)
    return float(real / np.sqrt(np.mean(row["var_" + est])))


def score(res, D):
    pm2 = (0.98, 1.02)
    H = {}
    h = dict(J_chi2_pm2_k6=rate(res, "J", design=(7, 6), scen="S1", s_set=pm2),
             J_E1_pm2_k6=rate(res, "E1", design=(7, 6), scen="S1", s_set=pm2),
             E1_S0_left=rate(res, "E1", cams=("left",)))
    h["holds"] = bool(0.10 <= h["J_chi2_pm2_k6"] <= 0.28 and 0.51 <= h["J_E1_pm2_k6"] <= 0.71 and h["E1_S0_left"] >= 0.05)
    H["H52"] = h
    h = {cam: scale_ratio(D, cam, "R") for cam in CAMS}
    h.update({f"{cam}_J": scale_ratio(D, cam, "J") for cam in CAMS})
    h["holds"] = bool(all(0.67 <= h[c] <= 1.5 for c in CAMS))
    H["H53"] = h
    h = {cam: rate(res, "R", cams=(cam,)) for cam in CAMS}
    h["holds"] = bool(all(h[c] <= 0.03 for c in CAMS))
    H["H54"] = h
    h = dict(R_chi2_pm2_k6=rate(res, "R", design=(7, 6), scen="S1", s_set=pm2))
    h["holds"] = bool(h["R_chi2_pm2_k6"] >= 0.40)
    H["H55"] = h
    return H


def table(res):
    rows = []
    designs = [(7, 4), (7, 5), (7, 6), (9, 4)]
    for des in designs:
        for name, s in SCEN:
            for ref in ("J", "R", "E1"):
                r = dict(design=f"{des[0]}+{des[1]}", scen=name, s=s, ref=ref)
                for cam in CAMS:
                    x = res[(des, cam, name, s, ref)]
                    r[cam] = x["det"] / x["n"] if x["n"] else float("nan")
                    r[f"n_{cam}"] = x["n"]
                    r[f"harm_{cam}"] = x["harm"] / x["n"] if x["n"] else float("nan")
                r["pooled"] = rate(res, ref, design=des, scen=name, s_set=(s,))
                rows.append(r)
    return rows


def figure(res, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    xs = sorted(set(S_LIST) | {1.0})
    fig, axes = plt.subplots(1, 2, figsize=(10, 4.2), sharey=True)
    style = {"J": ("#1b2f6b", "plain jackknife, χ²₁"), "R": ("#c0392b", "robust (MAD) jackknife, χ²₁"),
             "E1": ("#c08a3e", "plain jackknife, other camera's threshold")}
    for ax, cam in zip(axes, CAMS):
        for ref, (c, lab) in style.items():
            ys = [res[((7, 6), cam, "S0" if s == 1.0 else "S1", s, ref)] for s in xs]
            ax.plot([100 * (s - 1) for s in xs], [y["det"] / y["n"] for y in ys], "o-", color=c, label=lab)
        ax.axhline(0.01, color="grey", lw=0.8, ls=":")
        ax.set_title(f"{cam} camera, 1,716 splits per point (old 7, new 6 views)", fontsize=9)
        ax.set_xlabel("focal change applied to the new views (%)")
        ax.set_ylim(-0.02, 1.02)
    axes[0].set_ylabel("share of splits where the test fires")
    h, lab = axes[0].get_legend_handles_labels()
    fig.legend(h, lab, fontsize=8, loc="lower center", ncol=3, frameon=False)
    fig.suptitle("Milestone 4g: f-alone update test on every disjoint split, 5×5 corners", fontsize=10)
    fig.tight_layout(rect=(0, 0.07, 1, 1))
    fig.savefig(path, dpi=130)


# Post hoc (added after H52 failed): milestone 4d's stored thresholds, from 180 S0 statistics per camera
Q_4D = {"left": 3.5563843634951113, "right": 1.0294555219271173}   # m4d_window/summary.json, subpix5 zf2_99


def posthoc(D):
    """Does this code reproduce milestone 4d's 61.3% on milestone 4b's 60 splits, and how much of the
    all-split drop comes from the threshold rather than the splits?"""
    with gzip.open(os.path.join(ROOT, "experiments", "m4b_viewcov", "results.json.gz"), "rt") as fh:
        old_splits = [(mask(x["old"]), mask(x["new"])) for x in json.load(fh)["splits"] if x["k"] == 6]
    out = {}
    for tname, thr in (("m4d_threshold", Q_4D),):
        for sname in ("m4b_60_splits", "all_splits"):
            n = det = 0
            for cam in CAMS:
                for s in (0.98, 1.02):
                    row = D[(7, 6)][(cam, "S1", s)]
                    f = row["z2_J"] > thr[OTHER[cam]]
                    if sname == "m4b_60_splits":
                        idx = {(int(a), int(b)): i for i, (a, b) in enumerate(zip(row["old"], row["new"]))}
                        f = f[[idx[p] for p in old_splits if p in idx]]
                    n, det = n + len(f), det + int(f.sum())
            out[f"{tname}/{sname}/pm2_k6"] = det / n
        for cam in CAMS:
            z = np.concatenate([D[(7, k)][(cam, "S0", 1.0)]["z2_J"] for k in (4, 5, 6)])
            out[f"{tname}/all_splits/S0_{cam}"] = float(np.mean(z > thr[OTHER[cam]]))
    return out


def main():
    sols = load()
    T = {cam: per_set(sols[cam]) for cam in CAMS}
    res, q, D = run(T)
    H = score(res, D)
    tab = table(res)
    # leave-one-view-out range of each headline rate
    keys = {"J_chi2_pm2_k6": lambda r: rate(r, "J", design=(7, 6), scen="S1", s_set=(0.98, 1.02)),
            "J_E1_pm2_k6": lambda r: rate(r, "E1", design=(7, 6), scen="S1", s_set=(0.98, 1.02)),
            "R_chi2_pm2_k6": lambda r: rate(r, "R", design=(7, 6), scen="S1", s_set=(0.98, 1.02)),
            # every 7 + 6 split uses all 13 views, so the three k = 6 ranges above are undefined (null);
            # the same rates at k = 5 are given instead (added after the first run found the gap)
            "J_chi2_pm2_k5": lambda r: rate(r, "J", design=(7, 5), scen="S1", s_set=(0.98, 1.02)),
            "J_E1_pm2_k5": lambda r: rate(r, "E1", design=(7, 5), scen="S1", s_set=(0.98, 1.02)),
            "R_chi2_pm2_k5": lambda r: rate(r, "R", design=(7, 5), scen="S1", s_set=(0.98, 1.02)),
            "E1_S0_left": lambda r: rate(r, "E1", cams=("left",)),
            "R_S0_left": lambda r: rate(r, "R", cams=("left",)),
            "R_S0_right": lambda r: rate(r, "R", cams=("right",))}
    sens = {k: [] for k in keys}
    for v in range(NV):
        r, _, _ = run(T, drop=v)
        for k, fn in keys.items():
            sens[k].append(fn(r))
    sens = {k: ([float(np.nanmin(x)), float(np.nanmax(x))] if np.any(np.isfinite(x)) else None) for k, x in sens.items()}
    harm = {ref: {f"{des[0]}+{des[1]}": sum(res[(des, c, n, s, ref)]["harm"] for c in CAMS for n, s in SCEN)
                  / sum(res[(des, c, n, s, ref)]["n"] for c in CAMS for n, s in SCEN) for des in DESIGNS}
            for ref in ("J", "R", "E1")}
    usable = {cam: {n: int(sum(T[cam]["usable"][mask(v)] for v in itertools.combinations(range(NV), n)))
                    for n in (4, 5, 6, 7, 9)} for cam in CAMS}
    S = dict(hypotheses=H, posthoc=posthoc(D), E1_thresholds=q, table=tab, drop_one_view_range=sens, harmful=harm, usable_sets=usable,
             scale_ratio={f"{a}+{b}":{f"{cam}/{est}": scale_ratio(D, cam, est, (a, b)) for cam in CAMS for est in ("J", "R")}
              for a, b in DESIGNS})
    with open(os.path.join(HERE, "summary.json"), "w") as fh:
        json.dump(S, fh, indent=1)
    print("usable sets", usable)
    print("E1 thresholds", q)
    for k, v in H.items():
        print(k, "holds" if v["holds"] else "REFUTED", json.dumps({a: b for a, b in v.items() if a != "holds"}))
    print("scale ratios", json.dumps(S["scale_ratio"]))
    print("post hoc", json.dumps(S["posthoc"]))
    print("drop-one-view ranges", json.dumps(sens))
    print("harmful", json.dumps(harm))
    for r in tab:
        if r["scen"] in ("S0", "S3") or r["s"] in (0.98, 1.02, 0.99, 1.01, 0.96, 1.04):
            print(f"{r['design']} {r['scen']} {r['s']:.3f} {r['ref']:2s} left {r['left']:.3f} right {r['right']:.3f} "
                  f"pooled {r['pooled']:.3f} (n {r['n_left']}/{r['n_right']})")
    figure(res, os.path.join(HERE, "power.png"))


if __name__ == "__main__":
    main()
