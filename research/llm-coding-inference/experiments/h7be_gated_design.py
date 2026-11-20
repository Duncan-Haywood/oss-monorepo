"""Milestone 7be: does changing the design at a low pilot J_hat (do not reuse the pilot there) repair the conditional
failure that six interval-side repair families could not, at an acceptable width cost? (Section 6.1's open step;
7bd's next step (2).)

Why. Under the default (p5j40), 7 of 157 cells cover under 88% on the draws that use cells (a weak coder whose pilot
under-saw its misses). Every repair tried in 7at to 7bd kept the design and changed the interval; 0 of 27 kept 90% of
the gain while repairing half the failing cells (`validity_frontier.txt`). The failing draws are weak coders, whose
split gains little width anyway (ratios 0.98 to 1.00), and their pilots read a mid J_hat (7at's replay: mean J_hat of
the missed draws 0.23 to 0.48, most under 0.40), while the good coders that carry the gain read high. So the design
can change only where J_hat is low, either by not splitting (jp) or by splitting without reusing the pilot (7ap's
priced two-phase design for the coder-negative cell, `plan_audit(two_phase="neg", price_floor=True, pseudo=2)`;
given the pilot, its second phase is a fresh random sample, so the interval is valid given the choice).

A question none of 7at to 7bd measured: how does the plain pooled interval cover on the same draws (those whose pilot
the default split)? The pooled audit reuses the pilot too (it is 70% of the full random sample), so if the pilot
under-saw the positives, the pooled estimate is low as well. Reported here as `pooledA` (the pooled interval, with the
default's split flag): it is the floor any jp rule can reach, and it says how much of the "conditional failure" is the
cells interval's at all.

Candidates (each starts from p5j40's draw; it changes only split draws with pilot J_hat < c; elsewhere it is p5j40):
  pooled, t10, p5j40   replays of 7bd (P0).
  pooledA  the pooled interval on every draw, flagged admitted where p5j40 split (a reference, not a candidate).
  jp40     pooled (the full random sample) when J_hat < 0.40.
  jp50     the same at 0.50.
  jt40     when J_hat < 0.40, plan again from the same pilot with 7ap's priced two-phase design (cell 0 two-phase, plus-two
           floor priced at the second-phase size, width forecast at margin 0, tau 0.10, neg_guard 3); if that plan is
           pooled, pooled as jp40. Second-phase labels from a separate generator per draw.
  jt50     the same at 0.50.
  jf40     jt40 without the width gate (the two-phase plan whenever its design exists): the price of validity.

Cells: 7bd's 157 (130 GoEmotions, 27 NaijaSenti), 1,000 draws each, its seeds; J_hat is the pilot's point estimate
(`W.j_lower(..., 0)`, the quantity the 0.40 in NEG_FLOOR reads).

    python3 experiments/h7be_gated_design.py draws [reps]   # -> h7be_gated_design_draws.txt
    python3 experiments/h7be_gated_design.py summary        # predictions and decision rule -> h7be_gated_design.txt
    python3 experiments/h7be_gated_design.py smoke [reps]   # first cell only, printed

Prediction (written and committed before any draw; a 10-draw smoke test of one cell may run first and is disclosed):
  P0  (replication) pooled, t10 and p5j40 equal 7bd's in all 157 cells (coverage, ratio, admitted, fired).
  P1  (pooled on the same draws) pooledA's admitted coverage in the 7 many-miss cells is under 93% in at least 4 of
      them. Guess 85 to 92%: the pilot is most of the pooled sample. If it is 93%+ in all 7, the failure is the cells
      interval's alone and jp is a clean repair.
  P2  (reach) jp40 lifts at least 5 of the 7 many-miss cells to 88%+ admitted coverage. Guess jp40 5, jp50 6, jt40 5,
      jt50 6, jf40 7 (the two-phase interval does not reuse the pilot; the gated ones fall back to pooled mostly).
  P3  (cost) share of p5j40's summed gain kept over the 130 GoEmotions cells. Guess jp40 80 to 92%, jp50 60 to 80%,
      jt40 a point or two above jp40, jt50 above jp50, jf40 under 50%. The cost is good coders' pilots reading low.
  P4  (do no harm) no cell where p5j40 covers 93%+ falls under 93%.
  P5  (second corpus) on the 27 NaijaSenti cells each candidate keeps 90%+ of p5j40's gain there and its weak-coder
      admitted coverage is at least p5j40's. Worry, stated in advance: NaijaSenti's nb coder sits at J 0.39 to 0.42,
      so jp40 may give up much of the little gain there and fail P5.
  Decision rule, fixed now (7bd's). A candidate (jp40, jp50, jt40, jt50, jf40) qualifies if (a) P4; (b) weak-cell
  (J < 0.30) admitted coverage over all 157 cells at least p5j40's; (c) fewer cells with 30+ admitted draws under 88%
  than p5j40; (d) 90%+ of p5j40's summed gain over the 130 GoEmotions cells; (e) P5 for it. Of those that qualify the
  one with the largest summed gain over all 157 cells is to become the library default after a fresh-cell check (its
  own step; this one changes no library code, because the 157 cells chose the 0.40). If none qualifies, the default
  stays p5j40 and Section 6.1 adds the seventh family. My expectation, stated so it can be wrong: jp40 or jt40 passes
  (c) and (d) and fails (e) on NaijaSenti; jf40 fails (d).

Disclosed after the commit above: a 10-draw smoke test of the first cell ran. The first full launch then died on this
script's budget assertion (nb-in-language 5%, n 600: the priced two-phase replan labelled 604 items), a library bug:
`plan_audit`'s priced two-phase path did not apply BUDGET_CAP (7ar's fix covered only the one-phase plan). The fix
(the same `cap_to_budget`, LOG.md 7be) went in before the relaunch; no prediction, candidate or rule changed, and the
lines the dead run printed were not read.
"""
import random
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))
import h7bc_reserved_check as BC  # noqa: E402  (pins RARE_FALLBACK and NEG_FLOOR off, as 7bb to 7bd)
import h7bb_second_phase as BB  # noqa: E402
import h7ay_cond_floor as Y  # noqa: E402
import h7au_neg_floor as U  # noqa: E402
import h7at_weak_admit as W  # noqa: E402
from llmci import audit_design as A  # noqa: E402

