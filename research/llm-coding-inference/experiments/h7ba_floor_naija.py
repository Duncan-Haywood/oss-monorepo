"""Milestone 7ba: does the new library default floor (7az's p5j40) stay valid and cheap on a second corpus, in another
language family, and with real zero-shot LLM coders, in cells never used to choose it? (7az's next step (1).)

Why. 7az made `plan_audit(..., neg_floor=NEG_FLOOR)`, NEG_FLOOR = (5, 0.40, 2), the default: a one-phase cells plan
whose pilot shows fewer than 5 coder misses (human 1, coder 0) and J_hat under 0.40 has its coder-negative cell's
variance floored at the plus-two pseudo-count variance. It was chosen on 130 GoEmotions cells, every one coded by the
GoEmotions lr coder or Qwen2.5-1.5B; its 16 fresh cells were one coder family on known categories at new sizes, which
tested the cost (good coders spared) far better than the repair. This is the check on a corpus the floor line has never
touched: NaijaSenti (Hausa, Igbo, Nigerian Pidgin, Yoruba tweets; label 1 = negative sentiment), with the in-language
naive Bayes coder (milestone 3b) and two zero-shot local LLMs (Qwen2.5 1.5B and 3B, scores committed in milestone 5).

Corpora (chosen now, before any draw; the same construction as 7ax). Positives (label 1) thinned at random (seed
THIN_SEED) to a share p of the corpus, keeping every negative; codes unchanged.
  nb    whole NaijaSenti test part, nb-in-language coder, p 0.05 / 0.10 / native (no thinning).
  q15   the 6,000-item LLM-coded subsample, Qwen2.5-1.5B-Instruct, code = score > 0, same p.
  q3    the same subsample, Qwen2.5-3B-Instruct, same p.
n 300 / 500 / 1,000. 27 cells, 1,000 draws each (+/- 1.4 points). Disclosed: the nb coder at 5% and 10% (a different
thinning seed) was in 7ag and 7ah's cells at n 600 and 2,000, before any floor existed; neither LLM coder has been run
with a cells plan in this line. Known before this was written: whole-subsample J at the native prevalence, nb 0.388,
1.5B 0.208, 3B 0.061 (7ax), and 7ax's J on its rare thinned corpora (nb 0.38 to 0.44). So the nb coder sits just under
the 0.40 ceiling and its pilots will often read J_hat under it: this is the floor's cost test on a mid coder, which the
GoEmotions cells did not have (their good coders sat at 0.75). The two LLM coders are weak (the repair test).

Rules (plan and labels are t10's, common random numbers; scheme and seeds as `h7az_joint_trigger.run`):
  pooled  plain random audit, control-variate interval (the width reference).
  t10     the shipped rule with no floor (pilot 0.7 n, budget cap, tau 0.1, 3-miss guard).
  p5j40   the library default: floor when pilot misses < 5 and pilot J_hat < 0.40. Every draw asserts that it equals
          `A.audit_interval(A.plan_audit(..., neg_floor=A.NEG_FLOOR_7AZ), ...)` to 1e-12, i.e. the library itself.
  p5j50   7az's runner-up (ceiling 0.50); secondary, decides nothing.
The rare-count fallback stays pinned off (A.RARE_FALLBACK = None) so the comparison isolates the floor; at 5% and above
an audit of 300 expects 15 or more positives and the fallback (under 3) almost never applies.

    python3 experiments/h7ba_floor_naija.py draws [reps]   # -> h7ba_floor_naija_draws.txt
    python3 experiments/h7ba_floor_naija.py summary        # predictions and decision rule -> h7ba_floor_naija.txt
    python3 experiments/h7ba_floor_naija.py smoke [reps]   # first cell only, printed

Prediction (written and committed before any draw; a 10-draw smoke test of one cell may run first and is disclosed):
  P1  (decisive, do no harm) no cell where t10 covers 93% or more falls under 93% under p5j40.
  P2  (decisive, conditional validity) admitted coverage pooled over the weak cells (J < 0.30, the two LLM coders) is at
      least t10's under p5j40; guess t10 93 to 96%, p5j40 1 point higher or more.
  P3  (repair) of the cells with 30+ admitted draws where t10's admitted coverage is under 88%, p5j40 lifts at least
      half to 88%+. Guess: 0 to 3 such cells, all LLM coders at p 0.05 or 0.10; if there are none, P3 is void.
  P4  (decisive, cost) p5j40 keeps at least 90% of t10's summed gain over pooled (sum over cells of 1 - ratio), over
      all 27 cells. Guess 85 to 95%: unlike 7az's good coders, the nb coder's pilots sit near the 0.40 ceiling, so the
      floor will fire there; how often decides P4. If t10's summed gain is under 0.10, P4 is reported but void.
  P5  (secondary) p5j50 fires more and keeps less gain than p5j40 (guess under 85%).
  Decision rule, fixed now. P1, P2 and P4 hold (P4 void counts as holding): the default stays p5j40 and the paper says
  it replicated on a second corpus with LLM coders. P1 or P2 fails: the default reverts to no floor (NEG_FLOOR = None,
  validity first; the floor was adopted to repair coverage, so a corpus where it harms coverage removes its reason),
  and the paper states it. P1 and P2 hold and P4 fails: the default stays p5j40 (validity before width, as 7av and
  7ax), and the paper's limitation 6 states the cost on a mid coder near the ceiling.
"""
import random
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))
from llmci import audit_design as A  # noqa: E402
A.NEG_FLOOR_7AZ = A.NEG_FLOOR  # the library default under test, read before pinning
A.RARE_FALLBACK = None  # pinned: isolates the floor
A.NEG_FLOOR = None  # pinned: t10 is the unfloored rule
import h7au_neg_floor as U  # noqa: E402
import h7ay_cond_floor as Y  # noqa: E402
import h7at_weak_admit as W  # noqa: E402

