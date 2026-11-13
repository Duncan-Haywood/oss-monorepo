"""Milestone 5l: retention, the one factor of the DFN@100 score that 5k left to DFN, read off a 10-cycle DFN run.

    python experiments/fade/run.py dev      # replay on the 24 committed conditions (5b to 5k) -> dev.txt, dev.json (pybamm for U and r_kt of 5j/5k)
    python experiments/fade/run.py probe    # baseline design, SPMe and DFN for 2 cycles at each fresh condition -> probe.json
    python experiments/fade/run.py bench    # 64 Sobol (seed 10) designs x DFN@100 and a separate DFN@10 per kept condition (resumable)
    python experiments/fade/run.py report   # results.txt, summary.json (pybamm for U and r_kt)

5k factored the score as U x utilisation x retention and found the first two need no simulation; retention made its
(U, r_kt) front miss by up to 4.7% (5.9% in development). A DFN run's Wh/kg at cycle K is U x utilisation x the retention
to cycle K. The screen tested here: DFN@K on every design, DFN@100 on the top m by cycle-K Wh/kg, answer the best
DFN@100 among them. Its wall time is charged with the measured DFN@10 runs (separate runs, not prefixes of the 100-cycle
ones) plus the top m designs' own DFN@100 runs, so continuing a run from cycle K is not assumed. The plan and H78 to H81
are in ../../LOG.md (milestone 5l plan), written before the fresh bench. Simulation, mapping and pools are 5g's, unchanged.
"""
import importlib.util
import json
import math
import os
import statistics
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent

SOBOL_SEED = 10
WORKERS = int(os.environ.get("WORKERS", "3"))
K = 10               # the short run's cycles
TOP_M = 3            # designs the screen sends to DFN@100
# fresh conditions, fixed before any run: the two cells 5k named (energy above the flag does not decide there) at currents
# no milestone ran, and a graphite cell whose best sat on the flag in 5j, at a current no milestone ran
CONDITIONS = (("Ai2020", 0.625), ("NCA_Kim2011", 0.75), ("OKane2022", 1.75))


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


E = _mod("edge_run", EXP / "edge" / "run.py")
P, G, R = E.P, E.G, E.R
spearman, front = E.spearman, E.front


# ---------- pure helpers (stdlib; tested) ----------

def at_k(wh, mass, k=K):
    """Wh/kg delivered at cycle k (1-based) of one run's per-cycle energies."""
    return wh[k - 1] / mass


def sqrt_extrapolate(wh, k=K, to=100):
    """Cycle-`to` energy from a least-squares line in sqrt(cycle) through cycles 2..k (the first cycle is left out:
    it starts from the parameter set's own initial state and is larger on every cell). The usual SEI-growth form."""
    cs = list(range(2, k + 1))
    xs = [math.sqrt(c) for c in cs]
    ys = [wh[c - 1] for c in cs]
    mx, my = statistics.fmean(xs), statistics.fmean(ys)
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    return my + b * (math.sqrt(to) - mx)


def screen(rows, k=K, m=TOP_M, subset=None):
    """DFN@k on `subset` (default every design), DFN@100 on the top m by cycle-k Wh/kg.
    rows: dicts with score (DFN@100 Wh/kg), short (cycle-k Wh/kg), t100, tk. Returns (gap, picked, seconds)."""
    idx = list(range(len(rows))) if subset is None else list(subset)
    top = sorted(idx, key=lambda i: -rows[i]["short"])[:m]
    best = max(r["score"] for r in rows)
    got = max(rows[i]["score"] for i in top)
    t = sum(rows[i]["tk"] for i in idx) + sum(rows[i]["t100"] for i in top)
    return 1 - got / best, top, t


def condition(rows):
    """Every number the plan reports for one pool. rows: dicts with u, rkt, score, bol, util, ret, short, ext, tk, t100."""
    sc = [r["score"] for r in rows]
    best = max(rows, key=lambda r: r["score"])
    t_all = sum(r["t100"] for r in rows)
    pts = [(r["u"], r["rkt"]) for r in rows]
    gap, top, t = screen(rows)
    f1 = front(pts, 1)
    out = dict(
        n=len(rows), t_all=t_all,
        rho_short=spearman([r["short"] for r in rows], sc),
        rho_ext=spearman([r["ext"] for r in rows], sc),
        rho_ret_short=spearman([r["short"] / (r["u"] * r["util"]) for r in rows], [r["ret"] for r in rows]),
        gap=gap, t_ratio=t / t_all, picked=[rows[i]["j"] for i in top],
        tk_over_t100=statistics.median(r["tk"] / r["t100"] for r in rows),
        front_gap=1 - max(rows[i]["score"] for i in f1) / best["score"], front_calls=len(f1),
        front_t_ratio=sum(rows[i]["t100"] for i in f1) / t_all,
        best_j=best["j"], best_ret=best["ret"], best_rkt=best["rkt"],
        ret_median=statistics.median(r["ret"] for r in rows), ret_min=min(r["ret"] for r in rows), ret_max=max(r["ret"] for r in rows))
    for L in (2, 3):
        g, _, tt = screen(rows, subset=front(pts, L))
        out[f"front{L}_short"] = dict(gap=g, t_ratio=tt / t_all, calls=len(front(pts, L)))
    for mm in (1, 5):
        g, _, tt = screen(rows, m=mm)
        out[f"top{mm}"] = dict(gap=g, t_ratio=tt / t_all)
    return out


