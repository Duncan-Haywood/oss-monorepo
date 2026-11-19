"""Milestone 7bd: does firing 7bc's second-phase check only when a test on the reserved sample says the pilot under-saw
the coder-negative cell's misses keep the check's reach without its cost? (7bc's next step (1).)

Why. 7bc reserved round(0.1 n) second-phase labels for the coder-negative cell (rs10). Moving the labels alone was
nearly free (97.7% of p5j40's GoEmotions gain kept). Taking the larger of the cell's variance and its reserved-sample
variance on every split draw (rs10v2) lifted 4 of the 7 many-miss cells to 88%+ admitted coverage but kept 34.9% of the
gain, because the maximum of two unbiased variance estimates is biased up on every draw, good coders included. In the
failing draws the pilot holds too few cell-0 misses (7at's replay), so the reserved sample, which the pilot never saw,
should show more misses than the pilot's rate predicts. With 0.1 n labels a one-sided test of that now has power (7bb's
test on a handful did not). Firing the repair only on rejection should pay its cost in about alpha of the good draws.

Test (cell 0 = coder-negative, cells draws only). x_P misses of m_P pilot items in cell 0, x_S of m_S reserved
second-phase items; p_P = (x_P + 0.5) / (m_P + 1); reject when P(Bin(m_S, p_P) >= x_S) < alpha (7bb's statistic,
`h7bb_second_phase.upper_tail`). Decided on labels only; the plan, pilot, reservation and seeds are 7bc's.

Candidates (all start from rs10: 7bc's reserved labels and p5j40's floor flag; change only what is named):
  t10, p5j40, v2, rs10, rs10v2   replays of 7bc (P0).
  rs10q10    rs10, cell 0's variance = max(its variance, its reserved-sample variance) when the test rejects at 0.10.
  rs10q25    the same at 0.25.
  rs10q10tp  rs10, cell 0 closed two-phase (7bc's rs10tp: pilot labels exact, the rest from the reserved sample alone,
             plus-two floor, FPC) when the test rejects at 0.10.
  rs10q25tp  the same at 0.25.

Cells: 7bc's 157 (130 GoEmotions, 27 NaijaSenti), 1,000 draws each (+/- 1.4 points). The GoEmotions cells hold the
failures that motivated the check, so P1 tests reach, not generalisation.

    python3 experiments/h7bd_tested_check.py draws [reps]   # -> h7bd_tested_check_draws.txt
    python3 experiments/h7bd_tested_check.py summary        # predictions and decision rule -> h7bd_tested_check.txt
    python3 experiments/h7bd_tested_check.py smoke [reps]   # first cell only, printed

Prediction (written and committed before any draw; a 10-draw smoke test of one cell may run first and is disclosed):
  P0  (replication) pooled, t10, p5j40, v2, rs10 and rs10v2 equal 7bc's in all 157 cells (coverage, ratio, admitted,
      fired).
  P1  (reach) of the 7 many-miss cells, rs10q10 lifts at least 3 to 88%+ admitted coverage. Guess: rs10q10 2,
      rs10q25 3, rs10q10tp 4, rs10q25tp 5 (rs10v2 lifted 4, rs10tp 7; a trigger keeps part of that).
  P2  (cost) share of p5j40's summed gain kept over the 130 GoEmotions cells. Guess: rs10q10 88 to 95%, rs10q25 75 to
      90%, rs10q10tp 0 to 70%, rs10q25tp negative to 50% (rs10tp lost 1,772% of the gain on every draw).
  P3  (do no harm) no cell where p5j40 covers 93%+ falls under 93%. Secondary (a'): none falls under 93% where rs10
      covers 93%+ (rs10 itself missed the bar by one cell in 7bc, inside the noise).
  P4  (second corpus) on the 27 NaijaSenti cells each candidate keeps 90%+ of p5j40's gain there and its weak-coder
      admitted coverage is at least p5j40's.
  Fire rate: in the 52 good-coder cells (J >= 0.40) the q10 test fires in under 15% of admitted draws and the q25
      test in under 30%. Selection worry, stated in advance: 7bb's triggered tp lowered coverage in the cells it
      targeted, because a test that fires on a high second-phase count picks draws where the second phase is high by
      chance; with 0.1 n reserved labels I expect that to be smaller, not gone.
  Decision rule, fixed now (7bc's). A candidate (rs10q10, rs10q25, rs10q10tp, rs10q25tp) qualifies if (a) P3;
  (b) weak-cell (J < 0.30) admitted coverage over all 157 cells at least p5j40's; (c) fewer cells with 30+ admitted
  draws under 88% than p5j40; (d) 90%+ of p5j40's summed gain over the 130 GoEmotions cells; (e) P4 for it. Of those
  that qualify the one with the largest summed gain over all 157 cells is to become the library default in the next
  step (its own PR, with a test that replays this file draw for draw; this step changes no library code). If none
  qualifies, the default stays p5j40 and limitation 6 adds these numbers. If a candidate fails only (a) and passes
  (a'), that is reported as such and the next step is a fresh-cell check of it, not a default change. My expectation,
  stated so it can be wrong: rs10q10 fails (c) (too little reach), the tp candidates fail (d).
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))
import h7bc_reserved_check as BC  # noqa: E402  (pins RARE_FALLBACK and NEG_FLOOR off, as 7bc)
import h7bb_second_phase as BB  # noqa: E402
import h7ay_cond_floor as Y  # noqa: E402

ALPHA = {"q10": 0.10, "q25": 0.25}
# Order matters for common random numbers: rs10 must come first so its reserved labels draw 7bc's generator state;
# every rs10* candidate shares r = 0.10, so one reservation per draw serves them all.
RESERVE = {"rs10": 0.10, "rs10v2": 0.10, "rs10q10": 0.10, "rs10q25": 0.10, "rs10q10tp": 0.10, "rs10q25tp": 0.10}
MODE = {"rs10": None, "rs10v2": "v2", "rs10q10": "q10v2", "rs10q25": "q25v2", "rs10q10tp": "q10tp",
        "rs10q25tp": "q25tp"}
NEW = ["rs10q10", "rs10q25", "rs10q10tp", "rs10q25tp"]
CANDS = ["t10", "p5j40", "v2"] + list(RESERVE)
RULES = ["pooled"] + CANDS
OUT = HERE / "h7bd_tested_check_draws.txt"
SUMMARY = HERE / "h7bd_tested_check.txt"
MANY = BB.MANY
WEAK_J, GOOD_J = BC.WEAK_J, BC.GOOD_J
_INTERVAL = BB.interval


def rejects(plan, labels, pilot, alpha):
    """7bb's one-sided test: does cell 0's second phase show more misses than the pilot's rate predicts?"""
    c0 = plan["cells"][0]
    yp = [labels[i] for i in c0 if i in pilot]
    ys = [labels[i] for i in c0 if i in labels and i not in pilot]
    p = (sum(yp) + 0.5) / (len(yp) + 1)
    return BB.upper_tail(len(ys), p, sum(ys)) < alpha


