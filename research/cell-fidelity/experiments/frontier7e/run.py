"""Milestone 7e (the triage frontier): 7d flagged a fraction f of each set's designs by 7c's drift score and ran
those on to cycle 50, scored at one tail target. Here the flagged designs run to K1 in {15, 20, 30, 40, 50} cycles,
uniform policies (every design to k cycles) are the baseline, and each family is scored by the DFN cycles it needs
to meet a range of tail targets, t x q75 of the all-50 policy, t = 1.00 to 2.00. No new simulation: 7d's rows
(S_C inputs) joined with 7b's lawfloor rows (e at every k).

    python experiments/frontier7e/run.py report    # H273 to H276 -> results.txt, summary.json

    U(k)          every design gets the k-cycle line; cost k
    T(K1, f, s)   the round(f n) designs with the largest score s get the K1-cycle line, the rest the 10-cycle line;
                  cost 10 + (K1 - 10) f
    cost(t)       least cost over a family's policies whose q75 <= t x q75(U(50)); unmet = 50
Plan in ../../LOG.md (7e plan).
"""
import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SETS = ("Ai2020", "Chen2020", "OKane2022", "NCA_Kim2011")
POOLS = ("5zk", "5zy", "5zz")
CELL = "000"
KS = (10, 15, 20, 30, 40, 50)
K1S = (15, 20, 30, 40, 50)
GRID = [i / 20 for i in range(21)]
TS = [round(1 + i / 20, 2) for i in range(21)]
Q, T0, NDRAW, SEED, KMAX = 0.75, 1.25, 2000, 79, 50


# ---------- pure helpers (stdlib; tested) ----------

def quant(xs, p=Q):
    """7c's quantile: the sorted value at index int(p n)."""
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(p * len(xs)))]


def nflag(f, n):
    return int(round(f * n + 1e-9))


def flagged(score, f):
    o = sorted(range(len(score)), key=lambda i: (-score[i], i))
    return set(o[:nflag(f, len(score))])


def mix(e10, ek, flags):
    return [ek[i] if i in flags else e10[i] for i in range(len(e10))]


def cost(K1, f):
    return 10 + (K1 - 10) * f


def uniform_policies(E):
    """E: {k: [e per design]} -> [(cost, label, q75)]."""
    return [(k, ("U", k), quant(E[k])) for k in KS]


def triage_policies(E, score_for):
    """score_for(K1) -> score list, or None for random flags (expected q75 over NDRAW draws)."""
    out = []
    n = len(E[10])
    for K1 in K1S:
        s = score_for(K1)
        for f in GRID:
            if s is None:
                rng = random.Random(SEED)
                k = nflag(f, n)
                q = sum(quant(mix(E[10], E[K1], set(rng.sample(range(n), k)))) for _ in range(NDRAW)) / NDRAW
            else:
                q = quant(mix(E[10], E[K1], flagged(s, f)))
            out.append((cost(K1, f), ("T", K1, f), q))
    return out


def cheapest(pols, target):
    """Least-cost policy meeting the target, ties by label; (KMAX, None) if none does."""
    ok = [p for p in pols if p[2] <= target + 1e-15]
    if not ok:
        return KMAX, None
    c, lab, _ = min(ok, key=lambda p: (p[0], p[1]))
    return c, lab


def saved(c):
    return 1 - c / KMAX


def verdict(sup, ref):
    return "supported" if sup else ("refuted" if ref else "inconclusive")


# ---------- data ----------

def load():
    lf = {(r["cond"], r["j"], r["pool"]): r for r in json.loads((EXP / "lawfloor" / "rows.json").read_text())}
    out = []
    for d in json.loads((EXP / "triage7d" / "rows.json").read_text()):
        l = lf[(d["cond"], d["j"], d["pool"])]
        eL = l["cells"][CELL]["eL"]
        assert abs(eL["10"] - d["cells"][CELL]["e10"]) < 1e-12 and abs(eL["50"] - d["cells"][CELL]["e50"]) < 1e-12
        out.append(dict(set=d["set"], pool=d["pool"], mC=d["cells"][CELL]["mC"],
                        E={k: eL[str(k)] for k in KS}))
    assert len(out) == 104
    return out


