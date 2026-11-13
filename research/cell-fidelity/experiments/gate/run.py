"""Milestone 5f: a skip-SPMe gate and the verified-answer rule, tested at C-rates no number has been seen for.

    python experiments/gate/run.py probe     # baseline design, SPMe and DFN for 2 cycles at each condition -> probe.json
    python experiments/gate/run.py bench     # 64 Sobol (seed 5) designs x SPMe(V0)/DFN@100 per kept condition, then V1 re-solves of stops (resumable)
    python experiments/gate/run.py report    # results.txt, summary.json (stdlib only)

The gate, the answer step, the labels and hypotheses H46 to H50 are fixed in ../../LOG.md (milestone 5f plan) before
the bench. A condition is a parameter set and a multiple of milestone 5b's areal current density (48.7 A/m2, the
OKane2022 cell's 5 A over 0.1027 m2). The design mapping, protocol and degradation keys are milestone 5b's
(../transfer/run.py), the SPMe solver variants milestone 5d's (../solver/run.py) and the rule milestone 5e's
(../rule/run.py), all imported unchanged; only the current is scaled.
"""
import importlib.util
import json
import os
import statistics
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent

# (parameter set, current multiple), in the plan's order
CONDITIONS = (("OKane2022", 2.0), ("Chen2020", 2.0), ("Marquis2019", 2.0), ("Ecker2015", 2.0),
              ("Mohtat2020", 2.0), ("Ai2020", 0.5))
SOBOL_SEED = 5
N_LOG2 = 6
WORKERS = int(os.environ.get("WORKERS", "4"))
GATE_N = 8          # designs the gate reads, in Sobol index order
GATE_K = 4          # skip SPMe when at least this many of them are suspect
R_SUSPECT = 0.10    # milestone 2's flag: whole-run r_min at or below this
TIE = 0.05          # H46 ignores conditions where rule and all-DFN wall times are within 5%
# committed 1x suspect shares (V0 fail or r_min <= 0.1 over the whole pool; computed before this plan)
SHARE_1X = {"OKane2022": 0.18, "Chen2020": 0.25, "Marquis2019": 0.00, "Ecker2015": 0.06, "Mohtat2020": 0.00, "Ai2020": 0.72}


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


R = _mod("rule_run", EXP / "rule" / "run.py")
SV = R.SV
TR = SV.TR


def cid(pset, rate):
    return f"{pset}@{rate:g}x"


# ---------- pure helpers (stdlib; tested) ----------

def suspect(row):
    """Gate signal from the SPMe default-tolerance run alone: it returned nothing, or its whole-run r_min <= 0.1.
    Early stops are not suspect (milestone 5d: they are the solver's, and V1 finishes them)."""
    return row["v0kind"] == "fail" or (row["v0r"] is not None and row["v0r"] <= R_SUSPECT)


def gate(rows, n=GATE_N, k=GATE_K):
    """rows in Sobol index order. True means skip SPMe and run DFN on the whole pool."""
    return sum(1 for r in rows[:n] if suspect(r)) >= k


def iterate_answer(rows, verified):
    """5e's corrected answer step: while the merged leader (DFN where verified, screen score elsewhere) is unverified,
    verify it. Returns (pick index, verified set)."""
    ver = set(verified)
    while True:
        merged = [r["dfn"] if i in ver else r["score"] for i, r in enumerate(rows)]
        p = max(range(len(rows)), key=lambda i: (merged[i], -i))
        if p in ver:
            return p, ver
        ver.add(p)


def evaluate(rows, n=GATE_N, k=GATE_K):
    """The gated procedure and both of its branches on one pool, with wall time from each run's own timing.
    rows: dicts with kind, score, r, dfn, t_spme (V0 + V1 seconds), t_v0, t_dfn, v0kind, v0r."""
    best = max(r["dfn"] for r in rows)
    res = R.apply_rule(rows)
    pick, ver = iterate_answer(rows, res["verified_idx"])
    t_rule = sum(r["t_spme"] for r in rows) + sum(rows[i]["t_dfn"] for i in ver)
    t_all = sum(r["t_dfn"] for r in rows)
    skip = gate(rows, n, k)
    t_gate_probe = sum(r["t_v0"] for r in rows[:n])
    if skip:
        t_gated, gated_pick, calls = t_gate_probe + t_all, max(range(len(rows)), key=lambda i: (rows[i]["dfn"], -i)), len(rows)
    else:
        t_gated, gated_pick, calls = t_rule, pick, len(ver)
    cheaper = "rule" if t_rule < t_all else "all-DFN"
    tie = abs(t_rule - t_all) <= TIE * min(t_rule, t_all)
    return dict(n=len(rows), n_bad=res["n_bad"], recall=res["recall"], missed=res["missed"],
                suspect_share=sum(1 for r in rows if suspect(r)) / len(rows),
                gate_suspects=sum(1 for r in rows[:n] if suspect(r)), skip=skip,
                t_rule=t_rule, t_all=t_all, t_gated=t_gated, cheaper=cheaper, tie=tie,
                gate_right=None if tie else (skip == (cheaper == "all-DFN")),
                gated_ratio=t_gated / min(t_rule, t_all),
                rule_calls=len(ver), gated_calls=calls, best_dfn=best,
                rule_pick_gap=(best - rows[pick]["dfn"]) / best, gated_pick_gap=(best - rows[gated_pick]["dfn"]) / best,
                pre_5e_pick_gap=res["pick_gap"])


