"""Does the take survey's pick between its contact times lean the way the ESC-lag survey's did? (2026-11-18,
firmware/esp32/README.md "The take survey's pick between contact times")

README "The ESC-lag survey's pick between grid lags" found that `survey_pick`'s three-point parabola read the ESC-lag
survey's lopsided V-shaped residual curve off its least (40-50 ms read 36-47), and shipped a natural cubic spline
(`survey_spline_pick`, ESC_SURVEY_SPLINE). The take survey (`ResidualSurvey.report`) still uses the parabola, and
every stored take capture has its true take on a grid point (0, 3, 4 and 6 ms on a grid of 0, 2, 3, 4, 5, 6, 8 ms),
so no stored set can show a lean between grid points.

This captures survey drills (take_misfit_trace.capture_survey: the calibration drill with SURVEY_TAKE on, the board's
grid, depth, window, trim and blind rule) whose half-sine takes sit between grid points, keeps each surveyed wheel's
periods and ticks, and refits every wheel offline at a dense set of contact times (DENSE_US) with the board's own
fit (take_fit.result, the board's TAKE_SURVEY_LEVELS). Per build it reports:

- the dense least: the candidate whose sum over the wheels the board kept (the same blind rule, on the grid row) is
  least, i.e. where the survey's own residual curve bottoms out;
- the parabola's and the spline's pick from the board's seven grid sums;
- each against the true take and against the dense least.

The question is the pick's, not the fit's: if the dense least sits off the true take, no pick between grid points can
fix that, and the gap is the fit's (four parts against the simulator's continuous profile, README "Take-blind rows
traced").

DESIGN SET (lag 0.45 s, seed 29, 54 drills; eval/take-survey-pick-2026-11-18.md): the dense least read the off-grid
takes +0.38 ms high on the capture tach and +0.78 on the jittery one; the parabola sat -0.13 / -0.28 ms below the
dense least and the spline +0.01 / -0.21, so the spline follows the residual's own least more closely but inherits the
fit's high reading (off-grid takes within 0.5 ms: dense 29 of 36, parabola 21, spline 20). Every 7 ms take read 8.0
(the grid's end) and 5 of 6 at 1 ms read 0. On the Pi's own test (the pick rounded to 0.5 ms, within 1 ms) every grid
tried scored 46-47 and named and advised 28-31 of 47 spread takes, none advised an instant build (--grids).

PREDICTION (written before the held-out capture ran): on the held-out set below, (a) the spline's mean signed distance
from the dense least on the off-grid takes is within +-0.15 ms on the capture tach and the parabola's is below it;
(b) the dense least reads the off-grid takes high on average on both tachs; (c) the spline is within 1 ms of the true
take on no more builds than the parabola.

DECISION RULE (written with the prediction): the take survey's report moves to `survey_spline_pick` only if, on the
held-out set, the spline has more builds within 1 ms than the parabola, at least as many spread takes named and
advised, and no more instant builds advised. Otherwise the parabola stays. The grid stays unless the nine-point grid
(0-8 ms by 1) passes the same three clauses against the shipped grid with the parabola (it costs two more fits a
wheel and a longer TAKE_SURVEY frame, so a tie keeps the shipped grid).

HELD OUT: wheel lag 0.6 s, seed 31 (neither used by the design set), the same takes, tachs and launchers.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture rows.jsonl [--lag 0.45] [--seed 29] [--procs 4] [--takes "0.5,1.5,...,0"] [--tach 1]
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --score rows.jsonl[.gz] [--procs 4]
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --score rows.jsonl[.gz] --grids "0,2,3,4,5,6,8;0,1,2,3,4,5,6,7,8"

--takes (2026-11-18, eval/take-grid-nine-2026-11-18.md) replaces TAKES_MS for a capture. Sets D to F used the
half-millisecond takes 0.5-7.5 ms, off both the shipped and the nine-point grid. --grids also prints each take's
verdicts per grid. 2026-11-18 (eval/take-grid-fresh-g-i-2026-11-18.md): --grids also prints builds off by more than
1 ms and the mean absolute error per grid and pick; sets G to I drew one take uniformly in each millisecond (0-1 to
7-8 ms, seed 20261118), off both grids by a random amount rather than by half a millisecond.

Simulated only: the simulator's first-order wheel and assumed half-sine take, the MCPWM capture tach at 1/8 us with
0.5 us handler jitter (which the capture does not see) and the board's default jittery tach at 0.5 us; one seed per set.
"""

import gzip
import json
import multiprocessing
import sys

