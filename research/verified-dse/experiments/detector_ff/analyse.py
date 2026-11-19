"""Milestone 150: at SKY130 ff_n40C_1v95, is there a per-design signal, read off the mapped pool before any routing, that tells
where the clipped ladder (SWC) loses to random routing well enough to pay for a switch? A replay on milestone 148's 77 ff designs
(milestones 144 to 147). No flow run.

Usage: python3 analyse.py [out.txt]

Why: milestone 149's "Next". Milestones 148 and 149 closed the routed-pilot guard at ff: the pilots' false-alarm/hit ratios (about
0.58) are more than twice the best break-even ratio (0.174 with random fall-back, 0.244 with the best hedge). The open question is
the detector, not the response.

A cost point milestones 148 and 149 did not need, and this one does. A signal computed over the whole mapped pool has already paid
SWC's mapping, n r2 units of the budget B = n + 8 (R - 1) (R = routed/r2, milestone 111). What is left routes exactly 8 mapped points.
So a detector of this kind cannot fall back to equal-cost random routing (k > 8 fresh routes): that response is priced here only as
an unrealisable ceiling ("free detector"). The realisable responses all route 8 mapped points, chosen another way:
  A_r2   the unclipped mapped score r2 = area x (period - wns), best 8 (milestone 115's unclipped ladder);
  A_area synthesised area alone, best 8 (ignores the mapped delay the clip acts on);
  A_r8   8 uniformly drawn mapped points.
A detector D(f, dir, cut, A) on SWC's ladder branch (routed/r2 > theta = 3) routes SWC's 8 unless feature f is on the flagged side
of cut (dir "<": f < cut; ">": f > cut), and then routes A's 8 instead. Below theta every rule is equal-cost random, as in SWC.

Features, per design over all its mapped (ok) points, fixed here before the script first ran:
  spread   (r2c of the 8th best - r2c of the best) / r2c of the best: how flat SWC's top 8 is
  agree    Kendall tau-b of r2c against unclipped r2 over the pool
  overlap  |SWC's top 8 ∩ r2's top 8| / 8
  binds    share of points where the clip binds (1.25 x mapped delay < period)
  areacv   coefficient of variation of synthesised area
  delaycv  coefficient of variation of mapped delay (period - wns)
  r1agree  Kendall tau-b of the pre-mapping rung r1 = cells x depth against r2c
  ratio    routed/r2 (the cost ratio SWC already switches on)
Each in both directions; cuts are midpoints between sorted values of the designs a selection sees.

Regret as milestones 105 to 149 (best routed point / pool minimum - 1, %), 200 draws per design with random tie-breaks, seed
"m150" + milestone + design + response. SWC and equal-cost random regrets are milestone 148's numbers (same functions, same seeds).
Losers: ladder-branch designs with SWC regret above random's (milestone 148: 14 of 73).

Analyses: (a) every response always on (its cost on the 59 others and saving on the 14 losers, and its break-even false-alarm/hit
ratio); (b) per-feature AUC for losers (each direction); (c) in-sample oracle: the best (f, dir, cut) for each response; (d)
leave-one-milestone-out selection over all (f, dir, cut, A) for the realisable A, plus "no detector" (ties to SWC), the primary;
(e) a permutation null for the in-sample search: shuffle the per-design outcome vectors (SWC, random and the three A regrets) over the
73 ladder designs (1,000 permutations, seed 150), re-run (c), and compare the observed best improvement with the null's.

Predictions, written here and committed before the script first ran:
 (1) PRIMARY: the leave-one-milestone-out detector (realisable responses) has lower pooled mean regret than SWC (2.98%). Prior 15%.
 (2) in sample, with the unrealisable free random response, some (f, dir, cut) flags at least 3 losers and beats SWC. Prior 55%.
 (3) that best free-random in-sample improvement over SWC is above the 95th percentile of its permutation null. Prior 20%.
 (4) the best single-feature AUC, over the 8 features and both directions, is at least 0.75. Prior 30%.
 (5) agree has AUC >= 0.65 with lower values on losers. Prior 35%.
 (6) spread has AUC >= 0.65 with lower values on losers. Prior 35%.
 (7) on the 14 losers, at least one realisable response, always on, has lower mean regret than SWC there. Prior 60%.
 (8) on the 59 others, every realisable response, always on, costs at least 3 points more than SWC. Prior 70%.
Reported, not predicted: the full feature table per design, the in-sample frontier per response, and the null quantiles.
"""
import importlib.util
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
sys.path.insert(0, str(EXP.parent / "src"))
from verified_dse import stats  # noqa: E402

