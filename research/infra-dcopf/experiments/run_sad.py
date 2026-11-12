"""Held-out test of the successive linearisation (C) on PGLib-OPF v23.07's SAD cases.

Plan and predictions in LOG.md (2026-11-12, "Held-out test on PGLib's SAD cases", written before this ran).
SAD cases are the TYP cases with every branch's voltage-angle difference limited to 4.7-16.2 degrees.
For each case:
  AC OPF (PIPS; PYPOWER enforces the angle limits) against PGLib's published objective;
  plain DC-MP OPF with the angle limits (PYPOWER's rundcopf enforces them too);
  C-frozen: run_aclin.slp exactly as committed (thermal and slack rows only, blind to angles);
  C-ang:    the same step rules plus linearised angle-difference rows (aclin.linearise(angles=True)),
            an AC check that also counts angle violations, and the merit plus the worst angle excess (rad).
Start for both: the plain DC-MP dispatch if its DC OPF is feasible, else the DC-MP dispatch with the angle
limits removed. Every final dispatch gets the full check (thermal, slack, angle, V, Q).
Writes experiments/results_sad.txt and results_sad.json. Usage: run_sad.py [case ...]."""
import copy
import json
import sys
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
import numpy as np
from pypower.api import rundcopf, runopf, runpf
from pypower.idx_brch import ANGMAX, ANGMIN
from pypower.idx_bus import VM
from pypower.idx_gen import GEN_BUS, PG, VG

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE))
from infra_dcopf.aclin import angle_diffs, angle_limited  # noqa: E402
from infra_dcopf.pglib import baseline, case_path, load_m  # noqa: E402
from run_aclin import check, merit, slp  # noqa: E402
from run_pglib import ACOPT, CASES, DCOPT, PFOPT  # noqa: E402

ANG_TOL = 1e-3  # degrees


def angle_check(ppc, pg, vg):
    """Count and worst excess (degrees) of angle-difference violations of a dispatch's AC power flow."""
    p = copy.deepcopy(ppc)
    p["gen"][:, PG] = pg
    p["gen"][:, VG] = vg
    r, ok = runpf(p, PFOPT)
    if not ok:
        return None
    idx = angle_limited(ppc)
    d = angle_diffs(r, idx)
    br = ppc["branch"][idx]
    exc = np.maximum(d - br[:, ANGMAX], br[:, ANGMIN] - d)
    return {"n_ang": int((exc > ANG_TOL).sum()), "ang_exc_deg": float(max(exc.max(), 0.0)) if len(exc) else 0.0}


def make_check(vg):
    def full(ppc, pg, ac_ref):
        c = check(ppc, pg, ac_ref)
        if c is None:
            return None
        a = angle_check(ppc, pg, vg)
        if a is None:
            return None
        c.update(a)
        c["clean_thermal"] = c["clean"]
        c["clean"] = c["clean"] and a["n_ang"] == 0
        return c
    return full


def merit_ang(c, base_mva):
    return merit(c, base_mva) + np.deg2rad(c["ang_exc_deg"])


def best_of(hist):
    good = [x for x in hist if "n_over" in x]
    if not good:
        return None
    return next((x for x in good if x["clean"]), None) or min(good, key=lambda x: x["max_load"])


def run_case(name, pub):
    ppc = load_m(case_path(name, "sad"))
    t0 = time.time()
    ac = runopf(ppc, ACOPT)
    out = {"case": name, "ac_ok": bool(ac["success"]), "pub_ac": pub[1], "pub_dc": pub[0]}
    if not ac["success"]:
        out["secs"] = time.time() - t0
        return out
    out["ac"] = float(ac["f"])
    vm = dict(zip(ac["bus"][:, 0].astype(int), ac["bus"][:, VM]))
    vg = np.array([vm[int(b)] for b in ppc["gen"][:, GEN_BUS]])
    full = make_check(vg)
    out["ac_self"] = {k: v for k, v in full(ppc, ac["gen"][:, PG], ac).items() if k != "pg"}
    dc = rundcopf(ppc, DCOPT)
    out["dc_ok"] = bool(dc["success"])
    if dc["success"]:
        out["dc_cost"] = float(dc["f"])
        start = dc["gen"][:, PG].copy()
    else:
        free = copy.deepcopy(ppc)
        free["branch"][:, ANGMIN], free["branch"][:, ANGMAX] = -360.0, 360.0
        dcf = rundcopf(free, DCOPT)
        if not dcf["success"]:
            out["secs"] = time.time() - t0
            return out
        start = dcf["gen"][:, PG].copy()
    out["start"] = "DC with angle limits" if dc["success"] else "DC without angle limits"
    out["plain"] = full(ppc, start, ac)
    frozen = slp(ppc, start, vg, ac)
    fb = best_of(frozen)
    # frozen C stops on thermal-clean; give its chosen dispatch the full check
    out["C_frozen"] = {"rounds": len(frozen), "final": full(ppc, fb["pg"], ac) if fb else None,
                       "thermal_clean_at": next((x["it"] for x in frozen if x.get("clean")), None)}
    angc = slp(ppc, start, vg, ac, angles=True, check_fn=full, merit_fn=merit_ang)
    ab = best_of(angc)
    out["C_ang"] = {"rounds": len(angc), "final": {k: v for k, v in ab.items() if k != "pg"} if ab else None,
                    "clean_at": next((x["it"] for x in angc if x.get("clean")), None),
                    "hist": [{k: v for k, v in x.items() if k != "pg"} for x in angc]}
    out["secs"] = time.time() - t0
    return out


