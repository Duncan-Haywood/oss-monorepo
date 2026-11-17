"""The board's own contact-time survey through the whole Pi path (2026-11-17, firmware/esp32/README.md "The contact time
surveyed on the board").

tests/take_fit.py found, offline, that refitting each wheel's snapshot at a few contact times and keeping the least
summed squared rms named a build's take as well as knowing it. Here the board does it: with SURVEY_TAKE on (the Pi
sends it for a calibration drill), `LaunchCheck` refits each launched wheel at the seven half-sine contact times of
`controller.TAKE_SURVEY_GRID_US` after the ESC-lag survey, the TAKE_SURVEY frame carries the sums and
`host.take_survey_advice` turns them into one line. Per build: the calibration drill with the survey on (its drops are
the shipped step's), then a fresh board told the advised TAKE_US runs the calibration drill and the held-out slow drill
of tests/min_fit_heldout.py, and the step board runs the slow drill too, so the slow drill is the out-of-sample check.

PREDICTION, written before the run: the advised contact time lands within 1 ms of the true one on every half-sine
build (3 and 6 ms), at 1 ms or less on the instant take, and between 2 and 5 ms on the front-loaded 4 ms take (no
half-sine has its shape; take_fit's per-build pick scattered 0-5 ms). Told it, readings at 1,000 rpm and up keep an sd
about the true drop within 0.05 points of take_fit's true-time row (0.19% at 6 ms) and the spin fit's error falls
below the step's on the 6 ms builds. DECISION RULE: if any instant build is advised over 1 ms, or any 6 ms build reads
worse told the pick than as a step, the advice needs a margin (say "keep 0" unless the pick's rms beats 0's by some
share) before it can tell a person to re-flash.

Builds: the first-order 8k and ESC 50 ms told plants of min_fit_heldout.py at 0.1 ms steps (reading_floor's fine
plant, as tests/take_spread.py), its three launchers, wheel lag 0.3 s, seed 7; takes: instant, half-sine 3 ms,
half-sine 6 ms, front 4 ms. 24 builds, four drills each.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_sweep.py [--raw rows.jsonl] [--procs N] [--seed 7]

One process per build; `--raw` appends each build as it finishes and a rerun skips the builds already there. The
physics and the take's profile are the simulator's assumptions, not a real ball.
"""

import json
import multiprocessing
import statistics
import sys

import feeder_sim
import min_fit_heldout as h
import reading_floor as rf
import take_spread as ts
import unsure_weight as u
from feeder_sim import SimFeeder, controller
from tennisbots import host, launcher

TAKES = (("instant", 0.0, "halfsine"), ("halfsine 3 ms", 3.0, "halfsine"), ("halfsine 6 ms", 6.0, "halfsine"),
         ("front 4 ms", 4.0, "front"))
PLANTS = (0, 2)
LAG, SEED = 0.3, 7
if "--seed" in sys.argv:
    SEED = int(sys.argv[sys.argv.index("--seed") + 1])


def drill(true, plant, spec, take_us=0, survey=False):
    """One drill on a fresh board; (result, each launched wheel's rpm and reading / true drop)."""
    sim = SimFeeder(balls=None, wheel_tau_s=LAG, true_launcher=true, seed=SEED, **plant)
    sim.hw.launch.esc_tau_us = int(round(1e6 * plant.get("esc_tau_s", 0.0)))
    sim.hw.launch.take_us = take_us
    res = host.run_drill(host.FeederLink(sim, sim.clock), host.plan_drill(spec), sim.sleep, take_survey=survey)
    wheels = []
    if res.ok:
        recs = [r for r in res.launches if r.get("launched")]
        for r, (at, dws) in zip(recs, sim.taken):
            for k, name in ((0, "top"), (1, "bottom")):
                if at[k] > 0 and dws[k] > 0:
                    wheels.append({"rpm": float(r[f"rpm_{name}"]), "ratio": float(r[f"drop_{name}"]) / (dws[k] / at[k])})
    return res, wheels, sim.hw.launch.survey_cut


def case(args):
    ti, pi, li = args
    _, take_ms, shape = TAKES[ti]
    rf._FINE_STEP = ts.FINE_STEP
    feeder_sim.SimFeeder.run_ms = rf._make_run_ms(sub=rf.FINE)
    controller.LOOP_TAKE = ()
    controller.LOOP_THROUGH_CHANGE = host.LOOP_THROUGH_CHANGE = False
    host.HOLD_RPM = h.SHIPPED_HOLD
    plant = dict(h.PLANTS[pi][1], take_ms=take_ms, take_shape=shape)
    se, sp = h.LAUNCHERS[li]
    true = launcher.WheelLauncher(speed_efficiency=se, spin_efficiency=sp)
    cal = rf_load("drill.calibration.json")
    slow = h.heldout_drill(3.0)
    res, step_cal, cut = drill(true, plant, cal, survey=True)
    if not res.ok:
        return args, {"aborted": "survey drill: " + res.aborted}
    sv = res.take_survey
    advice = host.take_survey_advice(sv)
    pick_ms = round(2 * sv["refined_ms10"] / 10) / 2 if sv else 0.0
    out = {"survey": sv, "advice": advice, "pick_ms": pick_ms, "cut": cut, "wait_s": res.survey_wait_s,
           "esc_refined_ms": res.esc_survey and res.esc_survey["refined_ms"],
           "step": {"cal": step_cal, "cal_err": u.fit_errors(res.launches, li, 1.0)}}
    r2, w2, _ = drill(true, plant, slow)
    out["step"]["slow"] = w2 if r2.ok else None
    told = int(pick_ms * 1000)
    if told == 0:
        out["told"] = out["step"]
        return args, out
    r3, w3, _ = drill(true, plant, cal, take_us=told)
    r4, w4, _ = drill(true, plant, slow, take_us=told)
    out["told"] = {"cal": w3 if r3.ok else None, "cal_err": u.fit_errors(r3.launches, li, 1.0) if r3.ok else None,
                   "slow": w4 if r4.ok else None}
    return args, out


