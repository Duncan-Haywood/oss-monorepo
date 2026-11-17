"""Where the noise-free plants' reading error comes from (2026-11-17, firmware/esp32/README.md "The spin error was
there without the jitter").

"Unsure marks on the noisy wheels" read the jittery tach's 0.57% spin error as jitter: with every reading replaced by
its true drop the fit's error fell to 0.03%. But the same run's first-order and ESC 50 ms plants, which draw no random
numbers, had 0.58% and 0.53%, and their readings still scatter 0.27-0.32% (sd) about the true drop with no bias. So
the floor is not the jitter. Two candidates for the scatter on a noise-free plant:

  (a) the tach's 1 us timer: the simulator times each edge to a whole microsecond (`int(frac * 1000)`), as the
      ESP32's ticks_us does. A 3% drop on a 12 ms revolution is about 360 us, so 0.3 us of rounding per edge is about
      0.1% of the drop per period;
  (b) the loop fit's model against the simulator's physics (1 ms steps, the ball's take at a step boundary).

The test: rerun the same builds with the simulator's edges timed exactly (float microseconds), everything else as
shipped. PREDICTION, written before the run: if (a), the readings' sd falls by more than half and so does the spin
error; then the 1 us timer is the floor on a real board too and the next step is a fit that averages it. If the sd
stays within a quarter of where it was, it is (b), a property of the simulator or the model, and lowering per-reading
noise on the board cannot win it.

Builds: min_fit_heldout's three launchers and two wheel lags on the first-order 8k and ESC 50 ms told plants (no
random draws, so one seed), calibration drill plus the held-out slow drill, hold mode, as tests/unsure_weight.py.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/reading_floor.py [--raw out.jsonl]
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/reading_floor.py --oracle eval/unsure-weight-2026-11-17.jsonl

`--oracle` runs nothing: it reads unsure_weight's saved rows and prints, per plant, the fit with every reading, the
calibration drill's or the slow drill's readings replaced by their true drops (where the error sits).
"""

import json
import multiprocessing
import statistics
import sys

import feeder_sim
import min_fit_heldout as h
import unsure_weight as u

PLANTS = (0, 2)
MODES = ("1 us timer", "exact edges")
SEED = 7


def case(args):
    pi, tau, li, mode = args
    if mode == MODES[1]:
        feeder_sim.SimFeeder.run_ms = _make_exact()
    _, r = u.case((pi, tau, li, SEED))
    return args, r


def _make_exact():
    """SimFeeder.run_ms with the tach edge timed to the exact (float) microsecond: the shipped source with its one
    `int(frac * 1000)` replaced, so the rest of the step stays the simulator's own."""
    import inspect
    import textwrap
    src = textwrap.dedent(inspect.getsource(feeder_sim.SimFeeder.run_ms))
    old = "self.us = t0 + int(frac * 1000)"
    assert old in src, "feeder_sim's edge timing changed"
    src = src.replace(old, "self.us = t0 + frac * 1000")
    ns = {}
    exec(compile(src, feeder_sim.__file__, "exec"), vars(feeder_sim), ns)
    return ns["run_ms"]


def oracle(path):
    done = {}
    with open(path) as f:
        for line in f:
            k, r = json.loads(line)
            done[tuple(k)] = r
    ok = [g for g in done if "wheels" in done[g]]
    print(f"{len(ok)} builds from {path}: spin efficiency error with some readings replaced by their true drops")
    for pi, (pname, _) in enumerate(h.PLANTS):
        for lab, which in (("as read", lambda w: False), ("every reading true", lambda w: True),
                           ("calibration drill true", lambda w: w["drill"] == "calibration"),
                           ("slow drill true", lambda w: w["drill"] == "slow")):
            es = [u.oracle_errors(done[g], g[2], which) for g in ok if g[0] == pi]
            print(f"  {pname:16} {lab:24} speed {100 * statistics.fmean(e[0] for e in es):.2f}%, spin mean "
                  f"{100 * statistics.fmean(e[1] for e in es):.2f}%, worst {100 * max(e[1] for e in es):.2f}% "
                  f"({len(es)} builds)")
        rs = [w["ratio"] for g in ok if g[0] == pi for w in done[g]["wheels"] if w["rpm"] >= u.FLOOR]
        print(f"  {pname:16} readings at {u.FLOOR:.0f} rpm and up: mean {statistics.fmean(rs):.4f} of the true drop, "
              f"sd {100 * statistics.pstdev(rs):.2f}%")


