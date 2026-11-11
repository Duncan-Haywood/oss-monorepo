"""Milestone 111: can a rule fixed before any routing choose between "skip r1, keep 8" and random routing, and can a routed pilot
guard against a misleading mapped rung? Chosen on the 26 held-out designs, tested on the fresh pool. (no flow run; cached tables)

Usage: python3 rule.py [out.txt]

Milestone 110 found that skip-r1 (score every point at r2, route the best 8) beats random routing at equal wall-clock where a routed
point costs more than 3x an r2 score, and loses where routing is cheap, with a tail of cells (bcastmix192, barrel64, fanao96) where a
misleading r2 ranking sends it to a bad 8. Two fixes, both priced at exactly skip-r1's wall-clock B = n*r2 + 8*(r3 + r4) per cell:

  SW(theta): the cost-ratio switch. If routed/r2 > theta run skip-r1, else route k = floor(B / routed) uniformly drawn points.
             The ratio needs only stage times (one timed point), not routed scores.
  G(p, tau0): the pilot guard. Route p uniformly drawn points in full (p * routed), and compute Kendall tau-b of r2 against r4 on them.
             If tau-b >= tau0 (None, a constant rung, counts as 0): score the other n - p at r2 and route their best 8 - p
             (cost (n - p) * r2 + (8 - p) * (r3 + r4), so the total is exactly B). Otherwise route k - p more uniformly drawn points
             (total k, exactly random routing's count). tau0 = -1 never falls back: it prices the pilot alone.
  SWG(theta, p, tau0): SW, with G in place of skip-r1 above the threshold.

Grids: theta in {1.5, 2, 2.5, 3, 4, 5, 6, 8}; p in {3, 4, 6}; tau0 in {-1, 0, 0.2, 0.4}. Regret as milestone 105 (best routed point /
pool minimum - 1), 200 draws per cell. Parameters are chosen by mean regret on the 52 held-out cells (milestone 110's tables); the
out-of-sample estimate there is leave-one-design-out (both clocks of the left-out design, parameters chosen on the other 25). The test
set is the milestone 108 fresh pool (20 cells, ten small designs, 120 new sequences), which played no part in choosing theta, p or tau0.
The milestone 1 table (rung_bias, 20 cells) is reported as a second test with a caveat: milestone 106 chose skip-r1 on it.

Predictions, written in this file before the script was first run:
 (1) leave-one-design-out on the held-out cells, SW has lower mean regret than both skip-r1 (4.38%) and equal-cost random (2.31%);
 (2) on the fresh pool, SW with the held-out theta has mean regret within 0.3 points of the better of skip-r1 and equal-cost random
     (milestone 109: 1.04% and 1.26%; the small designs' routed/r2 ratios are low, so SW mostly picks random there);
 (3) on the held-out cells, the best G has a lower worst-cell regret than skip-r1 (49.85%);
 (4) on bcastmix192 (both clocks) the guard with the chosen (p, tau0) falls back to random in more than half of its draws;
 (5) leave-one-design-out, SWG has the lowest mean regret of skip-r1, random, SW, G and SWG;
 (6) on the fresh pool, SWG with the held-out parameters is within 0.3 points of the better of skip-r1 and equal-cost random.
"""
import itertools
import random
import statistics
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
sys.path.insert(0, str(EXP.parent / "src"))
sys.path.insert(0, str(EXP / "fresh_pool"))
sys.path.insert(0, str(EXP / "heldout_designs"))
from verified_dse import flow, stats  # noqa: E402
def _sibling(path, name):
    """Load a sibling experiment module by file path, so another experiment's module of the same name on sys.path cannot shadow it."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

_p = _sibling(EXP / "fresh_pool" / "price.py", "verified_dse_fresh_price")
replay = _sibling(EXP / "heldout_designs" / "replay.py", "verified_dse_heldout_replay")
costs, equal_k, sign_p, stage_times = _p.costs, _p.equal_k, _p.sign_p, _p.stage_times

DRAWS = 200
THETAS = (1.5, 2, 2.5, 3, 4, 5, 6, 8)
GUARDS = tuple(itertools.product((3, 4, 6), (-1, 0, 0.2, 0.4)))


def load_table(path, src):
    raw = defaultdict(list)
    for line in Path(path).read_text().splitlines():
        r = replay.json.loads(line)
        if r["status"] == "ok":
            raw[(r["tag"], r["design"], src)].append(r)
    return raw


def draw_regret(y, best, chosen):
    return min(y[i] for i in chosen) / best - 1


def skip_regret(sc, rng):
    """skip-r1 (n, 8, 8): rank all by r2 with random tie-breaks, top 8 go to r3 and are all routed."""
    y = [p["r4"] for p in sc]
    best, n = min(y), len(sc)
    tot = 0.0
    for _ in range(DRAWS):
        tb = [rng.random() for _ in range(n)]
        tot += draw_regret(y, best, sorted(range(n), key=lambda i: (sc[i]["r2"], tb[i]))[:8])
    return 100 * tot / DRAWS


def rand_regret(sc, k, rng):
    y = [p["r4"] for p in sc]
    best = min(y)
    return 100 * statistics.mean(draw_regret(y, best, rng.sample(range(len(y)), k)) for _ in range(DRAWS))


def guard_regret(sc, k, p, tau0, rng):
    """Mean regret (%) and fall-back share of G(p, tau0) at skip-r1's wall-clock; k is equal-cost random's count."""
    y = [q["r4"] for q in sc]
    r2 = [q["r2"] for q in sc]
    best, n = min(y), len(sc)
    tot = fell = 0.0
    for _ in range(DRAWS):
        pilot = rng.sample(range(n), p)
        tau = stats.kendall_tau_b([r2[i] for i in pilot], [y[i] for i in pilot])
        rest = [i for i in range(n) if i not in set(pilot)]
        if (0.0 if tau is None else tau) >= tau0:
            tb = {i: rng.random() for i in rest}
            chosen = pilot + sorted(rest, key=lambda i: (r2[i], tb[i]))[:8 - p]
        else:
            fell += 1
            chosen = pilot + rng.sample(rest, k - p)
        tot += draw_regret(y, best, chosen)
    return 100 * tot / DRAWS, fell / DRAWS


def cell(rs, seed):
    sc = [flow.scores(r) for r in rs]
    n = len(sc)
    t = stage_times(rs)
    cs, _, pp = costs(t, n)
    k = equal_k(cs, pp, n)
    rng = random.Random(seed)
    c = {"n": n, "ratio": pp / t["r2"], "k": k, "skip": skip_regret(sc, rng), "rand": rand_regret(sc, k, rng), "g": {}, "fell": {}}
    for p, tau0 in GUARDS:
        c["g"][(p, tau0)], c["fell"][(p, tau0)] = guard_regret(sc, k, p, tau0, rng)
    return c


def sw(c, theta):
    return c["skip"] if c["ratio"] > theta else c["rand"]


def swg(c, theta, g):
    return c["g"][g] if c["ratio"] > theta else c["rand"]


POLICIES = {
    "skip-r1": ([None], lambda c, a: c["skip"]),
    "random": ([None], lambda c, a: c["rand"]),
    "SW": (list(THETAS), sw),
    "G": (list(GUARDS), lambda c, g: c["g"][g]),
    "SWG": ([(th, g) for th in THETAS for g in GUARDS], lambda c, a: swg(c, a[0], a[1])),
}


def best_param(rows, name):
    grid, f = POLICIES[name]
    return min(grid, key=lambda a: (statistics.mean(f(c, a) for c in rows), str(a)))


def lodo(rows, name):
    f = POLICIES[name][1]
    out = []
    for d in sorted({c["design"] for c in rows}):
        a = best_param([c for c in rows if c["design"] != d], name)
        out += [f(c, a) for c in rows if c["design"] == d]
    return statistics.mean(out)


def build(raw, tagfn):
    rows = []
    for key in sorted(raw, key=lambda k: (k[2], k[1], k[0])):
        c = cell(raw[key], tagfn(key))
        c.update(clock=key[0], design=key[1], table=key[2])
        rows.append(c)
    return rows


def main(dst):
    held = build(replay.load(), lambda k: f"m111held{k[0]}{k[1]}{k[2]}")
    fresh = build(load_table(EXP / "fresh_pool" / "results.jsonl", "fresh_pool"), lambda k: f"m111fresh{k[0]}{k[1]}")
    old = build(load_table(EXP / "rung_bias" / "results.jsonl", "rung_bias"), lambda k: f"m111old{k[0]}{k[1]}")
    chosen = {name: best_param(held, name) for name in POLICIES}
    f = {name: POLICIES[name][1] for name in POLICIES}
    mean = lambda rows, name: statistics.mean(f[name](c, chosen[name]) for c in rows)
    out = ["# Milestone 111: a cost-ratio switch and a routed-pilot guard, chosen on 26 held-out designs, tested on the fresh pool "
           "(cached tables, no flow run)", "",
           "## Chosen parameters (mean regret on the 52 held-out cells)", ""]
    for name in POLICIES:
        out.append(f"{name}: {chosen[name]} -> in-sample {mean(held, name):.2f}%, leave-one-design-out {lodo(held, name):.2f}%")
    out += ["", "## Grids on the held-out cells (mean regret %, worst cell %)", ""]
    for th in THETAS:
        v = [sw(c, th) for c in held]
        out.append(f"SW theta={th:g}: {statistics.mean(v):.2f}, worst {max(v):.2f}, skip-r1 cells {sum(c['ratio'] > th for c in held)}")
    for g in GUARDS:
        v = [c["g"][g] for c in held]
        out.append(f"G p={g[0]} tau0={g[1]:g}: {statistics.mean(v):.2f}, worst {max(v):.2f}, "
                   f"mean fall-back share {statistics.mean(c['fell'][g] for c in held):.2f}")
    G, (TH, G2) = chosen["G"], chosen["SWG"]
    out += ["", "## Per cell, held-out (G and SWG at their chosen parameters)", "",
            "table | clock | design | routed/r2 | k | skip-r1 % | random % | SW % | G % | G fall-back | SWG %"]
    for c in held:
        out.append(f"{c['table']} | {c['clock']} | {c['design']} | {c['ratio']:.2f} | {c['k']} | {c['skip']:.2f} | {c['rand']:.2f} | "
                   f"{sw(c, chosen['SW']):.2f} | {c['g'][G]:.2f} | {c['fell'][G]:.2f} | {swg(c, TH, G2):.2f}")
    for label, rows in (("fresh pool (test)", fresh), ("milestone 1 table (second test; skip-r1 was chosen on it)", old)):
        out += ["", f"## {label}: {len(rows)} cells, parameters fixed on the held-out cells", "",
                "clock | design | routed/r2 | k | skip-r1 % | random % | SW % | G % | G fall-back | SWG %"]
        for c in rows:
            out.append(f"{c['clock']} | {c['design']} | {c['ratio']:.2f} | {c['k']} | {c['skip']:.2f} | {c['rand']:.2f} | "
                       f"{sw(c, chosen['SW']):.2f} | {c['g'][G]:.2f} | {c['fell'][G]:.2f} | {swg(c, TH, G2):.2f}")
        out.append("")
        for name in POLICIES:
            v = [f[name](c, chosen[name]) for c in rows]
            w = sum(a < b for a, b in zip(v, (c["skip"] for c in rows)))
            l = sum(a > b for a, b in zip(v, (c["skip"] for c in rows)))
            out.append(f"{label.split(' (')[0]} mean regret {name}: {statistics.mean(v):.2f}%, worst {max(v):.2f}%; "
                       f"vs skip-r1 better {w}, worse {l} (sign p = {sign_p(w, l):.3f})")
    M = {name: lodo(held, name) for name in POLICIES}
    Fm = {name: mean(fresh, name) for name in POLICIES}
    bestF = min(Fm["skip-r1"], Fm["random"])
    bm = [c for c in held if c["design"] == "bcastmix192"]
    w, l = (sum(swg(c, TH, G2) < sw(c, chosen["SW"]) for c in held), sum(swg(c, TH, G2) > sw(c, chosen["SW"]) for c in held))
    out += ["", "post hoc (lines added after the first run):",
            "post hoc: G fall-back share on bcastmix192 (tight, relaxed) with p = 6: " + "; ".join(
                f"tau0={t:g}: " + ", ".join(f"{c['fell'][(6, t)]:.2f}" for c in sorted(bm, key=lambda c: c["clock"] != "tight"))
                for t in (0, 0.2, 0.4)),
            f"post hoc: held-out SWG vs SW per cell: better {w}, worse {l}, tied {len(held) - w - l} (sign p = {sign_p(w, l):.3f})",
            f"post hoc: both test tables (40 cells): SW {statistics.mean([sw(c, chosen['SW']) for c in fresh + old]):.2f}%, "
            f"skip-r1 {statistics.mean([c['skip'] for c in fresh + old]):.2f}%, random {statistics.mean([c['rand'] for c in fresh + old]):.2f}%"]
    out += ["",
            f"(1) LODO SW below skip-r1 and random: {M['SW'] < M['skip-r1'] and M['SW'] < M['random']}",
            f"(2) fresh SW within 0.3 of the better of skip-r1 and random: {Fm['SW'] <= bestF + 0.3}",
            f"(3) best G worst cell below skip-r1's on held-out: {max(c['g'][G] for c in held) < max(c['skip'] for c in held)}",
            f"(4) G falls back in more than half the draws on bcastmix192 at both clocks: {all(c['fell'][G] > 0.5 for c in bm)}",
            f"(5) LODO SWG lowest of the five: {M['SWG'] == min(M.values()) and list(M.values()).count(M['SWG']) == 1}",
            f"(6) fresh SWG within 0.3 of the better of skip-r1 and random: {Fm['SWG'] <= bestF + 0.3}"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
