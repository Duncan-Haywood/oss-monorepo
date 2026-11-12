"""Milestone 5: the decision-margin bound, and how well paired designs estimate it.

    python3 experiments/m5_margin_bound/run.py      (stdlib only; reads milestones 1b, 1c, 1d's results.txt)

Theory (PROPOSAL.md, "Method"). A cheap tier t and a reference tier T score a finite candidate set D
(here the arm-width offsets) with s_t and s_T, lower is better. Let d^ = argmin s_t (the cheap choice),
d* = argmin s_T, and e(d) = s_T(d) - s_t(d), the tier error at design d. Then

  (B1, pair bound)  regret r = s_T(d^) - s_T(d*) = [s_t(d^) - s_t(d*)] + e(d^) - e(d*) <= e(d^) - e(d*),
                    because s_t(d^) <= s_t(d*). So r <= osc(e) = max e - min e <= 2 max|e|.
  (C1, global certificate)  if margin_t = min_{d != d^} s_t(d) - s_t(d^) exceeds osc(e), then d^ = d*:
                    s_T(d) - s_T(d^) = [s_t(d) - s_t(d^)] + [e(d) - e(d^)] >= margin_t - osc(e) > 0.
  (C2, cone certificate)  on a 1D design grid, let L = max over neighbouring candidates of
                    |e(d') - e(d)| / |d' - d|. By the triangle inequality |e(d) - e(d^)| <= L |d - d^|, so
                    if s_t(d) - s_t(d^) > L |d - d^| for every d != d^, then d^ = d*; and in general
                    r <= L |d^ - d*|, with d* inside the screening set N_L = {d : s_t(d) - s_t(d^) <= L |d - d^|}.
  Global screening set N_osc = {d : s_t(d) - s_t(d^) <= osc(e)} holds d* for the same reason.
  A constant tier error (e the same at every design) gives r = 0 and certifies any choice: only the
  variation of the error across designs matters, not its size, which is what the related work reports.

Data: the shape errors already committed by milestones 1b, 1c and 1d (no new simulation). Tier pairs
(cheap t -> reference T), each an "instance" with its own candidate set:
  2d->3d     2D chain against the converged 3D sheet on the 3 cm arm: 1c's 10 config-fabric rows and
             1d's 18 fabric-EA rows (28 instances, 7 offsets 0 to +3 cm).
  cap->conv  1b's 3D sheet stopped at 3000 L-BFGS iterations against the converged solve (4 fabrics,
             offsets -1, 0, +0.5, +1, +1.5, +2, +3).
  mesh       1c at EA 150: 7.5 mm rows -> 5 mm rows, and 9 -> 13 depth columns (2 fabrics each, 4).
  param      1d's 3D sheet with measured G at a guessed EA (150, 800, 3200 N/m) -> the same sheet at the
             KES secant EA_kes (12 instances), and 1c's default sheet (EA 150, shear 0.1 EA) -> 1d at EA_kes
             (fabrics A and D, 2): the "uncalibrated -> calibrated" pair of H3.
Solver tolerance: a converged 3D score carries its last-chunk change delta (a proxy, not a bound on the
distance to the minimum; milestone 1b). A certificate "with tolerance" asks margin_t > bound + 2 (delta_t + delta_T)
using the largest delta in the instance (the 2D chain and the 3000-iteration scores count as exact).

Predictions (written before any of the quantities below was computed; the shape errors themselves were
already public in milestones 1b to 1d):
  M1 the inequalities hold in every instance: r <= pair bound <= osc <= 2 max|e|, and r <= L |d^ - d*|;
     whenever C1 or C2 fires, r = 0. (A theorem; a failure is a code bug.)
  M2 paired beats absolute: over the 2d->3d instances, the median of osc / (2 max|e|) is at most 0.35.
  M3 across model tiers the global certificate is useless: C1 fires in none of the 2d->3d instances and
     in at most 1 of the 4 cap->conv instances.
  M4 the cone is sharper: C2 (oracle L) fires in strictly more instances than C1 over all families, and in
     at least one 2d->3d instance.
  M5 screening: with oracle osc, the median 2d->3d instance's N_osc holds at least 4 of its 7 candidates;
     the median param instance from EA 3200 holds at most 2.
  M6 the realised regret of the 2D choice on the 3D sheet is under 0.05 cm in every 2d->3d instance at
     EA >= 800 N/m.
  M7 a cheap estimate of L from three reference evaluations (d^ and its two grid neighbours) is at least
     half the oracle L in at least 75% of all instances.
"""
import statistics
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent


