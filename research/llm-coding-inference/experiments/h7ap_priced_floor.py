"""Milestone 7ap: does pricing the second-phase floor in the width forecast, and keeping the coder-positive cell's
pilot labels (two-phase only in the coder-negative cell), turn 7ao's bias-free fallback into a net gain over the
shipped rule? (7ao's next step, options (a) and (c).)

7ao's two-phase fallback (gtp2) removed the selection bias of 7an's guard-first rule (guard-fail cells draws covered
96 to 100% where gf2 covered 42 to 63%), but its total gain on 7am's 39 cells was 2.674, below the shipped rule's 2.760:
where the width forecast accepted a fallback plan, the audit came out wider than the shipped rule's pooled answer
(gratitude n 1,000 0.923 against 0.883, love n 1,000 0.860 against 0.832). 7ao's reading, untested: the interval floors
each cell's variance at plus-four of its second-phase labels, a sample of k_h items, while the forecast floors at
plus-four of the pilot, a larger sample, so it underprices a small second phase. With a pilot holding 0 to 2 coder
misses among ~470 coder negatives the floor at the pilot is about (2 + 2) / 474 = 0.008; at a second phase of 180 it is
about (0.8 + 2) / 184 = 0.015, nearly twice.

Library (new, defaults off): `priced_two_phase` (allocation and forecast for a two-phase plan, optionally pricing the
floor at the second-phase size, optionally two-phase in the coder-negative cell only); `plan_audit(..., two_phase="neg",
price_floor=True)`, `fallback_two_phase="neg"`, `predicted_ratio(..., price_floor=True)`; `audit_interval` closes a
plan whose coder-positive cell reuses its pilot labels (ordinary SRS mean, FPC on N_1).

Rules (all non-pooled: tau 0.1, guard 0, width_margin 0):
    pooled
    shipped  neg_guard 3, pseudo 0 (the library default)
    gtp2     7ao's candidate (guard-first; fallback two-phase in both cells with pseudo 2; floor priced at the pilot)
    gtp2p    gtp2 with the floor priced at the second-phase size (option c)
    gtn2p    gtp2p with only the coder-negative cell two-phase; the coder-positive cell keeps its pilot (options a + c)

Cells: 7ao's 51 (same seeds and draw streams). No fresh cells this time: 7ao's six were picked blind and are already in
the set; the question is about rules that differ from gtp2 only in fallback draws. 1,000 draws per cell (+/- 1.4 points).
On GoEmotions cells pilots are shared across rules, so shipped, gtp2, gtp2p and gtn2p are identical in guard-pass draws
and differ only where the guard fails. NaijaSenti cells use one stream per rule, so their ratios carry Monte Carlo noise
of about 0.01 between rules (7am to 7ao each saw lexicon-en 2% n 600 at 1.011 to 1.013 with cells in 0% of draws); P3 is
therefore stated on the 45 GoEmotions cells, and the NaijaSenti maxima are reported beside it.

    python3 experiments/h7ap_priced_floor.py draws [reps]   # -> h7ap_priced_floor_draws.txt
    python3 experiments/h7ap_priced_floor.py summary        # decision rule -> h7ap_priced_floor.txt
    python3 experiments/h7ap_priced_floor.py posthoc [reps] # exploratory, added after the summary (see below)

Prediction (written and committed before any draw):
  P0  (replay) shipped and gtp2 reproduce 7ao's committed ratios in all 51 cells to three decimals.
  P1  gtp2p and gtn2p each cover 93% or more in all 51 cells.
  P2  conditional: gtp2p and gtn2p each cover 88% or more among guard-fail draws that used cells, in every GoEmotions
      cell with at least 50 such draws (gtn2p reuses the coder-positive pilot; the guard does not look there, so the
      selection should not return).
  P3  gtp2p and gtn2p are no more than 1.010 times pooled in all 45 GoEmotions cells.
  P4  total gain (sum of 1 - ratio) over 7am's 39 cells: gtp2p >= shipped (2.760); guess 2.74 to 2.79, since a
      correctly priced forecast sends to pooled the fallback plans that 7ao found wider, which is where shipped already
      is. gtn2p >= gtp2p; guess +0.01 to +0.04, because the coder-positive cell holds only ~5 to 10% of a pilot.
  P5  (mechanism) in gratitude n 1,000 and love n 1,000, gtp2p's ratio is closer to shipped's than gtp2's is
      (gtp2 0.923 and 0.860, shipped 0.883 and 0.832).
  Decision rule, fixed now: a rule is adopted only if P1 to P4 hold for it and its gain on 7am's 39 cells beats
  shipped's by 0.05 or more (about 2% of the gain; less is not worth a second code path in the default plan). Then the
  defaults become FALLBACK_PSEUDO 2, FALLBACK_TWO_PHASE (True or "neg") and PRICE_FLOOR True in a follow-up PR that pins
  every earlier script. Otherwise every default stays off and the summary says which prediction failed.

POST HOC (added after the summary was read; exploratory, decides nothing): the per-draw diff behind gtp2p's shortfall
showed single fallback draws at about 3 times the pooled width (0.5B fear n 500, draw 814: a pilot holding one positive,
which the coder labelled 1, so lambda is 1, every pooled residual is 0, `predicted_ratio` returns its "no information"
1.0 and the margin-0 gate lets cells through). `posthoc` reruns with no_info=inf (such a pilot goes to pooled):
    shipq  shipped with no_info inf (does the edge case touch the shipped rule?)
    gtp2q  gtp2p with no_info inf
    gtn2q  gtn2p with no_info inf
on the same 51 cells and streams -> h7ap_posthoc_draws.txt and h7ap_posthoc.txt. Any adoption needs a fresh
pre-registered test (7aq), since this one was chosen after seeing these draws.
"""
import sys
from multiprocessing import Pool
from pathlib import Path
import random

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))
from llmci import audit_design as A  # noqa: E402
import h7ao_two_phase as T  # noqa: E402

