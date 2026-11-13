"""Milestone 5j: the closed-form salt flag (5i's r_kt) as a pre-screen inside the design search, priced in wall time.

    python experiments/prescreen/run.py dev      # development replay on the 19 committed conditions (stdlib; before the plan)
    python experiments/prescreen/run.py choose   # r_kt over the fresh designs at candidate conditions -> choose.json (pybamm, parameters only)
    python experiments/prescreen/run.py probe    # baseline design, SPMe and DFN for 2 cycles at each chosen condition -> probe.json
    python experiments/prescreen/run.py bench    # 64 Sobol (seed 8) designs x SPMe(V0)/DFN@100 per kept condition, V1 re-solves (resumable)
    python experiments/prescreen/run.py report   # results.txt, summary.json (stdlib plus pybamm for r_kt)

The pre-screen procedure, the condition choice and hypotheses H70 to H73 are fixed in ../../LOG.md (milestone 5j plan)
before the bench. Simulation, design mapping, protocol, solver variants, the 5e rule, 5g's iterate answer and 5h's band
stop are imported unchanged; r_kt is 5i's (../sand/run.py), unchanged.
"""
import importlib.util
import json
import os
import statistics
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent

SOBOL_SEED = 8
WORKERS = int(os.environ.get("WORKERS", "3"))
R_FLAG = 0.10
# candidate conditions for the fresh test, in this order; `choose` keeps the plan's targets (see LOG)
CANDIDATES = (("OKane2022", 1.25), ("Chen2020", 1.5), ("Ecker2015", 1.5), ("Marquis2019", 3.0), ("Mohtat2020", 3.0),
              ("NCA_Kim2011", 0.75), ("OKane2022", 1.75), ("Chen2020", 2.5), ("Ecker2015", 3.0))
TARGETS = ((0.15, 0.45), (0.45, 0.80))   # predicted suspect-share bands, one condition each, different cells


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


B = _mod("band_run", EXP / "band" / "run.py")
G = B.G
R = G.R
_S = None


def _sand():
    global _S
    if _S is None:
        _S = _mod("sand_run", EXP / "sand" / "run.py")
    return _S


# ---------- pure helpers (stdlib; tested) ----------

def prescreen(rows, rkt, r_flag=R_FLAG):
    """The pre-screen procedure on one pool. rows: 5g pool rows (Sobol order); rkt: r_kt per row.
    1. Designs with r_kt <= r_flag go to DFN and get no SPMe run.
    2. The rest get SPMe (V0, V1 re-solve of early stops) and 5e's rule (queue and run-of-3 stop) over them alone.
    3. 5h's band stop over the whole pool from the union of both verified sets; pre-flagged designs carry no screen score.
    Returns (pick, verified set, pre-flagged indices)."""
    pre = [i for i, r in enumerate(rows) if rkt[i] <= r_flag]
    rest = [i for i in range(len(rows)) if i not in set(pre)]
    ver = set(pre)
    if rest:
        sub = [rows[i] for i in rest]
        ver |= {rest[k] for k in R.apply_rule(sub)["verified_idx"]}
    if not ver:                                   # nothing verified yet: verify the best screen score first
        ver = {max(range(len(rows)), key=lambda i: (rows[i]["score"], -i))}
    view = [dict(r, score=0.0, r=None) if i in set(pre) else r for i, r in enumerate(rows)]
    pick, ver = B.band_answer(view, ver)
    return pick, ver, pre


def evaluate(rows, rkt, t_pred):
    """The pre-screen against 5h's band procedure and all-DFN on one pool. t_pred: seconds to compute r_kt for the pool."""
    best = max(r["dfn"] for r in rows)
    e = B.evaluate(rows)
    pick, ver, pre = prescreen(rows, rkt)
    pre_s = set(pre)
    bad = [R.mis_scored(r["score"], r["dfn"]) for r in rows]
    nb = sum(bad)
    t_ps = t_pred + sum(r["t_spme"] for i, r in enumerate(rows) if i not in pre_s) + sum(rows[i]["t_dfn"] for i in ver)
    sus = [G.suspect(r) for r in rows]
    return dict(e, ps_gap=(best - rows[pick]["dfn"]) / best, ps_calls=len(ver), n_pre=len(pre),
                pre_share=len(pre) / len(rows), t_ps=t_ps, t_pred=t_pred,
                ps_recall=(sum(1 for i in ver if bad[i]) / nb) if nb else None,
                pre_wrong_sound=sum(1 for i in pre if not sus[i]), pre_missed_suspect=sum(1 for i, s in enumerate(sus) if s and i not in pre_s),
                spme_saved=sum(rows[i]["t_spme"] for i in pre))


def verdicts(C):
    v = R.verdict
    ratios = [c["t_ps"] / c["t_band"] for c in C.values()]
    h71 = "untestable" if not ratios else (
        "refuted" if statistics.median(ratios) > 1.0 or max(ratios) > 1.10 else
        "supported" if statistics.median(ratios) <= 0.90 and max(ratios) <= 1.02 else "mixed")
    return dict(
        H70=v([c["ps_gap"] for c in C.values()], lambda x: x <= 0.01, lambda x: x > 0.02),
        H71=h71,
        H72=v([c["t_ps"] / c["t_all"] for c in C.values()], lambda x: x <= 1.0, lambda x: x > 1.15),
        H73=v([c["ps_recall"] for c in C.values()], lambda x: x >= 0.9, lambda x: x < 0.8))


# ---------- r_kt for a pool ----------