def verdicts(C):
    """C: {condition id: evaluate() output plus 'rate' and 'set'}."""
    v = R.verdict
    wrong = [0 if c["gate_right"] else 1 for c in C.values() if c["gate_right"] is not None]
    h46 = "untestable" if not wrong else ("refuted" if sum(wrong) >= 2 else "mixed" if sum(wrong) == 1 else "supported")
    h50 = []
    for c in C.values():
        base = SHARE_1X[c["set"]]
        h50.append(c["suspect_share"] - base if c["rate"] > 1 else base - c["suspect_share"])
    return dict(
        H46=h46,
        H47=v([c["gated_ratio"] for c in C.values()], lambda x: x <= 1.15, lambda x: x > 1.30),
        H48=v([c["recall"] if (not c["skip"] and c["n_bad"]) else None for c in C.values()], lambda x: x >= 0.9, lambda x: x < 0.8),
        H49=v([c["gated_pick_gap"] for c in C.values()], lambda x: x <= 0.01, lambda x: x > 0.02),
        H50=v(h50, lambda x: x >= -0.05, lambda x: x < -0.10))


# ---------- simulation (pybamm) ----------

def _child(args):
    """One run at a scaled current: patch milestone 5b's params() so the current is `rate` times its own."""
    base = TR.params

    def scaled(x, pset):
        pv, copied, cur = base(x, pset)
        return pv, copied, cur * args["rate"]

    TR.params = scaled
    if args["what"] == "DFN":
        return TR.simulate(args["x"], "DFN", args.get("cycles", 100), args["set"])
    return SV.simulate(args["x"], args["set"], args.get("cycles", 100), args["what"])


def _spawn(args, timeout=2400):
    try:
        p = subprocess.run([sys.executable, __file__, "child", json.dumps(args)], capture_output=True, text=True, timeout=timeout)
        if p.stdout.strip():
            return json.loads(p.stdout.strip().splitlines()[-1])
        err = f"process exit {p.returncode}: {p.stderr[-160:]}"
    except subprocess.TimeoutExpired:
        err = f"timeout {timeout} s"
    return dict(ok=False, error=err, cycle_wh=[], r_cycle=[], ok_cycles=0, r_min=0.0, seconds=None)


def probe():
    from energy_cell import cell
    x = list(map(float, cell.BASELINE))
    out = {}
    for s, rate in CONDITIONS:
        c = out[cid(s, rate)] = {}
        for m in ("V0", "DFN"):
            r = _spawn(dict(x=x, set=s, rate=rate, what=m, cycles=2), timeout=900)
            c[m] = dict(ok=r["ok"] and r["ok_cycles"] == 2, cycles=r["ok_cycles"], seconds=r["seconds"],
                        error=(r.get("error") or None) and r["error"][:200], r_min=r.get("r_min"), current_A=r.get("current_A"))
            print(cid(s, rate), m, c[m]["ok"], c[m]["error"], flush=True)
    out["kept"] = [cid(s, rate) for s, rate in CONDITIONS if out[cid(s, rate)]["V0"]["ok"] and out[cid(s, rate)]["DFN"]["ok"]]
    (HERE / "probe.json").write_text(json.dumps(out, indent=1) + "\n")
    print("kept:", out["kept"])


def designs():
    import numpy as np
    from scipy.stats import qmc
    from energy_cell import cell
    u = qmc.Sobol(d=4, scramble=True, seed=SOBOL_SEED).random_base2(N_LOG2)
    return [list(map(float, r)) for r in np.asarray(cell.BOUNDS[:, 0] + u * (cell.BOUNDS[:, 1] - cell.BOUNDS[:, 0]))]


def _parse(c):
    s, rate = c.rsplit("@", 1)
    return s, float(rate[:-1])


def _run(job):
    c, j, what, x = job
    s, rate = _parse(c)
    r = _spawn(dict(x=x, set=s, rate=rate, what=what))
    r.pop("copied", None)
    return dict(cond=c, set=s, rate=rate, j=j, what=what, x=x, **r)


def _write(path, jobs):
    with ThreadPoolExecutor(WORKERS) as ex, path.open("a") as f:
        for r in ex.map(_run, jobs):
            if "exit -9" in (r.get("error") or ""):
                print(r["cond"], r["j"], r["what"], "killed (-9), not recorded", flush=True)
                continue
            f.write(json.dumps(r) + "\n")
            f.flush()
            print(r["cond"], r["j"], r["what"], r["ok"], r["ok_cycles"], r["seconds"] and round(r["seconds"], 1), flush=True)