# name, neg_guard, pseudo, fallback_pseudo, two_phase, fallback_two_phase, price_floor
RULES = [("pooled", 0, 0.0, None, False, False, False), ("shipped", 3, 0.0, None, False, False, False),
         ("gtp2", 3, 0.0, 2.0, False, True, False), ("gtp2p", 3, 0.0, 2.0, False, True, True),
         ("gtn2p", 3, 0.0, 2.0, False, "neg", True)]
CANDIDATES = ("gtp2p", "gtn2p")
INF = float("inf")
POSTHOC = [RULES[0], RULES[1], ("shipq", 3, 0.0, None, False, False, False, INF), RULES[3],
           ("gtp2q", 3, 0.0, 2.0, False, True, True, INF), ("gtn2q", 3, 0.0, 2.0, False, "neg", True, INF)]
POST_OUT = HERE / "h7ap_posthoc_draws.txt"
OUT = HERE / "h7ap_priced_floor_draws.txt"
HEAD = T.HEAD


def run(c, reps, rules=RULES):
    """7ao's draw loop with the price_floor switch (goemo: common pilots, per-draw streams; naija: one stream per rule)."""
    h, f, n = c["h"], c["f"], c["n"]
    N, truth = len(h), sum(h) / len(h)
    res = {}
    if c["part"] == "goemo":
        rr = random.Random(c["seed"] + 5)
        pilots = [rr.sample(range(N), n // 2) for _ in range(reps)]
    for name, ng, a, fb, tp, ftp, pf, *ni in rules:
        out = []
        if c["part"] != "goemo":
            rr = random.Random(c["seed"])
        tau = 2.0 if name == "pooled" else A.TAU
        for d in range(reps):
            if c["part"] == "goemo":
                pilot, sb = pilots[d], random.Random(c["seed"] + 7 * d)
            else:
                pilot, sb = rr.sample(range(N), round(A.PILOT_SHARE_PRE7AR * n)), rr
            labels = {i: h[i] for i in pilot}
            passed = sum(1 for i in pilot if h[i] and not f[i]) >= A.NEG_GUARD
            plan = A.plan_audit_pre7ar(f, labels, n, tau=tau, guard=0, neg_guard=ng, width_margin=0.0, pseudo=a,
                                fallback_pseudo=fb, two_phase=tp, fallback_two_phase=ftp, price_floor=pf,
                                no_info=ni[0] if ni else 1.0)
            for cell, t in zip(plan["cells"], plan["to_label"]):
                for i in sb.sample([i for i in cell if i not in labels], t):
                    labels[i] = h[i]
            est, lo, hi = A.audit_interval(plan, f, labels)
            out.append(((hi - lo) / 2, lo <= truth <= hi, plan["design"] == "cells", bool(plan.get("fallback")),
                        passed))
        res[name] = out
    return res


def one_cell(args):
    c, reps, *rs = args
    rules = rs[0] if rs else RULES
    res = run(c, reps, rules)
    wp = sum(x[0] for x in res["pooled"]) / reps
    lines = []
    for name, *_r in rules:
        r = res[name]
        w = sum(x[0] for x in r) / reps
        gp = [x for x in r if x[2] and x[4]] if c["part"] == "goemo" else []
        gf = [x for x in r if x[2] and not x[4]] if c["part"] == "goemo" else []

        def cov(xs):
            return f"{100 * sum(x[1] for x in xs) / len(xs):.1f}" if xs else "nan"
        lines.append(f"{c['label']} | {c['n']} | {c['J']:.3f} | {name} | {100 * sum(x[2] for x in r) / reps:.1f} | "
                     f"{100 * sum(x[3] for x in r) / reps:.1f} | {100 * sum(x[1] for x in r) / reps:.1f} | "
                     f"{100 * w:.3f} | {w / wp:.3f} | {len(gp)} | {cov(gp)} | {len(gf)} | {cov(gf)}")
    print("\n".join(lines), flush=True)
    return lines


def draws(reps):
    cs = list(T.cells())
    with Pool(4) as p:
        got = p.map(one_cell, [(c, reps) for c in cs], chunksize=1)
    OUT.write_text("\n".join([HEAD] + [l for g in got for l in g]) + "\n")


def posthoc(reps):
    cs = list(T.cells())
    with Pool(4) as p:
        got = p.map(one_cell, [(c, reps, POSTHOC) for c in cs], chunksize=1)
    POST_OUT.write_text("\n".join([HEAD] + [l for g in got for l in g]) + "\n")
    by = {}
    for line in POST_OUT.read_text().splitlines()[1:]:
        x = [s.strip() for s in line.split("|")]
        by[(x[0], int(x[1]), x[3])] = x
    keys = list(dict.fromkeys((k[0], k[1]) for k in by))
    old39 = [k for k in keys if not k[0].startswith("lr ")]
    goemo = [k for k in keys if not k[0].startswith(("nb-", "lexicon-"))]
    out = ["POST HOC (exploratory; chosen after reading the 7ap summary): no_info=inf sends a pilot the width forecast "
           "cannot read to pooled"]
    for nm, *_r in POSTHOC[1:]:
        g39 = sum(1 - float(by[(*k, nm)][8]) for k in old39)
        g51 = sum(1 - float(by[(*k, nm)][8]) for k in keys)
        cov = min(float(by[(*k, nm)][6]) for k in keys)
        gf = [(k, int(by[(*k, nm)][11]), float(by[(*k, nm)][12])) for k in goemo if int(by[(*k, nm)][11]) >= 50]
        ov = [(k, float(by[(*k, nm)][8])) for k in goemo if float(by[(*k, nm)][8]) > 1.010]
        out.append(f"{nm}: gain 7am cells {g39:.3f}, all 51 {g51:.3f}; min coverage {cov:.1f}; GoEmotions above 1.010: "
                   f"{ov}; guard-fail cells draws >= 50: {[(k, n_, c_) for k, n_, c_ in gf]}")
    text = "\n".join(out); print(text); (HERE / "h7ap_posthoc.txt").write_text(text + "\n")


def committed():
    got = {}
    for line in (HERE / "h7ao_two_phase_draws.txt").read_text().splitlines()[1:]:
        x = [s.strip() for s in line.split("|")]
        if x[3] in ("shipped", "gtp2"):
            got[(x[0], int(x[1]), x[3])] = float(x[8])
    return got


def summary():
    rows = []
    for line in OUT.read_text().splitlines()[1:]:
        x = [s.strip() for s in line.split("|")]
        rows.append(dict(cell=x[0], n=int(x[1]), J=float(x[2]), rule=x[3], obs=float(x[4]), fb=float(x[5]),
                         cov=float(x[6]), ratio=float(x[8]), gp=int(x[9]), gpc=float(x[10]), gf=int(x[11]),
                         gfc=float(x[12])))
    by = {(r["cell"], r["n"], r["rule"]): r for r in rows}
    keys = list(dict.fromkeys((r["cell"], r["n"]) for r in rows))
    naija = [k for k in keys if k[0].startswith(("nb-", "lexicon-"))]
    goemo = [k for k in keys if k not in naija]
    old39 = [k for k in keys if not k[0].startswith("lr ")]
    com = committed()
    out = [f"cells run: {len(keys)} ({len(goemo)} GoEmotions, {len(naija)} NaijaSenti; {len(old39)} are 7am's)"]
    diff = [(k, nm) for k in keys for nm in ("shipped", "gtp2")
            if (*k, nm) in com and abs(com[(*k, nm)] - by[(*k, nm)]["ratio"]) > 0.0005]
    out.append(f"P0 replay of 7ao shipped and gtp2 ratios: {2 * len(keys) - len(diff)} of {2 * len(keys)} identical; "
               f"differ {diff}")
    for k in keys:
        def tag(nm):
            r = by[(*k, nm)]
            s = f"{nm} {r['ratio']:.3f} ({r['obs']:.0f}% cells, cov {r['cov']:.1f}"
            if r["gf"]:
                s += f"; guard-fail cells {r['gf']} at {r['gfc']:.1f}"
            return s + ")"
        out.append(f"{k[0]} n {k[1]} (J {by[(*k, 'pooled')]['J']:.3f}; pooled cov {by[(*k, 'pooled')]['cov']:.1f}): "
                   + ", ".join(tag(nm) for nm, *_r in RULES[1:]))

    def low(nm, ks):
        return [(k, by[(*k, nm)]["cov"]) for k in ks if by[(*k, nm)]["cov"] < 93.0]

    def over(nm, ks):
        return [(k, by[(*k, nm)]["ratio"]) for k in ks if by[(*k, nm)]["ratio"] > 1.010]

    def gain(nm, ks):
        return sum(1 - by[(*k, nm)]["ratio"] for k in ks)

    def cond(nm):
        return [(k, by[(*k, nm)]["gf"], by[(*k, nm)]["gfc"]) for k in goemo if by[(*k, nm)]["gf"] >= 50]

    for nm, *_r in RULES[1:]:
        cs = cond(nm)
        worst = min(cs, key=lambda t: t[2]) if cs else None
        out.append(f"{nm}: gain 7am cells {gain(nm, old39):.3f}, all 51 {gain(nm, keys):.3f}; min coverage "
                   f"{min(by[(*k, nm)]['cov'] for k in keys):.1f}; under 93%: {low(nm, keys)}; GoEmotions above 1.010: "
                   f"{over(nm, goemo)}; NaijaSenti max {max(by[(*k, nm)]['ratio'] for k in naija):.3f}; guard-fail "
                   f"cells draws: {len(cs)} cells with >= 50" + (f", worst {worst[0]} {worst[2]:.1f}% of {worst[1]}"
                                                                if worst else ""))
    ship = gain("shipped", old39)
    verdict = {}
    for nm in CANDIDATES:
        p1 = not low(nm, keys)
        p2 = all(c >= 88.0 for _k, _n, c in cond(nm))
        p3 = not over(nm, goemo)
        g = gain(nm, old39)
        p4 = g >= ship
        out.append(f"{nm}: P1 {'yes' if p1 else 'no'}, P2 {'yes' if p2 else 'no'}, P3 {'yes' if p3 else 'no'}, "
                   f"P4 {'yes' if p4 else 'no'} ({g:.3f} vs shipped {ship:.3f}, margin {g - ship:+.3f})")
        verdict[nm] = p1 and p2 and p3 and p4 and g - ship >= 0.05
    out.append(f"P4 gtn2p >= gtp2p: {'yes' if gain('gtn2p', old39) >= gain('gtp2p', old39) else 'no'} "
               f"({gain('gtn2p', old39) - gain('gtp2p', old39):+.3f})")
    for k in (("1.5B gratitude", 1000), ("lr love", 1000)):
        s, g, gp = (by[(*k, nm)]["ratio"] for nm in ("shipped", "gtp2", "gtp2p"))
        out.append(f"P5 {k[0]} n {k[1]}: shipped {s:.3f}, gtp2 {g:.3f}, gtp2p {gp:.3f}: "
                   f"{'closer' if abs(gp - s) < abs(g - s) else 'not closer'}")
    won = [nm for nm in CANDIDATES if verdict[nm]]
    out.append("Decision rule: " + (f"{max(won, key=lambda nm: gain(nm, old39))} adopted (follow-up PR sets defaults)"
                                    if won else "not met; every default stays off"))
    text = "\n".join(out); print(text); (HERE / "h7ap_priced_floor.txt").write_text(text + "\n")


def main():
    mode = ARGS[0] if ARGS else "summary"
    if mode == "summary":
        summary()
    elif mode == "posthoc":
        posthoc(int(ARGS[1]) if len(ARGS) > 1 else 1000)
    else:
        draws(int(ARGS[1]) if len(ARGS) > 1 else 1000)


if __name__ == "__main__":
    main()
