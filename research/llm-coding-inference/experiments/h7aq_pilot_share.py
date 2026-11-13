"""Milestone 7aq: does a smaller pilot (30% or 20% of the audit instead of half) make the two-phase fallback pay, and
what does it do to the shipped rule? (7ao's untested option (b); 7ap's next step (1), a fresh pre-registered check of
no_info=inf.)

Why. 7ao and 7ap showed that a fallback whose interval is valid given the pilot (two-phase: pilot labels counted
exactly, each cell's unpiloted rest estimated from fresh items only) removes 7an's selection bias but gains less than
the shipped rule (3-miss guard, else pooled). Their reading: with a pilot of n/2 the coder-negative cell's rest is
estimated from about half the budget, so its variance rises by about (pilot + k_0) / k_0, close to 2. Every GoEmotions
cell since 7y has used a pilot of n/2, while the library's own default is `PILOT_SHARE = 0.3` (and the NaijaSenti cells
use it). So the shipped rule as a practitioner calls it has never been run on the GoEmotions cells. A smaller pilot cuts
the two-phase cost, but it also holds fewer coder misses, so the 3-miss guard passes less often and more draws go to the
fallback (or, for the shipped rule, to pooled).

Design. The 39 GoEmotions cells of 7ap (7ao's 51 minus the 12 NaijaSenti cells, whose pilot is already 0.3n), same seeds.
Pilots at share s are the first round(s n) items of the same n/2 random pilot (a prefix of a random sample is a random
sample), so every rule sees nested pilots and the s = 0.5 rules replay 7ap. 1,000 draws per cell (+/- 1.4 points).
Rules (all non-pooled: tau 0.1, guard 0, width_margin 0, neg_guard 3):
    pooled        pilot 0.5 (with the pilot reused, pooled is a simple random sample of n at any share)
    shipped50     the shipped rule, pilot 0.5 (replays 7ap)
    shipped30     the shipped rule, pilot 0.3 (the library default share)
    shipped20     the shipped rule, pilot 0.2
    gtp2p50       7ap's gtp2p (guard-first, fallback two-phase in both cells, pseudo 2, floor priced), pilot 0.5
    gtp2p30       gtp2p, pilot 0.3 (the candidate)
    gtp2p20       gtp2p, pilot 0.2
    gtp2q30       gtp2p30 with no_info=inf (7ap's post hoc fix, here pre-registered)
Every draw also records whether its pilot passed the 3-miss guard, so coverage is reported among guard-pass cells draws
and among guard-fail (fallback) cells draws, as 7ao and 7ap did.
A draw whose plan is pooled uses the full n/2 pilot plus the same second draw as `pooled` (common random numbers; the
decision saw only the first round(s n) items, and the extra items are a random extension, so the audit is still a simple
random sample of n). This was added after a 20-draw smoke test of one cell showed pooled draws at share 0.3 differing
from `pooled` by sampling noise alone; no prediction was changed.

    python3 experiments/h7aq_pilot_share.py draws [reps]   # -> h7aq_pilot_share_draws.txt
    python3 experiments/h7aq_pilot_share.py summary        # decision rule -> h7aq_pilot_share.txt

Gains are sums of (1 - ratio to pooled) over the 39 GoEmotions cells. From 7ap's file: shipped (pilot 0.5) 4.059,
gtp2p 4.021.

Prediction (written and committed before any draw):
  P0  (replay) shipped50 and gtp2p50 reproduce 7ap's committed ratios in all 39 cells to three decimals.
  P1  every rule covers 93% or more in all 39 cells.
  P2  gtp2p30, gtp2p20 and gtp2q30 cover 88% or more among guard-fail cells draws in every cell with 50 or more such
      draws.
  P3  gtp2p30 is no more than 1.010 times pooled in every cell.
  P4  gtp2p30's gain is at least shipped50's 4.059. My guess, from the line's record (7ao, 7ap both fell short): it is
      not, landing at 3.8 to 4.1; the smaller two-phase cost is offset by more middling-coder pilots failing the guard
      and paying the pseudo-2 floor.
  P5  (observation, the shipped rule at the library's share) shipped30's gain is below shipped50's, by 0.3 to 0.8: fewer
      pilots see 3 misses, so middling coders at n 500 and 1,000 go to pooled more often. shipped20 below shipped30.
  P6  (observation) gtp2p's gain falls less than shipped's as the share falls: gtp2p30 - shipped30 > gtp2p50 -
      shipped50 (-0.038), because the fallback catches the pilots the guard now refuses.
  P7  (observation, 7ao's open defect) shipped's guard-pass coverage at 1.5B disapproval n 1,000 (83.3% of 72 at 0.5)
      stays under 88% at 0.3: a smaller pilot does not remove the forecast's selection.
  P8  (fresh check of no_info=inf) gtp2q30's gain is at least gtp2p30's, and no cell is above 1.010.
  Decision rule, fixed now: if gtp2p30 or gtp2p20 meets P1 to P3 and beats shipped50's gain by 0.05 or more, a follow-up
  PR makes the guard-first two-phase fallback the default at that share (and pins every earlier script). If shipped30
  fails P1, the library's PILOT_SHARE default is wrong for the shipped rule and changes to 0.5 in this PR. Otherwise
  nothing changes and the summary says which prediction failed.
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

INF = float("inf")
# name, share, neg_guard, fallback_pseudo, fallback_two_phase, price_floor, no_info
RULES = [("pooled", 0.5, 0, None, False, False, 1.0),
         ("shipped50", 0.5, 3, None, False, False, 1.0), ("shipped30", 0.3, 3, None, False, False, 1.0),
         ("shipped20", 0.2, 3, None, False, False, 1.0),
         ("gtp2p50", 0.5, 3, 2.0, True, True, 1.0), ("gtp2p30", 0.3, 3, 2.0, True, True, 1.0),
         ("gtp2p20", 0.2, 3, 2.0, True, True, 1.0), ("gtp2q30", 0.3, 3, 2.0, True, True, INF)]
OUT = HERE / "h7aq_pilot_share_draws.txt"
HEAD = T.HEAD
SHIPPED50_GAIN = 4.059


def run(c, reps):
    h, f, n = c["h"], c["f"], c["n"]
    N, truth = len(h), sum(h) / len(h)
    rr = random.Random(c["seed"] + 5)
    pilots = [rr.sample(range(N), n // 2) for _ in range(reps)]
    res = {}
    for name, share, ng, fb, ftp, pf, ni in RULES:
        out = []
        tau = 2.0 if name == "pooled" else A.TAU
        k = n // 2 if share == 0.5 else round(share * n)
        for d in range(reps):
            pilot, sb = pilots[d][:k], random.Random(c["seed"] + 7 * d)
            labels = {i: h[i] for i in pilot}
            passed = sum(1 for i in pilot if h[i] and not f[i]) >= A.NEG_GUARD
            plan = A.plan_audit(f, labels, n, tau=tau, guard=0, neg_guard=ng, width_margin=0.0, pseudo=0.0,
                                fallback_pseudo=fb, two_phase=False, fallback_two_phase=ftp, price_floor=pf,
                                no_info=ni)
            if plan["design"] == "pooled" and k < len(pilots[d]):
                # Common random numbers (added after a 20-draw smoke test, before the full run): a pooled audit is a
                # simple random sample of n whatever the pilot share, and the decision used only pilots[d][:k], so
                # its sample is the full n/2 pilot plus the same second draw as `pooled`. Same distribution, less noise.
                labels = {i: h[i] for i in pilots[d]}
                plan = dict(plan, to_label=[n - len(labels)])
            for cell, t in zip(plan["cells"], plan["to_label"]):
                for i in sb.sample([i for i in cell if i not in labels], t):
                    labels[i] = h[i]
            est, lo, hi = A.audit_interval(plan, f, labels)
            out.append(((hi - lo) / 2, lo <= truth <= hi, plan["design"] == "cells", bool(plan.get("fallback")),
                        passed))
        res[name] = out
    return res


def one_cell(args):
    c, reps = args
    res = run(c, reps)
    wp = sum(x[0] for x in res["pooled"]) / reps
    lines = []
    for name, *_r in RULES:
        r = res[name]
        w = sum(x[0] for x in r) / reps
        gp = [x for x in r if x[2] and x[4]]
        gf = [x for x in r if x[2] and not x[4]]

        def cov(xs):
            return f"{100 * sum(x[1] for x in xs) / len(xs):.1f}" if xs else "nan"
        lines.append(f"{c['label']} | {c['n']} | {c['J']:.3f} | {name} | {100 * sum(x[2] for x in r) / reps:.1f} | "
                     f"{100 * sum(x[3] for x in r) / reps:.1f} | {100 * sum(x[1] for x in r) / reps:.1f} | "
                     f"{100 * w:.3f} | {w / wp:.3f} | {len(gp)} | {cov(gp)} | {len(gf)} | {cov(gf)}")
    print("\n".join(lines), flush=True)
    return lines


def draws(reps):
    cs = [c for c in T.cells() if c["part"] == "goemo"]
    with Pool(4) as p:
        got = p.map(one_cell, [(c, reps) for c in cs], chunksize=1)
    OUT.write_text("\n".join([HEAD] + [l for g in got for l in g]) + "\n")


def committed():
    got = {}
    for line in (HERE / "h7ap_priced_floor_draws.txt").read_text().splitlines()[1:]:
        x = [s.strip() for s in line.split("|")]
        if x[3] in ("shipped", "gtp2p"):
            got[(x[0], int(x[1]), x[3] + "50")] = float(x[8])
    return got


def summary():
    by = {}
    for line in OUT.read_text().splitlines()[1:]:
        x = [s.strip() for s in line.split("|")]
        by[(x[0], int(x[1]), x[3])] = dict(J=float(x[2]), obs=float(x[4]), fb=float(x[5]), cov=float(x[6]),
                                            ratio=float(x[8]), gp=int(x[9]), gpc=float(x[10]), gf=int(x[11]),
                                            gfc=float(x[12]))
    keys = list(dict.fromkeys((k[0], k[1]) for k in by))
    names = [r[0] for r in RULES]
    com = committed()
    out = [f"cells run: {len(keys)} GoEmotions"]
    diff = [(k, nm) for k in keys for nm in ("shipped50", "gtp2p50")
            if abs(com[(*k, nm)] - by[(*k, nm)]["ratio"]) > 0.0005]
    out.append(f"P0 replay of 7ap shipped and gtp2p ratios: {2 * len(keys) - len(diff)} of {2 * len(keys)} identical; "
               f"differ {diff}")
    for k in keys:
        def tag(nm):
            r = by[(*k, nm)]
            s = f"{nm} {r['ratio']:.3f} ({r['obs']:.0f}% cells, cov {r['cov']:.1f}"
            if r["gp"]:
                s += f"; pass {r['gp']} at {r['gpc']:.1f}"
            if r["gf"]:
                s += f"; fail {r['gf']} at {r['gfc']:.1f}"
            return s + ")"
        out.append(f"{k[0]} n {k[1]} (J {by[(*k, 'pooled')]['J']:.3f}; pooled cov {by[(*k, 'pooled')]['cov']:.1f}): "
                   + ", ".join(tag(nm) for nm in names[1:]))

    def gain(nm):
        return sum(1 - by[(*k, nm)]["ratio"] for k in keys)

    def low(nm):
        return [(k, by[(*k, nm)]["cov"]) for k in keys if by[(*k, nm)]["cov"] < 93.0]

    def over(nm):
        return [(k, by[(*k, nm)]["ratio"]) for k in keys if by[(*k, nm)]["ratio"] > 1.010]

    def cond(nm, which):
        n_, c_ = ("gf", "gfc") if which == "fail" else ("gp", "gpc")
        return [(k, by[(*k, nm)][n_], by[(*k, nm)][c_]) for k in keys if by[(*k, nm)][n_] >= 50]

    for nm in names[1:]:
        cf, cp = cond(nm, "fail"), cond(nm, "pass")
        wf = min(cf, key=lambda t: t[2]) if cf else None
        wp = min(cp, key=lambda t: t[2]) if cp else None
        out.append(f"{nm}: gain {gain(nm):.3f}; min coverage {min(by[(*k, nm)]['cov'] for k in keys):.1f}; under 93%: "
                   f"{low(nm)}; above 1.010: {over(nm)}; guard-pass cells >= 50 draws: {len(cp)} cells"
                   + (f", worst {wp[0]} {wp[2]:.1f}% of {wp[1]}" if wp else "")
                   + f", under 88%: {[(k, n_, c_) for k, n_, c_ in cp if c_ < 88.0]}"
                   + f"; guard-fail cells >= 50 draws: {len(cf)} cells"
                   + (f", worst {wf[0]} {wf[2]:.1f}% of {wf[1]}" if wf else ""))
    p1 = {nm: not low(nm) for nm in names[1:]}
    out.append(f"P1 (all rules >= 93% everywhere): {'yes' if all(p1.values()) else 'no'}; failing "
               f"{[nm for nm, v in p1.items() if not v]}")
    p2 = {nm: all(c >= 88.0 for _k, _n, c in cond(nm, "fail")) for nm in ("gtp2p30", "gtp2p20", "gtp2q30")}
    out.append(f"P2 (fallback conditional >= 88%): {p2}")
    out.append(f"P3 gtp2p30 <= 1.010 everywhere: {'yes' if not over('gtp2p30') else 'no'}")
    g = gain("gtp2p30")
    out.append(f"P4 gtp2p30 gain {g:.3f} vs shipped50 {gain('shipped50'):.3f}: "
               f"{'yes' if g >= gain('shipped50') else 'no'} (margin {g - gain('shipped50'):+.3f})")
    out.append(f"P5 shipped gain by share: 0.5 {gain('shipped50'):.3f}, 0.3 {gain('shipped30'):.3f}, "
               f"0.2 {gain('shipped20'):.3f}; drop 0.5 -> 0.3 {gain('shipped50') - gain('shipped30'):.3f}")
    d50, d30, d20 = (gain(f"gtp2p{s}") - gain(f"shipped{s}") for s in (50, 30, 20))
    out.append(f"P6 gtp2p - shipped by share: 0.5 {d50:+.3f}, 0.3 {d30:+.3f}, 0.2 {d20:+.3f}: "
               f"{'yes' if d30 > d50 else 'no'}")
    k7 = ("1.5B disapproval", 1000)
    out.append("P7 shipped guard-pass coverage at 1.5B disapproval n 1,000: " + ", ".join(
        f"{nm} {by[(*k7, nm)]['gpc']:.1f}% of {by[(*k7, nm)]['gp']}" for nm in ("shipped50", "shipped30", "shipped20")))
    out.append(f"P8 gtp2q30 gain {gain('gtp2q30'):.3f} vs gtp2p30 {g:.3f}; above 1.010: {over('gtp2q30')}")
    won = [nm for nm in ("gtp2p30", "gtp2p20") if p1[nm] and p2[nm] and not over(nm)
           and gain(nm) - gain("shipped50") >= 0.05]
    if won:
        verdict = f"{max(won, key=gain)} adopted (follow-up PR sets the fallback defaults at its share)"
    elif not p1["shipped30"]:
        verdict = "shipped30 fails P1: PILOT_SHARE default changes to 0.5"
    else:
        verdict = "not met; nothing changes"
    out.append("Decision rule: " + verdict)
    text = "\n".join(out); print(text); (HERE / "h7aq_pilot_share.txt").write_text(text + "\n")


def main():
    mode = ARGS[0] if ARGS else "summary"
    if mode == "summary":
        summary()
    else:
        draws(int(ARGS[1]) if len(ARGS) > 1 else 1000)


if __name__ == "__main__":
    main()
