"""Milestone 5 of research/grid-linopf: load-perturbed copies of the 36 PGLib cases, for intervals.

Plan and predictions in LOG.md (2026-11-13, "Load-perturbed copies", committed before this ran).
For each PGLib-OPF v23.07 TYP, API and SAD case and seed s in 0..9, every bus's PD and QD are scaled
by one factor drawn U[0.9, 1.1] per bus (perturb()). Per copy, frozen arms:
  AC     PIPS AC OPF, the cost reference (a copy without one is excluded and counted);
  S      plain DC dispatch at the case file's setpoints (run_vlin's start);
  S+R    milestone 3's reactive stage on S's dispatch;
  J      J-m-a with Clarabel (vlin.slp, margin=vlin.MARGIN, analytic, solver="clarabel");
  J+R    the reactive stage on J's best point when J is not fully clean.
Writes results_perturb.json (one row per copy) and results_perturb.txt (summary(), also runnable
alone with --summary). Usage: run_perturb.py [--seeds N] [--summary | --noref] [case ...];
OMP_NUM_THREADS=1 recommended (4 worker processes).
"""
import copy
import json
import sys
import time
import warnings
from multiprocessing import Pool
from pathlib import Path

warnings.filterwarnings("ignore")
import numpy as np
from pypower.api import rundcopf, runopf
from pypower.idx_brch import ANGMAX, ANGMIN
from pypower.idx_bus import PD
from pypower.idx_gen import PG

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE))
from infra_dcopf import vlin  # noqa: E402
from infra_dcopf.pglib import case_path, load_m, perturb  # noqa: E402
from infra_dcopf.vsched import file_schedule, reactive_stage  # noqa: E402
from run_pglib import ACOPT, CASES, DCOPT  # noqa: E402

KINDS = ["typ", "api", "sad"]
LO, HI = 0.9, 1.1
NOMINAL = HERE / "results_vlin_margin_analytic_clarabel.json"


def strip(c):
    return None if c is None else {k: v for k, v in c.items() if k not in ("pg", "vg")}


def fully(c):
    """Fully clean check result; also reads run_vlin's {"ok", "final"} form of a reactive-stage result."""
    if c and "ok" in c and "clean" not in c:
        c = c["final"] if c["ok"] else None
    return bool(c and c["clean"])


def run_copy(job, noref=False):
    """One copy. With noref (the after-the-run diagnostic, --noref) the AC OPF is skipped and the arms
    run on a copy PIPS found no AC optimum for: a fully clean point proves the copy feasible."""
    name, kind, seed = job
    base = load_m(case_path(name, kind))
    ppc, _f = perturb(base, name, kind, seed, LO, HI)
    t0 = time.time()
    out = {"case": name, "kind": kind, "seed": seed, "load_scale": float(ppc["bus"][:, PD].sum() / base["bus"][:, PD].sum())}
    if not noref:
        ac = runopf(ppc, ACOPT)
        out["ac_ok"] = bool(ac["success"])
        if not ac["success"]:
            out["secs"] = time.time() - t0
            return out
        out["ac"] = float(ac["f"])
    dc = rundcopf(ppc, DCOPT)
    out["start_rule"] = "DC+ang"
    if not dc["success"]:
        free = copy.deepcopy(ppc)
        free["branch"][:, ANGMIN], free["branch"][:, ANGMAX] = -360.0, 360.0
        dc = rundcopf(free, DCOPT)
        out["start_rule"] = "DC, no ang"
        if not dc["success"]:
            out["start_rule"] = None
            out["secs"] = time.time() - t0
            return out
    start, vf = dc["gen"][:, PG].copy(), file_schedule(ppc)
    out["S"] = strip(vlin.check(ppc, start, vf))
    rs = reactive_stage(ppc, start)
    out["SR"] = None if rs is None else strip(vlin.check(ppc, rs[0], rs[1]))
    t1 = time.time()
    hist = vlin.slp(ppc, start, vf, margin=vlin.MARGIN, analytic=True, solver="clarabel")
    out["J_secs"] = time.time() - t1
    b = vlin.best_of(hist, ppc["baseMVA"])
    out["J"] = {"rounds": len(hist), "clean_at": next((x["it"] for x in hist if x.get("clean")), None),
                "final": strip(b)}
    if b is not None and not b["clean"]:
        rs = reactive_stage(ppc, b["pg"])
        out["JR"] = None if rs is None else strip(vlin.check(ppc, rs[0], rs[1]))
    out["secs"] = time.time() - t0
    return out


def run_noref(job):
    return run_copy(job, noref=True)


