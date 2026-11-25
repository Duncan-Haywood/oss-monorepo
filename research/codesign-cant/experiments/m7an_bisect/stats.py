"""Milestone 7an: score RC0-RC6 from results.json; writes stats.txt and stats.json."""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
DS = R["designs"]; kp = np.array([d["kp"] for d in DS]); N = len(DS)
wide = np.array([d["label"] == "t45 cap wide" for d in DS])
R_HI = R["r_hi"]
L, J = [], {}
say = L.append


def arm(name):
    rs = sorted([r for r in R["runs"] if r["arm"] == name], key=lambda r: r["th"])
    th = np.array([r["th"] for r in rs])
    rc = np.stack([np.array(r["rc"], float) for r in rs], -1)          # (N, E, K): -1 censored (> R_HI), 0 dead at R_LO
    lo = np.stack([np.array(r["lo"], float) for r in rs], -1)           # largest radius flown alive by the bisection
    d15 = np.stack([np.array(r["dead_15"], bool) for r in rs], -1)
    cap = np.stack([np.array(r["cap_dead_3"], bool) for r in rs], -1)
    return th, rc, lo, d15, cap


thq, rcq, loq, d15q, capq = arm("quiet+O")
thf, rcf, lof, d15f, capf = arm("full")
E = rcq.shape[1]
mq = np.maximum(np.abs(np.cos(np.deg2rad(thq))), np.abs(np.sin(np.deg2rad(thq))))   # worst-axis share of the radius
fin = rcq > 0
say(f"Milestone 7an: {N} designs x {E} plants; quiet+O at {len(thq)} angles, full at {len(thf)}; bisection on [{R['r_lo']}, {R_HI}] m, "
    f"{R['halvings']} halvings; wall {R['wall_s']:.0f} s")
for nm, rc in (("quiet+O", rcq), ("full", rcf)):
    say(f"  {nm}: cells {rc.size}, censored (alive at {R_HI} m) {int((rc < 0).sum())}, dead at {R['r_lo']} m {int((rc == 0).sum())}")

