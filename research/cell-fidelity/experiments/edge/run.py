"""Milestone 5k: why the DFN@100 energy optimum sits at the salt edge, read off three factors that need no SPMe run.

    python experiments/edge/run.py dev      # factor decomposition on the 21 committed conditions (pybamm for U and r_kt of 5j's two)
    python experiments/edge/run.py choose   # r_kt over the fresh (seed 9) designs at candidate conditions -> choose.json
    python experiments/edge/run.py probe    # baseline design, SPMe and DFN for 2 cycles at each chosen condition -> probe.json
    python experiments/edge/run.py bench    # 64 Sobol (seed 9) designs x SPMe(V0)/DFN@100 per kept condition (resumable)
    python experiments/edge/run.py report   # results.txt, summary.json (pybamm for U and r_kt)

The score every milestone ranks designs by is DFN's Wh/kg at cycle 100. It factors exactly as
    score = U x (BOL / U) x (end / BOL)
with U the design's thermodynamic energy over its stack mass (PyBaMM's calculate_theoretical_energy, SOC 1 to 0, as in
5j's bound), BOL the first cycle's delivered Wh/kg (utilisation = BOL / U) and end / BOL the 100-cycle retention.
U and r_kt (5i) come from the parameter set and the design alone. The plan, the condition rule and H74 to H77 are in
../../LOG.md (milestone 5k plan), written before the fresh bench. Simulation, mapping and pools are 5g's, imported unchanged.
"""
import importlib.util
import json
import math
import os
import statistics
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent

SOBOL_SEED = 9
WORKERS = int(os.environ.get("WORKERS", "3"))
R_FLAG = 0.10        # 5i's flag: starved at or below
R_SOUND = 0.30       # sound at or above (milestone 6a's 'mildly depleted' floor); the band between is left out of both regimes
MIN_N = 10           # a regime is tested on a condition only with at least this many designs in it
# candidates for the fresh test, in this order (5j's list after the two it used, then Ai2020 rates no milestone ran)
CANDIDATES = (("Ecker2015", 1.5), ("Marquis2019", 3.0), ("Mohtat2020", 3.0), ("NCA_Kim2011", 0.75), ("OKane2022", 1.75),
              ("Chen2020", 2.5), ("Ecker2015", 3.0), ("Ai2020", 0.375), ("Ai2020", 0.625))
N_PICK = 3           # conditions kept, of different cells, each with >= MIN_N predicted designs in both regimes


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


P = _mod("prescreen_run", EXP / "prescreen" / "run.py")
G = P.G
R = G.R


# ---------- pure helpers (stdlib; tested) ----------

def spearman(a, b):
    """Spearman rank correlation (average ranks for ties); None when fewer than 3 points or a constant input."""
    if len(a) < 3:
        return None

    def rank(v):
        o = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        i = 0
        while i < len(o):
            k = i
            while k + 1 < len(o) and v[o[k + 1]] == v[o[i]]:
                k += 1
            for m in range(i, k + 1):
                r[o[m]] = (i + k) / 2
            i = k + 1
        return r
    ra, rb = rank(a), rank(b)
    ma, mb = statistics.fmean(ra), statistics.fmean(rb)
    num = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    den = math.sqrt(sum((x - ma) ** 2 for x in ra) * sum((y - mb) ** 2 for y in rb))
    return num / den if den else None


def factors(u, dfn_run):
    """(score, BOL, utilisation, retention) for one DFN@100 run; None unless it finished 100 cycles with positive energy."""
    wh = dfn_run.get("cycle_wh") or []
    if len(wh) < 100 or wh[0] <= 0 or not dfn_run.get("mass_kg"):
        return None
    m = dfn_run["mass_kg"]
    bol, end = wh[0] / m, wh[99] / m
    return dict(score=end, bol=bol, util=bol / u, ret=end / bol)


def front(pts, layers=1):
    """Indices on the first `layers` Pareto layers of (U, r_kt), both maximised. pts: list of (U, r_kt)."""
    left, out = list(range(len(pts))), []
    for _ in range(layers):
        lay = [i for i in left if not any(pts[k][0] >= pts[i][0] and pts[k][1] >= pts[i][1] and pts[k] != pts[i] for k in left)]
        out += lay
        left = [i for i in left if i not in lay]
    return sorted(out)


