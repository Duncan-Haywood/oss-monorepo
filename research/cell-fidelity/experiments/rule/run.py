"""Milestone 5e: the two-part rule from 5c and 5d on cells no number has been seen for.

    python experiments/rule/run.py probe     # baseline design, SPMe and DFN for 2 cycles on the candidates -> probe.json
    python experiments/rule/run.py bench     # 64 Sobol (seed 4) designs x SPMe/DFN@100 on the chosen cells, then V1 re-solves of stops (resumable)
    python experiments/rule/run.py report    # results.txt, summary.json (stdlib only)

The rule, labels and hypotheses H42 to H45 are fixed in ../../LOG.md (milestone 5e plan) before the bench. The design
mapping, protocol, areal current density and copied degradation keys are milestone 5b's (../transfer/run.py); the
SPMe solver variants are milestone 5d's (../solver/run.py), both imported unchanged.
"""
import importlib.util
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent

CANDIDATES = ("Ramadass2004", "Marquis2019", "Chen2020", "Prada2013", "ORegan2022")
N_CELLS = 2
SOBOL_SEED = 4
N_LOG2 = 6
WORKERS = int(os.environ.get("WORKERS", "3"))
GAP = 0.25
RUN_OF = 3
# post hoc replay: (bench file, parameter set or None for the row's own "set" field, sets to keep)
REPLAY = (("cycles/bench.jsonl", "OKane2022", ("OKane2022",)),
          ("transfer/bench.jsonl", None, ("Ecker2015", "Ai2020")),
          ("calibrate/bench.jsonl", None, ("Mohtat2020", "NCA_Kim2011")))


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


TR = _mod("transfer_run", EXP / "transfer" / "run.py")
SV = _mod("solver_run", EXP / "solver" / "run.py")
CR = TR.CR


# ---------- pure helpers (stdlib; tested) ----------

def choose_cells(probe, candidates=CANDIDATES, n=N_CELLS):
    """The plan's rule: the first n candidates whose SPMe and DFN probe runs both succeed."""
    return [s for s in candidates if probe.get(s, {}).get("SPMe", {}).get("ok") and probe.get(s, {}).get("DFN", {}).get("ok")][:n]


def screen(v0, v1):
    """Step 1 and 2 of the rule for one design. v0: SPMe@100 at defaults, v1: its V1 re-solve (or None).
    Returns (kind, score, r, used_v1): kind is 'ok', 'rescued' or 'fail'; failures score 0 with r None."""
    k = SV.kind(v0)
    if k == "ok":
        return "ok", _score(v0), v0["r_min"], False
    if k == "stop" and v1 is not None and SV.kind(v1) == "ok":
        return "rescued", _score(v1), v1["r_min"], True
    return "fail", 0.0, None, False


def _score(run):
    return CR.score_at(run, 100, run["mass_kg"])


def queue(rows):
    """Verify order: failures first (by index), then ascending r, ties by index. rows: list of dicts with kind, r."""
    fails = [i for i, r in enumerate(rows) if r["kind"] == "fail"]
    rest = sorted((i for i, r in enumerate(rows) if r["kind"] != "fail"), key=lambda i: (rows[i]["r"], i))
    return fails + rest


def mis_scored(score, dfn, gap=GAP):
    """Milestone 1's label on the screen score."""
    return score <= 0 or (dfn > 0 and (dfn - score) / dfn > gap)


def apply_rule(rows, run_of=RUN_OF):
    """rows: dicts with kind, score (screen), r, dfn. Returns the rule's outcome on the pool."""
    bad = [mis_scored(r["score"], r["dfn"]) for r in rows]
    verified, run = [], 0
    for i in queue(rows):
        verified.append(i)
        run = 0 if bad[i] else run + 1
        if run >= run_of:
            break
    vs = set(verified)
    merged = [r["dfn"] if i in vs else r["score"] for i, r in enumerate(rows)]
    pick = max(range(len(rows)), key=lambda i: (merged[i], -i))
    calls = len(verified) + (0 if pick in vs else 1)
    best = max(r["dfn"] for r in rows)
    nb = sum(bad)
    return dict(n=len(rows), n_bad=nb, n_verified=len(verified), calls=calls, verified_idx=verified,
                recall=(sum(1 for i in vs if bad[i]) / nb) if nb else None,
                pick=pick, pick_dfn=rows[pick]["dfn"], best_dfn=best,
                pick_gap=(best - rows[pick]["dfn"]) / best if best > 0 else None,
                missed=[i for i in range(len(rows)) if bad[i] and i not in vs])