def interval(plan, f_all, labels, pilot, floor_on, mode, z=1.959964):
    """BB.interval, plus the tested modes "q10v2", "q25v2", "q10tp", "q25tp": the named action when the test rejects
    at that alpha, else the unchanged interval."""
    if mode in (None, "v2", "tp"):
        return _INTERVAL(plan, f_all, labels, pilot, floor_on, mode, z)
    act = mode[3:]
    if rejects(plan, labels, pilot, ALPHA[mode[:3]]):
        return _INTERVAL(plan, f_all, labels, pilot, floor_on, act, z)
    return _INTERVAL(plan, f_all, labels, pilot, floor_on, None, z)


def install():
    """Run 7bc's draw loop line for line with this step's candidate list and the tested modes."""
    BB.interval = interval
    BC.RESERVE, BC.MODE, BC.CANDS, BC.RULES = RESERVE, MODE, CANDS, RULES


def one_cell(args):
    install()
    return BC.one_cell(args)


def draws(reps):
    from multiprocessing import Pool
    install()
    cs = list(BC.cells())
    with Pool(4, initializer=install) as p:
        got = p.map(one_cell, [(c, reps) for c in cs], chunksize=1)
    OUT.write_text("\n".join([BC.HEAD] + [l for g in got for l in g]) + "\n")


