"""Why the ESC-lag survey picks 10-14 ms on first-order plants and 22-25 ms on a 50 ms ESC (2026-11-18,
firmware/esp32/README.md "The ESC-lag survey's search, traced").

tests/take_survey_sweep.py's drills (eval/take-survey-sweep-2026-11-17.jsonl.gz, field esc_refined_ms) show the
board's ESC-lag survey refining to 10-14 ms on 9 of 12 first-order 8k builds (0 on the other 3) and to 22-25 ms on all
12 ESC 50 ms builds, at a wheel lag of 0.3 s on the 0.1 ms plant. The section "The first-order take misfit traced"
found the take survey's refits falling into the wrong t0 basin at the record fit's 3 levels; the ESC-lag survey searches
t0 the same way and, unlike the take survey, also skips the tau golden section (refine=0: tau only on the five points
of LOOP_TAU_GRID_US). Either could leave a wheel's rms jagged against the ESC lag.

This script keeps each ESC-survey wheel's inputs exactly as the board passed them (snapshot periods, raw ticks before
the ESC lag) with the board's own rms per lag, and refits them offline under one change at a time:

  levels 5         the t0 search five levels deep (the take survey's fix), tau still on its grid
  refine 5         the tau golden section on (the record fit's refine=5), t0 at 3 levels
  levels 5 refine 5  both
  tau at the plant's  tau fixed at the plant's wheel lag, t0 at 5 levels (an oracle: what the survey could reach)

Scored as the board scores (controller.ResidualSurvey over ESC_SURVEY_GRID_US, survey_pick's parabola).

PREDICTION, written before any refit: the ESC lag acts as a stand-in for the tau the coarse grid cannot reach (100 /
200 / 400 ms around a 300 ms wheel), so `refine 5` brings every first-order build to 0 ms and every 50 ms build within
10 ms of 50, while `levels 5` alone moves the picks little. DECISION RULE: the smallest change that puts every
first-order build at 5 ms or less and every 50 ms build within 10 ms, at both lags, ships on the board's ESC-lag survey;
if none does, the bias is reported as untraced and the survey's advice gets no new trust.

RESULT: held. Refine 5 put 12 of 12 first-order builds at 0 ms and 12 of 12 ESC 50 ms builds at 42-55 ms (shipped:
6 of 12 and 0 of 12); levels 5 alone moved no pick past 2 ms. Refine 3 also met the bar (51-55, 43-55), refine 1 and 2
did not (35-83 ms on the 50 ms builds). Why the first check missed it: its builds' wheel lags (0.2 / 0.4 / 0.8 s) all
sit on LOOP_TAU_GRID_US, so the unrefined fit had the exact tau. The board now runs refine 5
(controller.ESC_SURVEY_REFINE), the pre-registered change and the record fit's own depth.

PART 2 (held out; written before it ran). With the board at refine 5, the calibration drill on builds no part 1 run
used: wheel lag 0.45 s (off the grid) on both plants, the tach 3 us 10k plant (first-order, jittery tach) at 0.3 and
0.45 s, and on-grid 0.4 s on both noise-free plants (the case the first check covered, which must not regress).
PREDICTION: every first-order build (noise-free or jittery) picks 5 ms or less, every ESC 50 ms build 40-60 ms, and
the drill's survey count reaches every surveyed wheel (no survey cut, the last ball's survey in before the Pi's
4 s wait ends). If a first-order build picks over 5 ms or a 50 ms build leaves 40-60, refine 5 does not stay; if only
the count falls short, the Pi's wait (host.ESC_SURVEY_S) is raised to cover the longer survey.

RESULT: the picks held on all 36 builds (first-order 0 ms on every one, jittery tach included; ESC 50 ms 48-55 ms, the
on-grid 0.4 s builds as well). The count did not: with the take survey off, the next stroke cut each ball's survey
after one wheel (11 of 22 counted), and the venture's own tests then failed, because a rally drill's survey (4 of 32
wheels) no longer reached the 16 the pre-calibration check needs. A bracket around the record fit's tau at the old
cost was tried and dropped (an untold 80 ms ESC read 13-57 ms). What shipped instead: a new stroke pauses a survey
rather than cutting it (no survey step during a stroke or a pending record fit), surveys queue (controller.SURVEY_QUEUE
= 2), and the Pi's end wait drains them (host.ESC_SURVEY_S 20 s, ending after SURVEY_QUIET_S = 3 s with no new count).
Rerun (eval/esc-misfit-heldout-2026-11-18.txt): the picks unchanged on 36 of 36 with 18-20 wheels a drill (2-3 queued
surveys gave way); run as `tennisbots run` runs a calibration drill (--take-survey), 12 of 12 builds met all of it, 24
of 24 wheels, none cut, holds 104-107 s for 12 balls (79 s before).

PART 3 (--rally, after part 2): drills with no hold. The old fit picked 83-86 ms for the 50 ms ESC there, so it was
wrong on these drills too; refined and queued, 49-51 ms on 6-18 of 8-32 wheels.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/esc_misfit_trace.py --capture rows.jsonl [--lags 0.3,0.6] [--plants 0,2] [--procs 4]
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/esc_misfit_trace.py --rescore rows.jsonl[.gz] [--procs 4]
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/esc_misfit_trace.py --heldout rows.jsonl[.gz]
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/esc_misfit_trace.py --rally

Simulated only: noise-free plants, one seed.
"""

