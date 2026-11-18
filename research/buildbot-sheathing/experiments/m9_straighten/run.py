"""Milestone 9: push the bowed joint stud onto its line instead of doubling it.

    python experiments/m9_straighten/run.py > experiments/m9_straighten/results.txt

Writes results.json beside this file. Reads ../m6b_bowed_edge/results.json (the smooth-bow seats)
for section D's second rock model. About a minute on one CPU (MuJoCo for section C).
Hypotheses H41-H44 were registered in LOG.md before this script was run.
"""
import itertools
import json
import os
import platform
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
from buildbot_sheathing import asbuilt as A  # noqa: E402
from buildbot_sheathing import cost as K  # noqa: E402
from buildbot_sheathing import cycle as C  # noqa: E402
from buildbot_sheathing import straighten as S  # noqa: E402
from buildbot_sheathing.budget import HEIGHT, IN, Z_JOINT  # noqa: E402

T0 = time.time()
U = Z_JOINT / HEIGHT
ENDS = ("pinned", "fixed")
POL = ("mid", "nails", "three")
TOL = 0.5e-3
N_STUD, SEED_STUD = 200000, 5
out = {"versions": {"python": platform.python_version(), "numpy": np.__version__},
       "constants": {"I_flat_m4": S.I_FLAT, "L_m": A.STUD_LEN, "E_psi": S.E_STUD_PSI, "cov_E": S.COV_E,
                     "tol_m": TOL, "EI_over_L3_at_1.2e6psi_N_per_m": 1.2e6 * S.PSI * S.I_FLAT / A.STUD_LEN ** 3}}
print("# Milestone 9: straighten the bowed joint stud instead of doubling it (buildbot-sheathing)")
print(f"stud: 2x4 flatwise, I = {S.I_FLAT / IN ** 4:.3f} in^4, clear span {A.STUD_LEN / IN:.3f} in; "
      f"E (Stud grade, psi) {S.E_STUD_PSI}, lognormal, COV {S.COV_E}")
print(f"E I / L^3 at 1.2e6 psi = {out['constants']['EI_over_L3_at_1.2e6psi_N_per_m']:.1f} N/m; "
      f"nail-by-nail tolerance {TOL * 1e3:.2f} mm\n")

# ------------------------------------------------------------------ A. closed form against FE
print("## A. Mid push: finite-element beam (cubic Hermite, 192 elements) against the closed form")
print("ends    c_FE      c_closed   max residual/b FE   closed     at u (FE)")
out["A"] = {}
h41 = True
for e in ENDS:
    c, final, x = S.mid_push_fe(e)
    cc = S.mid_coeff(e)
    rmax_c = float(np.abs(S.residual(x, e)).max())
    rmax = float(np.abs(final).max())
    at = float(x[np.argmax(np.abs(final))])
    ok = abs(c / cc - 1) < 0.01 and abs(rmax - rmax_c) < 0.01
    h41 &= ok
    out["A"][e] = {"c_fe": c, "c_closed": cc, "rmax_fe": rmax, "rmax_closed": rmax_c, "at_u": at}
    print(f"{e:7s} {c:8.3f}  {cc:8.1f}   {rmax:.5f}            {rmax_c:.5f}    {at:.4f}")
for e in ENDS:
    f3, fin3, x3 = S.simultaneous([1 / 6, 0.5, 5 / 6], e)
    out["A"][e]["three_c"] = f3.tolist()
    out["A"][e]["three_rmax"] = float(np.abs(fin3).max())
    print(f"three-point simultaneous push (u = 1/6, 1/2, 5/6), {e}: forces {np.round(f3, 2).tolist()} "
          f"x E I b / L^3, max residual {np.abs(fin3).max():.5f} b")
print(f"H41: FE within 1% of the closed form on force and residual, both end conditions -> "
      f"{'held' if h41 else 'refuted'}\n")
out["H41"] = h41

