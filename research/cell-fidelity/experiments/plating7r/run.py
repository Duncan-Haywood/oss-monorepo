"""Milestone 7r: a pre-registered sweep of the plating reaction rate on Mohtat2020 and Ecker2015.

    WORKERS=3 OMP_NUM_THREADS=1 python experiments/plating7r/run.py probe   # 2 cells x 4 multipliers x 4 designs x 20 cycles
    python experiments/plating7r/run.py choose            # the probe rule per cell -> choose.json (stdlib)
    WORKERS=3 OMP_NUM_THREADS=1 python experiments/plating7r/run.py bench   # kept conditions, 56 designs to cycle 100
    python experiments/plating7r/run.py rows              # 7p's rows code (lawfloor e, drift7c O1..O3 and m; 4 cores)
    python experiments/plating7r/run.py report            # H317 to H321 -> results.txt, summary.json (stdlib)

7p found that PyBaMM's Mohtat2020 and Ecker2015 cells barely fade under 5zk's protocol (0.5% of n_Li lost from cycle 2
to 20, against 4.8 to 17% on the four committed sets) and 7q excluded the only cell that did fade (Ramadass2004, OCP
poles). Plating is 96 to 99.9% of the lithium these cells lose, so the lever is the plating reaction: this step scales
the plating exchange-current density, and nothing else, by a fixed ladder of multipliers, keeps the smallest one per
cell that makes the probe designs fade like the committed sets, and puts the kept cells through 7p's code unchanged.
Mohtat2020 ships a constant plating exchange-current density (1e-3 A/m2); Ecker2015 ships OKane2020's F k c_e with its
own k = 1e-10 m/s (OKane2022's k is 1e-9). The multiplier scales whichever the cell carries.
Plan in ../../LOG.md (7r plan).
"""
import importlib.util
import json
import math
import os
import statistics
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
WORKERS = int(os.environ.get("WORKERS", "3"))
CELL = "000"
KEY = "Exchange-current density for plating [A.m-2]"
# fixed in the plan, before any probe: 7p's lowest-current condition of each cell, and the multiplier ladder
CELLS = ("Mohtat2020@3x", "Ecker2015@2x")
MULTS = (3.0, 10.0, 30.0, 100.0)
BASE_FADE = {"Mohtat2020@3x": 0.0048, "Ecker2015@2x": 0.0053}   # 7p's probe at multiplier 1 (sets7p/choose.json)
N_PROBE, PROBE_CYCLES = 4, 20
FADE_MIN, FADE_MAX = 0.03, 0.20   # 5c's fading rule; the committed sets sit at 4.8 to 17%
N_RUN = 56


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


def _s7p():
    return _mod("sets7p_run", EXP / "sets7p" / "run.py")


# ---------- pure helpers (stdlib; tested) ----------

def probe_fade(rows, n_li):
    """(finished, plates, median fade) for one condition's probe rows, 7p's arithmetic."""
    ok = [r for r in rows if r.get("ok") and r.get("ok_cycles", 0) >= PROBE_CYCLES]
    plates = bool(ok) and all(sum(r["pl_node"][1]) > 0 and sum(r["pl_node"][9]) > 0 for r in ok)
    f = statistics.median((r["lost_mol"][PROBE_CYCLES - 1] - r["lost_mol"][1]) / n_li[r["j"]] for r in ok) if ok else None
    return len(ok), plates, f


def passes(n_ok, plates, f, n=N_PROBE):
    return n_ok == n and plates and f is not None and FADE_MIN <= f <= FADE_MAX


def choose(res):
    """Per cell, the smallest multiplier that passes. res: {(cond, mult): (n_ok, plates, fade)}."""
    out = {}
    for c in CELLS:
        for f in MULTS:
            if (c, f) in res and passes(*res[(c, f)]):
                out[c] = f
                break
    return out


def monotone_slope(fades):
    """fades: [(mult, fade)] including multiplier 1. (strictly rising?, log-log slope from the first to last point)."""
    pts = sorted((m, v) for m, v in fades if v is not None and v > 0)
    rising = len(pts) == len(fades) and all(b[1] > a[1] for a, b in zip(pts, pts[1:]))
    slope = (math.log(pts[-1][1] / pts[0][1]) / math.log(pts[-1][0] / pts[0][0])) if len(pts) >= 2 else None
    return rising, slope


def verdict(sup, ref):
    return "supported" if sup else ("refuted" if ref else "inconclusive")


