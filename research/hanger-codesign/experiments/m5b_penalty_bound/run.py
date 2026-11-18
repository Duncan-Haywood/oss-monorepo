"""Milestone 5b: a regret bound that keeps the cheap tier's own penalty, and a screen-and-verify loop.

    python3 experiments/m5b_penalty_bound/run.py    (stdlib only; reads milestones 1b, 1c, 1d's results.txt
                                                     through milestone 5's loader)

Why. Milestone 5's pair bound r <= e(d^) - e(d*) drops the term s_t(d*) - s_t(d^) >= 0 from the exact identity

    r = s_T(d^) - s_T(d*) = e(d^) - e(d*) - [s_t(d*) - s_t(d^)],      e = s_T - s_t,

and that term is large exactly where the cheap tier is sharp (the 2D chain), so the bound was 2 to 100 times
the realised regret on 2D -> 3D. Its cone quantity L |d^ - d*| also needs d*, which nobody has before running
the reference tier. Keep the penalty and take the maximum over the unknown d* instead:

    r = max_d [ e(d^) - e(d) - Dt(d) ],   Dt(d) = s_t(d) - s_t(d^) >= 0   (d = d* attains it; d = d^ gives 0)

(P1, penalty bound) if |e(d) - e(d^)| <= K |d - d^| for every d (K: any constant with that property), then
                    r <= R(K) = max(0, max_{d != d^} [ K |d - d^| - Dt(d) ]).
                    R uses only the cheap scores and K. The smallest valid K is the star constant around the
                    choice, K* = max_d |e(d) - e(d^)| / |d - d^|, and K* <= L (milestone 5's largest neighbour
                    slope) by the triangle inequality, so R(K*) <= R(L). R(K) = 0 is exactly milestone 5's cone
                    certificate with K in place of L. Whether R(K*) also stays below the oracle quantity
                    K* |d^ - d*| is not a theorem (a design other than d* can attain the max); Q1 checks it.
(P2, global form)   r <= (osc - margin_t)_+, which is milestone 5's C1 turned into a number.

In practice K is not known. Estimate it from reference runs near the choice: K3 = the star constant from d^ and
its two grid neighbours (milestone 5's L3 is the neighbour-slope version of the same three runs). Then

(SV, screen and verify, kappa > 0)
    1. run the reference tier at d^ and its grid neighbours;
    2. K_hat = star constant around d^ over every design run so far;
    3. screen N = {d : Dt(d) <= kappa K_hat |d - d^|}; run the reference tier on any d in N not yet run;
    4. repeat 2-3 until nothing new is added; return the evaluated design with the lowest reference score.
    Baselines: cheap choice only (1 reference run: the cheap tier is trusted), local-3 (d^ and its neighbours,
    take the best: 3 runs or 2 at an end of the grid), exhaustive (all 7 runs, regret 0).

Data: milestone 5's 50 instances (no new simulation): 2d->3d 28, cap->conv 4, mesh 4, param 14.

Predictions. Written before this script was first run, but after milestone 5's per-instance table (r, pair, osc,
L, L3, margin_t) was public, so any prediction that follows from that table by hand is not blind; P1 and P2 are
theorems (a failure is a code bug).
  Q1 R(K*) <= K* |d^ - d*| in every instance (not a theorem; a counterexample would say the a-priori bound can be
     looser than the oracle cone quantity).
  Q2 tightening: over 2d->3d instances with r > 0, the median of r / R(K*) is at least twice the median of
     r / pair.
  Q3 coverage of the estimate: R(K3) >= r in at least 45 of the 50 instances, and R(2 K3) >= r in all 50.
  Q4 SV with kappa = 1 has zero regret in at least 45 of 50 instances, at a mean of at most 4.5 reference runs of 7,
     and its mean regret is no larger than local-3's.
  Q5 on 2d->3d instances SV(kappa = 1) costs at least one reference run more than local-3 at the median (the
     milestone 5 screening sets N_L held a median 4 of 7).
"""
import importlib.util
import statistics
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("m5", HERE.parent / "m5_margin_bound" / "run.py")
m5 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m5)


def star(e, dh, ds):
    """Smallest K with |e(d) - e(dh)| <= K |d - dh| over the designs ds (dh itself is skipped)."""
    return max((abs(e[d] - e[dh]) / abs(d - dh) for d in ds if d != dh), default=0.0)


