"""Session 78: score issue-to-completion (i2c) with a censoring-aware loss, and check it on real labels.

Why: session 77 found that an i2c test row exists only if the permit was completed before the
pull, so recent test years lose their long builds (administrative right-truncation). Every i2c
score in this programme so far is a complete-case (CC) mean over the rows that survived.

Estimator. A test row i issued on day s_i has a window C_i = (pull date - s_i) days and is seen
iff y_i <= C_i. If, within the test year, the build time does not depend on the issue day, then
P(seen | y) = G(y) = P(C >= y), and weighting each seen row by 1/G(y_i) (inverse probability of
censoring weighting, IPCW) gives a consistent estimate of the mean loss over all permits of that
year that complete (Robins & Rotnitzky 1992; the Brier-score form is Graf et al. 1999). G is the
issue-day distribution of the year's permits, estimated from the rows short enough to be seen
whatever their issue day (y_i <= min C), whose issue days are not selected by the truncation.
Rows with y > max C cannot be seen at all; G is floored (default 0.05, weight <= 20) and that
part of the distribution is lost, which the validation below measures rather than assumes away.

Validation (`validate`): a test year old enough to be nearly complete (2021 against a 2026 pull,
windows of 1,777 days and more) is scored three ways with the same fitted models: on all its rows
(the reference), CC on the rows a pseudo-pull 2 or 3 years earlier would have seen (the same
681-to-1,046-day windows the real 2024 test year has), and IPCW on those rows. The question is
whether IPCW lands nearer the reference than CC.

Rescore (`rescore`): the real test years, CC as before and IPCW, for the paired class
configurations of sessions 74 to 77.

Run (same pull procedure as session 77; one configuration pair per call):
  python3.13 src/censored_eval.py validate DIR --pull-date 2026-11-12 --held seattle --test-year 2021 \
      --pseudo-pull 2023-11-12 --classes cascade2 cascade2_nodemo
  python3.13 src/censored_eval.py rescore DIR --pull-date 2026-11-12 --held seattle --test-year 2024 \
      --classes cascade2 cascade2_nodemo type
Writes results/censored_eval_<mode>_<held>_i2c_<year>.json.
"""
import argparse, datetime, json, os, sys
import numpy as np, pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

TAUS = (0.1, 0.5, 0.9)


def windows(start, pull_date):
    """Days from each issue date to the pull (array of int)."""
    s = pd.to_datetime(pd.Series(start)).dt.date
    return np.array([(pull_date - d).days for d in s], dtype=float)


def survival(c_ref):
    """G(t) = P(C >= t) as a function, from the reference windows c_ref."""
    c = np.sort(np.asarray(c_ref, float))
    return lambda t: 1.0 - np.searchsorted(c, np.asarray(t, float), side="left") / len(c)


def ipcw_weights(y, c, floor=0.05):
    """Weights 1/G(y) for the rows seen (y <= c). G from the windows of rows with y <= min(c),
    which are seen whatever their issue day. Rows with y > c get weight 0."""
    y, c = np.asarray(y, float), np.asarray(c, float)
    seen = y <= c
    ref = c[seen & (y <= c.min())]
    if not len(ref):
        raise ValueError("no row short enough to be seen on every issue day")
    g = survival(ref)(y)
    return np.where(seen, 1.0 / np.maximum(g, floor), 0.0)


def wmean(v, w):
    return float(np.sum(w * v) / np.sum(w))


def weighted_quantile(v, w, q):
    o = np.argsort(v)
    cw = np.cumsum(np.asarray(w, float)[o])
    return float(np.asarray(v, float)[o][np.searchsorted(cw, q * cw[-1])])


def wblock_boot(d, w, weeks, n_boot=2000, seed=0):
    """Week-block bootstrap of the weighted mean sum(w d)/sum(w), weights held fixed.
    With w all ones this is boosted.block_boot."""
    d, w = np.asarray(d, float), np.asarray(w, float)
    codes, uniq = pd.factorize(np.asarray(weeks))
    sw = np.bincount(codes, weights=w * d, minlength=len(uniq))
    ww = np.bincount(codes, weights=w, minlength=len(uniq))
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(uniq), size=(n_boot, len(uniq)))
    stat = np.sort(sw[idx].sum(1) / ww[idx].sum(1))
    return wmean(d, w), float(stat[int(.025 * n_boot)]), float(stat[int(.975 * n_boot) - 1])


