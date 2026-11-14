"""Milestone 7ar: should the library's suggested pilot share (`PILOT_SHARE`, 0.3) become 0.5, or larger? (7aq's next
step (1).)

Why. 7aq found that on the 39 GoEmotions cells the shipped rule (3-miss guard, else pooled; tau 0.1, width_margin 0)
keeps only 67% of its width gain at a pilot of 0.3n against 0.5n (2.723 against 4.059), with coverage unchanged, because
the pilot is reused in the estimate (so a larger one costs no labels) and the 3-miss guard counts coder misses in
absolute terms. Its pre-registered trigger for changing the default (shipped30 failing coverage) did not fire, so the
default stayed. Two things were untested: (a) the 12 NaijaSenti cells, which have only ever been run at 0.3n; (b) shares
above 0.5, where the guard passes still more often but the Neyman allocation has less of the budget left to steer.

Design. All 51 cells of 7ao/7ap/7aq (39 GoEmotions, 12 NaijaSenti), 1,000 draws per cell (+/- 1.4 points). Every cell,
NaijaSenti included, now uses GoEmotions-style common random numbers: per draw one random pilot, nested across shares.
Two schemes, so that every ratio has a pooled reference whose sample contains the deciding pilot (7aq's argument: the
decision saw only a prefix of a simple random sample of n, so a pooled audit is still a simple random sample of n):
  A (shares <= 0.5, replays 7aq on GoEmotions): pilot = the same n/2 random pilot as 7aq (seed + 5 stream); the share-s
    pilot is its first round(s n) items; a pooled plan uses the full n/2 pilot plus the per-draw second draw (seed + 7 d).
    Rules pooledA, shipped30, shipped40, shipped50.
  B (shares >= 0.5): the n/2 pilot extended by a random sample of the rest (seed + 11 d) to round(0.7 n); a pooled plan
    uses that 0.7n pilot plus a second draw of the remaining 0.3n (seed + 7 d). Rules pooledB, shipped50B, shipped60,
    shipped70. shipped50B sees the same pilot and draws its cells sample from the same stream as shipped50, so the two
    differ only in pooled draws (a check of the scheme, reported).
On NaijaSenti the draws are new (7ao drew one stream per rule at 0.3n), so they do not replay 7ao; shipped30 there is
compared with 7ao's committed shipped ratios as an observation only.
Gains are sums of (1 - ratio to the scheme's pooled reference). Coverage is also split by whether the deciding pilot
passed the 3-miss guard (here on every cell, NaijaSenti included).

    python3 experiments/h7ar_pilot_default.py draws [reps]   # -> h7ar_pilot_default_draws.txt
    python3 experiments/h7ar_pilot_default.py summary        # predictions and decision rule -> h7ar_pilot_default.txt

Prediction (written and committed before any draw; the only code run before it was a 10-draw smoke test of one cell to
check the script, disclosed in LOG.md):
  P0  (replay) on the 39 GoEmotions cells shipped50 and shipped30 reproduce 7aq's committed ratios to three decimals.
  P1  every shipped rule at every share covers 93% or more in all 51 cells.
  P2  (NaijaSenti) shipped50's gain on the 12 NaijaSenti cells is above shipped30's. Guess: shipped30 about 0.28 (7ao's
      committed shipped sum there is 0.285), shipped50 0.33 to 0.45, the gain coming from the nb-in-language cells at
      2% and 5% prevalence and n 600, where a 0.3n pilot rarely holds 3 coder misses. The 6 lexicon-en cells (J 0.03)
      stay pooled at every share (all ratios 1.000 +/- 0.005).
  P3  shipped40 lies between shipped30 and shipped50 in total gain over the 51 cells.
  P4  (above n/2) shipped60's total gain is within 0.10 of shipped50B's (guess: slightly above at n 500 and 1,000, where
      the guard still refuses, slightly below at n 2,000), and shipped70's is below shipped60's.
  P5  (observation) guard-pass conditional coverage: the number of cells with 50 or more guard-pass cells draws and
      coverage under 88% is at most 2 at every share (7aq: one at 0.5 and one at 0.3).
  P6  (scheme check) shipped50B's total gain is within 0.10 of shipped50's.
  Decision rule, fixed now. Let s* be the share in {0.5, 0.6, 0.7} with the largest total gain over the 51 cells (0.5
  read from scheme A, 0.6 and 0.7 from scheme B, each against its own pooled reference), counting a share only if it
  covers 93% or more in all 51 cells and its gain is at least 0.05 above the next smaller share's (0.6 against
  shipped50B, 0.7 against shipped60). If shipped50 covers 93% or more in all 51 cells, its total gain beats shipped30's
  by 0.05 or more, and its NaijaSenti gain is no more than 0.02 below shipped30's, this PR changes `PILOT_SHARE` to s*
  and pins every script that reads `A.PILOT_SHARE` to 0.3 so each replays as committed. Otherwise the default stays
  at 0.3 and the summary says which condition failed.
"""
import random
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))
from llmci import audit_design as A  # noqa: E402
import h7ao_two_phase as T  # noqa: E402

