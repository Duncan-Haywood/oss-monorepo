"""Does a take model with more parts, or four parts with the half-sine's own spread, remove the take fit's high
reading? (2026-11-18, firmware/esp32/README.md "The take fit's four parts and its high reading")

README "The take survey's pick between contact times" found that the take survey's own residual curve bottoms out
0.2-0.4 ms above the simulator's true half-sine take (dense least - true on the off-grid takes: +0.38 / +0.31 ms on
the capture tach, design / held out), and named the four-part take model (`controller.take_offsets`, four equal shares
at the quantile midpoints of the force profile) as the likely cause. The survey captures run the plant at 0.1 ms
steps (take_misfit_trace.capture_survey sets rf.FINE = 10), so the simulator's own step adds only 0.01/12 ms^2 to the
take's spread: the simulator is not the source.

WHY FOUR PARTS READ LONG. At first order a take spread over a revolution's few milliseconds reaches the periods
through its centre and its spread (its variance); the centre is symmetric for every model here, so the spread is
what a contact time is fitted against. The half-sine's variance is T^2 (1/4 - 2/pi^2) = 0.0474 T^2. Four equal
shares at the quantile midpoints (0.230, 0.420, 0.580, 0.770 of T) carry 0.0397 T^2: 16% less. To match a true
take's spread the fit needs a T about sqrt(0.0474 / 0.0397) = 1.093 times longer, about +0.4 ms at 4 ms. N equal
shares tend to the full variance as N grows (8: 0.0453, 16: 0.0468). A four-part model whose offsets are stretched
about T/2 by that ratio (`spread`) carries the full variance at the board's present cost (four steps a fit).

This refits every stored survey wheel (the rows of take_survey_pick, which keep each wheel's periods and ticks) at
every DENSE_US contact time with each MODELS entry in place of `controller.take_offsets(c)`, the rest of the board's
fit unchanged (take_fit.result, the board's TAKE_SURVEY_LEVELS), and reports per model:

- the dense least (the candidate whose sum over the wheels the board kept is least) against the true take, on the
  off-grid takes (1, 2.5, 3.5, 4.5, 5.5, 7 ms) and the on-grid check (3, 6 ms), per tach;
- the board's verdict had it surveyed the shipped grid with that model (take_survey_pick.grid_score: trim, blind rule,
  the parabola, the Pi's 0.5 ms rounding): within 0.5 / 1 ms, spread takes named within 1 ms and advised, instant
  builds advised.

The board's kept set is the shipped model's (the board scores in the rows), so every model is scored on the same wheels.

DESIGN SET (lag 0.45 s, seed 29; eval/take-parts-refit-2026-11-18.md): on the capture tach the shipped model's dense
least read the off-grid takes +0.38 ms high (12 of 18 within 0.25 ms); 8 parts -0.04 (16), 16 parts +0.04 (17, mean
absolute 0.04 ms), `spread` +0.03 (16) but its on-grid takes read -0.38 (3 ms: -0.65). The jittery tach reads high
for every model (+0.33 to +0.78). The board's verdict on the shipped grid: within 0.5 ms 35 (shipped) / 38 (spread) /
34 (8) / 38 (16) of 53-54; within 1 ms 47 / 46 / 47 / 48; named and advised 29 / 27 / 28 / 29; instant advised 0.

PREDICTION (written in this file before the design set ran, and committed before the held-out set was scored by any
model but the shipped one; the design set already fails the rule's within-1-ms clause for `spread`): on
the held-out rows (lag 0.6 s, seed 31), (a) the shipped four-part model's dense least reads the off-grid takes high on
the capture tach (mean signed > +0.15 ms) and `spread`'s mean signed error is closer to zero than the shipped model's;
(b) 16 parts' mean signed error is closer to zero than the shipped model's; (c) `spread` has at least as many builds
within 0.5 ms (the board's verdict on the shipped grid) as the shipped model, and no more instant builds advised.

DECISION RULE (written with the prediction): `controller.take_offsets` moves to the spread-matched offsets for the
half-sine only if, on the held-out set, (a) and (c) both hold and `spread` has at least as many builds within 1 ms as
the shipped model. More parts than four are not shipped on this evidence whatever they score (each part is a step in
every fit the board runs); they answer the question whether the bias is the model's.

HELD OUT (eval/take-parts-refit-2026-11-18.md): all clauses held. Capture tach: shipped +0.31 ms, spread -0.07, 16
parts 0.00; the board's verdict within 0.5 ms 41 (shipped) / 46 (spread) of 54, within 1 ms 54 / 54, instant advised 0
/ 0. By the rule `controller.take_offsets` now stretches the half-sine (TAKE_MATCH_SPREAD); the models here pass
match_spread=False and stretch by hand, so the script's results do not depend on that switch.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_parts_refit.py --score rows.jsonl.gz [--models 4,spread,8,16] [--procs 4]
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_parts_refit.py --drops eval/take-fit-2026-11-17.jsonl.gz

Simulated only: the simulator's half-sine take, first-order wheel, the two tachs of take_survey_pick, one seed per set.
"""