def regret_quantities(t, T, delta=0.0):
    """t, T: {design (float): score}. Returns a dict of the bound's quantities for one instance."""
    D = sorted(t)
    assert sorted(T) == D and len(D) >= 2
    dh = min(D, key=lambda d: (t[d], d))
    ds = min(D, key=lambda d: (T[d], d))
    e = {d: T[d] - t[d] for d in D}
    osc = max(e.values()) - min(e.values())
    L = max(abs(e[b] - e[a]) / (b - a) for a, b in zip(D, D[1:]))
    margin_t = min(t[d] - t[dh] for d in D if d != dh)
    margin_T = min(T[d] - T[ds] for d in D if d != ds)
    i = D.index(dh)
    nb = D[max(0, i - 1):i + 2]
    L3 = max(abs(e[b] - e[a]) / (b - a) for a, b in zip(nb, nb[1:]))
    return dict(
        choice=dh, best=ds, regret=T[dh] - T[ds], pair=e[dh] - e[ds], osc=osc, absb=2 * max(abs(v) for v in e.values()),
        L=L, L3=L3, cone=L * abs(dh - ds), margin_t=margin_t, margin_T=margin_T, n=len(D),
        c1=margin_t > osc, c2=all(t[d] - t[dh] > L * abs(d - dh) for d in D if d != dh),
        c1tol=margin_t > osc + 4 * delta, c2tol=all(t[d] - t[dh] > L * abs(d - dh) + 4 * delta for d in D if d != dh),
        c2est=all(t[d] - t[dh] > L3 * abs(d - dh) for d in D if d != dh),
        n_osc=sum(t[d] - t[dh] <= osc for d in D), n_L=sum(t[d] - t[dh] <= L * abs(d - dh) for d in D),
        delta=delta)


def rows(path, sec="1."):
    on = False
    for l in (EXP / path / "results.txt").read_text().splitlines():
        if l[:2].rstrip(".").isdigit() and l[1] == ".":
            on = l.startswith(sec)
            continue
        if on and l.strip():
            yield l.split()


def load():
    """Instances as (family, label, t, T, delta)."""
    inst = []
    c = {}
    for p in rows("m1c_ea_mesh"):
        if len(p) == 9:
            cfg, f, off = p[0], p[1], float(p[2])
            c.setdefault((cfg, f), {})[off] = (float(p[3]), float(p[5]), float(p[8]))
    d = {}
    for p in rows("m1d_measured_shear"):
        if len(p) == 10:
            f, ea, off = p[0], float(p[1]), float(p[3])
            d.setdefault((f, ea), {})[off] = (float(p[4]), float(p[6]), float(p[9]))
    b = {}
    for p in rows("m1b_converged"):
        if len(p) == 9 and p[0] in "ABCD":
            b.setdefault(p[0], {})[float(p[1])] = (float(p[2]), float(p[3]), float(p[5]))
    for (cfg, f), r in sorted(c.items()):
        inst.append(("2d->3d", f"1c {cfg} {f}", {k: v[2] for k, v in r.items()}, {k: v[0] for k, v in r.items()},
                     max(v[1] for v in r.values())))
    for (f, ea), r in sorted(d.items()):
        inst.append(("2d->3d", f"1d {f} EA{ea:g}", {k: v[2] for k, v in r.items()}, {k: v[0] for k, v in r.items()},
                     max(v[1] for v in r.values())))
    for f, r in sorted(b.items()):
        inst.append(("cap->conv", f"1b {f}", {k: v[0] for k, v in r.items()}, {k: v[1] for k, v in r.items()},
                     max(v[2] for v in r.values())))
    base = "EA150_ds5mm_nz9"
    for f in ("A", "D"):
        B = c[(base, f)]
        for cfg, coarse in (("EA150_ds7.5mm_nz9", True), ("EA150_ds5mm_nz13", False)):
            O = c[(cfg, f)]
            lo, hi = (O, B) if coarse else (B, O)
            inst.append(("mesh", f"1c {cfg if coarse else base}->{base if coarse else cfg} {f}",
                         {k: v[0] for k, v in lo.items()}, {k: v[0] for k, v in hi.items()},
                         max(v[1] for v in list(lo.values()) + list(hi.values()))))
    kes = {p[0]: float(p[5]) for p in rows("m1d_measured_shear", "0.") if len(p) == 6 and p[0] in "ABCD"}
    for f in "ABCD":
        R = d[(f, kes[f])]
        for ea in (150.0, 800.0, 3200.0):
            if (f, ea) in d:
                G = d[(f, ea)]
                inst.append(("param", f"1d {f} EA{ea:g}->EA_kes {kes[f]:g}", {k: v[0] for k, v in G.items()},
                             {k: v[0] for k, v in R.items()}, max(v[1] for v in list(G.values()) + list(R.values()))))
    for f in ("A", "D"):
        G, R = c[(base, f)], d[(f, kes[f])]
        inst.append(("param", f"1c default {f} -> 1d EA_kes {kes[f]:g}", {k: v[0] for k, v in G.items()},
                     {k: v[0] for k, v in R.items()}, max(v[1] for v in list(G.values()) + list(R.values()))))
    return inst


