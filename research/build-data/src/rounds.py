"""Session 87: boosting rounds of the borrowed (transfer) model under each early-stopping variant, on the same cells.

Session 86 found the deployable model's loss sits in how many rounds its 0.9-quantile model gets, but sessions 84
and 85 never saved their round counts. This fits only the transfer model (cascade2 class, the selector's default
candidate) under the variants that early-stop, and records the round each quantile stops at:

  full         sources' years <= Y-2, early-stopped on their whole Y-1 (session 84; complete labels, an oracle)
  es_truncate  as full, early-stopped on the Y-1 rows completed by D = 1 January Y (session 85)
  es3          sources' years <= Y-4 and Y-2, early-stopped on their Y-3, all completed by D (session 87)
  cut_only     sources' years <= Y-2 completed by D, early-stopped on their whole Y-1 (session 87, post hoc: the
               training cut of sessions 86 and 87 alone, with session 84's early stopping)
  ipcw_cut     cut_only's training rows weighted by 1/G(y) (transfer.ipcw_completed: G per source city-year from
               its issue days), early-stopped on the whole Y-1 unweighted (session 88: do the weights give back
               what the cut takes?)
  ipcw_es3     es3's rows (train <= Y-4 and Y-2, early-stop Y-3, all completed by D), training and early-stopping
               rows both IPCW-weighted (session 88: the deployable version)
  cens_cut     cut_only's rows plus the sources' permits of years <= Y-2 still open at D, kept as lower bounds
               (transfer.censored_pseudo: Portnoy-style pseudo-rows, quantile level from a Kaplan-Meier per source
               city and class); early-stopped on the whole Y-1 unweighted (session 89)
  cens_es3     es3's rows with the same pseudo-rows for the open permits, in training and early stopping
               (session 89: the deployable version)

--score also scores cascade2's transfer predictions on the held-out city's test year (all rows; mean
pinball loss over the 3 seeds, as select_deploy's test_loss) and writes results/rounds_score_i2c.json.

Session 86's fixed counts are in its select_deploy_dep_*.json (deploy_detail.cascade2.rounds).
Run: python3.13 src/rounds.py DIR --held austin sf seattle --test-years 2021 2022
     python3.13 src/rounds.py --summarise x   (data_dir unused)
Writes results/rounds_i2c.json and results/rounds_summary.json.
"""
import argparse, datetime, json, os, sys
import numpy as np, pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import boosted, transfer  # noqa: E402

VARIANTS = ("full", "es_truncate", "es3", "cut_only", "ipcw_cut", "ipcw_es3", "cens_cut", "cens_es3")


def splits(frames, held, Y, variant, floor=0.05):
    """(train, early-stopping, train weights, early-stopping weights) source rows for one variant; weights are
    None when unweighted. The held-out city is never read."""
    D = datetime.date(Y, 1, 1)
    src = [c for c in transfer.CITIES if c != held and c in frames]
    cat = lambda f: pd.concat([frames[c][f(frames[c])] for c in src])  # noqa: E731
    if variant in ("cens_cut", "cens_es3"):
        km = {c: frames[c][frames[c].year <= Y - 2].assign(city=c) for c in src}
        def ccat(f):
            parts = [transfer.censored_pseudo(frames[c][f(frames[c])].assign(city=c), D, km[c]) for c in src]
            return (pd.concat([p[0] for p in parts]),
                    {t: np.concatenate([p[1][t] for p in parts]) for t in transfer.TAUS}, [p[2] for p in parts])
        if variant == "cens_cut":
            tr, w, _ = ccat(lambda d: d.year <= Y - 2)
            return tr, cat(lambda d: d.year == Y - 1), w, None
        tr, w, _ = ccat(lambda d: (d.year <= Y - 4) | (d.year == Y - 2))
        ca, wca, _ = ccat(lambda d: d.year == Y - 3)
        return tr, ca, w, wca
    if variant in ("ipcw_cut", "ipcw_es3"):
        def wcat(f):
            parts = [transfer.ipcw_completed(frames[c][f(frames[c])].assign(city=c), D, floor) for c in src]
            return pd.concat([p[0] for p in parts]), np.concatenate([p[1] for p in parts])
        if variant == "ipcw_cut":
            tr, w = wcat(lambda d: d.year <= Y - 2)
            return tr, cat(lambda d: d.year == Y - 1), w, None
        tr, w = wcat(lambda d: (d.year <= Y - 4) | (d.year == Y - 2))
        ca, wca = wcat(lambda d: d.year == Y - 3)
        return tr, ca, w, wca
    if variant == "es3":
        return (transfer.completed_by(cat(lambda d: (d.year <= Y - 4) | (d.year == Y - 2)), D),
                transfer.completed_by(cat(lambda d: d.year == Y - 3), D), None, None)
    tr, ca = cat(lambda d: d.year <= Y - 2), cat(lambda d: d.year == Y - 1)
    if variant == "cut_only":
        tr = transfer.completed_by(tr, D)
    return tr, (transfer.completed_by(ca, D) if variant == "es_truncate" else ca), None, None