def var_shares(rows):
    """Share of the pool's variance of log(score) carried by log U, log utilisation and log retention
    (covariance with log score over its variance; the three sum to 1 exactly)."""
    ls = [math.log(r["score"]) for r in rows]
    ms = statistics.fmean(ls)
    vs = sum((x - ms) ** 2 for x in ls)
    out = {}
    for k, f in (("U", lambda r: r["u"]), ("util", lambda r: r["util"]), ("ret", lambda r: r["ret"])):
        lk = [math.log(f(r)) for r in rows]
        mk = statistics.fmean(lk)
        out[k] = sum((x - mk) * (y - ms) for x, y in zip(lk, ls)) / vs if vs else None
    return out


def condition(rows):
    """Every number the plan reports for one pool. rows: dicts with u, rkt, score, bol, util, ret (DFN finished)."""
    snd = [r for r in rows if r["rkt"] >= R_SOUND]
    stv = [r for r in rows if r["rkt"] <= R_FLAG]
    best = max(rows, key=lambda r: r["score"])
    pts = [(r["u"], r["rkt"]) for r in rows]

    def sp(sub, f, g):
        return spearman([f(r) for r in sub], [g(r) for r in sub]) if len(sub) >= MIN_N else None
    fr = {L: front(pts, L) for L in (1, 2)}
    by_u_feasible = sorted([r for r in rows if r["rkt"] > R_FLAG], key=lambda r: -r["u"])
    return dict(
        n=len(rows), n_sound=len(snd), n_starved=len(stv),
        u_rkt=spearman([r["u"] for r in rows], [r["rkt"] for r in rows]),
        sound_u_bol=sp(snd, lambda r: r["u"], lambda r: r["bol"]),
        sound_u_score=sp(snd, lambda r: r["u"], lambda r: r["score"]),
        sound_u_ret=sp(snd, lambda r: r["u"], lambda r: r["ret"]),
        sound_util_median=statistics.median(r["util"] for r in snd) if snd else None,
        starved_rkt_util=sp(stv, lambda r: r["rkt"], lambda r: r["util"]),
        starved_rkt_score=sp(stv, lambda r: r["rkt"], lambda r: r["score"]),
        starved_util_median=statistics.median(r["util"] for r in stv) if stv else None,
        all_u_score=spearman([r["u"] for r in rows], [r["score"] for r in rows]),
        shares=var_shares(rows),
        best_rkt=best["rkt"], best_u_pct=sum(1 for r in rows if r["u"] <= best["u"]) / len(rows),
        best_util=best["util"], best_ret=best["ret"],
        best_score=best["score"],
        front_gap={L: 1 - max(rows[i]["score"] for i in fr[L]) / best["score"] for L in fr},
        front_calls={L: len(fr[L]) for L in fr},
        top_u_gap={k: (1 - max(r["score"] for r in by_u_feasible[:k]) / best["score"]) if by_u_feasible else 1.0 for k in (1, 3, 5)})


def verdicts(C):
    """H74 to H77 as registered in the 5k plan (LOG.md). C: {condition: condition()}."""
    v = R.verdict
    return dict(
        H74=v([c["sound_u_bol"] for c in C.values() if c["sound_u_bol"] is not None], lambda x: x >= 0.85, lambda x: x < 0.5),
        H75=v([c["starved_rkt_util"] for c in C.values() if c["starved_rkt_util"] is not None], lambda x: x >= 0.6, lambda x: x < 0.3),
        H76=v([c["u_rkt"] for c in C.values()], lambda x: x <= -0.3, lambda x: x > 0.0),
        H77=v([c["front_gap"][1] for c in C.values()], lambda x: x <= 0.06, lambda x: x > 0.10))


# ---------- assembling pools ----------

def rows_for(runs, us, rkts):
    """Pool rows (5g's pool, DFN finished) with the three factors. us, rkts: {j: value}."""
    rows, dropped = G.pool(runs)
    out = []
    for r in rows:
        f = factors(us[r["j"]], runs[(r["j"], "DFN")])
        if f:
            out.append(dict(j=r["j"], u=us[r["j"]], rkt=rkts[r["j"]], **f))
    return out, dropped


