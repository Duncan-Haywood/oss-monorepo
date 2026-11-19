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
Session 103: python3 src/tfol_boot.py RESULTS_JSON ROWS_DIR --grid scores the staleness grid {3, 4, 5 years} as fixed
rules and as a per-deployment chooser (lowest k6_loss over the grid) over all 12 SF and Seattle city-years
(grid_summary; nc4 for 2019 to 2022 from RESULTS_JSON, the rest from sessions 101 and 102's files). Writes
RESULTS_JSON with _grid.json in place of .json.
Session 106: python3 src/tfol_boot.py RESULTS_JSON ROWS_DIR --austin scores Austin as target at the grid and ncrd,
pooled with session 103's 12 cells (austin_summary). Writes RESULTS_JSON with _austin.json in place of .json.
Session 104: python3 src/tfol_boot.py RESULTS_JSON ROWS_DIR --recent scores cpin_es3_ncr (a cut per source city at
the 0.99 quantile of its builds completed in the 3 years before D) against session 103's grid oracle in all 12
cells (recent_summary). Writes RESULTS_JSON with _recent.json in place of .json.
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


STALE_GRID = ("cpin_es3_nc3", "cpin_es3_nc4", "cpin_es3_nc5")  # session 103


def grid_rows(new, oos, early, held=("sf", "seattle")):
    """Session 103: one row per SF/Seattle city-year 2017 to 2022 with test q0.9 and k6_loss for each grid member.
    new: session 103's nc4 fits (2019-2022); oos: session 101's (nc3, nc5 for 2019-2022); early: session 102's
    (nc3, nc4, nc5 for 2017-2018). A cell missing any member is skipped."""
    src = {Y: (early, early, early) if Y in EARLY_YEARS else (oos, new, oos) for Y in EARLY_YEARS + NEW_YEARS + OLD_YEARS}
    rows = []
    for h in held:
        for Y, files in src.items():
            rs = {v: f.get(f"{h} {Y} {v}") for v, f in zip(STALE_GRID, files)}
            if not all(rs.values()):
                continue
            test = {v: r["test_loss"]["0.9"] for v, r in rs.items()}
            k6 = {v: r["tgt_k"]["6"]["loss"]["0.9"] for v, r in rs.items()}
            seeds = len(rs[STALE_GRID[0]]["test_loss_per_seed"]["0.9"])
            oracle, pick = min(test, key=test.get), min(k6, key=k6.get)
            rows.append(dict(held=h, year=Y, test=test, k6=k6, oracle=oracle, pick=pick,
                             regret={v: test[v] - test[oracle] for v in STALE_GRID},
                             pick_regret=test[pick] - test[oracle],
                             pick_per_seed=[min(STALE_GRID, key=lambda v: rs[v]["tgt_k"]["6"]["loss_per_seed"]["0.9"][s])
                                            for s in range(seeds)],
                             nc4_minus_nc5_per_seed=[a - b for a, b in zip(rs["cpin_es3_nc4"]["test_loss_per_seed"]["0.9"],
                                                                           rs["cpin_es3_nc5"]["test_loss_per_seed"]["0.9"])],
                             nc4_minus_nc3_per_seed=[a - b for a, b in zip(rs["cpin_es3_nc4"]["test_loss_per_seed"]["0.9"],
                                                                           rs["cpin_es3_nc3"]["test_loss_per_seed"]["0.9"])],
                             k6_size=dict(n=rs["cpin_es3_nc4"]["tgt_k"]["6"]["n"], n_open=rs["cpin_es3_nc4"]["tgt_k"]["6"]["n_open"]),
                             k6_size_ref=dict(n=rs["cpin_es3_nc3"]["tgt_k"]["6"]["n"], n_open=rs["cpin_es3_nc3"]["tgt_k"]["6"]["n_open"])))
    return rows


def grid_score(rows):
    """Session 103's predictions G1 to G4 from grid rows (G0 needs the saved rows, see grid_summary)."""
    m = lambda xs: float(np.mean(xs)) if xs else None  # noqa: E731
    late = [r for r in rows if r["year"] not in EARLY_YEARS]
    fixed_late = {v: m([r["test"][v] for r in late]) for v in STALE_GRID}
    fixed_regret = {v: m([r["regret"][v] for r in rows]) for v in STALE_GRID}
    chooser_regret = m([r["pick_regret"] for r in rows])
    near = sum(r["regret"]["cpin_es3_nc4"] <= 1.0 for r in rows)
    full = len(rows) == 12 and len(late) == 8
    pred = dict(G1=full and fixed_late["cpin_es3_nc4"] < min(fixed_late["cpin_es3_nc3"], fixed_late["cpin_es3_nc5"]),
                G2=full and min(fixed_regret, key=fixed_regret.get) == "cpin_es3_nc4",
                G3=full and near >= 10,
                G4=full and chooser_regret < fixed_regret["cpin_es3_nc4"])
    return dict(n=len(rows), n_late=len(late), fixed_mean_late=fixed_late, fixed_mean_all={
                    v: m([r["test"][v] for r in rows]) for v in STALE_GRID}, fixed_regret=fixed_regret,
                chooser_regret=chooser_regret, chooser_hits=sum(r["pick"] == r["oracle"] for r in rows),
                chooser_picks={v: sum(r["pick"] == v for r in rows) for v in STALE_GRID},
                oracle_counts={v: sum(r["oracle"] == v for r in rows) for v in STALE_GRID},
                nc4_within_1day=near, oracle_mean_all=m([r["test"][r["oracle"]] for r in rows]),
                # post hoc (not pre-registered): worst case and how often each cut is the worst of the three
                max_regret_post_hoc={v: max((r["regret"][v] for r in rows), default=None) for v in STALE_GRID},
                chooser_max_regret_post_hoc=max((r["pick_regret"] for r in rows), default=None),
                worst_counts_post_hoc={v: sum(max(r["test"], key=r["test"].get) == v for r in rows) for v in STALE_GRID},
                predictions=pred)


def grid_summary(path, rows_dir, oos_path, early_path, held=("sf", "seattle")):
    """Session 103 (LOG.md): G0 checks the saved nc4 rows against the JSON and the target-cohort sizes against
    session 101's fits; G1 to G4 from grid_score."""
    R = json.load(open(path))
    rows = grid_rows(R, json.load(open(oos_path)), json.load(open(early_path)), held)
    chk = []
    for h in held:
        for Y in NEW_YEARS + OLD_YEARS:
            r = R.get(f"{h} {Y} cpin_es3_nc4")
            f = os.path.join(rows_dir, f"{h}_{Y}_cpin_es3_nc4.npz") if rows_dir else ""
            if r is None or not os.path.exists(f):
                chk.append(float("inf"))
                continue
            z = np.load(f)
            done = ~z["k6_open"]
            chk.append(max(abs(row_loss(z["test_y"], z["test_pred"]).mean() - r["test_loss"]["0.9"]),
                           abs(row_loss(z["k6_y"][done], z["k6_pred"][:, done]).mean() - r["tgt_k"]["6"]["loss"]["0.9"])))
    s = grid_score(rows)
    s["predictions"] = dict(G0=bool(chk) and bool(max(chk) < 1e-3) and all(
        r["k6_size"] == r["k6_size_ref"] for r in rows if r["year"] not in EARLY_YEARS), **s["predictions"])
    s["rows_check_max_abs"] = float(max(chk)) if chk else None
    s["note"] = ("session 103: cascade2 transfer model, q0.9 mean pinball loss over 3 seeds on completed test rows "
                 "(days); grid = staleness cuts 3, 4, 5 years; oracle = best grid member on the test year; chooser = "
                 "lowest q0.9 pinball on the target's own Y-6 permits completed by D = 1 January Y")
    s["cells"] = rows
    return s


RECENT = "cpin_es3_ncr"
ALL_YEARS = (2017, 2018, 2019, 2020, 2021, 2022)


def recent_score(R, grid, held=("sf", "seattle"), years=ALL_YEARS, nc4_mean_regret=0.78, nc4_max_regret=2.31,
                 variant=RECENT):
    """Session 104 (LOG.md): ncr's test q0.9 against the grid {nc3, nc4, nc5} per cell (from session 103's
    _grid.json cells). Regret = ncr minus the grid oracle (negative when ncr beats every grid cut).
    N1 to N4 as pre-registered; N0 (the rows check) is added by recent_summary."""
    G = {(c["held"], c["year"]): c for c in grid["cells"]}
    cells = []
    for h in held:
        for Y in years:
            r, g = R.get(f"{h} {Y} {variant}"), G.get((h, Y))
            if r is None or g is None:
                continue
            t = r["test_loss"]["0.9"]
            orc = min(g["test"].values())
            cells.append(dict(held=h, year=Y, ncr=t, grid=g["test"], oracle=g["oracle"], regret=t - orc,
                              regret_vs={k: t - v for k, v in g["test"].items()},
                              thresholds=r.get("stale_threshold_days")))
    n = len(cells)
    full = n == len(held) * len(years)
    reg = [c["regret"] for c in cells]
    mean_reg = float(np.mean(reg)) if reg else float("nan")
    se = [c for c in cells if c["held"] == "seattle" and c["thresholds"]]
    th = lambda ys: [np.mean(list(c["thresholds"].values())) for c in se if c["year"] in ys]  # noqa: E731
    late, early = th((2020, 2021, 2022)), th((2017, 2018, 2019))
    grid_means = {k: float(np.mean([c["grid"][k] for c in cells])) for k in (cells[0]["grid"] if cells else {})}
    return dict(
        n=n, mean_regret=mean_reg, within_1day=sum(x <= 1.0 for x in reg), max_regret=max(reg) if reg else None,
        ncr_mean=float(np.mean([c["ncr"] for c in cells])) if cells else None, grid_means=grid_means,
        seattle_threshold_late=float(np.mean(late)) if late else None,
        seattle_threshold_early=float(np.mean(early)) if early else None,
        beats_grid=sum(x < 0 for x in reg),
        predictions=dict(N1=bool(full and mean_reg < nc4_mean_regret),
                         N2=bool(full and sum(x <= 1.0 for x in reg) >= 10),
                         N3=bool(full and max(reg) <= nc4_max_regret),
                         N4=bool(late and early and float(np.mean(late)) > float(np.mean(early)))),
        cells=cells)


def recent_summary(path, rows_dir, grid_path, share_path=None, held=("sf", "seattle")):
    """Session 104: recent_score plus N0, the saved ncr rows against the JSON's means and, with share_path
    (results/open_share_i2c.json, src/open_share.py), the fits' thresholds against the ones recomputed there."""
    R = json.load(open(path))
    s = recent_score(R, json.load(open(grid_path)), held)
    thr_chk = []
    if share_path and os.path.exists(share_path):
        S = json.load(open(share_path))
        thr_chk = [abs(v - S[c][str(cl["year"])]["recent_threshold"]) for cl in s["cells"]
                   for c, v in (cl["thresholds"] or {}).items()]
    s["threshold_check_max_abs"] = float(max(thr_chk)) if thr_chk else None
    chk = []
    for c in s["cells"]:
        f = os.path.join(rows_dir, f"{c['held']}_{c['year']}_{RECENT}.npz") if rows_dir else ""
        if not os.path.exists(f):
            chk.append(float("inf"))
            continue
        z = np.load(f)
        chk.append(abs(row_loss(z["test_y"], z["test_pred"]).mean() - c["ncr"]))
    s["rows_check_max_abs"] = float(max(chk)) if chk else None
    s["predictions"] = dict(N0=bool(chk and max(chk) < 1e-3 and thr_chk and max(thr_chk) < 1e-6), **s["predictions"])
    s["note"] = ("session 104: cascade2 transfer model, q0.9 mean pinball loss over 3 seeds on completed test rows "
                 "(days); ncr = per-source cut at the 0.99 quantile of builds completed in the 3 years before D; "
                 "grid = staleness cuts 3, 4, 5 years (sessions 101 to 103's fits); regret = ncr minus grid oracle")
    return s


ROBUST = ("cpin_es3_ncr95", "cpin_es3_ncrd")


def robust_summary(path, rows_dir, grid_path, cut_path=None, held=("sf", "seattle"), sweep=(2018, 2019, 2020),
                   six_years=2191):
    """Session 105 (LOG.md): the two robust per-source cuts against the {3, 4, 5}-year grid, as session 104 scored
    ncr. M0: saved rows reproduce the JSON means and the fits' thresholds equal src/robust_cut.py's (cut_path).
    M1/M2: ncr95's / ncrd's pooled mean regret below nc4's 0.78. M3: each one's worst-cell regret at most nc4's
    2.31 (M3a ncr95, M3b ncrd). M4: with SF held out, Seattle's source threshold in 2018 to 2020 is under 6 years
    for both variants (the 2017 sweep no longer sets the cut)."""
    R = json.load(open(path))
    grid = json.load(open(grid_path))
    C = json.load(open(cut_path)) if cut_path and os.path.exists(cut_path) else None
    out, chk, thr_chk = {}, [], []
    for v in ROBUST:
        s = recent_score(R, grid, held, variant=v)
        for c in s["cells"]:
            f = os.path.join(rows_dir, f"{c['held']}_{c['year']}_{v}.npz") if rows_dir else ""
            if not os.path.exists(f):
                chk.append(float("inf"))
            else:
                z = np.load(f)
                chk.append(abs(row_loss(z["test_y"], z["test_pred"]).mean() - c["ncr"]))
            if C is not None:
                thr_chk += [abs(t - C[city][str(c["year"])][v]) for city, t in (c["thresholds"] or {}).items()]
        s.pop("predictions")
        out[v] = s
    full = lambda v: out[v]["n"] == len(held) * len(ALL_YEARS)  # noqa: E731
    sea = lambda v: [c["thresholds"]["seattle"] for c in out[v]["cells"]  # noqa: E731
                     if c["held"] == "sf" and c["year"] in sweep and c["thresholds"]]
    a, b = ROBUST
    res = dict(variants=out, rows_check_max_abs=float(max(chk)) if chk else None,
               threshold_check_max_abs=float(max(thr_chk)) if thr_chk else None,
               seattle_sweep_thresholds={v: sea(v) for v in ROBUST})
    res["predictions"] = dict(
        M0=bool(chk and max(chk) < 1e-3 and thr_chk and max(thr_chk) < 1e-6),
        M1=bool(full(a) and out[a]["mean_regret"] < 0.78), M2=bool(full(b) and out[b]["mean_regret"] < 0.78),
        M3a=bool(full(a) and out[a]["max_regret"] <= 2.31), M3b=bool(full(b) and out[b]["max_regret"] <= 2.31),
        M4=bool(all(len(sea(v)) == len(sweep) and max(sea(v)) < six_years for v in ROBUST)))
    res["note"] = ("session 105: cascade2 transfer model, q0.9 mean pinball loss over 3 seeds on completed test rows "
                   "(days); ncr95 = per-source cut at the 0.95 quantile of builds completed in the 3 years before D; "
                   "ncrd = the 0.99 quantile after dropping completion days that closed more than 10 permits issued "
                   "over 8 years earlier; grid = staleness cuts 3, 4, 5 years (sessions 101 to 103); regret = "
                   "variant minus grid oracle")
    return res


AUSTIN_VARIANTS = STALE_GRID + ("cpin_es3_ncrd",)  # session 106


def austin_summary(path, rows_dir, grid_path, cut_path=None, years=ALL_YEARS, nc4_max_regret_12=2.31):
    """Session 106 (LOG.md): Austin as target (sources SF and Seattle), Y = 2017 to 2022, at the {3, 4, 5}-year grid
    and session 105's ncrd. Pooled with the 12 SF/Seattle grid cells of session 103 (grid_path) for 18 cells.
    A0: saved rows reproduce the JSON means within 0.001 and ncrd's SF/Seattle source thresholds equal
    src/robust_cut.py's (cut_path) within 1e-6. A1: nc3 is the grid oracle in at least 5 of the 6 Austin cells.
    A2: fixed nc4's mean Austin regret exceeds 2.31 days (its worst SF/Seattle cell). A3: pooled over 18 cells nc3
    has the lowest mean regret of the three fixed cuts. A4: ncrd's mean Austin regret is at least nc4's.
    A5: the k6 chooser over the grid picks nc3 in at least 5 of 6 Austin cells and its 18-cell mean regret is below
    every fixed cut's."""
    R = json.load(open(path))
    grid = json.load(open(grid_path))
    C = json.load(open(cut_path)) if cut_path and os.path.exists(cut_path) else None
    m = lambda xs: float(np.mean(xs)) if xs else None  # noqa: E731
    cells, chk, thr = [], [], []
    for Y in years:
        rs = {v: R.get(f"austin {Y} {v}") for v in AUSTIN_VARIANTS}
        for v, r in rs.items():
            f = os.path.join(rows_dir, f"austin_{Y}_{v}.npz") if rows_dir else ""
            if r is None or not os.path.exists(f):
                chk.append(float("inf"))
                continue
            z = np.load(f)
            chk.append(abs(row_loss(z["test_y"], z["test_pred"]).mean() - r["test_loss"]["0.9"]))
        r = rs["cpin_es3_ncrd"]
        if C is not None and r is not None:
            thr += [abs(t - C[city][str(Y)]["cpin_es3_ncrd"]) for city, t in (r.get("stale_threshold_days") or {}).items()]
        if not all(rs[v] for v in STALE_GRID):
            continue
        test = {v: rs[v]["test_loss"]["0.9"] for v in STALE_GRID}
        k6 = {v: rs[v]["tgt_k"]["6"]["loss"]["0.9"] for v in STALE_GRID}
        oracle, pick = min(test, key=test.get), min(k6, key=k6.get)
        c = dict(held="austin", year=Y, test=test, k6=k6, oracle=oracle, pick=pick,
                 regret={v: test[v] - test[oracle] for v in STALE_GRID}, pick_regret=test[pick] - test[oracle],
                 k6_size=dict(n=rs["cpin_es3_nc4"]["tgt_k"]["6"]["n"], n_open=rs["cpin_es3_nc4"]["tgt_k"]["6"]["n_open"]))
        if r is not None:
            c["ncrd"] = r["test_loss"]["0.9"]
            c["ncrd_regret"] = c["ncrd"] - test[oracle]
            c["ncrd_thresholds"] = r.get("stale_threshold_days")
        cells.append(c)
    both = cells + list(grid["cells"])
    fx_a = {v: m([c["regret"][v] for c in cells]) for v in STALE_GRID}
    fx_18 = {v: m([c["regret"][v] for c in both]) for v in STALE_GRID}
    ch_a, ch_18 = m([c["pick_regret"] for c in cells]), m([c["pick_regret"] for c in both])
    nd = [c["ncrd_regret"] for c in cells if "ncrd_regret" in c]
    full = len(cells) == len(years) and len(both) == len(years) + 12
    res = dict(n_austin=len(cells), n_pooled=len(both), austin_fixed_mean={v: m([c["test"][v] for c in cells])
               for v in STALE_GRID}, austin_fixed_regret=fx_a, pooled_fixed_regret=fx_18,
               austin_chooser_regret=ch_a, pooled_chooser_regret=ch_18,
               austin_oracle_counts={v: sum(c["oracle"] == v for c in cells) for v in STALE_GRID},
               austin_chooser_picks={v: sum(c["pick"] == v for c in cells) for v in STALE_GRID},
               austin_ncrd_regret=m(nd), austin_ncrd_mean=m([c["ncrd"] for c in cells if "ncrd" in c]),
               rows_check_max_abs=float(max(chk)) if chk else None,
               threshold_check_max_abs=float(max(thr)) if thr else None,
               # post hoc (not pre-registered): worst cell per fixed cut over the 18 cells
               pooled_max_regret_post_hoc={v: max((c["regret"][v] for c in both), default=None) for v in STALE_GRID},
               pooled_chooser_max_regret_post_hoc=max((c["pick_regret"] for c in both), default=None))
    res["predictions"] = dict(
        A0=bool(chk and max(chk) < 1e-3 and thr and max(thr) < 1e-6),
        A1=bool(full and res["austin_oracle_counts"]["cpin_es3_nc3"] >= 5),
        A2=bool(full and fx_a["cpin_es3_nc4"] > nc4_max_regret_12),
        A3=bool(full and min(fx_18, key=fx_18.get) == "cpin_es3_nc3"),
        A4=bool(full and len(nd) == len(years) and m(nd) >= fx_a["cpin_es3_nc4"]),
        A5=bool(full and res["austin_chooser_picks"]["cpin_es3_nc3"] >= 5 and ch_18 < min(fx_18.values())))
    res["note"] = ("session 106: cascade2 transfer model, q0.9 mean pinball loss over 3 seeds on completed test rows "
                   "(days); Austin held out, sources SF and Seattle; grid = staleness cuts 3, 4, 5 years; oracle = "
                   "best grid member on the test year; chooser = lowest q0.9 pinball on the target's own Y-6 permits "
                   "completed by D; pooled = these 6 cells plus session 103's 12 SF/Seattle cells")
    res["cells"] = cells
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("results")
    ap.add_argument("rows_dir")
    ap.add_argument("--prior", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results",
                                                     "rounds_score_tfol_i2c.json"))
    ap.add_argument("--early", action="store_true", help="session 102: test years 2017 and 2018 (early_summary)")
    ap.add_argument("--grid", action="store_true", help="session 103: the {3, 4, 5}-year grid (grid_summary)")
    ap.add_argument("--recent", action="store_true", help="session 104: cpin_es3_ncr against the grid")
    ap.add_argument("--robust", action="store_true", help="session 105: cpin_es3_ncr95 and _ncrd against the grid")
    ap.add_argument("--austin", action="store_true", help="session 106: Austin as target at the grid and ncrd")
    a = ap.parse_args()
    if a.austin:
        rd = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results")
        s = austin_summary(a.results, a.rows_dir, os.path.join(rd, "rounds_score_grid_i2c_grid.json"),
                           os.path.join(rd, "robust_cut_i2c.json"))
        json.dump(s, open(a.results.replace(".json", "_austin.json"), "w"), indent=1)
        print(json.dumps({k: v for k, v in s.items() if k not in ("cells", "note")}, indent=1))
        for c in s["cells"]:
            print(c["year"], {k[8:]: round(x, 2) for k, x in c["test"].items()}, "ncrd", round(c.get("ncrd", float("nan")), 2),
                  "oracle", c["oracle"][8:], "pick", c["pick"][8:], "thr", c.get("ncrd_thresholds"))
        sys.exit(0)
    if a.robust:
        rd = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results")
        s = robust_summary(a.results, a.rows_dir, os.path.join(rd, "rounds_score_grid_i2c_grid.json"),
                           os.path.join(rd, "robust_cut_i2c.json"))
        json.dump(s, open(a.results.replace(".json", "_robust.json"), "w"), indent=1)
        print(json.dumps({k: v for k, v in s.items() if k not in ("variants", "note")}, indent=1))
        for v, o in s["variants"].items():
            print(v, {k: o[k] for k in ("mean_regret", "within_1day", "max_regret", "ncr_mean", "beats_grid")})
            for c in o["cells"]:
                print(" ", c["held"], c["year"], round(c["ncr"], 2), {k[8:]: round(x, 2) for k, x in c["grid"].items()},
                      "regret", round(c["regret"], 2), "thr", {k: round(x) for k, x in (c["thresholds"] or {}).items()})
        sys.exit(0)
    if a.recent:
        rd = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results")
        s = recent_summary(a.results, a.rows_dir, os.path.join(rd, "rounds_score_grid_i2c_grid.json"),
                           os.path.join(rd, "open_share_i2c.json"))
        json.dump(s, open(a.results.replace(".json", "_recent.json"), "w"), indent=1)
        print(json.dumps({k: v for k, v in s.items() if k not in ("cells", "note")}, indent=1))
        for c in s["cells"]:
            print(c["held"], c["year"], "ncr", round(c["ncr"], 2), {k[8:]: round(v, 2) for k, v in c["grid"].items()},
                  "regret", round(c["regret"], 2), "thr", {k: round(v) for k, v in (c["thresholds"] or {}).items()})
        sys.exit(0)
    if a.grid:
        rd = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results")
        s = grid_summary(a.results, a.rows_dir, os.path.join(rd, "rounds_score_oos_i2c.json"),
                         os.path.join(rd, "rounds_score_early_i2c.json"))
        json.dump(s, open(a.results.replace(".json", "_grid.json"), "w"), indent=1)
        print(json.dumps({k: v for k, v in s.items() if k not in ("cells", "note")}, indent=1))
        for c in s["cells"]:
            print(c["held"], c["year"], {k[8:]: round(v, 2) for k, v in c["test"].items()}, "oracle", c["oracle"][8:],
                  "pick", c["pick"][8:], round(c["pick_regret"], 2), "k6", {k[8:]: round(v, 2) for k, v in c["k6"].items()},
                  c["pick_per_seed"], "nc4-nc5 seeds", [round(x, 2) for x in c["nc4_minus_nc5_per_seed"]])
        sys.exit(0)
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