def noref_main():
    """After-the-run diagnostic (declared in LOG.md after the main run): the copies without a PIPS AC
    optimum, run through S, S+R, J and J+R anyway. Writes results_perturb_noref.json and .txt."""
    rows = json.loads((HERE / "results_perturb.json").read_text())
    jobs = [(r["case"], r["kind"], r["seed"]) for r in rows if not r["ac_ok"]]
    jobs.sort(key=lambda j: -CASES.index(j[0]))
    out = []
    with Pool(4) as pool:
        for r in pool.imap_unordered(run_noref, jobs):
            print(r["case"], r["kind"], r["seed"], f"{r['secs']:.0f}s", flush=True)
            out.append(r)
    out.sort(key=lambda r: (KINDS.index(r["kind"]), CASES.index(r["case"]), r["seed"]))
    L = []
    P = L.append
    P("Diagnostic after the main run (not pre-registered): copies with no PIPS AC optimum, arms run anyway.")
    P("A fully clean point from any arm is an AC-feasible operating point, so PIPS's failure there was not")
    P("infeasibility. No cost reference exists, so no cost is reported.")
    P(f"{'case':18s} {'kind':4s} {'seed':>4s} {'load':>6s} {'start':>10s} {'S+R':>5s} {'J':>6s} {'J+R':>5s}")
    feas = 0
    per = {}
    for r in out:
        ok = {a: arm_ok(r, a) for a in ("SR", "J", "JR")} if "J" in r else {"SR": False, "J": False, "JR": False}
        any_ok = any(ok.values())
        feas += any_ok
        key = (r["case"], r["kind"])
        n, f = per.get(key, (0, 0))
        per[key] = (n + 1, f + any_ok)
        jc = r["J"]["clean_at"] if "J" in r else None
        P(f"{r['case']:18s} {r['kind']:4s} {r['seed']:4d} {r['load_scale']:6.3f} {str(r.get('start_rule')):>10s} "
          f"{str(ok['SR']):>5s} {('@' + str(jc)) if jc else 'no':>6s} {str(ok['JR']):>5s}")
    P("")
    P(f"Copies without a PIPS AC optimum: {len(out)}; shown AC-feasible by some arm: {feas}; no DC start: "
      f"{sum(1 for r in out if 'J' not in r)}.")
    for kind in KINDS:
        sel = [r for r in out if r["kind"] == kind]
        if sel:
            f = sum(1 for r in sel if "J" in r and any(arm_ok(r, a) for a in ("SR", "J", "JR")))
            P(f"  {kind.upper()}: {len(sel)} copies, {f} shown feasible")
    P("Per base case (copies without a reference: shown feasible / total): "
      + ", ".join(f"{k[0]}/{k[1]} {v[1]}/{v[0]}" for k, v in per.items()))
    text = "\n".join(L) + "\n"
    (HERE / "results_perturb_noref.json").write_text(json.dumps(vlin_jsonable(out), indent=1))
    (HERE / "results_perturb_noref.txt").write_text(text)
    print(text)


# ---- statistics -------------------------------------------------------------------------------

def wilson(k, n, z=1.959964):
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (c - h, c + h)


def cluster_boot(groups, reps=2000, seed=0):
    """95 % percentile interval of the pooled rate, resampling base cases (groups: list of 0/1 arrays)."""
    rng = np.random.default_rng(seed)
    k = np.array([g.sum() for g in groups], float)
    n = np.array([len(g) for g in groups], float)
    idx = rng.integers(0, len(groups), (reps, len(groups)))
    r = k[idx].sum(1) / n[idx].sum(1)
    return (float(np.quantile(r, 0.025)), float(np.quantile(r, 0.975)))


def sign_test(wins, losses):
    """Exact two-sided sign test P."""
    from math import comb
    n = wins + losses
    if n == 0:
        return 1.0
    k = min(wins, losses)
    p = sum(comb(n, i) for i in range(k + 1)) / 2 ** n
    return min(1.0, 2 * p)


def arm_ok(r, arm):
    if arm == "S":
        return fully(r.get("S"))
    if arm == "SR":
        return fully(r.get("S")) or fully(r.get("SR"))
    if arm == "J":
        return bool(r.get("J") and r["J"]["clean_at"])
    if arm == "JR":
        return arm_ok(r, "J") or fully(r.get("JR"))
    raise KeyError(arm)


ARMS = [("S", "S (DC at file setpoints)"), ("SR", "S or S+R"), ("J", "J (J-m-a, Clarabel)"), ("JR", "J or J+R")]


