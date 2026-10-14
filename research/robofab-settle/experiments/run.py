"""Compare the L1 support rule with MuJoCo settle tests on every partial assembly of the gearbox."""
import os
import sys
from multiprocessing import Pool

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from robofab_settle.settle import Checker, GroundedChecker, MuJoCoChecker, grounded_stable, settle  # noqa: E402
from robofab_sequence.planner import summarise  # noqa: E402

MUS = (0.2, 0.5, 0.8)
CK = Checker()
N = CK.n


def reachable_L0():
    """States reachable by collision-free single-part insertions (no stability test)."""
    seen, frontier = {1}, [1]
    ck0 = Checker(stability=False)
    while frontier:
        nxt = []
        for s in frontier:
            for p in range(1, N):
                if not s >> p & 1 and ck0.free_dirs(p, s):
                    t = s | 1 << p
                    if t not in seen:
                        seen.add(t)
                        nxt.append(t)
        frontier = nxt
    return sorted(seen)


def job(args):
    s, mu = args
    return (s, mu, settle(CK, s, mu))


def names(s):
    return "+".join(CK.names[p] for p in range(1, N) if s >> p & 1) or "(base only)"


def main():
    states = reachable_L0()
    allstates = [1 | (m << 1) for m in range(1 << (N - 1))]
    print(f"partial assemblies: {len(allstates)} subsets with the base; {len(states)} reachable by collision-free insertion (L0)")
    work = [(s, mu) for mu in MUS for s in states]
    with Pool() as pool:
        res = pool.map(job, work, chunksize=8)
    data = {(s, mu): r for s, mu, r in res}

    def conf(mu, disp, tilt, subset, rule=None):
        rule = rule or CK.stable
        tp = fp = fn = tn = 0
        bad = []
        for s in subset:
            l1 = rule(s)
            _, d, t = data[(s, mu)]
            mj = d < disp and t < tilt
            if l1 and mj: tp += 1
            elif l1 and not mj: fp += 1; bad.append((s, "L1 stable, MuJoCo moves", d, t))
            elif not l1 and mj: fn += 1; bad.append((s, "L1 unstable, MuJoCo holds", d, t))
            else: tn += 1
        return tp, fp, fn, tn, bad

    print("\nConfusion on L0-reachable states (L1 rule vs MuJoCo settle; positive = holds)")
    print("mu   disp_mm tilt_deg  both_hold  L1_only(L1 stable, MJ moves)  MJ_only(L1 unstable, MJ holds)  both_fail  agreement")
    for mu in MUS:
        for disp, tilt in ((2.0, 3.0), (3.0, 3.0), (5.0, 3.0), (3.0, 10.0)):
            tp, fp, fn, tn, _ = conf(mu, disp, tilt, states)
            print(f"{mu:<4} {disp:<7} {tilt:<8} {tp:<10} {fp:<29} {fn:<31} {tn:<10} {(tp + tn) / len(states):.3f}")

    print("\nSame, with the acyclic-support variant of the rule (a part is supported only by already-grounded parts)")
    print("mu   disp_mm tilt_deg  both_hold  rule_only  MJ_only  both_fail  agreement")
    for mu in MUS:
        for disp, tilt in ((3.0, 3.0), (3.0, 10.0)):
            tp, fp, fn, tn, _ = conf(mu, disp, tilt, states, lambda s: grounded_stable(CK, s))
            print(f"{mu:<4} {disp:<7} {tilt:<8} {tp:<10} {fp:<10} {fn:<8} {tn:<10} {(tp + tn) / len(states):.3f}")

    tp, fp, fn, tn, bad = conf(0.5, 3.0, 3.0, states)
    print("\nDisagreements at mu=0.5, 3 mm, 3 deg (first 12 of %d)" % len(bad))
    for s, kind, d, t in bad[:12]:
        print(f"  [{kind}] disp={d:.2f} mm tilt={t:.2f} deg: {names(s)}")

    print("\nOrders (exact DP over all subsets); L1 rule vs MuJoCo-settle rule in place of the support test")
    for label, ck in (("L0 (no stability)", Checker(stability=False)), ("L1 rule", Checker()),
                      ("L1 acyclic-support variant", GroundedChecker())):
        print(f"  {label}: {summarise(ck)}")
    for mu in MUS:
        mk = MuJoCoChecker(mu=mu)
        mk._mj = {s: (data[(s, mu)][1] < 3.0 and data[(s, mu)][2] < 3.0) for s in states}
        mk._mj[1] = True
        print(f"  MuJoCo settle, mu={mu}: {summarise(mk)}")


if __name__ == "__main__":
    main()