def pick_variants(rows, res):
    """Extra, after the verdicts: two ways to read the answer off the same verified set.
    'best_verified': the best DFN@100 among the verified designs and the confirmed pick (no extra call).
    'iterate': while the merged argmax is unverified, verify it (one call each); return it. Returns gaps and calls."""
    best = res["best_dfn"]
    vs = set(res["verified_idx"]) | {res["pick"]}
    bv = max(rows[i]["dfn"] for i in vs)
    ver = set(res["verified_idx"])
    while True:
        merged = [r["dfn"] if i in ver else r["score"] for i, r in enumerate(rows)]
        p = max(range(len(rows)), key=lambda i: (merged[i], -i))
        if p in ver:
            break
        ver.add(p)
    return dict(best_verified_gap=(best - bv) / best, best_verified_calls=res["calls"],
                iterate_gap=(best - rows[p]["dfn"]) / best, iterate_calls=len(ver), iterate_pick=rows[p]["j"])


def verdict(values, ok, bad):
    """'supported' if every value passes ok, 'refuted' if any passes bad, else 'mixed'. None values are skipped."""
    v = [x for x in values if x is not None]
    if not v:
        return "untestable"
    if any(bad(x) for x in v):
        return "refuted"
    return "supported" if all(ok(x) for x in v) else "mixed"


# ---------- simulation (pybamm) ----------

def probe():
    from energy_cell import cell
    x = list(map(float, cell.BASELINE))
    out = {}
    for s in CANDIDATES:
        out[s] = {}
        for m in ("SPMe", "DFN"):
            r = TR._spawn(x, m, 2, s, timeout=900)
            out[s][m] = dict(ok=r["ok"], cycles=r["ok_cycles"], seconds=r["seconds"], error=(r.get("error") or None) and r["error"][:200],
                             r_min=r.get("r_min"), current_A=r.get("current_A"), copied=r.get("copied"))
            print(s, m, out[s][m]["ok"], out[s][m]["error"], flush=True)
    out["chosen"] = choose_cells(out)
    (HERE / "probe.json").write_text(json.dumps(out, indent=1) + "\n")
    print("chosen:", out["chosen"])


def designs():
    import numpy as np
    from scipy.stats import qmc
    from energy_cell import cell
    u = qmc.Sobol(d=4, scramble=True, seed=SOBOL_SEED).random_base2(N_LOG2)
    return [list(map(float, r)) for r in np.asarray(cell.BOUNDS[:, 0] + u * (cell.BOUNDS[:, 1] - cell.BOUNDS[:, 0]))]


def _run(job):
    s, j, what, x = job
    if what == "DFN":
        r = TR._spawn(x, "DFN", 100, s)
    else:
        r = SV._spawn(dict(what="run", x=x, set=s, variant=what))
    r.pop("copied", None)
    return dict(set=s, j=j, what=what, x=x, **r)


def _write(path, jobs):
    with ThreadPoolExecutor(WORKERS) as ex, path.open("a") as f:
        for r in ex.map(_run, jobs):
            if "exit -9" in (r.get("error") or ""):
                print(r["set"], r["j"], r["what"], "killed (-9), not recorded", flush=True)
                continue
            f.write(json.dumps(r) + "\n")
            f.flush()
            print(r["set"], r["j"], r["what"], r["ok"], r["ok_cycles"], r["seconds"] and round(r["seconds"], 1), flush=True)