def main():
    inst = load()
    out = ["hanger-codesign milestone 5. Decision-margin bound on milestones 1b, 1c and 1d's committed shape errors",
           "(cm RMS, whole sheet). e = s_T - s_t; regret r = s_T(d^) - s_T(d*); pair = e(d^) - e(d*); osc = max e - min e;",
           "abs = 2 max|e|; L = largest neighbour slope of e (cm per cm of offset); cone = L |d^ - d*|; L3 = L from d^ and",
           "its two neighbours only; C1: margin_t > osc; C2: margin_t's cone test with L; tol: with 4 x delta added;",
           "N_osc, N_L: candidates a reference tier must still evaluate.", "",
           "1. per instance: family label n d^ d* r pair osc abs L L3 cone margin_t margin_T C1 C2 C1tol C2tol C2est N_osc N_L delta"]
    Q = []
    for fam, lab, t, T, delta in inst:
        q = regret_quantities(t, T, delta)
        q.update(fam=fam, lab=lab)
        Q.append(q)
        out.append(" ".join([fam, lab.replace(" ", "_"), str(q["n"]), f"{q['choice']:+.1f}", f"{q['best']:+.1f}"]
                            + [f"{q[k]:.4f}" for k in ("regret", "pair", "osc", "absb", "L", "L3", "cone", "margin_t", "margin_T")]
                            + [str(int(q[k])) for k in ("c1", "c2", "c1tol", "c2tol", "c2est")]
                            + [str(q["n_osc"]), str(q["n_L"]), f"{q['delta']:.4f}"]))
    out += ["", "2. per family: instances, regret>0, mean regret, max regret, C1, C2, C1tol, C2tol, C2est, median osc/abs, median N_osc, median N_L"]
    fams = ["2d->3d", "cap->conv", "mesh", "param"]
    for fam in fams:
        G = [q for q in Q if q["fam"] == fam]
        out.append(" ".join([fam, str(len(G)), str(sum(q["regret"] > 0 for q in G)),
                             f"{statistics.mean(q['regret'] for q in G):.4f}", f"{max(q['regret'] for q in G):.4f}"]
                            + [str(sum(q[k] for q in G)) for k in ("c1", "c2", "c1tol", "c2tol", "c2est")]
                            + [f"{statistics.median(q['osc'] / q['absb'] for q in G):.3f}",
                               f"{statistics.median(q['n_osc'] for q in G):g}", f"{statistics.median(q['n_L'] for q in G):g}"]))
    eps = 1e-12
    m1 = all(q["regret"] <= q["pair"] + eps <= q["osc"] + 2 * eps <= q["absb"] + 3 * eps and q["regret"] <= q["cone"] + eps
             and (not (q["c1"] or q["c2"]) or q["regret"] == 0) for q in Q)
    dd = [q for q in Q if q["fam"] == "2d->3d"]
    m2v = statistics.median(q["osc"] / q["absb"] for q in dd)
    cc = [q for q in Q if q["fam"] == "cap->conv"]
    c1all, c2all = sum(q["c1"] for q in Q), sum(q["c2"] for q in Q)
    m5a = statistics.median(q["n_osc"] for q in dd)
    p3 = [q for q in Q if q["fam"] == "param" and "EA3200->" in q["lab"]]
    m5b = statistics.median(q["n_osc"] for q in p3)
    hi = [q for q in dd if q["lab"].startswith("1d") and float(q["lab"].split("EA")[1]) >= 800]
    hi += [q for q in dd if q["lab"].startswith("1c EA800")]
    m7 = sum(q["L3"] >= 0.5 * q["L"] for q in Q)
    hv = lambda ok: "held" if ok else "refuted"
    out += ["", f"instances: {len(Q)}; 2d->3d {len(dd)}, cap->conv {len(cc)}",
            f"median osc/abs over 2d->3d: {m2v:.3f}; C1 fires {c1all}, C2 fires {c2all} (2d->3d: C1 {sum(q['c1'] for q in dd)}, C2 {sum(q['c2'] for q in dd)}; cap->conv C1 {sum(q['c1'] for q in cc)})",
            f"median N_osc: 2d->3d {m5a:g} of 7, param from EA 3200 {m5b:g} of 7",
            f"2D-choice regret at EA >= 800 ({len(hi)} instances): max {max(q['regret'] for q in hi):.4f}",
            f"L3 >= L/2 in {m7} of {len(Q)}", "",
            f"M1 inequalities hold and certificates imply zero regret in every instance: {hv(m1)}",
            f"M2 median osc/(2 max|e|) over 2d->3d <= 0.35: {hv(m2v <= 0.35)}",
            f"M3 C1 fires in no 2d->3d and at most 1 cap->conv instance: {hv(sum(q['c1'] for q in dd) == 0 and sum(q['c1'] for q in cc) <= 1)}",
            f"M4 C2 fires more often than C1, and on at least one 2d->3d instance: {hv(c2all > c1all and sum(q['c2'] for q in dd) >= 1)}",
            f"M5 median N_osc >= 4 on 2d->3d and <= 2 on param from EA 3200: {hv(m5a >= 4 and m5b <= 2)}",
            f"M6 2D-choice regret < 0.05 cm at EA >= 800 on every 2d->3d instance: {hv(max(q['regret'] for q in hi) < 0.05)}",
            f"M7 L3 >= L/2 in at least 75% of instances: {hv(m7 >= 0.75 * len(Q))}"]
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out[-16:]))


if __name__ == "__main__":
    main()
