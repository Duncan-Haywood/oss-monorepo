"""Re-score designs from research/energy-cell under the full DFN model and report how the ranking moves.
  python experiments/run.py select   # writes selected.json (deterministic pick from ../energy-cell logs)
  python experiments/run.py dfn      # evaluates selected designs under DFN (~35 s each, one process per design, restarted each time: DFN grows to 4-13 GB) -> dfn.json
  python experiments/run.py report   # writes results.txt
Needs numpy, scipy, pybamm."""
import json
import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
CELL = HERE.parents[1] / "energy-cell"
sys.path.insert(0, str(CELL / "src"))
from energy_cell import BASELINE, NAMES, clip, stack_mass_kg  # noqa: E402
from energy_cell import cell as _cell  # noqa: E402

N_STRATA = 36


def spearman(a, b):
    ra = np.argsort(np.argsort(a)).astype(float)
    rb = np.argsort(np.argsort(b)).astype(float)
    return float(np.corrcoef(ra, rb)[0, 1])


def logged():
    """Every (x, spmescore, source) evaluated by energy-cell, in file order."""
    out = []
    for r in json.loads((CELL / "experiments/auto.json").read_text()):
        out += [(x, s, f"{r['method']}{r['seed']}") for x, s in r["trace"]]
    out += [(r["x"], r["score"], "session") for r in json.loads((CELL / "experiments/session.json").read_text())]
    return out


def select():
    rows = logged()
    ok = sorted((r for r in rows if r[1] > 0), key=lambda r: -r[1])
    sel = [(list(map(float, BASELINE)), None, "baseline")]
    seen = {tuple(np.round(BASELINE, 6))}
    def add(r):
        k = tuple(np.round(r[0], 6))
        if k not in seen:
            seen.add(k); sel.append((list(map(float, r[0])), r[1], r[2]))
    for src in sorted({r[2] for r in rows}):                 # best design of each run
        add(max((r for r in ok if r[2] == src), key=lambda r: r[1]))
    for i in np.linspace(0, len(ok) - 1, N_STRATA).round().astype(int):  # spread over the SPMe ranking
        add(ok[i])
    for r in [r for r in rows if r[1] == 0][:3]:             # a few designs SPMe could not cycle
        add(r)
    (HERE / "selected.json").write_text(json.dumps([{"x": x, "spme": s, "source": src} for x, s, src in sel]))
    print(len(sel), "designs")


def _model(cls):
    import pybamm
    return cls({"SEI": "solvent-diffusion limited", "lithium plating": "irreversible"})


def failure(kind, detail, cycles_done=0):
    """A zero-score result that records why, so a solver crash is not mistaken for a dead design."""
    return dict(score=0.0, wh_kg_bol=0.0, failure=kind, detail=detail, cycles_done=cycles_done)


def evaluate_with(x, model_name, cycles=100):
    """Same protocol as energy_cell.evaluate, with the electrochemical model swapped."""
    import pybamm
    pybamm.set_logging_level("ERROR")
    x = clip(x)
    pv = _cell._params(x)
    mass = stack_mass_kg(x, pv)
    exp = pybamm.Experiment([(f"Discharge at {_cell.I_DISCHARGE} A until 2.5 V", f"Charge at {_cell.I_CHARGE} A until 4.2 V")] * cycles)
    try:
        sol = pybamm.Simulation(_model(getattr(pybamm.lithium_ion, model_name)), parameter_values=pv, experiment=exp).solve(initial_soc=1.0)
        e = []
        for c in (sol.cycles[1], sol.cycles[-1]):
            d = c.steps[0]
            e.append(float(np.trapezoid(d["Terminal voltage [V]"].entries * d["Current [A]"].entries, d["Time [s]"].entries)) / 3600.0)
    except Exception as exc:  # keep score 0 for old readers, but say why
        return failure("solver_error", f"{type(exc).__name__}: {str(exc)[:200]}")
    if len(sol.cycles) < cycles:
        return failure("stopped_early", f"{len(sol.cycles)} of {cycles} cycles", len(sol.cycles))
    if e[0] <= 0:
        return failure("no_discharge", "first cycle delivered no energy", len(sol.cycles))
    return dict(score=e[1] / mass, wh_kg_bol=e[0] / mass)


def _one(job):
    i, x = job
    return i, evaluate_with(x, "DFN"), evaluate_with(x, "SPMe")


