"""Why an instant take picks a 1.5-2.5 ms contact time on the first-order plant at a 0.3 s wheel lag (2026-11-18,
firmware/esp32/README.md "The first-order take misfit traced").

tests/take_survey_sweep.py found all three first-order 8k builds with an instant take at lag 0.3 s advised a 2.5 ms
half-sine take, and told it, read worse; at lag 0.6 s the same builds picked 0. The README guessed the cause was the
simulator's 1 ms command steps against its 0.1 ms physics. This script keeps every board loop fit's inputs from those
builds (as tests/take_fit.py does) and refits them offline under one change at a time, each a hypothesis:

  tau      the fit's lag search: the shipped grid and golden refinement against tau fixed at the plant's true lag
  shift    the commands' times moved by -1 to +1 ms (a timing offset between the logged command and the drive)
  plant    the simulator's plant: the shipped Euler step at 0.1 ms, the same at 0.02 ms, and an exact exponential
           sub-step (no Euler lead), each a fresh capture

The candidate contact times are take_survey_sweep's (controller.TAKE_SURVEY_GRID_US, half-sine), scored as the board
does: summed squared rms over the build's wheels, least wins (the parabola refinement left out: the grid is enough to
see whether 0 wins).

PREDICTION, written before any refit: if the README's guess holds, the exact or finer plant picks 0 ms on every build
at lag 0.3 s and the tau and shift refits on the shipped plant still pick 2-3 ms. DECISION RULE: whichever single
change brings every lag-0.3 s build's pick to 0 (and keeps lag 0.6 s at 0) names the cause; if none does, report the
misfit as untraced and look at the window next.
RESULT: the premise failed before any change: on the shipped plant every lag-0.3 s build already picked 0 ms (a
lag-0.6 s build picked 2 ms by 6 ppm), and so did every change but one 0.02 ms build (2 ms by 7 ppm). The record
fits do not carry the misfit, so neither the plant nor the fit's model is the cause.

PART 2 (written after part 1, before the survey rescore ran). The board's survey sums
were reproduced to the digit from one build, and inside each wheel the fit's rms jumped 3-12 times on single
candidates whose tau search ended at 277-330 ms instead of 300: the 3-level t0 grid had settled in the wrong basin, so
rms against tau has cliffs and the golden section follows them. The survey sums squares, so a few such wheels outvote
the rest. PREDICTION: refit at 4 t0 levels, every instant build at both lags picks 1 ms or less and none is advised,
every 6 ms build still picks within 1 ms and is advised. DECISION RULE: if both hold, the take survey's refits run
at 4 levels on the board (the record fit stays at 3); if the 6 ms builds lose their pick, it does not ship.
RESULT: 4 levels missed by one build (a lag-0.3 s instant build picked 3 ms, tied with the step, not advised); 5
levels met both halves (instant 12 of 12 at 1 ms or less, none advised; 6 ms 12 of 12 within 1 ms, all advised).

PART 3 (held out; written before it ran). 5 levels was chosen after seeing part 2, so the board now runs it
(controller.TAKE_SURVEY_LEVELS) and the survey drills rerun at a wheel lag no run had used, 0.45 s. PREDICTION: no
instant build advised and every instant pick 1 ms or less; every 6 ms build within 1 ms and advised; no survey cut
with the Pi's hold at 12 s. If an instant build is advised or a 6 ms build is missed where 3 levels named it, 5 levels
does not stay.
RESULT: neither fired. One instant build picked 2.5 ms on a tie with the step (share 1.00, not advised), so the
"1 ms or less" part missed by one tie; 6 of 6 6 ms builds named and advised (4 at 3 levels), 6 of 6 3 ms builds at 3
ms, 6 of 6 front-loaded at 4.5 ms; no survey cut. 5 levels stays.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_misfit_trace.py --capture rows.jsonl [--procs 4] [--plants euler10,exact10,euler50]
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_misfit_trace.py --rescore rows.jsonl[.gz]
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_misfit_trace.py --capture-survey survey.jsonl [--lags 0.3,0.6]
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_misfit_trace.py --rescore-survey survey.jsonl[.gz] [--procs 4]

Simulated only: a noise-free plant, one seed.
"""

import gzip
import json
import multiprocessing
import statistics
import sys

import feeder_sim
import reading_floor as rf
import take_fit as tf
import take_spread as ts
import unsure_weight as u
from feeder_sim import controller

LAGS = (0.3, 0.6)
PICK_US = controller.TAKE_SURVEY_GRID_US