def rounds(frames, held, Y, variant, seeds, score=False, floor=0.05):
    tr, ca, w, wca = splits(frames, held, Y, variant, floor)
    te = frames[held][frames[held].year == Y]
    xt = transfer.feats(te) if score else transfer.feats(ca.iloc[:1])
    out, loss = {}, {t: [] for t in transfer.TAUS}
    for s in range(seeds):
        pr, _, r, _ = boosted.fit_predict(transfer.feats(tr), tr.y.to_numpy(float), transfer.feats(ca),
                                          ca.y.to_numpy(float), xt, seed=s, classifier=False,
                                          w=w, wca=wca)
        out[str(s)] = {str(t): int(v) for t, v in r.items()}
        if score:
            for t in transfer.TAUS:
                loss[t].append(float(boosted.pin(te.y.to_numpy(float), pr[t], t).mean()))
    res = dict(n_train=len(tr), n_es=len(ca), rounds=out)
    if isinstance(w, dict):
        res["pseudo"] = {str(t): dict(sum=float(v.sum()), on_inf=float(v[tr.y.to_numpy(float) >= transfer.Y_INF].sum()))
                         for t, v in w.items()}
    elif w is not None:
        res["weights"] = dict(floor=floor, max=float(w.max()), mean=float(w.mean()), share_above_1=float((w > 1).mean()),
                              ess=float(w.sum() ** 2 / (w ** 2).sum()), sum=float(w.sum()))
    if score:
        res["n_test"] = len(te)
        res["test_loss"] = {str(t): sum(v) / len(v) for t, v in loss.items()}
    return res


