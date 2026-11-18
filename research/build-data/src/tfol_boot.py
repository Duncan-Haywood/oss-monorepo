"""Session 101: does the oldest-cohort selector (session 99) hold on years it was not found on, and how often would
its pick flip on resampled permits?

Session 99 picked, per held-out city and test year Y, the source rule (cpin_es3_nc3, _nc5, _nc5_stamp,
_nc5_stamp_len) with the lowest q0.9 pinball loss on the target city's own permits issued in Y-6 and completed by
D = 1 January Y (k6_loss), and it matched the per-cell oracle in 4 of 4 cells (Y = 2021, 2022). This scores the
same selector on Y = 2019 and 2020, cells none of the four rules or the selector was chosen on, and, from the
per-row predictions rounds.py writes with CPIN_ROWS_DIR, resamples rows (B = 2,000, seed 100, fixed before any
run) to say how often the pick, and the 3-year versus 5-year side, would change.

Run: python3 src/tfol_boot.py RESULTS_JSON ROWS_DIR [--prior results/rounds_score_tfol_i2c.json]
Writes RESULTS_JSON with _boot.json in place of .json.
Session 102: python3 src/tfol_boot.py RESULTS_JSON ROWS_DIR --early scores test years 2017 and 2018 (early_summary).
"""
import argparse, json, os, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import boosted  # noqa: E402

CANDS = ("cpin_es3_nc3", "cpin_es3_nc5", "cpin_es3_nc5_stamp", "cpin_es3_nc5_stamp_len")
FIVE = set(CANDS) - {"cpin_es3_nc3"}
B, SEED, TAU = 2000, 100, 0.9
NEW_YEARS = (2019, 2020)  # out of sample: no rule or selector was chosen on them
OLD_YEARS = (2021, 2022)  # session 99's cells, refit here to save the rows


def row_loss(y, pred):
    """Per-row q0.9 pinball loss, averaged over seeds (pred: seeds x rows)."""
    return np.mean([boosted.pin(y, p, TAU) for p in pred], axis=0)


def boot_pick(L, n_boot=B, seed=SEED, cands=CANDS):
    """L: {cand: per-row losses on the same rows}. Resample rows with replacement; return the share of resamples
    picking each candidate (lowest mean) and the 95% interval of nc5 minus nc3."""
    rng = np.random.default_rng(seed)
    n = len(next(iter(L.values())))
    M = np.stack([L[c] for c in cands])
    picks = np.zeros(len(cands))
    d53 = np.empty(n_boot)
    for b in range(n_boot):
        i = rng.integers(0, n, n)
        m = M[:, i].mean(axis=1)
        picks[int(np.argmin(m))] += 1
        d53[b] = m[1] - m[0]
    share = dict(zip(cands, (picks / n_boot).tolist()))
    return share, [float(np.quantile(d53, 0.025)), float(np.quantile(d53, 0.975))]


