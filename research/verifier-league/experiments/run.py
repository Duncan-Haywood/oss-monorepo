import math, random
from verifier_league import *

Q = 0.6
LEAGUE = [0.55, 0.52, 0.72, 0.30, 0.85, 0.42]   # best 0.55; runner-up 0.52 is on the SAME side of q, so it is easy
b = best(LEAGUE, Q)
print("E1 who binds? league r =", LEAGUE, "q =", Q)
print(" expected loss:", [round(loss(r, Q), 4) for r in LEAGUE], " best =", b, " runner-up =", runner_up(LEAGUE, Q))
for j, v in sorted(rates_vs(LEAGUE, Q, b).items(), key=lambda kv: kv[1]):
    print(f"  vs {j} (r={LEAGUE[j]:.2f}, side {'above' if LEAGUE[j] > Q else 'below'} q): midpoint {midpoint(LEAGUE[b], LEAGUE[j]):.3f}  rate KL={v:.4f}")
print(" binding competitor:", binding(LEAGUE, Q)[1])

print("\nE2 certification delay (alpha=0.05, no correction): oracle prediction vs mixture simulation, 300 runs")
for name, rs, q in [("E1 league", LEAGUE, .6), ("wide", [.8, .3, .55, .1], .7), ("two-sided", [.75, .52, .2], .6)]:
    pred = delay_prediction(rs, q, .05)
    rng = random.Random(5)
    res = [simulate_certify(rs, q, .05, int(pred * 10) + 300, rng) for _ in range(300)]
    ok = [t for i, t in res if i is not None]
    right = sum(1 for i, t in res if i == best(rs, q))
    print(f" {name:11s} pred {pred:7.1f}  mean {sum(ok)/len(ok):7.1f}  ratio {sum(ok)/len(ok)/pred:.2f}  certified {len(ok)/300:.2f} correct {right/300:.2f}")

print("\nE3 does the union bound bite? best at 0.4 (q=0.5), m near-tied competitors, error = certify/eliminate a wrong verifier; 1000 runs, T=400")
def near_tie_league(m, kind):
    rs = [0.4]
    for k in range(m):
        if kind == "opposite":   # slightly worse, opposite side
            rs.append(0.6 + 0.004 * (k + 1))
        elif kind == "exact":    # exact tie with the best (distinct reports impossible: mirror of the best)
            rs.append(0.6)
        else:                    # slightly worse, same side
            rs.append(0.4 - 0.004 * (k + 1))
    return rs
for kind in ("exact", "opposite", "same"):
    for m in (1, 3, 8):
        if kind == "exact" and m > 1:
            continue
        rs = near_tie_league(m, kind)
        out = []
        for corr in (1, len(rs) - 1):
            rng = random.Random(7)
            wrong = 0
            for _ in range(1000):
                i, t, c, dropped = simulate_eliminate(rs, 0.5, .05, 400, rng, corr)
                wrong += dropped
            out.append(wrong / 1000)
        print(f" {kind:8s} m={m}: P(best wrongly eliminated) uncorrected {out[0]:.4f}  Bonferroni {out[1]:.4f}")

print("\nE4 peeking baseline vs e-process, exact tie (r=.4,.6 at q=.5) plus 4 clear losers, 1000 runs, T=1000")
rs = [0.4, 0.6, 0.05, 0.95, 0.15, 0.85]
rng = random.Random(9)
pz = sum(peeking_leader(rs, 0.5, 1.645, 1000, rng)[0] is not None for _ in range(1000)) / 1000
rng = random.Random(9)
pe = sum(simulate_certify(rs, 0.5, .05, 1000, rng)[0] is not None for _ in range(1000)) / 1000
print(f" declared a 'strict best' (all such declarations are wrong): peeking z-tests {pz:.3f}   e-process {pe:.3f}")

print("\nE5 cost of a larger league: certification delay and evaluation cost, best r=.62 (q=.6), one fixed binding rival r=.40, n-2 easier rivals")
for n in (2, 4, 8, 12):
    rs = [0.62, 0.40] + [0.05 + 0.025 * k for k in range(n - 2)]   # one fixed binding rival (r=.40), the rest easier
    bb = best(rs, .6)
    rng = random.Random(11)
    tc, te, cost = [], [], []
    for _ in range(100):
        i, t = simulate_certify(rs, .6, .05, 4000, rng, corr=n - 1)
        tc.append(t)
        s, t2, c, d = simulate_eliminate(rs, .6, .05, 4000, rng, corr=n - 1)
        te.append(t2); cost.append(c)
    print(f" n={n:2d}: binding rate {min(rates_vs(rs,.6,bb).values()):.4f} pred(no corr) {delay_prediction(rs,.6,.05):6.1f} pred(Bonferroni) {delay_prediction(rs,.6,.05,n-1):6.1f}"
          f"  certify mean {sum(tc)/100:6.1f}  eliminate stop {sum(te)/100:6.1f}  eval cost {sum(cost)/100:7.1f}  no-elimination cost {n*sum(tc)/100:7.1f}")