import gzip
import json
import multiprocessing
import sys

import feeder_sim
import min_fit_heldout as h
import reading_floor as rf
import take_spread as ts
from feeder_sim import controller

LAGS = (0.3, 0.6)
GRID = controller.ESC_SURVEY_GRID_US
TAKES = (("instant", 0.0, "halfsine"), ("halfsine 6 ms", 6.0, "halfsine"))
PLANTS = (0, 2)
TRUE_ESC_MS = {0: 0, 2: 50}
TAKE_SURVEY = "--take-survey" in sys.argv   # the drill as `tennisbots run` runs a calibration drill: SURVEY_TAKE on, the
                                            # Pi holding each ball for the last one's surveys (host.TAKE_WAIT_S)


def capture(args):
    """One calibration drill (take survey off) on a fresh board; every ESC-survey wheel's inputs and the board's rms."""
    ti, pi, li, lag = args
    import take_survey_sweep as tss
    from tennisbots import host, launcher
    rf._FINE_STEP = ts.FINE_STEP
    feeder_sim.SimFeeder.run_ms = rf._make_run_ms(sub=rf.FINE)
    controller.LOOP_TAKE = ()
    controller.LOOP_THROUGH_CHANGE = host.LOOP_THROUGH_CHANGE = False
    host.HOLD_RPM = h.SHIPPED_HOLD
    tss.LAG = lag
    _, take_ms, shape = TAKES[ti]
    plant = dict(h.PLANTS[pi][1], take_ms=take_ms, take_shape=shape)
    se, sp = h.LAUNCHERS[li]
    true = launcher.WheelLauncher(speed_efficiency=se, spin_efficiency=sp)
    wheels = []
    orig_esc = controller.LaunchCheck._esc_survey

    def esc(self, snap, ticks, edges0, targets):
        # the board's _esc_survey, line for line, keeping each added wheel's inputs and rms
        for k in (0, 1):
            if targets[k] <= 0:
                continue
            e0 = edges0[k]
            raw = [(c - e0, us, u) for c, us, u in ticks[k]]
            got = []
            for g in self.survey:
                fit = None
                for item in controller.drop_from_commands_steps(snap[k], controller.esc_lagged_ticks(snap[k], raw, g),
                                                                refine=getattr(controller, "ESC_SURVEY_REFINE", 0)):
                    if item is None:
                        yield None
                    else:
                        fit = item[1]
                if fit is None:
                    break
                got.append(fit[4] * fit[4])
            if len(got) == len(self.survey):
                wheels.append({"periods": list(snap[k]), "ticks": [list(t) for t in raw],
                               "board": [g ** 0.5 for g in got]})
                self.survey_add(got)

    controller.LaunchCheck._esc_survey = esc
    try:
        res, _, cut = tss.drill(true, plant, tss.rf_load("drill.calibration.json"), survey=TAKE_SURVEY)
    finally:
        controller.LaunchCheck._esc_survey = orig_esc
    if not res.ok:
        return args, {"aborted": res.aborted}
    sv = res.esc_survey
    return args, {"build": [ti, pi, li, lag], "board_survey": sv, "cut": cut, "wheels": wheels,
                  "board_refine": getattr(controller, "ESC_SURVEY_REFINE", 0), "esc_s": host.ESC_SURVEY_S,
                  "take_survey": TAKE_SURVEY, "take_wait_s": host.TAKE_WAIT_S, "held_s": res.survey_wait_s,
                  "take_wheels": (res.take_survey or {}).get("wheels")}


