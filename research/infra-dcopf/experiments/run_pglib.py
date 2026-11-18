"""DC against AC OPF on PGLib-OPF v23.07, typical (TYP) and congested (API) cases, with the
cases' own published thermal ratings (no synthetic caps).

Step 0, validation: PYPOWER's AC OPF (PIPS) and two DC OPF conventions against PGLib's
published PowerModels.jl/IPOPT objectives (data/pglib/BASELINE.md):
  DC-MP  MATPOWER's B matrix: b = 1/(x * tap), phase shifts kept;
  DC-PM  PowerModels' DCP model: b = x / (r^2 + x^2), taps ignored (emulated by x' = (r^2+x^2)/x, tap = 1).
Step 1, for each case and each DC convention:
  cost gap of the DC optimum to the AC optimum;
  the DC dispatch run through an AC power flow (generator voltages held at the AC optimum's
  schedule, slack pays the losses): branches over rating, worst loading, buses out of band,
  generators over their Q limits, slack outside its P limits, and the AC cost of the dispatch;
  which branches bind (multiplier > 1e-4 $/MWh): recall and precision of DC against AC;
  LMPs: Pearson r and mean absolute error against the AC LMPs.
Step 2, derating: DC-MP with every rating scaled by a in (1, 0.98, 0.95, 0.9, 0.85, 0.8); the largest a
whose dispatch has no AC overload (> 100.0 %) and its AC cost premium over the AC optimum.
Step 3, iterated AC-corrected DC (`corrected_dc`): loss feedback plus a per-branch rating cut on the
branches the AC check overloads, repeated until the dispatch is clean or the DC becomes infeasible.
Writes experiments/results_pglib.txt and experiments/results_pglib.json."""
import copy
import json
import sys
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
import numpy as np
from pypower.api import ppoption, rundcopf, runopf, runpf
from pypower.idx_brch import BR_R, BR_STATUS, BR_X, MU_SF, MU_ST, PF, PT, QF, QT, RATE_A, TAP
from pypower.idx_bus import BUS_TYPE, LAM_P, REF, VM, VMAX, VMIN
from pypower.idx_gen import GEN_BUS, GEN_STATUS, PG, PMAX, PMIN, QG, QMAX, QMIN, VG
from pypower.totcost import totcost

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from infra_dcopf.pglib import baseline, case_path, load_m  # noqa: E402

CASES = ["case14_ieee", "case24_ieee_rts", "case30_ieee", "case39_epri", "case57_ieee", "case73_ieee_rts",
         "case118_ieee", "case162_ieee_dtc", "case179_goc", "case200_activ", "case240_pserc", "case300_ieee"]
KINDS = ["typ", "api"]
ALPHAS = [1.0, 0.98, 0.95, 0.9, 0.85, 0.8]
ACOPT = ppoption(VERBOSE=0, OUT_ALL=0, OPF_ALG=560)
DCOPT = ppoption(VERBOSE=0, OUT_ALL=0)
PFOPT = ppoption(VERBOSE=0, OUT_ALL=0, ENFORCE_Q_LIMS=0, PF_MAX_IT=30)
MU_TOL = 1e-4


def pm_convention(ppc):
    """PowerModels DCP susceptance: b = x/(r^2+x^2), off-nominal taps ignored."""
    p = copy.deepcopy(ppc)
    r, x = p["branch"][:, BR_R], p["branch"][:, BR_X]
    p["branch"][:, BR_X] = (r * r + x * x) / x
    p["branch"][:, TAP] = 0.0
    return p


def derate(ppc, a):
    p = copy.deepcopy(ppc)
    p["branch"][:, RATE_A] *= a
    return p


def smax(res):
    br = res["branch"]
    return np.maximum(np.hypot(br[:, PF], br[:, QF]), np.hypot(br[:, PT], br[:, QT]))


