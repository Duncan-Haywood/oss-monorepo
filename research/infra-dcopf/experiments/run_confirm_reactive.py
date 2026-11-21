"""Confirmation split, the IPOPT reactive stage (J+R) on every case that reaches the repair and does not finish
(research/grid-linopf).

Plan, gate G0 and predictions G1 to G5 in LOG.md (2026-11-21, "Confirmation split: the IPOPT reactive stage (J+R) on
all 22 unfinished cases", committed before this ran). Cases: arm F of run_confirm.py (the protocol's PIPS start) and
the second-solver arm of run_confirm_rescue.py, wherever the frozen run reached the repair and was not fully clean.

Step 1 (best): the frozen run is rerun with run_confirm._job unchanged (the rescue arm with
run_dc_rescue.rescue_start, as run_confirm_rescue.job does), because the parts do not store the best point; the
best point is captured from vlin.best_of and compared with the stored one (gate G0).
Step 2 (R): run_heldout_slack.phase_r's rule, on IPOPT: run_heldout.reactive (vsched.reactive_stage, P pinned,
voltages and Q free) at the best point on the case's largest-PMAX-slack network, in a child process with a 45-minute
wall limit (over the limit counts as not clean).

Usage: OMP_NUM_THREADS=1 run_confirm_reactive.py run [N] | one ARM CASE KIND | r ARM CASE KIND | --summary
Writes results_confirm_reactive_parts/<arm>_<case>_<kind>_best.json and _R.json, then results_confirm_reactive.json
and .txt. ARM is F (protocol start) or X (second-solver start).
"""
import json
import subprocess
import sys
import time
import warnings
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE))

import run_confirm as rc  # noqa: E402

PARTS = HERE / "results_confirm_reactive_parts"
OUT = HERE / "results_confirm_reactive"
SRC = {"F": HERE / "results_confirm_parts", "X": HERE / "results_confirm_rescue_parts"}
WALL = 45 * 60
HEAVY = (4, 1.10)  # G3: 4 or more overloads, or worst loading above 110 %
Q_ONLY = 0.1  # G2: no overload, no voltage out, Q outside limits by under 0.1 MVAr in total


def stored(arm):
    return {(r["case"], r["kind"]): r for r in (json.loads(f.read_text()) for f in sorted(SRC[arm].glob("F_*.json")))}


def unfinished():
    out = []
    for arm in ("F", "X"):
        for k, r in stored(arm).items():
            if "status" in r and not r.get("clean_at"):
                out.append((arm, k[0], k[1], r["secs"]))
    return out


def part(arm, name, kind, step):
    return PARTS / f"{arm}_{name}_{kind}_{step}.json"


def one(arm, name, kind):
    """Step 1: rerun the frozen arm and keep the best point."""
    import numpy as np
    from infra_dcopf import vlin
    from run_heldout_slack import jsonable
    got = {}
    orig = vlin.best_of

    def capture(hist, base):
        b = orig(hist, base)
        got["best"] = b
        return b

    vlin.best_of = capture
    if arm == "X":
        import run_dc_rescue
        import run_homotopy
        run_homotopy.dc_start = run_dc_rescue.rescue_start
    t0 = time.time()
    out = rc._job("F", name, kind)
    old = stored(arm)[(name, kind)]["final"]
    new = out.get("final") or {}
    b = got.get("best")
    out["best_pg"] = None if b is None else np.asarray(b["pg"]).tolist()
    out["best_vg"] = None if b is None or b.get("vg") is None else np.asarray(b["vg"]).tolist()
    out["reproduced"] = bool(new) and all(new.get(f) == old.get(f) for f in ("it", "n_over", "vviol", "qviol")) \
        and abs(new["cost"] - old["cost"]) <= 1e-6 * abs(old["cost"])
    out["rerun_secs"] = time.time() - t0
    part(arm, name, kind, "best").write_text(json.dumps(jsonable(out), default=float))
    return out


def r_step(arm, name, kind):
    """Step 2: the IPOPT reactive stage at the best point."""
    import numpy as np
    from infra_dcopf import ipopt_nlp
    from infra_dcopf.pglib import case_path, fix_ref, load_m
    from diag_slack_move import big_slack
    from run_heldout import reactive
    from run_heldout_slack import jsonable
    t0 = time.time()
    b = json.loads(part(arm, name, kind, "best").read_text())
    ppc, _ = fix_ref(load_m(case_path(name, kind)))
    p, _, _ = big_slack(ppc)
    with ipopt_nlp.use_ipopt():
        jr = reactive(p, {"pg": np.array(b["best_pg"]), "clean": False})
    out = {"case": name, "kind": kind, "arm": arm, "JR": jr, "secs": time.time() - t0}
    part(arm, name, kind, "R").write_text(json.dumps(jsonable(out), default=float))
    return out


