"""Milestone 7zd: a film-resistivity ladder between 7zc (SEI resistivity x 0) and 7zb (x 1, Marquis2019's 2e5 Ohm m).

    WORKERS=4 OMP_NUM_THREADS=1 python experiments/sei7zd/run.py control       # this driver at rho = 0 vs 7zc's probe rows
    WORKERS=4 OMP_NUM_THREADS=1 python experiments/sei7zd/run.py all <rung>    # probe, choose, bench, rows, report on one rung
    python experiments/sei7zd/run.py summary                                  # the ladder, with 7zc and 7zb as its ends; H372 to H376

7zc showed that, with plating off and the film's resistance removed, SEI growth alone makes Marquis2019@2x drift (median
m 0.365) and that the drift-size gate (gD) keeps 7v's correction on where it pays, while the plating-share gate (gP)
switches it off. 7zb showed that with the shipped resistivity no SEI rate reaches the fade band: the film chokes the
charge. This step asks what happens in between: each rung multiplies the SEI resistivity by RHO in RHOS (fixed in the
plan), re-runs 7zb's whole g ladder probe, keeps the smallest passing g, and runs 7zb's bench, rows and report (7r's
and 7za's rules) on it. Each rung lives in its own directory (rho<RHO>/) with a three-line shim run.py, because 7r's
spawner calls <dir>/run.py. Plan in ../../LOG.md (7zd plan).
"""
import importlib.util
import json
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
RHOS = (1e-3, 1e-2, 1e-1)                        # fixed in the plan; 0 is 7zc, 1 is 7zb
G_REF = 1e5                                      # 7zc's kept g: the rung-to-rung comparison for H373
D_MIN = 0.10                                     # 7y's drift-size threshold


def _mod(name, path):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


C = _mod("sei7zc_run", EXP / "sei7zc" / "run.py")
B = C.B


def rung_dir(rho):
    return HERE / f"rho{rho:.0e}"


def point(d, rho):
    """Point 7zb's and 7r's code at rung directory d and set 7zc's lever to SEI resistivity x rho."""
    C.RHO = rho
    B.HERE = d
    B._point_here()


SHIM = '''"""Rung shim for milestone 7zd (see ../run.py): 7r's spawner calls this file."""
import importlib.util, sys
from pathlib import Path
_s = importlib.util.spec_from_file_location("sei7zd_run", Path(__file__).resolve().parents[1] / "run.py")
_m = importlib.util.module_from_spec(_s); sys.modules["sei7zd_run"] = _m; _s.loader.exec_module(_m)
_m.main(Path(__file__).resolve().parent, sys.argv[1:])
'''


def rho_of(d):
    return float(d.name[3:])


def main(d, argv):
    point(d, rho_of(d))
    cmd = argv[0]
    if cmd == "child":
        print(json.dumps(C.child(json.loads(argv[1]), int(argv[2]))))
        return
    steps = ("probe", "choose", "bench", "rows", "report") if cmd == "all" else (cmd,)
    for s in steps:
        if s in ("bench", "rows", "report") and not json.loads((d / "choose.json").read_text())["kept"]:
            print(f"{d.name}: no kept g, {s} not run")
            continue
        {"probe": B.probe, "choose": B.choose_cmd, "bench": B.bench, "rows": B.rows, "report": B.report}[s]()


def make_rung(rho):
    d = rung_dir(rho)
    d.mkdir(exist_ok=True)
    (d / "run.py").write_text(SHIM)
    return d


def control():
    """This driver's child at rho = 0 (a scratch rung) on g = G_REF, probe designs 0 to 3, against 7zc's probe rows."""
    d = make_rung(0.0)
    point(d, 0.0)
    bal = B.R._bal()
    from concurrent.futures import ThreadPoolExecutor
    jobs = [(B.COND, j, bal[(B.COND, j)]["x"], G_REF) for j in range(B.R.N_PROBE)]
    with ThreadPoolExecutor(B.R.WORKERS) as ex:
        res = list(ex.map(lambda jb: B.R._spawn(jb, B.R.PROBE_CYCLES), jobs))
    ref = {r["j"]: r for r in B.R._load(EXP / "sei7zc" / "probe.jsonl") if r["mult"] == G_REF}
    out = [dict(j=r["j"], ok=r["ok"], max_rel=max(abs(a - b) / max(abs(b), 1e-30)
                                                   for a, b in zip(r["lost_mol"], ref[r["j"]]["lost_mol"]))
                if r["ok"] else None) for r in res]
    (HERE / "control.json").write_text(json.dumps(out, indent=1) + "\n")
    print(out)


# ---------- summary (pure parts tested) ----------

def monotone_down(xs):
    return all(b < a for a, b in zip(xs, xs[1:]))


