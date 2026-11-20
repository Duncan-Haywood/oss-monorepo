"""Milestone 155: does the mapped rung's delay rank agreement (tauD) explain where the clipped ladder SWC(1.25) loses to equal-cost
random routing better than the share of points where the clip binds? A replay on every unit with per-point rows: 223 units, 92 at
ff_n40C_1v95 and 131 at tt_025C_1v80. No flow run.

Usage: python3 analyse.py [out.txt]

Why: milestone 154's "Next". On 13 designs run at both corners, the full-pool Kendall tau-b of mapped against routed delay (tauD)
tracked SWC's edge over random (Spearman -0.58), and mapped area did not (+0.04). Milestone 150 found, on 77 ff designs, that SWC
loses where the clip does not bind (median share 0.04 on losers against 0.49). The two readings fit one mechanism: where the clip
binds, r2c scores a point on mapped area, which ranks routed area well everywhere; where it does not, r2c leans on mapped delay, and
then what matters is whether mapped delay ranks routed delay. This milestone tests that account on all 223 units, and asks whether a
routed pilot of 8 random points can read tauD well enough to see losers.

Pool: alpha_corner.units() (milestones 144 to 147 at ff, 77 designs; H52, B24, B42 at tt, 118 cells), milestone 152's 15 fresh ff
designs and milestone 153's 13 tt runs: 223 units. Rows: status "ok" points of each unit's own table (checked against the cell's n).
Ladder branch: routed/r2 > theta = 3 (below it SWC is random routing, d = 0 by construction); every statistic below uses ladder-branch
units only unless it says otherwise.
Quantities per unit:
  d       SWC(1.25) - random regret, points (published cells, unchanged);
  loser   d > 0;
  share   share of points where the clip binds at 1.25 (cell "binds": 1.25 x mapped delay < period);
  tauD    full-pool tau-b of mapped delay (period - synth_netlist_wns) against routed delay (period - final_wns);
  tauA    full-pool tau-b of mapped area (synth_netlist_area) against routed area (final_area_notap);
  pD      routed-pilot tauD: mean over 200 draws of tau-b on 8 uniformly drawn points (a constant score counts 0), seed "m155" + unit;
  cvD     coefficient of variation of mapped delay over the pool (a pre-route proxy).
AUC for losers: P(feature of a loser < feature of a non-loser), ties 1/2 (low share, low tauD, low pD, low tauA, low cvD flag a
loser). Interval: cluster bootstrap over bare design names (a design's units at both corners, or in two tables, resampled together),
2,000 resamples, seed 155. "Low-share" units: share < 0.2; "high-share": share >= 0.2.

Predictions, written here and committed before the script first ran:
 (1) PRIMARY: over ladder-branch units, AUC(tauD) - AUC(share) > 0 and its 95% interval excludes 0 (tauD separates losers better
     than clip share does). Prior 30%.
 (2) interaction: Spearman of tauD against d is more negative on low-share units than on high-share units. Prior 65%.
 (3) AUC(tauD) >= 0.70 over ladder-branch units. Prior 50%.
 (4) AUC(tauA) < 0.60 (the area half carries no loser information). Prior 65%.
 (5) AUC(pD) >= 0.65 (a routed pilot of 8 points reads enough of tauD to see losers). Prior 35%.
 (6) AUC(cvD) < 0.65 (the spread of mapped delay is not a usable pre-route proxy). Prior 60%.
 (7) the joint flag "share < 0.2 and tauD < 0.2" (an oracle: tauD needs every point routed) catches at least half the losers, with
     fewer non-losers than losers flagged. Prior 40%.
Reported, not predicted: per-corner AUCs and Spearmans, the per-unit table, and the regret of switching flagged units to area-only
ranking (SWC(0), alpha -> 0) under the joint oracle flag and under its pilot version (pD in place of tauD).
"""
import importlib.util
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 155
BOOT = 2000
DRAWS = 200
PILOT = 8
ALPHA = 1.25
SHARE_CUT = 0.2
TAU_CUT = 0.2


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