def bench():
    kept = json.loads((HERE / "probe.json").read_text())["kept"]
    path = HERE / "bench.jsonl"
    xs = designs()
    done = {(r["cond"], r["j"], r["what"]) for r in R._load(path)}
    _write(path, [(c, j, w, xs[j]) for c in kept for j in range(len(xs)) for w in ("V0", "DFN") if (c, j, w) not in done])
    rows = R._load(path)
    stops = [(r["cond"], r["j"]) for r in rows if r["what"] == "V0" and SV.kind(r) == "stop"]
    done = {(r["cond"], r["j"], r["what"]) for r in rows}
    _write(path, [(c, j, "V1", xs[j]) for c, j in stops if (c, j, "V1") not in done])


# ---------- report ----------

def pool(runs):
    """5e's pool() plus the gate's inputs (V0's own kind and r_min, V0's time)."""
    rows, dropped = R.pool(runs)
    for r in rows:
        v0 = runs[(r["j"], "V0")]
        r["v0r"] = v0.get("r_min") if SV.kind(v0) != "fail" else None
        r["t_v0"] = v0.get("seconds") or 0
    return rows, dropped


def committed_cells():
    """The seven cells the rule and the gate were read off (post hoc, no verdicts), at 1x."""
    cells = dict(R.replay_runs())
    for r in R._load(EXP / "rule" / "bench.jsonl"):
        cells.setdefault(r["set"], {})[(r["j"], r["what"])] = r
    return cells


def _lines(name, c, dropped):
    return [f"{name}: {c['n']} designs ({len(dropped)} dropped: {dropped}); suspect share {c['suspect_share']:.2f};"
            f" gate saw {c['gate_suspects']} of {GATE_N} suspect -> {'SKIP SPMe' if c['skip'] else 'run the rule'}",
            f"  mis-scored {c['n_bad']}; rule recall {R._fmt(c['recall'], 2)}; rule calls {c['rule_calls']} (with the iterate answer)",
            f"  wall time: rule {c['t_rule']:.0f} s, all-DFN {c['t_all']:.0f} s (rule/all {c['t_rule'] / c['t_all']:.2f}; cheaper: {c['cheaper']}"
            f"{', within 5%' if c['tie'] else ''}); gated {c['t_gated']:.0f} s = {c['gated_ratio']:.2f} x the cheaper; gate right: {c['gate_right']}",
            f"  answer gap to pool DFN best {c['best_dfn']:.1f} Wh/kg: gated {c['gated_pick_gap']:.4f}, rule+iterate {c['rule_pick_gap']:.4f},"
            f" 5e's pre-registered answer {R._fmt(c['pre_5e_pick_gap'], 4)}"]


def report():
    probe_d = json.loads((HERE / "probe.json").read_text())
    kept = probe_d["kept"]
    by = {}
    for r in R._load(HERE / "bench.jsonl"):
        by.setdefault(r["cond"], {})[(r["j"], r["what"])] = r
    L = [f"cell-fidelity milestone 5f: skip SPMe when >= {GATE_K} of the first {GATE_N} designs are suspect (SPMe fails or r_min <= {R_SUSPECT});"
         " otherwise 5e's rule with the iterate answer step", "",
         "Probe (baseline design, 2 cycles): " + ", ".join(f"{cid(s, r)} {'ok' if cid(s, r) in kept else 'fails'}" for s, r in CONDITIONS), ""]
    summ = dict(kept=kept, conditions={}, committed={})
    for c in kept:
        rows, dropped = pool(by.get(c, {}))
        if not rows:
            L.append(f"{c}: no complete design yet")
            continue
        s, rate = _parse(c)
        e = dict(evaluate(rows), set=s, rate=rate, dropped=dropped,
                 median_t_v0=statistics.median(r["t_v0"] for r in rows), median_t_dfn=statistics.median(r["t_dfn"] for r in rows))
        L += _lines(c, e, dropped)
        summ["conditions"][c] = e
    v = verdicts(summ["conditions"]) if summ["conditions"] else {}
    summ["verdicts"] = v
    L += ["", "Verdicts: " + ", ".join(f"{k} {w}" for k, w in v.items()), "",
          "Post hoc: the gate on the seven committed 1x cells it was read off (no verdicts):"]
    for s, runs in committed_cells().items():
        rows, dropped = pool(runs)
        e = evaluate(rows)
        L += _lines(f"{s}@1x", e, dropped)
        summ["committed"][s] = e
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(summ, indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    if sys.argv[1:2] == ["child"]:
        print(json.dumps(_child(json.loads(sys.argv[2]))))
    elif sys.argv[1:2] == ["probe"]:
        probe()
    elif sys.argv[1:2] == ["bench"]:
        bench()
    elif sys.argv[1:2] == ["report"]:
        report()
    else:
        print(__doc__)