# half-sine takes between the shipped grid's points (0, 2, 3, 4, 5, 6, 8 ms), two on it as a check, and an instant
# build (0 ms: the survey must not advise a re-flash there)
TAKES_MS = (1.0, 2.5, 3.5, 4.5, 5.5, 7.0, 3.0, 6.0, 0.0)
# tach modes: (label, plant overrides). The capture at 1/8 us is the cleanest the board ships; the jittery tach at
# 0.5 us is the board's default tach at its least noise, the level where the survey still speaks (README "The take
# survey's jitter limit").
TACHS = (("capture 1/8 us", {"tach_jitter_us": 0.5, "tach_capture": True, "tach_capture_sub": 8}),
         ("jittery 0.5 us", {"tach_jitter_us": 0.5}))
TACH_PLANT = 1                 # min_fit_heldout.PLANTS[1]: "tach 3 us 10k" (wheel_max_rpm 10000), jitter replaced
DENSE_US = tuple(range(0, 8001, 250))


def capture(args):
    ti, ki, li, lag, seed, takes, drill = args
    import min_fit_heldout as h
    import take_misfit_trace as tm
    import take_survey_sweep as tss
    tss.SEED = seed
    tss.TAKES = tuple(tss.TAKES) + tuple((f"halfsine {ms:g} ms", ms, "halfsine") for ms in takes)
    plants = list(h.PLANTS)
    plants[TACH_PLANT] = (TACHS[ki][0], dict(h.PLANTS[TACH_PLANT][1], **TACHS[ki][1]))
    h.PLANTS = tuple(plants)
    if drill:
        tm.SURVEY_DRILL = drill
    a, r = tm.capture_survey((4 + ti, TACH_PLANT, li, lag))
    if "aborted" not in r:
        r["build"] = [ti, ki, li, lag, seed]
        r["take_ms"] = takes[ti]
        if drill:
            r["drill"] = drill
        r["board_scores"] = [w["board"] for w in r["wheels"]]
    return (ti, ki, li, lag, seed), r


def dense_rows(b):
    """Each surveyed wheel's rms at every DENSE_US candidate, by the board's fit (take_fit.result, the board's depth)."""
    import take_misfit_trace as tm  # (puts controller on the path)
    import take_fit as tf
    from feeder_sim import controller
    levels = b.get("board_levels", controller.TAKE_SURVEY_LEVELS)
    out = []
    for w in b["wheels"]:
        ticks = [tuple(t) for t in w["ticks"]]
        row = []
        for c in DENSE_US:
            f = tf.result(w["periods"], ticks, {"take": controller.take_offsets(c), "levels": levels})
            row.append(None if f is None else f[4])
        out.append(row)
    return tuple(b["build"]), out


def picks(b, dense):
    """(dense least ms, parabola ms, spline ms, best / step share, wheels kept) for one build, or None."""
    import take_misfit_trace as tm
    from feeder_sim import controller
    grid = tm.PICK_US
    rs = controller.ResidualSurvey(grid, controller.TAKE_SURVEY_TRIM, controller.TAKE_SURVEY_BLIND)
    dsum = [0.0] * len(DENSE_US)
    idx = [DENSE_US.index(g) for g in grid]
    for got, drow in zip(b["board_scores"], dense):
        if any(d is None for d in drow):
            continue
        if not got or len(got) != len(grid) or any(g is None for g in got):
            # a capture from older firmware (seven candidates, before 2026-11-19's eight-point grid): the board's
            # row on today's grid is the dense refit at its points (the same fit, so the same numbers)
            got = [drow[i] for i in idx]
        before = rs.kept_n
        rs.add([g * g for g in got])
        if rs.kept_n > before:          # the board kept it: its dense row joins the dense sums
            for i, d in enumerate(drow):
                dsum[i] += d * d
    if not rs.wheels:
        return None
    sums = rs.sums()
    _, par = controller.survey_pick(grid, sums)
    _, spl = controller.survey_spline_pick(grid, sums)
    k = min(range(len(dsum)), key=lambda i: dsum[i])
    share = (min(sums) / sums[0]) ** 0.5 if sums[0] else 1.0
    return DENSE_US[k] / 1000, par / 1000, spl / 1000, share, rs.kept_n


