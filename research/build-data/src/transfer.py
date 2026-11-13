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
import harness, boosted, classmap  # noqa: E402

TAUS = harness.TAUS
CITIES = ["chicago", "sf", "austin", "seattle"]
CLASSES, RULES, harmonise = classmap.CLASSES, classmap.RULES, classmap.harmonise  # moved, session 70
FOLD = {"cascade2_nodemo": {"demolition": "alteration"}}  # session 76: configuration -> class merges
TAILFOLD_MIN_N = 50  # session 77: rows a class needs on each side before the rule may flag it


def tailfold_map(frames, held, test_year, min_n=TAILFOLD_MIN_N, n_boot=2000, seed=0):
    """Session 77, the general fold rule, decided from training-time data only.

    For each class (cascade2 labels), compare the target's q0.9 among the sources' training rows
    (years <= Y-2) with the held-out city's OWN history (years <= Y-2, the rows its own baseline
    is fitted on). A class whose ratio source/held has a 95% bootstrap interval entirely above 1
    is flagged: naming it would import the sources' longer tail. Flagged classes fold into
    alteration, or into "other" if alteration is itself flagged. The test year is never read.
    Returns (fold dict, per-class diagnostics)."""
    import tail_check
    src = [c for c in CITIES if c != held and c in frames]
    tr = pd.concat([frames[c][frames[c].year <= test_year - 2] for c in src])
    own = frames[held][frames[held].year <= test_year - 2]
    diag, flagged = {}, []
    for c in CLASSES:
        a, b = tr.y[tr.cls == c].to_numpy(float), own.y[own.cls == c].to_numpy(float)
        row = dict(n_source=len(a), n_held_history=len(b))
        if len(a) >= min_n and len(b) >= min_n:
            row["q90"] = tail_check.quantile_ratio(a, b, n_boot=n_boot, seed=seed)
            if row["q90"]["lo"] is not None and row["q90"]["lo"] > 1:
                flagged.append(c)
        diag[c] = row
    into = "other" if "alteration" in flagged else "alteration"
    return {c: into for c in flagged if c != into}, diag


MINSUP_GRID = (100, 1000, 10000)  # session 81: k values tried on the validation year


def minsup_map(frames, held, test_year, k):
    """Session 81, the minimum-support rule, decided from the sources' training rows only.

    A class with fewer than k source training rows (cities other than `held`, issue years <= Y-2,
    the rows the transfer model is fitted on) is folded into "other" in every city, so the transfer
    model never learns a class from a handful of borrowed rows. Session 80 found Austin's trade
    classes taught by 42 to 466 slow Seattle rows. The held-out city's rows are never read.
    Returns (fold dict, source row count per class)."""
    src = [c for c in CITIES if c != held and c in frames]
    tr = pd.concat([frames[c][frames[c].year <= test_year - 2] for c in src])
    n = {c: int((tr.cls == c).sum()) for c in CLASSES}
    return {c: "other" for c in CLASSES if c != "other" and n[c] < k}, n


def minsup_k(name):
    """'cascade2_minsup1000' -> 1000; None for any other configuration name."""
    m = re.fullmatch(r"cascade2_minsup(\d+)", name)
    return int(m.group(1)) if m else None


def apply_fold(frames, fold):
    """Copy of frames with classes merged per `fold`; the pre-fold class kept as cls_unfolded."""
    out = {}
    for c, d in frames.items():
        d = d.copy()
        d["cls_unfolded"] = d["cls"]
        d["cls"] = d["cls"].replace(fold) if fold else d["cls"]
        out[c] = d
    return out


