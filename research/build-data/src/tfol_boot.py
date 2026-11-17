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


def boot_pick(L, n_boot=B, seed=SEED):
    """L: {cand: per-row losses on the same rows}. Resample rows with replacement; return the share of resamples
    picking each candidate (lowest mean) and the 95% interval of nc5 minus nc3."""
    rng = np.random.default_rng(seed)
    n = len(next(iter(L.values())))
    M = np.stack([L[c] for c in CANDS])
    picks = np.zeros(len(CANDS))
    d53 = np.empty(n_boot)
    for b in range(n_boot):
        i = rng.integers(0, n, n)
        m = M[:, i].mean(axis=1)
        picks[int(np.argmin(m))] += 1
        d53[b] = m[1] - m[0]
    share = dict(zip(CANDS, (picks / n_boot).tolist()))
    return share, [float(np.quantile(d53, 0.025)), float(np.quantile(d53, 0.975))]


def cell(R, rows_dir, h, Y):
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
                               for s in range(len(rs[CANDS[0]]["test_loss_per_seed"]["0.9"]))])


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


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("results")
    ap.add_argument("rows_dir")
    ap.add_argument("--prior", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results",
                                                     "rounds_score_tfol_i2c.json"))
    a = ap.parse_args()
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