def score(builds, procs):
    from tennisbots import host
    from feeder_sim import controller
    import take_misfit_trace as tm
    builds = sorted(builds, key=lambda b: tuple(b["build"]))
    with multiprocessing.Pool(procs) as pool:
        dense = dict(pool.map(dense_rows, builds))
    lag, seed = builds[0]["build"][3], builds[0]["build"][4]
    print(f"{len(builds)} survey drills (wheel lag {lag} s, seed {seed}); dense refits every "
          f"{DENSE_US[1] / 1000:g} ms from 0 to {DENSE_US[-1] / 1000:g} ms; picks from the board's {len(tm.PICK_US)} grid sums "
          f"(trim {controller.TAKE_SURVEY_TRIM}, blind {controller.TAKE_SURVEY_BLIND}); "
          f"advised when the share is at most {host.TAKE_ADVISE_RATIO}")
    print("take ms | tach | launcher | kept | dense least | parabola | spline | share")
    tally = {}
    for b in builds:
        p = picks(b, dense[tuple(b["build"])])
        ti, ki, li = b["build"][:3]
        ms = b["take_ms"]
        if p is None:
            print(f"{ms:g} | {TACHS[ki][0]} | {li} | 0 | - | - | - | -")
            continue
        dl, par, spl, share, kept = p
        adv = share <= host.TAKE_ADVISE_RATIO
        print(f"{ms:g} | {TACHS[ki][0]} | {li} | {kept} | {dl:.2f} | {par:.2f} | {spl:.2f} | {share:.2f}"
              f"{'*' if adv else ''}")
        for key in (TACHS[ki][0], "all"):
            tally.setdefault(key, []).append((ms, dl, par, spl, adv, round(ms * 1000) in tm.PICK_US))
    takes = sorted({b["take_ms"] for b in builds})
    print("\nOff-grid takes only (" + ", ".join(f"{t:g}" for t in takes if round(t * 1000) not in tm.PICK_US)
          + " ms); error in ms, signed mean and mean absolute:")
    print("tach | builds | dense least - true | parabola - true | spline - true | parabola - dense | spline - dense | "
          "within 0.5 ms of true: dense / parabola / spline")
    for key, rows in tally.items():
        off = [r for r in rows if not r[5]]
        if not off:
            continue

        def m(f):
            v = [f(r) for r in off]
            return f"{sum(v) / len(v):+.2f} / {sum(abs(x) for x in v) / len(v):.2f}"
        w = [sum(abs(r[j] - r[0]) <= 0.5 + 1e-9 for r in off) for j in (1, 2, 3)]
        print(f"{key} | {len(off)} | {m(lambda r: r[1] - r[0])} | {m(lambda r: r[2] - r[0])} | "
              f"{m(lambda r: r[3] - r[0])} | {m(lambda r: r[2] - r[1])} | {m(lambda r: r[3] - r[1])} | "
              f"{w[0]} / {w[1]} / {w[2]}")
    print("\nOn-grid check (" + ", ".join(f"{t:g}" for t in takes if round(t * 1000) in tm.PICK_US)
          + " ms): within 0.5 ms of true, dense / parabola / spline")
    for key, rows in tally.items():
        on = [r for r in rows if r[5]]
        if on:
            w = [sum(abs(r[j] - r[0]) <= 0.5 + 1e-9 for r in on) for j in (1, 2, 3)]
            print(f"{key} | {len(on)} | {w[0]} / {w[1]} / {w[2]}")
    print("\nBy take (all tachs): mean signed error, dense / parabola / spline")
    for ms in takes:
        rows = [r for r in tally.get("all", []) if r[0] == ms]
        if rows:
            print(f"{ms:g} ms ({len(rows)}): " + " / ".join(f"{sum(r[j] - r[0] for r in rows) / len(rows):+.2f}"
                                                             for j in (1, 2, 3)))


def grid_score(builds, dense, grid_ms, pick_name, by_take=None):
    """The board's verdicts had it surveyed `grid_ms` (each a DENSE_US point) instead of the shipped grid: each wheel's
    row is its dense rms at those points, the board's trim and blind rule and `pick_name`'s pick, rounded to 0.5 ms
    as the Pi rounds it. (within 0.5 ms, within 1 ms, spread takes named within 1 ms and advised, spread takes,
    instant builds advised, instant builds, builds with a verdict)."""
    from tennisbots import host
    from feeder_sim import controller
    grid = [int(round(g * 1000)) for g in grid_ms]
    idx = [DENSE_US.index(g) for g in grid]
    pick = controller.survey_spline_pick if pick_name == "spline" else controller.survey_pick
    w5 = w1 = good = spread = bad = inst = n = 0
    for b in builds:
        rs = controller.ResidualSurvey(grid, controller.TAKE_SURVEY_TRIM, controller.TAKE_SURVEY_BLIND)
        for drow in dense[tuple(b["build"])]:
            if all(drow[i] is not None for i in idx):
                rs.add([drow[i] * drow[i] for i in idx])
        if not rs.wheels:
            continue
        sums = rs.sums()
        _, ref = pick(grid, sums)
        got = round(2 * ref / 1000) / 2
        share = (min(sums) / sums[0]) ** 0.5 if sums[0] else 1.0
        adv = share <= host.TAKE_ADVISE_RATIO
        ms = b["take_ms"]
        if by_take is not None:
            by_take.setdefault(ms, []).append(got)
        n += 1
        w5 += abs(got - ms) <= 0.5
        w1 += abs(got - ms) <= 1.0
        if ms:
            spread += 1
            good += adv and abs(got - ms) <= 1.0
        else:
            inst += 1
            bad += adv
    return w5, w1, good, spread, bad, inst, n