# RC0: interpolate r_c to 7am's s = 1 rays and predict its deaths
am = json.load(open(os.path.join(HERE, "..", "m7am_roa_kp", "results.json")))
off = np.array(am["off"])                                                     # (E, 2) at s = 1
ref = np.array(next(r["dead"] for r in am["runs"] if r["arm"] == "quiet+O" and r["s"] == 1.0 and not r["cap"] and r["steps"] is not None), bool)
ang = np.rad2deg(np.arctan2(off[:, 1], off[:, 0])) % 360.0; rad = np.hypot(off[:, 0], off[:, 1])
rcc = np.where(rcq < 0, R_HI, rcq)
pred = np.zeros((N, E), bool)
for e in range(E):
    k = int(ang[e] // 22.5); w = (ang[e] - thq[k]) / 22.5; k2 = (k + 1) % len(thq)
    pred[:, e] = rad[e] > (1 - w) * rcc[:, e, k] + w * rcc[:, e, k2]
agree = float((pred == ref).mean())
say(f"RC0 7am quiet+O s=1: interpolated r_c predicts {agree:.4f} of {ref.size} flights (dead {int(ref.sum())}, predicted {int(pred.sum())}; "
    f"bar >= 0.95) -> {'held' if agree >= 0.95 else 'REFUTED'}")
J["rc0"] = dict(agree=agree, dead=int(ref.sum()), pred=int(pred.sum()))

# RC1: one crossing
c1 = float(d15q[fin].mean())
say(f"RC1 quiet+O: {int(fin.sum())} finite r_c cells, share also dead at 1.5 r_c {c1:.4f} (bar >= 0.99) -> {'held' if c1 >= 0.99 else 'REFUTED'}")
J["rc1"] = dict(n=int(fin.sum()), share=c1, full_share=float(d15f[rcf > 0].mean()))

# RC2: per-axis against vector request, over (design, plant) pairs finite at every angle
allf = fin.all(-1)
vec = kp[:, None, None] * rcq; ax = vec * mq
cv = lambda a: a.std(-1) / a.mean(-1)
cvv, cva = cv(vec)[allf], cv(ax)[allf]
s2 = float((cva < cvv).mean())
say(f"RC2 quiet+O: {int(allf.sum())} (design, plant) pairs finite at all angles; per-axis request has the smaller CV in {s2:.3f} "
    f"(median CV per-axis {np.median(cva):.3f}, vector {np.median(cvv):.3f}; bar >= 0.75) -> {'held' if s2 >= 0.75 else 'REFUTED'}")
J["rc2"] = dict(n=int(allf.sum()), share_axis_smaller=s2, med_cv_axis=float(np.median(cva)), med_cv_vec=float(np.median(cvv)))
# angle profile: median over (design, plant) of r_c(th) / mean over th
prof = np.median((rcq / rcq.mean(-1, keepdims=True))[allf], 0)
say("    median r_c(th) / its mean over angles: " + ", ".join(f"{t:g}: {p:.3f}" for t, p in zip(thq, prof)))
J["rc2"]["profile"] = prof.tolist()

# RC3: floor over direction (alive-side bracket lo; cells dead at R_LO count as 0)
req_lo = kp[:, None, None] * np.where(rcq == 0, 0.0, np.where(rcq < 0, np.inf, loq)) * mq
floor = req_lo.reshape(N, -1).min(1)
ok3 = bool((floor >= 4.0).all())
say(f"RC3 quiet+O: per-design minimum per-axis critical request (alive bracket) min {floor.min():.2f}, median {np.median(floor):.2f} m/s^2; "
    f"designs below 4.0: {int((floor < 4.0).sum())} (bar: none) -> {'held' if ok3 else 'REFUTED'}")
for nm, m in (("kp10", ~wide), ("wide", wide)):
    say(f"    {nm}: floor range {floor[m].min():.2f}-{floor[m].max():.2f} m/s^2")
J["rc3"] = dict(floor=floor.tolist())

# RC4: square symmetry
k4 = (np.arange(len(thq)) + 4) % len(thq)
both = fin & fin[..., k4]
rat = rcq / np.where(rcq[..., k4] > 0, rcq[..., k4], np.nan)
s4 = float((np.abs(rat[both] - 1) < 0.05).mean())
say(f"RC4 quiet+O: share of {int(both.sum())} cells with r_c(th) / r_c(th+90) within 5% {s4:.3f} (median |ratio-1| {np.median(np.abs(rat[both] - 1)):.4f}; "
    f"bar >= 0.90) -> {'held' if s4 >= 0.9 else 'REFUTED'}")
J["rc4"] = dict(n=int(both.sum()), share=s4)

# RC5: full against quiet at shared angles
kq = [int(np.where(thq == t)[0][0]) for t in thf]
qf = rcq[..., kq]; b5 = (qf > 0) & (rcf > 0)
r5 = rcf[b5] / qf[b5]; m5 = float(np.median(r5))
say(f"RC5: {int(b5.sum())} cells finite in both arms; median r_c(full) / r_c(quiet+O) {m5:.3f} (IQR {np.percentile(r5, 25):.3f}-{np.percentile(r5, 75):.3f}; "
    f"bar 0.8-1.0) -> {'held' if 0.8 <= m5 <= 1.0 else 'REFUTED'}")
J["rc5"] = dict(n=int(b5.sum()), median=m5)

# RC6: cap at 3 m
c6 = int(capq.sum()) + int(capf.sum())
say(f"RC6 cap at {R_HI} m: deaths quiet+O {int(capq.sum())} of {capq.size}, full {int(capf.sum())} of {capf.size} (bar: 0) -> {'held' if c6 == 0 else 'REFUTED'}")
J["rc6"] = dict(quiet=int(capq.sum()), full=int(capf.sum()))

# Per design: guaranteed radius over the searched plants and angles, its worst angle and request
say("Per design (quiet+O): label geom seed kp | guaranteed radius min lo (m) at angle | kp * radius | worst angle by median r_c")
rows = []
for n in range(N):
    lo_n = np.where(rcq[n] == 0, 0.0, np.where(rcq[n] < 0, R_HI, loq[n]))
    e, k = np.unravel_index(np.argmin(lo_n), lo_n.shape)
    medk = np.median(np.where(rcq[n] < 0, R_HI, rcq[n]), 0); kw = int(np.argmin(medk))
    rows.append(dict(label=DS[n]["label"], geom=DS[n]["geom"], seed=DS[n]["seed"], kp=float(kp[n]), radius=float(lo_n[e, k]),
                     radius_th=float(thq[k]), worst_med_th=float(thq[kw]), worst_med_rc=float(medk[kw])))
    say(f"  {DS[n]['label']:>13} {DS[n]['geom']:>5} {DS[n]['seed']} kp {kp[n]:5.2f} | {lo_n[e, k]:.3f} m at {thq[k]:g} deg | "
        f"{kp[n] * lo_n[e, k]:.2f} m/s^2 | median worst at {thq[kw]:g} deg ({medk[kw]:.3f} m)")
J["designs"] = rows

open(os.path.join(HERE, "stats.txt"), "w").write("\n".join(L) + "\n")
json.dump(J, open(os.path.join(HERE, "stats.json"), "w"), indent=1)
print("\n".join(L))

# Post hoc (written after RC0-RC6 were scored)
vfl = (kp[:, None, None] * np.where(rcq < 0, np.inf, loq)).reshape(N, -1).min(1)
say(f"Post hoc vector floor: per-design minimum of kp * r_c (alive bracket, any angle) min {vfl.min():.2f}, median {np.median(vfl):.2f} m/s^2; "
    f"kp10 {vfl[~wide].min():.2f}-{vfl[~wide].max():.2f}, wide {vfl[wide].min():.2f}-{vfl[wide].max():.2f}; cap A_P = {R['a_p']} m/s^2")
x_over_y = (np.where(rcq[..., 0] < 0, R_HI, rcq[..., 0]) / np.where(rcq[..., 4] < 0, R_HI, rcq[..., 4]))
say(f"Post hoc axis asymmetry: median r_c(0 deg) / r_c(90 deg) {np.median(x_over_y):.3f} (x censored at {R_HI} m in {int((rcq[..., 0] < 0).sum())} of {N * E}; "
    f"y in {int((rcq[..., 4] < 0).sum())}); r_c(th) = r_c(th + 180) exactly in {float((rcq == rcq[..., (np.arange(16) + 8) % 16]).mean()):.3f} of cells, "
    f"r_c(th) = r_c(-th) in {float((rcq == rcq[..., (-np.arange(16)) % 16]).mean()):.3f}")
ci = np.argwhere(capq); cf = np.argwhere(capf)
desc = lambda arr, th, rc: "; ".join(f"{DS[n]['label']} {DS[n]['geom']} {DS[n]['seed']} plant {e} at {th[k]:g} deg (uncapped r_c {rc[n, e, k]:.3f} m)" for n, e, k in arr)
say(f"Post hoc capped deaths at {R_HI} m: quiet+O: {desc(ci, thq, rcq)}")
say(f"    full: {desc(cf, thf, rcf)}")
J["posthoc"] = dict(vector_floor=vfl.tolist(), x_over_y=float(np.median(x_over_y)))
PC = os.path.join(HERE, "posthoc_couple.json")
if os.path.exists(PC):                       # side force off (couple=False), quiet+O, 0/45/90/135 deg (posthoc_couple.py)
    C = {r["th"]: np.array(r["rc"], float) for r in json.load(open(PC))["runs"]}
    for a, b in ((0.0, 90.0), (45.0, 135.0)):
        f = (C[a] > 0) & (C[b] > 0)
        w = float((np.abs(C[a][f] / C[b][f] - 1) < 0.05).mean()) if f.any() else float("nan")
        kq_a, kq_b = int(np.where(thq == a)[0][0]), int(np.where(thq == b)[0][0])
        fq = (rcq[..., kq_a] > 0) & (rcq[..., kq_b] > 0)
        wq = float((np.abs(rcq[..., kq_a][fq] / rcq[..., kq_b][fq] - 1) < 0.05).mean())
        say(f"Post hoc side force off: r_c({a:g}) and r_c({b:g}) within 5% in {w:.3f} of {int(f.sum())} cells (side force on: {wq:.3f} of {int(fq.sum())}); "
            f"censored {int((C[a] < 0).sum())} and {int((C[b] < 0).sum())} (on: {int((rcq[..., kq_a] < 0).sum())} and {int((rcq[..., kq_b] < 0).sum())})")
        J["posthoc"][f"nocouple_{a:g}_{b:g}"] = dict(share=w, n=int(f.sum()), share_on=wq)
    say(f"    side force off, median r_c over flights finite at 45 deg: {np.median(C[45.0][C[45.0] > 0]):.3f} m (on: {np.median(rcq[..., 2][rcq[..., 2] > 0]):.3f} m)")
open(os.path.join(HERE, "stats.txt"), "w").write("\n".join(L) + "\n")
json.dump(J, open(os.path.join(HERE, "stats.json"), "w"), indent=1)
print("\n".join(L[-4:]))
