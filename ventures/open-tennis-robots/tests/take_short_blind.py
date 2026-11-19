"""Is the take survey blind under 2.5 ms, or is its pick? (2026-11-19, firmware/esp32/README.md "Short takes: the
fit sees them, the grid's end does not")

On sets J to L (eval/take-grid-eight-2026-11-19.md) every build off by more than 1 ms had a take of 2.35 ms or less:
1.5 ms takes read 0 on five of six builds a set, 2.35 ms read 1-2. The same builds missed on every grid tried, so the
README called the misses "the fit's". This script separates the two places they could come from, from the dense
refits alone (no new capture):

  fit    each surveyed wheel's residual against the contact time (take_fit.result at every DENSE_US point, the
         board's depth and offsets) bottoms out near 0 for a 1.5 ms take: the four-part fit cannot tell a short take
         from an instant one, and no pick can fix it.
  pick   the summed curve bottoms out near the true take, but the grid's first two points (0 and 2 ms) straddle it
         and `survey_pick` / `survey_spline_pick` return a grid end as it stands: when the 0 ms sum is least the
         verdict is 0, whatever the 2 and 3 ms sums say.

Per build it prints the summed dense curve's least (the wheels the board keeps on the shipped grid, its blind rule
and trim), the least on the shipped grid, the shipped parabola's verdict, and a candidate end refinement
(`end_pick`: when the least grid sum is the first, a parabola through the first three sums, in the take, with its
vertex kept inside [grid[0], grid[1]]).

PREDICTION (written before the dense curves were printed): (a) on 1.5 ms takes the summed dense least is within
0.5 ms of the true take on at least 12 of the 18 builds (the fit sees them); (b) on those builds the shipped grid's
least sum is at 0 ms.

DECISION RULE (written with the prediction): `end_pick` is a candidate for the board only if, on J to L together
against the shipped parabola, it has at least 6 more builds within 0.5 ms of true, no more builds off by more than
1 ms, no instant build moved off 0 by more than 0.5 ms, and no set worse within 0.5 ms. Passing makes it a candidate
for a fresh capture (sets it was not chosen on), not a board change.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_short_blind.py --dense out.jsonl.gz rows-j.jsonl.gz [rows-k ...]
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_short_blind.py --report out.jsonl.gz

Simulated only, as the captures are.
"""

import gzip
import json
import multiprocessing
import sys

import take_survey_pick as tsp


def load(path):
    return tsp.load(path)


def dense_one(b):
    key, rows = tsp.dense_rows(b)
    return {"build": list(key), "take_ms": b["take_ms"], "dense": rows}


def end_pick(grid, sums):
    """The shipped parabola, except at the grid's first point: a parabola through the first three sums (in the take,
    not its log, since grid[0] is 0) whose vertex, when it opens upward, is kept inside [grid[0], grid[1]]."""
    from feeder_sim import controller
    i, ref = controller.survey_pick(grid, sums)
    if i != 0 or len(grid) < 3:
        return i, ref
    x0, x1, x2 = grid[0], grid[1], grid[2]
    y0, y1, y2 = sums[0], sums[1], sums[2]
    # divided differences
    d01 = (y1 - y0) / (x1 - x0)
    d12 = (y2 - y1) / (x2 - x1)
    a = (d12 - d01) / (x2 - x0)
    if a <= 0:
        return i, float(x0)
    v = (x0 + x1) / 2 - d01 / (2 * a)
    return i, float(min(max(v, x0), x1))


def verdicts(rows, grid_us, pick):
    """Per build: (take, verdict rounded to 0.5 ms as the Pi rounds it, summed dense least ms, shipped-grid least ms)."""
    from feeder_sim import controller
    idx = [tsp.DENSE_US.index(g) for g in grid_us]
    out = []
    for b in rows:
        rs = controller.ResidualSurvey(grid_us, controller.TAKE_SURVEY_TRIM, controller.TAKE_SURVEY_BLIND)
        kept = []
        for d in b["dense"]:
            if all(d[i] is not None for i in idx) and all(x is not None for x in d):
                before = rs.kept_n
                rs.add([d[i] * d[i] for i in idx])
                if rs.kept_n > before:
                    kept.append(d)
        if not rs.wheels:
            continue
        sums = rs.sums()
        dsum = [sum(d[k] * d[k] for d in kept) for k in range(len(tsp.DENSE_US))]
        dl = tsp.DENSE_US[min(range(len(dsum)), key=dsum.__getitem__)] / 1000
        gi = min(range(len(sums)), key=sums.__getitem__)
        _, ref = pick(grid_us, sums)
        out.append((b["take_ms"], round(2 * ref / 1000) / 2, dl, grid_us[gi] / 1000, tuple(b["build"]),
                    [x / dsum[0] if dsum[0] else 1.0 for x in dsum[:13]], len(kept)))
    return out