def _u_and_rkt(runs, s, rate):
    """U (thermodynamic Wh/kg over stack mass) and r_kt per design of one condition (pybamm, parameter values only)."""
    import pybamm
    from energy_cell import cell
    from pybamm.models.full_battery_models.lithium_ion.electrode_soh import calculate_theoretical_energy
    pybamm.set_logging_level("ERROR")
    S = P._sand()
    TR = G.TR
    us, rk = {}, {}
    t0 = time.perf_counter()
    for j in sorted({j for j, _ in runs}):
        x = S._x(runs, j)
        if x is None:
            continue
        xc = cell.clip(x)
        pv, _, _ = TR.params(xc, s)
        us[j] = calculate_theoretical_energy(pv) / TR.stack_mass(xc, pv)
        rk[j] = S.predict(x, s, rate)["r_kt"]
    return us, rk, time.perf_counter() - t0


def _fmt(x, d=2):
    return "n/a" if x is None else f"{x:+.{d}f}"


def _line(name, c):
    sh = c["shares"]
    return (f"{name}: n {c['n']} (sound r_kt >= {R_SOUND} {c['n_sound']}, starved r_kt <= {R_FLAG} {c['n_starved']}); Spearman(U, r_kt) {_fmt(c['u_rkt'])}\n"
            f"  sound: U~BOL {_fmt(c['sound_u_bol'])}, U~score {_fmt(c['sound_u_score'])}, U~retention {_fmt(c['sound_u_ret'])}, median utilisation {_fmt(c['sound_util_median'])}\n"
            f"  starved: r_kt~utilisation {_fmt(c['starved_rkt_util'])}, r_kt~score {_fmt(c['starved_rkt_score'])}, median utilisation {_fmt(c['starved_util_median'])}\n"
            f"  log-score variance carried by U {_fmt(sh['U'])}, utilisation {_fmt(sh['util'])}, retention {_fmt(sh['ret'])}; U~score over the pool {_fmt(c['all_u_score'])}\n"
            f"  DFN best {c['best_score']:.1f} Wh/kg: r_kt {c['best_rkt']:+.2f}, U percentile {c['best_u_pct']:.2f}, utilisation {c['best_util']:.2f}, retention {c['best_ret']:.2f}\n"
            f"  zero-SPMe shortlists: (U, r_kt) front L1 gap {c['front_gap'][1]:.4f} at {c['front_calls'][1]} DFN calls, L2 {c['front_gap'][2]:.4f} at {c['front_calls'][2]};"
            f" top-U above the flag k=1/3/5 gap {c['top_u_gap'][1]:.4f}/{c['top_u_gap'][3]:.4f}/{c['top_u_gap'][5]:.4f}")


def _pooled(C):
    def col(k):
        return [c[k] for c in C.values() if c[k] is not None]
    out = {}
    for k in ("sound_u_bol", "sound_u_score", "sound_u_ret", "starved_rkt_util", "starved_rkt_score", "u_rkt", "best_rkt"):
        xs = col(k)
        out[k] = dict(n=len(xs), median=statistics.median(xs) if xs else None, min=min(xs) if xs else None, max=max(xs) if xs else None)
    for L in (1, 2):
        g = [c["front_gap"][L] for c in C.values()]
        out[f"front{L}"] = dict(exact=sum(1 for x in g if x < 1e-12), max_gap=max(g), median_gap=statistics.median(g),
                                mean_calls=statistics.fmean(c["front_calls"][L] for c in C.values()))
    return out


def _summary_lines(C):
    p = _pooled(C)
    L = []
    for k, d in p.items():
        if "median" in d:
            L.append(f"  {k}: {d['n']} conditions, median {_fmt(d['median'])}, range {_fmt(d['min'])} to {_fmt(d['max'])}")
        else:
            L.append(f"  {k}: exact {d['exact']} of {len(C)}, median gap {d['median_gap']:.4f}, max {d['max_gap']:.4f}, mean calls {d['mean_calls']:.1f}")
    return L, p