# name, scheme, share (pooled rules decide nothing: tau 2.0, neg_guard 0)
RULES = [("pooledA", "A", 0.5), ("shipped30", "A", 0.3), ("shipped40", "A", 0.4), ("shipped50", "A", 0.5),
         ("pooledB", "B", 0.7), ("shipped50B", "B", 0.5), ("shipped60", "B", 0.6), ("shipped70", "B", 0.7)]
OUT = HERE / "h7ar_pilot_default_draws.txt"
# Post hoc (exploratory, written after the summary above was read; it decides nothing). Reading the 0.7 result, a check
# of `plan_audit` found that a cells plan's top-ups are max(0, allocation - pilot) per cell, so a pilot holding more of
# one cell than its allocation makes the plan label more than n items. This mode reruns both schemes recording the labels
# each draw spent, and adds budget-capped rules (`plan_audit(..., budget_cap=True)`, new in this PR, default off).
# name, scheme, share, budget_cap
POSTHOC = [("pooledA", "A", 0.5, False), ("shipped40", "A", 0.4, False), ("shipped50", "A", 0.5, False),
           ("shipped50c", "A", 0.5, True), ("pooledB", "B", 0.7, False), ("shipped60", "B", 0.6, False),
           ("shipped70", "B", 0.7, False), ("shipped60c", "B", 0.6, True), ("shipped70c", "B", 0.7, True)]
OUT_PH = HERE / "h7ar_posthoc_draws.txt"
HEAD = T.HEAD


def k_of(share, n):
    return n // 2 if share == 0.5 else round(share * n)


