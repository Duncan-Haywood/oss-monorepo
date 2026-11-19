"""Milestone 7p: a fifth and sixth parameter set for the across-chemistry interval.

    python experiments/sets7p/run.py tables              # balance tables of the candidate conditions (pybamm, no simulation)
    WORKERS=3 OMP_NUM_THREADS=1 python experiments/sets7p/run.py probe   # 4 designs x 20 cycles per candidate
    python experiments/sets7p/run.py choose              # the probe rule -> choose.json (stdlib)
    WORKERS=3 OMP_NUM_THREADS=1 python experiments/sets7p/run.py bench   # DFN (SEI + plating) to cycle 100, x-resolved
    python experiments/sets7p/run.py rows                # 7b's e at every window and 7c's drift inputs (4 cores)
    python experiments/sets7p/run.py report              # H309 to H312 -> results.txt, summary.json (stdlib)

7i's paper draft found the threshold rule cheaper than a uniform run length on 14 of 20 leave-one-pool-out folds (sign
test p = 0.031) but its mean saving, bootstrapped over the four parameter sets, ran from -8.5 to +0.25 cycles per design:
consistent across folds, not shown across chemistries. Every later step (7j to 7o) built the runner; none added a set.
This step adds cells: candidate conditions in a fixed order, kept by a probe rule that reads no triage label, then for
each of the first two kept (different cells) 50 designs simulated to cycle 100 with 5zk's x-resolved bench, unchanged,
split in design order into five pools sized as the four committed sets' (10, 8, 8, 8, 16), and put through the same
code as 7h's lopo5: 7c's correction (leave-one-out on the first three pools, fitted on them for pools four and five),
then the theta-tight, theta50 and uniform rules with nested margins, each pool held out in turn.
Plan in ../../LOG.md (7p plan).
"""
import importlib.util
import json
import math
import os
import random
import statistics
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
PAPER = EXP.parent / "paper"
WORKERS = int(os.environ.get("WORKERS", "3"))
CELL = "000"
SOBOL_SEED = 41               # used by no milestone
# fixed in the plan, before any probe: cells no triage step used, in the order below, at rising currents
CANDIDATES = ("Mohtat2020@3x", "Mohtat2020@4x", "Ecker2015@2x", "Ecker2015@3x", "Marquis2019@2x", "Marquis2019@3x",
              "Ramadass2004@1x", "Ramadass2004@2x")
N_PROBE, PROBE_CYCLES = 4, 20
FADE_MIN = 0.03               # median lithium lost from cycle 2 to 20, as a share of n_Li (5c's "fading" rule)
N_KEEP = 2
N_RUN = 56                    # designs run per kept condition (6 spare for failures)
SIZES = (10, 8, 8, 8, 16)     # per set, as 5zk, 5zy, 5zz, 7g and 7h
POOLS = ("p1", "p2", "p3", "p4", "p5")
N_OLD = 3                     # the first three pools play 5zk, 5zy and 5zz (leave-one-out correction)
OLD_SETS = ("Ai2020", "Chen2020", "OKane2022", "NCA_Kim2011")
B_BOOT, BOOT_SEED = 20000, 7101   # paper/tables.py's


def _mod(name, path):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


def _load(path):
    with open(path) as fh:
        return [json.loads(l) for l in fh if l.strip()]


def _parse(c):
    s, rate = c.rsplit("@", 1)
    return s, float(rate[:-1])


# ---------- pure helpers (stdlib; tested) ----------

def probe_ok(rows, n_li, n=N_PROBE, fade_min=FADE_MIN):
    """(keep, why) for one candidate's probe rows: every design finished PROBE_CYCLES cycles with plating in cycles 2
    and 10, and the median lithium lost from cycle 2 to 20 is at least fade_min of n_Li."""
    ok = [r for r in rows if r.get("ok") and r.get("ok_cycles", 0) >= PROBE_CYCLES]
    if len(ok) < n:
        return False, f"{n - len(ok)} of {n} did not finish"
    if not all(sum(r["pl_node"][1]) > 0 and sum(r["pl_node"][9]) > 0 for r in ok):
        return False, "no plating at cycle 2 or 10"
    f = statistics.median((r["lost_mol"][PROBE_CYCLES - 1] - r["lost_mol"][1]) / n_li[r["j"]] for r in ok)
    return (f >= fade_min), f"fade {f:.4f}"