def families(t):
    E = {k: [r["E"][k] for r in t] for k in KS}
    SC = [abs(r["mC"] - 1) for r in t]
    return E, dict(
        uniform=uniform_policies(E),
        S_C=triage_policies(E, lambda K1: SC),
        random=triage_policies(E, lambda K1: None),
        oracle=triage_policies(E, lambda K1: [a - b for a, b in zip(E[10], E[K1])]))


def summarise(t):
    E, F = families(t)
    q50 = quant(E[50])
    curves = {}
    for name, pols in F.items():
        rowz = [cheapest(pols, tt * q50) for tt in TS]
        curves[name] = dict(cost=[c for c, _ in rowz], policy=[lab for _, lab in rowz],
                            saved=[saved(c) for c, _ in rowz])
    i0 = TS.index(T0)
    tgt = T0 * q50
    short = cheapest([p for p in F["S_C"] if p[1][1] <= 30], tgt)
    long_ = cheapest([p for p in F["S_C"] if p[1][1] == 50], tgt)
    return dict(n=len(t), q75={k: quant(E[k]) for k in KS}, curves=curves,
                mean_saved={k: sum(v["saved"]) / len(TS) for k, v in curves.items()},
                n_strict=sum(a < b - 1e-12 for a, b in zip(curves["S_C"]["cost"], curves["uniform"]["cost"])),
                at_t0={k: (v["cost"][i0], v["policy"][i0]) for k, v in curves.items()},
                short30=short, long50=long_)


def apply_policy(t, lab):
    E = {k: [r["E"][k] for r in t] for k in KS}
    if lab is None:
        return quant(E[50])
    if lab[0] == "U":
        return quant(E[lab[1]])
    _, K1, f = lab
    return quant(mix(E[10], E[K1], flagged([abs(r["mC"] - 1) for r in t], f)))


def transfer(rs):
    folds = []
    for st in SETS:
        for p in POOLS:
            tr = [r for r in rs if r["set"] == st and r["pool"] != p]
            te = [r for r in rs if r["set"] == st and r["pool"] == p]
            _, F = families_nr(tr)
            tgt_tr = T0 * quant([r["E"][50] for r in tr])
            tgt_te = T0 * quant([r["E"][50] for r in te])
            res = {}
            for name in ("S_C", "uniform"):
                c, lab = cheapest(F[name], tgt_tr)
                q = apply_policy(te, lab)
                res[name] = dict(cost=c, policy=lab, q75=q, target=tgt_te, met=q <= tgt_te + 1e-15)
            folds.append(dict(set=st, pool=p, n_train=len(tr), n_test=len(te), **res))
    return folds


def families_nr(t):
    """families() without the random family (not needed for transfer, and slow)."""
    E = {k: [r["E"][k] for r in t] for k in KS}
    SC = [abs(r["mC"] - 1) for r in t]
    return E, dict(uniform=uniform_policies(E), S_C=triage_policies(E, lambda K1: SC))


# ---------- report ----------

