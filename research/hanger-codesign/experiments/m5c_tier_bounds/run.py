"""Milestone 5c: milestone 5's certificates and 5b's penalty bound on milestone 4e's three tiers, and a
Lipschitz constant borrowed from the other fabrics.

    python3 experiments/m5c_tier_bounds/run.py      (stdlib only; reads milestone 4e's results.json and
                                                     run_log_extend.txt; no new simulation)

Why. Milestones 5 and 5b built the decision-margin theory on 50 instances whose reference tier was our own
converged spring sheet (T2), before the top tier existed. Milestone 4e has the top tier (T3, the triangle FEM)
on the hanger: nine measured wovens (Petrak et al. 2021), two bending settings (u: FAST, c: 0.485 x FAST), five
arm offsets, and every choice of the chain (T1) and the spring sheet (T2) agrees with T3's except F2 at c, where
T2 picks 0 cm and T3 +1 cm (regret 0.050 cm). Agreement after the fact is not a certificate: the question for
the paper is whether the cheap tier's choice could have been *certified* before the top tier was run on every
width, and with how many top-tier runs. 4e's Next (c).

Instances (45): for each fabric and setting, T1 -> T3 (18) and T2 -> T3 (18); and the calibration pair
T3 at u -> T3 at c on each fabric (9: same model, one parameter moved, where milestone 5 found its only
certificates).

Quantities per instance (definitions as milestone 5 and 5b; e = s_T - s_t, Dt(d) = s_t(d) - s_t(d^)):
  r regret of the cheap choice on the reference tier; osc, L (largest neighbour slope of e), K* (star constant
  around d^); C1 margin_t > osc; C2 cone with oracle L; R(K) = max(0, max_{d != d^} K |d - d^| - Dt(d)), so
  R(K) = 0 certifies; K3 = star constant from d^ and its grid neighbours (three reference runs).
New here (fabric transfer): a design study over a fabric set pays for the reference tier on some fabrics and
wants to skip it on the rest. K_loo(f) = max over the other eight fabrics (same tier pair and setting) of their
K*. If K_loo(f) >= K*(f), R(K_loo(f)) >= r(f) (P1 of 5b) and R(K_loo) = 0 certifies fabric f's choice with
no reference run on f at all. Whether K_loo bounds K* is an empirical claim (G6 tests it).
Loops: SV(kappa = 1) and local-3 as in 5b, with the 5-width grid.

Data rule. The registered scoring uses 4e's registered scores (results.json, nine T3 cases stopped at the
600-step cap included as they are). A sensitivity pass replaces those nine with 4e's post hoc 2,000-step
reruns (run_log_extend.txt; six converged, three still capped); G9 scores it.

Predictions. Written before this script was first run, but after 4e's per-case table (section 1 of its
results.txt) was public and the K and margin of one case (F1 at c, T1 -> T3) were worked by hand while
planning (L about 0.48 cm/cm against Dt(0) = 0.466 cm, so C2 fails there by 0.01). None of G2 to G9 is blind;
G1 is a set of theorems (a failure is a code bug).
  G1 theorems: r <= pair <= osc, r <= R(K*) <= R(L), K* <= L, r <= (osc - margin_t)+ in all 45.
  G2 C1 certifies none of the 36 tier instances (the chain's error swings by about 0.9 cm across widths,
     twice its margin; the sheet's margins are 0.008 to 0.14 cm) and at most 2 of the 9 calibration pairs.
  G3 C2 with oracle L certifies at least 1 of the 18 T1 -> T3 instances, the first 2D -> 3D certificate in the
     programme (milestone 5 found none on 28), and C2 certifies at least as many instances as C1 in every family.
  G4 R(K3) = 0 (certified from three top-tier runs) on at least 1 of 18 T1 -> T3, and on fewer T2 -> T3
     instances than T1 -> T3 (the sheet's own curve is flat, so its penalty term is small).
  G5 coverage: R(K3) >= r in all 45 instances.
  G6 fabric transfer: K_loo(f) >= K*(f) on at least 16 of 18 per tier family (T1 -> T3, T2 -> T3), and
     R(K_loo) >= r in all 36 tier instances.
  G7 R(K_loo) = 0 on at least 1 of 18 T1 -> T3 (a fabric whose choice is certified with no top-tier run on it).
  G8 SV(1): zero regret in all 45 instances; mean top-tier runs at most 3.5 of 5 on T1 -> T3.
  G9 with the extended T3 scores, every count in G2 to G8 moves by at most 1.
"""
import importlib.util
import json
import re
import statistics
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
M4E = EXP / "m4e_hanger_tier"


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