# the shipped fine step with an exact exponential sub-step: the wheel's speed at the sub-step's end from the
# first-order solution, the revolutions from its integral (Euler moves the speed first and then counts revolutions
# at the new speed, which leads the true response by one sub-step)
EXACT_STEP = """\
for s in range(SUB):                 # exact first-order sub-step, SUB times per millisecond, with the take's share
    if self.esc_tau:
        self._drive[i] += (hw.esc_cmd[i] - self._drive[i]) * 0.001 / SUB / self.esc_tau
    else:
        self._drive[i] = hw.esc_cmd[i]
    target = self.wheel_max * self._drive[i]
    _dt = 0.001 / SUB
    _ex = _math.exp(-_dt / self.wheel_tau)
    _w0 = self.wheel[i]
    self.wheel[i] = target + (_w0 - target) * _ex
    _turns = (target * _dt + (_w0 - target) * self.wheel_tau * (1.0 - _ex)) / 60.0
    if self._takes:
        _cut = self._take_share(i, t0 + s * 1000 / SUB, t0 + (s + 1) * 1000 / SUB)
        self.wheel[i] = max(0.0, self.wheel[i] - _cut)
    before = self.rev[i]
    self.rev[i] += _turns
    if int(self.rev[i]) > int(before):
        frac = (s + (int(self.rev[i]) - before) / (self.rev[i] - before)) / SUB
        self.us = t0 + int(frac * 1000)
        if tach.cap is not None or self.tach_sensor_jitter_us:
            self._edge(tach, t0, frac * 1000)
        if self.tach_jitter_us:
            self.us += int(round(self._rng.gauss(0.0, self.tach_jitter_us)))
        tach._p(None)
"""

PLANT_STEPS = {"euler10": (ts.FINE_STEP, 10), "euler50": (ts.FINE_STEP, 50), "exact10": (EXACT_STEP, 10),
               "euler1": (ts.FINE_STEP, 1)}


def capture(args):
    lag, li, plant = args
    step, sub = PLANT_STEPS[plant]
    import math
    feeder_sim._math = math
    ts.FINE_STEP = step
    rf.FINE = sub
    tf.TAKES = (("halfsine", 0.0),)
    tf.LAG = lag
    _, r = tf.case((li, 0))
    if "aborted" in r:
        return args, r
    for x in r["rows"]:
        x["lag"], x["plant"] = lag, plant
        x["build"] = [lag, li, plant]
    return args, r


def fit(x, ticks, take_us=0, **kw):
    f = tf.result(x["periods"], ticks, dict(kw, take=controller.take_offsets(take_us)))
    return None if f is None else (f[0] / x["true"], f[4], f[3])


def shifted(ticks, periods, d_us):
    """The tick log with every command's time moved by d_us (edges re-counted so `since` stays inside its revolution)."""
    T = [0.0]
    for p in periods:
        T.append(T[-1] + p)
    out = []
    for c, since, uu in ticks:
        if not 0 <= c < len(T):          # outside the snapshot: the fit skips it too
            out.append((c, since, uu))
            continue
        t = T[c] + since + d_us
        k = max(0, min(len(T) - 1, c))
        while k + 1 < len(T) and T[k + 1] <= t:
            k += 1
        while k > 0 and T[k] > t:
            k -= 1
        out.append((k, t - T[k], uu))
    return out


def variants(x):
    ticks = [tuple(t) for t in x["ticks"]]
    out = {"shipped": dict(ticks=ticks, kw={}),
           "tau fixed at the plant's": dict(ticks=ticks, kw={"taus": (int(x["lag"] * 1e6),), "refine": 0})}
    for d in (-1000, -500, 500, 1000):
        out[f"commands {d / 1000:+g} ms"] = dict(ticks=shifted(ticks, x["periods"], d), kw={})
    return out


def rescore(rows):
    rows = [x for x in rows if x["rpm"] >= u.FLOOR]
    builds = sorted({tuple(x["build"]) for x in rows}, key=str)
    names = list(variants(rows[0]))
    print(f"{len(rows)} wheel fits at {u.FLOOR:.0f} rpm and up, instant take; per build: the least summed squared rms "
          f"over {', '.join(f'{c / 1000:g}' for c in PICK_US)} ms (half-sine), each candidate's mean rms in ppm, the "
          f"step's reading sd about the true drop, and its fitted tau's median")
    for name in names:
        print(f"\n{name}")
        for b in builds:
            sub = [x for x in rows if tuple(x["build"]) == b]
            if name != "shipped" and b[2] != "euler10":
                continue
            cost = [0.0] * len(PICK_US)
            reads, taus = [], []
            for x in sub:
                v = variants(x)[name]
                fs = [fit(x, v["ticks"], c, **v["kw"]) for c in PICK_US]
                if any(f is None for f in fs):
                    continue
                for i, f in enumerate(fs):
                    cost[i] += f[1] ** 2
                reads.append(fs[0][0])
                taus.append(fs[0][2])
            n = len(reads)
            best = min(range(len(PICK_US)), key=cost.__getitem__)
            rms = " ".join(f"{1e6 * (c / n) ** 0.5:4.0f}" for c in cost)
            print(f"  lag {b[0]} launcher {b[1]} plant {b[2]:8} n {n:3d} pick {PICK_US[best] / 1000:3g} ms | rms {rms} | "
                  f"step sd {100 * statistics.pstdev(reads):.2f}% mean {statistics.fmean(reads):.4f} | "
                  f"tau {statistics.median(taus) / 1e6:.3f} s")