def choose(results, n_keep=N_KEEP):
    """First n_keep kept candidates in CANDIDATES order, at most one per cell."""
    out, cells = [], set()
    for c in CANDIDATES:
        if c in results and results[c][0] and _parse(c)[0] not in cells:
            out.append(c)
            cells.add(_parse(c)[0])
        if len(out) == n_keep:
            break
    return out


def split_pools(js, sizes=SIZES):
    """{pool: [j]} from the ok designs in design order; short of sum(sizes), the last pool is short."""
    js = sorted(js)
    out, i = {}, 0
    for p, k in zip(POOLS, sizes):
        out[p] = js[i:i + k]
        i += k
    return out


def correct(rows, spearman, lstsq, obs_names=("O1", "O2", "O3"), n_old=N_OLD):
    """mC per row, 7c's correction: leave-one-out over the first n_old pools, a fit on all of them for the rest.
    rows: one set's rows with pool, m, O1..O3. Returns (rows with mC, (pick, c0, c1) of the full fit)."""
    old = [r for r in rows if r["pool"] in POOLS[:n_old]]
    ms = [r["m"] for r in old]
    out = []
    for i, r in enumerate(old):
        idx = [k for k in range(len(old)) if k != i]
        y = [ms[k] for k in idx]
        best = max(obs_names, key=lambda o: abs(spearman([old[k][o] for k in idx], y)))
        c0, c1 = lstsq([[1.0, old[k][best]] for k in idx], y)
        out.append(dict(r, mC=c0 + c1 * r[best]))
    best = max(obs_names, key=lambda o: abs(spearman([r[o] for r in old], ms)))
    c0, c1 = lstsq([[1.0, r[best]] for r in old], ms)
    out += [dict(r, mC=c0 + c1 * r[best]) for r in rows if r["pool"] not in POOLS[:n_old]]
    return out, (best, c0, c1)


def paired(rows_a, rows_b):
    """Per fold (set, pool): cycles of rule a minus rule b, with each rule's met flag."""
    A = {(r["set"], r["pool"]): r for r in rows_a}
    Bm = {(r["set"], r["pool"]): r for r in rows_b}
    return [dict(set=k[0], pool=k[1], d=A[k]["cycles"] - Bm[k]["cycles"], met_a=bool(A[k]["met"]),
                 met_b=bool(Bm[k]["met"])) for k in sorted(A)]


def set_boot(rows, b=B_BOOT, seed=BOOT_SEED):
    """Percentile 95% interval of the mean paired difference, resampling whole sets (paper/tables.py's cluster_boot)."""
    groups = {}
    for r in rows:
        groups.setdefault(r["set"], []).append(r)
    names = sorted(groups)
    rng = random.Random(seed)
    vals = []
    for _ in range(b):
        pick = [r for _ in names for r in groups[rng.choice(names)]]
        vals.append(sum(r["d"] for r in pick) / len(pick))
    vals.sort()
    return vals[int(0.025 * b)], vals[int(0.975 * b) - 1]


def sign_test(diffs):
    pos = sum(1 for d in diffs if d > 0)
    neg = sum(1 for d in diffs if d < 0)
    n = pos + neg
    if n == 0:
        return pos, neg, 1.0
    k = min(pos, neg)
    return pos, neg, min(1.0, 2 * sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n)


# ---------- pybamm: tables, probe, bench ----------

def _fl():
    return _mod("freshlaw_run", EXP / "freshlaw" / "run.py")


def tables():
    FL = _fl()
    FL.HERE, FL.SOBOL_SEED, FL.CONDITIONS = HERE, SOBOL_SEED, CANDIDATES
    FL.tables()