def summarise(rounds_path, res_dir, held=("austin", "sf", "seattle"), years=(2021, 2022)):
    """Per cell and variant: cascade2's mean round count per quantile (3 seeds) next to cascade2's test-year
    loss change against session 84's complete-label model (select_deploy_<held>_i2c_<year>.json), in days.
    Session 86 (deploy) rounds come from its result files; es3's from this file or select_deploy_es3_*.json."""
    import numpy as np
    R = json.load(open(rounds_path))
    tag = {"es_truncate": "_es", "deploy": "_dep", "es3": "_es3"}
    cells = []
    for h in held:
        for Y in years:
            b = json.load(open(os.path.join(res_dir, f"select_deploy_{h}_i2c_{Y}.json")))
            for v in ("full", "es_truncate", "deploy", "es3"):
                if v == "deploy":
                    r = json.load(open(os.path.join(res_dir, f"select_deploy_dep_{h}_i2c_{Y}.json")))
                    rr = r["deploy_detail"]["cascade2"]["rounds"]
                elif f"{h} {Y} {v}" in R:
                    rr = R[f"{h} {Y} {v}"]["rounds"]
                else:
                    rr = json.load(open(os.path.join(res_dir, f"select_deploy_es3_{h}_i2c_{Y}.json")))["transfer_rounds"]["cascade2"]
                row = dict(held=h, year=Y, variant=v,
                           rounds={t: float(np.mean([s[t] for s in rr.values()])) for t in ("0.1", "0.5", "0.9")})
                if v != "full":
                    r = json.load(open(os.path.join(res_dir, f"select_deploy{tag[v]}_{h}_i2c_{Y}.json")))
                    row["cascade2_loss_change"] = {t: r["by_tau"][t]["test_loss"]["cascade2"] - b["by_tau"][t]["test_loss"]["cascade2"]
                                                   for t in ("0.5", "0.9")}
                cells.append(row)
    full = {(c["held"], c["year"]): c["rounds"] for c in cells if c["variant"] == "full"}
    out = dict(note="cascade2 candidate; rounds = mean of 3 seeds; loss change in days of mean pinball loss on all "
                    "test-year rows against session 84 (variant full); negative = better", cells=cells, by_variant={})
    for v in ("es_truncate", "deploy", "es3"):
        cs = [c for c in cells if c["variant"] == v]
        q9 = [c["rounds"]["0.9"] for c in cs]
        ratio = [c["rounds"]["0.9"] / full[(c["held"], c["year"])]["0.9"] for c in cs]
        ch = [c["cascade2_loss_change"]["0.9"] for c in cs]
        out["by_variant"][v] = dict(q90_rounds_min=min(q9), q90_rounds_max=max(q9),
                                    q90_rounds_ratio_to_full=[round(x, 3) for x in ratio],
                                    q90_cascade2_loss_change_mean=float(np.mean(ch)),
                                    q90_cascade2_loss_change=[round(x, 2) for x in ch])
    lr = [np.log(c["rounds"]["0.9"] / full[(c["held"], c["year"])]["0.9"]) for c in cells if c["variant"] != "full"]
    ch = [c["cascade2_loss_change"]["0.9"] for c in cells if c["variant"] != "full"]
    from scipy.stats import spearmanr
    rho = spearmanr(lr, ch)
    out["spearman_log_round_ratio_vs_q90_loss_change"] = dict(rho=float(rho.statistic), p=float(rho.pvalue), n=len(lr))
    return out