def rf_load(name):
    import esc_survey_sweep as S
    return S.load(name)


def stats(ws):
    rs = [w["ratio"] for w in ws or () if w["rpm"] >= u.FLOOR]
    if len(rs) < 2:
        return "-"
    return f"{statistics.fmean(rs):.4f} {100 * statistics.pstdev(rs):.2f}%"


def main():
    raw = sys.argv[sys.argv.index("--raw") + 1] if "--raw" in sys.argv else None
    procs = int(sys.argv[sys.argv.index("--procs") + 1]) if "--procs" in sys.argv else multiprocessing.cpu_count()
    grid = [(ti, pi, li) for ti in range(len(TAKES)) for pi in PLANTS for li in range(len(h.LAUNCHERS))]
    done = {}
    if raw:
        try:
            with open(raw) as f:
                for line in f:
                    k, r = json.loads(line)
                    done[tuple(k)] = r
        except FileNotFoundError:
            pass
    todo = [g for g in grid if tuple(g) not in done]
    with multiprocessing.Pool(procs, maxtasksperchild=1) as pool:
        for a, r in pool.imap_unordered(case, todo):
            done[tuple(a)] = r
            print(f"  {a}: {r.get('aborted') or r['advice']}", file=sys.stderr, flush=True)
            if raw:
                with open(raw, "a") as f:
                    f.write(json.dumps([list(a), r]) + "\n")
    print("take | plant | launcher | wheels, cut, held s | least / refined ms | advice pick | calibration reading "
          "mean sd (>=1000 rpm): step, told | slow drill: step, told | calibration spin err: step, told")
    for g in grid:
        r = done[tuple(g)]
        if "aborted" in r:
            print(f"{TAKES[g[0]][0]} | {h.PLANTS[g[1]][0]} | {g[2]} | aborted: {r['aborted']}")
            continue
        sv = r["survey"] or {}
        se, te = r["step"]["cal_err"], r["told"]["cal_err"]
        print(f"{TAKES[g[0]][0]} | {h.PLANTS[g[1]][0]} | {g[2]} | {sv.get('wheels')}, {r['cut']}, {r['wait_s']:.1f} | "
              f"{sv.get('least_ms10', 0) / 10:g} / {sv.get('refined_ms10', 0) / 10:g} | {r['pick_ms']:g} | "
              f"{stats(r['step']['cal'])}, {stats(r['told']['cal'])} | {stats(r['step']['slow'])}, "
              f"{stats(r['told']['slow'])} | {'-' if se is None else f'{100 * se[1]:.2f}%'}, "
              f"{'-' if te is None else f'{100 * te[1]:.2f}%'}")
    print("\nPooled per take, both plants, readings at 1,000 rpm and up (calibration + slow drill): mean sd, step -> told;"
          " calibration spin error mean (worst), step -> told")
    for ti, (name, _, _) in enumerate(TAKES):
        rs = [done[tuple(g)] for g in grid if g[0] == ti and "aborted" not in done[tuple(g)]]
        if not rs:
            continue
        def pool_(key):
            return [w for r in rs for part in ("cal", "slow") for w in (r[key][part] or ())]
        def spin(key):
            es = [r[key]["cal_err"][1] for r in rs if r[key]["cal_err"]]
            return f"{100 * statistics.fmean(es):.2f}% ({100 * max(es):.2f})" if es else "-"
        def adv(r):
            return "told" if "set TAKE_US" in (host.take_survey_advice(r["survey"]) or "") else "step"
        def pool_adv():
            return [w for r in rs for part in ("cal", "slow") for w in (r[adv(r)][part] or ())]
        es = [r[adv(r)]["cal_err"][1] for r in rs if r[adv(r)]["cal_err"]]
        margin = (f" | with the advice's margin ({sum(adv(r) == 'told' for r in rs)} of {len(rs)} advised): "
                  f"{stats(pool_adv())}, spin {100 * statistics.fmean(es):.2f}% ({100 * max(es):.2f})")
        picks = sorted(r["pick_ms"] for r in rs)
        print(f"  {name:14} picks {picks} | {stats(pool_('step'))} -> {stats(pool_('told'))} | "
              f"{spin('step')} -> {spin('told')}{margin}")


if __name__ == "__main__":
    main()