m153 = _sibling(EXP / "addshort_tt" / "analyse.py", "verified_dse_m155_m153")
m152, ac = m153.m152, m153.ac
tau_b = _sibling(EXP / "ladder_diagnosis" / "analyse.py", "verified_dse_m155_diag").tau_b
THETA = ac.THETA


def mdelay(r):
    return r["period_ns"] - r["synth_netlist_wns"]


def rdelay(r):
    return r["period_ns"] - r["final_wns"]


def tau0(x, y):
    t = tau_b(x, y)
    return 0.0 if t is None else t


def tt_rows(cells):
    """Rows of each tt cell from its own table (H52 via the held-out replay loader)."""
    rule = ac.guard.rule
    held = rule.replay.load()
    cache = {}
    out = []
    for c in cells:
        k = (c["clock"], c["design"], c["table"])
        rs = held.get(k)
        if rs is None:
            if c["table"] not in cache:
                cache[c["table"]] = rule.load_table(EXP / c["table"] / "results.jsonl", c["table"])
            rs = cache[c["table"]].get(k)
        assert rs is not None and len(rs) == c["n"], k
        out.append(rs)
    return out


def units():
    us = ac.units()
    tt = [u for u in us if u["corner"] == "tt"]
    for u, rs in zip(tt, tt_rows([u["cell"] for u in tt])):
        u["rows"] = rs
    fu, _ = m152.fresh_units()
    tu, _ = m153.tt_units()
    ok = [r for r in m153.rows() if r["status"] == "ok"]
    for u in tu:
        u["rows"] = [r for r in ok if r["design"] == u["name"]]
        assert len(u["rows"]) == u["cell"]["n"], u["design"]
    allu = us + fu + tu
    for u in allu:
        u["name"] = u.get("name") or u["design"].split(":", 1)[1]
    return allu


def pilot_tau(rs, seed):
    rng = random.Random(seed)
    idx = list(range(len(rs)))
    v = []
    for _ in range(DRAWS):
        s = rng.sample(idx, PILOT)
        v.append(tau0([mdelay(rs[i]) for i in s], [rdelay(rs[i]) for i in s]))
    return v


def features(u):
    c, rs = u["cell"], u["rows"]
    md = [mdelay(r) for r in rs]
    f = {"d": ac.swc(c, ALPHA) - c["rand"], "share": c["binds"],
            "tauD": tau0(md, [rdelay(r) for r in rs]),
            "tauA": tau0([r["synth_netlist_area"] for r in rs], [r["final_area_notap"] for r in rs]),
            "pDs": pilot_tau(rs, f"m155{u['corner']}{u['design']}"),
            "cvD": statistics.pstdev(md) / statistics.mean(md),
            "swc": ac.swc(c, ALPHA), "rand": c["rand"], "area": ac.swc(c, 0), "ratio": c["ratio"]}
    f["pD"] = statistics.mean(f["pDs"])
    return f


def auc(fs, k):
    lo = [f[k] for f in fs if f["d"] > 1e-9]
    hi = [f[k] for f in fs if f["d"] <= 1e-9]
    if not lo or not hi:
        return float("nan")
    s = sum(1.0 if a < b else 0.5 if a == b else 0.0 for a in lo for b in hi)
    return s / (len(lo) * len(hi))


def cluster_boot(fs, stat, seed=SEED, n=BOOT):
    groups = {}
    for f in fs:
        groups.setdefault(f["name"], []).append(f)
    keys = sorted(groups)
    rng = random.Random(seed)
    vals = []
    for _ in range(n):
        s = [f for k in (rng.choice(keys) for _ in keys) for f in groups[k]]
        v = stat(s)
        if v == v:
            vals.append(v)
    vals.sort()
    return vals[int(0.025 * len(vals))], vals[int(0.975 * len(vals)) - 1]


def rho(fs, k):
    if len(fs) < 3:
        return float("nan")
    return m153.spearman([f[k] for f in fs], [f["d"] for f in fs])


def flagged(f, key):
    return f["share"] < SHARE_CUT and f[key] < TAU_CUT


