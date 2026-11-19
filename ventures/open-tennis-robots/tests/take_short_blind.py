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

RESULT (J to L, eval/take-short-blind-2026-11-19.txt): (a) held: on 1.5 ms takes the summed dense least is within
0.5 ms of true on 13 of 18 builds (197 of 216 over every take), so the fit is not blind there. (b) half held: the grid
least sat at 0 on 8 of 18; on the other 10 it sat at 2 ms and the parabola read 1. At 2.35 ms the dense least is right
on 15 of 18, the grid least at 2 on 18, and the parabola reads 1-1.5 ms: the summed curve is a flat shelf from 0 to
about a millisecond below the take, then a valley, and a parabola through 0, 2 and 3 ms leans into the shelf.
`end_pick` failed its rule (within 0.5 ms 179 against 185; 10 instant builds moved off 0 against 3): on an instant
take the shelf is flat, so a vertex between 0 and 2 ms lands anywhere. Not a candidate.

PART 2, EXPLORATORY then held out. After the result above, on J to L (so chosen on them), other grids scored with the
shipped parabola: every millisecond 188 within 0.5 ms / 13 off by more than 1 ms; 0, 1.5, 2.5, 3-8 ms 196 / 9; 0,
0.5-3 by 0.5, 4-8 ms 195 / 9; the shipped grid 185 / 16 (instant builds moved 3 on each). The 1.5 and 2.5 ms points
sit on the shelf's edge for the takes that miss, and cost one candidate more than the shipped grid (nine, as the
every-millisecond grid would).

PREDICTION (written before set M was captured): on set M (wheel lag 0.55 s, seed 97; takes stratified under 3 ms,
where the candidate grid can change a verdict: 0, 0.3, 0.8, 1.2, 1.7, 2.1, 2.6, 2.9 ms, and 3.6, 5.4, 6.8 ms as
checks), the candidate grid 0, 1.5, 2.5, 3, 4, 5, 6, 7, 8 ms with the shipped parabola has more builds within 0.5 ms
than the shipped grid, and fewer builds off by more than 1 ms.

DECISION RULE (written with the prediction): `TAKE_SURVEY_GRID_US` moves to the candidate grid only if, on set M, it
has at least 4 more builds within 0.5 ms of true, no more builds off by more than 1 ms, no more instant builds read
more than 0.5 ms off 0, and on the 3.6-6.8 ms checks no fewer builds within 0.5 ms. Otherwise the shipped grid stays,
and the candidate goes to NEXT.md with M's numbers.

RESULT (set M, eval/take-short-m-2026-11-19.txt): within 0.5 ms 48 of 66 against 41, off by more than 1 ms 3 against
11, checks 18 each, but one instant build read 0.80 ms (share 0.99, not advised) where the shipped grid read 0: the
instant clause failed, so the shipped grid stays. The next test is a fresh set with that clause written on advice.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_short_blind.py --compare dense-m.jsonl.gz "0,2,3,4,5,6,7,8" "0,1.5,2.5,3,4,5,6,7,8"

PART 3, a second held-out set with the instant clause written on advice (2026-11-19, written after set M's result and
before set N was captured; M cannot count toward it).

PREDICTION (written before set N was captured): on set N (wheel lag 0.62 s, seed 101, neither used by an earlier take
capture; takes stratified under 3 ms at points M did not use: 0.2, 0.6, 1.0, 1.4, 1.9, 2.3, 2.75 ms, plus 3.3, 4.6,
7.4 ms as checks and 0, six builds each (two tachs, three launchers): 66 drills), the candidate grid 0, 1.5, 2.5, 3,
4, 5, 6, 7, 8 ms with the shipped parabola has more builds within 0.5 ms of true than the shipped grid and fewer off
by more than 1 ms.