import math
import multiprocessing
import sys

import take_survey_pick as tsp

HALF_SINE_VAR = 0.25 - 2.0 / math.pi ** 2      # variance of the half-sine force profile on [0, 1]


def parts_var(xs):
    m = sum(xs) / len(xs)
    return sum((x - m) ** 2 for x in xs) / len(xs)


def spread_offsets(take_us, parts=4):
    """`parts` equal shares at the half-sine's quantile midpoints, stretched about the take's middle so that they carry
    the half-sine's own variance (0.0474 take^2) rather than the 0.0397 take^2 of the four midpoints."""
    from feeder_sim import controller
    base = controller.take_offsets(take_us, "halfsine", parts, match_spread=False)
    if not base:
        return ()
    xs = [b / take_us for b in base]
    k = math.sqrt(HALF_SINE_VAR / parts_var(xs))
    return tuple((0.5 + (x - 0.5) * k) * take_us for x in xs)


def offsets(model, c):
    from feeder_sim import controller
    if model == "spread":
        return spread_offsets(c)
    return controller.take_offsets(c, "halfsine", int(model), match_spread=False)


def dense_rows(args):
    """take_survey_pick.dense_rows with `model`'s offsets."""
    model, b = args
    import take_fit as tf
    from feeder_sim import controller
    levels = b.get("board_levels", controller.TAKE_SURVEY_LEVELS)
    out = []
    for w in b["wheels"]:
        ticks = [tuple(t) for t in w["ticks"]]
        row = []
        for c in tsp.DENSE_US:
            f = tf.result(w["periods"], ticks, {"take": offsets(model, c), "levels": levels})
            row.append(None if f is None else f[4])
        out.append(row)
    return (model, tuple(b["build"])), out


def dense_least(b, drows):
    """The dense least on the wheels the board kept (the shipped model's grid scores in the row), or None."""
    from feeder_sim import controller
    import take_misfit_trace as tm
    rs = controller.ResidualSurvey(tm.PICK_US, controller.TAKE_SURVEY_TRIM, controller.TAKE_SURVEY_BLIND)
    dsum = [0.0] * len(tsp.DENSE_US)
    for got, drow in zip(b["board_scores"], drows):
        if not got or any(g is None for g in got) or any(d is None for d in drow):
            continue
        before = rs.kept_n
        rs.add([g * g for g in got])
        if rs.kept_n > before:
            for i, d in enumerate(drow):
                dsum[i] += d * d
    if not rs.wheels:
        return None
    return tsp.DENSE_US[min(range(len(dsum)), key=lambda i: dsum[i])] / 1000


def drop_row(args):
    """reading / true drop for one take_fit row, per (model, contact time ms)."""
    x, cases = args
    import take_fit as tf
    out = {}
    for m, ms in cases:
        f = tf.result(x["periods"], [tuple(t) for t in x["ticks"]], {"take": offsets(m, ms * 1000)})
        out[f"{m}@{ms:g}"] = None if f is None else f[0] / x["true"]
    return out


def drops(path, procs):
    """The drop the board reads with each model, on tests/take_fit.py's stored wheel fits (wheel lag 0.3 s, seed 7,
    0.1 ms plant steps; half-sine 6 and 3 ms takes; each row keeps the simulator's true drop): at the true contact
    time, and at the time the model's own survey would name (4 parts: about 1.09 times longer)."""
    import statistics
    import unsure_weight as u
    rows = [x for x in tsp.load(path) if x["take"][0] == "halfsine" and x["rpm"] >= u.FLOOR]
    takes = sorted({x["take"][1] for x in rows}, reverse=True)
    cases = {}
    for ms in takes:
        k = math.sqrt(HALF_SINE_VAR / parts_var([o / 1000 for o in offsets("4", 1000)]))
        cases[ms] = [("4", ms), ("4", round(ms * k * 4) / 4), ("spread", ms), ("8", ms), ("16", ms)]
    with multiprocessing.Pool(procs) as pool:
        got = pool.map(drop_row, [(x, cases[x["take"][1]]) for x in rows])
    print(f"{len(rows)} wheel fits at {u.FLOOR:.0f} rpm and up (eval/take-fit-2026-11-17.jsonl.gz, half-sine takes); "
          f"reading / true drop: mean, sd, sd at 4,500 rpm and up")
    for ms in takes:
        for m, c in cases[ms]:
            key = f"{m}@{c:g}"
            rs = [g[key] for x, g in zip(rows, got) if x["take"][1] == ms and g.get(key) is not None]
            hi = [g[key] for x, g in zip(rows, got) if x["take"][1] == ms and x["rpm"] >= 4500 and g.get(key) is not None]
            print(f"  half-sine {ms:g} ms | model {m:6} at {c:g} ms | n {len(rs)} | {statistics.fmean(rs):.4f} | "
                  f"{100 * statistics.pstdev(rs):.2f}% | {100 * statistics.pstdev(hi):.2f}%")