SHARE, FLOOR, P5J40 = BC.SHARE, BC.FLOOR, BC.P5J40
GATE = {"jp40": ("pool", 0.40, None), "jp50": ("pool", 0.50, None), "jt40": ("two", 0.40, 0.0),
        "jt50": ("two", 0.50, 0.0), "jf40": ("two", 0.40, None)}
NEW = list(GATE)
CANDS = ["t10", "p5j40", "pooledA"] + NEW
RULES = ["pooled"] + CANDS
OUT = HERE / "h7be_gated_design_draws.txt"
SUMMARY = HERE / "h7be_gated_design.txt"
MANY = BB.MANY
WEAK_J, GOOD_J = BC.WEAK_J, BC.GOOD_J


def two_phase_plan(f, pilot_y, n, margin):
    """7ap's priced two-phase design (cell 0 two-phase), planned from the same pilot; margin None skips the width gate."""
    return A.plan_audit(f, pilot_y, n, tau=0.10, neg_guard=A.NEG_GUARD, width_margin=margin, pseudo=2,
                        two_phase="neg", price_floor=True, neg_floor=None)


def run(c, reps):
    """7bb's `run` scheme and seeds line for line for pooled, t10 and p5j40 (7bc and 7bd's reserved draws used a
    separate generator, so leaving them out changes nothing here); the two-phase candidates draw their second phase
    from another separate generator per draw."""
    h, f, n = c["h"], c["f"], c["n"]
    N, truth = len(h), sum(h) / len(h)
    rr = random.Random(c["seed"] + 13)
    srs = [rr.sample(range(N), n) for _ in range(reps)]
    k = round(SHARE * n)
    res = {nm: [] for nm in RULES}
    fired = {nm: 0 for nm in CANDS}
    for d in range(reps):
        full = srs[d]
        labels = {i: h[i] for i in full}
        plan = A.plan_audit(f, labels, n, tau=2.0, neg_guard=0)
        _, plo, phi = A.audit_interval(plan, f, labels)
        pooled = ((phi - plo) / 2, plo <= truth <= phi)
        res["pooled"].append((*pooled, False, False))
        sb = random.Random(c["seed"] + 7 * d)
        pilot = full[:k]
        pset = set(pilot)
        pm = sum(1 for i in pilot if h[i] and not f[i])
        jh = W.j_lower([h[i] for i in pilot], [f[i] for i in pilot], 0.0)
        pilot_y = {i: h[i] for i in pilot}
        labels = dict(pilot_y)
        plan = A.plan_audit(f, labels, n, tau=0.10, neg_guard=A.NEG_GUARD)
        if plan["design"] == "pooled":
            labels = {i: h[i] for i in full}
            plan = dict(plan, to_label=[0])
        for cell, t in zip(plan["cells"], plan["to_label"]):
            for i in sb.sample([i for i in cell if i not in labels], t):
                labels[i] = h[i]
        assert len(labels) <= n, (c["label"], n, len(labels))
        cl = plan["design"] == "cells"
        if cl:
            assert pm >= A.NEG_GUARD and all(f[i] == 0 for i in plan["cells"][0]), (c["label"], n, d)
        on = cl and pm < P5J40[0] and jh < P5J40[1]
        ivs, errs = {}, set()
        try:
            ivs["t10"] = U.interval(plan, f, labels, None)
            ivs["p5j40"] = U.interval(plan, f, labels, FLOOR if on else None)
            assert max(abs(a - b) for a, b in zip(ivs["p5j40"], BB.interval(plan, f, labels, pset, on, None))) < 1e-12
            fired["p5j40"] += on
        except ValueError:  # a cell with fewer than two labels; counted and reported, never silently dropped
            errs.update(CANDS)
        ivs["pooledA"] = (None, plo, phi)
        sg = random.Random(c["seed"] + 7 * d + 900007)
        tp = {}
        for nm, (kind, cut, margin) in GATE.items():
            if "p5j40" in errs:
                continue
            if not cl or jh >= cut:
                ivs[nm] = ivs["p5j40"]
                continue
            fired[nm] += 1
            if kind == "pool":
                ivs[nm] = ivs["pooledA"]
                continue
            if margin not in tp:
                p2 = two_phase_plan(f, pilot_y, n, margin)
                if p2["design"] == "pooled":
                    tp[margin] = ivs["pooledA"]
                else:
                    g = random.Random(sg.random())
                    lab = dict(pilot_y)
                    for cell, t in zip(p2["cells"], p2["to_label"]):
                        for i in g.sample([i for i in cell if i not in lab], t):
                            lab[i] = h[i]
                    assert len(lab) <= n, (c["label"], n, len(lab))
                    try:
                        tp[margin] = A.audit_interval(p2, f, lab)
                    except ValueError:
                        tp[margin] = "err"
            if tp[margin] == "err":
                errs.add(nm)
            else:
                ivs[nm] = tp[margin]
        for nm in CANDS:
            if nm in errs:
                res[nm].append((*pooled, cl, True))
            else:
                _, a, b = ivs[nm]
                res[nm].append(((b - a) / 2, a <= truth <= b, cl, False))
    return res, fired


