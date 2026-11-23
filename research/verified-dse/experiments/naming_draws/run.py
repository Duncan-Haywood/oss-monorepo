"""Milestone 163: how large must a per-design edge be before one naming can resolve it? (replay of milestone 162's table)

Usage: python experiments/naming_draws/run.py [--draws 200] [--jobs 4]   # writes results.txt and draws.json here; no flow run

Why: milestone 162b's "Next". On 27 SKY130 ss designs the ladder's mean edge d = SWC(1.25) - equal-cost random regret survives
averaging over three namings (-4.37 points), but one renaming moves a single design's d by 2.36 points on average and flips its
sign on 3 of 27. Three whole-table namings give three draws of d per design, too few to say how noisy a design's d is, or which
per-design claims in the paper (the ladder loses on design X) a single naming can support.

Design: milestone 162's arm tables (experiments/naming_ladder/run.py arm_tables: build B's rows for Y, the canonical (C) and
random (R) renamings' routed outcomes, rung costs build B's in every arm). A search routes each candidate once, so the naming
noise a practitioner meets is per point: in draw k, every point independently takes its outcome from one of Y, C and R, chosen
uniformly among the namings that are ok for it (seed 163 + k; a point failed in build B stays failed). The cells, SWC, random
routing and tie-break seed (m162) are milestone 162's, so only outcomes change between draws. D = the 27 designs; per design x:
m_x and s_x = mean and standard deviation of d over the draws; flip_x = share of draws whose sign of d differs from the sign of
d(A3) (milestone 162's three-naming average). s3_x = sample sd of (d(Y), d(C), d(R)), the whole-table namings.

Predictions, written here and committed before this script first runs (disclosed: milestone 162's per-design d under Y, C, R and
A3 are known; no draw has been computed):
 (1) PRIMARY: median over D of s_x is between 1.0 and 2.5 points (162b's mean |d(C) - d(Y)| of 2.36 implies about 1.5 for a
     normal draw). Prior 65%.
 (2) per-point draws and whole-table namings agree: median s3_x / median s_x is between 0.67 and 1.5. Prior 60%.
 (3) flips are confined to small edges: every design with |d(A3)| > 5 points has flip_x < 0.05. Prior 70%.
 (4) at least 4 of the 27 designs have flip_x > 0.20. Prior 50%.
 (5) the headline barely moves: the sd over draws of mean_x d is below 0.5 points, and every draw's mean is below -2. Prior 75%.
 (6) s_x rises with the design's per-point routed spread (median over sequences of ln(max/min) over Y, C, R): Spearman > 0.3.
     Prior 50%.
Reported, not predicted: per-design table; the smallest |d(A3)| above which no design flips more than 5%; namings needed for a
per-design sign at 95% if k namings averaged shrink s_x as 1/sqrt(k) (an extrapolation: only three namings were run); draws'
SWC-better counts.
"""
import argparse
import importlib.util
import json
import math
import random
import statistics
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SEED = 163
NAMINGS = ("Y", "C", "R")


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


NL = _load(EXP / "naming_ladder" / "run.py", "vdse_m163_nl")
A158 = _load(EXP / "tool_build" / "analyse.py", "vdse_m163_a158")
m141, swc, rand = A158.m141, A158.swc, A158.rand

_STATE = {}


def setup():
    B = NL.b_rows()
    designs = NL.complete(NL.rows())
    T = NL.arm_tables(designs, B)
    assert len({len(T[a]) for a in T}) == 1
    for j in range(len(T["Y"])):  # rows are aligned across arms (same build B order)
        assert len({(T[a][j]["design"], tuple(T[a][j]["seq"])) for a in T}) == 1
    return designs, T


def mix(T, k):
    """One per-point naming draw: each point takes one ok naming's row, uniformly."""
    rng = random.Random(f"{SEED}-{k}")
    out = []
    for j in range(len(T["Y"])):
        ok = [a for a in NAMINGS if T[a][j]["status"] == "ok"]
        out.append(T[rng.choice(ok)][j] if ok else T["Y"][j])
    return out


def d_of(rows_):
    cell = m141.cells(rows_, "naming_ladder", "m162")
    return {x: swc(c) - rand(c) for x, c in cell.items()}


def _work(k):
    designs, T = _STATE["v"]
    return k, d_of(mix(T, k))


def _init():
    _STATE["v"] = setup()


def spearman(a, b):
    def rk(v):
        o = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        i = 0
        while i < len(o):
            j = i
            while j + 1 < len(o) and v[o[j + 1]] == v[o[i]]:
                j += 1
            for t in range(i, j + 1):
                r[o[t]] = (i + j) / 2
            i = j + 1
        return r
    ra, rb = rk(a), rk(b)
    ma, mb = statistics.mean(ra), statistics.mean(rb)
    num = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    return num / math.sqrt(sum((x - ma) ** 2 for x in ra) * sum((y - mb) ** 2 for y in rb))