def main():
    procs = int(sys.argv[sys.argv.index("--procs") + 1]) if "--procs" in sys.argv else multiprocessing.cpu_count()
    if "--drops" in sys.argv:
        return drops(sys.argv[sys.argv.index("--drops") + 1], procs)
    models = (sys.argv[sys.argv.index("--models") + 1] if "--models" in sys.argv else "4,spread,8,16").split(",")
    builds = sorted(tsp.load(sys.argv[sys.argv.index("--score") + 1]), key=lambda b: tuple(b["build"]))
    with multiprocessing.Pool(procs) as pool:
        dense = dict(pool.map(dense_rows, [(m, b) for m in models for b in builds]))
    lag, seed = builds[0]["build"][3], builds[0]["build"][4]
    print(f"{len(builds)} survey drills (wheel lag {lag} s, seed {seed}); dense refits every "
          f"{tsp.DENSE_US[1] / 1000:g} ms, 0-{tsp.DENSE_US[-1] / 1000:g} ms; kept wheels: the board's")
    for m in models:
        xs = [o / 4000 for o in offsets(m, 4000)]
        print(f"  model {m}: offsets / T = {', '.join(f'{x:.3f}' for x in xs)}; variance {parts_var(xs):.4f} T^2 "
              f"(half-sine {HALF_SINE_VAR:.4f})")
    print("\nDense least - true take, off-grid takes (1, 2.5, 3.5, 4.5, 5.5, 7 ms): signed mean / mean absolute; "
          "within 0.25 / 0.5 ms. On-grid (3, 6 ms): signed mean")
    print("model | tach | off-grid builds | signed / abs | within 0.25 / 0.5 | on-grid signed")
    for m in models:
        for ki, (tach, _) in enumerate(tsp.TACHS):
            off, on = [], []
            for b in builds:
                if b["build"][1] != ki or not b["take_ms"]:
                    continue
                dl = dense_least(b, dense[(m, tuple(b["build"]))])
                if dl is None:
                    continue
                (on if b["take_ms"] in (3.0, 6.0) else off).append(dl - b["take_ms"])
            if off:
                print(f"{m} | {tach} | {len(off)} | {sum(off) / len(off):+.2f} / "
                      f"{sum(abs(e) for e in off) / len(off):.2f} | {sum(abs(e) <= 0.25 + 1e-9 for e in off)} / "
                      f"{sum(abs(e) <= 0.5 + 1e-9 for e in off)} | "
                      f"{sum(on) / len(on) if on else float('nan'):+.2f}")
    print("\nBy take (both tachs), dense least - true, signed mean: " + " | ".join(models))
    for ms in tsp.TAKES_MS:
        if not ms:
            continue
        cells = []
        for m in models:
            e = [dl - ms for b in builds if b["take_ms"] == ms
                 for dl in [dense_least(b, dense[(m, tuple(b["build"]))])] if dl is not None]
            cells.append(f"{sum(e) / len(e):+.2f}" if e else "-")
        print(f"  {ms:g} ms: " + " | ".join(cells))
    print("\nThe board's verdict on the shipped grid (0,2,3,4,5,6,8 ms) with each model, parabola, rounded to 0.5 ms:")
    for m in models:
        md = {k[1]: v for k, v in dense.items() if k[0] == m}
        w5, w1, good, spread, bad, inst, n = tsp.grid_score(builds, md, [0, 2, 3, 4, 5, 6, 8], "parabola")
        print(f"  {m:7}: within 0.5 ms {w5}/{n}, within 1 ms {w1}/{n}, named and advised {good}/{spread}, "
              f"instant advised {bad}/{inst}")


if __name__ == "__main__":
    main()
