"""Why do 1.4-1.9 ms takes still read 0, and what can the Pi honestly say about them? (2026-11-19,
firmware/esp32/README.md "Short takes that read 0: no ball saw them")

eval/take-short-n-2026-11-19.md left the builds off by more than 1 ms as "1.4-1.9 ms takes reading 0, where the summed
curve's shelf hides the valley", and NEXT.md asked for a check of those builds' summed curves before any new grid or
pick. This script makes that check from the stored dense refits (no new capture), then tests one change to what the
Pi says.

PART 1, THE TRACE (`--trace dense.jsonl.gz ...`). Per build with a take of 1-2.5 ms: the wheels the board keeps (its
grid, trim and blind rule), and how many of them "see" the true take, i.e. fit the dense candidate nearest it with at
most 0.8 of the step's squared rms. A take shorter than a revolution moves a wheel's fit only when the ball's contact
straddles one of the revolution's edges (README "Take-blind rows traced"); a kept wheel can still be kept for what it
says about the long candidates alone (the 6-8 ms candidates straddle where the true take did not). Then the instant
builds' summed dense curves, to see whether their shelf looks any different.

RESULT (sets J to L, M and N, eval/take-shelf-trace-2026-11-19.txt): of the 17 builds at 1-2.5 ms off by more than
1 ms, 11 had no kept wheel that saw the true take and 3 more had one (8 of the 61 others had none, and read within
1 ms only because the parabola leaned off 0). There the summed curve is not a valley hidden by a shelf: it is a shelf
with no valley at all. The instant builds' summed curves stay within 2% of the step's to 1.5-2.25 ms on 11 of 30,
the same shape: from those balls no pick or grid can tell a 1.4-1.9 ms take from an instant one. What the balls do
say is an upper bound: the first candidate whose summed fit is clearly worse than the step's.

PART 2, THE BOUND, chosen on J to L, M and N (all seen, so design numbers; `--design`). When the Pi tells someone to
keep (or set) TAKE_US = 0, it now also names the first grid candidate whose mean rms is more than
host.TAKE_BOUND_TOL (2%) over the step's: "these balls cannot tell an instant take from one up to X ms". On the three
sets 145 builds were told TAKE_US = 0 (pick 0, or a pick at a share over 0.6); the true take was at most X on 145
(strictly under on 144); X was 1.5 ms on 20 of 30 instant builds. 1% and 5% gave the same coverage within one build.

PREDICTION (written before set O was captured): on set O (wheel lag 0.42 s, seed 109, neither used by an earlier take
capture; takes 0.1, 0.5, 0.9, 1.3, 1.6, 2.0, 2.4, 2.8, 3.5, 5.0 ms and the instant build, two tachs, three launchers,
66 drills, the board's own TAKE_SURVEY frames with the nine-point grid live), of the builds the Pi tells TAKE_US = 0,
the true take is at most the named bound on at least 95%, and the bound is 1.5 ms on at least half the instant builds.

DECISION RULE (written with the prediction): the bound ships in `take_survey_advice` only if both clauses hold on set
O. Otherwise the advice line stays as it was and the bound goes to NEXT.md with O's numbers.

RESULT (set O, eval/take-bound-o-2026-11-19.md): 49 of 66 builds told TAKE_US = 0; the true take at most the bound on
47 (95.9%), the bound 1.5 ms on 4 of 6 instant builds. Both clauses held, by one build on the first, so the bound
ships. The two misses are 2.0 ms takes at a 16 and 19 ppm step, where one whole ppm is 5-6%; a ppm floor on the
tolerance is the next test, on a fresh set.

PART 3, A PPM FLOOR (`--floor-design`, `--floor-heldout`; 2026-11-19, eval/take-bound-floor-p-2026-11-19.md). The
frame carries whole ppm, so at a 16-20 ppm step the 2% bar is cleared by one ppm of rounding. Candidate: a candidate
counts as worse than the step's only when its mean rms is over max(step * 1.02, step + FLOOR ppm). Design (J to L, M,
N, and O now seen): floors 0, 1, 2, 3, 4 ppm keep 145 of 145 on J-N; on O 47, 48, 49, 49, 49 of 49; the instant
builds' bound is 1.5 ms on 20, 20, 17, 15, 15 of 30 (J-N). FLOOR = 2 is the smallest floor that covers all of O.

PREDICTION AND RULE (written before set P was captured): set P is wheel lag 0.58 s, seed 113 (neither used by an
earlier take capture), the same takes, tachs, launchers and 66 drills as O. FLOOR = 2 ships in host.take_survey_bound
only if, on P, (a) its coverage of builds told TAKE_US = 0 is at least 95% and at least the no-floor coverage, and
(b) its bound is 1.5 ms on at least half the instant builds. Otherwise host stays at 2% alone and the floor goes to
NEXT.md with P's numbers.

RESULT (set P, eval/take-bound-floor-p-2026-11-19.md): 48 of 66 builds told TAKE_US = 0. 2% alone: the true take at
most the bound on 46 (95.8%; misses a 1.6 and a 2.8 ms take, both bounded at 1.5 ms). With the floor: 48 of 48, and
the bound 1.5 ms on 4 of 6 instant builds. Both clauses held, so the floor ships (host.TAKE_BOUND_FLOOR_PPM = 2).

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_shelf_bound.py --trace eval/take-dense-jkl-2026-11-19.jsonl.gz eval/take-dense-m-2026-11-19.jsonl.gz eval/take-dense-n-2026-11-19.jsonl.gz
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_shelf_bound.py --design eval/take-dense-jkl-2026-11-19.jsonl.gz eval/take-dense-m-2026-11-19.jsonl.gz eval/take-dense-n-2026-11-19.jsonl.gz
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture o.jsonl --lag 0.42 --seed 109 --takes "0.1,0.5,0.9,1.3,1.6,2.0,2.4,2.8,3.5,5.0,0"
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_shelf_bound.py --heldout o.jsonl
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_shelf_bound.py --floor-design eval/take-dense-jkl-2026-11-19.jsonl.gz eval/take-dense-m-2026-11-19.jsonl.gz eval/take-dense-n-2026-11-19.jsonl.gz eval/take-bound-o-2026-11-19.jsonl.gz
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_survey_pick.py --capture p.jsonl --lag 0.58 --seed 113 --takes "0.1,0.5,0.9,1.3,1.6,2.0,2.4,2.8,3.5,5.0,0"
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_shelf_bound.py --floor-heldout p.jsonl

Simulated only, as the captures are.
"""