PREVS = (0.05, 0.10, None)  # None = native, no thinning
NS = (300, 500, 1000)
CODERS = (("nb", "nb-in-language"), ("q15", "llm-Qwen2.5-1.5B-Instruct"), ("q3", "llm-Qwen2.5-3B-Instruct"))
THIN_SEED = 20261117
SEED = 20261118
SHARE = U.SHARE
FLOOR = ("neg", "pseudo", 2)
CANDS = {"t10": None, "p5j40": (5, 0.40), "p5j50": (5, 0.50)}
RULES = ["pooled"] + list(CANDS)
WEAK_J, GOOD_J = U.WEAK_J, U.GOOD_J
OUT = HERE / "h7ba_floor_naija_draws.txt"
SUMMARY = HERE / "h7ba_floor_naija.txt"
HEAD = Y.HEAD


def cells():
    import h3_llm_width as H3
    train, test, idx = H3.corpus()
    k = 0
    for tag, cname in CODERS:
        codes, sc = H3.coder(cname, train, test)
        if sc is None:
            base = list(range(len(test)))
            code = {i: int(codes[i]) for i in base}
        else:
            base = [i for i in idx if i in sc]
            code = {i: int(sc[i] > 0) for i in base}
        zeros = [i for i in base if test[i][2] == 0]
        ones = [i for i in base if test[i][2] == 1]
        for p in PREVS:
            if p is None:
                keep = sorted(base)
            else:
                m = round(p / (1 - p) * len(zeros))
                keep = sorted(zeros + random.Random(THIN_SEED + int(p * 1e4)).sample(ones, m))
            h = [test[i][2] for i in keep]
            f = [code[i] for i in keep]
            for n in NS:
                k += 1
                yield dict(label=f"{tag} p{p if p else 'native'}", n=n, h=h, f=f, J=A.informedness(h, f),
                           prev=sum(h) / len(h), fresh=True, seed=SEED + 101 * k)


