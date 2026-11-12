"""Milestone 5c: how should the trust flag's cut-off be set on a new cell, and what does it cost in DFN runs?

    python experiments/calibrate/run.py probe    # baseline design, 2 cycles, SPMe and DFN on the candidate sets -> probe.json
    python experiments/calibrate/run.py bench    # 64 Sobol (seed 3) designs x SPMe/DFN on the chosen set X, 100 cycles (resumable)
    python experiments/calibrate/run.py report   # results.txt, summary.json (stdlib only)

Strategies, recall and the hypotheses are fixed in ../../LOG.md (milestone 5c plan) before the run. The design
mapping, protocol, areal current density and copied degradation keys are milestone 5b's (../transfer/run.py,
imported unchanged). Costs are counted in DFN@100 calls: SPMe has already run on every design.
"""
import importlib.util
import json
import os
import random
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent

CANDIDATES = ("Mohtat2020", "NCA_Kim2011", "Prada2013", "ORegan2022")
X2 = "NCA_Kim2011"                 # second new set, added after the probe and before any bench run (LOG amendment)
SOBOL_SEED = 3
N_LOG2 = 6
WORKERS = int(os.environ.get("WORKERS", "3"))
TSTAR = 0.07                       # milestone 5b's t*, from OKane2022's 256 designs
GRID = [k / 100 for k in range(101)]
KS = (4, 8, 16, 32)
SS = (1, 2, 3, 5, 8)
DRAWS = 1000


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


TR = _mod("transfer_run", EXP / "transfer" / "run.py")
CR = TR.CR


# ---------- pure helpers (stdlib; tested) ----------

def choose_set(probe):
    """The plan's rule: first candidate whose SPMe and DFN runs succeed with SPMe r_min in [0.05, 0.45];
    else the first whose runs succeed; else None."""
    ok = [s for s in CANDIDATES if probe.get(s, {}).get("SPMe", {}).get("ok") and probe.get(s, {}).get("DFN", {}).get("ok")]
    for s in ok:
        if 0.05 <= probe[s]["SPMe"]["r_min"] <= 0.45:
            return s
    return ok[0] if ok else None


def cutoff_largest(r, bad, grid):
    """Largest grid threshold minimising misclassification of bad by (r <= t) on the given designs."""
    best = min(TR.misclass(r, bad, t) for t in grid)
    return max(t for t in grid if TR.misclass(r, bad, t) == best)


def fixed(r, bad, t):
    """Strategy F: verify every design with r <= t. Returns (recall, calls)."""
    v = [a <= t for a in r]
    return _recall(v, bad), sum(v)


def calibrated(r, bad, k, rng, grid=GRID):
    """Strategy C_k: DFN k random designs, set the cut-off on them, verify the rest at or below it."""
    n = len(r)
    cal = set(rng.sample(range(n), k))
    t = cutoff_largest([r[i] for i in sorted(cal)], [bad[i] for i in sorted(cal)], grid)
    v = [i in cal or r[i] <= t for i in range(n)]
    return _recall(v, bad), sum(v), t


def bottom_up(r, bad, s):
    """Strategy B_s: verify in ascending r (ties by index) until s consecutive trusted designs."""
    order = sorted(range(len(r)), key=lambda i: (r[i], i))
    v, run = [False] * len(r), 0
    for i in order:
        v[i] = True
        run = 0 if bad[i] else run + 1
        if run >= s:
            break
    return _recall(v, bad), sum(v), v


def _recall(v, bad):
    nb = sum(bad)
    return sum(1 for a, b in zip(v, bad) if a and b) / nb if nb else float("nan")