def one_cell(args):
    c, reps = args
    res, fired = run(c, reps)
    ref = sum(x[0] for x in res["pooled"]) / reps
    lines = []
    for name in RULES:
        r = res[name]
        w = sum(x[0] for x in r) / reps
        adm = [x for x in r if x[2]]
        lines.append(f"{c['label']} | {c['n']} | {c['J']:.3f} | {name} | {int(c['corpus'] == 'naija')} | "
                     f"{100 * sum(x[1] for x in r) / reps:.1f} | {100 * w:.3f} | {w / ref:.3f} | {len(adm)} | "
                     f"{sum(x[1] for x in adm)} | {sum(x[3] for x in r)} | {fired.get(name, 0)}")
    print("\n".join(lines), flush=True)
    return lines


def draws(reps):
    cs = list(BC.cells())
    with Pool(4) as p:
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
    old = Y.parse(HERE / "h7bd_tested_check_draws.txt")
    ms = ("cov", "ratio", "adm", "admc", "fired")
    rep = ("pooled", "t10", "p5j40")
    same = [k for k in keys if all(by[(*k, r)][m] == old[(*k, r)][m] for r in rep for m in ms)]
    out.append(f"P0 {', '.join(rep)} replay 7bd in {len(same)} of {len(keys)}: "
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

    def p4_fail(nm):
        return [(k, by[(*k, nm)]["cov"]) for k in keys
                if by[(*k, nm)]["cov"] < 93.0 and by[(*k, "p5j40")]["cov"] >= 93.0]

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
                   f"{p4_fail(nm)}")
    out.append("admitted coverage in the many-miss cells: " + "; ".join(
        f"{k[0]} n {k[1]} ({by[(*k, 'p5j40')]['adm']}): " + ", ".join(
            f"{nm} {admcov(nm, k):.1f} r {by[(*k, nm)]['ratio']:.3f}" for nm in ["p5j40", "pooledA"] + NEW)
        for k in MANY if (*k, "p5j40") in by))
    p1 = sum(admcov("pooledA", k) < 93.0 for k in MANY if (*k, "pooledA") in by)
    out.append(f"P1 pooledA under 93% admitted in {p1} of the {len(MANY)} many-miss cells: "
               f"{'yes' if p1 >= 4 else 'no'} (needs 4); pooledA admitted coverage, weak cells "
               f"{pooled_adm('pooledA', weak)[0]:.1f}%, all cells {pooled_adm('pooledA', keys)[0]:.1f}% "
               f"(p5j40 {pooled_adm('p5j40', weak)[0]:.1f}%, {pooled_adm('p5j40', keys)[0]:.1f}%); its cells "
               f"under 88%: {adm_low('pooledA')}")
    for nm in NEW:
        p2 = sum(admcov(nm, k) >= 88.0 for k in MANY if (*k, nm) in by)
        out.append(f"P2 {nm} lifts {p2} of the {len(MANY)} many-miss cells to 88%+ admitted"
                   + (f": {'yes' if p2 >= 5 else 'no'} (jp40 needs 5)" if nm == "jp40" else ""))
    g0, n0 = gain("p5j40", go), gain("p5j40", na)
    out.append("P3 share of p5j40's GoEmotions gain kept: " + ", ".join(f"{nm} {gain(nm, go) / g0:.3f}" for nm in NEW))
    out.append("P4 no cell under 93% where p5j40 covers: " + ", ".join(
        f"{nm} {'yes' if not p4_fail(nm) else 'no'} ({len(p4_fail(nm))})" for nm in NEW))
    out.append("fire rate in good-coder cells (% of admitted draws): " + ", ".join(
        f"{nm} {fire_rate(nm, good):.1f}" for nm in NEW) + "; weak cells: " + ", ".join(
        f"{nm} {fire_rate(nm, weak):.1f}" for nm in NEW) + "; the many-miss cells: " + ", ".join(
        f"{nm} {fire_rate(nm, [k for k in MANY if (*k, nm) in by]):.1f}" for nm in NEW))
    nweak = [k for k in na if k in weak]
    p0w = pooled_adm("p5j40", nweak)[0]

    def p5(nm):
        return gain(nm, na) >= 0.9 * n0 and pooled_adm(nm, nweak)[0] >= p0w

    out.append(f"P5 NaijaSenti: 90%+ of p5j40's gain ({n0:.3f}) and weak admitted coverage at least {p0w:.1f}%: "
               + ", ".join(f"{nm} {gain(nm, na):.3f} / {pooled_adm(nm, nweak)[0]:.1f}% {'yes' if p5(nm) else 'no'}"
                           for nm in NEW))
    p0wc, p0bad = pooled_adm("p5j40", weak)[0], len(adm_low("p5j40"))

    def checks(nm):
        return dict(a=not p4_fail(nm), b=pooled_adm(nm, weak)[0] >= p0wc, c=len(adm_low(nm)) < p0bad,
                    d=gain(nm, go) >= 0.9 * g0, e=p5(nm))

    for nm in NEW:
        out.append(f"decision checks {nm}: " + ", ".join(f"({x}) {'yes' if v else 'no'}" for x, v in checks(nm).items()))
    ok = [nm for nm in NEW if all(checks(nm).values())]
    if ok:
        out.append(f"Decision rule: qualifying {ok}; {max(ok, key=gain)} goes to a fresh-cell check, then the default")
    else:
        out.append("Decision rule: none qualifies; the default stays p5j40")
    text = "\n".join(out); print(text); SUMMARY.write_text(text + "\n")


def main():
    mode = ARGS[0] if ARGS else "summary"
    if mode == "summary":
        summary()
    elif mode == "smoke":
        c = next(BC.cells())
        print("\n".join(one_cell((c, int(ARGS[1]) if len(ARGS) > 1 else 10))))
    else:
        draws(int(ARGS[1]) if len(ARGS) > 1 else 1000)


if __name__ == "__main__":
    main()