def cell(R, rows_dir, h, Y, extra=()):
    """One held city-year. The pick, oracle and bootstrap are over CANDS; `extra` variants (session 102's
    4- and 6-year cuts) are scored on the test year alongside but never enter the pick or the oracle."""
    rs = {v: R.get(f"{h} {Y} {v}") for v in CANDS}
    if any(r is None for r in rs.values()):
        return None
    Z = {v: np.load(os.path.join(rows_dir, f"{h}_{Y}_{v}.npz")) for v in CANDS}
    test = {v: rs[v]["test_loss"]["0.9"] for v in CANDS}
    oracle = min(test, key=test.get)
    z0 = Z[CANDS[0]]
    done = ~z0["k6_open"]
    Lk6 = {v: row_loss(Z[v]["k6_y"][done], Z[v]["k6_pred"][:, done]) for v in CANDS}
    Lte = {v: row_loss(Z[v]["test_y"], Z[v]["test_pred"]) for v in CANDS}
    # check: the rows reproduce the JSON's means
    chk = max(max(abs(Lk6[v].mean() - rs[v]["tgt_k"]["6"]["loss"]["0.9"]) for v in CANDS),
              max(abs(Lte[v].mean() - test[v]) for v in CANDS))
    k6 = {v: rs[v]["tgt_k"]["6"]["loss"]["0.9"] for v in CANDS}
    pick = min(k6, key=k6.get)
    sh_k6, ci_k6 = boot_pick(Lk6)
    sh_te, ci_te = boot_pick(Lte)
    side = lambda p: "5y" if p in FIVE else "3y"  # noqa: E731
    return dict(held=h, year=Y, n_k6_done=int(done.sum()), n_k6=int(len(done)), n_test_done=int(len(z0["test_y"])),
                test_q90=test, oracle=oracle, k6=k6, pick=pick, regret=test[pick] - test[oracle],
                k6_nc5_minus_nc3=k6["cpin_es3_nc5"] - k6["cpin_es3_nc3"],
                test_nc5_minus_nc3=test["cpin_es3_nc5"] - test["cpin_es3_nc3"],
                boot_k6_pick_share=sh_k6, boot_k6_same_pick=sh_k6[pick],
                boot_k6_same_side=sum(s for c, s in sh_k6.items() if side(c) == side(pick)),
                boot_k6_nc5_minus_nc3_ci=ci_k6, boot_test_pick_share=sh_te,
                boot_test_oracle_side=sum(s for c, s in sh_te.items() if side(c) == side(oracle)),
                boot_test_nc5_minus_nc3_ci=ci_te, rows_check_max_abs=float(chk),
                pick_per_seed=[min(CANDS, key=lambda v: rs[v]["tgt_k"]["6"]["loss_per_seed"]["0.9"][s])
                               for s in range(len(rs[CANDS[0]]["test_loss_per_seed"]["0.9"]))],
                test_q90_extra={v: R[f"{h} {Y} {v}"]["test_loss"]["0.9"] for v in extra if f"{h} {Y} {v}" in R})


def summary(path, rows_dir, prior_path=None, held=("sf", "seattle")):
    R = json.load(open(path))
    P = json.load(open(prior_path)) if prior_path and os.path.exists(prior_path) else {}
    cells = [c for h in held for Y in NEW_YEARS + OLD_YEARS if (c := cell(R, rows_dir, h, Y))]
    new = [c for c in cells if c["year"] in NEW_YEARS]
    old = [c for c in cells if c["year"] in OLD_YEARS]
    m = lambda xs: float(np.mean(xs)) if xs else None  # noqa: E731
    fixed_new = {v: m([c["test_q90"][v] for c in new]) for v in CANDS}
    sel_new = m([c["test_q90"][c["pick"]] for c in new])
    refit = {f"{c['held']} {c['year']} {v}": max(abs(c["test_q90"][v] - P[f"{c['held']} {c['year']} {v}"]["test_loss"]["0.9"]),
                                                 abs(c["k6"][v] - P[f"{c['held']} {c['year']} {v}"]["tgt_k"]["6"]["loss"]["0.9"]))
             for c in old for v in CANDS if f"{c['held']} {c['year']} {v}" in P}
    full_new, full_old = len(new) == 2 * len(held), len(old) == 2 * len(held)
    sf, se = [c for c in new if c["held"] == "sf"], [c for c in new if c["held"] == "seattle"]
    pred = dict(
        R0=full_old and len(refit) == len(old) * len(CANDS) and all(x <= 0.05 for x in refit.values())
        and all(c["rows_check_max_abs"] < 1e-3 for c in cells),
        R1=full_new and all(c["oracle"] == "cpin_es3_nc3" for c in sf) and all(c["oracle"] in FIVE for c in se),
        R2=full_new and all(c["pick"] == "cpin_es3_nc3" for c in sf) and all(c["pick"] in FIVE for c in se),
        R3=full_new and all(sel_new < x for x in fixed_new.values()),
        R4=full_new and m([c["regret"] for c in new]) <= 1.0,
        R5=full_new and full_old and all(c["boot_k6_same_side"] >= 0.8 for c in cells))
    return dict(note="session 101: cascade2 transfer model, q0.9 mean pinball loss over 3 seeds (days); pick = "
                     "lowest q0.9 pinball on the target city's own Y-6 permits completed by D = 1 January Y "
                     f"(session 99's k6_loss); bootstrap: {B} row resamples (iid over permits), seed {SEED}",
                cells=cells, fixed_mean_new=fixed_new, selected_mean_new=sel_new,
                mean_regret_new=m([c["regret"] for c in new]),
                hits_new=sum(c["pick"] == c["oracle"] for c in new), side_hits_new=sum(
                    (c["pick"] in FIVE) == (c["oracle"] in FIVE) for c in new),
                refit_minus_s99_max_abs=refit, predictions=pred)