m5 = _load("m5", EXP / "m5_margin_bound" / "run.py")
m5b = _load("m5b", EXP / "m5b_penalty_bound" / "run.py")

OFFSETS = (-1.0, 0.0, 1.0, 2.0, 3.0)
FABRICS = tuple(f"F{i}" for i in range(1, 10))
EPS = 1e-12


def scores(extended=False):
    """{(fabric, cal, tier): {offset: err}} from 4e; extended=True swaps in the 2,000-step reruns."""
    cases = json.loads((M4E / "results.json").read_text())["cases"]
    S = {}
    for c in cases.values():
        for tier in ("t1", "t2", "t3"):
            S.setdefault((c["code"], c["cal"], tier), {})[float(c["o"])] = c[tier]["err"]
    if extended:
        pat = re.compile(r"^(F\d) o([+-]\d) (\w): T1 \S+ T2 \S+ T3 (\S+) \(rel (\S+), (\d+) steps\)")
        for line in (M4E / "run_log_extend.txt").read_text().splitlines():
            m = pat.match(line)
            if m:
                S[(m[1], m[3], "t3")][float(m[2])] = float(m[4])
    return S


def instances(S):
    """[(family, label, cheap, reference)]."""
    out = []
    for cal in ("u", "c"):
        for f in FABRICS:
            out.append(("T1->T3", f"{f}_{cal}", S[(f, cal, "t1")], S[(f, cal, "t3")]))
            out.append(("T2->T3", f"{f}_{cal}", S[(f, cal, "t2")], S[(f, cal, "t3")]))
    for f in FABRICS:
        out.append(("T3u->T3c", f, S[(f, "u", "t3")], S[(f, "c", "t3")]))
    return out


def analyse(S):
    Q = []
    for fam, lab, t, T in instances(S):
        q = m5b.quantities(t, T)
        q.update(fam=fam, lab=lab, t=t, T=T, R_pos=max(0.0, q["osc"] - q["margin_t"]))
        Q.append(q)
    # fabric transfer: K_loo from the other eight fabrics of the same family and setting
    for q in Q:
        group = lambda x: (x["fam"], x["lab"].split("_")[-1] if "_" in x["lab"] else "")
        others = [x["Kstar"] for x in Q if group(x) == group(q) and x is not q]
        q["K_loo"] = max(others)
        q["R_loo"] = m5b.penalty_bound(q["t"], q["choice"], q["K_loo"])
    return Q


def counts(Q):
    fams = ("T1->T3", "T2->T3", "T3u->T3c")
    G = {f: [q for q in Q if q["fam"] == f] for f in fams}
    n = lambda f, k: sum(1 for q in G[f] if k(q))
    tiers = G["T1->T3"] + G["T2->T3"]
    return dict(
        theorems=all(q["regret"] <= q["pair"] + EPS and q["pair"] <= q["osc"] + EPS and q["regret"] <= q["R_Ks"] + EPS
                     and q["R_Ks"] <= q["R_L"] + EPS and q["Kstar"] <= q["L"] + EPS and q["regret"] <= q["R_pos"] + EPS
                     for q in Q),
        c1={f: n(f, lambda q: q["c1"]) for f in fams},
        c2={f: n(f, lambda q: q["c2"]) for f in fams},
        rk3_zero={f: n(f, lambda q: q["R_K3"] <= EPS) for f in fams},
        rk3_cov=sum(q["R_K3"] >= q["regret"] - EPS for q in Q),
        kloo_ge={f: n(f, lambda q: q["K_loo"] >= q["Kstar"] - EPS) for f in fams},
        rloo_cov=sum(q["R_loo"] >= q["regret"] - EPS for q in tiers),
        rloo_zero={f: n(f, lambda q: q["R_loo"] <= EPS) for f in fams},
        sv_zero=sum(q["sv1_r"] <= EPS for q in Q),
        sv_runs={f: statistics.mean(q["sv1_n"] for q in G[f]) for f in fams},
        loc_zero=sum(q["loc_r"] <= EPS for q in Q),
        regret_pos=[(q["fam"], q["lab"], q["regret"]) for q in Q if q["regret"] > EPS],
    )


def flat(c):
    """Counts as one flat {name: number} for the G9 comparison."""
    out = {}
    for k, v in c.items():
        if isinstance(v, dict):
            out.update({f"{k}[{f}]": x for f, x in v.items() if not isinstance(x, float)})
        elif isinstance(v, int) and not isinstance(v, bool):
            out[k] = v
    return out