def ess(w):
    w = np.asarray(w, float)
    return float(w.sum() ** 2 / (w ** 2).sum())


def contrasts(rows_by_cfg, classes):
    """Per-row loss differences the programme reports: for each configuration, transfer and
    own_boosted minus own_baseline; for each later configuration, transfer and own_boosted minus
    the first configuration's. Returns {name: {tau: per-row diff}}."""
    a = classes[0]
    out = {}
    for k in classes:
        L = rows_by_cfg[k]["loss"]
        for m in ("transfer", "own_boosted"):
            out[f"{k}:{m}-own_baseline"] = {t: L[m][t] - L["own_baseline"][t] for t in TAUS}
    for k in classes[1:]:
        for m in ("transfer", "own_boosted"):
            out[f"{m}:{k}-{a}"] = {t: rows_by_cfg[k]["loss"][m][t] - rows_by_cfg[a]["loss"][m][t] for t in TAUS}
    return out


def score(diffs, weeks, w, mask):
    """CC (unweighted over mask) and IPCW (weighted over mask) mean with week-block intervals."""
    out = {}
    for name, per in diffs.items():
        out[name] = {}
        for t, d in per.items():
            cc = wblock_boot(d[mask], np.ones(mask.sum()), weeks[mask])
            iw = wblock_boot(d[mask], w[mask], weeks[mask])
            out[name][str(t)] = dict(cc=dict(zip(("diff", "lo", "hi"), cc)),
                                     ipcw=dict(zip(("diff", "lo", "hi"), iw)))
    return out


def fit(data_dir, held, test_year, seeds, classes):
    import transfer
    cities = [c for c in transfer.CITIES if c != "chicago"  # Chicago has no completion date
              and os.path.exists(os.path.join(data_dir, f"{c}.csv"))]
    R = {}
    for k in classes:
        frames = {c: transfer.frame(os.path.join(data_dir, f"{c}.csv"), "i2c", k)[0] for c in cities}
        r = transfer.run(frames, held, test_year, seeds, keep_rows=True)
        R[k] = r["_rows"]
        print(held, test_year, k, "n_test", r["n_test"], flush=True)
    a = R[classes[0]]
    for k in classes[1:]:
        if not np.array_equal(a["permit_id"], R[k]["permit_id"]):
            raise SystemExit("configurations have different test rows")
    return R


def bins(y, c, seen, edges=(0, 681, 800, 900, 1046)):
    """Per build-time bin: rows, share seen, and mean G(y) (the IPCW's estimate of that share).
    Only meaningful in `validate`, where unseen rows are known."""
    g = survival(c[seen & (y <= c.min())])
    out = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        b = (y > lo) & (y <= hi)
        if b.any():
            out.append(dict(lo=lo, hi=hi, n=int(b.sum()), share_seen=float(seen[b].mean()), mean_g=float(g(y[b]).mean())))
    return out


def summary(y, c, w, seen):
    return dict(n=int(len(y)), n_seen=int(seen.sum()), window_min=float(c.min()), window_max=float(c.max()),
                share_beyond_window_max=float((y > c.max()).mean()),
                ess_ipcw=ess(w[seen]), max_weight=float(w.max()),
                q90_all=float(np.quantile(y, .9)), q90_cc=float(np.quantile(y[seen], .9)),
                q90_ipcw=weighted_quantile(y[seen], w[seen], .9),
                q50_all=float(np.quantile(y, .5)), q50_cc=float(np.quantile(y[seen], .5)),
                q50_ipcw=weighted_quantile(y[seen], w[seen], .5))