def _child(job, cycles):
    c, j, x = job
    try:
        p = subprocess.run([sys.executable, str(EXP / "depth" / "run.py"), "child", json.dumps([c, j, x]), str(cycles)],
                           capture_output=True, text=True, timeout=3600)
        if p.returncode == 0 and p.stdout.strip():
            return json.loads(p.stdout.strip().splitlines()[-1])
        err = f"exit {p.returncode}: {p.stderr.strip()[-160:]}"
    except subprocess.TimeoutExpired:
        err = "timeout 3600s"
    return dict(cond=c, j=j, x=x, ok=False, error=err, seconds=None)


def _run(jobs, path, cycles):
    done = {(r["cond"], r["j"]) for r in _load(path) if r.get("ok")} if path.exists() else set()
    todo = [jb for jb in jobs if (jb[0], jb[1]) not in done]
    print(f"{len(todo)} runs to go", flush=True)
    with ThreadPoolExecutor(WORKERS) as ex, path.open("a") as fh:
        for r in ex.map(lambda jb: _child(jb, cycles), todo):
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            print(r["cond"], r["j"], "ok" if r["ok"] else r["error"], r.get("ok_cycles"), r.get("seconds"), flush=True)


def _bal():
    return {(r["cond"], r["j"]): r for r in _load(HERE / "balance.jsonl")}


def probe():
    bal = _bal()
    _run([(c, j, bal[(c, j)]["x"]) for c in CANDIDATES for j in range(N_PROBE)], HERE / "probe.jsonl", PROBE_CYCLES)


def choose_cmd():
    bal = _bal()
    rs = _load(HERE / "probe.jsonl")
    res = {}
    for c in CANDIDATES:
        rows = [r for r in rs if r["cond"] == c]
        res[c] = probe_ok(rows, {j: bal[(c, j)]["n_li"] for j in range(N_PROBE)})
    kept = choose(res)
    (HERE / "choose.json").write_text(json.dumps(dict(results={c: list(v) for c, v in res.items()}, kept=kept),
                                                 indent=1) + "\n")
    for c in CANDIDATES:
        print(f"{c:18s} {'keep' if res[c][0] else 'drop'}  {res[c][1]}")
    print("kept:", kept)


def bench():
    bal = _bal()
    kept = json.loads((HERE / "choose.json").read_text())["kept"]
    _run([(c, j, bal[(c, j)]["x"]) for c in kept for j in range(N_RUN)], HERE / "bench.jsonl", 100)


# ---------- rows ----------

def _deps():
    DC = _mod("drift7c_run", EXP / "drift7c" / "run.py")
    SF = DC.LF.WL.SF
    if not getattr(SF, "_sets7p", False):
        # lawfloor's and drift7c's _job read balance and OCP tables from crossset/ or calmap/ only; these designs'
        # tables live here, so the loader is pointed at this directory (the per-design code runs unchanged)
        orig = SF._bal
        SF._bal = lambda d: orig(HERE)
        SF._sets7p = True
    return DC


def _job(r):
    DC = _deps()
    return DC.LF._job(("7p", r)), DC._job(("7p", r))


def rows():
    kept = json.loads((HERE / "choose.json").read_text())["kept"]
    fin = {}
    for r in _load(HERE / "bench.jsonl"):
        if r["cond"] in kept and r.get("ok") and r.get("ok_cycles", 0) >= 100:
            fin[(r["cond"], r["j"])] = r
    with Pool(4) as p:
        res = p.map(_job, list(fin.values()))
    out = []
    for lf, dr in res:
        c = dr["cells"][CELL]
        out.append(dict(cond=dr["cond"], set=dr["set"], j=dr["j"], O1=dr["O1"], O2=dr["O2"], O3=dr["O3"], m=c["m"],
                        E={k: v for k, v in lf["cells"][CELL]["eL"].items()}))
    out.sort(key=lambda o: (kept.index(o["cond"]), o["j"]))
    (HERE / "rows.json").write_text(json.dumps(out) + "\n")
    print(len(out), "designs;", {c: sum(o["cond"] == c for o in out) for c in kept})