def main():
    if "--oracle" in sys.argv:
        return oracle(sys.argv[sys.argv.index("--oracle") + 1])
    raw = sys.argv[sys.argv.index("--raw") + 1] if "--raw" in sys.argv else None
    grid = [(pi, tau, li, mode) for mode in MODES for pi in PLANTS for tau in h.LAGS for li in range(len(h.LAUNCHERS))]
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
    with multiprocessing.Pool(multiprocessing.cpu_count(), maxtasksperchild=1) as pool:
        for a, r in pool.imap_unordered(case, todo):
            done[tuple(a)] = r
            print(f"  {a}: {'aborted ' + r['aborted'] if 'aborted' in r else 'done'}", file=sys.stderr, flush=True)
            if raw:
                with open(raw, "a") as f:
                    f.write(json.dumps([list(a), r]) + "\n")
    ok = [g for g in grid if "wheels" in done[tuple(g)]]
    for g in grid:
        if "aborted" in done[tuple(g)]:
            print(f"aborted: {g}: {done[tuple(g)]['aborted']}")
    print(f"{len(ok)} of {len(grid)} builds ran (calibration drill + held-out slow drill, hold mode, seed {SEED})")
    print(f"\n{'plant':16} {'edges':12} | {'wheels':>6} {'mean':>7} {'sd':>6} {'>1% off':>7} | "
          f"{'speed err':>9} {'spin mean':>9} {'spin worst':>10} | {'spin, true drops':>16}")
    for pi in PLANTS:
        for mode in MODES:
            gs = [g for g in ok if g[0] == pi and g[3] == mode]
            ws = [w for g in gs for w in done[tuple(g)]["wheels"] if w["rpm"] >= u.FLOOR]
            if not ws:
                continue
            rs = [w["ratio"] for w in ws]
            es = [u.fit_errors(done[tuple(g)]["log"], g[2], 1.0) for g in gs]
            es = [e for e in es if e is not None]
            ts = [u.oracle_errors(done[tuple(g)], g[2], lambda w: True) for g in gs]
            print(f"{h.PLANTS[pi][0]:16} {mode:12} | {len(ws):6d} {statistics.fmean(rs):7.4f} "
                  f"{100 * statistics.pstdev(rs):5.2f}% {sum(abs(q - 1) > 0.01 for q in rs):7d} | "
                  f"{100 * statistics.fmean(e[0] for e in es):8.2f}% {100 * statistics.fmean(e[1] for e in es):8.2f}% "
                  f"{100 * max(e[1] for e in es):9.2f}% | {100 * statistics.fmean(t[1] for t in ts):15.2f}%")
    print("\nBy speed band (all plants): reading sd, 1 us timer / exact edges")
    for lo, hi in ((1000, 2000), (2000, 3000), (3000, 4500), (4500, 9000)):
        row = []
        for mode in MODES:
            rs = [w["ratio"] for g in ok if g[3] == mode for w in done[tuple(g)]["wheels"] if lo <= w["rpm"] < hi]
            row.append(f"{100 * statistics.pstdev(rs):.2f}% (n={len(rs)})" if len(rs) > 1 else "-")
        print(f"  {lo:5d}-{hi:<5d} rpm: {row[0]:>16} / {row[1]:>16}")


if __name__ == "__main__":
    main()
