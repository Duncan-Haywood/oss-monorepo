"""Milestone 5h: a gap-aware answer step (the "band" stop) tested on conditions and designs no number has been seen for.

    python experiments/band/run.py dev       # development replay on the 13 committed conditions (stdlib; written before the plan)
    python experiments/band/run.py probe     # baseline design, SPMe and DFN for 2 cycles at each new condition -> probe.json
    python experiments/band/run.py bench     # 64 Sobol (seed 6) designs x SPMe(V0)/DFN@100 per kept condition, then V1 re-solves (resumable)
    python experiments/band/run.py report    # results.txt, summary.json (stdlib only)

The band stop, the labels and hypotheses H56 to H60 are fixed in ../../LOG.md (milestone 5h plan) before the bench.
Simulation, design mapping, protocol, solver variants, the 5e rule and the iterate answer are milestone 5g's
(../gate/run.py), imported unchanged; only the conditions and the Sobol seed are new.
"""
import importlib.util
import json
import os
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent

# (parameter set, current multiple), in the plan's order; none was used by an earlier milestone
CONDITIONS = (("Ai2020", 0.75), ("Ai2020", 0.25), ("NCA_Kim2011", 0.5), ("Chen2020", 0.5),
              ("Ecker2015", 0.5), ("OKane2022", 1.5))
SOBOL_SEED = 6
WORKERS = int(os.environ.get("WORKERS", "3"))
SHARE_AI = {0.5: 0.31, 1.0: 0.72}   # committed Ai2020 suspect shares (5g at 0.5x, 5f/5b at 1x)


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


G = _mod("gate_run", EXP / "gate" / "run.py")
R = G.R


# ---------- pure helpers (stdlib; tested) ----------

def sound(row):
    """A design whose SPMe score can calibrate the band: positive score and whole-run r_min above milestone 2's 0.1 flag."""
    return row["score"] > 0 and row["r"] is not None and row["r"] > G.R_SUSPECT


def band_factor(rows, ver):
    """Median DFN/SPMe ratio over the verified sound designs, floored at 1 (1 when none is verified)."""
    ratios = [rows[i]["dfn"] / rows[i]["score"] for i in ver if sound(rows[i])]
    return max(1.0, statistics.median(ratios)) if ratios else 1.0


def band_answer(rows, verified):
    """The band stop. Starting from the 5e rule's verified set: let b be the verified design with the best DFN score and
    q the band factor; while some unverified design with a positive screen score has score * q >= b's DFN, verify the one
    with the highest screen score and recompute b and q. The answer is b. Returns (pick, verified set)."""
    ver = set(verified)
    while True:
        b = max(ver, key=lambda i: (rows[i]["dfn"], -i))
        q = band_factor(rows, ver)
        cand = [i for i, r in enumerate(rows) if i not in ver and r["score"] > 0 and r["score"] * q >= rows[b]["dfn"]]
        if not cand:
            return b, ver
        ver.add(max(cand, key=lambda i: (rows[i]["score"], -i)))


def evaluate(rows):
    best = max(r["dfn"] for r in rows)
    res = R.apply_rule(rows)
    bp, bver = band_answer(rows, res["verified_idx"])
    ip, iver = G.iterate_answer(rows, res["verified_idx"])
    t_spme = sum(r["t_spme"] for r in rows)
    t_all = sum(r["t_dfn"] for r in rows)
    snd = [r for r in rows if sound(r)]
    return dict(n=len(rows), n_bad=res["n_bad"], recall=res["recall"], best_dfn=best,
                suspect_share=sum(1 for r in rows if G.suspect(r)) / len(rows),
                pool_ratio=statistics.median(r["dfn"] / r["score"] for r in snd) if snd else None,
                band_gap=(best - rows[bp]["dfn"]) / best, band_calls=len(bver),
                band_q=band_factor(rows, bver),
                iter_gap=(best - rows[ip]["dfn"]) / best, iter_calls=len(iver),
                t_all=t_all, t_band=t_spme + sum(rows[i]["t_dfn"] for i in bver),
                t_iter=t_spme + sum(rows[i]["t_dfn"] for i in iver))