def binding(res):
    br = res["branch"]
    return set(np.where((br[:, BR_STATUS] > 0) & (np.maximum(br[:, MU_SF], br[:, MU_ST]) > MU_TOL))[0])


def ac_check(ppc, dc_res, ac_res):
    """Run the DC dispatch through an AC power flow (the ORIGINAL network, true impedances).
    Gen voltage setpoints come from the AC optimum (the operator's voltage schedule)."""
    p = copy.deepcopy(ppc)
    p["gen"][:, PG] = dc_res["gen"][:, PG]
    vm = dict(zip(ac_res["bus"][:, 0].astype(int), ac_res["bus"][:, VM]))
    p["gen"][:, VG] = [vm[int(b)] for b in p["gen"][:, GEN_BUS]]
    r, ok = runpf(p, PFOPT)
    if not ok:
        return None
    rate = p["branch"][:, RATE_A]
    on = (p["branch"][:, BR_STATUS] > 0) & (rate > 0)
    load = smax(r)[on] / rate[on]
    bus = r["bus"]
    vviol = int(((bus[:, VM] > bus[:, VMAX] + 1e-4) | (bus[:, VM] < bus[:, VMIN] - 1e-4)).sum())
    g = r["gen"]
    live = g[:, GEN_STATUS] > 0
    qviol = int((live & ((g[:, QG] > g[:, QMAX] + 1e-3) | (g[:, QG] < g[:, QMIN] - 1e-3))).sum())
    ref_bus = bus[bus[:, BUS_TYPE] == REF, 0]
    sl = live & np.isin(g[:, GEN_BUS], ref_bus)
    slack_out = float(np.maximum(g[sl, PG] - g[sl, PMAX], 0).sum() + np.maximum(g[sl, PMIN] - g[sl, PG], 0).sum())
    cost = float(totcost(p["gencost"][live], g[live, PG]).sum())
    losses = float(g[live, PG].sum() - r["bus"][:, 2].sum())
    return {"losses": losses, "s": smax(r),"n_over": int((load > 1.0 + 1e-6).sum()), "max_load": float(load.max()), "vviol": vviol,
            "qviol": qviol, "slack_out_mw": slack_out, "cost": cost}


def lmp_stats(dc, ac):
    a, d = ac["bus"][:, LAM_P], dc["bus"][:, LAM_P]
    r = float(np.corrcoef(a, d)[0, 1]) if a.std() > 1e-9 and d.std() > 1e-9 else float("nan")
    return {"lmp_r": r, "lmp_mae_rel": float(np.abs(a - d).mean() / np.abs(a).mean()),
            "ac_spread": float(a.max() - a.min()), "dc_spread": float(d.max() - d.min())}


def run_case(name, kind, base):
    out = {"case": name, "kind": kind}
    ppc = load_m(case_path(name, kind))
    t0 = time.time()
    ac = runopf(ppc, ACOPT)
    out["ac_ok"], out["ac"] = bool(ac["success"]), float(ac["f"])
    out["pub_dc"], out["pub_ac"] = base.get((name, kind), (float("nan"), float("nan")))
    if not ac["success"]:
        return out
    ac_bind = binding(ac)
    out["n_bind_ac"] = len(ac_bind)
    for tag, model in (("mp", ppc), ("pm", pm_convention(ppc))):
        dc = rundcopf(model, DCOPT)
        d = {"ok": bool(dc["success"]), "cost": float(dc["f"])}
        if dc["success"]:
            dc_bind = binding(dc)
            d["n_bind"] = len(dc_bind)
            d["recall"] = len(dc_bind & ac_bind) / len(ac_bind) if ac_bind else float("nan")
            d["precision"] = len(dc_bind & ac_bind) / len(dc_bind) if dc_bind else float("nan")
            d.update(lmp_stats(dc, ac))
            d["check"] = ac_check(ppc, dc, ac)
        out[tag] = d
    der = []
    for a in ALPHAS:
        dc = rundcopf(derate(ppc, a), DCOPT)
        if not dc["success"]:
            der.append({"alpha": a, "ok": False})
            continue
        chk = ac_check(ppc, dc, ac)
        der.append({"alpha": a, "ok": True, "dc_cost": float(dc["f"]), "check": chk})
    out["derate"] = der
    out["corrected"] = corrected_dc(ppc, ac)
    out["secs"] = time.time() - t0
    return out