def dfn():
    """Evaluate every selected design under DFN and SPMe, appending each result to dfn.jsonl as it finishes
    (a restart skips designs already done)."""
    sel = json.loads((HERE / "selected.json").read_text())
    out = HERE / "dfn.jsonl"
    done = {json.loads(l)["i"] for l in out.read_text().splitlines()} if out.exists() else set()
    jobs = [(i, s["x"]) for i, s in enumerate(sel) if i not in done]
    with Pool(1, maxtasksperchild=1) as p, out.open("a") as fh:
        for i, d, s in p.imap_unordered(_one, jobs, chunksize=1):
            fh.write(json.dumps({"i": i, "dfn": d, "spme_now": s}) + "\n")
            fh.flush()
    rows = [json.loads(l) for l in out.read_text().splitlines()]
    for r in rows:
        sel[r["i"]].update(dfn=r["dfn"], spme_now=r["spme_now"])
    (HERE / "dfn.json").write_text(json.dumps([s for s in sel if "dfn" in s]))


def report():
    sel = json.loads((HERE / "dfn.json").read_text())
    base = sel[0]
    both = [s for s in sel[1:] if s["spme_now"]["score"] > 0 and s["dfn"]["score"] > 0]
    sp = np.array([s["spme_now"]["score"] for s in both]); df = np.array([s["dfn"]["score"] for s in both])
    bo = np.array([s["spme_now"]["wh_kg_bol"] for s in both]); bd = np.array([s["dfn"]["wh_kg_bol"] for s in both])
    L = []
    L.append(f"Baseline (OKane2022 cell): SPMe {base['spme_now']['score']:.1f} Wh/kg, DFN {base['dfn']['score']:.1f} Wh/kg at cycle 100")
    L.append(f"Designs re-scored: {len(sel)-1} (+ baseline); both models cycled {len(both)}; "
             f"SPMe-only failures {sum(1 for s in sel[1:] if s['spme_now']['score']==0 and s['dfn']['score']>0)}, "
             f"DFN-only failures {sum(1 for s in sel[1:] if s['dfn']['score']==0 and s['spme_now']['score']>0)}, "
             f"both failed {sum(1 for s in sel[1:] if s['dfn']['score']==0 and s['spme_now']['score']==0)}")
    L.append("")
    L.append("A. Agreement between models over the designs both cycled")
    L.append(f"  Spearman rank correlation, cycle-100 Wh/kg : {spearman(sp, df):.3f}")
    L.append(f"  Spearman rank correlation, beginning-of-life: {spearman(bo, bd):.3f}")
    L.append(f"  DFN minus SPMe, cycle 100 (Wh/kg): mean {np.mean(df-sp):+.1f}, min {np.min(df-sp):+.1f}, max {np.max(df-sp):+.1f}")
    L.append(f"  relative difference |DFN-SPMe|/DFN: median {np.median(abs(df-sp)/df)*100:.1f} %, max {np.max(abs(df-sp)/df)*100:.1f} %")
    L.append("")
    best_sp = both[int(np.argmax(sp))]; best_df = both[int(np.argmax(df))]
    rank_of_spme_best = int((df > best_sp["dfn"]["score"]).sum()) + 1
    L.append("B. Does the SPMe winner win under DFN?")
    L.append(f"  SPMe best of the set: {best_sp['source']}  SPMe {best_sp['spme_now']['score']:.1f}  DFN {best_sp['dfn']['score']:.1f}  (DFN rank {rank_of_spme_best} of {len(both)})")
    L.append(f"  DFN best of the set : {best_df['source']}  SPMe {best_df['spme_now']['score']:.1f}  DFN {best_df['dfn']['score']:.1f}")
    L.append(f"  Gain over baseline: SPMe winner {best_sp['spme_now']['score']/base['spme_now']['score']-1:+.1%} (SPMe), "
             f"{best_sp['dfn']['score']/base['dfn']['score']-1:+.1%} (DFN); DFN winner {best_df['dfn']['score']/base['dfn']['score']-1:+.1%} (DFN)")
    L.append("")
    L.append("C. Every design (x = " + ", ".join(NAMES) + ")")
    L.append("  source       thick   e_pos  e_neg  np_rel   SPMe    DFN")
    for s in sorted(sel[1:], key=lambda s: -s["spme_now"]["score"]):
        x = s["x"]
        L.append(f"  {s['source']:<10} {x[0]:7.1f} {x[1]:7.3f} {x[2]:6.3f} {x[3]:7.3f} {s['spme_now']['score']:6.1f} {s['dfn']['score']:6.1f}")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L[:12]))


if __name__ == "__main__":
    {"select": select, "dfn": dfn, "report": report}[sys.argv[1]]()