def main(dst):
    allu = units()
    fs = []
    for u in allu:
        f = features(u)
        f.update(corner=u["corner"], fold=u["fold"], design=u["design"], name=u["name"])
        fs.append(f)
    lad = [f for f in fs if f["ratio"] > THETA]
    nl = sum(f["d"] > 1e-9 for f in lad)
    out = ["# Milestone 155: mapped delay rank agreement against clip share as the account of the ladder's losses (replay, 223 units)",
           "", f"alpha = {ALPHA}; theta = {THETA}; pilot {PILOT} points x {DRAWS} draws; cluster bootstrap {BOOT}, seed {SEED}; "
           f"share cut {SHARE_CUT}, tau cut {TAU_CUT}", "",
           f"units: {len(fs)} (ff {sum(f['corner'] == 'ff' for f in fs)}, tt {sum(f['corner'] == 'tt' for f in fs)}); "
           f"ladder branch {len(lad)} (ff {sum(f['corner'] == 'ff' for f in lad)}, tt {sum(f['corner'] == 'tt' for f in lad)}); "
           f"losers {nl}; design clusters {len({f['name'] for f in lad})}", "",
           "## Per unit (ladder branch)", "",
           "unit | corner | d | share | tauD | tauA | pD | cvD | SWC % | random % | area-only %"]
    for f in sorted(lad, key=lambda f: -f["d"]):
        out.append(f"{f['design']} | {f['corner']} | {f['d']:+.2f} | {f['share']:.2f} | {f['tauD']:.3f} | {f['tauA']:.3f} | "
                   f"{f['pD']:.3f} | {f['cvD']:.4f} | {f['swc']:.2f} | {f['rand']:.2f} | {f['area']:.2f}")
    out += ["", "## Loser AUCs (low value flags a loser) and Spearman against d", "",
            "feature | AUC all | 95% interval | AUC ff | AUC tt | Spearman all | ff | tt"]
    ff, tt = [f for f in lad if f["corner"] == "ff"], [f for f in lad if f["corner"] == "tt"]
    a = {}
    for k in ("share", "tauD", "tauA", "pD", "cvD"):
        a[k] = auc(lad, k)
        lo, hi = cluster_boot(lad, lambda s, k=k: auc(s, k))
        out.append(f"{k} | {a[k]:.3f} | {lo:.3f} to {hi:.3f} | {auc(ff, k):.3f} | {auc(tt, k):.3f} | {rho(lad, k):+.3f} | "
                   f"{rho(ff, k):+.3f} | {rho(tt, k):+.3f}")
    diff = a["tauD"] - a["share"]
    dlo, dhi = cluster_boot(lad, lambda s: auc(s, "tauD") - auc(s, "share"))
    low = [f for f in lad if f["share"] < SHARE_CUT]
    high = [f for f in lad if f["share"] >= SHARE_CUT]
    rl, rh = rho(low, "tauD"), rho(high, "tauD")
    out += ["", f"low-share units {len(low)} ({sum(f['d'] > 1e-9 for f in low)} losers); high-share {len(high)} "
            f"({sum(f['d'] > 1e-9 for f in high)} losers)", ""]
    out.append(f"(1) PRIMARY AUC(tauD) - AUC(share) = {diff:+.3f}, interval {dlo:+.3f} to {dhi:+.3f}: "
               f"{'held' if diff > 0 and dlo > 0 else 'refuted'}")
    out.append(f"(2) Spearman tauD vs d: low-share {rl:+.3f}, high-share {rh:+.3f}: {'held' if rl < rh else 'refuted'}")
    out.append(f"(3) AUC(tauD) = {a['tauD']:.3f}: {'held' if a['tauD'] >= 0.70 else 'refuted'}")
    out.append(f"(4) AUC(tauA) = {a['tauA']:.3f}: {'held' if a['tauA'] < 0.60 else 'refuted'}")
    out.append(f"(5) AUC(pD) = {a['pD']:.3f}: {'held' if a['pD'] >= 0.65 else 'refuted'}")
    out.append(f"(6) AUC(cvD) = {a['cvD']:.3f}: {'held' if a['cvD'] < 0.65 else 'refuted'}")
    fl = [f for f in lad if flagged(f, "tauD")]
    hit, fa = sum(f["d"] > 1e-9 for f in fl), sum(f["d"] <= 1e-9 for f in fl)
    out.append(f"(7) joint oracle flag (share < {SHARE_CUT}, tauD < {TAU_CUT}): {hit} of {nl} losers, {fa} non-losers: "
               f"{'held' if 2 * hit >= nl and fa < hit else 'refuted'}")
    out += ["", "## Reported, not predicted", "", "rule | flagged | losers flagged | mean regret % over ladder branch | over all 223"]
    off = [f for f in fs if f["ratio"] <= THETA]

    def mean_rule(pick):
        v = [pick(f) for f in lad]
        return statistics.mean(v), statistics.mean(v + [f["swc"] for f in off])

    for label, pick, n_, h_ in (
            ("SWC(1.25)", lambda f: f["swc"], 0, 0),
            ("area-only always", lambda f: f["area"], len(lad), nl),
            ("random always", lambda f: f["rand"], len(lad), nl),
            ("oracle flag -> area-only", lambda f: f["area"] if flagged(f, "tauD") else f["swc"], len(fl), hit),
            ("pilot flag -> area-only", lambda f: f["area"] if flagged(f, "pD") else f["swc"],
             sum(flagged(f, "pD") for f in lad), sum(flagged(f, "pD") and f["d"] > 1e-9 for f in lad))):
        m1, m2 = mean_rule(pick)
        out.append(f"{label} | {n_} | {h_} | {m1:.2f} | {m2:.2f}")
    out.append("(the pilot flag is not priced: its 8 routed points are not charged against SWC's budget, so it is an upper bound)")
    out += ["", "median by group | share | tauD | tauA | pD", ]
    for label, g in (("losers", [f for f in lad if f["d"] > 1e-9]), ("non-losers", [f for f in lad if f["d"] <= 1e-9])):
        out.append(f"{label} ({len(g)}) | " + " | ".join(f"{statistics.median(f[k] for f in g):.3f}" for k in ("share", "tauD", "tauA", "pD")))
    out += post_hoc(lad, fs)
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


