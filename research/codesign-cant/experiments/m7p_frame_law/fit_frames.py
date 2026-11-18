"""Milestone 7p, step 1: a frame-mass law from listed commercial quadrotor frames, in place of the inherited 0.05 + 0.8 L kg.

Data: ../../data/frames/frames_hobbyrc.csv (wheelbase and weight as listed on the retailer's product pages, accessed 2026-11-15,
each row with its verbatim spec line and URL; rows marked `excluded` are kept with the reason and not fitted). Open-propeller
frames only (no ducted whoops or cinelifters). The model's L is the centre-to-rotor arm, so the diagonal wheelbase W = 2 L.

Two laws, because two different questions use them:
  family slope:  mass = a_family + k W, fitted with one intercept per family over families listed in two or more wheelbases.
                 This is what lengthening the arm of one frame design costs (milestone 7o's question: same tune, longer arm).
                 Strict set: GEPRC Mark4 5/6/7 (same 5 mm arm plate) and Foxeer Aura V2 Pro DC 5/6. Wide set: every family
                 whose listed wheelbases span 20 mm or more (adds iFlight AOS V5 3.5/5/7, Mark4 8, GEPRC Pulsar 9/10/11).
  cross-brand:   mass = a + b W over all fitted frames with W <= 350 mm (3-8 inch class; the model's arms of 85-135 mm are
                 W = 170-270 mm), and a log-log power law as a check. This is what a frame designed for that size weighs.
Bootstrap (2,000 resamples of frames, or of families for the family slope) gives 95% intervals. Writes frame_law.json and frame_law.txt.
"""
import csv, json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROWS = [r for r in csv.DictReader(open(os.path.join(HERE, "..", "..", "data", "frames", "frames_hobbyrc.csv"))) if r["use"] == "fit"]
STRICT = {"geprc-mark4": ("Mark4 5", "Mark4 6", "Mark4 7"), "foxeer-aura-v2-pro": None}
RNG = np.random.default_rng(0)
NB = 2000


def wm(rows):
    return np.array([float(r["wheelbase_mm"]) for r in rows]), np.array([float(r["weight_g"]) for r in rows])


def family_slope(groups):
    """Within-family OLS slope (g per mm of wheelbase): demean W and m inside each family, regress pooled."""
    dw, dm = [], []
    for rows in groups:
        w, m = wm(rows); dw.append(w - w.mean()); dm.append(m - m.mean())
    dw, dm = np.concatenate(dw), np.concatenate(dm)
    return float(dw @ dm / (dw @ dw))


def groups_of(rows, strict):
    fam = {}
    for r in rows:
        if strict:
            if r["family"] not in STRICT or (STRICT[r["family"]] and r["model"] not in STRICT[r["family"]]): continue
        fam.setdefault(r["family"], []).append(r)
    # a family counts only if its wheelbases span 20 mm or more: GEPRC MK5 (225-230 mm) and SpeedyBee Mario 5 (226-227 mm) list
    # style variants (X against dead-cat) at one size, whose weight difference is not an arm-length effect
    return [g for g in fam.values() if np.ptp([float(x["wheelbase_mm"]) for x in g]) >= 20]


def ols(w, m):
    b, a = np.polyfit(w, m, 1); return float(a), float(b)


def main():
    out, lines = {}, ["Milestone 7p frame-mass law from listed frames (data/frames/frames_hobbyrc.csv, accessed 2026-11-15).",
                      "W = diagonal wheelbase = 2 L. Inherited law 0.05 + 0.8 L kg = 50 g + 0.40 g per mm of wheelbase.", ""]
    for name, strict in (("family_strict", True), ("family_wide", False)):
        gs = groups_of(ROWS, strict)
        k = family_slope(gs)
        bs = [family_slope([gs[i] for i in RNG.integers(0, len(gs), len(gs))]) if len(gs) > 1 else k for _ in range(NB)]
        bs = [v for v in bs if np.isfinite(v)]
        per = {g[0]["family"]: (family_slope([g]), [f"{x['model']} {x['wheelbase_mm']} mm {x['weight_g']} g" for x in g]) for g in gs}
        out[name] = dict(k_g_per_mm=k, ci95=[float(np.percentile(bs, 2.5)), float(np.percentile(bs, 97.5))], k_kg_per_m_of_L=2 * k,
                         families={f: dict(k_g_per_mm=v[0], frames=v[1]) for f, v in per.items()})
        lines.append(f"{name}: k = {k:.3f} g/mm of wheelbase (95% family bootstrap {out[name]['ci95'][0]:.3f}-{out[name]['ci95'][1]:.3f}),"
                     f" i.e. {2 * k:.3f} kg per m of arm L (inherited 0.800); {len(gs)} families")
        for f, v in per.items():
            lines.append(f"    {f:22s} {v[0]:6.3f} g/mm   " + "; ".join(v[1]))
    sel = [r for r in ROWS if float(r["wheelbase_mm"]) <= 350]
    w, m = wm(sel)
    a, b = ols(w, m)
    bs = []
    for _ in range(NB):
        i = RNG.integers(0, len(w), len(w)); bs.append(ols(w[i], m[i]))
    bs = np.array(bs)
    pred = lambda W: a + b * W
    res = m - pred(w)
    ll = np.polyfit(np.log(w), np.log(m), 1)
    out["cross_brand"] = dict(n=len(sel), a_g=a, b_g_per_mm=b, a_ci95=np.percentile(bs[:, 0], [2.5, 97.5]).tolist(),
                              b_ci95=np.percentile(bs[:, 1], [2.5, 97.5]).tolist(), resid_sd_g=float(res.std(ddof=2)),
                              model_units=dict(frame0_kg=a / 1000, frame_k_kg_per_m=2 * b), loglog_exponent=float(ll[0]),
                              loglog_coef=float(np.exp(ll[1])))
    inh = lambda W: 50 + 0.4 * W
    lines += ["", f"cross_brand (open frames, W <= 350 mm, n = {len(sel)}): mass = {a:.1f} + {b:.3f} W g "
                  f"(95% bootstrap a {np.percentile(bs[:, 0], 2.5):.1f} to {np.percentile(bs[:, 0], 97.5):.1f}, "
                  f"b {np.percentile(bs[:, 1], 2.5):.3f} to {np.percentile(bs[:, 1], 97.5):.3f}); residual SD {res.std(ddof=2):.1f} g",
              f"    in model units: frame = {a / 1000:.4f} + {2 * b:.3f} L kg (inherited 0.0500 + 0.800 L)",
              f"    log-log: mass = {np.exp(ll[1]):.4g} W^{ll[0]:.2f}",
              "    W (mm)  L (m)   listed-fit (g)  inherited (g)"]
    for W in (170, 200, 225, 250, 270):
        lines.append(f"    {W:5d}   {W / 2000:.3f}   {pred(W):8.1f}      {inh(W):8.1f}")
    out["inherited"] = dict(frame0_kg=0.05, frame_k_kg_per_m=0.8)
    lines += ["", f"frames fitted: {len(ROWS)} (of which W <= 350 mm: {len(sel)}); excluded rows are listed in the CSV with the reason."]
    json.dump(out, open(os.path.join(HERE, "frame_law.json"), "w"), indent=1)
    open(os.path.join(HERE, "frame_law.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