def frame(path, target, classes="type"):
    """classes='type': permit_type only (sessions 10 to 69). 'cascade': permit_type, then
    work_class, then the loader's description class (session 70; needs a pull with desc_class).
    'cascade2': the same with the session 71 description rules (column desc_class_v2).
    'cascade2_nodemo': cascade2 with demolition folded into alteration (session 76), to test whether
    naming demolition is what carries cascade2's i2c q0.9 transfer cost."""
    df, neg = boosted.load_frame(path, target)
    if classes == "type":
        df["cls"] = df["permit_type"].map(harmonise)
    else:
        col = "desc_class_v2" if classes.startswith("cascade2") else "desc_class"  # incl. cascade2_tailfold
        if col not in df:
            raise SystemExit(f"{path} has no {col} column: re-pull with src/permits.py")
        df["cls"] = [classmap.cascade(t, w, d) for t, w, d in zip(df.permit_type, df.work_class, df[col])]
        if classes in FOLD:
            df["cls_unfolded"] = df["cls"]
            df["cls"] = df["cls"].replace(FOLD[classes])
    return df, neg


def feats(d):
    x = d[["log_cost", "desc_len", "month", "dow"]].copy()
    x["cls"] = pd.Categorical(d["cls"], categories=CLASSES)
    return x


def run(frames, held, test_year, seeds, keep_rows=False):
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
               class_share_test={c: float((te.cls == c).mean()) for c in CLASSES},
               class_share_source_train={c: float((tr.cls == c).mean()) for c in CLASSES})
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
    rows = {}
    for name in P:
        res["h4"][name] = {}
        rows[name] = {}
        for t in TAUS:
            lb = np.mean([boosted.pin(yte, p, t) for p in P[name][t]], axis=0)
            rows[name][t] = lb
            d = lb - boosted.pin(yte, bq[t], t)
            m, lo, hi = boosted.block_boot(d, wk)
            res["h4"][name][str(t)] = dict(diff=m, lo=lo, hi=hi, rel=m / res["pinball"]["own_baseline"][str(t)])
        cov = [float(np.mean((P[name][.1][s] <= yte) & (yte <= P[name][.9][s]))) for s in range(seeds)]
        res["h4"][name]["coverage_80"] = float(np.mean(cov))
    res["coverage_80_own_baseline"] = float(np.mean((bq[.1] <= yte) & (yte <= bq[.9])))
    if keep_rows:  # per-row seed-mean losses for paired(); not written to json
        rows["own_baseline"] = {t: boosted.pin(yte, bq[t], t) for t in TAUS}
        res["_rows"] = dict(loss=rows, y=yte, weeks=wk, permit_id=te.permit_id.to_numpy(), start=te.start.to_numpy(),
                            cls=(te.cls_unfolded if "cls_unfolded" in te else te.cls).to_numpy())
    return res


def paired(ra, rb, a, b):
    """Paired week-block bootstrap of class configuration b minus a on the same test rows (session 72).

    ra, rb: run(..., keep_rows=True) results for the same held-out city, target and test year with
    class configurations a and b. For each model (transfer, own_boosted) and quantile: mean pinball
    difference b - a in days (negative = b better), its 95% week-block interval and the change
    relative to the own baseline's loss. The own baseline does not use the class, so its rows must
    match exactly; anything else means the two runs did not see the same test set."""
    xa, xb = ra["_rows"], rb["_rows"]
    if not (np.array_equal(xa["y"], xb["y"]) and np.array_equal(xa["permit_id"], xb["permit_id"])):
        raise SystemExit("paired: the two class configurations have different test rows")
    for t in TAUS:
        if not np.allclose(xa["loss"]["own_baseline"][t], xb["loss"]["own_baseline"][t]):
            raise SystemExit("paired: own baseline differs between configurations")
    out = dict(held_out=ra["held_out"], test_year=ra["test_year"], n_test=ra["n_test"], seeds=ra["seeds"],
               a=a, b=b, note="b minus a, days of mean pinball loss; negative = b better")
    for name in ("transfer", "own_boosted"):
        out[name] = {}
        for t in TAUS:
            d = xb["loss"][name][t] - xa["loss"][name][t]
            m, lo, hi = boosted.block_boot(d, xa["weeks"])
            out[name][str(t)] = dict(diff=m, lo=lo, hi=hi,
                                     rel_to_baseline=m / ra["pinball"]["own_baseline"][str(t)])
    out["by_class"] = by_class(xa, xb, xb.get("cls"))
    return out