def rkt_for(rows, xs, pset, rate):
    """r_kt for each pool row (xs: design vector per row) and the seconds it took (pybamm for parameter values only)."""
    S = _sand()
    t0 = time.perf_counter()
    out = [S.predict(x, pset, rate)["r_kt"] for x in xs]
    return out, time.perf_counter() - t0


def _committed_rkt():
    by = {}
    for r in R._load(EXP / "sand" / "committed.jsonl"):
        by[(r["cond"], r["j"])] = r["r_kt"]
    return by


T_PRED_DEV = 0.05   # seconds per design, 5i's measured cost of r_kt; dev replays charge this, `report` measures its own


def _line(name, c):
    return (f"{name}: n {c['n']}; suspect share {c['suspect_share']:.2f}, pre-flagged share {c['pre_share']:.2f}"
            f" (pre-flagged but SPMe-sound {c['pre_wrong_sound']}, SPMe-suspect not pre-flagged {c['pre_missed_suspect']}); mis-scored {c['n_bad']}\n"
            f"  pre-screen: gap {c['ps_gap']:.4f} at {c['ps_calls']} DFN calls, recall {R._fmt(c['ps_recall'], 2)},"
            f" wall / all-DFN {c['t_ps'] / c['t_all']:.2f}, / band {c['t_ps'] / c['t_band']:.2f} (SPMe saved {c['spme_saved']:.0f} s, r_kt {c['t_pred']:.1f} s)\n"
            f"  band (5h): gap {c['band_gap']:.4f} at {c['band_calls']} calls, wall / all-DFN {c['t_band'] / c['t_all']:.2f};"
            f" iterate (5g): gap {c['iter_gap']:.4f}, wall / all-DFN {c['t_iter'] / c['t_all']:.2f}")


def dev():
    rk = _committed_rkt()
    L = ["Development replay of the pre-screen on the 19 committed conditions (r_kt was written on these designs in 5i;"
         f" the procedure's cost had not been computed; r_kt charged {T_PRED_DEV} s per design):"]
    out = {}
    for c, runs in _sand().committed_conditions().items():
        rows, _ = G.pool(runs)
        kt = [rk[(c, r["j"])] for r in rows]
        out[c] = evaluate(rows, kt, T_PRED_DEV * len(rows))
        L.append(_line(c, out[c]))
    rat = [c["t_ps"] / c["t_band"] for c in out.values()]
    L += ["", f"pre-screen / band wall time: median {statistics.median(rat):.2f}, max {max(rat):.2f};"
          f" pre-screen / all-DFN max {max(c['t_ps'] / c['t_all'] for c in out.values()):.2f};"
          f" worst gap {max(c['ps_gap'] for c in out.values()):.4f}",
          "Verdict functions on the development data (not verdicts): " + ", ".join(f"{k} {w}" for k, w in verdicts(out).items())]
    (HERE / "dev.txt").write_text("\n".join(L) + "\n")
    (HERE / "dev.json").write_text(json.dumps(out, indent=1) + "\n")
    print("\n".join(L))


# ---------- fresh conditions (pybamm) ----------

def _use_gate_machinery(conditions):
    G.HERE, G.CONDITIONS, G.SOBOL_SEED, G.WORKERS = HERE, conditions, SOBOL_SEED, WORKERS


def choose():
    """r_kt's predicted suspect share for the seed-8 designs at each candidate; keep the first candidate in each band."""
    G.SOBOL_SEED = SOBOL_SEED
    xs = G.designs()
    S = _sand()
    shares, kept = {}, []
    for s, rate in CANDIDATES:
        kt = [S.predict(x, s, rate)["r_kt"] for x in xs]
        shares[G.cid(s, rate)] = sum(1 for k in kt if k <= R_FLAG) / len(kt)
        print(G.cid(s, rate), round(shares[G.cid(s, rate)], 3), flush=True)
    for lo, hi in TARGETS:
        for s, rate in CANDIDATES:
            c = G.cid(s, rate)
            if lo <= shares[c] < hi and c not in kept and s not in {k.split("@")[0] for k in kept}:
                kept.append(c)
                break
    (HERE / "choose.json").write_text(json.dumps(dict(shares=shares, chosen=kept), indent=1) + "\n")
    print("chosen:", kept)


def _chosen():
    return tuple(G._parse(c) for c in json.loads((HERE / "choose.json").read_text())["chosen"])


def report():
    kept = json.loads((HERE / "probe.json").read_text())["kept"]
    by = {}
    for r in R._load(HERE / "bench.jsonl"):
        by.setdefault(r["cond"], {})[(r["j"], r["what"])] = r
    L = ["cell-fidelity milestone 5j: r_kt as a pre-screen (DFN for r_kt <= 0.10 with no SPMe run; 5e rule and 5h band stop on the rest)", "",
         "Probe (baseline design, 2 cycles): " + ", ".join(f"{c} {'ok' if c in kept else 'fails'}" for c in json.loads((HERE / "choose.json").read_text())["chosen"]), ""]
    summ = dict(kept=kept, conditions={})
    for c in kept:
        rows, dropped = G.pool(by.get(c, {}))
        if not rows:
            continue
        s, rate = G._parse(c)
        xs = [by[c][(r["j"], "V0")]["x"] for r in rows]
        kt, t_pred = rkt_for(rows, xs, s, rate)
        e = dict(evaluate(rows, kt, t_pred), set=s, rate=rate, dropped=dropped,
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
    elif cmd == ["choose"]:
        choose()
    elif cmd in (["probe"], ["bench"]):
        _use_gate_machinery(_chosen())
        (G.probe if cmd == ["probe"] else G.bench)()
    elif cmd == ["report"]:
        report()
    else:
        print(__doc__)