# ------------------------------------------------------------------ B. forces
rng = np.random.default_rng(SEED_STUD)
E = S.e_draw(rng, N_STUD)
WARPS = {"low": 0.11 * IN, "high": 0.21 * IN}
bows = {w: A.to_wall_bow(A.draw_magnitude(rng, (N_STUD,), m, A.BOW_LIMIT)) for w, m in WARPS.items()}
ST = {(p, e): S.Straightener(p, U, e, TOL) for p, e in itertools.product(POL, ENDS)}
print(f"## B. Push force (N) over {N_STUD:,} studs a warp (species uniform over four, seed {SEED_STUD})")
print("warp policy ends   | median    p95    p99     max | wall bow median, p99 (mm)")
out["B"] = []
for w in WARPS:
    b = bows[w]
    for p, e in itertools.product(POL, ENDS):
        f = ST[(p, e)].force(b, E)
        qs = np.percentile(f, [50, 95, 99])
        row = {"warp": w, "policy": p, "ends": e, "median": qs[0], "p95": qs[1], "p99": qs[2], "max": float(f.max())}
        out["B"].append(row)
        print(f"{w:4s} {p:6s} {e:6s} | {qs[0]:6.0f} {qs[1]:6.0f} {qs[2]:6.0f} {f.max():7.0f} | "
              f"{np.median(np.abs(b)) * 1e3:.2f}, {np.percentile(np.abs(b), 99) * 1e3:.2f}")
b_lim = A.to_wall_bow(A.BOW_LIMIT)
s2 = np.log(1 + S.COV_E ** 2)
e95 = S.E_STUD_PSI["DF-L"] * S.PSI * np.exp(-s2 / 2 + 1.6449 * np.sqrt(s2))
f_lim = {(p, e): float(ST[(p, e)].force(b_lim, e95)) for p, e in itertools.product(POL, ENDS)}
print(f"\ngrade-limit stud (3/4 in over 8 ft = {b_lim * 1e3:.2f} mm at the wall), DF-L 95th-percentile E "
      f"({e95 / S.PSI / 1e6:.2f} million psi): " + "; ".join(f"{p}/{e} {v:.0f} N" for (p, e), v in f_lim.items()))
low_mid = next(r for r in out["B"] if r["warp"] == "low" and r["policy"] == "mid" and r["ends"] == "pinned")
med_b = float(np.median(np.abs(bows["low"])))
e_ref = 1.25e6 * S.PSI
ratio_med = float(ST[("nails", "pinned")].force(med_b, e_ref) / ST[("mid", "pinned")].force(med_b, e_ref))
ratio_all = ST[("nails", "pinned")].force(bows["low"], E) / ST[("mid", "pinned")].force(bows["low"], E)
h42 = low_mid["p99"] < 200 and f_lim[("mid", "pinned")] < 400 and ratio_med <= 2
print(f"nail-by-nail / mid force, pinned, at the median low-warp bow ({med_b * 1e3:.2f} mm): {ratio_med:.2f}; "
      f"over all low-warp studs: median {np.median(ratio_all):.2f}, p95 {np.percentile(ratio_all, 95):.2f}, "
      f"max {ratio_all.max():.1f}")
print(f"H42: low-warp mid push p99 {low_mid['p99']:.0f} N (bar 200), grade-limit DF-L p95 {f_lim[('mid', 'pinned')]:.0f} N "
      f"(bar 400), nails/mid at the median stud {ratio_med:.2f} (bar 2) -> {'held' if h42 else 'refuted'}")
tol_rows = []
for tol in (0.25e-3, 1.0e-3):
    st = S.Straightener("nails", U, "pinned", tol)
    f = st.force(bows["low"], E)
    tol_rows.append({"tol_mm": tol * 1e3, "p99": float(np.percentile(f, 99)), "max": float(f.max())})
    print(f"  tolerance {tol * 1e3:.2f} mm, nails pinned, low warp: p99 {np.percentile(f, 99):.0f} N, max {f.max():.0f} N")
out["B_extra"] = {"grade_limit": {f"{p}/{e}": v for (p, e), v in f_lim.items()}, "e95_dfl_pa": e95,
                  "ratio_median_stud": ratio_med, "ratio_q": np.percentile(ratio_all, [50, 95]).tolist(),
                  "tol": tol_rows}
out["H42"] = h42
print()

