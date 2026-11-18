"""Does the take survey gain from a longer window, as the record's drop fit did? (2026-11-18, firmware/esp32/README.md
"The take survey's window").

README "The record's drop fit and its window" moved the record fit to 24 revolutions after the ball's anchor
(controller.LOOP_FIT_AFTER), because on a jittery tach the longer window averaged the edge noise (held out: rms 0.62% to
0.47% on the jitter builds). The take survey (LaunchCheck._take_survey) still refits at drop_from_commands_steps'
default of 8, and every take-survey measurement so far ran on noise-free plants only. A longer window has two pulls on
it here: more rows average the tach's noise (the jitter wheels' rms is their noise floor, and every candidate shares
it, so noise blurs which candidate wins), but the take's effect sits in the first revolutions after the ball, so extra
rows where every candidate fits alike pull each candidate's rms toward the others' and the best / step share toward 1,
which the advice's margin (host.TAKE_ADVISE_RATIO, 0.6) reads as "keep 0".

This keeps each survey wheel's inputs exactly as the board passed them (tests/take_misfit_trace.py capture_survey) and
refits every wheel offline at the board's grid and depth (controller.TAKE_SURVEY_GRID_US, TAKE_SURVEY_LEVELS) with 8,
12, 16 and 24 revolutions after the anchor, scored by the board's own trimmed sums, refinement and margin.

Builds: take_survey_sweep's four takes (instant, half-sine 3 ms, half-sine 6 ms, front-loaded 4 ms) on three plants of
tests/min_fit_heldout.py (first-order 8k, tach 3 us jitter 10k, ESC 50 ms told), its three launchers; design at wheel
lag 0.3 s, seed 7 (36 survey drills); held out at lag 0.45 s, seed 11 (36).

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_window.py --capture rows.jsonl [--lag 0.3] [--seed 7] [--procs 4]
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_window.py --score rows.jsonl[.gz] [--procs 4]

Simulated only: the simulator's first-order wheel and ESC, its Gaussian edge jitter, an assumed take profile, one seed.
"""

import gzip
import json
import multiprocessing
import sys

import take_fit as tf
import take_misfit_trace as tm
from feeder_sim import controller

AFTERS = (8, 12, 16, 24)
PLANTS = (0, 1, 2)          # min_fit_heldout.PLANTS: first-order 8k, tach 3 us 10k, ESC 50 ms told


def capture(args):
    ti, pi, li, lag, seed = args
    import take_survey_sweep as tss
    tss.SEED = seed
    a, r = tm.capture_survey((ti, pi, li, lag))
    if "build" in r:
        r["build"] = [ti, pi, li, lag, seed]
    return (ti, pi, li, lag, seed), r


def refit(b):
    """Every wheel of one survey drill refitted at each window: {after: survey_score}."""
    out = {}
    for after in AFTERS:
        got = []
        for w in b["wheels"]:
            if after == 8:
                got.append(w["board"])
                continue
            ticks = [tuple(t) for t in w["ticks"]]
            row = []
            for c in tm.PICK_US:
                f = tf.result(w["periods"], ticks, {"take": controller.take_offsets(c),
                                                    "levels": controller.TAKE_SURVEY_LEVELS, "after": after})
                row.append(None if f is None else f[4])
            got.append(row)
        out[after] = tm.survey_score(got)
    return b["build"], out