def _load(path):
    return [json.loads(l) for l in path.read_text().splitlines()] if path.exists() else []


def bench():
    cells = json.loads((HERE / "probe.json").read_text())["chosen"]
    path = HERE / "bench.jsonl"
    xs = designs()
    done = {(r["set"], r["j"], r["what"]) for r in _load(path)}
    _write(path, [(s, j, w, xs[j]) for s in cells for w in ("V0", "DFN") for j in range(len(xs)) if (s, j, w) not in done])
    rows = _load(path)
    stops = [(r["set"], r["j"]) for r in rows if r["what"] == "V0" and SV.kind(r) == "stop"]
    done = {(r["set"], r["j"], r["what"]) for r in rows}
    _write(path, [(s, j, "V1", xs[j]) for s, j in stops if (s, j, "V1") not in done])


# ---------- report ----------

def pool(runs):
    """runs: {(j, what): run} for one cell -> rows for apply_rule, dropping designs whose DFN did not finish."""
    js = sorted({j for j, _ in runs})
    rows, dropped = [], []
    for j in js:
        d, v0 = runs.get((j, "DFN")), runs.get((j, "V0"))
        if not d or not v0 or SV.kind(d) != "ok":
            dropped.append(j)
            continue
        k, sc, r, used = screen(v0, runs.get((j, "V1")))
        rows.append(dict(j=j, kind=k, v0kind=SV.kind(v0), score=sc, r=r, used_v1=used, dfn=_score(d),
                         t_spme=(v0.get("seconds") or 0) + ((runs.get((j, "V1")) or {}).get("seconds") or 0),
                         t_dfn=d.get("seconds") or 0))
    return rows, dropped


def replay_runs():
    """Post hoc: the five committed cells, SPMe and DFN from their benches, V1 from milestone 5d's bench."""
    v1 = {}
    for r in _load(EXP / "solver" / "bench.jsonl"):
        if r.get("variant") == "V1":
            v1[(r["bench"], r["set"], r["j"])] = r
    out = {}
    for rel, pset, keep in REPLAY:
        for r in _load(EXP / rel):
            s = r.get("set") or pset
            if s not in keep or r.get("model") not in ("SPMe", "DFN"):
                continue
            c = out.setdefault(s, {})
            c[(r["j"], "V0" if r["model"] == "SPMe" else "DFN")] = r
            if r["model"] == "SPMe" and (rel, s, r["j"]) in v1:
                c[(r["j"], "V1")] = v1[(rel, s, r["j"])]
    return out


def _fmt(v, d=3):
    return "n/a" if v is None else f"{v:.{d}f}"


def _cell_lines(name, rows, dropped, res):
    stops = [r for r in rows if r["v0kind"] == "stop"]
    resc = [r for r in rows if r["kind"] == "rescued"]
    fails = [r for r in rows if r["kind"] == "fail"]
    t_rule = sum(r["t_spme"] for r in rows) + sum(rows[i]["t_dfn"] for i in range(len(rows)) if i in set(res["verified_idx"]))
    t_all = sum(r["t_dfn"] for r in rows)
    L = [f"{name}: {res['n']} designs ({len(dropped)} dropped, DFN did not finish: {dropped})",
         f"  SPMe V0: ok {sum(1 for r in rows if r['v0kind'] == 'ok')}, stop {len(stops)}, fail {sum(1 for r in rows if r['v0kind'] == 'fail')};"
         f" V1 rescued {len(resc)} of {len(stops)} stops; screen failures {len(fails)}",
         f"  mis-scored {res['n_bad']} ({res['n_bad'] / res['n']:.0%}); verified {res['n_verified']}; calls {res['calls']}"
         f" ({res['calls'] / res['n']:.0%} of the pool); recall {_fmt(res['recall'], 2)}; missed {[rows[i]['j'] for i in res['missed']]}",
         f"  pick design {rows[res['pick']]['j']}: DFN@100 {res['pick_dfn']:.1f} vs pool best {res['best_dfn']:.1f} Wh/kg, gap {_fmt(res['pick_gap'], 4)}",
         "  extra, after the verdicts: best verified DFN gap {best_verified_gap:.4f} at {best_verified_calls} calls;"
         " iterate-until-verified gap {iterate_gap:.4f} at {iterate_calls} calls (pick {iterate_pick})".format(**pick_variants(rows, res)),
         f"  wall time: rule {t_rule:.0f} s (all SPMe + verified DFN) vs all-DFN {t_all:.0f} s ({t_rule / t_all:.0%})" if t_all else "  wall time: n/a"]
    for r in resc:
        L.append(f"    rescued stop {r['j']}: SPMe@100 {r['score']:.1f} vs DFN@100 {r['dfn']:.1f}, gap {SV.rel_gap(r['score'], r['dfn']):+.3f}, r_min {r['r']:.3f}")
    return L, dict(pick_variants(rows, res), t_rule=t_rule, t_all=t_all, stops=len(stops), rescued=len(resc),
                   rescued_gaps=[SV.rel_gap(r["score"], r["dfn"]) for r in resc], fails=len(fails))