def corrected_dc(ppc, ac, iters=12):
    """Iterated AC-corrected DC (DC-MP): after each DC solve run its dispatch through an AC power flow,
    (i) add the measured losses to the DC loads in proportion to each bus's demand and
    (ii) shrink the DC rating of each branch the AC flow overloads by rating / AC flow (only those branches).
    Stops when the AC check shows no overload and the slack is within its P limits, or after iters."""
    from pypower.idx_bus import PD
    work = copy.deepcopy(ppc)
    pd0 = ppc["bus"][:, PD].copy()
    rate0 = ppc["branch"][:, RATE_A].copy()
    hist = []
    for it in range(iters):
        dc = rundcopf(work, DCOPT)
        if not dc["success"]:
            hist.append({"it": it, "dc_ok": False})
            break
        chk = ac_check(ppc, dc, ac)
        if chk is None:
            hist.append({"it": it, "dc_ok": True, "pf_ok": False})
            break
        hist.append({"it": it, "dc_ok": True, "pf_ok": True, **chk})
        if chk["n_over"] == 0 and chk["slack_out_mw"] < 1e-3:
            break
        loss = chk["losses"]
        work["bus"][:, PD] = pd0 * (1.0 + loss / pd0.sum())
        ratio = np.ones_like(rate0)
        on = rate0 > 0
        ratio[on] = np.minimum(1.0, rate0[on] / np.maximum(chk["s"][on], 1e-9))
        work["branch"][:, RATE_A] *= np.where(ratio < 1.0, 0.995 * ratio, 1.0)
    return hist


def pct(x, y):
    return 100.0 * (x / y - 1.0)