import sys

import take_short_blind as tsb
import take_survey_pick as tsp

TOL = 0.02          # the design's tolerance; host.TAKE_BOUND_TOL once shipped
SEE = 0.8           # a kept wheel sees the true take when its squared rms there is at most this share of the step's


def _grid():
    from feeder_sim import controller
    return list(controller.TAKE_SURVEY_GRID_US)


def bound_ms(rms, grid_ms, tol=TOL, floor=2):
    """The first grid contact time after 0 whose mean rms is more than `tol` and at least `floor` ppm over the step's, or
    None (every candidate fits within them). The same arithmetic as host.take_survey_bound (floor 2 since set P)."""
    if not rms or not rms[0]:
        return None
    for g, r in zip(grid_ms[1:], rms[1:]):
        if r > max(rms[0] * (1 + tol), rms[0] + floor):
            return g
    return None


def kept_wheels(b, grid):
    """The board's ResidualSurvey over a dense build's grid columns, and the dense rows of the wheels it kept."""
    from feeder_sim import controller
    idx = [tsp.DENSE_US.index(g) for g in grid]
    rs = controller.ResidualSurvey(grid, controller.TAKE_SURVEY_TRIM, controller.TAKE_SURVEY_BLIND)
    kept = []
    for d in b["dense"]:
        if all(x is not None for x in d):
            before = rs.kept_n
            rs.add([d[i] * d[i] for i in idx])
            if rs.kept_n > before:
                kept.append(d)
    return rs, kept


def frames_dense(paths):
    """(take ms, the TAKE_SURVEY dict the board would send) for each dense build, with TAKE_US = 0 on the board."""
    grid = _grid()
    for p in paths:
        for b in tsb.load(p):
            rs, _ = kept_wheels(b, grid)
            rep = rs.report(100)
            if rep is None:
                continue
            n, least, ref, rms = rep
            yield b["take_ms"], {"wheels": n, "least_ms10": least, "refined_ms10": ref, "rms_ppm": rms,
                                 "board_ms10": 0, "kept": rs.kept_n}


def frames_capture(paths):
    for p in paths:
        for r in tsb.load(p):
            if r.get("survey"):
                yield r["take_ms"], r["survey"]


