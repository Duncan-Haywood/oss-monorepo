"""At what tach jitter does the take survey go blind? (2026-11-18, firmware/esp32/README.md "The take survey's jitter
limit").

README "The take survey's window" found that at 3 us of Gaussian edge jitter the survey cannot see a 3-6 ms contact
time at any window (best / step shares 0.84-1.00, so host.TAKE_ADVISE_RATIO's margin of 0.6 never advises), while on
the noise-free first-order plant it named and advised about half the spread takes. Between 0 and 3 us nothing was
measured, so a builder who logs a real tach and reads, say, 1.2 us cannot tell whether the survey will speak.

This runs the same survey drill (take_misfit_trace.capture_survey: the calibration drill with SURVEY_TAKE on, the
board's grid, depth and window of 8, controller.TAKE_SURVEY_AFTER) on the "tach 3 us 10k" plant of
tests/min_fit_heldout.py with its jitter replaced by 0, 0.5, 1, 1.5, 2 and 3 us (wheel_max_rpm 10000 throughout, so
the 0 us row is that plant without its noise), four takes (instant, half-sine 3 and 6 ms, front-loaded 4 ms) and the
three launchers: 72 survey drills per lag and seed. Scored by the board's own trimmed sums, refinement and margin
(take_misfit_trace.survey_score on the board's rms rows).

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_jitter.py --capture rows.jsonl [--lag 0.3] [--seed 7] [--procs 4]
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_jitter.py --score rows.jsonl[.gz]
    ... --capture rows.jsonl --tach-capture [--jitters 0,1.5,3]   # the edge times from the MCPWM capture

Simulated only: the simulator's first-order wheel, its Gaussian edge jitter rounded to whole microseconds (as the
board's micros() reads it), an assumed take profile, one seed per set.
"""

import gzip
import json
import multiprocessing
import sys

JITTERS = (0.0, 0.5, 1.0, 1.5, 2.0, 3.0)
TACH_PLANT = 1              # min_fit_heldout.PLANTS[1]: "tach 3 us 10k"
# --tach-capture (2026-11-18, README "A tach timed in hardware"): the same jitter on the handler's read, with the
# edge times from the MCPWM capture (feeder_sim tach_capture), so the jitter should no longer reach the survey.
TACH_CAPTURE = "--tach-capture" in sys.argv


def capture(args):
    ti, ji, li, lag, seed = args
    import min_fit_heldout as h
    import take_misfit_trace as tm
    import take_survey_sweep as tss
    tss.SEED = seed
    plants = list(h.PLANTS)
    plants[TACH_PLANT] = (f"tach {JITTERS[ji]:g} us 10k", dict(h.PLANTS[TACH_PLANT][1], tach_jitter_us=JITTERS[ji],
                                                                  tach_capture=TACH_CAPTURE))
    h.PLANTS = tuple(plants)
    a, r = tm.capture_survey((ti, TACH_PLANT, li, lag))
    if "aborted" not in r:
        r["build"] = [ti, ji, li, lag, seed]
        r["tach_capture"] = TACH_CAPTURE
        r["board_scores"] = [w["board"] for w in r["wheels"]]
        r.pop("wheels")             # the board's rms rows are all the score reads; drop the raw periods and ticks
    return (ti, ji, li, lag, seed), r


def score(builds):
    import take_misfit_trace as tm
    import take_survey_sweep as tss
    from tennisbots import host
    ratio = host.TAKE_ADVISE_RATIO
    lag, seed = builds[0]["build"][3], builds[0]["build"][4]
    scored = {tuple(b["build"]): tm.survey_score(b["board_scores"]) for b in builds}
    print(f"{len(builds)} survey drills (wheel lag {lag} s, seed {seed}), the board's window of 8; each build's pick "
          f"(refined, to 0.5 ms), best / step share and the advice (advised when the share is at most {ratio})")
    for ti, (name, ms, _) in enumerate(tss.TAKES):
        cells = []
        for ji, j in enumerate(JITTERS):
            row = []
            for li in range(3):
                s = scored.get((ti, ji, li, lag, seed))
                row.append("-" if s is None else
                           f"{round(2 * s[1]) / 2:g}/{s[3]:.2f}{'*' if s[3] <= ratio else ''}")
            cells.append(f"{j:g} us: " + " ".join(row))
        print(f"  {name:13} | " + " | ".join(cells))
    print("  (pick ms / share per launcher 0, 1, 2; * = advised)")
    print("\nPer jitter: spread takes named within 1 ms and advised (of 9); instant builds advised (of 3, a wrong "
          "re-flash); picks within 1 ms (of 12); mean best / step share on the spread takes")
    for ji, j in enumerate(JITTERS):
        good = bad = within = n = 0
        shares = []
        for ti, (name, ms, _) in enumerate(tss.TAKES):
            for li in range(3):
                s = scored.get((ti, ji, li, lag, seed))
                if s is None:
                    continue
                n += 1
                pick, adv = round(2 * s[1]) / 2, s[3] <= ratio
                within += abs(pick - ms) <= 1.0
                if ms:
                    good += adv and abs(pick - ms) <= 1.0
                    shares.append(s[3])
                else:
                    bad += adv
        print(f"  {j:3g} us: named and advised {good}, instant advised {bad}, within 1 ms {within} of {n}, "
              f"mean share {sum(shares) / max(1, len(shares)):.2f}")


def main():
    procs = int(sys.argv[sys.argv.index("--procs") + 1]) if "--procs" in sys.argv else multiprocessing.cpu_count()
    if "--score" in sys.argv:
        path = sys.argv[sys.argv.index("--score") + 1]
        with (gzip.open(path, "rt") if path.endswith(".gz") else open(path)) as f:
            return score([json.loads(line) for line in f])
    out = sys.argv[sys.argv.index("--capture") + 1]
    lag = float(sys.argv[sys.argv.index("--lag") + 1]) if "--lag" in sys.argv else 0.3
    seed = int(sys.argv[sys.argv.index("--seed") + 1]) if "--seed" in sys.argv else 7
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    done = set()
    try:
        with open(out) as f:
            done = {tuple(json.loads(line)["build"]) for line in f}
    except FileNotFoundError:
        pass
    jis = range(len(JITTERS))
    if "--jitters" in sys.argv:
        want = [float(x) for x in sys.argv[sys.argv.index("--jitters") + 1].split(",")]
        jis = [JITTERS.index(j) for j in want]
    grid = [(ti, ji, li, lag, seed) for ji in jis for ti in range(4) for li in range(3)]
    if only:
        grid = grid[:int(only)]
    grid = [g for g in grid if g not in done]
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