EARLY_YEARS = (2017, 2018)  # session 102: before every year any rule or selector was looked at
GRID = ("cpin_es3_nc4", "cpin_es3_nc6")  # session 102: the finer staleness grid


def pooled(cells, prior_path, held=("sf", "seattle"), years=NEW_YEARS + OLD_YEARS):
    """Session 102, post hoc: the four candidates and the k6 selector over every SF and Seattle city-year scored so
    far, these cells plus session 101's eight (prior_path: results/rounds_score_oos_i2c.json, same candidates)."""
    P = json.load(open(prior_path))
    rows = [dict(held=c["held"], year=c["year"], test=c["test_q90"], k6=c["k6"]) for c in cells]
    for h in held:
        for Y in years:
            rs = {v: P.get(f"{h} {Y} {v}") for v in CANDS}
            if all(rs.values()):
                rows.append(dict(held=h, year=Y, test={v: r["test_loss"]["0.9"] for v, r in rs.items()},
                                 k6={v: r["tgt_k"]["6"]["loss"]["0.9"] for v, r in rs.items()}))
    for r in rows:
        r["oracle"] = min(r["test"], key=r["test"].get)
        r["pick"] = min(r["k6"], key=r["k6"].get)
        r["nc5_minus_nc3"] = r["test"]["cpin_es3_nc5"] - r["test"]["cpin_es3_nc3"]
    m = lambda xs: float(np.mean(xs))  # noqa: E731
    reg = lambda r, v: r["test"][v] - r["test"][r["oracle"]]  # noqa: E731
    return dict(n=len(rows), fixed_regret={v: m([reg(r, v) for r in rows]) for v in CANDS},
                k6_regret=m([reg(r, r["pick"]) for r in rows]), k6_hits=sum(r["pick"] == r["oracle"] for r in rows),
                k6_side_hits=sum((r["pick"] in FIVE) == (r["oracle"] in FIVE) for r in rows),
                oracle_3y=sum(r["oracle"] == "cpin_es3_nc3" for r in rows),
                by_cell={f"{r['held']} {r['year']}": dict(oracle=r["oracle"], pick=r["pick"],
                                                          nc5_minus_nc3=r["nc5_minus_nc3"]) for r in rows})