def run(c, reps):
    """`h7az_joint_trigger.run`'s scheme line for line, plus the library check of p5j40."""
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
        _, lo, hi = A.audit_interval(plan, f, labels)
        res["pooled"].append(((hi - lo) / 2, lo <= truth <= hi, False, False))
        sb = random.Random(c["seed"] + 7 * d)
        pilot = full[:k]
        pm = sum(1 for i in pilot if h[i] and not f[i])
        jh = W.j_lower([h[i] for i in pilot], [f[i] for i in pilot], 0.0)
        plabels = {i: h[i] for i in pilot}
        labels = dict(plabels)
        plan = A.plan_audit(f, labels, n, tau=0.10, neg_guard=A.NEG_GUARD)
        libplan = A.plan_audit(f, dict(plabels), n, tau=0.10, neg_guard=A.NEG_GUARD, neg_floor=A.NEG_FLOOR_7AZ)
        if plan["design"] == "pooled":
            labels = {i: h[i] for i in full}
            plan = dict(plan, to_label=[0])
        for cell, t in zip(plan["cells"], plan["to_label"]):
            for i in sb.sample([i for i in cell if i not in labels], t):
                labels[i] = h[i]
        assert len(labels) <= n, (c["label"], n, len(labels))
        cl = plan["design"] == "cells"
        assert libplan["design"] == plan["design"]
        if cl:
            assert pm >= A.NEG_GUARD and all(f[i] == 0 for i in plan["cells"][0]), (c["label"], n, d)
            assert jh >= 0.10, (c["label"], n, d, jh)
        try:
            lib = A.audit_interval(plan, f, labels)
            mine = U.interval(plan, f, labels, None)
            assert max(abs(a - b) for a, b in zip(lib, mine)) < 1e-12, (c["label"], n, d, lib, mine)
            for nm, trig in CANDS.items():
                on = trig is not None and cl and pm < trig[0] and jh < trig[1]
                fired[nm] += on
                iv = U.interval(plan, f, labels, FLOOR if on else None)
                if nm == "p5j40" and cl:
                    assert ("neg_pseudo" in libplan) == on, (c["label"], n, d)
                    lib = A.audit_interval(dict(libplan, to_label=plan["to_label"]), f, labels)
                    assert max(abs(a - b) for a, b in zip(lib, iv)) < 1e-12, (c["label"], n, d, lib, iv)
                _, lo, hi = iv
                res[nm].append(((hi - lo) / 2, lo <= truth <= hi, cl, False))
        except ValueError:  # a cell with fewer than two labels; counted and reported, never silently dropped
            _, lo, hi = A.audit_interval({"design": "pooled", "cells": [list(range(N))]}, f, labels)
            for nm in CANDS:
                res[nm].append(((hi - lo) / 2, lo <= truth <= hi, cl, True))
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
        lines.append(f"{c['label']} | {c['n']} | {c['J']:.3f} | {name} | {int(c['fresh'])} | "
                     f"{100 * sum(x[1] for x in r) / reps:.1f} | {100 * w:.3f} | {w / ref:.3f} | {len(adm)} | "
                     f"{sum(x[1] for x in adm)} | {sum(x[3] for x in r)} | {fired.get(name, 0)}")
    print("\n".join(lines), flush=True)
    return lines


def draws(reps):
    cs = list(cells())
    for c in cs[::3]:
        print(f"{c['label']}: N {len(c['h'])}, positives {sum(c['h'])}, prevalence {c['prev']:.4f}, J {c['J']:.3f}",
              flush=True)
    with Pool(4) as p:
        got = p.map(one_cell, [(c, reps) for c in cs], chunksize=1)
    OUT.write_text("\n".join([HEAD] + [l for g in got for l in g]) + "\n")