def _evaluate(rows):
    return apply_rule(rows)


def report():
    probe_d = json.loads((HERE / "probe.json").read_text())
    cells = probe_d["chosen"]
    by = {}
    for r in _load(HERE / "bench.jsonl"):
        by.setdefault(r["set"], {})[(r["j"], r["what"])] = r
    L = ["cell-fidelity milestone 5e: the two-part rule (re-solve stops at V1; verify failures, then ascending r_min, until 3 sound)",
         "", "Probe (baseline design, 2 cycles): " + ", ".join(f"{s} {'ok' if probe_d[s]['SPMe']['ok'] and probe_d[s]['DFN']['ok'] else 'fails'}" for s in CANDIDATES),
         f"Chosen (first {N_CELLS} that run): {cells}", "", "Pre-registered cells (fresh Sobol seed 4 designs):"]
    summ = dict(chosen=cells, cells={}, replay={})
    for s in cells:
        rows, dropped = pool(by.get(s, {}))
        if not rows:
            L.append(f"{s}: no complete design yet")
            continue
        res = _evaluate(rows)
        lines, extra = _cell_lines(s, rows, dropped, res)
        L += lines
        summ["cells"][s] = dict({k: v for k, v in res.items() if k != "verified_idx"}, dropped=dropped, **extra)
    C = list(summ["cells"].values()) or [dict(recall=None, stops=0, rescued_gaps=[], pick_gap=None, calls=None, n_bad=None)]
    v = dict(
        H42=verdict([c["recall"] for c in C], lambda x: x >= 0.9, lambda x: x < 0.8),
        H43=verdict([sum(1 for g in c["rescued_gaps"] if g > GAP) if c["stops"] else None for c in C], lambda x: x == 0, lambda x: x > 1),
        H44=verdict([c["pick_gap"] for c in C], lambda x: x <= 0.01, lambda x: x > 0.02),
        H45=verdict([c["calls"] - c["n_bad"] if c["calls"] is not None else None for c in C], lambda x: x <= 8, lambda x: x > 16))
    summ["verdicts"] = v
    L += ["", "Verdicts: " + ", ".join(f"{k} {w}" for k, w in v.items()), "",
          "Post hoc replay on the five committed cells (the rule was built on them; no verdicts):"]
    for s, runs in replay_runs().items():
        rows, dropped = pool(runs)
        res = _evaluate(rows)
        lines, extra = _cell_lines(s, rows, dropped, res)
        L += lines
        summ["replay"][s] = dict({k: v for k, v in res.items() if k != "verified_idx"}, dropped=dropped, **extra)
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(summ, indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    if sys.argv[1:2] == ["probe"]:
        probe()
    elif sys.argv[1:2] == ["bench"]:
        bench()
    elif sys.argv[1:2] == ["report"]:
        report()
    else:
        print(__doc__)
