"""Milestone 6zzt: when the boat's replay of its own learning year says the uncorrected plan did fine, should it drop
the learned seasonal correction altogether, and does a continuous gate on the replay's km margin do better than the
binary one?

Why: 6zzs's "Next" asked for "a continuous gate (shrink toward 1 by the replay's km margin) on all30 only, where the
binary gate already helps". 6zzs's best deployable all-points rule, OM (DG where the replay is short, BG where dark,
LC where ok), scored 131.6 of 168 pooled cells, still below no correction at all (AT_90, 139). In 6zzs, 61% of
replays over all 30 points said "ok": AT_90 matched or beat B on km and dark hours in the year the boat logged. Yet
OG and OM keep the raw learned ratios LC there, and LC alone scores 121.8, below no correction. The open question is
whether the replay's "ok" is better read as "the correction is not needed" (fall back to ratios of 1, which is
exactly AT_90) than as "the raw correction is safe". The continuous version shrinks DG's ratios toward 1 by how far
the replay fell short on km.

Design (fixed here, before any configuration below was run):
  Data, split, payload, packs, shapes, clamp, interpolation, AT_90, B, "dominates B", the four counts (all168,
  real8, hi168, pp240), the five single-year lags, local summer, the replay cell and its side exactly as 6zzs
  (`run_side_guard.py`, pass 1 reproduces its table: checks LC, DG as 6zzp, OG mean all168 127.2, OM 131.6).
  Replay km margin m = (AT_90 km - B km) / B km in the learning-year cell (negative = short).
  Rules per lag g:
    OA_g   DG_g where the replay is short, no correction (ratios 1, i.e. the AT_90 result) otherwise.
    OL_g   control: LC_g where short, no correction otherwise (is it the gate or the guard that helps?).
    CS_g^s continuous: monthly ratios 1 + w (c_DG - 1), w = min(1, max(0, -m / s)), for s in 1%, 3% and 10%.
           w = 1 gives DG_g, w = 0 gives AT_90; only cells with 0 < w < 1 need a new simulation.
  Every rule here is in-sample on the 30 points and ten years that 6zzj to 6zzs already scored; the three s values
  are a sweep fixed here, and the best of them is a selection, not a test.
Predictions (priors in brackets; "mean" = mean over the five lags):
  R1 OA reaches no correction on the 30-point pool: OA mean all168 >= 139. [45%]
  R2 OA beats 6zzs's best gated rule: OA mean all168 > 131.6 (OM). [60%]
  R3 Falling back to no correction gives up the high-amplitude wins: OA mean hi168 < 85.8 (OG). [80%]
  R4 The guard matters on short replays: OA mean all168 > OL mean all168. [60%]
  R5 Some s gives CS a higher mean all168 than OA. [40%]
  R6 CS's mean all168 is monotone in s over 1%, 3%, 10%. [40%]
  R7 OA's worst lag on all168 is at least 139. [25%]
Descriptive: every rule x lag on all four counts; per rule mean [min, max] over lags; the all168 and hi168 failure
  modes of OA and the CS rules; the share of short replays with 0 < w < 1 at each s.

Run (from research/marine-hull): PYTHONPATH=src python3 experiments/run_replay_fallback.py \
  > experiments/results_replay_fallback.txt   (stdlib, deterministic; up to 4 processes, about 10 minutes)"""
import os
import statistics as st
import sys
from multiprocessing import Pool

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import run_blend_transfer as bt  # noqa: E402
import run_fresh_years as fy  # noqa: E402
import run_learned_season as ls  # noqa: E402
import run_pack_hotel_tau as pt  # noqa: E402
import run_season_week as sw  # noqa: E402
import run_self_bias as sb  # noqa: E402
import run_side_guard as sg  # noqa: E402
import run_summer_shift as ss  # noqa: E402
import run_year_pack as yp  # noqa: E402