def report():
    rs = load()
    S = {st: summarise([r for r in rs if r["set"] == st]) for st in SETS}
    folds = transfer(rs)
    n273 = sum(S[s]["n_strict"] >= 11 for s in SETS)
    n274 = sum(S[s]["short30"][0] <= S[s]["long50"][0] + 1e-12 for s in SETS)
    r274 = sum(S[s]["short30"][0] > S[s]["long50"][0] + 1e-12 for s in SETS)
    n275 = sum(S[s]["mean_saved"]["S_C"] > S[s]["mean_saved"]["random"] + 1e-12 for s in SETS)
    m276 = sum(f["S_C"]["met"] for f in folds)
    mU = sum(f["uniform"]["met"] for f in folds)
    V = dict(H273=verdict(n273 >= 3, n273 <= 1), H274=verdict(n274 >= 3, r274 >= 3),
             H275=verdict(n275 >= 3, 4 - n275 >= 3), H276=verdict(m276 >= 8, m276 <= 4),
             counts=dict(n273=n273, n274=n274, r274=r274, n275=n275, m276=m276, met_uniform=mU))
    lab = lambda l: "none" if l is None else (f"U{l[1]}" if l[0] == "U" else f"{l[1]}@{l[2]:.2f}")
    L = ["cell-fidelity milestone 7e: the triage frontier. DFN cycles per design needed to bring the q75 of the",
         "cycle-99 lithium-loss forecast error (cell 000, the real forecast) to t x q75 of the all-50 policy.", "",
         "q75 of the uniform policies U(k):", f"{'set':12s}{'n':>3s}" + "".join(f"{'k' + str(k):>8s}" for k in KS)]
    for st in SETS:
        L.append(f"{st:12s}{S[st]['n']:3d}" + "".join(f"{S[st]['q75'][k]:8.3f}" for k in KS))
    for st in SETS:
        L += ["", f"{st}: cost (cycles/design) to meet t x q75(U50) = t x {S[st]['q75'][50]:.3f}; policy as K1@f or Uk",
              f"{'t':>5s}" + "".join(f"{k:>16s}" for k in ("uniform", "S_C", "random", "oracle"))]
        for i, tt in enumerate(TS):
            if i % 2 == 0 or tt == T0:
                L.append(f"{tt:5.2f}" + "".join(
                    f"{S[st]['curves'][k]['cost'][i]:6.1f} {lab(S[st]['curves'][k]['policy'][i]):>9s}"
                    for k in ("uniform", "S_C", "random", "oracle")))
        L.append("mean saved: " + ", ".join(f"{k} {100 * v:.0f}%" for k, v in S[st]["mean_saved"].items())
                 + f"; S_C strictly cheaper than uniform at {S[st]['n_strict']}/21 targets")
        L.append(f"t = 1.25, S_C with K1 <= 30: {S[st]['short30'][0]:.1f} ({lab(S[st]['short30'][1])}); "
                 f"K1 = 50: {S[st]['long50'][0]:.1f} ({lab(S[st]['long50'][1])})")
    L += ["", "leave one pool out, t = 1.25 (policy picked on two pools, scored on the third):",
          f"{'set':12s}{'pool':>5s}{'n':>4s}{'S_C policy':>12s}{'q75':>7s}{'target':>8s}{'met':>5s}"
          f"{'U policy':>10s}{'q75':>7s}{'met':>5s}"]
    for f in folds:
        a, u = f["S_C"], f["uniform"]
        L.append(f"{f['set']:12s}{f['pool']:>5s}{f['n_test']:4d}{lab(a['policy']):>12s}{a['q75']:7.3f}{a['target']:8.3f}"
                 f"{'yes' if a['met'] else 'no':>5s}{lab(u['policy']):>10s}{u['q75']:7.3f}{'yes' if u['met'] else 'no':>5s}")
    c = V["counts"]
    L += ["", "(e = |ln(L_pred(99)/L_DFN(99))| at kappa = 25.3, 7b's line through cycles 2..k. S_C = |m_hat_C - 1|,",
          " 7c's leave-one-out drift correction; random = expected q75 over 2,000 random flag sets; oracle = flags",
          " by the design's own e10 - eK1. cost = least over the family's policies meeting the target, in hindsight",
          " within the set; unmet = 50. saved = 1 - cost/50, averaged over t = 1.00, 1.05, ..., 2.00.)", "",
          f"H273 (S_C strictly cheaper than uniform at >= 11 of 21 targets, >= 3 of 4 sets): {V['H273']} ({c['n273']}/4)",
          f"H274 (t = 1.25: S_C with K1 <= 30 costs <= K1 = 50, >= 3 of 4 sets): {V['H274']} ({c['n274']}/4, more on {c['r274']})",
          f"H275 (mean saved S_C > random, >= 3 of 4 sets): {V['H275']} ({c['n275']}/4)",
          f"H276 (transferred S_C policy meets the held-out target in >= 8 of 12 folds): {V['H276']} ({c['m276']}/12;"
          f" uniform {c['met_uniform']}/12)"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(sets=S, folds=folds, verdicts=V, targets=TS), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"report": report}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