def early_summary(path, rows_dir, held=("sf", "seattle"), prior_path=None):
    """Session 102: the same selector and fixed rules on test years 2017 and 2018, plus the 4- and 6-year cuts.
    Predictions E0 to E5, fixed before any model run (LOG.md, session 102)."""
    R = json.load(open(path))
    cells = [c for h in held for Y in EARLY_YEARS if (c := cell(R, rows_dir, h, Y, GRID))]
    m = lambda xs: float(np.mean(xs)) if xs else None  # noqa: E731
    full = len(cells) == 2 * len(held)
    sf, se = [c for c in cells if c["held"] == "sf"], [c for c in cells if c["held"] == "seattle"]
    grid = ("cpin_es3_nc3",) + GRID[:1] + ("cpin_es3_nc5",) + GRID[1:]
    allq = lambda c: {**c["test_q90"], **c["test_q90_extra"]}  # noqa: E731
    fixed = {v: m([allq(c)[v] for c in cells if v in allq(c)]) for v in CANDS + GRID}
    regret = {v: m([c["test_q90"][v] - c["test_q90"][c["oracle"]] for c in cells]) for v in CANDS}
    pred = dict(
        E0=full and all(c["rows_check_max_abs"] < 1e-3 for c in cells),
        E1=full and all(c["oracle"] in FIVE for c in se),
        E2=full and all(c["test_nc5_minus_nc3"] < 0 and c["boot_test_nc5_minus_nc3_ci"][1] < 0 for c in sf),
        E3=full and sum(c["pick"] == "cpin_es3_nc3" for c in cells) >= 3,
        E4=full and regret["cpin_es3_nc5"] <= 0.5 and regret["cpin_es3_nc5"] < regret["cpin_es3_nc3"],
        E5=full and all(v in c["test_q90_extra"] for c in cells for v in GRID)
        and all(abs(fixed[v] - fixed["cpin_es3_nc5"]) <= 0.5 for v in GRID))
    return dict(note="session 102: cascade2 transfer model, q0.9 mean pinball loss over 3 seeds on completed test "
                     "rows (days); test years 2017 and 2018; pick = lowest k6_loss over the four session-98 "
                     f"candidates; nc4 and nc6 scored alongside, outside the pick; bootstrap {B} row resamples, "
                     f"seed {SEED}",
                cells=cells, fixed_mean=fixed, fixed_regret=regret,
                selected_mean=m([c["test_q90"][c["pick"]] for c in cells]),
                mean_regret=m([c["regret"] for c in cells]), hits=sum(c["pick"] == c["oracle"] for c in cells),
                side_hits=sum((c["pick"] in FIVE) == (c["oracle"] in FIVE) for c in cells),
                grid_argmin={f"{c['held']} {c['year']}": min(grid, key=lambda v: allq(c).get(v, 9e9))
                             for c in cells}, predictions=pred,
                pooled_post_hoc=pooled(cells, prior_path) if prior_path and os.path.exists(prior_path) else None)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("results")
    ap.add_argument("rows_dir")
    ap.add_argument("--prior", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results",
                                                     "rounds_score_tfol_i2c.json"))
    ap.add_argument("--early", action="store_true", help="session 102: test years 2017 and 2018 (early_summary)")
    a = ap.parse_args()
    if a.early:
        s = early_summary(a.results, a.rows_dir, prior_path=a.prior.replace("tfol_i2c", "oos_i2c"))
        json.dump(s, open(a.results.replace(".json", "_boot.json"), "w"), indent=1)
        print(json.dumps({k: s[k] for k in ("fixed_mean", "fixed_regret", "selected_mean", "mean_regret", "hits",
                                            "side_hits", "grid_argmin", "predictions", "pooled_post_hoc")}, indent=1))
        for c in s["cells"]:
            print(c["held"], c["year"], "oracle", c["oracle"], "pick", c["pick"], round(c["regret"], 2),
                  "test nc5-nc3", round(c["test_nc5_minus_nc3"], 2), [round(x, 2) for x in c["boot_test_nc5_minus_nc3_ci"]],
                  "k6 nc5-nc3", round(c["k6_nc5_minus_nc3"], 2), [round(x, 2) for x in c["boot_k6_nc5_minus_nc3_ci"]],
                  "same side", round(c["boot_k6_same_side"], 3), c["pick_per_seed"], c["n_k6_done"], c["n_test_done"])
        sys.exit(0)
    s = summary(a.results, a.rows_dir, a.prior)
    json.dump(s, open(a.results.replace(".json", "_boot.json"), "w"), indent=1)
    print(json.dumps({k: s[k] for k in ("fixed_mean_new", "selected_mean_new", "mean_regret_new", "hits_new",
                                        "side_hits_new", "predictions")}, indent=1))
    for c in s["cells"]:
        print(c["held"], c["year"], "oracle", c["oracle"], "pick", c["pick"], round(c["regret"], 2),
              {k[8:] or "nc3": round(v, 2) for k, v in c["test_q90"].items()},
              {k[8:] or "nc3": round(v, 2) for k, v in c["k6"].items()},
              "same side", round(c["boot_k6_same_side"], 3), [round(x, 2) for x in c["boot_k6_nc5_minus_nc3_ci"]],
              "test oracle side", round(c["boot_test_oracle_side"], 3), c["pick_per_seed"])