def summary():
    by = Y.parse(OUT)
    keys = list(dict.fromkeys((k[0], k[1]) for k in by))
    na = [k for k in keys if by[(*k, "pooled")]["fresh"]]
    go = [k for k in keys if k not in na]
    weak = [k for k in keys if by[(*k, "pooled")]["J"] < WEAK_J]
    good = [k for k in keys if by[(*k, "pooled")]["J"] >= GOOD_J]
    out = [f"cells run: {len(keys)} ({len(go)} GoEmotions, {len(na)} NaijaSenti; {len(weak)} weak J < {WEAK_J}, "
           f"{len(good)} good J >= {GOOD_J}); errors (cell with < 2 labels): "
           + ", ".join(f"{nm} {sum(by[(*k, nm)]['err'] for k in keys)}" for nm in CANDS)]
    old = Y.parse(HERE / "h7bc_reserved_check_draws.txt")
    ms = ("cov", "ratio", "adm", "admc", "fired")
    rep = ("pooled", "t10", "p5j40", "v2", "rs10", "rs10v2")
    same = [k for k in keys if all(by[(*k, r)][m] == old[(*k, r)][m] for r in rep for m in ms)]
    out.append(f"P0 {', '.join(rep)} replay 7bc in {len(same)} of {len(keys)}: "
               f"{'yes' if len(same) == len(keys) else 'no'}")

    def gain(nm, ks=keys):
        return sum(1 - by[(*k, nm)]["ratio"] for k in ks)

    def admcov(nm, k):
        b = by[(*k, nm)]
        return 100 * b["admc"] / b["adm"] if b["adm"] else float("nan")

    def adm_low(nm):
        return [(k, by[(*k, nm)]["adm"], round(admcov(nm, k), 1)) for k in keys
                if by[(*k, nm)]["adm"] >= 30 and by[(*k, nm)]["admc"] < 0.88 * by[(*k, nm)]["adm"]]

    def pooled_adm(nm, ks):
        a = sum(by[(*k, nm)]["adm"] for k in ks)
        return (100 * sum(by[(*k, nm)]["admc"] for k in ks) / a if a else float("nan")), a

    def p3_fail(nm, ref="p5j40"):
        return [(k, by[(*k, nm)]["cov"]) for k in keys
                if by[(*k, nm)]["cov"] < 93.0 and by[(*k, ref)]["cov"] >= 93.0]

    def fire_rate(nm, ks):
        a = sum(by[(*k, nm)]["adm"] for k in ks)
        return 100 * sum(by[(*k, nm)]["fired"] for k in ks) / a if a else float("nan")

    adm_all = sum(by[(*k, "p5j40")]["adm"] for k in keys)
    for nm in CANDS:
        wc, wa = pooled_adm(nm, weak)
        out.append(f"{nm}: gain all {gain(nm):.3f} (GoEmotions {gain(nm, go):.3f}, NaijaSenti {gain(nm, na):.3f}, weak "
                   f"{gain(nm, weak):.3f}, good {gain(nm, good):.3f}); changed or fired in "
                   f"{sum(by[(*k, nm)]['fired'] for k in keys)} of {adm_all} admitted draws; weak admitted coverage "
                   f"{wc:.1f}% of {wa}; admitted >= 30 under 88%: {adm_low(nm)}; under 93% where p5j40 is not: "
                   f"{p3_fail(nm)}")
    out.append("admitted coverage in the many-miss cells: " + "; ".join(
        f"{k[0]} n {k[1]} ({by[(*k, 'p5j40')]['adm']}): " + ", ".join(
            f"{nm} {admcov(nm, k):.1f} r {by[(*k, nm)]['ratio']:.3f}" for nm in ["p5j40", "rs10", "rs10v2"] + NEW)
        for k in MANY if (*k, "p5j40") in by))
    for nm in ["rs10v2"] + NEW:
        p1 = sum(admcov(nm, k) >= 88.0 for k in MANY if (*k, nm) in by)
        out.append(f"P1 {nm} lifts {p1} of the {len(MANY)} many-miss cells to 88%+ admitted"
                   + (f": {'yes' if p1 >= 3 else 'no'} (rs10q10 needs 3)" if nm == "rs10q10" else ""))
    g0, n0 = gain("p5j40", go), gain("p5j40", na)
    out.append("P2 share of p5j40's GoEmotions gain kept: " + ", ".join(
        f"{nm} {gain(nm, go) / g0:.3f}" for nm in ["rs10", "rs10v2"] + NEW))
    out.append("P3 no cell under 93% where p5j40 covers: " + ", ".join(
        f"{nm} {'yes' if not p3_fail(nm) else 'no'} ({len(p3_fail(nm))})" for nm in NEW))
    out.append("P3 secondary (a') no cell under 93% where rs10 covers: " + ", ".join(
        f"{nm} {'yes' if not p3_fail(nm, 'rs10') else 'no'} {p3_fail(nm, 'rs10')}" for nm in NEW))
    out.append("fire rate in good-coder cells (% of admitted draws): " + ", ".join(
        f"{nm} {fire_rate(nm, good):.1f}" for nm in NEW) + "; weak cells: " + ", ".join(
        f"{nm} {fire_rate(nm, weak):.1f}" for nm in NEW) + "; the many-miss cells: " + ", ".join(
        f"{nm} {fire_rate(nm, [k for k in MANY if (*k, nm) in by]):.1f}" for nm in NEW))
    nweak = [k for k in na if k in weak]
    p0w = pooled_adm("p5j40", nweak)[0]

    def p4(nm):
        return gain(nm, na) >= 0.9 * n0 and pooled_adm(nm, nweak)[0] >= p0w

    out.append(f"P4 NaijaSenti: 90%+ of p5j40's gain ({n0:.3f}) and weak admitted coverage at least {p0w:.1f}%: "
               + ", ".join(f"{nm} {gain(nm, na):.3f} / {pooled_adm(nm, nweak)[0]:.1f}% {'yes' if p4(nm) else 'no'}"
                           for nm in NEW))
    p0wc, p0bad = pooled_adm("p5j40", weak)[0], len(adm_low("p5j40"))

    def checks(nm):
        return dict(a=not p3_fail(nm), b=pooled_adm(nm, weak)[0] >= p0wc, c=len(adm_low(nm)) < p0bad,
                    d=gain(nm, go) >= 0.9 * g0, e=p4(nm))

    for nm in NEW:
        out.append(f"decision checks {nm}: " + ", ".join(f"({x}) {'yes' if v else 'no'}" for x, v in checks(nm).items())
                   + f"; (a') {'yes' if not p3_fail(nm, 'rs10') else 'no'}")
    ok = [nm for nm in NEW if all(checks(nm).values())]
    near = [nm for nm in NEW if nm not in ok and not p3_fail(nm, "rs10")
            and all(v for x, v in checks(nm).items() if x != "a")]
    if ok:
        out.append(f"Decision rule: qualifying {ok}; {max(ok, key=gain)} is to become the library default (next step)")
    elif near:
        out.append(f"Decision rule: none qualifies; {near} fail only (a) and pass (a'): next step a fresh-cell check")
    else:
        out.append("Decision rule: none qualifies; the default stays p5j40")
    text = "\n".join(out); print(text); SUMMARY.write_text(text + "\n")


def main():
    mode = ARGS[0] if ARGS else "summary"
    if mode == "summary":
        summary()
    elif mode == "smoke":
        install()
        c = next(BC.cells())
        print("\n".join(BC.one_cell((c, int(ARGS[1]) if len(ARGS) > 1 else 10))))
    else:
        draws(int(ARGS[1]) if len(ARGS) > 1 else 1000)


if __name__ == "__main__":
    main()