def post_hoc(lad, fs):
    """Post hoc, added after the first run (no predicted number changes): prediction (5) and the pilot flag used pD, the mean over
    200 draws, which no single run observes. Here each draw is one realisable pilot: the AUC of a single draw's tau-b, averaged over
    draws, and the single-draw flag's regret averaged over draws, with the pilot's 8 routed points still not charged."""
    nl = sum(f["d"] > 1e-9 for f in lad)
    off = [f for f in fs if f["ratio"] <= THETA]
    aucs, regs, hits, fas = [], [], [], []
    for j in range(DRAWS):
        g = [dict(d=f["d"], p=f["pDs"][j]) for f in lad]
        aucs.append(auc(g, "p"))
        fl = [f["share"] < SHARE_CUT and f["pDs"][j] < TAU_CUT for f in lad]
        regs.append(statistics.mean([f["area"] if x else f["swc"] for f, x in zip(lad, fl)]))
        hits.append(sum(x and f["d"] > 1e-9 for f, x in zip(lad, fl)))
        fas.append(sum(x and f["d"] <= 1e-9 for f, x in zip(lad, fl)))
    aucs.sort()
    return ["", "## Post hoc: one pilot draw at a time (added after the first run; no predicted number changed)", "",
            f"single-draw pilot AUC: mean {statistics.mean(aucs):.3f}, 2.5% to 97.5% over draws {aucs[int(0.025 * DRAWS)]:.3f} to "
            f"{aucs[int(0.975 * DRAWS) - 1]:.3f}",
            f"single-draw flag (share < {SHARE_CUT}, pilot tau < {TAU_CUT}) -> area-only: mean regret over the ladder branch "
            f"{statistics.mean(regs):.2f}% (SWC {statistics.mean(f['swc'] for f in lad):.2f}%); mean losers flagged "
            f"{statistics.mean(hits):.1f} of {nl}, non-losers {statistics.mean(fas):.1f}"]


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