def verdicts(C):
    """H78 to H81 as registered in the 5l plan (LOG.md). C: {condition: condition()}."""
    v = R.verdict
    return dict(
        H78=v([c["rho_short"] for c in C.values()], lambda x: x >= 0.85, lambda x: x < 0.6),
        H79=v([c["gap"] for c in C.values()], lambda x: x <= 0.03, lambda x: x > 0.075),
        H80=v([c["t_ratio"] for c in C.values()], lambda x: x <= 0.25, lambda x: x > 0.40),
        H81=v([c["gap"] - c["front_gap"] for c in C.values()], lambda x: x <= 0.0, lambda x: x > 0.03))


# ---------- assembling pools ----------

def rows_for(runs, us, rkts, k=K, short_key=None):
    """5k's pool rows plus the short run's numbers. short_key: the run key holding the measured DFN@k run, or None
    (development: the 100-cycle run's own first k cycles, with tk charged as k/100 of its time; dev only)."""
    base, dropped = E.rows_for(runs, us, rkts)
    out = []
    for r in base:
        d = runs[(r["j"], "DFN")]
        if short_key:
            s = runs.get((r["j"], short_key))
            if not s or not s.get("ok") or len(s.get("cycle_wh") or []) < k:
                dropped.append(r["j"])
                continue
            wh, tk = s["cycle_wh"], s["seconds"]
        else:
            wh, tk = d["cycle_wh"], d["seconds"] * k / 100
        out.append(dict(r, short=at_k(wh, d["mass_kg"], k), ext=sqrt_extrapolate(wh, k) / d["mass_kg"], tk=tk, t100=d["seconds"]))
    return out, dropped


def _fmt(x, d=2):
    return "n/a" if x is None else f"{x:+.{d}f}"


def _line(name, c):
    return (f"{name}: n {c['n']}; retention median {c['ret_median']:.2f} ({c['ret_min']:.2f} to {c['ret_max']:.2f})\n"
            f"  Spearman with the DFN@100 score: cycle-{K} Wh/kg {_fmt(c['rho_short'])}, sqrt-cycle extrapolation {_fmt(c['rho_ext'])};"
            f" cycle-{K} retention ~ 100-cycle retention {_fmt(c['rho_ret_short'])}\n"
            f"  screen (DFN@{K} on all, DFN@100 on top {TOP_M}): gap {c['gap']:.4f}, wall / all-DFN@100 {c['t_ratio']:.3f}, picked {c['picked']};"
            f" DFN@{K} / DFN@100 time median {c['tk_over_t100']:.2f}\n"
            f"  top 1 gap {c['top1']['gap']:.4f} ({c['top1']['t_ratio']:.3f}), top 5 {c['top5']['gap']:.4f} ({c['top5']['t_ratio']:.3f});"
            f" DFN@{K} on front layers 1-2 {c['front2_short']['gap']:.4f} ({c['front2_short']['t_ratio']:.3f}), 1-3 {c['front3_short']['gap']:.4f} ({c['front3_short']['t_ratio']:.3f})\n"
            f"  5k front (DFN@100 on layer 1): gap {c['front_gap']:.4f} at {c['front_calls']} calls, wall / all-DFN@100 {c['front_t_ratio']:.3f};"
            f" DFN best design {c['best_j']}: retention {c['best_ret']:.2f}, r_kt {c['best_rkt']:+.2f}")


def _pooled(C):
    out = {}
    for k in ("rho_short", "rho_ext", "rho_ret_short", "gap", "t_ratio", "front_gap", "front_t_ratio", "tk_over_t100"):
        xs = [c[k] for c in C.values() if c[k] is not None]
        out[k] = dict(n=len(xs), median=statistics.median(xs), min=min(xs), max=max(xs))
    out["exact"] = sum(1 for c in C.values() if c["gap"] < 1e-12)
    out["front_exact"] = sum(1 for c in C.values() if c["front_gap"] < 1e-12)
    return out


def _summary(C):
    p = _pooled(C)
    L = [f"  {k}: {d['n']} conditions, median {d['median']:.3f}, range {d['min']:.3f} to {d['max']:.3f}" for k, d in p.items() if isinstance(d, dict)]
    L.append(f"  screen exact on {p['exact']} of {len(C)}; 5k front exact on {p['front_exact']} of {len(C)}")
    return L, p