def penalty_bound(t, dh, K):
    """R(K) = max(0, max_{d != dh} K |d - dh| - (t(d) - t(dh)))."""
    return max([0.0] + [K * abs(d - dh) - (t[d] - t[dh]) for d in t if d != dh])


def neighbours(D, dh):
    i = D.index(dh)
    return D[max(0, i - 1):i + 2]


def screen_verify(t, T, kappa=1.0):
    """Returns (chosen design, set of designs run on the reference tier)."""
    D = sorted(t)
    dh = min(D, key=lambda d: (t[d], d))
    run = set(neighbours(D, dh))
    while True:
        e = {d: T[d] - t[d] for d in run}
        K = star(e, dh, run)
        new = {d for d in D if t[d] - t[dh] <= kappa * K * abs(d - dh)} - run
        if not new:
            break
        run |= new
    return min(run, key=lambda d: (T[d], d)), run


def local3(t, T):
    D = sorted(t)
    dh = min(D, key=lambda d: (t[d], d))
    run = set(neighbours(D, dh))
    return min(run, key=lambda d: (T[d], d)), run


def quantities(t, T):
    D = sorted(t)
    q = m5.regret_quantities(t, T)
    dh, ds = q["choice"], q["best"]
    e = {d: T[d] - t[d] for d in D}
    Ks = star(e, dh, D)
    K3 = star(e, dh, neighbours(D, dh))
    best = min(T.values())
    sv = {k: screen_verify(t, T, k) for k in (0.5, 1.0, 2.0)}
    lc = local3(t, T)
    q.update(Kstar=Ks, K3=K3, R_Ks=penalty_bound(t, dh, Ks), R_L=penalty_bound(t, dh, q["L"]),
             R_K3=penalty_bound(t, dh, K3), R_2K3=penalty_bound(t, dh, 2 * K3),
             R_osc=max(0.0, q["osc"] - q["margin_t"]), cone_Ks=Ks * abs(dh - ds),
             loc_r=T[lc[0]] - best, loc_n=len(lc[1]))
    for k, (c, run) in sv.items():
        q[f"sv{k:g}_r"], q[f"sv{k:g}_n"] = T[c] - best, len(run)
    return q