# ---------- report (stdlib) ----------

def verdict(sup, ref):
    return "supported" if sup else ("refuted" if ref else "inconclusive")


def report():
    H = _mod("fresh7h_run", EXP / "fresh7h" / "run.py")
    kept = json.loads((HERE / "choose.json").read_text())["kept"]
    raw = json.loads((HERE / "rows.json").read_text())
    from statistics import median
    spearman, lstsq = _stats()
    rows, lines = [], {}
    for c in kept:
        st = _parse(c)[0]
        mine = [o for o in raw if o["cond"] == c]
        pools = split_pools([o["j"] for o in mine])
        pool_of = {j: p for p, js in pools.items() for j in js}
        rs = [dict(o, pool=pool_of[o["j"]], E={int(k): v for k, v in o["E"].items()}) for o in mine if o["j"] in pool_of]
        rs, lines[st] = correct(rs, spearman, lstsq)
        rows += rs
    new_sets = [_parse(c)[0] for c in kept]
    by = lambda st, p: [r for r in rows if r["set"] == st and r["pool"] == p]
    lopo = {rule: [dict(H.refit([by(st, q) for q in POOLS if q != p], by(st, p), rule), set=st, pool=p)
                   for st in new_sets for p in POOLS] for rule in ("theta", "theta50", "U")}
    h7 = json.loads((EXP / "fresh7h" / "summary.json").read_text())["lopo5"]
    old = {rule: [dict(set=f["set"], pool=f["pool"], cycles=float(f["cycles"]), met=bool(f["met"])) for f in h7[rule]]
           for rule in ("theta", "theta50", "U")}
    pair = {}
    for a in ("theta", "theta50"):
        p4 = paired(old[a], old["U"])
        pn = paired(lopo[a], lopo["U"])
        p6 = p4 + pn
        pair[a] = {}
        for name, pr in (("four", p4), ("new", pn), ("all", p6)):
            pos, neg, p = sign_test([r["d"] for r in pr])
            per_set = {s: sum(r["d"] for r in pr if r["set"] == s) / sum(1 for r in pr if r["set"] == s)
                       for s in sorted({r["set"] for r in pr})}
            pair[a][name] = dict(n=len(pr), mean=sum(r["d"] for r in pr) / len(pr),
                                 boot=set_boot(pr) if len({r["set"] for r in pr}) > 1 else None,
                                 cheaper=neg, dearer=pos, sign_p=p, met_a=sum(r["met_a"] for r in pr),
                                 met_b=sum(r["met_b"] for r in pr), per_set=per_set)
    agg = lambda fs: dict(met=sum(f["met"] for f in fs), n=len(fs), cycles=sum(f["cycles"] for f in fs) / len(fs))
    per = {st: {rule: agg([f for f in lopo[rule] if f["set"] == st]) for rule in lopo} for st in new_sets}
    rho = {}
    for st in new_sets:
        old_rows = [r for r in rows if r["set"] == st and r["pool"] in POOLS[:N_OLD]]
        rho[st] = {o: spearman([r[o] for r in old_rows], [r["m"] for r in old_rows]) for o in ("O1", "O2", "O3")}
    six = pair["theta"]["all"]
    V = dict(
        H309=verdict(six["boot"][1] < 0, six["mean"] >= 0),
        H310=verdict(all(per[st]["theta"]["met"] >= 4 for st in new_sets),
                     any(per[st]["theta"]["met"] <= 2 for st in new_sets)),
        H311=verdict(all(pair["theta"]["new"]["per_set"][st] < 0 for st in new_sets),
                     all(pair["theta"]["new"]["per_set"][st] > 0 for st in new_sets)),
        H312=verdict(all(max(abs(v) for v in rho[st].values()) >= 0.4 for st in new_sets),
                     all(max(abs(v) for v in rho[st].values()) < 0.2 for st in new_sets)))
    E = {st: dict(q75_10=H.quant([r["E"][10] for r in rows if r["set"] == st]),
                  q75_50=H.quant([r["E"][50] for r in rows if r["set"] == st]),
                  n=sum(1 for r in rows if r["set"] == st),
                  med_sc=median(abs(r["mC"] - 1) for r in rows if r["set"] == st)) for st in new_sets}
    L = ["cell-fidelity milestone 7p: a fifth and sixth parameter set. Per kept condition, designs 0 to 55 (Sobol "
         f"seed {SOBOL_SEED}) simulated", "to cycle 100 with 5zk's x-resolved DFN (SEI + plating) bench, split in design "
         "order into pools of 10, 8, 8, 8, 16 (the first 50 that finish; short pools stay short);", "7c's correction, then 7h's lopo5 (each pool held out, nested "
         "margin from the other four). Cell 000; PyBaMM 26.10.1.1.", "",
         f"kept conditions: {', '.join(kept)}", "",
         f"{'set':14s}{'n':>4s}{'q75 E10':>9s}{'q75 E50':>9s}{'med S_C':>9s}   pick   rho(O1, O2, O3 ; m) on pools 1-3"]
    for st in new_sets:
        e = E[st]
        L.append(f"{st:14s}{e['n']:4d}{e['q75_10']:9.3f}{e['q75_50']:9.3f}{e['med_sc']:>10.3g}   {lines[st][0]:5s}  "
                 + "  ".join(f"{rho[st][o]:+.2f}" for o in ("O1", "O2", "O3")))
    L += ["", f"{'lopo5 on the new sets':24s}" + "".join(f"{st:>22s}" for st in new_sets)]
    for rule in ("theta", "theta50", "U"):
        L.append(f"{rule:24s}" + "".join(f"{per[st][rule]['met']:>9d}/5 {per[st][rule]['cycles']:6.1f} cyc"
                                          for st in new_sets))
    L += ["", "paired lopo5 folds, threshold rule minus uniform (DFN cycles per design; negative = threshold cheaper):",
          f"{'rule':9s}{'sets':>6s}{'folds':>6s}{'mean':>8s}{'set bootstrap 95%':>22s}{'cheaper':>9s}{'dearer':>8s}"
          f"{'sign p':>8s}{'met a/b':>9s}"]
    for a in ("theta", "theta50"):
        for name in ("four", "new", "all"):
            d = pair[a][name]
            bt = f"{d['boot'][0]:+.2f} to {d['boot'][1]:+.2f}" if d["boot"] else "-"
            L.append(f"{a:9s}{name:>6s}{d['n']:6d}{d['mean']:+8.2f}{bt:>22s}{d['cheaper']:9d}{d['dearer']:8d}"
                     f"{d['sign_p']:8.3f}{d['met_a']:>5d}/{d['met_b']}")
    L += ["", f"per-set mean difference, theta minus U ({len(pair['theta']['all']['per_set'])} sets): " + ", ".join(
        f"{s} {v:+.2f}" for s, v in pair["theta"]["all"]["per_set"].items()), "",
          f"H309 (the all-set bootstrap interval of theta - U excludes zero, below): {V['H309']}",
          f"H310 (theta meets >= 4 of 5 lopo5 folds on each new set): {V['H310']}",
          f"H311 (theta cheaper than U on the mean of each new set's folds): {V['H311']}",
          f"H312 (7c's drift observables track m on each new set, max |rho| >= 0.4): {V['H312']}"]
    ph = posthoc(rows, new_sets)
    L += ["", "post hoc (after the report; not a hypothesis of the plan):"] + ph["lines"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(kept=kept, verdicts=V, posthoc=ph["data"], pools=E, rho=rho,
                                                       lines={s: list(v) for s, v in lines.items()}, per_set=per,
                                                       paired=pair, lopo5=lopo), indent=1, default=str) + "\n")
    print("\n".join(L))