SEED = 150
PERMS = 1000
FEATURES = ("spread", "agree", "overlap", "binds", "areacv", "delaycv", "r1agree", "ratio")
REAL = ("A_r2", "A_area", "A_r8")
RESP = ("free_rand",) + REAL


def _sibling(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


m148 = _sibling(EXP / "pilot_tau_ff" / "analyse.py", "verified_dse_m150_m148")
score, swc, rand, sign, rule = m148.score, m148.swc, m148.rand, m148.sign, m148.rule
DRAWS, TOP, r2c, boot, auc = m148.DRAWS, m148.TOP, m148.r2c, m148.boot, m148.auc
flow = rule.flow


def topk(y, key, seed):
    """Mean regret (%) of routing the best TOP by key, random tie-breaks."""
    best, n = min(y), len(y)
    rng = random.Random(seed)
    tot = 0.0
    for _ in range(DRAWS):
        tb = [rng.random() for _ in range(n)]
        tot += rule.draw_regret(y, best, sorted(range(n), key=lambda i: (key[i], tb[i]))[:TOP])
    return 100 * tot / DRAWS


def rand8(y, seed):
    best, n = min(y), len(y)
    rng = random.Random(seed)
    return 100 * statistics.mean(rule.draw_regret(y, best, rng.sample(range(n), min(TOP, n))) for _ in range(DRAWS))


def cv(v):
    m = statistics.mean(v)
    return statistics.pstdev(v) / m if m else 0.0


def features(rs, c):
    s = [r2c(r) for r in rs]
    u = [flow.scores(r)["r2"] for r in rs]
    r1 = [flow.scores(r)["r1"] for r in rs]
    ss = sorted(s)
    top_s = set(sorted(range(len(s)), key=lambda i: (s[i], i))[:TOP])
    top_u = set(sorted(range(len(u)), key=lambda i: (u[i], i))[:TOP])
    dl = [r["period_ns"] - r["synth_netlist_wns"] for r in rs]
    t = lambda a, b: (lambda v: 0.0 if v is None else v)(stats.kendall_tau_b(a, b))  # noqa: E731
    return {"spread": (ss[min(TOP, len(ss)) - 1] - ss[0]) / ss[0], "agree": t(s, u), "overlap": len(top_s & top_u) / TOP,
            "binds": statistics.mean(1.25 * d < r["period_ns"] for d, r in zip(dl, rs)),
            "areacv": cv([r["synth_netlist_area"] for r in rs]), "delaycv": cv(dl), "r1agree": t(r1, s), "ratio": c["ratio"]}


def responses(ms, x, rs, c):
    y = [flow.scores(r)["r4"] for r in rs]
    tag = f"m150{ms}{x}"
    return {"SWC": swc(c), "free_rand": rand(c), "A_r2": topk(y, [flow.scores(r)["r2"] for r in rs], tag + "r2"),
            "A_area": topk(y, [r["synth_netlist_area"] for r in rs], tag + "area"), "A_r8": rand8(y, tag + "r8")}


def cuts(vals):
    v = sorted(set(vals))
    return [v[0] - 1.0] + [(a + b) / 2 for a, b in zip(v, v[1:])] + [v[-1] + 1.0]


def flagged(f, d, cut):
    return f < cut if d == "<" else f > cut


def apply(rule_, F, R, k):
    """Regret of design k under detector rule_ = (f, dir, cut, A) or None (SWC)."""
    if rule_ is None or k not in F:
        return R[k]["SWC"]
    f, d, cut, a = rule_
    return R[k][a] if flagged(F[k][f], d, cut) else R[k]["SWC"]


def best_rule(keys, F, R, resp, lad):
    """In-sample best (f, dir, cut, A) over keys (A in resp), None if nothing beats SWC; returns (rule, mean regret)."""
    base = statistics.mean(R[k]["SWC"] for k in keys)
    best, bv = None, base
    lk = [k for k in keys if k in lad]
    for f in FEATURES:
        order = sorted(lk, key=lambda k: F[k][f])
        for a in resp:
            gain = [R[k][a] - R[k]["SWC"] for k in order]
            # "<": flag the lowest j designs; ">": flag the highest j; cut at the midpoint, ties kept together
            for d in ("<", ">"):
                seq = order if d == "<" else order[::-1]
                g = gain if d == "<" else gain[::-1]
                acc = 0.0
                for j in range(1, len(seq) + 1):
                    acc += g[j - 1]
                    if j < len(seq) and F[seq[j]][f] == F[seq[j - 1]][f]:
                        continue
                    v = base + acc / len(keys)
                    if v < bv - 1e-12:
                        lo, hi = F[seq[j - 1]][f], (F[seq[j]][f] if j < len(seq) else None)
                        if hi is None:
                            cut = lo + 1.0 if d == "<" else lo - 1.0
                        else:
                            cut = (lo + hi) / 2
                        best, bv = (f, d, cut, a), v
    return best, bv


def rname(r):
    return "no detector (SWC)" if r is None else f"D({r[0]} {r[1]} {r[2]:.4g}, {r[3]})"


def main(dst):
    P = m148.pool()
    F, R, lad = {}, {}, set()
    for ms, x, c, rs in P:
        k = (ms, x)
        R[k] = responses(ms, x, rs, c)
        if c["ratio"] > score.THETA:
            lad.add(k)
            F[k] = features(rs, c)
        else:
            for a in RESP:
                R[k][a] = c["rand"]  # below theta every rule is equal-cost random, SWC included
    keys = [(ms, x) for ms, x, _, _ in P]
    mss = sorted({k[0] for k in keys})
    sl = statistics.mean(R[k]["SWC"] for k in keys)
    losers = [k for k in keys if k in lad and R[k]["SWC"] > R[k]["free_rand"]]
    others = [k for k in keys if k in lad and k not in set(losers)]
    out = ["# Milestone 150: pre-routing detectors for the clipped ladder's losses at SKY130 ff_n40C_1v95 (replay of milestones "
           "144 to 147, no flow run)", "",
           f"pool {len(keys)} designs, ladder branch {len(lad)}; SWC loses to equal-cost random on {len(losers)}, wins or ties on "
           f"{len(others)}; SWC {sl:.2f}%, random {statistics.mean(R[k]['free_rand'] for k in keys):.2f}%", ""]

    # (a) responses always on
    out += ["## (a) Each response always on, ladder branch", "",
            "response | mean regret on losers (SWC there) | on others (SWC there) | saving per loser | cost per other | "
            "break-even false-alarm/hit"]
    sw_l = statistics.mean(R[k]["SWC"] for k in losers)
    sw_o = statistics.mean(R[k]["SWC"] for k in others)
    be = {}
    for a in RESP:
        ml = statistics.mean(R[k][a] for k in losers)
        mo = statistics.mean(R[k][a] for k in others)
        save, cost = sw_l - ml, mo - sw_o
        be[a] = (len(losers) * save) / (len(others) * cost) if cost > 0 and save > 0 else float("nan")
        out.append(f"{a} | {ml:.2f} ({sw_l:.2f}) | {mo:.2f} ({sw_o:.2f}) | {save:+.2f} | {cost:+.2f} | {be[a]:.3f}")

    # (b) AUCs
    out += ["", "## (b) Feature AUC for SWC's losers (P(loser below other), ties half; 1 - AUC is the '>' direction)", "",
            "feature | median on losers | median on others | AUC lower on losers | best direction AUC"]
    aucs = {}
    for f in FEATURES:
        a = auc([F[k][f] for k in losers], [F[k][f] for k in others])
        aucs[f] = a
        out.append(f"{f} | {statistics.median(F[k][f] for k in losers):.4f} | {statistics.median(F[k][f] for k in others):.4f} | "
                   f"{a:.4f} | {max(a, 1 - a):.4f}")

    # (c) in-sample oracle per response
    out += ["", "## (c) In-sample oracle: best (feature, direction, cut) per response", "",
            "response | rule | mean regret % | losers flagged | others flagged | false-alarm/hit"]
    insample = {}
    for a in RESP:
        r, v = best_rule(keys, F, R, (a,), lad)
        insample[a] = (r, v)
        if r is None:
            out.append(f"{a} | none beats SWC | {sl:.2f} | 0 | 0 | -")
            continue
        fl = [k for k in lad if flagged(F[k][r[0]], r[1], r[2])]
        hl, ho = sum(k in set(losers) for k in fl), sum(k in set(others) for k in fl)
        ratio = (ho / len(others)) / (hl / len(losers)) if hl else float("inf")
        out.append(f"{a} | {rname(r)} | {v:.2f} | {hl} | {ho} | {ratio:.3f}")

    # (d) leave-one-milestone-out, realisable responses: primary
    out += ["", "## (d) Leave-one-milestone-out over all (feature, direction, cut, realisable response)", "",
            "held-out milestone | chosen on the other three | held-out mean: detector | SWC"]
    lomo = {}
    chosen = {}
    for m in mss:
        train = [k for k in keys if k[0] != m]
        r, _ = best_rule(train, F, R, REAL, lad)
        chosen[m] = r
        ks = [k for k in keys if k[0] == m]
        for k in ks:
            lomo[k] = apply(r, F, R, k)
        out.append(f"{m} | {rname(r)} | {statistics.mean(lomo[k] for k in ks):.2f} | {statistics.mean(R[k]['SWC'] for k in ks):.2f}")
    gl = statistics.mean(lomo.values())
    diff = [lomo[k] - R[k]["SWC"] for k in keys]
    lo, hi = boot(diff, seed=SEED)
    b, w, t, p = sign({k: lomo[k] - R[k]["SWC"] for k in keys})
    out += ["", f"pooled: detector {gl:.2f}%, SWC {sl:.2f}%; detector - SWC {statistics.mean(diff):+.2f} points, design bootstrap "
            f"95% interval {lo:+.2f} to {hi:+.2f}; better on {b}, worse on {w}, tied on {t} (sign p = {p:.4f})"]
    # the same procedure with the free response, as a ceiling
    lomo_free = {}
    for m in mss:
        r, _ = best_rule([k for k in keys if k[0] != m], F, R, ("free_rand",), lad)
        for k in keys:
            if k[0] == m:
                lomo_free[k] = apply(r, F, R, k)
    gf = statistics.mean(lomo_free.values())
    out.append(f"ceiling, same procedure with the unrealisable free random response: {gf:.2f}%")

    # (e) permutation null for the in-sample search
    lk = sorted(lad)
    vecs = [R[k] for k in lk]
    rng = random.Random(SEED)
    null = {"free_rand": [], "real": []}
    obs = {"free_rand": sl - insample["free_rand"][1],
           "real": sl - min(best_rule(keys, F, R, REAL, lad)[1], sl)}
    for _ in range(PERMS):
        perm = vecs[:]
        rng.shuffle(perm)
        Rp = dict(R)
        Rp.update(dict(zip(lk, perm)))
        base = statistics.mean(Rp[k]["SWC"] for k in keys)
        null["free_rand"].append(base - best_rule(keys, F, Rp, ("free_rand",), lad)[1])
        null["real"].append(base - best_rule(keys, F, Rp, REAL, lad)[1])
    out += ["", f"## (e) Permutation null for the in-sample search ({PERMS} shuffles of outcome vectors over ladder designs)", "",
            "search | observed best improvement over SWC (points) | null median | null 95th percentile | p (null >= observed)"]
    q95 = {}
    for s in ("free_rand", "real"):
        v = sorted(null[s])
        q95[s] = v[int(0.95 * PERMS) - 1]
        pv = (1 + sum(x >= obs[s] - 1e-12 for x in v)) / (PERMS + 1)
        out.append(f"{s} | {obs[s]:.3f} | {statistics.median(v):.3f} | {q95[s]:.3f} | {pv:.4f}")

    # per design
    out += ["", "## Per design (ladder branch)", "",
            "milestone | design | loser | SWC % | random % | A_r2 % | A_area % | A_r8 % | " + " | ".join(FEATURES)]
    for k in sorted(lk, key=lambda k: (k[0], R[k]["SWC"] - R[k]["free_rand"])):
        out.append(f"{k[0]} | {k[1]} | {'Y' if k in set(losers) else '-'} | " +
                   " | ".join(f"{R[k][a]:.2f}" for a in ("SWC", "free_rand") + REAL) + " | " +
                   " | ".join(f"{F[k][f]:.4f}" for f in FEATURES))

    # Post hoc (added after the first run read (a); not a test, not predicted): the area-only response, always on, is a
    # parameter-free rule (the clip's alpha -> 0 limit: every point scored by mapped area at the period). Price it as a rule of
    # its own on all 77 designs: pooled, per milestone, interval, sign, and its worst designs.
    ao = {k: R[k]["A_area"] for k in keys}  # below theta A_area was set to random, as SWC
    dA = [ao[k] - R[k]["SWC"] for k in keys]
    loA, hiA = boot(dA, seed=SEED)
    bA, wA, tA, pA = sign({k: ao[k] - R[k]["SWC"] for k in keys})
    bAr, wAr, tAr, pAr = sign({k: ao[k] - R[k]["free_rand"] for k in keys})
    out += ["", "## Post hoc (added after the first run; not predicted): area-only ladder always on, as a rule of its own", "",
            f"pooled: area-only {statistics.mean(ao.values()):.2f}%, SWC {sl:.2f}%; area-only - SWC {statistics.mean(dA):+.2f} points, "
            f"design bootstrap 95% interval {loA:+.2f} to {hiA:+.2f}; better on {bA}, worse on {wA}, tied on {tA} (sign p = {pA:.4f}); "
            f"against random better on {bAr}, worse on {wAr}, tied on {tAr}",
            "milestone | designs | area-only % | SWC % | random %"]
    for m in mss:
        ks = [k for k in keys if k[0] == m]
        out.append(f"{m} | {len(ks)} | {statistics.mean(ao[k] for k in ks):.2f} | {statistics.mean(R[k]['SWC'] for k in ks):.2f} | "
                   f"{statistics.mean(R[k]['free_rand'] for k in ks):.2f}")
    out.append("largest area-only regrets: " + ", ".join(f"{k[1]} (m{k[0]}) {ao[k]:.2f} (SWC {R[k]['SWC']:.2f})"
                                                       for k in sorted(keys, key=lambda k: -ao[k])[:5]))
    out.append(f"median over designs: area-only {statistics.median(ao.values()):.2f}%, SWC {statistics.median(R[k]['SWC'] for k in keys):.2f}%; "
               f"worst: area-only {max(ao.values()):.2f}%, SWC {max(R[k]['SWC'] for k in keys):.2f}%")

    r2_ins = insample["free_rand"]
    hl2 = 0 if r2_ins[0] is None else sum(k in set(losers) for k in lad if flagged(F[k][r2_ins[0][0]], r2_ins[0][1], r2_ins[0][2]))
    best_auc = max(max(a, 1 - a) for a in aucs.values())
    loser_beat = [a for a in REAL if statistics.mean(R[k][a] for k in losers) < sw_l]
    costs = {a: statistics.mean(R[k][a] for k in others) - sw_o for a in REAL}
    out += ["", "## Predictions", "",
            f"(1) PRIMARY: LOMO detector below SWC: {gl < sl} ({gl:.2f} against {sl:.2f})",
            f"(2) in sample, free random response flags >= 3 losers and beats SWC: {r2_ins[0] is not None and hl2 >= 3} "
            f"({rname(r2_ins[0])}, {r2_ins[1]:.2f}%, {hl2} losers flagged)",
            f"(3) free-random in-sample improvement above the null's 95th percentile: {obs['free_rand'] > q95['free_rand']} "
            f"({obs['free_rand']:.3f} against {q95['free_rand']:.3f})",
            f"(4) best single-feature AUC >= 0.75: {best_auc >= 0.75} ({best_auc:.4f})",
            f"(5) agree AUC (lower on losers) >= 0.65: {aucs['agree'] >= 0.65} ({aucs['agree']:.4f})",
            f"(6) spread AUC (lower on losers) >= 0.65: {aucs['spread'] >= 0.65} ({aucs['spread']:.4f})",
            f"(7) a realisable response, always on, beats SWC on the losers: {bool(loser_beat)} ({', '.join(loser_beat) or 'none'})",
            f"(8) every realisable response costs >= 3 points on the others: {all(v >= 3 for v in costs.values())} "
            f"({', '.join(f'{a} {v:+.2f}' for a, v in costs.items())})"]
    Path(dst).write_text("\n".join(out) + "\n")
    print("\n".join(out))
    return {"lomo": gl, "swc": sl, "ceiling": gf, "aucs": aucs, "be": be, "chosen": {m: rname(r) for m, r in chosen.items()},
            "losers": len(losers), "others": len(others),
            "area_only": statistics.mean(ao.values()), "area_ci": (loA, hiA)}


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else HERE / "results.txt")