def pct(x, y):
    return 100.0 * (x / y - 1.0)


def cell(r, c):
    if c is None:
        return "PF failed"
    return (f"{c['n_over']:3d} {100 * c['max_load']:7.2f} {c['slack_out_mw']:6.1f} {c['n_ang']:4d} {c['ang_exc_deg']:6.3f} "
            f"{c['vviol']:3d} {c['qviol']:3d} {pct(c['cost'], r['ac']):+8.3f}%")


def main():
    only = sys.argv[1:]
    pub = baseline()
    rows = []
    for c in CASES:
        if only and c not in only:
            continue
        r = run_case(c, pub.get((c, "sad"), (float("nan"), float("nan"))))
        print(c, f"{r['secs']:.0f}s", flush=True)
        rows.append(r)
    clean = lambda o: {k: clean(v) for k, v in o.items()} if isinstance(o, dict) else [clean(v) for v in o] if isinstance(o, list) else (o.tolist() if isinstance(o, np.ndarray) else o)
    L = []
    P = L.append
    P("PGLib-OPF v23.07 SAD cases (angle-difference limits 4.7-16.2 deg): held-out test of successive linearisation.")
    P("Each dispatch run through an AC power flow, generator voltages at the AC optimum's schedule.")
    P("Cell: branches over 100 %, worst loading %, slack MW outside limits, angle-limit violations, worst angle")
    P("excess (deg), buses out of V band, generators outside Q limits, AC cost vs the AC optimum.")
    P("")
    P(f"{'case':18s} {'AC (ours)':>12s} {'AC (pub)':>12s} {'dAC%':>7s} {'DC-MP angle':>12s} {'DC (pub)':>12s}")
    for r in rows:
        if not r["ac_ok"]:
            P(f"{r['case']:18s} AC OPF did not converge (published {r['pub_ac']:.4e})")
            continue
        dc = f"{r['dc_cost']:12.1f}" if r.get("dc_ok") else f"{'infeasible':>12s}"
        P(f"{r['case']:18s} {r['ac']:12.1f} {r['pub_ac']:12.1f} {pct(r['ac'], r['pub_ac']):7.3f} {dc} {r['pub_dc']:12.1f}")
    P("")
    hdr = f"{'nOv':>3s} {'maxLd%':>7s} {'slkMW':>6s} {'nAng':>4s} {'angExc':>6s} {'V':>3s} {'Q':>3s} {'cost':>9s}"
    P(f"{'case':18s} {'method':9s} {'status':>16s} {hdr}")
    for r in rows:
        if "plain" not in r:
            continue
        P(f"{r['case']:18s} {'AC opt':9s} {'':>16s} {cell(r, r['ac_self'])}")
        P(f"{r['case']:18s} {'start':9s} {('DC+ang' if r['dc_ok'] else 'DC, no ang'):>16s} {cell(r, r['plain'])}")
        f = r["C_frozen"]
        st = f"thermal ok @{f['thermal_clean_at']}" if f["thermal_clean_at"] else f"not clean ({f['rounds']})"
        P(f"{r['case']:18s} {'C-frozen':9s} {st:>16s} {cell(r, f['final'])}")
        a = r["C_ang"]
        st = f"clean @{a['clean_at']}" if a["clean_at"] else f"not clean ({a['rounds']})"
        P(f"{r['case']:18s} {'C-ang':9s} {st:>16s} {cell(r, a['final'])}")
    P("")
    with_ac = [r for r in rows if "plain" in r]
    n = len(with_ac)
    val = sum(1 for r in rows if r["ac_ok"] and abs(pct(r["ac"], r["pub_ac"])) <= 0.01)
    dcinf = sum(1 for r in rows if r["ac_ok"] and not r.get("dc_ok"))
    dc_ang_bad = [r for r in with_ac if r["dc_ok"] and r["plain"] and r["plain"]["n_ang"] > 0]
    fz = with_ac
    fz_th = sum(1 for r in fz if r["C_frozen"]["final"] and r["C_frozen"]["final"]["clean_thermal"])
    fz_all = sum(1 for r in fz if r["C_frozen"]["final"] and r["C_frozen"]["final"]["clean"])
    ca = sum(1 for r in fz if r["C_ang"]["clean_at"])
    P(f"Summary ({len(rows)} SAD cases, {n} with an AC optimum and a start):")
    P(f"  H1 AC within 0.01 % of published: {val} of {sum(1 for r in rows if r['ac_ok'])}")
    P(f"  H2 DC-MP with angle limits infeasible: {dcinf} of {sum(1 for r in rows if r['ac_ok'])}; "
      f"feasible DC dispatches breaking an AC angle limit: {len(dc_ang_bad)} of {sum(1 for r in with_ac if r['dc_ok'])}")
    P(f"  H3 C-frozen thermal-and-slack clean: {fz_th} of {n}; also angle-clean: {fz_all} of {n}")
    P(f"  H4 C-ang fully clean (thermal, slack, angle): {ca} of {n}")
    P("Run time: " + ", ".join(f"{r['case']} {r['secs']:.0f}s" for r in rows))
    text = "\n".join(L) + "\n"
    if not only:
        (HERE / "results_sad.json").write_text(json.dumps(clean(rows), indent=1, default=float))
        (HERE / "results_sad.txt").write_text(text)
    print(text)


if __name__ == "__main__":
    main()
