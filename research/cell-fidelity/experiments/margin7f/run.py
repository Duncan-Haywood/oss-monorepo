"""Milestone 7f (a triage rule with an out-of-batch margin): 7e's triage policy, picked on two design pools,
met the third pool's tail target in 4 of 12 folds. Four rules, each with a margin chosen by nested
leave-one-pool-out, scored by held-out target hits and the held-out pool's realised DFN cycles per design.
No new simulation: 7e's join of 7d's and 7b's rows (cell 000, 104 designs).

    python experiments/margin7f/run.py report    # H277 to H280 -> results.txt, summary.json

    U-tight      cheapest U(k) with training q75 <= t' x training q75(U50); t' is the margin
    F-tight      cheapest 7e T(K1, f, S_C) meeting t'; held-out pool gets its own top-f share by S_C
    F+D          the T(K1, f) picked at t' = 1.25, applied with f + D
    theta-tight  (primary) flag S_C >= theta (absolute), extend to K1; cheapest (K1, theta) meeting t'
Margin: the most permissive grid value whose two inner folds (pick on pool A, score on B, and the reverse) both
meet 1.25 x the scored pool's all-50 q75; the most conservative if none does. Plan in ../../LOG.md (7f plan).
"""
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("frontier7e_run", HERE.parent / "frontier7e" / "run.py")
F7 = importlib.util.module_from_spec(spec)
sys.modules["frontier7e_run"] = F7
spec.loader.exec_module(F7)

SETS, POOLS, KS, K1S, T0, quant = F7.SETS, F7.POOLS, F7.KS, F7.K1S, F7.T0, F7.quant
TT = (1.25, 1.20, 1.15, 1.10, 1.05, 1.00)
DG = tuple(round(i / 20, 2) for i in range(11))
RULES = ("theta", "U", "F", "FD")
EPS = 1e-15


def sc(r):
    return abs(r["mC"] - 1)


def target(t, tt=T0):
    return tt * quant([r["E"][50] for r in t])


# ---------- rules: pick(train, m) -> policy; apply(test, policy) -> (q75, cycles per design) ----------

def pick_U(tr, m):
    E = {k: [r["E"][k] for r in tr] for k in KS}
    c, lab = F7.cheapest(F7.uniform_policies(E), target(tr, m))
    return lab


def pick_F(tr, m):
    E = {k: [r["E"][k] for r in tr] for k in KS}
    c, lab = F7.cheapest(F7.triage_policies(E, lambda K1: [sc(r) for r in tr]), target(tr, m))
    return lab


def theta_policies(tr):
    """[(train cost, ("TH", K1, theta), train q75)]; flag S_C >= theta."""
    n = len(tr)
    ths = sorted({sc(r) for r in tr}) + [float("inf")]
    out = []
    for K1 in K1S:
        for th in ths:
            fl = [sc(r) >= th for r in tr]
            q = quant([r["E"][K1] if f else r["E"][10] for r, f in zip(tr, fl)])
            out.append((10 + (K1 - 10) * sum(fl) / n, ("TH", K1, th), q))
    return out


def pick_theta(tr, m):
    tgt = target(tr, m)
    ok = [p for p in theta_policies(tr) if p[2] <= tgt + EPS]
    if not ok:
        return None
    return min(ok, key=lambda p: (round(p[0], 12), -p[1][2], p[1][1]))[1]


def pick_FD(tr, d):
    lab = pick_F(tr, T0)
    if lab is None or lab[0] != "T":
        return lab
    return ("T", lab[1], min(1.0, round(lab[2] + d, 10)))


PICK = dict(theta=pick_theta, U=pick_U, F=pick_F, FD=pick_FD)
GRID = dict(theta=TT, U=TT, F=TT, FD=DG)


def apply(te, lab):
    """Held-out q75 and realised DFN cycles per design."""
    n = len(te)
    if lab is None:
        return quant([r["E"][50] for r in te]), 50.0
    if lab[0] == "U":
        return quant([r["E"][lab[1]] for r in te]), float(lab[1])
    if lab[0] == "T":
        _, K1, f = lab
        fl = F7.flagged([sc(r) for r in te], f)
        return quant([te[i]["E"][K1] if i in fl else te[i]["E"][10] for i in range(n)]), 10 + (K1 - 10) * len(fl) / n
    _, K1, th = lab
    fl = [sc(r) >= th for r in te]
    return quant([r["E"][K1] if f else r["E"][10] for r, f in zip(te, fl)]), 10 + (K1 - 10) * sum(fl) / n


def meets(tr, te, rule, m):
    q, _ = apply(te, PICK[rule](tr, m))
    return q <= target(te) + EPS


def choose_margin(A, B, rule):
    """Most permissive grid value whose two inner folds both meet; else the most conservative."""
    for m in GRID[rule]:
        if meets(A, B, rule, m) and meets(B, A, rule, m):
            return m, True
    return GRID[rule][-1], False