def dev():
    """Development (seen data): every committed condition of 5b to 5k, DFN@10 read as the 100-cycle run's prefix and charged k/100."""
    bound = {(r["cond"], r["j"]): r["u"] for r in R._load(EXP / "prescreen" / "bound.jsonl")}
    rk = P._committed_rkt()
    C = {}
    for c, runs in P._sand().committed_conditions().items():
        js = {j for j, _ in runs}
        rows, _ = rows_for(runs, {j: bound[(c, j)] for j in js if (c, j) in bound}, {j: rk.get((c, j), 0.0) for j in js})
        C[c] = condition(rows)
    for f in ("prescreen", "edge"):
        by = {}
        for r in R._load(EXP / f / "bench.jsonl"):
            by.setdefault(r["cond"], {})[(r["j"], r["what"])] = r
        for c, runs in by.items():
            s, rate = G._parse(c)
            us, kt, _ = E._u_and_rkt(runs, s, rate)
            rows, _ = rows_for(runs, us, kt)
            C[c] = condition(rows)
    L = [f"cell-fidelity milestone 5l, development (24 conditions seen by milestones 5b to 5k; DFN@{K} read as the first {K} cycles"
         f" of each DFN@100 run and charged {K}/100 of its time)", ""]
    L += [_line(c, C[c]) for c in sorted(C)]
    sl, p = _summary(C)
    L += ["", "Pooled over conditions:"] + sl
    L += ["Verdict functions on development data (not verdicts): " + ", ".join(f"{k} {w}" for k, w in verdicts(C).items())]
    (HERE / "dev.txt").write_text("\n".join(L) + "\n")
    (HERE / "dev.json").write_text(json.dumps(dict(conditions=C, pooled=p), indent=1) + "\n")
    print("\n".join(L))


# ---------- fresh conditions (pybamm) ----------

def _run(job):
    c, j, what, x = job
    s, rate = G._parse(c)
    cycles = K if what == f"DFN{K}" else 100
    r = G._spawn(dict(x=x, set=s, rate=rate, what="DFN", cycles=cycles))
    r.pop("copied", None)
    return dict(cond=c, set=s, rate=rate, j=j, what=what, x=x, **r)


def bench():
    kept = json.loads((HERE / "probe.json").read_text())["kept"]
    path = HERE / "bench.jsonl"
    xs = G.designs()
    done = {(r["cond"], r["j"], r["what"]) for r in R._load(path)}
    jobs = [(c, j, w, xs[j]) for c in kept for j in range(len(xs)) for w in ("DFN", f"DFN{K}") if (c, j, w) not in done]
    G._run = _run
    G._write(path, jobs)


def report():
    kept = json.loads((HERE / "probe.json").read_text())["kept"]
    by = {}
    for r in R._load(HERE / "bench.jsonl"):
        by.setdefault(r["cond"], {})[(r["j"], r["what"])] = r
    L = [f"cell-fidelity milestone 5l: retention from a {K}-cycle DFN run, on fresh conditions", "",
         "Probe (baseline design, 2 cycles): " + ", ".join(f"{G.cid(s, r)} {'ok' if G.cid(s, r) in kept else 'fails'}" for s, r in CONDITIONS), ""]
    C, extra = {}, {}
    for c in kept:
        runs = by.get(c, {})
        # 5g's pool() wants an SPMe V0 run per design; this bench has none, so stand the DFN run in for it (pool membership only)
        for (j, w), r in list(runs.items()):
            if w == "DFN":
                runs.setdefault((j, "V0"), r)
        s, rate = G._parse(c)
        us, kt, t = E._u_and_rkt(runs, s, rate)
        rows, dropped = rows_for(runs, us, kt, short_key=f"DFN{K}")
        if not rows:
            continue
        prefix = max(abs(runs[(r["j"], f"DFN{K}")]["cycle_wh"][i] / runs[(r["j"], "DFN")]["cycle_wh"][i] - 1)
                     for r in rows for i in range(K))
        C[c] = condition(rows)
        extra[c] = dict(dropped=dropped, seconds_u_rkt=t, prefix_max_rel_diff=prefix,
                        rows=[{k: r[k] for k in ("j", "u", "rkt", "score", "bol", "util", "ret", "short", "ext", "tk", "t100")} for r in rows])
        L.append(_line(c, C[c]) + f"\n  dropped: {dropped}; separate DFN@{K} against the DFN@100 run's first {K} cycles: max relative difference {prefix:.2e}")
    sl, p = _summary(C)
    vd = verdicts(C) if C else {}
    L += ["", "Pooled over conditions:"] + sl + ["", "Verdicts: " + ", ".join(f"{k} {w}" for k, w in vd.items())]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(kept=kept, conditions=C, pooled=p, verdicts=vd, extra=extra), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    cmd = sys.argv[1:2]
    if cmd == ["dev"]:
        dev()
    elif cmd in (["probe"], ["bench"]):
        P._use_gate_machinery(CONDITIONS)
        G.HERE, G.SOBOL_SEED = HERE, SOBOL_SEED
        G.probe() if cmd == ["probe"] else bench()
    elif cmd == ["report"]:
        report()
    else:
        print(__doc__)