def load(path):
    with (gzip.open(path, "rt") if path.endswith(".gz") else open(path)) as f:
        return [json.loads(line) for line in f]


def main():
    procs = int(sys.argv[sys.argv.index("--procs") + 1]) if "--procs" in sys.argv else multiprocessing.cpu_count()
    if "--score" in sys.argv:
        builds = load(sys.argv[sys.argv.index("--score") + 1])
        if "--grids" not in sys.argv:
            return score(builds, procs)
        with multiprocessing.Pool(procs) as pool:
            dense = dict(pool.map(dense_rows, builds))
        print(f"{len(builds)} survey drills; each grid's verdicts from the dense refits (trim, blind rule and margin as "
              f"the board's); within 0.5 / 1 ms of true (of builds with a verdict), spread takes named within 1 ms and "
              f"advised, instant builds advised")
        verdicts = {}
        for gs in sys.argv[sys.argv.index("--grids") + 1].split(";"):
            g = [float(x) for x in gs.split(",")]
            for pk in ("parabola", "spline"):
                bt = verdicts.setdefault((gs, pk), {})
                w5, w1, good, spread, bad, inst, n = grid_score(builds, dense, g, pk, bt)
                print(f"  {gs:24} {pk:8}: within 0.5 ms {w5}/{n}, within 1 ms {w1}/{n}, named and advised "
                      f"{good}/{spread}, instant advised {bad}/{inst}")
        print("\nError measures, all builds with a verdict (the Pi's verdicts, rounded to 0.5 ms): builds off by more "
              "than 1 ms, mean absolute error, and the same on the spread takes alone")
        for (gs, pk), bt in verdicts.items():
            errs = [abs(x - ms) for ms, v in bt.items() for x in v]
            serrs = [abs(x - ms) for ms, v in bt.items() if ms for x in v]
            if errs:
                print(f"  {gs:24} {pk:8}: off by more than 1 ms {sum(e > 1.0 for e in errs)}/{len(errs)}, mean abs "
                      f"{sum(errs) / len(errs):.3f} ms; spread takes off by more than 1 ms "
                      f"{sum(e > 1.0 for e in serrs)}/{len(serrs)}, mean abs {sum(serrs) / max(1, len(serrs)):.3f} ms")
        print("\nBy take, parabola (the Pi's verdicts, rounded to 0.5 ms), each grid: within 0.5 ms, then the verdicts")
        for ms in sorted({b["take_ms"] for b in builds}):
            cells = []
            for (gs, pk), bt in verdicts.items():
                if pk == "parabola":
                    v = bt.get(ms, [])
                    cells.append(f"{gs}: {sum(abs(x - ms) <= 0.5 for x in v)}/{len(v)} "
                                 f"[{' '.join(f'{x:g}' for x in v)}]")
            print(f"  {ms:g} ms | " + " | ".join(cells))
        return
    out = sys.argv[sys.argv.index("--capture") + 1]
    lag = float(sys.argv[sys.argv.index("--lag") + 1]) if "--lag" in sys.argv else 0.45
    seed = int(sys.argv[sys.argv.index("--seed") + 1]) if "--seed" in sys.argv else 29
    only = int(sys.argv[sys.argv.index("--only") + 1]) if "--only" in sys.argv else None
    done = set()
    try:
        done = {tuple(r["build"]) for r in load(out)}
    except FileNotFoundError:
        pass
    takes = (tuple(float(x) for x in sys.argv[sys.argv.index("--takes") + 1].split(","))
             if "--takes" in sys.argv else TAKES_MS)
    grid = [(ti, ki, li, lag, seed) for ki in range(len(TACHS)) for ti in range(len(takes)) for li in range(3)]
    if "--tach" in sys.argv:            # 2026-11-19: one tach only (tests/take_blind_nine.py's jittery-tach sets)
        tk = int(sys.argv[sys.argv.index("--tach") + 1])
        grid = [g for g in grid if g[1] == tk]
    if only:
        grid = grid[:only]
    # --drill (2026-11-20, eval/take-straddle-count-2026-11-20.md): the survey drill to run instead of
    # drill.calibration.json, e.g. drill.survey-long.json (the same twelve shots, twice)
    drill = sys.argv[sys.argv.index("--drill") + 1] if "--drill" in sys.argv else None
    grid = [g + (takes, drill) for g in grid if g not in done]
    with multiprocessing.Pool(procs, maxtasksperchild=1) as pool:
        for a, r in pool.imap_unordered(capture, grid):
            if "aborted" in r:
                print(f"aborted {a}: {r['aborted']}", file=sys.stderr)
                continue
            print(f"  {a}: {len(r['board_scores'])} survey wheels, board {r['survey']}", file=sys.stderr, flush=True)
            with open(out, "a") as f:
                f.write(json.dumps(r) + "\n")


if __name__ == "__main__":
    main()