def summary():
    by = Y.parse(OUT)
    keys = list(dict.fromkeys((k[0], k[1]) for k in by))
    weak = [k for k in keys if by[(*k, "pooled")]["J"] < WEAK_J]
    names = list(CANDS)

    def admcov(nm, k):
        b = by[(*k, nm)]
        return 100 * b["admc"] / b["adm"] if b["adm"] else float("nan")

    def pooled_adm(nm, ks):
        a = sum(by[(*k, nm)]["adm"] for k in ks)
        return (100 * sum(by[(*k, nm)]["admc"] for k in ks) / a if a else float("nan")), a

    def gain(nm, ks=keys):
        return sum(1 - by[(*k, nm)]["ratio"] for k in ks)

    def p1_fail(nm):
        return [(k, by[(*k, nm)]["cov"]) for k in keys if by[(*k, "t10")]["cov"] >= 93.0 and by[(*k, nm)]["cov"] < 93.0]

    out = [f"cells run: {len(keys)} ({len(weak)} weak J < {WEAK_J}); errors (cell with < 2 labels): "
           f"{sum(by[(*k, nm)]['err'] for k in keys for nm in names)}; p5j40 library check asserted on every draw"]
    for k in keys:
        b = by[(*k, "t10")]
        out.append(f"{k[0]} n {k[1]} (J {b['J']:.3f}, pooled cov {by[(*k, 'pooled')]['cov']:.1f}, cells in {b['adm']}): "
                   + ", ".join(f"{nm} ratio {by[(*k, nm)]['ratio']:.3f} cov {by[(*k, nm)]['cov']:.1f} adm "
                               f"{admcov(nm, k):.1f} fired {by[(*k, nm)]['fired']}" for nm in names))
    adm_all = sum(by[(*k, "t10")]["adm"] for k in keys)
    for nm in names:
        out.append(f"{nm}: summed gain {gain(nm):.3f} (weak {gain(nm, weak):.3f}, nb "
                   f"{gain(nm, [k for k in keys if k[0].startswith('nb')]):.3f}); fired in "
                   f"{sum(by[(*k, nm)]['fired'] for k in keys)} of {adm_all} admitted draws; weak admitted coverage "
                   f"{pooled_adm(nm, weak)[0]:.1f}% of {pooled_adm(nm, weak)[1]}; under 93% where t10 is not: {p1_fail(nm)}")
    p1 = not p1_fail("p5j40")
    wc0, wc1 = pooled_adm("t10", weak)[0], pooled_adm("p5j40", weak)[0]
    p2 = wc1 >= wc0 or pooled_adm("t10", weak)[1] == 0
    out.append(f"P1 p5j40 no cell under 93% where t10 covers: {'yes' if p1 else 'no'}")
    out.append(f"P2 p5j40 weak admitted coverage {wc1:.1f}% at least t10's {wc0:.1f}%: {'yes' if p2 else 'no'}")
    fail = [k for k in keys if by[(*k, "t10")]["adm"] >= 30 and admcov("t10", k) < 88.0]
    fixed = [k for k in fail if admcov("p5j40", k) >= 88.0]
    out.append(f"P3 t10 cells with 30+ admitted draws under 88%: {len(fail)} "
               "(" + "; ".join(f"{a} n {b} {admcov('t10', (a, b)):.1f} -> {admcov('p5j40', (a, b)):.1f}"
                               for a, b in fail) + "); "
               f"lifted to 88%+: {len(fixed)}: " + ("void" if not fail else ("yes" if 2 * len(fixed) >= len(fail) else "no")))
    g0 = gain("t10")
    void = g0 < 0.10
    kept = gain("p5j40") / g0 if g0 else float("nan")
    p4 = void or kept >= 0.90
    out.append(f"P4 p5j40 keeps {kept:.3f} of t10's summed gain {g0:.3f}: "
               + ("void (t10 gain under 0.10)" if void else ("yes" if p4 else "no")))
    k50 = gain("p5j50") / g0 if g0 else float("nan")
    out.append(f"P5 p5j50 keeps {k50:.3f} and fires more than p5j40: "
               f"{'yes' if sum(by[(*k, 'p5j50')]['fired'] for k in keys) > sum(by[(*k, 'p5j40')]['fired'] for k in keys) and k50 < kept else 'no'}")
    if p1 and p2 and p4:
        out.append("Decision rule: p5j40 replicates; the library default stays NEG_FLOOR = (5, 0.40, 2)")
    elif not (p1 and p2):
        out.append("Decision rule: P1 or P2 fails; the default reverts to NEG_FLOOR = None")
    else:
        out.append("Decision rule: P1 and P2 hold, P4 fails; the default stays (5, 0.40, 2) and limitation 6 states the cost")
    text = "\n".join(out); print(text); SUMMARY.write_text(text + "\n")


def main():
    mode = ARGS[0] if ARGS else "summary"
    if mode == "summary":
        summary()
    elif mode == "smoke":
        c = next(cells())
        print("\n".join(one_cell((c, int(ARGS[1]) if len(ARGS) > 1 else 10))))
    else:
        draws(int(ARGS[1]) if len(ARGS) > 1 else 1000)


if __name__ == "__main__":
    main()