def main():
    base = baseline()
    rows = [run_case(c, k, base) for c in CASES for k in KINDS]
    here = Path(__file__).resolve().parent
    strip = lambda o: {k: strip(v) for k, v in o.items() if k != "s"} if isinstance(o, dict) else [strip(v) for v in o] if isinstance(o, list) else o
    (here / "results_pglib.json").write_text(json.dumps(strip(rows), indent=1, default=float))
    L = []
    P = L.append
    P("PGLib-OPF v23.07: DC vs AC OPF with the published ratings. Costs $/h. Gaps are % of the AC optimum.")
    P("")
    P("Validation against PGLib BASELINE.md (PowerModels.jl v0.19.9 + IPOPT):")
    P(f"{'case':22s} {'kind':4s} {'AC (ours)':>12s} {'AC (pub)':>12s} {'dAC%':>7s} {'DC-PM':>12s} {'DC (pub)':>12s} {'dDC%':>7s} {'DC-MP':>12s}")
    for r in rows:
        if not r["ac_ok"]:
            P(f"{r['case']:22s} {r['kind']:4s} AC OPF did not converge (published AC {r['pub_ac']:.4e})")
            continue
        P(f"{r['case']:22s} {r['kind']:4s} {r['ac']:12.1f} {r['pub_ac']:12.1f} {pct(r['ac'], r['pub_ac']):7.3f} "
          f"{r['pm']['cost']:12.1f} {r['pub_dc']:12.1f} {pct(r['pm']['cost'], r['pub_dc']):7.3f} {r['mp']['cost']:12.1f}")
    for tag, label in (("mp", "DC-MP (MATPOWER B: 1/(x tap))"), ("pm", "DC-PM (PowerModels: x/(r^2+x^2), no taps)")):
        P("")
        P(f"{label}: DC dispatch run through AC power flow")
        P(f"{'case':22s} {'kind':4s} {'nbAC':>4s} {'nbDC':>4s} {'recall':>6s} {'prec':>5s} {'DCgap%':>7s} {'ACcost%':>8s} "
          f"{'nOver':>5s} {'maxLd%':>7s} {'Vviol':>5s} {'Qviol':>5s} {'slackMW':>8s} {'LMPr':>6s} {'LMPmae%':>8s}")
        for r in rows:
            if not r["ac_ok"] or not r[tag]["ok"]:
                continue
            d, c = r[tag], r[tag]["check"]
            head = (f"{r['case']:22s} {r['kind']:4s} {r['n_bind_ac']:4d} {d['n_bind']:4d} {d['recall']:6.2f} {d['precision']:5.2f} "
                    f"{pct(d['cost'], r['ac']):7.2f}")
            if c is None:
                P(head + "  AC power flow did not converge")
                continue
            P(head + f" {pct(c['cost'], r['ac']):8.2f} {c['n_over']:5d} {100 * c['max_load']:7.1f} {c['vviol']:5d} {c['qviol']:5d} "
              f"{c['slack_out_mw']:8.1f} {d['lmp_r']:6.3f} {100 * d['lmp_mae_rel']:8.2f}")
    P("")
    P("Derating (DC-MP, every rating x a): AC overloads, worst loading %, AC cost % above AC optimum")
    P(f"{'case':22s} {'kind':4s} " + " ".join(f"{'a=' + str(a):>20s}" for a in ALPHAS) + "  first a with no overload")
    for r in rows:
        if not r["ac_ok"]:
            continue
        cells, first = [], None
        for d in r["derate"]:
            if not d["ok"]:
                cells.append(f"{'DC infeasible':>20s}")
                continue
            c = d["check"]
            if c is None:
                cells.append(f"{'PF failed':>20s}")
                continue
            cells.append(f"{c['n_over']:3d} {100 * c['max_load']:6.1f} {pct(c['cost'], r['ac']):+7.2f}%")
            if first is None and c["n_over"] == 0:
                first = (d["alpha"], pct(c["cost"], r["ac"]))
        tail = f"a={first[0]} (+{first[1]:.2f} %)" if first else "none in grid"
        P(f"{r['case']:22s} {r['kind']:4s} " + " ".join(f"{s:>20s}" for s in cells) + "  " + tail)
    P("")
    P("Iterated AC-corrected DC (DC-MP + loss feedback + per-branch rating correction), last iterate:")
    P(f"{'case':22s} {'kind':4s} {'iters':>5s} {'status':>14s} {'nOver':>5s} {'maxLd%':>7s} {'slackMW':>8s} {'Vviol':>5s} {'Qviol':>5s} {'ACcost%':>8s}")
    for r in rows:
        if not r["ac_ok"]:
            continue
        h = r["corrected"]
        good = [x for x in h if x.get("pf_ok")]
        last = h[-1]
        if last.get("pf_ok") and last["n_over"] == 0 and last["slack_out_mw"] < 1e-3:
            status = "clean"
        elif not last.get("dc_ok", True):
            status = "DC infeasible"
        elif last.get("dc_ok") and not last.get("pf_ok"):
            status = "PF failed"
        else:
            status = "not clean"
        if not good:
            P(f"{r['case']:22s} {r['kind']:4s} {len(h):5d} {status:>14s}")
            continue
        c = good[-1]
        P(f"{r['case']:22s} {r['kind']:4s} {len(h):5d} {status:>14s} {c['n_over']:5d} {100 * c['max_load']:7.1f} {c['slack_out_mw']:8.1f} "
          f"{c['vviol']:5d} {c['qviol']:5d} {pct(c['cost'], r['ac']):8.2f}")
    text = "\n".join(L) + "\n"
    (here / "results_pglib.txt").write_text(text)
    print(text)


if __name__ == "__main__":
    main()
