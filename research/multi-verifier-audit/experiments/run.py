import math
from multi_verifier import flow_modes, Params, equilibrium, hedge_run, bandit_run, detect_prob
from multi_verifier.game import redundancy, redundancy_limit


def table():
    print("== 1. Equilibrium vs m (s=1,S=4,k=.5,h=2,lam=1) ==")
    print("q*=s/(s+S) is independent of m; redundancy limit (split)=%.3f" % redundancy_limit(Params()))
    print(f"{'m':>3} {'y*':>7} {'x*split':>8} {'x*bounty':>9} {'audits/round':>13} {'redund':>7} {'payout split':>13} {'payout bounty':>14}")
    for m in (1, 2, 3, 5, 8, 16, 64):
        Ps, Pb = Params(), Params(scheme="bounty")
        xs, y, q = equilibrium(Ps, m)
        xb, _, _ = equilibrium(Pb, m)
        print(f"{m:>3} {y:7.4f} {xs:8.4f} {xb:9.4f} {m*y:13.4f} {redundancy(Ps,m):7.3f} "
              f"{xs*q*Ps.lam*Ps.S:13.4f} {xb*q*Pb.lam*Pb.S*m*y/q if False else xb*Pb.lam*Pb.S*m*y:14.4f}")


def stats(out, m, xstar, qstar):
    n = len(out)
    xa = sum(o[0] for o in out) / n
    qa = sum(detect_prob(o[1]) for o in out) / n
    low = sum(detect_prob(o[1]) < qstar / 2 for o in out) / n
    return xa, qa, low


def dyn(scheme="split"):
    print(f"\n== 2. Hedge dynamics, scheme={scheme}, T=40000, eta=0.02 (start: x*+0.15 perturbation, asymmetric y) ==")
    print(f"{'m':>3} {'x*':>7} {'avg x':>7} {'q*':>6} {'avg q':>7} {'P[q<q*/2]':>10} final y's")
    for m in (1, 2, 3, 5):
        P = Params(scheme=scheme)
        x, y, q = equilibrium(P, m)
        y0 = [min(0.95, max(0.05, y * (1 + 0.5 * ((-1) ** i)))) for i in range(m)]
        out = hedge_run(P, m, 40000, 0.02, min(0.95, x + 0.15), y0, record_every=10)
        xa, qa, low = stats(out, m, x, q)
        print(f"{m:>3} {x:7.4f} {xa:7.4f} {q:6.3f} {qa:7.4f} {low:10.3f} {[round(v,3) for v in out[-1][1]]}")


def bandit(GAMMA=0.02):
    print("\n== 3. Bandit (importance-weighted, eta0/sqrt(t), exploration floor gamma=%.2f) feedback, scheme=split, T=200000, mean over 3 seeds ==" % GAMMA)
    print(f"{'m':>3} {'x*':>7} {'avg x':>7} {'q*':>6} {'avg q (2nd half)':>17}")
    for m in (1, 2, 4):
        P = Params()
        x, y, q = equilibrium(P, m)
        xa = qa = 0
        for seed in range(3):
            out = bandit_run(P, m, 200000, 0.3, 0.5, [0.5] * m, seed=seed, record_every=20, gamma=GAMMA)
            half = out[len(out) // 2:]
            xa += sum(o[0] for o in half) / len(half) / 3
            qa += sum(detect_prob(o[1]) for o in half) / len(half) / 3
        print(f"{m:>3} {x:7.4f} {xa:7.4f} {q:6.3f} {qa:17.4f}")


def modes():
    print("\n== 4. Stability of the symmetric equilibrium under the Hedge flow ==")
    print("antisym>0 means audit effort shifting between verifiers grows (volunteer's dilemma)")
    print(f"{'m':>3} {'scheme':>7} {'antisym':>9} {'sym trace':>10} {'sym det':>9}")
    for scheme in ("split", "bounty"):
        for m in (1, 2, 3, 5, 8):
            a, tr, det = flow_modes(Params(scheme=scheme), m)
            print(f"{m:>3} {scheme:>7} {a:9.5f} {tr:10.5f} {det:9.5f}")


if __name__ == "__main__":
    table()
    modes()
    dyn("split")
    dyn("bounty")
    bandit(0.0)
    bandit(0.02)