def refit(w, variant, lag):
    periods = w["periods"]
    raw = [tuple(t) for t in w["ticks"]]
    kw = {"refine": 0}
    if variant == "levels 5":
        kw["levels"] = 5
    elif variant.startswith("refine "):
        kw["refine"] = int(variant.split()[1])
    elif variant == "levels 5 refine 5":
        kw.update(levels=5, refine=5)
    elif variant == "tau at the plant's":
        kw.update(levels=5, taus=(int(round(lag * 1e6)),))
    row = []
    for g in GRID:
        fit = None
        for item in controller.drop_from_commands_steps(periods, controller.esc_lagged_ticks(periods, raw, g), **kw):
            if item is not None:
                fit = item[1]
        if fit is None:
            return None
        row.append(fit[4])
    return row


VARIANTS = ("shipped", "levels 5", "refine 1", "refine 2", "refine 3", "refine 5", "levels 5 refine 5",
            "tau at the plant's")
if "--variants" in sys.argv:
    VARIANTS = ("shipped",) + tuple(sys.argv[sys.argv.index("--variants") + 1].split(","))


def score(rows):
    """The board's scoring: (least ms, refined ms, mean rms per lag in ppm)."""
    rs = controller.ResidualSurvey(GRID)
    for got in rows:
        if got is not None:
            rs.add([g * g for g in got])
    rep = rs.report(1000)
    return None if rep is None else (rep[1], rep[2], rep[3])


def rescore_one(b):
    lag = b["build"][3]
    out = {}
    for v in VARIANTS:
        if v == "shipped":
            rows = [w["board"] for w in b["wheels"]]
            mine = [refit(w, v, lag) for w in b["wheels"]]
            same = sum(m is not None and max(abs(x - y) for x, y in zip(m, w)) < 1e-6
                       for m, w in zip(mine, rows))
            out["reproduced"] = (same, len(rows))
        else:
            rows = [refit(w, v, lag) for w in b["wheels"]]
        out[v] = score(rows)
    return b["build"], out


def rescore(builds, procs):
    with multiprocessing.Pool(procs) as pool:
        got = dict((tuple(k), v) for k, v in pool.map(rescore_one, builds))
    print(f"{len(builds)} calibration drills; per build the ESC-lag survey's refined pick in ms under each change "
          f"(grid {', '.join(str(g // 1000) for g in GRID)} ms; true ESC lag: first-order 0, ESC 50 ms 50)")
    hdr = " | ".join(f"{v:>18}" for v in VARIANTS)
    print(f"  {'lag':4} {'take':13} {'plant':15} {'launcher':8} | {hdr} | shipped refit reproduces the board")
    for b in sorted(got, key=lambda k: (k[3], k[1], k[0], k[2])):
        o = got[b]
        cells = " | ".join(f"{'-' if o[v] is None else o[v][1]:>18}" for v in VARIANTS)
        print(f"  {b[3]:<4} {TAKES[b[0]][0]:13} {h.PLANTS[b[1]][0]:15} {b[2]:<8} | {cells} | "
              f"{o['reproduced'][0]} of {o['reproduced'][1]} wheels")
    print("\nPooled per lag and plant: refined picks (sorted); builds meeting the bar (first-order <= 5 ms, "
          "ESC 50 ms within 10 ms)")
    for lag in sorted({b[3] for b in got}):
        for pi in sorted({b[1] for b in got}):
            sub = [got[b] for b in got if b[3] == lag and b[1] == pi]
            for v in VARIANTS:
                picks = sorted(s[v][1] for s in sub if s[v] is not None)
                ok = sum((p <= 5) if pi != 2 else abs(p - 50) <= 10 for p in picks)
                print(f"  lag {lag} {h.PLANTS[pi][0]:15} {v:18} | {picks} | {ok} of {len(picks)}")
    print("\nMean rms per lag (ppm), first build of each lag and plant, shipped vs levels 5 refine 5:")
    for lag in sorted({b[3] for b in got}):
        for pi in sorted({b[1] for b in got}):
            b = min((k for k in got if k[3] == lag and k[1] == pi), default=None)
            if b is None:
                continue
            for v in ("shipped", "levels 5", "refine 5", "levels 5 refine 5"):
                s = got[b][v]
                print(f"  lag {lag} {h.PLANTS[pi][0]:15} {v:18} | {s and s[2]}")