def run(c, reps, rules=None, top=0.7):
    rules = rules or RULES
    h, f, n = c["h"], c["f"], c["n"]
    N, truth = len(h), sum(h) / len(h)
    rr = random.Random(c["seed"] + 5)
    pa = [rr.sample(range(N), n // 2) for _ in range(reps)]  # scheme A pilots: 7aq's exactly
    pb = []
    for d in range(reps):
        seen = set(pa[d])
        pb.append(pa[d] + random.Random(c["seed"] + 11 * d).sample([i for i in range(N) if i not in seen],
                                                                   round(top * n) - n // 2))
    res = {}
    for name, scheme, share, *cap in rules:
        out = []
        pooled = name.startswith("pooled")
        k = k_of(share, n)
        for d in range(reps):
            full = pa[d] if scheme == "A" else pb[d]
            pilot, sb = full[:k], random.Random(c["seed"] + 7 * d)
            labels = {i: h[i] for i in pilot}
            passed = sum(1 for i in pilot if h[i] and not f[i]) >= A.NEG_GUARD
            plan = A.plan_audit(f, labels, n, tau=2.0 if pooled else A.TAU, guard=0, neg_guard=0 if pooled else 3,
                                width_margin=0.0, pseudo=0.0, fallback_pseudo=None, two_phase=False,
                                fallback_two_phase=False, budget_cap=bool(cap and cap[0]))
            if plan["design"] == "pooled" and k < len(full):
                labels = {i: h[i] for i in full}  # common random numbers with the scheme's pooled reference (7aq)
                plan = dict(plan, to_label=[n - len(labels)])
            for cell, t in zip(plan["cells"], plan["to_label"]):
                for i in sb.sample([i for i in cell if i not in labels], t):
                    labels[i] = h[i]
            est, lo, hi = A.audit_interval(plan, f, labels)
            out.append(((hi - lo) / 2, lo <= truth <= hi, plan["design"] == "cells", len(labels), passed))
        res[name] = out
    return res


def one_cell(args):
    c, reps, *ph = args
    rules, top = (POSTHOC if ph else RULES), 0.7
    res = run(c, reps, rules, top)
    ref = {s: sum(x[0] for x in res["pooled" + s]) / reps for s in {r[1] for r in rules}}
    lines = []
    for name, scheme, *_s in rules:
        r = res[name]
        w = sum(x[0] for x in r) / reps
        gp = [x for x in r if x[2] and x[4]]
        gf = [x for x in r if x[2] and not x[4]]

        def cov(xs):
            return f"{100 * sum(x[1] for x in xs) / len(xs):.1f}" if xs else "nan"
        lines.append(f"{c['label']} | {c['n']} | {c['J']:.3f} | {name} | {100 * sum(x[2] for x in r) / reps:.1f} | "
                     f"0.0 | {100 * sum(x[1] for x in r) / reps:.1f} | {100 * w:.3f} | {w / ref[scheme]:.3f} | "
                     f"{len(gp)} | {cov(gp)} | {len(gf)} | {cov(gf)}"
                     + (f" | {sum(x[3] for x in r) / reps / c['n']:.4f} | {max(x[3] for x in r) / c['n']:.4f}" if ph
                        else ""))
    print("\n".join(lines), flush=True)
    return lines


def draws(reps):
    cs = list(T.cells())
    with Pool(4) as p:
        got = p.map(one_cell, [(c, reps) for c in cs], chunksize=1)
    OUT.write_text("\n".join([HEAD] + [l for g in got for l in g]) + "\n")


def posthoc_draws(reps):
    cs = list(T.cells())
    with Pool(4) as p:
        got = p.map(one_cell, [(c, reps, True) for c in cs], chunksize=1)
    OUT_PH.write_text("\n".join([HEAD] + [l for g in got for l in g]) + "\n")


def posthoc_summary():
    by = {}
    for line in OUT_PH.read_text().splitlines()[1:]:
        x = [s.strip() for s in line.split("|")]
        by[(x[0], int(x[1]), x[3])] = dict(obs=float(x[4]), cov=float(x[6]), ratio=float(x[8]), gp=int(x[9]),
                                            gpc=float(x[10]) if x[10] != "nan" else None, lab=float(x[13]),
                                            labmax=float(x[14]))
    keys = list(dict.fromkeys((k[0], k[1]) for k in by))
    part = parts()
    go = [k for k in keys if part[k[0]] == "goemo"]
    na = [k for k in keys if part[k[0]] != "goemo"]
    out = ["POST HOC, exploratory (written after reading h7ar_pilot_default.txt; decides nothing). Labels are the mean "
           "and max per draw as a share of the budget n."]
    for nm in [r[0] for r in POSTHOC if not r[0].startswith("pooled")]:
        g = lambda ks: sum(1 - by[(*k, nm)]["ratio"] for k in ks)  # noqa: E731
        low = [(k, by[(*k, nm)]["cov"]) for k in keys if by[(*k, nm)]["cov"] < 93.0]
        gpl = [(k, by[(*k, nm)]["gp"], by[(*k, nm)]["gpc"]) for k in keys
               if by[(*k, nm)]["gp"] >= 50 and by[(*k, nm)]["gpc"] < 88.0]
        overs = sorted(((k, by[(*k, nm)]["lab"], by[(*k, nm)]["labmax"]) for k in keys if by[(*k, nm)]["lab"] > 1.0005),
                       key=lambda t: -t[1])
        out.append(f"{nm}: gain all {g(keys):.3f} (GoEmotions {g(go):.3f}, NaijaSenti {g(na):.3f}); min coverage "
                   f"{min(by[(*k, nm)]['cov'] for k in keys):.1f}; under 93%: {low}; guard-pass >= 50 draws under "
                   f"88%: {gpl}; max labels {max(by[(*k, nm)]['labmax'] for k in keys):.3f}; cells over budget on "
                   f"average: {len(overs)}, worst {overs[:4]}")
    text = "\n".join(out); print(text); (HERE / "h7ar_posthoc.txt").write_text(text + "\n")


def parts():
    return {c["label"]: c["part"] for c in T.cells()}


def committed(path, rules):
    got = {}
    for line in (HERE / path).read_text().splitlines()[1:]:
        x = [s.strip() for s in line.split("|")]
        if x[3] in rules:
            got[(x[0], int(x[1]), rules[x[3]])] = float(x[8])
    return got


def summary():
    by = {}
    for line in OUT.read_text().splitlines()[1:]:
        x = [s.strip() for s in line.split("|")]
        by[(x[0], int(x[1]), x[3])] = dict(J=float(x[2]), obs=float(x[4]), cov=float(x[6]), ratio=float(x[8]),
                                            gp=int(x[9]), gpc=float(x[10]) if x[10] != "nan" else None)
    keys = list(dict.fromkeys((k[0], k[1]) for k in by))
    part = parts()
    go = [k for k in keys if part[k[0]] == "goemo"]
    na = [k for k in keys if part[k[0]] != "goemo"]
    names = [r[0] for r in RULES if not r[0].startswith("pooled")]
    out = [f"cells run: {len(keys)} ({len(go)} GoEmotions, {len(na)} NaijaSenti)"]
    com = committed("h7aq_pilot_share_draws.txt", {"shipped50": "shipped50", "shipped30": "shipped30"})
    diff = [(k, nm) for k in go for nm in ("shipped50", "shipped30") if abs(com[(*k, nm)] - by[(*k, nm)]["ratio"]) > 0.0005]
    out.append(f"P0 replay of 7aq shipped50 and shipped30 on GoEmotions: {2 * len(go) - len(diff)} of {2 * len(go)} "
               f"identical; differ {diff}")
    for k in keys:
        out.append(f"{k[0]} n {k[1]} (J {by[(*k, 'shipped50')]['J']:.3f}): " + ", ".join(
            f"{nm} {by[(*k, nm)]['ratio']:.3f} ({by[(*k, nm)]['obs']:.0f}% cells, cov {by[(*k, nm)]['cov']:.1f})"
            for nm in names))

    def gain(nm, ks=keys):
        return sum(1 - by[(*k, nm)]["ratio"] for k in ks)

    def low(nm):
        return [(k, by[(*k, nm)]["cov"]) for k in keys if by[(*k, nm)]["cov"] < 93.0]

    def gp_low(nm):
        return [(k, by[(*k, nm)]["gp"], by[(*k, nm)]["gpc"]) for k in keys
                if by[(*k, nm)]["gp"] >= 50 and by[(*k, nm)]["gpc"] < 88.0]

    for nm in names:
        out.append(f"{nm}: gain all {gain(nm):.3f} (GoEmotions {gain(nm, go):.3f}, NaijaSenti {gain(nm, na):.3f}); "
                   f"min coverage {min(by[(*k, nm)]['cov'] for k in keys):.1f}; under 93%: {low(nm)}; "
                   f"guard-pass >= 50 draws under 88%: {gp_low(nm)}")
    p1 = {nm: not low(nm) for nm in names}
    out.append(f"P1 every shipped rule >= 93% in all cells: {'yes' if all(p1.values()) else 'no'}; failing "
               f"{[nm for nm, v in p1.items() if not v]}")
    c7ao = committed("h7ao_two_phase_draws.txt", {"shipped": "shipped"})
    out.append(f"P2 NaijaSenti gain shipped30 {gain('shipped30', na):.3f} (7ao committed shipped "
               f"{sum(1 - c7ao[(*k, 'shipped')] for k in na):.3f}), shipped50 {gain('shipped50', na):.3f}: "
               f"{'yes' if gain('shipped50', na) > gain('shipped30', na) else 'no'}; lexicon-en ratios: "
               f"{sorted({by[(*k, nm)]['ratio'] for k in na if k[0].startswith('lexicon') for nm in names})}")
    g30, g40, g50 = gain("shipped30"), gain("shipped40"), gain("shipped50")
    out.append(f"P3 shipped40 between: {g30:.3f} <= {g40:.3f} <= {g50:.3f}: {'yes' if g30 <= g40 <= g50 else 'no'}")
    g50b, g60, g70 = gain("shipped50B"), gain("shipped60"), gain("shipped70")
    out.append(f"P4 shipped60 {g60:.3f} vs shipped50B {g50b:.3f} (within 0.10: {'yes' if abs(g60 - g50b) <= 0.10 else 'no'})"
               f"; shipped70 {g70:.3f} below shipped60: {'yes' if g70 < g60 else 'no'}; by n: " + ", ".join(
                   f"n {n_} 50B {gain('shipped50B', [k for k in go if k[1] == n_]):.3f} 60 "
                   f"{gain('shipped60', [k for k in go if k[1] == n_]):.3f} 70 "
                   f"{gain('shipped70', [k for k in go if k[1] == n_]):.3f}" for n_ in (500, 1000, 2000)))
    out.append("P5 guard-pass cells under 88% (>= 50 draws) per rule: " + ", ".join(
        f"{nm} {len(gp_low(nm))}" for nm in names))
    out.append(f"P6 scheme check shipped50B {g50b:.3f} vs shipped50 {g50:.3f}: "
               f"{'yes' if abs(g50b - g50) <= 0.10 else 'no'}")
    best = 0.5
    for s, nm, prev in [(0.6, "shipped60", "shipped50B"), (0.7, "shipped70", "shipped60")]:
        if not (p1[nm] and gain(nm) - gain(prev) >= 0.05):
            break
        best = s
    conds = {"shipped50 covers": p1["shipped50"], "gain +0.05 over shipped30": g50 - g30 >= 0.05,
             "NaijaSenti no worse than -0.02": gain("shipped50", na) >= gain("shipped30", na) - 0.02}
    if all(conds.values()):
        verdict = f"met: PILOT_SHARE changes to {best}"
    else:
        verdict = f"not met ({[c for c, v in conds.items() if not v]} failed); PILOT_SHARE stays 0.3"
    out.append(f"Decision rule: {conds}; s* {best}; {verdict}")
    text = "\n".join(out); print(text); (HERE / "h7ar_pilot_default.txt").write_text(text + "\n")


def main():
    mode = ARGS[0] if ARGS else "summary"
    if mode == "summary":
        summary()
    elif mode == "posthoc":
        posthoc_draws(int(ARGS[1]) if len(ARGS) > 1 else 1000)
        posthoc_summary()
    elif mode == "smoke":
        c = next(c for c in T.cells() if c["part"] != "goemo")
        print("\n".join(one_cell((c, int(ARGS[1]) if len(ARGS) > 1 else 10))))
    else:
        draws(int(ARGS[1]) if len(ARGS) > 1 else 1000)


if __name__ == "__main__":
    main()