def dev():
    """Development (seen data): the 19 committed conditions (U from 5j's bound.jsonl, r_kt from 5i) and 5j's two."""
    bound = {(r["cond"], r["j"]): r["u"] for r in R._load(EXP / "prescreen" / "bound.jsonl")}
    rk = P._committed_rkt()
    conds = dict(P._sand().committed_conditions())
    fresh5j = {}
    for r in R._load(EXP / "prescreen" / "bench.jsonl"):
        fresh5j.setdefault(r["cond"], {})[(r["j"], r["what"])] = r
    C = {}
    for c, runs in conds.items():
        js = {j for j, _ in runs}
        rows, _ = rows_for(runs, {j: bound.get((c, j), 1.0) for j in js}, {j: rk.get((c, j), 0.0) for j in js})
        C[c] = condition([r for r in rows if (c, r["j"]) in bound])
    for c, runs in fresh5j.items():
        s, rate = G._parse(c)
        us, kt, _ = _u_and_rkt(runs, s, rate)
        rows, _ = rows_for(runs, us, kt)
        C[c] = condition(rows)
    L = ["cell-fidelity milestone 5k, development (all 21 conditions were seen by earlier milestones; the factor split had not been computed)", ""]
    L += [_line(c, C[c]) for c in sorted(C)]
    sl, p = _summary_lines(C)
    L += ["", "Pooled over conditions:"] + sl
    L += ["Verdict functions on development data (not verdicts): " + ", ".join(f"{k} {w}" for k, w in verdicts(C).items())]
    (HERE / "dev.txt").write_text("\n".join(L) + "\n")
    (HERE / "dev.json").write_text(json.dumps(dict(conditions=C, pooled=p), indent=1) + "\n")
    print("\n".join(L))


# ---------- fresh conditions (pybamm) ----------

def choose():
    """Predicted regime sizes from r_kt alone (no run, no label) for the seed-9 designs; keep the first N_PICK candidates,
    of different cells, with at least MIN_N designs predicted in each regime."""
    G.SOBOL_SEED = SOBOL_SEED
    xs = G.designs()
    S = P._sand()
    counts, kept = {}, []
    for s, rate in CANDIDATES:
        kt = [S.predict(x, s, rate)["r_kt"] for x in xs]
        c = G.cid(s, rate)
        counts[c] = dict(starved=sum(1 for k in kt if k <= R_FLAG), sound=sum(1 for k in kt if k >= R_SOUND))
        print(c, counts[c], flush=True)
        if (len(kept) < N_PICK and min(counts[c].values()) >= MIN_N and s not in {k.split("@")[0] for k in kept}):
            kept.append(c)
    (HERE / "choose.json").write_text(json.dumps(dict(counts=counts, chosen=kept), indent=1) + "\n")
    print("chosen:", kept)


def _chosen():
    return tuple(G._parse(c) for c in json.loads((HERE / "choose.json").read_text())["chosen"])


def report():
    kept = json.loads((HERE / "probe.json").read_text())["kept"]
    by = {}
    for r in R._load(HERE / "bench.jsonl"):
        by.setdefault(r["cond"], {})[(r["j"], r["what"])] = r
    L = ["cell-fidelity milestone 5k: the DFN@100 score split into U x utilisation x retention, on fresh conditions", "",
         "Probe (baseline design, 2 cycles): " + ", ".join(f"{c} {'ok' if c in kept else 'fails'}" for c in json.loads((HERE / "choose.json").read_text())["chosen"]), ""]
    C, extra = {}, {}
    for c in kept:
        runs = by.get(c, {})
        s, rate = G._parse(c)
        us, kt, t = _u_and_rkt(runs, s, rate)
        rows, dropped = rows_for(runs, us, kt)
        if not rows:
            continue
        C[c] = condition(rows)
        extra[c] = dict(dropped=dropped, seconds_u_rkt=t, rows=rows)
        L.append(_line(c, C[c]) + f"\n  dropped (DFN did not reach 100 cycles): {dropped}; U and r_kt for the pool took {t:.1f} s")
    sl, p = _summary_lines(C)
    vd = verdicts(C) if C else {}
    L += ["", "Pooled over conditions:"] + sl + ["", "Verdicts: " + ", ".join(f"{k} {w}" for k, w in vd.items())]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(kept=kept, conditions=C, pooled=p, verdicts=vd, extra=extra), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    cmd = sys.argv[1:2]
    if cmd == ["dev"]:
        dev()
    elif cmd == ["choose"]:
        choose()
    elif cmd in (["probe"], ["bench"]):
        P._use_gate_machinery(_chosen())
        G.HERE, G.SOBOL_SEED = HERE, SOBOL_SEED
        (G.probe if cmd == ["probe"] else G.bench)()
    elif cmd == ["report"]:
        report()
    else:
        print(__doc__)