def heldout(builds):
    """Part 2: the board's own picks (no refit), its wheel count against the wheels it surveyed, and its cuts."""
    print(f"{len(builds)} calibration drills, board at ESC_SURVEY_REFINE {builds[0].get('board_refine')}, Pi wait "
          f"{builds[0].get('esc_s')} s; per build: the board's refined pick, wheels in the Pi's last ESC_SURVEY / "
          f"wheels the board surveyed, surveys cut")
    ok = 0
    for b in sorted(builds, key=lambda b: (b["build"][3], b["build"][1], b["build"][0], b["build"][2])):
        ti, pi, li, lag = b["build"]
        sv = b["board_survey"] or {}
        pick = sv.get("refined_ms")
        good = pick is not None and ((pick <= 5) if pi != 2 else 40 <= pick <= 60)
        full = sv.get("wheels") == len(b["wheels"]) and b["cut"] == 0
        ok += good and full
        print(f"  lag {lag:<4} {TAKES[ti][0]:13} {h.PLANTS[pi][0]:15} launcher {li} | pick {pick} ms "
              f"(least {sv.get('least_ms')}) {'ok' if good else 'MISS'} | wheels {sv.get('wheels')} / "
              f"{len(b['wheels'])} | cut {b['cut']} | rms {sv.get('rms_ppm')}"
              + (f" | take survey {b['take_wheels']} wheels, held {b['held_s']:.1f} s (cap {b['take_wait_s']} s a ball)"
                 if b.get("take_survey") else ""))
    print(f"\n{ok} of {len(builds)} builds meet the prediction (first-order <= 5 ms, ESC 50 ms 40-60 ms, every wheel "
          f"counted, none cut)")


def rally(lag=0.45):
    """Part 3: drills with no hold between balls (rally and example, launcher 0), the board's survey at the drill's end."""
    import take_survey_sweep as tss
    from tennisbots import host, launcher
    rf._FINE_STEP = ts.FINE_STEP
    feeder_sim.SimFeeder.run_ms = rf._make_run_ms(sub=rf.FINE)
    controller.LOOP_TAKE = ()
    controller.LOOP_THROUGH_CHANGE = host.LOOP_THROUGH_CHANGE = False
    host.HOLD_RPM = h.SHIPPED_HOLD
    tss.LAG = lag
    se, sp = h.LAUNCHERS[0]
    for refine in (0, controller.ESC_SURVEY_REFINE):
        controller.ESC_SURVEY_REFINE = refine
        for pi in PLANTS:
            for name in ("drill.rally.json", "drill.example.json"):
                true = launcher.WheelLauncher(speed_efficiency=se, spin_efficiency=sp)
                res, w, cut = tss.drill(true, dict(h.PLANTS[pi][1]), tss.rf_load(name), survey=False)
                sv = res.esc_survey or {}
                print(f"  refine {refine} lag {lag} {h.PLANTS[pi][0]:15} {name:19} | launched wheels {len(w):2d}, "
                      f"surveyed {sv.get('wheels')}, cut {cut:2d} | pick {sv.get('refined_ms')} ms | rms {sv.get('rms_ppm')}")


def main():
    procs = int(sys.argv[sys.argv.index("--procs") + 1]) if "--procs" in sys.argv else multiprocessing.cpu_count()
    lags = [float(v) for v in sys.argv[sys.argv.index("--lags") + 1].split(",")] if "--lags" in sys.argv else LAGS
    if "--rally" in sys.argv:
        return rally()
    if "--heldout" in sys.argv:
        path = sys.argv[sys.argv.index("--heldout") + 1]
        with (gzip.open(path, "rt") if path.endswith(".gz") else open(path)) as f:
            return heldout([json.loads(line) for line in f])
    if "--rescore" in sys.argv:
        path = sys.argv[sys.argv.index("--rescore") + 1]
        with (gzip.open(path, "rt") if path.endswith(".gz") else open(path)) as f:
            return rescore([json.loads(line) for line in f], procs)
    out = sys.argv[sys.argv.index("--capture") + 1]
    plants = [int(v) for v in sys.argv[sys.argv.index("--plants") + 1].split(",")] if "--plants" in sys.argv else PLANTS
    grid = [(ti, pi, li, lag) for lag in lags for ti in range(len(TAKES)) for pi in plants for li in range(3)]
    with multiprocessing.Pool(procs, maxtasksperchild=1) as pool:
        for a, r in pool.imap_unordered(capture, grid):
            if "aborted" in r:
                print(f"aborted {a}: {r['aborted']}", file=sys.stderr)
                continue
            print(f"  {a}: {len(r['wheels'])} survey wheels, board {r['board_survey']}", file=sys.stderr, flush=True)
            with open(out, "a") as f:
                f.write(json.dumps(r) + "\n")


if __name__ == "__main__":
    main()
