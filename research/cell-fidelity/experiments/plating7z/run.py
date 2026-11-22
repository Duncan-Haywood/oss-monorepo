"""Milestone 7z: a seventh set-condition, Marquis2019, by 7r's plating ladder, and the seven-set interval.

    WORKERS=3 OMP_NUM_THREADS=1 python experiments/plating7z/run.py control  # f = 1 through 7r's wrapper vs 7p's probe rows
    WORKERS=3 OMP_NUM_THREADS=1 python experiments/plating7z/run.py probe    # 4 multipliers x 4 designs x 20 cycles
    python experiments/plating7z/run.py choose                              # 7r's probe rule -> choose.json (stdlib)
    WORKERS=3 OMP_NUM_THREADS=1 python experiments/plating7z/run.py bench    # the kept condition, 56 designs to cycle 100
    python experiments/plating7z/run.py rows                                # 7p's rows code via 7r (4 cores)
    python experiments/plating7z/run.py report                              # 7r's report, then H354 to H357 (stdlib)

7p benched Marquis2019 at 2x and 3x and found it barely fades (0.16% and 0.08% of n_Li lost from cycle 2 to 20); 7r
tuned Mohtat2020 and Ecker2015 into the committed sets' fade band by scaling the plating exchange-current density and
nothing else. Marquis2019 is the one stock PyBaMM cell that passes the design mapping (5i), has a pole-free OCP (7q's
scan) and no step has tuned. It ships no plating parameters, so the protocol copies OKane2022's (F k c_e, k = 1e-9 m/s;
`transfer/run.py` `params`) and the ladder scales that copy. Everything else is 7r's code, pointed at this directory.
Plan in ../../LOG.md (7z plan).
"""
import importlib.util
import json
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
CELLS = ("Marquis2019@2x",)                 # fixed in the plan: 7p's higher-fade Marquis condition (0.0016 vs 0.0008)
BASE_FADE = {"Marquis2019@2x": 0.0016}      # 7p's probe at multiplier 1 (sets7p/choose.json)
PHI_ON = 0.9                                # 7y's plating-share gate threshold


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
    """7r's functions read and write next to their HERE and loop over their CELLS; point both at this step."""
    R.HERE = HERE
    R.CELLS = CELLS
    R.BASE_FADE = BASE_FADE


# ---------- pure helpers (tested) ----------

def phi10(P, L):
    """7y's early plating share (P10 - P2) / (L10 - L2) from per-cycle cumulative plated and lost lithium."""
    dl = L[9] - L[1]
    return (P[9] - P[1]) / dl if dl > 0 else None


def verdict(sup, ref):
    return "supported" if sup else ("refuted" if ref else "inconclusive")


def judge(kept, q75, met, seven):
    """H354 to H357. kept: {cond: mult}; q75: q75 E10 of the new set (None if not benched); met: theta's lopo5 folds met
    on it; seven: {mean, boot} of theta - U over the seven set-conditions (None if not run). Pure; tested."""
    V = dict(H354=verdict(bool(kept), not kept))
    if q75 is None or seven is None:
        V.update({h: "not run (no kept cell)" for h in ("H355", "H356", "H357")})
        return V
    V.update(H355=verdict(q75 <= 0.2, q75 > 1),
             H356=verdict(met >= 4, met <= 2),
             H357=verdict(seven["boot"][1] < 0, seven["mean"] >= 0))
    return V


def pool_pairs(S, folds_a, folds_b):
    """Summary of a list of paired folds: mean, set bootstrap, sign test, per-set means."""
    pr = S.paired(folds_a, folds_b)
    pos, neg, p = S.sign_test([r["d"] for r in pr])
    sets = sorted({r["set"] for r in pr})
    return dict(n=len(pr), sets=len(sets), mean=sum(r["d"] for r in pr) / len(pr),
                boot=list(S.set_boot(pr)) if len(sets) > 1 else None, cheaper=neg, dearer=pos, sign_p=p,
                met_a=sum(r["met_a"] for r in pr), met_b=sum(r["met_b"] for r in pr),
                per_set={s: sum(r["d"] for r in pr if r["set"] == s) / sum(1 for r in pr if r["set"] == s) for s in sets})


# ---------- commands ----------

def control():
    _point_here()
    R.control()


def probe():
    _point_here()
    R.probe()


def choose():
    _point_here()
    R.choose_cmd()


def bench():
    _point_here()
    R.bench()


def rows():
    _point_here()
    R.rows()


def _folds(path, rule):
    return [dict(set=f["set"], pool=f["pool"], cycles=float(f["cycles"]), met=bool(f["met"]))
            for f in json.loads(path.read_text())["lopo5"][rule]]