# ------------------------------------------------------------------ C. what a humanoid can push sideways
print("## C. Largest push along the wall (N), both hands, feet planted (milestone 3b's static whole-body model)")
print("robot foot_mu x_m | z 1.0    1.1    1.2    1.3 | share of studs a mid push (pinned) needs <= the 1.2-1.3 m capacity (low, high)")
out["C"] = []
try:
    from buildbot_sheathing import humanoid as H
    for name in ("g1", "h1"):
        rob, d0 = H.robot(name)
        for mf, x in itertools.product((0.3, 0.6), (0.3, 0.4)):
            caps = [H.max_side_push(rob, d0, (x, z), mu_foot=mf) for z in (1.0, 1.1, 1.2, 1.3)]
            cap = min(c[0] or 0.0 for c in caps[2:])
            share = [float(np.mean(ST[("mid", "pinned")].force(bows[w], E) <= cap)) for w in WARPS]
            out["C"].append({"robot": name, "mu_foot": mf, "x": x, "caps": [c[0] for c in caps],
                             "why": [c[1] for c in caps], "share_low": share[0], "share_high": share[1]})
            cs = " ".join(f"{(c[0] or 0):5.0f}" for c in caps)
            print(f"{name:5s} {mf:4.1f}   {x:.1f}  | {cs} | {share[0]:.4f}, {share[1]:.4f}  "
                  f"(limits: {', '.join(sorted(set(c[1] for c in caps)))})")
except Exception as exc:  # the models need MuJoCo and a Menagerie clone
    print(f"skipped: {exc!r}")
print()

# ------------------------------------------------------------------ D. clean sheets
m6b = json.load(open(os.path.join(HERE, "..", "m6b_bowed_edge", "results.json")))
ROCKS = {"three-foot": None, "smooth (Drake)": np.radians(np.array(m6b["F_draws"]["drake_deg"]))}
print("## D. First-pass clean sheets [95% Wilson] and missed nails a sheet; ledger, s_x 1 mm, recoil none, "
      "20,000 sheets, seed 7")
print("rock            warp  pipeline                  clean   [95%]            missed")
CELLS = [("2x, three, no push", dict(framing="2x", policy="three"), None)]
for p, e in itertools.product(POL, ENDS):
    CELLS.append((f"2x, three, {p} {e}", dict(framing="2x", policy="three"), (p, e)))
CELLS += [("2x2x, single", dict(framing="2x2x", policy="single"), None),
          ("2x2x, three", dict(framing="2x2x", policy="three"), None)]
out["D"] = []
for (rname, rd), w in itertools.product(ROCKS.items(), ("low", "high")):
    for label, kw, sp in CELLS:
        st = ST[sp] if sp else None
        r = C.clean_cell(warp=w, rock_draw=rd, straighten=st, **kw)
        lo, hi = C.wilson(r["clean"], 20000)
        out["D"].append({"rock": rname, "warp": w, "pipeline": label, **r})
        print(f"{rname:15s} {w:5s} {label:25s} {r['clean']:.4f} [{lo:.3f},{hi:.3f}]  {r['missed']:.2f}")
    r = C.clean_cell(warp="straight", rock_draw=rd, framing="2x", policy="three")
    out["D"].append({"rock": rname, "warp": "straight", "pipeline": "2x, three, straight studs", **r})
    print(f"{rname:15s} {'(straight studs, the ceiling)':31s}     {r['clean']:.4f}             {r['missed']:.2f}")


def cell(rock, warp, label):
    return next(d for d in out["D"] if d["rock"] == rock and d["warp"] == warp and d["pipeline"] == label)


nl = [cell("three-foot", w, "2x, three, nails pinned")["clean"] for w in ("low", "high")]
dbl = [cell("three-foot", w, "2x2x, single")["clean"] for w in ("low", "high")]
mid_low = cell("three-foot", "low", "2x, three, mid pinned")["clean"]
h43 = min(nl) >= 0.95 and all(d - n <= 0.03 for n, d in zip(nl, dbl)) and mid_low >= 0.95
print(f"H43: nail-by-nail (pinned) clean {nl[0]:.4f} low, {nl[1]:.4f} high (bar 0.95; doubled {dbl[0]:.4f}, "
      f"{dbl[1]:.4f}, within 3 points); mid push low {mid_low:.4f} (bar 0.95) -> {'held' if h43 else 'refuted'}")