# ---------- pybamm child: depth's (5zk's) simulate with the plating exchange current scaled ----------

def child(job, cycles):
    c, j, x, mult = job
    D = _mod("depth_run", EXP / "depth" / "run.py")
    D.CYCLES = cycles
    fc = D.B._fc()             # _fc() reloads frontcut on every call, so the patched module is pinned below
    TR = fc.G.TR
    orig = TR.params

    def params(xx, s, _o=orig):
        pv, copied, cur = _o(xx, s)
        v = pv[KEY]
        if callable(v):
            pv.update({KEY: (lambda c_e, c_Li, T, _v=v: mult * _v(c_e, c_Li, T))})
        else:
            pv.update({KEY: mult * float(v)})
        return pv, copied, cur

    TR.params = params
    D.B._fc = lambda: fc
    out = D.simulate((c, j, x))
    out["mult"] = mult
    return out


def _spawn(job, cycles):
    c, j, x, mult = job
    try:
        p = subprocess.run([sys.executable, str(HERE / "run.py"), "child", json.dumps(job), str(cycles)],
                           capture_output=True, text=True, timeout=3600)
        if p.returncode == 0 and p.stdout.strip():
            return json.loads(p.stdout.strip().splitlines()[-1])
        err = f"exit {p.returncode}: {p.stderr.strip()[-160:]}"
    except subprocess.TimeoutExpired:
        err = "timeout 3600s"
    return dict(cond=c, j=j, x=x, mult=mult, ok=False, error=err, seconds=None)


def _run(jobs, path, cycles):
    done = {(r["cond"], r["mult"], r["j"]) for r in _load(path) if r.get("ok")} if path.exists() else set()
    todo = [jb for jb in jobs if (jb[0], jb[3], jb[1]) not in done]
    print(f"{len(todo)} runs to go", flush=True)
    with ThreadPoolExecutor(WORKERS) as ex, path.open("a") as fh:
        for r in ex.map(lambda jb: _spawn(jb, cycles), todo):
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            print(r["cond"], r["mult"], r["j"], "ok" if r["ok"] else r["error"], r.get("ok_cycles"), r.get("seconds"),
                  flush=True)


def _bal():
    return {(r["cond"], r["j"]): r for r in _load(EXP / "sets7p" / "balance.jsonl")}


def probe():
    bal = _bal()
    _run([(c, j, bal[(c, j)]["x"], f) for c in CELLS for f in MULTS for j in range(N_PROBE)], HERE / "probe.jsonl",
         PROBE_CYCLES)


def _probe_res():
    bal = _bal()
    rs = _load(HERE / "probe.jsonl")
    res = {}
    for c in CELLS:
        n_li = {j: bal[(c, j)]["n_li"] for j in range(N_PROBE)}
        for f in MULTS:
            res[(c, f)] = probe_fade([r for r in rs if r["cond"] == c and r["mult"] == f], n_li)
    return res


def choose_cmd():
    res = _probe_res()
    kept = choose(res)
    (HERE / "choose.json").write_text(json.dumps(dict(
        results={f"{c}*{f:g}": dict(finished=v[0], plates=v[1], fade=v[2]) for (c, f), v in res.items()},
        kept=kept), indent=1) + "\n")
    for (c, f), v in res.items():
        print(f"{c:16s} x{f:<5g} finished {v[0]}/4 plates {v[1]!s:5s} fade {v[2] if v[2] is None else round(v[2], 4)}"
              f"  {'pass' if passes(*v) else 'fail'}")
    print("kept:", kept)


def bench():
    bal = _bal()
    kept = json.loads((HERE / "choose.json").read_text())["kept"]
    _run([(c, j, bal[(c, j)]["x"], f) for c, f in kept.items() for j in range(N_RUN)], HERE / "bench.jsonl", 100)


# ---------- rows: 7p's code, pointed at sets7p's balance and OCP tables (these cells' tables do not depend on the
# plating rate), reading this step's bench ----------

def _job(r):
    return _s7p()._job(r)