def table(Q):
    cols = ("regret", "pair", "osc", "margin_t", "L", "Kstar", "K3", "K_loo", "R_Ks", "R_K3", "R_loo")
    rows = ["family label d^ d* " + " ".join(cols) + " C1 C2 sv1_r sv1_n loc_r"]
    for q in Q:
        rows.append(" ".join([q["fam"], q["lab"], f"{q['choice']:+.0f}", f"{q['best']:+.0f}"]
                             + [f"{q[k]:.4f}" for k in cols]
                             + ["Y" if q["c1"] else "-", "Y" if q["c2"] else "-",
                                f"{q['sv1_r']:.4f}", str(q["sv1_n"]), f"{q['loc_r']:.4f}"]))
    return rows


def main():
    S, Sx = scores(), scores(extended=True)
    Q, Qx = analyse(S), analyse(Sx)
    c, cx = counts(Q), counts(Qx)
    hv = lambda ok: "held" if ok else "refuted"
    T13, T23, CAL = "T1->T3", "T2->T3", "T3u->T3c"
    fx, fxx = flat(c), flat(cx)
    moves = {k: fxx[k] - fx[k] for k in fx if k in fxx}
    out = ["hanger-codesign milestone 5c. Decision certificates on milestone 4e's tiers (cm RMS shape error, whole sheet;",
           "offsets -1..+3 cm, nine Petrak et al. 2021 wovens, u = FAST bending, c = 0.485 x FAST).",
           "R_X = max(0, max_d X |d - d^| - Dt(d)); R = 0 certifies. K3 from d^ and its neighbours (3 top-tier runs);",
           "K_loo = max K* over the other eight fabrics of the same family and setting (no top-tier run on this fabric).",
           "", "1. per instance, registered scores"] + table(Q)
    out += ["", "2. per instance, extended T3 scores (sensitivity, G9)"] + table(Qx)
    out += ["", "3. counts (registered | extended)"]
    for k in fx:
        out.append(f"{k} {fx[k]} | {fxx.get(k)}")
    for f in (T13, T23, CAL):
        out.append(f"mean SV(1) runs [{f}] {c['sv_runs'][f]:.2f} | {cx['sv_runs'][f]:.2f}")
    out.append("instances with regret > 0: " + "; ".join(f"{a} {b} {r:.4f}" for a, b, r in c["regret_pos"]))
    out += ["", "4. predictions",
            f"G1 theorems in all 45: {hv(c['theorems'] and cx['theorems'])}",
            f"G2 C1 certifies none of 36 tier instances and <= 2 of 9 calibration pairs: "
            f"{hv(c['c1'][T13] + c['c1'][T23] == 0 and c['c1'][CAL] <= 2)}",
            f"G3 C2 certifies >= 1 of 18 T1->T3, and C2 >= C1 in every family: "
            f"{hv(c['c2'][T13] >= 1 and all(c['c2'][f] >= c['c1'][f] for f in (T13, T23, CAL)))}",
            f"G4 R(K3) = 0 on >= 1 of 18 T1->T3 and on fewer T2->T3: "
            f"{hv(c['rk3_zero'][T13] >= 1 and c['rk3_zero'][T23] < c['rk3_zero'][T13])}",
            f"G5 R(K3) >= r in all 45: {hv(c['rk3_cov'] == 45)}",
            f"G6 K_loo >= K* on >= 16 of 18 in both tier families, R(K_loo) >= r in all 36: "
            f"{hv(c['kloo_ge'][T13] >= 16 and c['kloo_ge'][T23] >= 16 and c['rloo_cov'] == 36)}",
            f"G7 R(K_loo) = 0 on >= 1 of 18 T1->T3: {hv(c['rloo_zero'][T13] >= 1)}",
            f"G8 SV(1) zero regret in all 45, mean runs <= 3.5 on T1->T3: "
            f"{hv(c['sv_zero'] == 45 and c['sv_runs'][T13] <= 3.5)}",
            f"G9 every count moves by at most 1 with extended scores: {hv(all(abs(v) <= 1 for v in moves.values()))}"
            + (" (moved: " + ", ".join(f"{k} {v:+d}" for k, v in moves.items() if v) + ")" if any(moves.values()) else "")]
    if not (c["theorems"] and cx["theorems"]):
        raise SystemExit("a theorem failed: code bug")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out[out.index("3. counts (registered | extended)"):]))


if __name__ == "__main__":
    main()