def summary(rows):
    L = []
    P = L.append
    nom = {(r["case"], r["kind"]): r for r in json.loads(NOMINAL.read_text())} if NOMINAL.exists() else {}
    seeds = sorted({r["seed"] for r in rows})
    P(f"Milestone 5: load-perturbed copies of PGLib-OPF v23.07 TYP, API, SAD; seeds {seeds[0]}..{seeds[-1]}, "
      f"per-bus PD and QD x U[{LO}, {HI}].")
    P("Arms frozen as committed: S = DC dispatch at the file's setpoints; S+R = reactive stage on S; J = J-m-a "
      "(margins, analytic sensitivities, Clarabel, 10 rounds); J+R = reactive stage on J's best point.")
    P("'Fully clean' = vlin.check: no branch over rating, slack inside limits, angle, bus-voltage and unit-Q limits met.")
    P("")
    noref = [r for r in rows if not r["ac_ok"]]
    nostart = [r for r in rows if r["ac_ok"] and "J" not in r]
    use = [r for r in rows if "J" in r]
    P(f"Copies: {len(rows)}; no AC optimum (PIPS) {len(noref)}"
      + (" (" + ", ".join(sorted({f"{r['case']}/{r['kind']}" for r in noref})) + ")" if noref else "")
      + f"; no DC start {len(nostart)}; scored {len(use)}.")
    for kind in KINDS:
        a = [r["load_scale"] for r in rows if r["kind"] == kind and r["ac_ok"]]
        b = [r["load_scale"] for r in rows if r["kind"] == kind and not r["ac_ok"]]
        if b:
            P(f"  {kind.upper()}: {len(b)} of {len(a) + len(b)} copies without an AC optimum; total-load scale median "
              f"{np.median(b):.4f} (with one: {np.median(a):.4f}); {sum(x < 1 for x in b)} of them carry less total load than nominal.")
    ls = [r["load_scale"] for r in rows]
    P(f"Total-load scale over copies: min {min(ls):.4f}, median {np.median(ls):.4f}, max {max(ls):.4f}.")
    keys = sorted({(r["case"], r["kind"]) for r in use}, key=lambda k: (KINDS.index(k[1]), CASES.index(k[0])))
    keys = [k for k in keys if k in nom and "J" in nom[k]] if nom else keys
    by = {k: [r for r in use if (r["case"], r["kind"]) == k] for k in keys}
    P(f"Base cases with a nominal J-m-a result and at least one scored copy: {len(keys)}.")
    P("")
    P("Pooled fully-clean rate (Wilson 95 % treats copies as independent; cluster bootstrap resamples base cases):")
    res = {}
    for kind in KINDS + ["all"]:
        ks = [k for k in keys if kind == "all" or k[1] == kind]
        if not ks:
            continue
        P(f"  {kind.upper()} ({len(ks)} cases, {sum(len(by[k]) for k in ks)} copies):")
        for arm, lab in ARMS:
            groups = [np.array([arm_ok(r, arm) for r in by[k]], int) for k in ks]
            kk, nn = int(sum(g.sum() for g in groups)), int(sum(len(g) for g in groups))
            w = wilson(kk, nn)
            b = cluster_boot(groups)
            nomc = sum(arm_ok(nom[k], arm) if arm in ("J", "JR") else False for k in ks) if nom and arm in ("J", "JR") else None
            res[(kind, arm)] = (kk, nn, b)
            ns = f"; nominal {nomc}/{len(ks)} = {nomc / len(ks):.2f}" if nomc is not None else ""
            P(f"    {lab:26s} {kk:4d}/{nn:<4d} = {kk / nn:.3f}  Wilson [{w[0]:.3f}, {w[1]:.3f}]  "
              f"cluster [{b[0]:.3f}, {b[1]:.3f}]{ns}")
    P("")
    P("Per base case: share of copies fully clean per arm; nominal J verdict (round it finished) and agreement")
    P("of the nominal verdict with the majority across copies (a tie counts as disagreement).")
    P(f"{'case':18s} {'kind':4s} {'n':>3s} {'S':>5s} {'S+R':>5s} {'J':>5s} {'J+R':>5s} {'nomJ':>6s} {'nomJ+R':>6s} {'agree':>5s} {'J rounds (clean copies)':s}")
    agree = 0
    win_jr = loss_jr = win_j = loss_j = 0
    flips = []
    for k in keys:
        rs = by[k]
        n = len(rs)
        rate = {a: np.mean([arm_ok(r, a) for r in rs]) for a, _ in ARMS}
        nj = nom[k]["J"]["clean_at"] if nom else None
        njr = arm_ok(nom[k], "JR") if nom else None
        maj = 1 if rate["J"] > 0.5 else 0 if rate["J"] < 0.5 else None
        ag = maj is not None and maj == int(bool(nj))
        agree += ag
        if not ag:
            flips.append((k, nj, rate["J"]))
        win_jr += rate["JR"] > rate["SR"]
        loss_jr += rate["JR"] < rate["SR"]
        win_j += rate["J"] > rate["SR"]
        loss_j += rate["J"] < rate["SR"]
        rounds = sorted(r["J"]["clean_at"] for r in rs if r["J"]["clean_at"])
        P(f"{k[0]:18s} {k[1]:4s} {n:3d} {rate['S']:5.2f} {rate['SR']:5.2f} {rate['J']:5.2f} {rate['JR']:5.2f} "
          f"{('@' + str(nj)) if nj else 'no':>6s} {str(njr):>6s} {str(ag):>5s} {rounds}")
    P("")
    P(f"Nominal J verdict agrees with the copies' majority on {agree} of {len(keys)} base cases.")
    if flips:
        P("  Disagreements: " + "; ".join(f"{k[0]}/{k[1]} nominal {'@' + str(nj) if nj else 'no'}, copies {r:.2f}"
                                          for k, nj, r in flips))
    P(f"Sign test over base cases, per-case rates: J+R vs S+R {win_jr} wins, {loss_jr} losses, P = {sign_test(win_jr, loss_jr):.2g}; "
      f"J vs S+R {win_j} wins, {loss_j} losses, P = {sign_test(win_j, loss_j):.2g}.")
    P("")
    P("AC cost of J's fully clean points over the copy's AC optimum:")
    for kind in KINDS:
        prem = [100 * (r["J"]["final"]["cost"] / r["ac"] - 1) for k in keys if k[1] == kind for r in by[k] if r["J"]["clean_at"]]
        if prem:
            P(f"  {kind.upper()}: {len(prem)} points, mean {np.mean(prem):+.3f} %, median {np.median(prem):+.3f} %, "
              f"range {min(prem):+.3f} to {max(prem):+.3f} %")
    P("")
    # Do nominal late finishers flip more often? Descriptive only.
    late = [k for k in keys if nom and nom[k]["J"]["clean_at"] and nom[k]["J"]["clean_at"] >= 8]
    early = [k for k in keys if nom and nom[k]["J"]["clean_at"] and nom[k]["J"]["clean_at"] < 8]
    for lab, ks in (("nominal clean at round >= 8", late), ("nominal clean at round < 8", early)):
        if ks:
            r = np.mean([np.mean([arm_ok(x, "J") for x in by[k]]) for k in ks])
            P(f"  {lab} ({len(ks)} cases): mean share of copies J fully clean {r:.2f}")
    tot = sum(r["secs"] for r in rows)
    P(f"Run time: {tot:.0f} s summed over copies (J alone {sum(r.get('J_secs', 0) for r in rows):.0f} s).")
    return "\n".join(L) + "\n", res, agree, len(keys), (win_jr, loss_jr)