def trace(paths):
    grid = _grid()
    D = tsp.DENSE_US
    print(f"Kept wheels that see the true take (squared rms at the nearest dense candidate at most {SEE} of the step's)")
    print("set | take ms | board's verdict ms | kept | seeing | large miss")
    rows = []
    for p in paths:
        name = p.split("/")[-1]
        for b in tsb.load(p):
            t = b["take_ms"]
            if not 1.0 <= t <= 2.5:
                continue
            rs, kept = kept_wheels(b, grid)
            if not kept:
                continue
            from feeder_sim import controller
            _, ref = controller.survey_pick(grid, rs.sums())
            read = round(2 * ref / 1000) / 2
            ti = min(range(len(D)), key=lambda k: abs(D[k] - t * 1000))
            sees = sum((d[ti] / d[0]) ** 2 <= SEE for d in kept if d[0])
            miss = abs(read - t) > 1 + 1e-9
            rows.append((t, read, len(kept), sees, miss))
            print(f"{name} | {t:g} | {read:g} | {len(kept)} | {sees} | {'yes' if miss else ''}")
    misses = [r for r in rows if r[4]]
    print(f"\n{len(rows)} builds at 1-2.5 ms; {len(misses)} off by more than 1 ms, of which "
          f"{sum(r[3] == 0 for r in misses)} had no seeing wheel and {sum(r[3] == 1 for r in misses)} had one. Of the "
          f"{len(rows) - len(misses)} others, {sum(r[3] == 0 for r in rows if not r[4])} had none.")
    print("\nInstant builds: summed dense curve 0-3 ms (each over its 0 ms sum), and where it first rises 2% over 0")
    for p in paths:
        for b in tsb.load(p):
            if b["take_ms"] != 0:
                continue
            _, kept = kept_wheels(b, grid)
            if not kept:
                continue
            s = [sum(d[k] * d[k] for d in kept) for k in range(13)]
            c = [x / s[0] for x in s]
            rise = next((D[k] / 1000 for k in range(1, 13) if c[k] > 1.02 ** 2), None)
            print(f"  {p.split('/')[-1]} kept {len(kept):2d} rises at {rise} ms | " + " ".join(f"{x:.2f}" for x in c))


def score(frames, label, floor=0):
    from tennisbots import host
    grid_ms = [g / 1000 for g in _grid()]
    told = []
    for t, sv in frames:
        a = host.take_survey_advice(dict(sv, board_ms10=sv.get("board_ms10", 0)))
        if a and "TAKE_US = 0" in a:
            told.append((t, bound_ms(sv.get("rms_ppm") or [], grid_ms, floor=floor), (sv.get("rms_ppm") or [0])[0]))
    ok = sum(x is None or t <= x + 1e-9 for t, x, _ in told)
    inst = [x for t, x, _ in told if t == 0]
    i15 = sum(x == 1.5 for x in inst)
    print(f"{label}: {len(told)} builds told TAKE_US = 0; true take at most the bound on {ok} "
          f"({ok / len(told):.1%}); instant builds {len(inst)}, bound 1.5 ms on {i15}")
    by = {}
    for t, x, _ in told:
        by.setdefault(t, []).append(x)
    for t in sorted(by):
        print(f"  {t:g} ms: bounds [{' '.join('-' if x is None else f'{x:g}' for x in by[t])}]")
    return len(told), ok, len(inst), i15


FLOOR = 2           # the candidate ppm floor (PART 3)


def floor_heldout(paths):
    rows = list(frames_capture(paths))
    n0, ok0, _, _ = score(rows, "held out, 2% alone", floor=0)
    n, ok, ni, i15 = score(rows, f"held out, max(2%, {FLOOR} ppm)", floor=FLOOR)
    ca = n > 0 and ok >= 0.95 * n and ok >= ok0
    cb = ni > 0 and 2 * i15 >= ni
    print(f"  (a) coverage at least 95% and at least the 2%-alone {ok0} of {n0}: {'held' if ca else 'FAILED'}; "
          f"(b) bound 1.5 ms on at least half the instant builds: {'held' if cb else 'FAILED'}")
    print("Decision: " + (f"the {FLOOR} ppm floor ships in host.take_survey_bound" if ca and cb
                          else "host stays at 2% alone"))
    return ca and cb


def main():
    a = sys.argv
    if "--floor-design" in a:
        paths = a[a.index("--floor-design") + 1:]
        dense = [p for p in paths if "dense" in p]
        caps = [p for p in paths if "dense" not in p]
        for f in range(5):
            score(frames_dense(dense), f"design J-N, floor {f} ppm", floor=f)
            if caps:
                score(frames_capture(caps), f"seen O, floor {f} ppm", floor=f)
        return
    if "--floor-heldout" in a:
        return floor_heldout(a[a.index("--floor-heldout") + 1:])
    if "--trace" in a:
        return trace(a[a.index("--trace") + 1:])
    if "--design" in a:
        score(frames_dense(a[a.index("--design") + 1:]), "design (J to L, M, N)")
        return
    if "--heldout" in a:
        n, ok, ni, i15 = score(frames_capture(a[a.index("--heldout") + 1:]), "held out")
        c1 = n > 0 and ok >= 0.95 * n
        c2 = ni > 0 and 2 * i15 >= ni
        print(f"  coverage at least 95%: {'held' if c1 else 'FAILED'}; bound 1.5 ms on at least half the instant "
              f"builds: {'held' if c2 else 'FAILED'}")
        print("Decision: " + ("the bound ships in take_survey_advice" if c1 and c2 else "the advice stays as it was"))


if __name__ == "__main__":
    main()