def ocp_turns(v):
    """Direction changes of an OCP table over the grid, ignoring steps under 1 mV (a monotone table has none)."""
    d = [b - a for a, b in zip(v, v[1:]) if abs(b - a) >= 1e-3]
    return sum(1 for a, b in zip(d, d[1:]) if (a > 0) != (b > 0))


def posthoc(rows, new_sets):
    """Why the forecast law degenerates on a new cell: OCP-table monotonicity over the 0..1 grid every cell's
    lithium-law table inverts, for the eight candidates and the four committed sets, and the jump in each new
    design's R(L) table."""
    tabs = {}
    for d in ("crossset", "calmap", "sets7p"):
        for s, v in json.loads((EXP / d / "ocp.json").read_text())["sets"].items():
            tabs[s] = v
    data, lines = {}, [f"{'cell':14s}{'Un turns':>9s}{'Up turns':>9s}{'Un max V':>10s}{'Up range V':>16s}"]
    for s in sorted(tabs, key=lambda k: (k not in OLD_SETS, k)):
        v = tabs[s]
        data[s] = dict(un_turns=ocp_turns(v["Un"]), up_turns=ocp_turns(v["Up"]), un_max=max(v["Un"]),
                       up_min=min(v["Up"]), up_max=max(v["Up"]))
        lines.append(f"{s:14s}{data[s]['un_turns']:9d}{data[s]['up_turns']:9d}{data[s]['un_max']:10.2f}"
                     f"{data[s]['up_min']:8.2f}-{data[s]['up_max']:.2f}")
    for st in new_sets:
        e10 = sorted(r["E"][10] for r in rows if r["set"] == st)
        lines.append(f"{st}: E10 median {statistics.median(e10):.2f} (committed sets' q75 0.06 to 0.12); "
                     f"E50/E10 median {statistics.median(r['E'][50] / r['E'][10] for r in rows if r['set'] == st):.3f}")
        data[st + "_E10_median"] = statistics.median(e10)
    return dict(lines=lines, data=data)


