"""Why do several take candidates reach one residual? (2026-11-18, firmware/esp32/README.md "Take-blind rows traced")

README "Periods finer than a microsecond" found that on the take survey's wheels several contact-time candidates
(0 ms and 6 ms alike) reach the identical residual to four digits. The suspicion traced here is arithmetic, not a bug:
the fit sees a wheel only through each revolution's mean speed. A take's parts that all land inside one revolution
slow that revolution's mean by the mean of (b - t_i) / p over the parts (b its end, p its length), which is the same,
to first order in p / tau, as one step at their mean time; every later revolution sees the sum of e^(t_i / tau), the
same step again to order (take / tau)^2. So whenever the fit can place a candidate's whole take inside one revolution,
that candidate's column is the step's column moved by its mean offset, and its residual is the step's. Only a take
that must straddle a revolution's edge differs, and only through how it splits.

Capture: one build per call (take_misfit_trace.capture_survey), every take-survey wheel's inputs as the board passed
them. Trace: each wheel refitted at every candidate as the board fits it (TAKE_SURVEY_LEVELS, TAKE_SURVEY_AFTER),
through a copy of drop_from_commands_steps that also returns its t0, so each candidate's parts can be placed against
the revolution edges.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_blind_trace.py --capture OUT.json TAKE PLANT LAUNCHER LAG SEED [--sub N] [--tach-capture]
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_blind_trace.py --trace OUT.json [OUT2.json ...]
"""
import inspect
import json
import sys


def capture(out, ti, pi, li, lag, seed, sub, cap):
    import min_fit_heldout as h
    import take_misfit_trace as tm
    import take_survey_sweep as tss
    tss.SEED = seed
    plants = list(h.PLANTS)
    if cap or sub != 1:
        plants[pi] = (plants[pi][0], dict(plants[pi][1], tach_jitter_us=0.0, tach_capture=True, tach_capture_sub=sub))
    h.PLANTS = tuple(plants)
    a, r = tm.capture_survey((ti, pi, li, lag))
    r["build"] = [ti, pi, li, lag, seed, sub]
    with open(out, "w") as f:
        json.dump(r, f)
    print(f"{out}: {len(r.get('wheels', []))} wheels, board {r.get('survey')}", file=sys.stderr)


def _fit_with_t0():
    """drop_from_commands_steps with t0 and the revolution edges T appended to its result."""
    import take_misfit_trace  # noqa: F401  (puts controller on the path)
    import controller
    src = inspect.getsource(controller.drop_from_commands_steps)
    old = 'yield ("fit", (drop, w0 * before * 60e6, j1 - k + 1, tau, rms, se, dw, edge))'
    assert src.count(old) == 1
    src = src.replace(old, 'yield ("fit", (drop, w0 * before * 60e6, j1 - k + 1, tau, rms, se, dw, t0, T, k, edge))')
    src = src.replace("def drop_from_commands_steps(", "def _traced(", 1)
    ns = dict(vars(controller))
    exec(compile(src, "controller_traced", "exec"), ns)
    return ns["_traced"]


def placement(T, t0, offs):
    """Revolution index of each part of a take starting at t0 (offsets us)."""
    out = []
    for off in offs or (0.0,):
        t = t0 + off
        j = 0
        while j + 1 < len(T) and T[j + 1] <= t:
            j += 1
        out.append(j)
    return out


def trace(paths):
    import take_misfit_trace as tm
    import controller  # (on the path once take_misfit_trace is imported)
    import take_survey_sweep as tss
    fit = _fit_with_t0()
    grid = tm.PICK_US
    tot = {"wheels": 0, "one_rev": 0, "one_rev_tied": 0, "straddle": 0, "straddle_tied": 0}
    tie_rel = 1e-3          # "identical to four digits": residuals within 0.1% of the step's
    for path in paths:
        b = json.load(open(path))
        ti = b["build"][0]
        name, take_ms, _ = tss.TAKES[ti]
        print(f"\n## {path}: build {b['build']} ({name}), board survey {b.get('survey')}")
        print("wheel | per candidate (ms): rms ppm, revolutions its parts fall in relative to the anchor k, t0+mean "
              "offset - step t0 (us)")
        for wi, w in enumerate(b["wheels"]):
            ticks = [tuple(t) for t in w["ticks"]]
            rows = []
            for c in grid:
                offs = controller.take_offsets(c)
                res = None
                for item in fit(w["periods"], ticks, take=offs, levels=controller.TAKE_SURVEY_LEVELS,
                                after=controller.TAKE_SURVEY_AFTER):
                    if item is not None:
                        res = item[1]
                if res is None:
                    rows.append(None)
                    continue
                T, k, t0 = res[8], res[9], res[7]
                pl = [j - k for j in placement(T, t0, offs)]
                mean_off = sum(offs) / len(offs) if offs else 0.0
                rows.append((res[4], pl, t0 + mean_off, t0, T, k))
            if any(r is None for r in rows):
                continue
            step = rows[0]
            cells = []
            for c, r in zip(grid, rows):
                one = len(set(r[1])) == 1
                tied = abs(r[0] - step[0]) <= tie_rel * step[0]
                if c:
                    tot["one_rev" if one else "straddle"] += 1
                    tot[("one_rev" if one else "straddle") + "_tied"] += tied
                cells.append(f"{c / 1000:g}: {r[0] * 1e6:.0f}{'=' if tied and c else ''} "
                             f"[{','.join(f'{x:+d}' for x in sorted(set(r[1])))}] {r[2] - step[3]:+.0f}")
            tot["wheels"] += 1
            p = rows[0][4][rows[0][5] + 1] - rows[0][4][rows[0][5]]
            print(f"  {wi:2d} (rev {p:.0f} us) | " + " | ".join(cells))
    n1, n2 = tot["one_rev"], tot["straddle"]
    print(f"\nSpread candidates on {tot['wheels']} wheels: whole take inside one revolution {n1}, of them tied with the "
          f"step (rms within {tie_rel:.1%}) {tot['one_rev_tied']}; straddling an edge {n2}, of them tied "
          f"{tot['straddle_tied']}.")
    return tot


if __name__ == "__main__":
    if "--capture" in sys.argv:
        i = sys.argv.index("--capture")
        out, ti, pi, li, lag, seed = sys.argv[i + 1:i + 7]
        sub = int(sys.argv[sys.argv.index("--sub") + 1]) if "--sub" in sys.argv else 1
        capture(out, int(ti), int(pi), int(li), float(lag), int(seed), sub, "--tach-capture" in sys.argv)
    else:
        trace(sys.argv[sys.argv.index("--trace") + 1:])