def report():
    _point_here()
    R.report()                                   # 7r's results.txt / summary.json format, on Marquis2019
    s = json.loads((HERE / "summary.json").read_text())
    S = R._s7p()
    kept = s["kept"]
    q75 = met = seven = None
    extra = {}
    L = ["", "---- 7z: the lines above are 7r's report replayed on Marquis2019 (its H317 to H321 labels are 7r's; "
         "\"four\" = 7h's 20 committed folds, \"new\" = Marquis2019); 7z is judged below ----"]
    if kept and "lopo5" in s:
        st = S._parse(CELLS[0])[0]
        q75 = s["pools"][st]["q75_10"]
        met = s["per_set"][st]["theta"]["met"]
        new = {r: [dict(set=f["set"], pool=f["pool"], cycles=float(f["cycles"]), met=bool(f["met"]))
                   for f in s["lopo5"][r]] for r in ("theta", "U")}
        h7 = {r: _folds(EXP / "fresh7h" / "summary.json", r) for r in ("theta", "U")}
        r7 = {r: _folds(EXP / "plating7r" / "summary.json", r) for r in ("theta", "U")}
        r7s = {r: _folds(EXP / "plating7s" / "summary.json", r) for r in ("theta", "U")}
        combos = dict(six_f10=(h7, r7), seven_f10=(h7, r7, new), seven_f30=(h7, r7s, new), five_new=(h7, new))
        for name, parts in combos.items():
            extra[name] = pool_pairs(S, [f for p in parts for f in p["theta"]], [f for p in parts for f in p["U"]])
        seven = extra["seven_f10"]
        fin = [r for r in R._load(HERE / "bench.jsonl")
               if r.get("ok") and r.get("ok_cycles", 0) >= 100 and r["mult"] == kept[CELLS[0]]]
        phis = [v for v in (phi10(r["pl_mol"], r["lost_mol"]) for r in fin) if v is not None]
        extra["phi10"] = dict(median=statistics.median(phis), min=min(phis), n=len(phis), gate_on=statistics.median(phis) >= PHI_ON)
        L += [f"bench finished to cycle 100: {len(fin)}/{R.N_RUN}",
              f"early plating share phi10 on the kept cell: median {extra['phi10']['median']:.3f}, min "
              f"{extra['phi10']['min']:.3f} over {len(phis)} designs (7y's gP would be "
              f"{'on' if extra['phi10']['gate_on'] else 'off'})",
              "", "paired lopo5 folds, theta minus U (DFN cycles per design; negative = theta cheaper):",
              f"{'pooling':12s}{'sets':>5s}{'folds':>6s}{'mean':>8s}{'set bootstrap 95%':>22s}{'cheaper':>9s}{'dearer':>8s}"
              f"{'sign p':>8s}{'met a/b':>9s}"]
        for name, d in extra.items():
            if name == "phi10":
                continue
            bt = f"{d['boot'][0]:+.2f} to {d['boot'][1]:+.2f}" if d["boot"] else "-"
            L.append(f"{name:12s}{d['sets']:5d}{d['n']:6d}{d['mean']:+8.2f}{bt:>22s}{d['cheaper']:9d}{d['dearer']:8d}"
                     f"{d['sign_p']:8.3f}{d['met_a']:>5d}/{d['met_b']}")
        L.append("per set (seven_f10): " + ", ".join(f"{k} {v:+.2f}" for k, v in seven["per_set"].items()))
    V = judge(kept, q75, met, seven)
    for h, t in (("H354", "some multiplier in (3, 10, 30, 100) makes Marquis2019@2x pass 7r's probe rule"),
                 ("H355", "the forecast law works on the kept cell, q75 E10 <= 0.2"),
                 ("H356", "theta meets >= 4 of 5 lopo5 folds on the kept cell"),
                 ("H357", "the seven-set (f = 10 tuned cells) bootstrap interval of theta - U lies below zero")):
        L.append(f"{h} ({t}): {V[h]}")
    with (HERE / "results.txt").open("a") as fh:
        fh.write("\n".join(L) + "\n")
    s["verdicts_7z"] = V
    s["pooled_7z"] = extra
    (HERE / "summary.json").write_text(json.dumps(s, indent=1, default=str) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    if sys.argv[1] == "child":
        _point_here()
        print(json.dumps(R.child(json.loads(sys.argv[2]), int(sys.argv[3]))))
    else:
        {"control": control, "probe": probe, "choose": choose, "bench": bench, "rows": rows,
         "report": report}[sys.argv[1]]()