out["H43"] = h43
print()

# ------------------------------------------------------------------ E. dollars
N, SEED = 4000, 11
pp = K.draw(N, SEED)
t_push = np.random.default_rng(23).uniform(10.0, 40.0, N)
reads3 = {"n": C.reads_per_sheet("three"), "ledger": True}
reads1 = {"n": C.reads_per_sheet("single"), "ledger": True}
print(f"## E. Dollars per clean sheet, G1 on a drive-and-lift base (milestone 7's {N} draws, seed {SEED}); "
      "straightening adds U(10, 40) s a sheet (unsourced; seed 23)")
print("rock            warp  volume | 2x2x single   2x three   2x three+nails   2x three+mid | share push < 2x2x, push < no push")
out["E"] = []
for (rname, _), w, v in itertools.product(ROCKS.items(), ("low", "high"), (100, 300)):
    m_dbl = cell(rname, w, "2x2x, single")["missed"]
    m_no = cell(rname, w, "2x, three, no push")["missed"]
    m_nl = cell(rname, w, "2x, three, nails pinned")["missed"]
    m_mid = cell(rname, w, "2x, three, mid pinned")["missed"]
    c_dbl = K.robot_cost("base", pp, v, m_dbl, reads1, True)["total"]
    c_no = K.robot_cost("base", pp, v, m_no, reads3, False)["total"]
    c_nl = K.robot_cost("base", pp, v, m_nl, {**reads3, "extra": t_push}, False)["total"]
    c_mid = K.robot_cost("base", pp, v, m_mid, {**reads3, "extra": t_push}, False)["total"]
    s_dbl, s_no = float(np.mean(c_nl < c_dbl)), float(np.mean(c_nl < c_no))
    out["E"].append({"rock": rname, "warp": w, "volume": v, "median": {
        "2x2x": float(np.median(c_dbl)), "2x": float(np.median(c_no)), "nails": float(np.median(c_nl)),
        "mid": float(np.median(c_mid))}, "share_nails_lt_2x2x": s_dbl, "share_nails_lt_2x": s_no})
    print(f"{rname:15s} {w:5s} {v:6d} | {np.median(c_dbl):10.2f} {np.median(c_no):10.2f} "
          f"{np.median(c_nl):14.2f} {np.median(c_mid):14.2f} | {s_dbl:.3f}, {s_no:.3f}")
h44_share = next(r for r in out["E"] if r["rock"] == "three-foot" and r["warp"] == "low" and r["volume"] == 100)
h44 = h44_share["share_nails_lt_2x2x"] >= 0.90
print(f"H44: base, 100 houses a year, low warp: single 2x + nail-by-nail cheaper than doubled joints in "
      f"{h44_share['share_nails_lt_2x2x']:.3f} of draws (bar 0.90) -> {'held' if h44 else 'refuted'}")
out["H44"] = h44
# break-even push time: seconds of pushing at which the median draw ties doubled joints
for w in ("low", "high"):
    m_dbl = cell("three-foot", w, "2x2x, single")["missed"]
    m_nl = cell("three-foot", w, "2x, three, nails pinned")["missed"]
    c_dbl = K.robot_cost("base", pp, 100, m_dbl, reads1, True)["total"]
    ts = np.arange(0, 3601, 5.0)
    med = [float(np.median(K.robot_cost("base", pp, 100, m_nl, {**reads3, "extra": t}, False)["total"] - c_dbl))
           for t in ts]
    be = next((float(t) for t, d in zip(ts, med) if d > 0), None)
    out.setdefault("E_breakeven_s", {})[w] = be
    print(f"  {w} warp: the median draw stops favouring the push over doubled joints at {be} s of pushing a "
          "sheet (searched 0-3600 s; below the machine's capacity extra seconds cost only supervision)")
out["wall_s"] = time.time() - T0
print(f"\nwall time {out['wall_s']:.0f} s")
json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, default=float)