PACKS, HOTEL, BASE, PS = fy.PACKS, fy.HOTEL, fy.BASE, fy.PS
YEARS, REAL, SHAPES, N, LAGS = fy.YEARS, ls.REAL, ls.SHAPES, ls.N, sg.LAGS
SCALES = (0.01, 0.03, 0.10)
CS_TAGS = tuple(f"CS{round(s * 100):02d}" for s in SCALES)  # CS01, CS03, CS10
NEW_TAGS = ("OA", "OL") + CS_TAGS
OLD_TAGS = ("LC", "DG", "OG", "OM")
TAGS = OLD_TAGS + NEW_TAGS
RULES = ("AT_90",) + tuple(f"{t}_{g}" for t in TAGS + ("BG",) for g in LAGS)


def margin(t):
    """Replay km margin of AT_90 against B in one cell result: (AT km - B km) / B km."""
    return (t["AT_90"][0] - t[BASE][0]) / t[BASE][0]


def weight(m, s):
    """Continuous gate weight on DG's departure from 1: 0 when the replay is not short, 1 at a shortfall of s."""
    return min(1.0, max(0.0, -m / s))


def shrink(c, w):
    return tuple(1.0 + w * (x - 1.0) for x in c)


def rescore(job):
    """(key, {rule: result}) for the CS rules whose weight is strictly between 0 and 1 in this cell."""
    key, ws = job
    cap, p, yr, s0, amp, phi = key
    shape = (s0, amp, phi)
    sun, h = fy._sun(p, yr)
    h = list(h)
    hc = ls.scaled(p, yr, shape)[1]
    idle_dark = yp.idle(sun, cap, HOTEL)[1]
    a = PS[cap][0]
    ones = [1.0] * len(h)
    cs = sg.corrections(p, fy.half_of(yr), shape)
    out = {}
    for rule, (g, w) in ws.items():
        cm = shrink(cs[f"DG_{g}"], w)
        hm = [ls.interp(cm, d) * x for d, x in enumerate(hc)]
        TT = pt.target(hm, cap, HOTEL)
        taus = [sb.tau_of(1.0 / x) for x in sb.ratios(h, hm, N)]
        km, dark, days = sb.run(h, TT, hm, a, taus, ones, cap, HOTEL)
        out[rule] = (km, dark - idle_dark, days)
    return key, out


def fallback(cells, sides):
    """Add OA_g and OL_g to every cell; returns the jobs for CS cells needing a new simulation and the w counts."""
    jobs, mid = [], {tag: [0, 0] for tag in CS_TAGS}  # [short replays with 0 < w < 1, short replays]
    for key, t in cells.items():
        cap, p, yr = key[:3]
        sh = key[3:]
        ws = {}
        for g in LAGS:
            s = sides[key][g]
            t[f"OA_{g}"] = t[f"DG_{g}"] if s == "short" else t["AT_90"]
            t[f"OL_{g}"] = t[f"LC_{g}"] if s == "short" else t["AT_90"]
            m = margin(cells[(cap, p, sg.learning_year(yr, g)) + sh])
            for sc, tag in zip(SCALES, CS_TAGS):
                w = weight(m, sc)
                rule = f"{tag}_{g}"
                if s == "short":
                    mid[tag][1] += 1
                if w <= 0.0:
                    t[rule] = t["AT_90"]
                elif w >= 1.0:
                    t[rule] = t[f"DG_{g}"]
                else:
                    mid[tag][0] += 1
                    ws[rule] = (g, w)
        if ws:
            jobs.append((key, ws))
    return jobs, mid


def evaluate(points=bt.PTS, procs=4):
    cells, sides = sg.evaluate(points, procs=procs)
    jobs, mid = fallback(cells, sides)
    with Pool(procs) as pool:
        for key, out in pool.map(rescore, jobs, chunksize=4):
            cells[key].update(out)
    return cells, sides, mid