def median(v):
    v = sorted(v)
    n = len(v)
    return v[n // 2] if n % 2 else 0.5 * (v[n // 2 - 1] + v[n // 2])


# ---------- simulation (pybamm, via milestone 5b's child process) ----------

def probe():
    from energy_cell import cell
    x = list(map(float, cell.BASELINE))
    out = {}
    for s in CANDIDATES:
        out[s] = {}
        for m in ("SPMe", "DFN"):
            r = TR._spawn(x, m, 2, s, timeout=900)
            out[s][m] = dict(ok=r["ok"], cycles=r["ok_cycles"], seconds=r["seconds"], error=r.get("error"),
                             r_min=r.get("r_min"), current_A=r.get("current_A"), copied=r.get("copied"),
                             wh=(r.get("cycle_wh") or [None])[-1])
            print(s, m, out[s][m], flush=True)
    out["chosen"] = choose_set(out)
    (HERE / "probe.json").write_text(json.dumps(out, indent=1) + "\n")
    print("chosen:", out["chosen"])


def designs():
    import numpy as np
    from scipy.stats import qmc
    from energy_cell import cell
    u = qmc.Sobol(d=4, scramble=True, seed=SOBOL_SEED).random_base2(N_LOG2)
    return [list(map(float, r)) for r in np.asarray(cell.BOUNDS[:, 0] + u * (cell.BOUNDS[:, 1] - cell.BOUNDS[:, 0]))]


def bench():
    psets = [json.loads((HERE / "probe.json").read_text())["chosen"], X2]
    path = HERE / "bench.jsonl"
    done = {(r["set"], r["j"], r["model"]) for r in map(json.loads, path.read_text().splitlines())} if path.exists() else set()
    xs = designs()
    jobs = [(s, j, m) for s in psets for m in ("DFN", "SPMe") for j in range(len(xs)) if (s, j, m) not in done]

    def go(job):
        s, j, m = job
        return dict(set=s, j=j, model=m, x=xs[j], **TR._spawn(xs[j], m, 100, s))

    with ThreadPoolExecutor(WORKERS) as ex, path.open("a") as f:
        for r in ex.map(go, jobs):
            if "exit -9" in (r.get("error") or ""):
                print(r["set"], r["j"], r["model"], "killed (-9), not recorded", flush=True)
                continue
            r.pop("copied", None)
            f.write(json.dumps(r) + "\n")
            f.flush()
            print(r["set"], r["j"], r["model"], r["ok"], r["ok_cycles"], r["seconds"] and round(r["seconds"], 1), flush=True)


# ---------- report ----------

def _set_rows(path, pset=None):
    rows = {}
    for r in map(json.loads, Path(path).read_text().splitlines()):
        if pset is None or r.get("set") == pset:
            rows.setdefault(r["j"], {})[r["model"]] = r
    return rows


def _triple(rows):
    """(r_min, SPMe@100, DFN@100) lists over the designs in rows, milestone 2's score rule."""
    js = sorted(rows)
    sc = lambda m: [CR.score_at(rows[j][m], 100, rows[j][m]["mass_kg"]) if rows[j][m].get("mass_kg") else 0.0 for j in js]
    rec = all("r_cycle" in rows[j]["SPMe"] for j in js)   # milestones 2 and 5a did not record per-cycle r
    r2 = [min(rows[j]["SPMe"]["r_cycle"][:2]) if rows[j]["SPMe"]["r_cycle"] else 0.0 for j in js] if rec else None
    inc = [rows[j]["SPMe"].get("ok_cycles", 0) < 100 for j in js]
    return [rows[j]["SPMe"]["r_min"] for j in js], sc("SPMe"), sc("DFN"), r2, inc


def load_all():
    out = {}
    a = _triple(_set_rows(EXP / "cycles" / "bench.jsonl"))
    b = _triple(_set_rows(EXP / "fresh" / "bench.jsonl"))
    out["OKane2022"] = tuple(None if x is None else x + y for x, y in zip(a, b))
    for s in ("Ai2020", "Ecker2015"):
        out[s] = _triple(_set_rows(EXP / "transfer" / "bench.jsonl", s))
    if (HERE / "bench.jsonl").exists():
        for pset in (json.loads((HERE / "probe.json").read_text())["chosen"], X2):
            rows = _set_rows(HERE / "bench.jsonl", pset)
            assert len(rows) == 64 and all(len(v) == 2 for v in rows.values()), f"{pset} bench incomplete"
            out[pset] = _triple(rows)
    return out


def report():
    data = load_all()
    sets = list(data)
    x_set = sets[3] if len(sets) > 3 else None
    L = ["cell-fidelity milestone 5c: setting the trust flag's cut-off on a new cell (costs in DFN@100 calls)", ""]
    summ = dict(x_set=x_set, sets={})
    for s in sets:
        r, sp, dfn, r2, inc = data[s]
        bad = TR.untrusted(sp, dfn)
        n, nb = len(r), sum(bad)
        best = max(range(n), key=lambda i: dfn[i])
        e = dict(n=n, untrusted=nb, auc=TR.auc([-v for v in r], bad), auc_2cycle=TR.auc([-v for v in r2], bad) if r2 else None,
                 incomplete=sum(inc), untrusted_incomplete=sum(1 for a, b in zip(inc, bad) if a and b),
                 own_cutoff=TR.best_threshold(r, bad, GRID), best_untrusted=bad[best])
        e["own_misclass"] = TR.misclass(r, bad, e["own_cutoff"])
        e["F"] = dict(zip(("recall", "calls"), fixed(r, bad, TSTAR)), misclass=TR.misclass(r, bad, TSTAR),
                      best_verified=r[best] <= TSTAR)
        e["B"] = {}
        for s_ in SS:
            rec, calls, v = bottom_up(r, bad, s_)
            e["B"][s_] = dict(recall=rec, calls=calls, best_verified=v[best])
        e["C"] = {}
        for k in KS:
            rng = random.Random(0)
            res = [calibrated(r, bad, k, rng) for _ in range(DRAWS)]
            recs = [a for a, _, _ in res]
            e["C"][k] = dict(recall_median=median(recs), recall_p10=sorted(recs)[DRAWS // 10],
                             calls_median=median([c for _, c, _ in res]), cutoff_median=median([t for _, _, t in res]),
                             share_recall_below_08=sum(1 for a in recs if a < 0.8) / DRAWS)
        summ["sets"][s] = e
        L += [f"== {s}: {n} designs, {nb} untrusted ({nb / n:.1%}); AUC of -r_min {e['auc']:.3f}, 2-cycle "
              f"{'not recorded' if e['auc_2cycle'] is None else format(e['auc_2cycle'], '.3f')};"
              f" own best cut-off {e['own_cutoff']:.2f} (misclassification {e['own_misclass']:.3f});"
              f" DFN-best design untrusted: {e['best_untrusted']}; SPMe runs short of 100 cycles {e['incomplete']}"
              f" ({e['untrusted_incomplete']} of them untrusted)",
              f"  F (r <= {TSTAR}): recall {e['F']['recall']:.3f}, calls {e['F']['calls']} ({e['F']['calls'] / n:.1%}),"
              f" misclassification {e['F']['misclass']:.3f}"]
        for s_ in SS:
            b = e["B"][s_]
            L.append(f"  B_{s_}: recall {b['recall']:.3f}, calls {b['calls']} ({b['calls'] / n:.1%}), DFN-best verified {b['best_verified']}")
        for k in KS:
            c = e["C"][k]
            L.append(f"  C_{k}: median recall {c['recall_median']:.3f} (10th pct {c['recall_p10']:.3f}, below 0.8 in"
                     f" {c['share_recall_below_08']:.1%} of draws), median calls {c['calls_median']:.1f}"
                     f" ({c['calls_median'] / n:.1%}), median cut-off {c['cutoff_median']:.2f}")
        L.append("")

    def enough(s):
        return 3 <= summ["sets"][s]["untrusted"] <= summ["sets"][s]["n"] - 3

    def verdicts(x):
        """H33 to H37 with x as the new set (the registered X, or the amendment's X2)."""
        dec = [s for s in ("OKane2022", "Ai2020", x) if s in summ["sets"] and enough(s)]
        h = {}
        b3 = {s: summ["sets"][s]["B"][3] for s in dec}
        c8 = {s: summ["sets"][s]["C"][8] for s in dec}
        h["H33"] = "refuted" if any(b3[s]["recall"] < 0.8 for s in dec) else (
            "supported" if all(b3[s]["recall"] >= 0.9 for s in dec) else "not supported")
        h["H34"] = "refuted" if any(c8[s]["recall_median"] < 0.8 for s in dec) else (
            "supported" if all(c8[s]["recall_median"] >= 0.9 for s in dec) else "not supported")
        dom = [b3[s]["recall"] >= c8[s]["recall_median"] and b3[s]["calls"] <= c8[s]["calls_median"] for s in dec]
        lose = [c8[s]["recall_median"] > b3[s]["recall"] and c8[s]["calls_median"] < b3[s]["calls"] for s in dec]
        h["H35"] = "supported" if all(dom) else ("refuted" if any(lose) else "mixed")
        if x in summ["sets"]:
            xs = summ["sets"][x]
            h["H36"] = "supported" if xs["F"]["misclass"] <= 0.20 else "refuted"
            h["H37"] = ("inconclusive" if not enough(x) else "supported" if xs["auc"] >= 0.90
                        else "refuted" if xs["auc"] < 0.80 else "not supported")
        else:
            h["H36"] = h["H37"] = "pending (no bench)"
        return h, dec

    summ["hypotheses"] = {}
    for label, x in (("primary", x_set), ("X2 " + X2, X2)):
        hyp, dec = verdicts(x)
        summ["hypotheses"][label] = dict(verdicts=hyp, deciding_sets=dec)
        L.append(f"H. hypotheses (fixed in LOG.md before the run), {label}: new set {x}; deciding sets {', '.join(dec)}")
        L += [f"{k} {v}" for k, v in hyp.items()]
        L.append("")
    # G: exploratory, chosen after the verdicts. An SPMe run that stops short of its protocol (a solver failure
    # PyBaMM returns as a partial solution) is flagged as if r_min were 0; no DFN call is needed to see it.
    L += ["G. (extra, after the verdicts, no hypothesis) flag = r_min <= t OR SPMe run short of 100 cycles"]
    summ["post_hoc_incomplete_flag"] = {}
    for s in sets:
        r, sp, dfn, _, inc = data[s]
        bad = TR.untrusted(sp, dfn)
        rr = [0.0 if a else v for v, a in zip(r, inc)]
        rng = random.Random(0)
        c8 = [calibrated(rr, bad, 8, rng) for _ in range(DRAWS)]
        f = fixed(rr, bad, TSTAR)
        b3 = bottom_up(rr, bad, 3)
        k = [i for i in range(len(r)) if not inc[i]]
        auc_c = TR.auc([-r[i] for i in k], [bad[i] for i in k])
        e = dict(complete=len(k), untrusted_complete=sum(bad[i] for i in k), auc_complete=auc_c if auc_c == auc_c else None,
                 auc=TR.auc([-v for v in rr], bad), F=dict(recall=f[0], calls=f[1], misclass=TR.misclass(rr, bad, TSTAR)),
                 B3=dict(recall=b3[0], calls=b3[1]), C8=dict(recall_median=median([a for a, _, _ in c8]),
                                                            calls_median=median([c for _, c, _ in c8])))
        summ["post_hoc_incomplete_flag"][s] = e
        n = len(r)
        L.append(f"  {s}: SPMe runs reaching cycle 100 {len(k)}, untrusted among them {e['untrusted_complete']}, AUC of -r_min"
                 f" among them {'n/a' if e['auc_complete'] is None else format(e['auc_complete'], '.3f')}")
        L.append(f"  {s}: AUC {e['auc']:.3f}; F recall {f[0]:.3f} calls {f[1]} ({f[1] / n:.1%}) misclassification"
                 f" {e['F']['misclass']:.3f}; B_3 recall {b3[0]:.3f} calls {b3[1]} ({b3[1] / n:.1%}); C_8 median recall"
                 f" {e['C8']['recall_median']:.3f} calls {e['C8']['calls_median']:.1f} ({e['C8']['calls_median'] / n:.1%})")
    L.append("")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(summ, indent=1, default=str) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    cmd = sys.argv[1:2]
    {"probe": probe, "bench": bench, "report": report}.get(cmd[0] if cmd else "", lambda: print(__doc__))()