# ---- part 2: the board's own survey inputs ----------------------------------------------------------------------
# Part 1 (record fits refit offline) picked 0 ms on every lag-0.3 s build, so the survey itself was reproduced: each
# take survey's wheel inputs are kept exactly as the board passed them (snapshot periods, ticks after its ESC lag), with
# the board's rms per candidate, and refit offline with the t0 search one or two levels deeper.

SURVEY_LEVELS = (3, 4, 5)


# the survey drill capture_survey runs (2026-11-20: tests/take_survey_pick.py --drill swaps in a longer survey,
# eval/take-straddle-count-2026-11-20.md)
SURVEY_DRILL = "drill.calibration.json"


def capture_survey(args):
    """One build of take_survey_sweep's survey drill (calibration drill, SURVEY_TAKE on); its take-survey wheels."""
    ti, pi, li, lag = args
    import min_fit_heldout as h
    import take_survey_sweep as tss
    from tennisbots import host, launcher
    rf._FINE_STEP = ts.FINE_STEP
    feeder_sim.SimFeeder.run_ms = rf._make_run_ms(sub=rf.FINE)
    controller.LOOP_TAKE = ()
    controller.LOOP_THROUGH_CHANGE = host.LOOP_THROUGH_CHANGE = False
    host.HOLD_RPM = h.SHIPPED_HOLD
    tss.LAG = lag
    _, take_ms, shape = tss.TAKES[ti]
    plant = dict(h.PLANTS[pi][1], take_ms=take_ms, take_shape=shape)
    se, sp = h.LAUNCHERS[li]
    true = launcher.WheelLauncher(speed_efficiency=se, spin_efficiency=sp)
    calls = []
    steps = controller.drop_from_commands_steps

    def kept(periods, ticks, **kw):
        res = None
        for item in steps(periods, ticks, **kw):
            if item is not None:
                res = item[1]
            yield item
        calls.append((list(periods), [list(t) for t in ticks], tuple(kw.get("take", ())), kw.get("refine", 5),
                      None if res is None else res[4]))
    controller.drop_from_commands_steps = kept
    try:
        res, _, cut = tss.drill(true, plant, tss.rf_load(SURVEY_DRILL), survey=True)
    finally:
        controller.drop_from_commands_steps = steps
    if not res.ok:
        return args, {"aborted": res.aborted}
    wheels, k, n = [], 0, len(PICK_US)
    while k < len(calls):        # a take survey's wheel: the step then the six spread takes, same inputs, refine on
        c = calls[k]
        if c[3] != 0 and not c[2] and k + n <= len(calls) and all(calls[k + j][2] for j in range(1, n)):
            wheels.append({"periods": c[0], "ticks": c[1], "board": [calls[k + j][4] for j in range(n)]})
            k += n
        else:
            k += 1
    return args, {"build": [ti, pi, li, lag], "survey": res.take_survey, "cut": cut, "wait_s": res.survey_wait_s,
                  "board_levels": getattr(controller, "TAKE_SURVEY_LEVELS", 3), "wheels": wheels}


def survey_score(wheels_rms, trim=None, grid=None):
    """The board's own scoring (controller.ResidualSurvey, survey_pick): (least, refined ms, rms per candidate in ppm,
    best / step share). `trim` None is the board's take-survey trim (controller.TAKE_SURVEY_TRIM); `grid` None is the
    board's grid (a stored row captured on an older grid passes its own, take_survey_trim.grid_for)."""
    rs = controller.ResidualSurvey(grid or PICK_US, getattr(controller, "TAKE_SURVEY_TRIM", None) if trim is None else trim)
    for got in wheels_rms:
        if got and all(g is not None for g in got):
            rs.add([g * g for g in got])
    rep = rs.report(100)
    if rep is None:
        return None
    _, least, ref, rms = rep
    return least / 10, ref / 10, rms, min(rms) / rms[0] if rms[0] else 1.0


def survey_levels(b):
    out = {}
    for lv in SURVEY_LEVELS:
        if lv == b.get("board_levels", 3):
            got = [w["board"] for w in b["wheels"]]
        else:
            got = []
            for w in b["wheels"]:
                ticks = [tuple(t) for t in w["ticks"]]
                row = []
                for c in PICK_US:
                    f = tf.result(w["periods"], ticks, {"take": controller.take_offsets(c), "levels": lv})
                    # (the kw the board passes; drop_from_commands_steps' own default depth is 3)
                    row.append(None if f is None else f[4])
                got.append(row)
        out[lv] = survey_score(got)
    return b["build"], out