def main():
    ss.RULES = RULES
    pts, hi = bt.PTS, ls.high_amp_points()
    cells, sides, mid = evaluate(pts)
    tab = {"all168": ss.pooled(cells, pts, SHAPES), "real8": ss.pooled(cells, pts, (REAL,)),
           "hi168": ss.pooled(cells, hi, SHAPES), "pp240": ss.per_point(cells, pts)}
    print("Milestone 6zzt: replay-gated fallback to no correction and a continuous gate on the replay's km margin, "
          "all 30 points and the five single-year lags, 2005 to 2014 (50 W)")
    print(f"high-amplitude points: {', '.join(hi)} ({len(hi)})")

    mean = lambda t, c: st.mean(tab[c][f"{t}_{g}"] for g in LAGS)  # noqa: E731
    ok = (all(tab["all168"][g] == v for g, v in sg.CHECK_ALL.items())
          and all(tab["hi168"][g] == v for g, v in sg.CHECK_HI.items())
          and all(tab[k]["AT_90"] == v for k, v in sg.CHECK_AT.items())
          and round(mean("OG", "all168"), 1) == 127.2 and round(mean("OM", "all168"), 1) == 131.6
          and round(mean("OG", "hi168"), 1) == 85.8)
    print("Checks (6zzj, 6zzp, 6zzs): LC and DG per lag, AT_90 on the four counts, OG all168 / hi168 "
          f"{mean('OG', 'all168'):.1f} / {mean('OG', 'hi168'):.1f} (127.2 / 85.8), OM all168 "
          f"{mean('OM', 'all168'):.1f} (131.6)" + ("  ok" if ok else "  MISMATCH"))

    cols = ("all168", "real8", "hi168", "pp240")
    print("\nPer rule and lag: dominance counts")
    print("  rule    | " + " | ".join(f"{c:>7s}" for c in cols))
    for g in ("AT_90",) + tuple(f"{t}_{x}" for t in NEW_TAGS for x in LAGS):
        print(f"  {g:7s} | " + " | ".join(f"{tab[c][g]:7d}" for c in cols))

    print("\nPer rule over the five lags: mean [min, max]  (AT_90: " + ", ".join(
        f"{c} {tab[c]['AT_90']}" for c in cols) + ")")
    summ = {}
    for t in TAGS:
        row = []
        for c in cols:
            xs = [tab[c][f"{t}_{g}"] for g in LAGS]
            summ[(t, c)] = (st.mean(xs), min(xs), max(xs))
            row.append(f"{st.mean(xs):6.1f} [{min(xs):3d},{max(xs):3d}]")
        print(f"  {t:4s} | " + " | ".join(row))

    for name, ps in (("all168", pts), ("hi168", hi)):
        print(f"\nFailing {name} cells by mode (km only / dark only / both)")
        for t in ("OM", "OA", "OL") + CS_TAGS:
            print(f"  {t}: " + "; ".join(
                "lag {} {}/{}/{}".format(g, *ss.failure_modes(cells, ps, f"{t}_{g}")) for g in LAGS))

    print("\nShort replays whose continuous weight is strictly between 0 and 1 (cell x lag, all 30 points)")
    for sc, tag in zip(SCALES, CS_TAGS):
        k, n = mid[tag]
        print(f"  s = {sc:.0%}: {k} of {n} ({k / n:.3f})")

    m = lambda t, c="all168": summ[(t, c)][0]  # noqa: E731
    v = lambda b: "held" if b else "refuted"  # noqa: E731
    cs_means = [m(t) for t in CS_TAGS]
    mono = cs_means == sorted(cs_means) or cs_means == sorted(cs_means, reverse=True)
    best = max(zip(cs_means, CS_TAGS))
    print("\nPredictions")
    print(f"R1 OA mean all168 >= 139: {v(m('OA') >= 139)} ({m('OA'):.1f})")
    print(f"R2 OA mean all168 > 131.6 (OM): {v(m('OA') > 131.6)} ({m('OA'):.1f})")
    print(f"R3 OA mean hi168 < 85.8 (OG): {v(m('OA', 'hi168') < 85.8)} ({m('OA', 'hi168'):.1f})")
    print(f"R4 OA mean all168 > OL mean all168: {v(m('OA') > m('OL'))} ({m('OA'):.1f} vs {m('OL'):.1f})")
    print(f"R5 some s gives CS mean all168 > OA's: {v(best[0] > m('OA'))} (best {best[1]} {best[0]:.1f})")
    print(f"R6 CS mean all168 monotone in s: {v(mono)} (" + ", ".join(
        f"{t} {x:.1f}" for t, x in zip(CS_TAGS, cs_means)) + ")")
    print(f"R7 OA worst lag all168 >= 139: {v(summ[('OA', 'all168')][1] >= 139)} ({summ[('OA', 'all168')][1]})")


if __name__ == "__main__":
    main()