def score(builds, procs):
    import min_fit_heldout as h
    import take_survey_sweep as tss
    from tennisbots import host
    with multiprocessing.Pool(procs) as pool:
        scored = dict((tuple(k), v) for k, v in pool.map(refit, builds))
    ratio = host.TAKE_ADVISE_RATIO
    lag, seed = builds[0]["build"][3], builds[0]["build"][4]
    print(f"{len(builds)} survey drills (wheel lag {lag} s, seed {seed}); each build's pick (refined, to 0.5 ms), best / "
          f"step share and the advice (advised when the share is at most {ratio}) per window (revolutions after the "
          f"anchor; 8 is the board's, its own sums)")
    for b in sorted(scored, key=lambda k: (k[1], k[0], k[2])):
        cells = []
        for after in AFTERS:
            s = scored[b][after]
            if s is None:
                cells.append(f"{after:2}: -")
                continue
            adv = "adv" if s[3] <= ratio else "  0"
            cells.append(f"{after:2}: {round(2 * s[1]) / 2:3g} ms {s[3]:.2f} {adv}")
        print(f"  {tss.TAKES[b[0]][0]:13} {h.PLANTS[b[1]][0]:15} launcher {b[2]} | " + " | ".join(cells))
    print("\nPer plant and take (3 launchers): picks; advised; within 1 ms of the true take (instant: 1 ms or less)")
    totals = {a: [0, 0, 0, 0] for a in AFTERS}     # right-and-advised spread, wrongly advised instant, within 1 ms, n
    for pi in PLANTS:
        for ti, (name, ms, _) in enumerate(tss.TAKES):
            sub = [scored[b] for b in scored if b[1] == pi and b[0] == ti]
            if not sub:
                continue
            cells = []
            for after in AFTERS:
                ss = [s[after] for s in sub if s[after] is not None]
                picks = [round(2 * s[1]) / 2 for s in ss]
                adv = [s[3] <= ratio for s in ss]
                within = sum(abs(p - ms) <= 1.0 for p in picks)
                t = totals[after]
                t[2] += within
                t[3] += len(ss)
                if ms:
                    t[0] += sum(a and abs(p - ms) <= 1.0 for p, a in zip(picks, adv))
                else:
                    t[1] += sum(adv)
                cells.append(f"{after:2}: {sorted(picks)} adv {sum(adv)} in {within}")
            print(f"  {h.PLANTS[pi][0]:15} {name:13} | " + " | ".join(cells))
    print("\nAll builds: spread takes named within 1 ms and advised; instant builds advised (a wrong re-flash); "
          "picks within 1 ms")
    for after in AFTERS:
        t = totals[after]
        print(f"  after {after:2}: named and advised {t[0]}, instant advised {t[1]}, within 1 ms {t[2]} of {t[3]}")
    print("\nMean best / step share on the spread takes, per plant (lower = a clearer pick)")
    for pi in PLANTS:
        cells = []
        for after in AFTERS:
            ss = [scored[b][after] for b in scored if b[1] == pi and tss.TAKES[b[0]][1] and scored[b][after]]
            cells.append(f"{after:2}: {sum(s[3] for s in ss) / max(1, len(ss)):.2f}")
        print(f"  {h.PLANTS[pi][0]:15} | " + " | ".join(cells))


def main():
    procs = int(sys.argv[sys.argv.index("--procs") + 1]) if "--procs" in sys.argv else multiprocessing.cpu_count()
    if "--score" in sys.argv:
        path = sys.argv[sys.argv.index("--score") + 1]
        with (gzip.open(path, "rt") if path.endswith(".gz") else open(path)) as f:
            return score([json.loads(line) for line in f], procs)
    out = sys.argv[sys.argv.index("--capture") + 1]
    lag = float(sys.argv[sys.argv.index("--lag") + 1]) if "--lag" in sys.argv else 0.3
    seed = int(sys.argv[sys.argv.index("--seed") + 1]) if "--seed" in sys.argv else 7
    done = set()
    try:
        with open(out) as f:
            done = {tuple(json.loads(line)["build"]) for line in f}
    except FileNotFoundError:
        pass
    grid = [(ti, pi, li, lag, seed) for pi in PLANTS for ti in range(4) for li in range(3)]
    grid = [g for g in grid if g not in done]
    with multiprocessing.Pool(procs, maxtasksperchild=1) as pool:
        for a, r in pool.imap_unordered(capture, grid):
            if "aborted" in r:
                print(f"aborted {a}: {r['aborted']}", file=sys.stderr)
                continue
            print(f"  {a}: {len(r['wheels'])} survey wheels, board {r['survey']}", file=sys.stderr, flush=True)
            with open(out, "a") as f:
                f.write(json.dumps(r) + "\n")


if __name__ == "__main__":
    main()