def report(rows):
    from feeder_sim import controller
    grid = list(controller.TAKE_SURVEY_GRID_US)
    print(f"{len(rows)} survey drills; shipped grid {', '.join(f'{g / 1000:g}' for g in grid)} ms, trim "
          f"{controller.TAKE_SURVEY_TRIM}, blind {controller.TAKE_SURVEY_BLIND}; dense refits every "
          f"{tsp.DENSE_US[1] / 1000:g} ms")
    par = verdicts(rows, grid, controller.survey_pick)
    end = verdicts(rows, grid, end_pick)
    print("\nShort takes (2.5 ms or less): take | set seed | tach | launcher | kept | summed dense least | grid least | "
          "parabola | end_pick | summed curve 0-3 ms / its value at 0")
    for p, e in zip(par, end):
        if p[0] <= 2.5:
            curve = " ".join(f"{x:.2f}" for x in p[5])
            print(f"  {p[0]:g} | {p[4][4]} | {tsp.TACHS[p[4][1]][0]} | {p[4][2]} | {p[6]} | {p[2]:g} | {p[3]:g} | "
                  f"{p[1]:g} | {e[1]:g} | {curve}")
    for label, sel in (("all", lambda t: True), ("1.5 ms", lambda t: abs(t - 1.5) < 1e-9),
                       ("2.35 ms", lambda t: abs(t - 2.35) < 1e-9)):
        ps = [p for p in par if sel(p[0])]
        if ps:
            print(f"\n{label}: summed dense least within 0.5 ms of true {sum(abs(p[2] - p[0]) <= 0.5 + 1e-9 for p in ps)}"
                  f"/{len(ps)}; grid least at 0 {sum(p[3] == 0 for p in ps)}/{len(ps)}")
    print("\nVerdicts per set (within 0.5 ms / off by more than 1 ms / mean abs error ms / instant builds off 0 by "
          "more than 0.5 ms):")
    seeds = sorted({p[4][4] for p in par})
    tot = {}
    for name, vs in (("parabola", par), ("end_pick", end)):
        for s in seeds + ["all"]:
            v = [x for x in vs if s == "all" or x[4][4] == s]
            w5 = sum(abs(x[1] - x[0]) <= 0.5 + 1e-9 for x in v)
            off = sum(abs(x[1] - x[0]) > 1.0 + 1e-9 for x in v)
            mae = sum(abs(x[1] - x[0]) for x in v) / len(v)
            inst = sum(x[0] == 0 and abs(x[1]) > 0.5 for x in v)
            tot[(name, s)] = (w5, off, mae, inst)
            print(f"  {name:8} seed {s}: {w5}/{len(v)} / {off} / {mae:.3f} / {inst}")
    print("\nBy take, end_pick verdicts against the parabola's:")
    for t in sorted({p[0] for p in par}):
        a = [f"{p[1]:g}" for p in par if p[0] == t]
        b = [f"{e[1]:g}" for e in end if e[0] == t]
        print(f"  {t:g} ms | parabola [{' '.join(a)}] | end_pick [{' '.join(b)}]")
    gain = tot[("end_pick", "all")][0] - tot[("parabola", "all")][0]
    rule = (gain >= 6 and tot[("end_pick", "all")][1] <= tot[("parabola", "all")][1]
            and tot[("end_pick", "all")][3] == 0
            and all(tot[("end_pick", s)][0] >= tot[("parabola", s)][0] for s in seeds))
    print(f"\nDecision rule: within 0.5 ms {gain:+d} (needs +6), off by more than 1 ms "
          f"{tot[('end_pick', 'all')][1]} vs {tot[('parabola', 'all')][1]}, instant moved "
          f"{tot[('end_pick', 'all')][3]}, no set worse "
          f"{all(tot[('end_pick', s)][0] >= tot[('parabola', s)][0] for s in seeds)}: "
          f"{'CANDIDATE for a fresh capture' if rule else 'not a candidate'}")


def main():
    if "--dense" in sys.argv:
        i = sys.argv.index("--dense")
        out, ins = sys.argv[i + 1], sys.argv[i + 2:]
        builds = [b for p in ins for b in load(p)]
        with multiprocessing.Pool() as pool:
            rows = pool.map(dense_one, builds)
        with gzip.open(out, "wt") as f:
            for r in rows:
                r["dense"] = [[None if x is None else round(x, 3) for x in d] for d in r["dense"]]
                f.write(json.dumps(r) + "\n")
        return
    report(load(sys.argv[sys.argv.index("--report") + 1]))


if __name__ == "__main__":
    main()
