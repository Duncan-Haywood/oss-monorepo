"""Milestone 7s: is 7r's across-chemistry interval a property of one plating multiplier? 7r's code, rerun with f = 30.

    WORKERS=3 OMP_NUM_THREADS=1 python experiments/plating7s/run.py bench   # 2 cells x 56 designs to cycle 100 at f = 30
    python experiments/plating7s/run.py rows              # 7p's rows code via 7r (4 cores)
    python experiments/plating7s/run.py report            # 7r's report replayed at f = 30, then H322 to H325 (stdlib)

7r scaled the plating exchange-current density of Mohtat2020@3x and Ecker2015@2x by a ladder (3, 10, 30, 100), kept the
smallest multiplier whose probe designs fade like the committed sets (f = 10 on both), and found the six-set
set-bootstrap interval of theta minus U below zero for the first time (-6.94 to -0.57). f = 30 also passed 7r's probe
rule on both cells (median fade 0.107 and 0.120) and was not benched. This step benches it with 7r's code unchanged:
the only thing that differs is the multiplier, so whatever moves is a property of the tuned plating rate.
Plan in ../../LOG.md (7s plan).
"""
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
MULT = 30.0                    # fixed in the plan: the second multiplier that passed 7r's probe on both cells
F10 = {"new_mean": -2.20}      # 7r's new-set (10 fold) mean of theta - U at f = 10 (plating7r/summary.json)


def _mod(name, path):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


R = _mod("plating7r_run", EXP / "plating7r" / "run.py")


def _point_here():
    """7r's functions read and write next to their HERE; point them at this directory, but keep 7r's probe."""
    R.HERE = HERE
    probe_res = R._probe_res

    def from_7r():
        R.HERE = EXP / "plating7r"
        try:
            return probe_res()
        finally:
            R.HERE = HERE
    R._probe_res = from_7r


def write_choose():
    (HERE / "choose.json").write_text(json.dumps(dict(kept={c: MULT for c in R.CELLS},
                                                      note="fixed by the 7s plan, not by 7r's probe rule"), indent=1) + "\n")


def verdict(sup, ref):
    return "supported" if sup else ("refuted" if ref else "inconclusive")


def judge(s30, s10):
    """H322 to H325 from 7r's report summary at f = 30 (s30) and at f = 10 (s10). Pure; tested."""
    sets = list(s30["per_set"])
    E = s30["pools"]
    allp, newp = s30["paired"]["theta"]["all"], s30["paired"]["theta"]["new"]
    V = dict(
        H322=verdict(all(E[s]["q75_10"] <= 0.2 for s in sets), any(E[s]["q75_10"] > 1 for s in sets)),
        H323=verdict(allp["boot"][1] < 0, allp["mean"] >= 0),
        H324=verdict(newp["mean"] < 0, newp["mean"] > 0),
        H325=verdict(all(s30["per_set"][s]["theta"]["met"] >= 4 for s in sets),
                     any(s30["per_set"][s]["theta"]["met"] <= 2 for s in sets)))
    cmp = dict(all10=s10["paired"]["theta"]["all"], all30=allp, new10=s10["paired"]["theta"]["new"], new30=newp)
    return V, cmp


def bench():
    _point_here()
    write_choose()
    R.bench()


def rows():
    _point_here()
    R.rows()


def report():
    _point_here()
    R.report()                                  # results.txt / summary.json in 7r's format at f = 30
    s30 = json.loads((HERE / "summary.json").read_text())
    s10 = json.loads((EXP / "plating7r" / "summary.json").read_text())
    V, cmp = judge(s30, s10)
    fin = {}
    for r in R._load(HERE / "bench.jsonl"):
        if r.get("ok") and r.get("ok_cycles", 0) >= 100:
            fin.setdefault(r["cond"], set()).add(r["j"])
    L = ["", "---- 7s: the same report at f = 30 against 7r's f = 10 (the H317 to H321 lines above are 7r's labels, "
         "replayed; 7s is judged below) ----",
         "bench finished to cycle 100: " + ", ".join(f"{c} {len(fin.get(c, ()))}/{R.N_RUN}" for c in R.CELLS),
         f"{'theta - U':14s}{'f=10 mean':>10s}{'f=10 95%':>20s}{'f=30 mean':>11s}{'f=30 95%':>20s}"]
    for name in ("all", "new"):
        a, b = cmp[name + "10"], cmp[name + "30"]
        fmt = lambda d: f"{d['boot'][0]:+.2f} to {d['boot'][1]:+.2f}" if d.get("boot") else "-"
        L.append(f"{name:14s}{a['mean']:+10.2f}{fmt(a):>20s}{b['mean']:+11.2f}{fmt(b):>20s}")
    for h, t in (("H322", "the forecast law works on each f = 30 cell, q75 E10 <= 0.2"),
                 ("H323", "the six-set interval of theta - U lies below zero at f = 30"),
                 ("H324", "the two tuned cells' 10-fold mean of theta - U is negative at f = 30"),
                 ("H325", "theta meets >= 4 of 5 lopo5 folds on each f = 30 cell")):
        L.append(f"{h} ({t}): {V[h]}")
    with (HERE / "results.txt").open("a") as fh:
        fh.write("\n".join(L) + "\n")
    s30["verdicts_7s"] = V
    s30["compare_f10"] = cmp
    s30["finished"] = {c: sorted(v) for c, v in fin.items()}
    (HERE / "summary.json").write_text(json.dumps(s30, indent=1, default=str) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    if sys.argv[1] == "child":
        print(json.dumps(R.child(json.loads(sys.argv[2]), int(sys.argv[3]))))
    else:
        {"bench": bench, "rows": rows, "report": report}[sys.argv[1]]()