def validate(data_dir, held, test_year, pull_date, pseudo_pull, seeds, classes, floor):
    R = fit(data_dir, held, test_year, seeds, classes)
    x = R[classes[0]]
    y, weeks = x["y"], x["weeks"]
    c = windows(x["start"], pseudo_pull)
    seen = y <= c
    w = ipcw_weights(y, c, floor)
    d = contrasts(R, classes)
    ref = {n: {str(t): dict(zip(("diff", "lo", "hi"), wblock_boot(v, np.ones(len(y)), weeks)))
               for t, v in per.items()} for n, per in d.items()}
    est = score(d, weeks, w, seen)
    for n in est:
        for t in est[n]:
            r = ref[n][t]["diff"]
            est[n][t]["reference"] = ref[n][t]
            est[n][t]["abs_err_cc"] = abs(est[n][t]["cc"]["diff"] - r)
            est[n][t]["abs_err_ipcw"] = abs(est[n][t]["ipcw"]["diff"] - r)
    real_c = windows(x["start"], pull_date)
    return dict(mode="validate", held_out=held, target="i2c", test_year=test_year, pull_date=pull_date.isoformat(),
                pseudo_pull=pseudo_pull.isoformat(), seeds=seeds, classes=classes, weight_floor=floor,
                labels=summary(y, c, w, seen), bins=bins(y, c, seen), reference_window_min=float(real_c.min()),
                note="reference = all test rows (windows >= reference_window_min days); cc/ipcw = rows the "
                     "pseudo-pull would have seen; days of mean pinball loss, negative = first term better",
                contrasts=est)


def rescore(data_dir, held, test_year, pull_date, seeds, classes, floor):
    R = fit(data_dir, held, test_year, seeds, classes)
    x = R[classes[0]]
    y, weeks = x["y"], x["weeks"]
    c = windows(x["start"], pull_date)
    seen = y <= c  # every row of the real pull is seen; kept for the check
    if not seen.all():
        raise SystemExit("rows with y > window: wrong pull date?")
    w = ipcw_weights(y, c, floor)
    return dict(mode="rescore", held_out=held, target="i2c", test_year=test_year, pull_date=pull_date.isoformat(),
                seeds=seeds, classes=classes, weight_floor=floor, labels=summary(y, c, w, seen),
                note="cc = the programme's usual complete-case score; ipcw = weighted by 1/P(window >= y); "
                     "days of mean pinball loss, negative = first term better",
                contrasts=score(contrasts(R, classes), weeks, w, seen))


DEFAULT_CLASSES = ["cascade2", "cascade2_nodemo"]


def out_name(mode, held, test_year, pseudo_pull, classes):
    """Result file name. Session 78's default pair keeps its original name; any other class list
    (session 79: cascade2 type cascade2_nodemo) is appended, so it does not overwrite those files."""
    tag = "" if mode == "rescore" else "_pp" + pseudo_pull.isoformat()[:4]
    if list(classes) != DEFAULT_CLASSES:
        tag += "_" + "-".join(classes)
    return f"censored_eval_{mode}_{held}_i2c_{test_year}{tag}.json"


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["validate", "rescore"])
    ap.add_argument("data_dir")
    ap.add_argument("--pull-date", required=True, type=datetime.date.fromisoformat)
    ap.add_argument("--pseudo-pull", type=datetime.date.fromisoformat)
    ap.add_argument("--held", default="seattle")
    ap.add_argument("--test-year", type=int, required=True)
    ap.add_argument("--seeds", type=int, default=3)
    ap.add_argument("--floor", type=float, default=0.05)
    ap.add_argument("--classes", nargs="+", default=DEFAULT_CLASSES,
                    choices=["type", "cascade2", "cascade2_nodemo"])
    a = ap.parse_args()
    if a.mode == "validate":
        if a.pseudo_pull is None:
            raise SystemExit("validate needs --pseudo-pull")
        res = validate(a.data_dir, a.held, a.test_year, a.pull_date, a.pseudo_pull, a.seeds, a.classes, a.floor)
    else:
        res = rescore(a.data_dir, a.held, a.test_year, a.pull_date, a.seeds, a.classes, a.floor)
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results",
                       out_name(a.mode, a.held, a.test_year, a.pseudo_pull, a.classes))
    json.dump(res, open(out, "w"), indent=1)
    print(json.dumps(res["labels"]))
    for n, per in res["contrasts"].items():
        print(n, {t: {k: round(v["diff"], 2) if isinstance(v, dict) else round(v, 2) for k, v in r.items()}
                  for t, r in per.items()})