def verdicts(C):
    """C: {condition id: evaluate() output plus 'set' and 'rate'}."""
    v = R.verdict
    under = [c for c in C.values() if c["pool_ratio"] is not None and c["pool_ratio"] >= 1.10]
    h58 = "untestable" if not under else ("supported" if any(c["iter_gap"] > 0.01 for c in under) else "refuted")
    ai = []
    for c in C.values():
        if c["set"] != "Ai2020":
            continue
        if c["rate"] < 0.5:                    # at most the 0.5x share
            ai.append(SHARE_AI[0.5] - c["suspect_share"])
        else:                                  # between the 0.5x and 1x shares
            ai.append(min(c["suspect_share"] - SHARE_AI[0.5], SHARE_AI[1.0] - c["suspect_share"]))
    return dict(
        H56=v([c["band_gap"] for c in C.values()], lambda x: x <= 0.01, lambda x: x > 0.02),
        H57=v([c["t_band"] / c["t_all"] for c in C.values()], lambda x: x <= 1.15, lambda x: x > 1.30),
        H58=h58,
        H59=v([c["recall"] if c["n_bad"] else None for c in C.values()], lambda x: x >= 0.9, lambda x: x < 0.8),
        H60=v(ai, lambda x: x >= -0.05, lambda x: x < -0.10))


# ---------- data ----------

def committed():
    """The 13 conditions the band stop was developed on: 5g's six and the seven 1x cells."""
    by = {}
    for r in R._load(EXP / "gate" / "bench.jsonl"):
        by.setdefault(r["cond"], {})[(r["j"], r["what"])] = r
    for s, runs in G.committed_cells().items():
        by[f"{s}@1x"] = runs
    return by


def _use_gate_machinery():
    G.HERE, G.CONDITIONS, G.SOBOL_SEED, G.WORKERS = HERE, CONDITIONS, SOBOL_SEED, WORKERS


def _line(name, c):
    return (f"{name}: n {c['n']}; suspect share {c['suspect_share']:.2f}; mis-scored {c['n_bad']}; recall {R._fmt(c['recall'], 2)};"
            f" pool median DFN/SPMe on sound designs {R._fmt(c['pool_ratio'], 3)}\n"
            f"  band: gap {c['band_gap']:.4f} at {c['band_calls']} calls (q {c['band_q']:.3f}), wall time / all-DFN {c['t_band'] / c['t_all']:.2f}\n"
            f"  iterate (5g): gap {c['iter_gap']:.4f} at {c['iter_calls']} calls, wall time / all-DFN {c['t_iter'] / c['t_all']:.2f};"
            f" pool DFN best {c['best_dfn']:.1f} Wh/kg")


def dev():
    L = ["Development replay of the band stop on the 13 committed conditions (the rule was chosen on these numbers):"]
    out = {}
    for c, runs in committed().items():
        rows, _ = G.pool(runs)
        out[c] = evaluate(rows)
        L.append(_line(c, out[c]))
    (HERE / "dev.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))


def report():
    kept = json.loads((HERE / "probe.json").read_text())["kept"]
    by = {}
    for r in R._load(HERE / "bench.jsonl"):
        by.setdefault(r["cond"], {})[(r["j"], r["what"])] = r
    L = ["cell-fidelity milestone 5h: the band stop (verify while an unverified SPMe score times the median verified"
         " DFN/SPMe ratio could beat the verified best)", "",
         "Probe (baseline design, 2 cycles): " + ", ".join(f"{G.cid(s, r)} {'ok' if G.cid(s, r) in kept else 'fails'}" for s, r in CONDITIONS), ""]
    summ = dict(kept=kept, conditions={})
    for c in kept:
        rows, dropped = G.pool(by.get(c, {}))
        if not rows:
            L.append(f"{c}: no complete design yet")
            continue
        s, rate = G._parse(c)
        e = dict(evaluate(rows), set=s, rate=rate, dropped=dropped,
                 median_t_v0=statistics.median(r["t_v0"] for r in rows), median_t_dfn=statistics.median(r["t_dfn"] for r in rows))
        L.append(_line(c, e) + f"\n  dropped (DFN did not reach 100 cycles): {dropped}")
        summ["conditions"][c] = e
    summ["verdicts"] = verdicts(summ["conditions"]) if summ["conditions"] else {}
    L += ["", "Verdicts: " + ", ".join(f"{k} {w}" for k, w in summ["verdicts"].items())]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(summ, indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    cmd = sys.argv[1:2]
    if cmd == ["dev"]:
        dev()
    elif cmd in (["probe"], ["bench"]):
        _use_gate_machinery()
        (G.probe if cmd == ["probe"] else G.bench)()
    elif cmd == ["report"]:
        report()
    else:
        print(__doc__)