def _stats():
    """drift7c's spearman and lawfloor's lstsq, copied exactly, so the report needs no pybamm chain."""
    def ranks(xs):
        o = sorted(range(len(xs)), key=lambda i: xs[i])
        r = [0.0] * len(xs)
        i = 0
        while i < len(o):
            j = i
            while j + 1 < len(o) and xs[o[j + 1]] == xs[o[i]]:
                j += 1
            for k in range(i, j + 1):
                r[o[k]] = (i + j) / 2 + 1
            i = j + 1
        return r

    def pearson(x, y):
        n = len(x)
        mx, my = sum(x) / n, sum(y) / n
        sxy = sum((a - mx) * (b - my) for a, b in zip(x, y))
        sxx = sum((a - mx) ** 2 for a in x)
        syy = sum((b - my) ** 2 for b in y)
        return sxy / math.sqrt(sxx * syy) if sxx > 0 and syy > 0 else 0.0

    def spearman(x, y):
        return pearson(ranks(x), ranks(y))

    def lstsq(rows, ys):
        p = len(rows[0])
        A = [[sum(r[i] * r[j] for r in rows) for j in range(p)] for i in range(p)]
        v = [sum(r[i] * y for r, y in zip(rows, ys)) for i in range(p)]
        for c in range(p):
            piv = max(range(c, p), key=lambda i: abs(A[i][c]))
            A[c], A[piv], v[c], v[piv] = A[piv], A[c], v[piv], v[c]
            for i in range(p):
                if i != c and A[c][c] != 0:
                    f = A[i][c] / A[c][c]
                    A[i] = [a - f * b for a, b in zip(A[i], A[c])]
                    v[i] -= f * v[c]
        return [v[i] / A[i][i] for i in range(p)]
    return spearman, lstsq


if __name__ == "__main__":
    {"tables": tables, "probe": probe, "choose": choose_cmd, "bench": bench, "rows": rows,
     "report": report}[sys.argv[1]]()