def fold(rs, st, p, rule, nested=True):
    pa, pb = [q for q in POOLS if q != p]
    A = [r for r in rs if r["set"] == st and r["pool"] == pa]
    B = [r for r in rs if r["set"] == st and r["pool"] == pb]
    te = [r for r in rs if r["set"] == st and r["pool"] == p]
    if nested:
        m, inner_ok = choose_margin(A, B, rule)
    else:
        m, inner_ok = GRID[rule][0], None
    lab = PICK[rule](A + B, m)
    q, c = apply(te, lab)
    tg = target(te)
    return dict(set=st, pool=p, rule=rule, margin=m, inner_ok=inner_ok, policy=lab, q75=q, target=tg,
                met=q <= tg + EPS, cycles=c, n_test=len(te))


def verdict(sup, ref):
    return "supported" if sup else ("refuted" if ref else "inconclusive")


def lab_s(l):
    if l is None:
        return "U50*"
    if l[0] == "U":
        return f"U{l[1]}"
    if l[0] == "T":
        return f"{l[1]}@{l[2]:.2f}"
    return f"{l[1]}>={l[2]:.3f}" if l[2] != float("inf") else f"{l[1]}>=inf"


def report():
    rs = F7.load()
    res = {}
    for nested in (True, False):
        for rule in RULES:
            res[(rule, nested)] = [fold(rs, st, p, rule, nested) for st in SETS for p in POOLS]
    S = {}
    for (rule, nested), fs in res.items():
        S[f"{rule}{'' if nested else '0'}"] = dict(met=sum(f["met"] for f in fs),
                                                     cycles=sum(f["cycles"] for f in fs) / len(fs))
    th, U, Fr = S["theta"], S["U"], S["F"]
    v277 = verdict(th["met"] >= 9, th["met"] <= 6)
    cheaper = th["cycles"] < U["cycles"] - 1e-12
    v278 = verdict(th["met"] >= U["met"] and cheaper,
                   (th["met"] < U["met"] and not cheaper) or (th["cycles"] > U["cycles"] + 1e-12 and th["met"] <= U["met"]))
    v279 = verdict(th["met"] > Fr["met"], th["met"] < Fr["met"])
    good = [r for r in RULES if S[r]["met"] >= 9]
    best = max(good, key=lambda r: 1 - S[r]["cycles"] / 50) if good else None
    bs = 1 - S[best]["cycles"] / 50 if best else None
    v280 = verdict(best is not None and bs >= 0.20, best is None or bs < 0.10)
    V = dict(H277=v277, H278=v278, H279=v279, H280=v280, best=best, best_saved=bs)
    names = dict(theta="theta-tight", U="U-tight", F="F-tight", FD="F+D")
    L = ["cell-fidelity milestone 7f: triage rules with an out-of-batch margin. 12 folds (4 sets x 3 held-out pools);",
         "target = 1.25 x the held-out pool's all-50 q75 of the cycle-99 lithium-loss error (cell 000).", "",
         f"{'rule':14s}{'margin':>8s}{'met':>6s}{'cycles':>8s}{'saved vs U50':>14s}"]
    for nested in (False, True):
        for rule in RULES:
            k = f"{rule}{'' if nested else '0'}"
            L.append(f"{names[rule]:14s}{'nested' if nested else 'zero':>8s}{S[k]['met']:>4d}/12{S[k]['cycles']:8.1f}"
                     f"{100 * (1 - S[k]['cycles'] / 50):13.0f}%")
    L.append(f"{'U50':14s}{'-':>8s}{12:>4d}/12{50.0:8.1f}{0:13.0f}%")
    for rule in RULES:
        L += ["", f"{names[rule]}, nested margin, per fold:",
              f"{'set':12s}{'pool':>5s}{'n':>4s}{'margin':>8s}{'inner':>6s}{'policy':>13s}{'q75':>7s}{'target':>8s}"
              f"{'met':>5s}{'cycles':>8s}"]
        for f in res[(rule, True)]:
            L.append(f"{f['set']:12s}{f['pool']:>5s}{f['n_test']:4d}{f['margin']:8.2f}{'ok' if f['inner_ok'] else 'no':>6s}"
                     f"{lab_s(f['policy']):>13s}{f['q75']:7.3f}{f['target']:8.3f}{'yes' if f['met'] else 'no':>5s}"
                     f"{f['cycles']:8.1f}")
    L += ["", "(margin: t' for U/F/theta, the training target as a multiple of training q75(U50); D added to f for F+D.",
          " inner 'no' = no grid value met both inner folds, so the most conservative was used. U50* = no policy met",
          " t' on training, fall back to every design to 50. cycles = held-out pool's realised DFN cycles per design.)", "",
          f"H277 (theta-tight nested meets >= 9 of 12): {v277} ({th['met']}/12)",
          f"H278 (theta-tight misses no more than U-tight and costs less): {v278} (met {th['met']} vs {U['met']}; "
          f"cycles {th['cycles']:.1f} vs {U['cycles']:.1f})",
          f"H279 (theta-tight meets more folds than F-tight): {v279} ({th['met']} vs {Fr['met']})",
          f"H280 (best rule meeting >= 9/12 saves >= 20% vs U50): {v280} (best: "
          f"{names[best] if best else 'none'}{'' if bs is None else f', {100 * bs:.0f}%'})"]
    out = dict(summary=S, verdicts=V, folds={f"{r}{'' if n else '0'}": [dict(f, policy=lab_s(f["policy"])) for f in fs]
                                            for (r, n), fs in res.items()})
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(out, indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"report": report}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