def rescore_survey(builds, procs):
    import min_fit_heldout as h
    import take_survey_sweep as tss
    from tennisbots import host
    with multiprocessing.Pool(procs) as pool:
        scored = dict((tuple(k), v) for k, v in pool.map(survey_levels, builds))
    meta = {tuple(b["build"]): b for b in builds}
    print(f"{len(builds)} survey drills; per build the advice's pick (refined, 0.5 ms) and best / step share at each t0 "
          f"depth (advised when the share is at most {host.TAKE_ADVISE_RATIO})")
    for b in sorted(scored, key=lambda k: (k[3], k[0], k[1], k[2])):
        cells = []
        for lv in SURVEY_LEVELS:
            s = scored[b][lv]
            if s is None:
                cells.append(f"{lv} levels: -")
                continue
            pick = round(2 * s[1]) / 2
            adv = "advised" if s[3] <= host.TAKE_ADVISE_RATIO else "kept 0"
            cells.append(f"{lv} levels: {pick:3g} ms {s[3]:.2f} {adv:7}")
        m = meta[b]
        print(f"  lag {b[3]} {tss.TAKES[b[0]][0]:13} {h.PLANTS[b[1]][0]:15} launcher {b[2]} | " + " | ".join(cells)
              + (f" | board at {m['board_levels']}: cut {m['cut']}, held {m['wait_s']:.1f} s" if "wait_s" in m else ""))
    print("\nPooled per lag and take (6 builds): picks; builds advised")
    for lag in sorted({b[3] for b in scored}):
        for ti, (name, ms, _) in enumerate(tss.TAKES):
            sub = [scored[b] for b in scored if b[3] == lag and b[0] == ti]
            if not sub:
                continue
            cells = []
            for lv in SURVEY_LEVELS:
                ss = [s[lv] for s in sub if s[lv] is not None]
                picks = sorted(round(2 * s[1]) / 2 for s in ss)
                adv = sum(s[3] <= host.TAKE_ADVISE_RATIO for s in ss)
                within = sum(abs(round(2 * s[1]) / 2 - ms) <= 1.0 for s in ss)
                cells.append(f"{lv}: {picks} advised {adv}, within 1 ms {within}")
            print(f"  lag {lag} {name:13} | " + " | ".join(cells))


def main():
    procs = int(sys.argv[sys.argv.index("--procs") + 1]) if "--procs" in sys.argv else multiprocessing.cpu_count()
    lags = [float(v) for v in sys.argv[sys.argv.index("--lags") + 1].split(",")] if "--lags" in sys.argv else LAGS
    if "--rescore-survey" in sys.argv:
        path = sys.argv[sys.argv.index("--rescore-survey") + 1]
        with (gzip.open(path, "rt") if path.endswith(".gz") else open(path)) as f:
            return rescore_survey([json.loads(line) for line in f], procs)
    if "--capture-survey" in sys.argv:
        out = sys.argv[sys.argv.index("--capture-survey") + 1]
        grid = [(ti, pi, li, lag) for lag in lags for ti in range(4) for pi in (0, 2) for li in range(3)]
        with multiprocessing.Pool(procs, maxtasksperchild=1) as pool:
            for a, r in pool.imap_unordered(capture_survey, grid):
                if "aborted" in r:
                    print(f"aborted {a}: {r['aborted']}", file=sys.stderr)
                    continue
                print(f"  {a}: {len(r['wheels'])} survey wheels, board {r['survey']}", file=sys.stderr, flush=True)
                with open(out, "a") as f:
                    f.write(json.dumps(r) + "\n")
        return
    if "--rescore" in sys.argv:
        path = sys.argv[sys.argv.index("--rescore") + 1]
        with (gzip.open(path, "rt") if path.endswith(".gz") else open(path)) as f:
            return rescore([json.loads(line) for line in f])
    out = sys.argv[sys.argv.index("--capture") + 1]
    plants = sys.argv[sys.argv.index("--plants") + 1].split(",") if "--plants" in sys.argv else ["euler10"]
    grid = [(lag, li, p) for p in plants for lag in lags for li in range(3)]
    with multiprocessing.Pool(procs, maxtasksperchild=1) as pool:
        for a, r in pool.imap_unordered(capture, grid):
            if "aborted" in r:
                print(f"aborted {a}: {r['aborted']}", file=sys.stderr)
                continue
            print(f"  {a}: {len(r['rows'])} wheel fits", file=sys.stderr, flush=True)
            with open(out, "a") as f:
                for x in r["rows"]:
                    f.write(json.dumps(x) + "\n")


if __name__ == "__main__":
    main()