def summarise(designs, T, draws, fixed):
    """draws: list of {design: d}; fixed: {arm: {design: d}} for Y, C, R, A3."""
    mean, sd, med = statistics.mean, statistics.stdev, statistics.median
    sgn = lambda v: (v > 0) - (v < 0)  # noqa: E731
    per = {}
    for x in designs:
        v = [dr[x] for dr in draws]
        a3 = fixed["A3"][x]
        per[x] = {"m": mean(v), "s": sd(v), "flip": sum(sgn(t) != sgn(a3) for t in v) / len(v), "a3": a3,
                  "s3": sd([fixed[a][x] for a in NAMINGS]), "lo": min(v), "hi": max(v)}
    spread = {}
    by = {a: {} for a in NAMINGS}
    for a in NAMINGS:
        for r in T[a]:
            if r["status"] == "ok":
                by[a][(r["design"], tuple(r["seq"]))] = m141.r4(r)
    for x in designs:
        sp = []
        for key in by["Y"]:
            if key[0] == x and key in by["C"] and key in by["R"]:
                v = [by[a][key] for a in NAMINGS]
                sp.append(math.log(max(v) / min(v)))
        spread[x] = med(sp)
    s = [per[x]["s"] for x in designs]
    s3 = [per[x]["s3"] for x in designs]
    means = [mean(dr[x] for x in designs) for dr in draws]
    better = [sum(dr[x] < 0 for x in designs) for dr in draws]
    rho = spearman(s, [spread[x] for x in designs])
    big = [x for x in designs if abs(per[x]["a3"]) > 5]
    held = [1.0 <= med(s) <= 2.5, 0.67 <= med(s3) / med(s) <= 1.5, all(per[x]["flip"] < 0.05 for x in big),
            sum(per[x]["flip"] > 0.20 for x in designs) >= 4, sd(means) < 0.5 and max(means) < -2, rho > 0.3]
    # smallest |d(A3)| above which no design flips more than 5%
    order = sorted(designs, key=lambda x: -abs(per[x]["a3"]))
    cut = None
    for x in order:
        if per[x]["flip"] > 0.05:
            cut = abs(per[x]["a3"])
            break
    return {"per": per, "spread": spread, "means": means, "better": better, "rho": rho, "held": held, "cut": cut,
            "med_s": med(s), "med_s3": med(s3), "big": big}


def need_k(m, s, z=1.96):
    """Namings to average so that |m| > z s / sqrt(k), if averaging shrinks s as 1/sqrt(k) (extrapolated)."""
    if m == 0:
        return math.inf
    return max(1, math.ceil((z * s / abs(m)) ** 2))


def write(designs, S, n, dst):
    per = S["per"]
    hv = lambda i: "held" if S["held"][i] else "refuted"  # noqa: E731
    flips = sum(per[x]["flip"] > 0.20 for x in designs)
    L = ["# Milestone 163: per-design edge under per-point naming draws (replay of milestone 162's table)", "",
         f"{n} draws; each point takes one of Y, C, R uniformly (seed {SEED} + k); cells and tie-break seed m162 as milestone 162",
         f"designs: {len(designs)}", "",
         "design | d A3 | mean d draws | sd d draws | sd d (Y, C, R) | min | max | flip share | routed spread | namings for 95% sign"]
    for x in sorted(designs, key=lambda x: per[x]["a3"]):
        p = per[x]
        k = need_k(p["m"], p["s"])
        L.append(f"{x} | {p['a3']:+.2f} | {p['m']:+.2f} | {p['s']:.2f} | {p['s3']:.2f} | {p['lo']:+.2f} | {p['hi']:+.2f} | "
                 f"{p['flip']:.3f} | {S['spread'][x]:.4f} | {k}")
    mean, sd = statistics.mean, statistics.stdev
    L += ["", "## Predictions", "",
          f"(1) PRIMARY: median per-design sd of d {S['med_s']:.2f} points (needed 1.0 to 2.5): {hv(0)}",
          f"(2) median sd over the three whole-table namings {S['med_s3']:.2f}, ratio {S['med_s3'] / S['med_s']:.2f} "
          f"(needed 0.67 to 1.5): {hv(1)}",
          f"(3) designs with |d(A3)| > 5: {len(S['big'])}; largest flip share among them "
          f"{max(per[x]['flip'] for x in S['big']):.3f} (needed < 0.05 for all): {hv(2)}",
          f"(4) designs with flip share > 0.20: {flips} (needed >= 4): {hv(3)}",
          f"(5) mean d over designs per draw: mean {mean(S['means']):+.2f}, sd {sd(S['means']):.2f}, range "
          f"{min(S['means']):+.2f} to {max(S['means']):+.2f} (needed sd < 0.5 and max < -2): {hv(4)}",
          f"(6) Spearman of sd d against routed spread {S['rho']:+.3f} (needed > 0.3): {hv(5)}",
          "", "## Reported, not predicted", ""]
    L.append("smallest |d(A3)| above which no design flips more than 5% of draws: "
             + (f"{S['cut']:.2f} points" if S["cut"] is not None else "none flips"))
    L.append(f"SWC better than random per draw: median {statistics.median(S['better'])}, range {min(S['better'])} to "
             f"{max(S['better'])} of {len(designs)}")
    ks = [need_k(per[x]["m"], per[x]["s"]) for x in designs]
    L.append(f"designs whose sign one naming resolves at 95% (k = 1): {sum(k == 1 for k in ks)} of {len(designs)}; "
             f"k <= 3: {sum(k <= 3 for k in ks)}; k > 3 (beyond what was run): {sum(k > 3 for k in ks)}")
    Path(dst).write_text("\n".join(L) + "\n")
    print("\n".join(L))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--draws", type=int, default=200)
    ap.add_argument("--jobs", type=int, default=4)
    a = ap.parse_args()
    designs, T = setup()
    fixed = {arm: d_of(T[arm]) for arm in ("Y", "C", "R", "A3")}
    with Pool(a.jobs, initializer=_init) as p:
        got = dict(p.map(_work, range(a.draws)))
    draws = [got[k] for k in range(a.draws)]
    (HERE / "draws.json").write_text(json.dumps({"fixed": fixed, "draws": draws}, sort_keys=True) + "\n")
    S = summarise(designs, T, draws, fixed)
    write(designs, S, a.draws, HERE / "results.txt")


if __name__ == "__main__":
    main()