def main():
    Q = []
    for fam, lab, t, T, _delta in m5.load():
        q = quantities(t, T)
        q.update(fam=fam, lab=lab)
        Q.append(q)
    cols = ("regret", "pair", "cone_Ks", "R_Ks", "R_L", "R_K3", "R_2K3", "R_osc", "Kstar", "L", "K3")
    out = ["hanger-codesign milestone 5b. Penalty-keeping regret bound and screen-and-verify on milestone 5's 50 instances",
           "(cm RMS shape error, whole sheet). r = realised regret of the cheap choice; pair = milestone 5's bound e(d^) - e(d*);",
           "cone_Ks = K* |d^ - d*|; R_X = max(0, max_d X |d - d^| - Dt(d)) with X = K* (star constant around d^, oracle),",
           "L (largest neighbour slope, oracle), K3 (star constant from d^ and its grid neighbours), 2 K3; R_osc = (osc - margin_t)+.",
           "Loops: reference-tier regret r and runs n for local-3 and screen-and-verify at kappa 0.5, 1, 2 (7 candidates).", "",
           "1. per instance: family label d^ d* " + " ".join(cols) + " loc_r loc_n sv0.5_r sv0.5_n sv1_r sv1_n sv2_r sv2_n"]
    for q in Q:
        out.append(" ".join([q["fam"], q["lab"].replace(" ", "_"), f"{q['choice']:+.1f}", f"{q['best']:+.1f}"]
                            + [f"{q[k]:.4f}" for k in cols]
                            + [f"{q['loc_r']:.4f}", str(q["loc_n"])]
                            + sum(([f"{q[f'sv{k}_r']:.4f}", str(q[f'sv{k}_n'])] for k in ("0.5", "1", "2")), [])))
    fams = ["2d->3d", "cap->conv", "mesh", "param"]
    out += ["", "2. per family: n, r>0, median r/pair, median r/R_Ks, median r/R_L (over r>0), R_K3>=r, R_2K3>=r, "
                "mean r: cheap local3 sv0.5 sv1 sv2, mean runs: local3 sv0.5 sv1 sv2, zero-regret: local3 sv0.5 sv1 sv2"]

    def summ(G):
        P = [q for q in G if q["regret"] > 0]
        med = lambda f: f"{statistics.median(f(q) for q in P):.3f}" if P else "-"
        return " ".join([str(len(G)), str(len(P)), med(lambda q: q["regret"] / q["pair"]),
                         med(lambda q: q["regret"] / q["R_Ks"]), med(lambda q: q["regret"] / q["R_L"]),
                         str(sum(q["R_K3"] >= q["regret"] - 1e-12 for q in G)),
                         str(sum(q["R_2K3"] >= q["regret"] - 1e-12 for q in G))]
                        + [f"{statistics.mean(q[k] for q in G):.4f}" for k in ("regret", "loc_r", "sv0.5_r", "sv1_r", "sv2_r")]
                        + [f"{statistics.mean(q[k] for q in G):.2f}" for k in ("loc_n", "sv0.5_n", "sv1_n", "sv2_n")]
                        + [str(sum(q[k] == 0 for q in G)) for k in ("loc_r", "sv0.5_r", "sv1_r", "sv2_r")])
    for fam in fams:
        out.append(fam + " " + summ([q for q in Q if q["fam"] == fam]))
    out.append("all " + summ(Q))

    eps = 1e-12
    th = all(q["regret"] <= q["R_Ks"] + eps and q["R_Ks"] <= q["R_L"] + eps and q["Kstar"] <= q["L"] + eps
             and q["regret"] <= q["R_osc"] + eps and q["R_osc"] <= q["osc"] + eps for q in Q)
    q1 = [q for q in Q if q["R_Ks"] > q["cone_Ks"] + eps]
    dd = [q for q in Q if q["fam"] == "2d->3d"]
    P = [q for q in dd if q["regret"] > 0]
    m_pair = statistics.median(q["regret"] / q["pair"] for q in P)
    m_ks = statistics.median(q["regret"] / q["R_Ks"] for q in P)
    cov1 = sum(q["R_K3"] >= q["regret"] - eps for q in Q)
    cov2 = sum(q["R_2K3"] >= q["regret"] - eps for q in Q)
    z1 = sum(q["sv1_r"] == 0 for q in Q)
    n1 = statistics.mean(q["sv1_n"] for q in Q)
    r1, rl = statistics.mean(q["sv1_r"] for q in Q), statistics.mean(q["loc_r"] for q in Q)
    md_sv, md_loc = statistics.median(q["sv1_n"] for q in dd), statistics.median(q["loc_n"] for q in dd)
    hv = lambda ok: "held" if ok else "refuted"
    out += ["", f"theorems P1, P2 (r <= R(K*) <= R(L), K* <= L, r <= R_osc <= osc) in every instance: {th}",
            f"instances where R(K*) > K* |d^ - d*|: {len(q1)}" + (" (" + ", ".join(q['lab'] for q in q1[:6]) + ")" if q1 else ""),
            f"2d->3d with r > 0: {len(P)}; median r/pair {m_pair:.3f}, median r/R(K*) {m_ks:.3f}, ratio {m_ks / m_pair:.2f}",
            f"coverage over 50: R(K3) >= r in {cov1}, R(2 K3) >= r in {cov2}",
            f"SV(1): zero regret in {z1} of 50, mean runs {n1:.2f}, mean regret {r1:.4f} against local-3's {rl:.4f}",
            f"2d->3d median runs: SV(1) {md_sv:g}, local-3 {md_loc:g}", "",
            f"Q1 R(K*) <= K* |d^ - d*| in every instance: {hv(not q1)}",
            f"Q2 median r/R(K*) at least twice median r/pair on 2d->3d with r > 0: {hv(m_ks >= 2 * m_pair)}",
            f"Q3 R(K3) >= r in at least 45 of 50 and R(2 K3) >= r in all 50: {hv(cov1 >= 45 and cov2 == 50)}",
            f"Q4 SV(1) zero regret in >= 45, mean runs <= 4.5, mean regret <= local-3's: {hv(z1 >= 45 and n1 <= 4.5 and r1 <= rl + eps)}",
            f"Q5 SV(1) median runs >= local-3 median + 1 on 2d->3d: {hv(md_sv >= md_loc + 1)}"]
    if not th:
        raise SystemExit("a theorem failed: code bug")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out[-14:]))


if __name__ == "__main__":
    main()