DECISION RULE (written with the prediction): `TAKE_SURVEY_GRID_US` moves to the candidate grid only if, on set N, it
has at least 4 more builds within 0.5 ms of true, no more builds off by more than 1 ms, no more instant (0 ms) builds
advised a re-flash (share at most host.TAKE_ADVISE_RATIO, 0.6), and on the 3.3-7.4 ms checks no fewer builds within
0.5 ms. Otherwise the shipped grid stays and the candidate is not taken to another set (two held-out sets is its
budget). Rounded instant reads are printed but are not a clause.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture n.jsonl --lag 0.62 --seed 101 --takes "0.2,0.6,1.0,1.4,1.9,2.3,2.75,3.3,4.6,7.4,0"
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_short_blind.py --dense dense-n.jsonl.gz n.jsonl
RESULT (set N, eval/take-short-n-2026-11-19.txt): within 0.5 ms 45 of 66 against 40, off by more than 1 ms 6 against 6
(the prediction's "fewer" failed; the rule asked for no more, which held), no instant build advised on either, checks
16 each. Every clause held, so `TAKE_SURVEY_GRID_US` is now 0, 1.5, 2.5, 3, 4, 5, 6, 7, 8 ms. Set N captured again on
the board with that grid live (`--live`, eval/take-short-n-live-2026-11-19.txt): 49 of 66 within 0.5 ms against 39,
large misses 3 against 7, no survey cut at host.TAKE_WAIT_S 14 s, balls held 140.4 s against 127.3 s.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_short_blind.py --compare dense-n.jsonl.gz "0,2,3,4,5,6,7,8" "0,1.5,2.5,3,4,5,6,7,8" --rule advice
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_short_blind.py --live n.jsonl [n9.jsonl ...]

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
        share = (min(sums) / sums[0]) ** 0.5 if sums[0] else 1.0
        out.append((b["take_ms"], round(2 * ref / 1000) / 2, dl, grid_us[gi] / 1000, tuple(b["build"]),
                    [x / dsum[0] if dsum[0] else 1.0 for x in dsum[:13]], len(kept), share))
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


def compare(rows, shipped, candidate, rule="read"):
    """PART 2's rule: two grids (ms, comma-separated) with the shipped parabola on the same dense rows. rule "read"
    (set M) counts instant builds whose rounded verdict is more than 0.5 ms off 0; rule "advice" (set N, PART 3)
    counts instant builds the Pi would advise a re-flash on (share at most host.TAKE_ADVISE_RATIO, as
    take_survey_pick.py counts them)."""
    from feeder_sim import controller
    from tennisbots import host
    res = {}
    for label, gs in (("shipped", shipped), ("candidate", candidate)):
        g = [int(round(float(x) * 1000)) for x in gs.split(",")]
        v = verdicts(rows, g, controller.survey_pick)
        res[label] = {
            "n": len(v),
            "w5": sum(abs(x[1] - x[0]) <= 0.5 + 1e-9 for x in v),
            "off": sum(abs(x[1] - x[0]) > 1.0 + 1e-9 for x in v),
            "inst": sum(x[0] == 0 and abs(x[1]) > 0.5 for x in v),
            "inst_adv": sum(x[0] == 0 and x[7] <= host.TAKE_ADVISE_RATIO for x in v),
            "advised": sum(x[7] <= host.TAKE_ADVISE_RATIO for x in v),
            "checks": sum(x[0] >= 3.0 and abs(x[1] - x[0]) <= 0.5 + 1e-9 for x in v),
            "mae": sum(abs(x[1] - x[0]) for x in v) / len(v),
            "by_take": {t: [x[1] for x in v if x[0] == t] for t in sorted({x[0] for x in v})},
        }
        r = res[label]
        print(f"{label:9} {gs:24}: within 0.5 ms {r['w5']}/{r['n']}, off by more than 1 ms {r['off']}, mean abs "
              f"{r['mae']:.3f} ms, instant builds off 0 by more than 0.5 ms {r['inst']}, checks (3 ms and up) within "
              f"0.5 ms {r['checks']}, builds advised {r['advised']}, instant builds advised {r['inst_adv']}")
    print("\nBy take: shipped verdicts | candidate verdicts")
    for t in res["shipped"]["by_take"]:
        a = " ".join(f"{x:g}" for x in res["shipped"]["by_take"][t])
        b = " ".join(f"{x:g}" for x in res["candidate"]["by_take"].get(t, []))
        print(f"  {t:g} ms | [{a}] | [{b}]")
    s, c = res["shipped"], res["candidate"]
    clauses = {"at least 4 more within 0.5 ms": c["w5"] - s["w5"] >= 4,
               "no more off by more than 1 ms": c["off"] <= s["off"],
               **({"no more instant builds advised": c["inst_adv"] <= s["inst_adv"]} if rule == "advice" else
                  {"no more instant builds moved": c["inst"] <= s["inst"]}),
               "checks no worse": c["checks"] >= s["checks"]}
    for k, ok in clauses.items():
        print(f"  {k}: {'held' if ok else 'FAILED'}")
    print("Decision: " + ("the candidate grid ships" if all(clauses.values()) else "the shipped grid stays"))


def live(paths):
    """The board's own verdicts in captures (each drill's TAKE_SURVEY refined time, rounded to 0.5 ms as the Pi rounds
    it; advised when the best / step rms share is at most host.TAKE_ADVISE_RATIO), one line a capture."""
    from tennisbots import host
    for path in paths:
        v = []
        for r in load(path):
            sv = r["survey"]
            rms = sv["rms_ppm"]
            v.append((r["take_ms"], round(2 * sv["refined_ms10"] / 10) / 2, min(rms) / rms[0] if rms[0] else 1.0))
        ok = lambda a, b: abs(a - b) <= 0.5 + 1e-9
        print(f"{path.split('/')[-1]}: within 0.5 ms {sum(ok(a, b) for a, b, _ in v)}/{len(v)}, off by more than 1 ms "
              f"{sum(abs(a - b) > 1 + 1e-9 for a, b, _ in v)}, mean abs {sum(abs(a - b) for a, b, _ in v) / len(v):.3f} ms, "
              f"instant builds off 0 by more than 0.5 ms {sum(a == 0 and abs(b) > 0.5 for a, b, _ in v)}, instant builds "
              f"advised {sum(a == 0 and x <= host.TAKE_ADVISE_RATIO for a, _, x in v)}, builds advised "
              f"{sum(x <= host.TAKE_ADVISE_RATIO for *_, x in v)}, checks (3 ms and up) within 0.5 ms "
              f"{sum(a >= 3 and ok(a, b) for a, b, _ in v)}")


def main():
    if "--live" in sys.argv:
        return live(sys.argv[sys.argv.index("--live") + 1:])
    if "--dense" in sys.argv:
        i = sys.argv.index("--dense")
        out, ins = sys.argv[i + 1], sys.argv[i + 2:]
        builds = [b for p in ins for b in load(p)]
        with multiprocessing.Pool() as pool:
            rows = pool.map(dense_one, builds)
        with gzip.open(out, "wt") as f:
            for r in rows:
                r["dense"] = [[None if x is None else float(f"{x:.4g}") for x in d] for d in r["dense"]]
                f.write(json.dumps(r) + "\n")
        return
    if "--compare" in sys.argv:
        i = sys.argv.index("--compare")
        rule = sys.argv[sys.argv.index("--rule") + 1] if "--rule" in sys.argv else "read"
        return compare(load(sys.argv[i + 1]), sys.argv[i + 2], sys.argv[i + 3], rule)
    report(load(sys.argv[sys.argv.index("--report") + 1]))


if __name__ == "__main__":
    main()