def by_class(xa, xb, cls):
    """Session 75: where the b-minus-a difference sits. Rows are grouped by their class under
    configuration b (cascade2 for the session 74 run; for a folded configuration, its class before
    the fold, so the folded rows stay visible). For each model, quantile and class: n rows,
    the class's mean difference in days, and its contribution to the overall mean difference
    (sum of the class's row differences over all test rows; contributions add up to the overall
    diff). No interval: a description, not a test."""
    if cls is None:
        return None
    N, out = len(cls), {}
    for name in ("transfer", "own_boosted"):
        out[name] = {}
        for t in TAUS:
            d = xb["loss"][name][t] - xa["loss"][name][t]
            out[name][str(t)] = {str(c): dict(n=int((cls == c).sum()), mean=float(d[cls == c].mean()),
                                              contribution=float(d[cls == c].sum() / N))
                                 for c in sorted(set(cls))}
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir")
    ap.add_argument("--target", required=True, choices=["a2i", "i2c"])
    ap.add_argument("--test-year", type=int, default=2024)
    ap.add_argument("--seeds", type=int, default=3)
    ap.add_argument("--held", nargs="*", default=None)
    ap.add_argument("--classes", nargs="+", choices=["type", "cascade", "cascade2", "cascade2_nodemo", "cascade2_tailfold"], default=["type"],
                    help="one or more class configurations; with two or more, the first is compared "
                         "with each later one on the same test rows (paired_*.json)")
    a = ap.parse_args()
    cities = [c for c in CITIES if os.path.exists(os.path.join(a.data_dir, f"{c}.csv"))]
    res_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results")
    allf = {}
    for k in a.classes:
        frames = {c: frame(os.path.join(a.data_dir, f"{c}.csv"), a.target, k)[0] for c in cities}
        if a.target == "i2c":
            frames = {c: f for c, f in frames.items() if c != "chicago"}  # Chicago has no completion date
        allf[k] = frames
    held_list = a.held or list(allf[a.classes[0]])
    for held in held_list:
        R = {}
        for k in a.classes:
            frames = allf[k]
            fold = diag = None
            if k == "cascade2_tailfold":  # session 77: fold chosen per held-out city and year
                fold, diag = tailfold_map(frames, held, a.test_year)
                print(held, a.target, "tailfold rule flags", fold)
                frames = apply_fold(frames, fold)
            r = run(frames, held, a.test_year, a.seeds, keep_rows=len(a.classes) > 1)
            if fold is not None:
                r["tailfold"] = dict(fold=fold, diagnostics=diag, min_n=TAILFOLD_MIN_N,
                                     rule="fold a class whose source/held-history q0.9 ratio 95% CI is above 1")
            R[k] = r
            tag4 = "_4city" if "seattle" in frames else ""
            tag = tag4 + ("" if k == "type" else "_" + k)
            r["classes"] = k
            out = os.path.join(res_dir, f"transfer_{held}_{a.target}_{a.test_year}{tag}.json")
            json.dump({x: v for x, v in r.items() if x != "_rows"}, open(out, "w"), indent=1)
            print(held, a.target, k, json.dumps(r["h4"], indent=None)[:600])
        for k in a.classes[1:]:
            pr = paired(R[a.classes[0]], R[k], a.classes[0], k)
            out = os.path.join(res_dir, f"paired_transfer_{held}_{a.target}_{a.test_year}{tag4}_{k}_vs_{a.classes[0]}.json")
            json.dump(pr, open(out, "w"), indent=1)
            print("paired", held, a.target, k, "vs", a.classes[0], json.dumps(pr["transfer"], indent=None)[:400])