def main():
    only = [a for a in sys.argv[1:] if not a.startswith("--") and not a.isdigit()]
    nseeds = int(sys.argv[sys.argv.index("--seeds") + 1]) if "--seeds" in sys.argv else 10
    jpath = HERE / "results_perturb.json"
    if "--noref" in sys.argv:
        return noref_main()
    if "--summary" in sys.argv:
        rows = json.loads(jpath.read_text())
    else:
        jobs = [(c, k, s) for s in range(nseeds) for k in KINDS for c in CASES if not only or c in only]
        # Longest cases first so the pool's tail is short.
        jobs.sort(key=lambda j: -CASES.index(j[0]))
        rows = []
        done = 0
        with Pool(4) as pool:
            for r in pool.imap_unordered(run_copy, jobs):
                done += 1
                print(f"[{done}/{len(jobs)}] {r['case']} {r['kind']} s{r['seed']} {r['secs']:.0f}s "
                      f"J={'@' + str(r['J']['clean_at']) if r.get('J') and r['J']['clean_at'] else '-'}", flush=True)
                rows.append(r)
        rows.sort(key=lambda r: (r["seed"], KINDS.index(r["kind"]), CASES.index(r["case"])))
        if not only and nseeds == 10:
            jpath.write_text(json.dumps(vlin_jsonable(rows), indent=1))
    text = summary(rows)[0]
    if not only and nseeds == 10:
        (HERE / "results_perturb.txt").write_text(text)
    print(text)


def vlin_jsonable(o):
    if isinstance(o, dict):
        return {k: vlin_jsonable(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [vlin_jsonable(v) for v in o]
    if isinstance(o, np.ndarray):
        return o.tolist()
    if isinstance(o, (np.floating, np.integer, np.bool_)):
        return o.item()
    return o


if __name__ == "__main__":
    main()