def judge(rows):
    """H372 to H376 from the ladder rows (ordered by rho, 7zc's rho = 0 first, 7zb's rho = 1 last). Each row: rho,
    kept (g or None), fade_ref and tch_ref (median fade and charge-time ratio at g = G_REF), and for kept rungs
    D (median |m - 1|), gD (folds on of 5), pick (oracle), d_DT (thetaD - theta), met (per rule)."""
    mid = [r for r in rows if 0 < r["rho"] < 1]
    kept = [r for r in rows if r["kept"] is not None]
    kept_mid = [r for r in mid if r["kept"] is not None]
    V = {}
    V["H372"] = B.verdict(bool(kept_mid), not kept_mid)
    tch = [r["tch_ref"] for r in rows]
    fade = [r["fade_ref"] for r in rows]
    ok = None not in tch and None not in fade
    V["H373"] = B.verdict(ok and monotone_down(tch) and monotone_down(fade), ok and not (monotone_down(tch) and monotone_down(fade)))
    if not kept_mid:
        V.update({h: "not run (no kept middle rung)" for h in ("H374", "H375", "H376")})
        return V
    V["H374"] = B.verdict(all(r["D"] >= D_MIN for r in kept_mid), any(r["D"] < 0.05 for r in kept_mid))
    agree = [(r["gD"] >= 3) == (r["pick"] == "thetaH") for r in kept]
    V["H375"] = B.verdict(all(agree), not all(agree))
    V["H376"] = B.verdict(all(r["d_DT"] <= 0 for r in kept_mid), any(r["d_DT"] > 0 for r in kept_mid))
    return V


def _row(d, rho):
    point(d, rho)
    res = B._res()
    ch = json.loads((d / "choose.json").read_text())
    kept = ch["kept"].get(B.COND)
    bal = B.R._bal()
    n_li = {j: bal[(B.COND, j)]["n_li"] for j in range(B.R.N_PROBE)}
    pr = B.R._load(d / "probe.jsonl")
    dg = B.diag([r for r in pr if r["mult"] == G_REF], n_li)
    row = dict(rho=rho, rho_ohm_m=rho * 2e5, kept=kept, fade_ref=res[G_REF][2], fin_ref=res[G_REF][0],
               tch_ref=dg["t_ch_ratio"] if dg else None, slope_ref=dg["slope"] if dg else None,
               fade={f"{g:g}": v[2] for g, v in res.items()})
    if kept is not None:
        s = json.loads((d / "summary.json").read_text())
        e = s.get("extra_7zb") or s.get("extra_7zc")
        z = json.loads((d / "rules" / "summary.json").read_text())
        row.update(D=e["drift"]["med_abs"], med_m=e["drift"]["med_m"], phi10=e["phi10"]["median"],
                   gD=sum(z["gates"]["D"]), gP=sum(z["gates"]["P"]), gN=sum(z["gates"]["N"]), pick=z["oracle"],
                   d_DT=z["pair"].get("thetaD-theta", {}).get("mean"), d_CU=z["pair"]["thetaC-U"]["mean"],
                   total=z["total"])
    return row


def summary():
    rows = [_row(EXP / "sei7zc", 0.0)]
    rows += [_row(rung_dir(r), r) for r in RHOS]
    rows.append(_row(EXP / "sei7zb", 1.0))
    for r in rows:
        if r["kept"] is not None and r["d_DT"] is None:          # 7za's pair table may not name thetaD - theta
            r["d_DT"] = r["total"]["thetaD"]["cycles"] - r["total"]["theta"]["cycles"]
    V = judge(rows)
    L = ["7zd: SEI film-resistivity ladder (plating off; Marquis2019@2x; rho = multiplier of 2e5 Ohm m; 0 is 7zc, 1 is 7zb)",
         f"{'rho':>7s}{'Ohm m':>9s}{'fade@1e5':>10s}{'tch@1e5':>9s}{'slope':>7s}{'kept g':>8s}{'med m':>7s}{'|m-1|':>7s}"
         f"{'gD':>4s}{'gP':>4s}{'oracle':>8s}{'D-theta':>9s}{'C-U':>8s}  met/cycles theta, U, thetaH, thetaD"]
    f = lambda v, p: "-" if v is None else f"{v:.{p}f}"
    for r in rows:
        t = r.get("total")
        tt = "  ".join(f"{t[k]['met']}/{t[k]['cycles']:.1f}" for k in ("theta", "U", "thetaH", "thetaD")) if t else ""
        L.append(f"{r['rho']:7g}{r['rho_ohm_m']:9g}{f(r['fade_ref'], 4):>10s}{f(r['tch_ref'], 3):>9s}"
                 f"{f(r['slope_ref'], 2):>7s}{'-' if r['kept'] is None else format(r['kept'], 'g'):>8s}"
                 f"{f(r.get('med_m'), 3):>7s}{f(r.get('D'), 3):>7s}{r.get('gD', '-')!s:>4s}{r.get('gP', '-')!s:>4s}"
                 f"{r.get('pick', '-'):>8s}{f(r.get('d_DT'), 2):>9s}{f(r.get('d_CU'), 2):>8s}  {tt}")
    L.append("")
    for h, t in (("H372", f"some rho in {list(RHOS)} keeps a cell (passes 7zb's probe rule at some g)"),
                 ("H373", "at g = 1e5, fade and charge-time ratio fall strictly from rho = 0 to rho = 1"),
                 ("H374", "every kept middle rung drifts large: median |m - 1| >= 0.10"),
                 ("H375", "on every kept rung (0 included) gD's majority matches 7y's oracle (on <=> thetaH)"),
                 ("H376", "on every kept middle rung thetaD - theta <= 0 (five-fold mean)")):
        L.append(f"{h} ({t}): {V[h]}")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(rows=rows, verdicts=V), indent=1, default=str) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[0] == "control":
        control()
    elif a[0] == "summary":
        summary()
    else:
        main(make_rung(float(a[1])), [a[0]] + a[2:])     # all|probe|choose|bench|rows|report <rho>