def rows():
    kept = json.loads((HERE / "choose.json").read_text())["kept"]
    fin = {}
    for r in _load(HERE / "bench.jsonl"):
        if r["cond"] in kept and r["mult"] == kept[r["cond"]] and r.get("ok") and r.get("ok_cycles", 0) >= 100:
            fin[(r["cond"], r["j"])] = r
    with Pool(4) as p:
        res = p.map(_job, list(fin.values()))
    order = list(kept)
    out = []
    for lf, dr in res:
        c = dr["cells"][CELL]
        out.append(dict(cond=dr["cond"], set=dr["set"], j=dr["j"], O1=dr["O1"], O2=dr["O2"], O3=dr["O3"], m=c["m"],
                        E={k: v for k, v in lf["cells"][CELL]["eL"].items()}))
    out.sort(key=lambda o: (order.index(o["cond"]), o["j"]))
    (HERE / "rows.json").write_text(json.dumps(out) + "\n")
    print(len(out), "designs;", {c: sum(o["cond"] == c for o in out) for c in kept})


# ---------- report (stdlib) ----------

def report():
    S = _s7p()
    H = _mod("fresh7h_run", EXP / "fresh7h" / "run.py")
    spearman, lstsq = S._stats()
    res = _probe_res()
    kept = json.loads((HERE / "choose.json").read_text())["kept"]
    L = ["cell-fidelity milestone 7r: the plating exchange-current density scaled by a fixed ladder on Mohtat2020@3x and "
         "Ecker2015@2x;", "probe: designs 0 to 3 of 7p's pool (Sobol seed 41), 20 cycles, 5zk's x-resolved DFN (SEI + "
         "plating) bench; kept: the smallest multiplier per cell", f"with median fade (cycle 2 to 20, share of n_Li) in "
         f"[{FADE_MIN}, {FADE_MAX}]; kept cells benched to cycle 100 and put through 7p's code. PyBaMM 26.10.1.1.", "",
         f"{'cell':16s}{'mult':>6s}{'done':>6s}{'plates':>8s}{'fade':>9s}  probe"]
    fades = {}
    for c in CELLS:
        L.append(f"{c:16s}{1:6g}{'4':>6s}{'True':>8s}{BASE_FADE[c]:9.4f}  (7p)")
        fades[c] = [(1.0, BASE_FADE[c])]
        for f in MULTS:
            n, pl, v = res[(c, f)]
            fades[c].append((f, v))
            L.append(f"{c:16s}{f:6g}{n:6d}{pl!s:>8s}{(v if v is not None else float('nan')):9.4f}  "
                     f"{'pass' if passes(n, pl, v) else 'fail'}")
    mono = {c: monotone_slope(fades[c]) for c in CELLS}
    L += ["", "fade against multiplier: " + "; ".join(
        f"{c} rising {mono[c][0]}, log-log slope {mono[c][1]:.2f}" if mono[c][1] is not None else f"{c} -" for c in CELLS),
          "", f"kept: {', '.join(f'{c} x{f:g}' for c, f in kept.items()) or 'none'}"]
    V = dict(H317=verdict(len(kept) == len(CELLS), not kept),
             H318=verdict(all(mono[c][0] and mono[c][1] is not None and 0.5 <= mono[c][1] <= 1.5 for c in CELLS),
                          all(not mono[c][0] for c in CELLS)))
    data = dict(probe={f"{c}*{f:g}": list(v) for (c, f), v in res.items()}, kept=kept,
                mono={c: list(v) for c, v in mono.items()})
    if kept and (HERE / "rows.json").exists():
        raw = json.loads((HERE / "rows.json").read_text())
        rows_, lines = [], {}
        for c in kept:
            st = S._parse(c)[0]
            mine = [o for o in raw if o["cond"] == c]
            pools = S.split_pools([o["j"] for o in mine])
            pool_of = {j: p for p, js in pools.items() for j in js}
            rs = [dict(o, pool=pool_of[o["j"]], E={int(k): v for k, v in o["E"].items()}) for o in mine
                  if o["j"] in pool_of]
            rs, lines[st] = S.correct(rs, spearman, lstsq)
            rows_ += rs
        new_sets = [S._parse(c)[0] for c in kept]
        by = lambda st, p: [r for r in rows_ if r["set"] == st and r["pool"] == p]
        lopo = {rule: [dict(H.refit([by(st, q) for q in S.POOLS if q != p], by(st, p), rule), set=st, pool=p)
                       for st in new_sets for p in S.POOLS] for rule in ("theta", "theta50", "U")}
        h7 = json.loads((EXP / "fresh7h" / "summary.json").read_text())["lopo5"]
        old = {rule: [dict(set=f["set"], pool=f["pool"], cycles=float(f["cycles"]), met=bool(f["met"])) for f in h7[rule]]
               for rule in ("theta", "theta50", "U")}
        pair = {}
        for a in ("theta", "theta50"):
            p4, pn = S.paired(old[a], old["U"]), S.paired(lopo[a], lopo["U"])
            pair[a] = {}
            for name, pr in (("four", p4), ("new", pn), ("all", p4 + pn)):
                pos, neg, p = S.sign_test([r["d"] for r in pr])
                per_set = {s: sum(r["d"] for r in pr if r["set"] == s) / sum(1 for r in pr if r["set"] == s)
                           for s in sorted({r["set"] for r in pr})}
                pair[a][name] = dict(n=len(pr), mean=sum(r["d"] for r in pr) / len(pr),
                                     boot=S.set_boot(pr) if len({r["set"] for r in pr}) > 1 else None,
                                     cheaper=neg, dearer=pos, sign_p=p, met_a=sum(r["met_a"] for r in pr),
                                     met_b=sum(r["met_b"] for r in pr), per_set=per_set)
        agg = lambda fs: dict(met=sum(f["met"] for f in fs), n=len(fs), cycles=sum(f["cycles"] for f in fs) / len(fs))
        per = {st: {rule: agg([f for f in lopo[rule] if f["set"] == st]) for rule in lopo} for st in new_sets}
        rho = {}
        for st in new_sets:
            o3 = [r for r in rows_ if r["set"] == st and r["pool"] in S.POOLS[:S.N_OLD]]
            rho[st] = {o: spearman([r[o] for r in o3], [r["m"] for r in o3]) for o in ("O1", "O2", "O3")}
        E = {st: dict(q75_10=H.quant([r["E"][10] for r in rows_ if r["set"] == st]),
                      q75_50=H.quant([r["E"][50] for r in rows_ if r["set"] == st]),
                      med_10=statistics.median(r["E"][10] for r in rows_ if r["set"] == st),
                      n=sum(1 for r in rows_ if r["set"] == st),
                      med_m=statistics.median(r["m"] for r in rows_ if r["set"] == st),
                      med_sc=statistics.median(abs(r["mC"] - 1) for r in rows_ if r["set"] == st)) for st in new_sets}
        allp = pair["theta"]["all"]
        V.update(
            H319=verdict(all(E[st]["q75_10"] <= 0.2 for st in new_sets), any(E[st]["q75_10"] > 1 for st in new_sets)),
            H320=verdict(allp["boot"][1] < 0, allp["mean"] >= 0),
            H321=verdict(all(per[st]["theta"]["met"] >= 4 for st in new_sets),
                         any(per[st]["theta"]["met"] <= 2 for st in new_sets)))
        L += ["", f"{'set':14s}{'n':>4s}{'q75 E10':>9s}{'med E10':>9s}{'q75 E50':>9s}{'med m':>8s}{'med|mC-1|':>10s}"
                  "   pick   rho(O1, O2, O3 ; m) on pools 1-3"]
        for st in new_sets:
            e = E[st]
            L.append(f"{st:14s}{e['n']:4d}{e['q75_10']:9.3f}{e['med_10']:9.3f}{e['q75_50']:9.3f}{e['med_m']:8.3f}"
                     f"{e['med_sc']:10.3g}   {lines[st][0]:5s}  " + "  ".join(f"{rho[st][o]:+.2f}" for o in ("O1", "O2", "O3")))
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
        L += ["", f"per-set mean difference, theta minus U: " + ", ".join(
            f"{s} {v:+.2f}" for s, v in pair["theta"]["all"]["per_set"].items())]
        data.update(pools=E, rho=rho, lines={s: list(v) for s, v in lines.items()}, per_set=per, paired=pair, lopo5=lopo)
    L += ["", f"H317 (some multiplier in {list(MULTS)} makes each cell pass the probe): {V['H317']}",
          f"H318 (fade rises with the multiplier on each cell, log-log slope 0.5 to 1.5): {V['H318']}"]
    for h, t in (("H319", "the forecast law works on each kept cell, q75 E10 <= 0.2"),
                 ("H320", "the all-set bootstrap interval of theta - U lies below zero"),
                 ("H321", "theta meets >= 4 of 5 lopo5 folds on each kept cell")):
        L.append(f"{h} ({t}): {V.get(h, 'not run (no kept cell or no rows)')}")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(verdicts=V, **data), indent=1, default=str) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    if sys.argv[1] == "child":
        print(json.dumps(child(json.loads(sys.argv[2]), int(sys.argv[3]))))
    else:
        {"probe": probe, "choose": choose_cmd, "bench": bench, "rows": rows, "report": report}[sys.argv[1]]()