def ipcw_summary(path, held=("austin", "sf", "seattle"), years=(2021, 2022)):
    """Session 88: per cell, each variant's cascade2 test loss change against full (days; q0.5, q0.9), the q0.9
    rounds (mean of seeds), the share of cut_only's q0.9 cost the weights recover, and predictions G1 to G5."""
    R = json.load(open(path))
    cells = []
    for h in held:
        for Y in years:
            if f"{h} {Y} full" not in R:
                continue
            f = R[f"{h} {Y} full"]["test_loss"]
            row = dict(held=h, year=Y, full={t: f[t] for t in ("0.5", "0.9")}, change={}, q90_rounds={})
            for v in VARIANTS:
                k = f"{h} {Y} {v}"
                if k not in R:
                    continue
                row["change"][v] = {t: R[k]["test_loss"][t] - f[t] for t in ("0.5", "0.9")}
                row["q90_rounds"][v] = float(np.mean([r["0.9"] for r in R[k]["rounds"].values()]))
                if "weights" in R[k]:
                    row.setdefault("weights", {})[v] = R[k]["weights"]
            c = row["change"]
            if "cut_only" in c and "ipcw_cut" in c and c["cut_only"]["0.9"] > 0:
                row["ipcw_cut_recovered_share_q90"] = 1 - c["ipcw_cut"]["0.9"] / c["cut_only"]["0.9"]
            cells.append(row)
    sw = [c for c in cells if c["held"] in ("sf", "seattle")]
    au = [c for c in cells if c["held"] == "austin"]
    g = dict(
        G1=sum(abs(c["change"]["ipcw_cut"]["0.9"]) <= 1 for c in sw),
        G2=sum(c.get("ipcw_cut_recovered_share_q90", 0) >= 0.5 for c in sw),
        G3=sum(c["change"]["ipcw_es3"]["0.9"] < c["change"]["es3"]["0.9"] for c in sw),
        G4=sum(c["change"]["ipcw_cut"]["0.9"] > c["change"]["cut_only"]["0.9"] for c in au),
        G5=sum(abs(c["change"]["ipcw_cut"]["0.5"]) <= 0.5 for c in cells))
    verdict = dict(G1=g["G1"] >= 3, G2=g["G2"] >= 3, G3=g["G3"] >= 3, G4=g["G4"] == len(au) == 2, G5=g["G5"] == len(cells) == 6)
    mean = {v: {t: float(np.mean([c["change"][v][t] for c in cells if v in c["change"]])) for t in ("0.5", "0.9")}
            for v in VARIANTS if all(v in c["change"] for c in cells)}
    return dict(note="cascade2 transfer model; change = variant's mean pinball loss on all test-year rows minus full's, "
                     "days (negative = better); 3 seeds; SF and Seattle counts are of 4 city-years, Austin of 2",
                cells=cells, mean_change=mean, counts=g, held=verdict)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir")
    ap.add_argument("--held", nargs="+", default=["austin", "sf", "seattle"])
    ap.add_argument("--test-years", nargs="+", type=int, default=[2021, 2022])
    ap.add_argument("--variants", nargs="+", default=list(VARIANTS), choices=VARIANTS)
    ap.add_argument("--seeds", type=int, default=3)
    ap.add_argument("--floor", type=float, default=0.05, help="IPCW weight floor on G (ipcw_* variants)")
    ap.add_argument("--out-name", help="results file name (default rounds_[score_]i2c.json)")
    ap.add_argument("--score", action="store_true", help="also score cascade2 on the held-out test year")
    ap.add_argument("--summarise-ipcw", help="write results/<name>_summary.json from this results file (session 88)")
    ap.add_argument("--summarise", action="store_true", help="write results/rounds_summary.json from saved files")
    a = ap.parse_args()
    res_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results")
    if a.summarise_ipcw:
        s = ipcw_summary(a.summarise_ipcw)
        json.dump(s, open(a.summarise_ipcw.replace(".json", "_summary.json"), "w"), indent=1)
        print(json.dumps(dict(mean=s["mean_change"], counts=s["counts"], held=s["held"]), indent=1))
        for c in s["cells"]:
            print(c["held"], c["year"], {v: {t: round(x, 2) for t, x in d.items()} for v, d in c["change"].items()},
                  {v: round(x, 1) for v, x in c["q90_rounds"].items()}, round(c.get("ipcw_cut_recovered_share_q90", float("nan")), 2))
        sys.exit()
    if a.summarise:
        s = summarise(os.path.join(res_dir, "rounds_i2c.json"), res_dir)
        json.dump(s, open(os.path.join(res_dir, "rounds_summary.json"), "w"), indent=1)
        print(json.dumps(s["by_variant"], indent=1), s["spearman_log_round_ratio_vs_q90_loss_change"])
        for c in s["cells"]:
            print(c)
        sys.exit()
    cities = [c for c in transfer.CITIES if c != "chicago" and os.path.exists(os.path.join(a.data_dir, f"{c}.csv"))]
    frames = {c: transfer.frame(os.path.join(a.data_dir, f"{c}.csv"), "i2c", "cascade2")[0] for c in cities}
    out_path = os.path.join(res_dir, a.out_name or ("rounds_score_i2c.json" if a.score else "rounds_i2c.json"))
    res = json.load(open(out_path)) if os.path.exists(out_path) else {}
    for h in a.held:
        for Y in a.test_years:
            for v in a.variants:
                res[f"{h} {Y} {v}"] = rounds(frames, h, Y, v, a.seeds, a.score, a.floor)
                print(h, Y, v, res[f"{h} {Y} {v}"], flush=True)
                json.dump(res, open(out_path, "w"), indent=1)