def drive(job):
    arm, name, kind, _ = job
    py = sys.executable
    log = []
    if not part(arm, name, kind, "best").exists():
        p = subprocess.run([py, __file__, "one", arm, name, kind], capture_output=True, text=True)
        log.append(f"best rc={p.returncode} {p.stderr[-400:] if p.returncode else ''}")
    if part(arm, name, kind, "best").exists() and not part(arm, name, kind, "R").exists():
        t0 = time.time()
        try:
            p = subprocess.run([py, __file__, "r", arm, name, kind], capture_output=True, text=True, timeout=WALL)
            log.append(f"R rc={p.returncode} {p.stderr[-400:] if p.returncode else ''}")
        except subprocess.TimeoutExpired:
            part(arm, name, kind, "R").write_text(json.dumps(
                {"case": name, "kind": kind, "arm": arm, "JR": None, "timeout": True, "secs": time.time() - t0}))
            log.append("R timeout")
    print(arm, name, kind, " | ".join(log), flush=True)


def pct(c, ref):
    return 100 * (c - ref) / ref


def summary():
    jobs = unfinished()
    S = {"F": stored("F"), "X": stored("X")}
    L = []
    P = L.append
    P("Confirmation split: the IPOPT reactive stage (J+R) on the cases that reach the repair and do not finish")
    P("Plan, gate G0 and predictions G1 to G5: LOG.md 2026-11-21 (committed before this ran).")
    P("Arms: F = protocol start (PIPS DC OPF), X = second-solver start (run_dc_rescue.rescue_start).")
    P("J best = the frozen run's best point (rerun, compared with the stored one). J+R = vsched.reactive_stage on")
    P("IPOPT at that point, P pinned, 45-minute wall limit. Columns: overloads, worst loading %, buses out of V band,")
    P("units outside Q limits (total MVAr). Cost against PGLib-OPF v23.07's published AC objective.")
    P("")
    P(f"{'arm':3s} {'case':16s} {'kind':4s} {'G0':>3s}  {'J best: nOv  maxLd%   V    Q (MVAr)':34s}  "
      f"{'J+R: nOv  maxLd%   V    Q (MVAr)':34s} {'cost %':>8s} {'R s':>6s}")
    rows = []
    for arm, name, kind, _ in sorted(jobs, key=lambda j: (j[0], j[1], j[2])):
        f0 = S[arm][(name, kind)]["final"]
        bp, rp = part(arm, name, kind, "best"), part(arm, name, kind, "R")
        b = json.loads(bp.read_text()) if bp.exists() else None
        r = json.loads(rp.read_text()) if rp.exists() else None
        g0 = "-" if b is None else ("ok" if b["reproduced"] else "NO")
        fs = f"{f0['n_over']:3d} {100 * f0['max_load']:7.2f} {f0['vviol']:4d} {f0['qviol']:4d} ({f0['q_exc_mvar']:.3f})"
        jr = None if r is None else r["JR"]
        if r is None:
            rs, c = "PENDING", "-"
        elif r.get("timeout"):
            rs, c = "over the 45-minute wall limit", "-"
        elif jr is None:
            rs, c = "no solution", "-"
        else:
            rs = (f"{jr['n_over']:3d} {100 * jr['max_load']:7.2f} {jr['vviol']:4d} {jr['qviol']:4d} "
                  f"({jr['q_exc_mvar']:.3f})" + ("  clean" if jr["clean"] else ""))
            c = f"{pct(jr['cost'], S[arm][(name, kind)]['ac']):+.3f}" if jr["clean"] else "-"
        P(f"{arm:3s} {name:16s} {kind:4s} {g0:>3s}  {fs:34s}  {rs:34s} {c:>8s} {(r or {}).get('secs', 0):6.0f}")
        rows.append({"arm": arm, "case": name, "kind": kind, "ac": S[arm][(name, kind)]["ac"], "best": f0,
                     "reproduced": None if b is None else b["reproduced"], "JR": jr,
                     "timeout": bool(r and r.get("timeout")), "done": r is not None,
                     "clean": bool(jr and jr.get("clean"))})
    ok = [x for x in rows if x["reproduced"] and x["done"]]
    P("")
    P(f"{len(rows)} cases; best point rerun on {sum(1 for x in rows if x['reproduced'] is not None)}, "
      f"reproduced on {sum(1 for x in rows if x['reproduced'])}; J+R run on {sum(1 for x in rows if x['done'])}; "
      f"J+R fully clean on {sum(1 for x in ok if x['clean'])} of the {len(ok)} scored.")
    q_only = [x for x in ok if x["best"]["n_over"] == 0 and x["best"]["vviol"] == 0
              and 0 < x["best"]["q_exc_mvar"] < Q_ONLY]
    heavy = [x for x in ok if x["best"]["n_over"] >= HEAVY[0] or x["best"]["max_load"] > HEAVY[1]]
    k23 = [x for x in ok if x["case"] == "case2383wp_k"]
    fin_F = sum(1 for r in S["F"].values() if r.get("clean_at"))
    fin_X = sum(1 for r in S["X"].values() if r.get("clean_at"))
    reach_F = sum(1 for r in S["F"].values() if "status" in r)
    reach_X = sum(1 for r in S["X"].values() if "status" in r)
    gF = sum(1 for x in ok if x["arm"] == "F" and x["clean"])
    gX = sum(1 for x in ok if x["arm"] == "X" and x["clean"])
    P(f"Protocol start: J {fin_F} of {reach_F} that reach the repair; J or J+R {fin_F + gF} of {reach_F} (of 33 cases).")
    P(f"Second-solver start, the 10 no-start cases: J {fin_X} of {reach_X}; J or J+R {fin_X + gX} of {reach_X}.")
    P(f"Both together: J {fin_F + fin_X} of 33, J or J+R {fin_F + fin_X + gF + gX} of 33 "
      f"({reach_F + reach_X} reach the repair).")
    P("")
    nr = [x for x in rows if x["reproduced"] is False]
    P(f"G0 (best point reproduced on every case): {'held' if not nr else 'refuted'}"
      + (f" (not reproduced: {', '.join(x['arm'] + ' ' + x['case'] + ' ' + x['kind'] for x in nr)})" if nr else ""))
    P(f"G1 (J+R clean on both case2383wp_k): "
      f"{'held' if len(k23) == 2 and all(x['clean'] for x in k23) else 'refuted' if k23 else 'untestable'} "
      f"({sum(x['clean'] for x in k23)} of {len(k23)})")
    P(f"G2 (J+R clean on at least 7 of the 10 Q-only cases): "
      f"{'held' if sum(x['clean'] for x in q_only) >= 7 else 'refuted'} ({sum(x['clean'] for x in q_only)} of {len(q_only)})")
    P(f"G3 (J+R clean on none of the heavy-overload cases): "
      f"{'held' if not any(x['clean'] for x in heavy) else 'refuted'} ({sum(x['clean'] for x in heavy)} of {len(heavy)})")
    P(f"G4 (protocol start, J or J+R at least 14 of {reach_F}): {'held' if fin_F + gF >= 14 else 'refuted'} ({fin_F + gF})")
    over = [pct(x["JR"]["cost"], x["ac"]) for x in ok if x["clean"]]
    P(f"G5 (every J+R clean point within +7 %): "
      f"{'untestable' if not over else 'held' if max(over) <= 7 else 'refuted'}"
      + (f" (range {min(over):+.3f} to {max(over):+.3f} %)" if over else ""))
    res = {"rows": rows, "fin_F": fin_F, "fin_X": fin_X, "gain_F": gF, "gain_X": gX, "reach_F": reach_F,
           "reach_X": reach_X}
    return "\n".join(L) + "\n", res


def main():
    PARTS.mkdir(exist_ok=True)
    a = sys.argv[1:]
    if a[:1] == ["one"]:
        r = one(*a[1:4])
        print(r["case"], r["kind"], "reproduced", r["reproduced"], round(r["rerun_secs"]))
        return
    if a[:1] == ["r"]:
        r = r_step(*a[1:4])
        print(r["case"], r["kind"], "JR clean", (r["JR"] or {}).get("clean"), round(r["secs"]))
        return
    if a[:1] == ["run"]:
        n = int(a[1]) if len(a) > 1 else 4
        jobs = sorted(unfinished(), key=lambda j: j[3])  # shortest frozen runs first
        with ThreadPoolExecutor(n) as ex:
            list(ex.map(drive, jobs))
    txt, res = summary()
    OUT.with_suffix(".json").write_text(json.dumps(res, default=float))
    OUT.with_suffix(".txt").write_text(txt)
    print(txt)


if __name__ == "__main__":
    main()
