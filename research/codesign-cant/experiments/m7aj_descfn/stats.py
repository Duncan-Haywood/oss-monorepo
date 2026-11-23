"""Milestone 7aj: score predictions DJ0-DJ8 (../../LOG.md) from results.json. Writes stats.txt and stats.json."""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
SETS = ("bolted", "1.25x", "0.8x", "retrained")
AX = ("roll", "pitch")
DEAD_TILT = np.deg2rad(60.0)
CAPS = (20, 30, 45, 59)

sets = np.array([c["set"] for c in R["conds"]])
P = {k: np.stack([np.stack([np.array(p[a][k], float) for a in AX], -1) for p in R["pred"]], 0) for k in R["pred"][0]["roll"]}   # (40, 64, 2)
for k in ("N", "f", "r", "a_th", "a_tau", "rho_below"):
    P[k] = np.where(P[k] < 0, np.nan, P[k])
meas = {int(c): {k: np.array(v, float) for k, v in m.items()} for c, m in R["meas"].items()}          # amp, f: (40, 64, 2); dead (40, 64)
stored = {int(k.split("_")[0]): np.array(v, int) for k, v in R["stored_dead"].items() if k.endswith("_18")}
unst = P["rho1"] >= 1.0
lc = P["lc"].astype(int)


def crit(kind):
    """Per (cond, flight, axis) critical tilt limit (rad) under C-tilt or C-torque; inf if linearly stable, 0 if no oscillatory LC."""
    per = DEAD_TILT / P["a_th"] if kind == "tilt" else 1.0 / P["a_tau"]
    return np.where(lc == 0, np.inf, np.where(lc == 1, per, 0.0))


L, J = [], {}
med = lambda a: float(np.nanmedian(a)) if np.isfinite(a).any() else float("nan")

# DJ0
rho_w = P["rho1"].max(-1)
d_rho = float(np.max(np.abs(rho_w - np.array(R["stored_rho_ep"], float))))
mm = {c: int((meas[c]["dead"] != stored[c]).sum()) for c in (20, 30)}
J["DJ0"] = dict(max_rho_diff=d_rho, death_mismatch=mm, held=d_rho <= 1e-12 and all(v == 0 for v in mm.values()))
L.append(f"DJ0 check: max |rho(nsat=1) - stored rho_ep| = {d_rho:.1e}; per-flight death mismatches vs 12g at 20/30 deg, 18 s: {mm} -> {'held' if J['DJ0']['held'] else 'REFUTED'}")

L.append("")
L.append("Per set (pairs = flight x axis, 64 x 2 per design): linear-unstable pairs; limit-cycle kinds among them (1 oscillatory, 2 real crossing, 3 none);")
L.append("N*, r* = A*/delta, f* (Hz), a_th/delta, a_tau/delta (share of tau_max per rad of limit): medians over oscillatory pairs.")
for s in SETS:
    m = (sets == s)[:, None, None] & unst
    k1 = m & (lc == 1)
    L.append(f"  [{s}] unstable {int(m.sum())} of {int(((sets == s).sum()) * 128)}; lc1 {int(k1.sum())}, lc2 {int((m & (lc == 2)).sum())}, lc3 {int((m & (lc == 3)).sum())}; "
             f"N* {med(np.where(k1, P['N'], np.nan)):.3f}; r* {med(np.where(k1, P['r'], np.nan)):.2f}; f* {med(np.where(k1, P['f'], np.nan)):.2f} Hz; "
             f"a_th/delta {med(np.where(k1, P['a_th'], np.nan)):.2f}; a_tau/delta {med(np.where(k1, P['a_tau'], np.nan)):.2f}; "
             f"rho just below N* max {np.nanmax(np.where(k1, P['rho_below'], np.nan)) if k1.any() else float('nan'):.6f}")
L.append("")

# DJ1
m = (sets == "1.25x")[:, None, None] & unst
sh = float((lc[m] == 1).mean())
J["DJ1"] = dict(pairs=int(m.sum()), share_oscillatory_lc=sh, held=sh >= 0.95)
L.append(f"DJ1 existence (1.25x, unstable pairs {int(m.sum())}): stable oscillatory LC on {sh:.3f} -> {'held' if J['DJ1']['held'] else 'REFUTED'}")

# DJ2, DJ3
alive20 = (meas[20]["dead"] == 0)[:, :, None]
sel = (sets == "1.25x")[:, None, None] & unst & (lc == 1) & alive20 & np.isfinite(meas[20]["amp"])
fe = np.abs(P["f"][sel] - meas[20]["f"][sel]) / meas[20]["f"][sel]
J["DJ2"] = dict(pairs=int(sel.sum()), median_rel_err=float(np.median(fe)), median_f_pred=float(np.median(P["f"][sel])),
                median_f_meas=float(np.median(meas[20]["f"][sel])), share_within_25pct=float((fe <= 0.25).mean()))
J["DJ2"]["held"] = J["DJ2"]["median_rel_err"] <= 0.25
L.append(f"DJ2 frequency (1.25x alive at 20 deg, unstable axes, {int(sel.sum())} pairs): f* median {J['DJ2']['median_f_pred']:.2f} Hz, measured {J['DJ2']['median_f_meas']:.2f} Hz; "
         f"median |rel err| {J['DJ2']['median_rel_err']:.3f}, within 25% {J['DJ2']['share_within_25pct']:.2f} -> {'held' if J['DJ2']['held'] else 'REFUTED'}")
d20 = np.deg2rad(20.0)
ratio = (P["a_th"][sel] * d20) / meas[20]["amp"][sel]
w15 = float(((ratio >= 1 / 1.5) & (ratio <= 1.5)).mean())
J["DJ3"] = dict(median_ratio=float(np.median(ratio)), q25=float(np.quantile(ratio, 0.25)), q75=float(np.quantile(ratio, 0.75)), share_within_1p5=w15,
                median_pred_deg=float(np.rad2deg(np.median(P["a_th"][sel] * d20))), median_meas_deg=float(np.rad2deg(np.median(meas[20]["amp"][sel]))))
J["DJ3"]["held"] = (1 / 1.5 <= J["DJ3"]["median_ratio"] <= 1.5) and w15 >= 0.6
L.append(f"DJ3 amplitude (same pairs): predicted tilt amplitude median {J['DJ3']['median_pred_deg']:.1f} deg, measured {J['DJ3']['median_meas_deg']:.1f} deg; "
         f"ratio median {J['DJ3']['median_ratio']:.2f} (IQR {J['DJ3']['q25']:.2f}-{J['DJ3']['q75']:.2f}), within x1.5 {w15:.2f} -> {'held' if J['DJ3']['held'] else 'REFUTED'}")

# DJ4
both = (sets == "1.25x")[:, None, None] & unst & ((meas[20]["dead"] == 0) & (meas[30]["dead"] == 0))[:, :, None] & np.isfinite(meas[20]["amp"]) & np.isfinite(meas[30]["amp"])
sc = meas[30]["amp"][both] / meas[20]["amp"][both]
J["DJ4"] = dict(pairs=int(both.sum()), median_ratio=float(np.median(sc)), q25=float(np.quantile(sc, 0.25)), q75=float(np.quantile(sc, 0.75)))
J["DJ4"]["held"] = 1.2 <= J["DJ4"]["median_ratio"] <= 1.8
L.append(f"DJ4 scaling (1.25x alive at 20 and 30 deg, unstable axes, {int(both.sum())} pairs): amplitude ratio 30/20 median {J['DJ4']['median_ratio']:.2f} "
         f"(IQR {J['DJ4']['q25']:.2f}-{J['DJ4']['q75']:.2f}; DF 1.50) -> {'held' if J['DJ4']['held'] else 'REFUTED'}")

# DJ5
st08 = bool((~unst[sets == "0.8x"]).all())
a08 = med(np.where((sets == "0.8x")[:, None, None], meas[20]["amp"], np.nan))
a125 = med(np.where((sets == "1.25x")[:, None, None], meas[20]["amp"], np.nan))
J["DJ5"] = dict(all_stable=st08, median_amp_08_deg=float(np.rad2deg(a08)), median_amp_125_deg=float(np.rad2deg(a125)), held=st08 and a08 <= 0.5 * a125)
L.append(f"DJ5 control: 0.8x linearly stable on every pair: {st08}; median measured tilt amplitude at 20 deg {np.rad2deg(a08):.2f} deg against 1.25x {np.rad2deg(a125):.2f} deg "
         f"-> {'held' if J['DJ5']['held'] else 'REFUTED'}")
L.append("")

# DJ6-DJ8
fl = {k: np.min(crit(k), -1) for k in ("tilt", "torque")}          # per (cond, flight) critical limit, rad
grp = np.isin(sets, ["1.25x", "retrained"])
L.append("Per-flight divergence, 18 s, lever 0: predicted (C-tilt / C-torque) against simulated (12g's stored tilt sweep), per set and cap.")
L.append("  pred dead = flights whose critical limit <= cap; acc = per-flight agreement.")
acc = {}
for k in ("tilt", "torque"):
    ok = n = 0
    for cap in (30, 45, 59):
        pd = fl[k][grp] <= np.deg2rad(cap) + 1e-12
        ok += int((pd == (stored[cap][grp] == 1)).sum()); n += pd.size
    acc[k] = ok / n
for s in SETS:
    row = []
    for cap in CAPS:
        g = sets == s
        row.append(f"{cap} deg: sim {int(stored[cap][g].sum())}, tilt {int((fl['tilt'][g] <= np.deg2rad(cap) + 1e-12).sum())}, torque {int((fl['torque'][g] <= np.deg2rad(cap) + 1e-12).sum())}")
    L.append(f"  [{s}] " + "; ".join(row))
best = max(acc, key=acc.get)
J["DJ6"] = dict(acc_tilt=acc["tilt"], acc_torque=acc["torque"], best=best, held=acc[best] >= 0.85 and best == "torque")
L.append(f"DJ6 divergence (1.25x + retrained, caps 30/45/59, {3 * int(grp.sum()) * 64} flight-caps): accuracy C-tilt {acc['tilt']:.3f}, C-torque {acc['torque']:.3f}; "
         f"better {best} -> {'held' if J['DJ6']['held'] else 'REFUTED'}")
c125 = np.rad2deg(fl[best][sets == "1.25x"])
mc = float(np.median(c125))
J["DJ7"] = dict(criterion=best, median_crit_deg=mc, q25=float(np.quantile(c125, 0.25)), q75=float(np.quantile(c125, 0.75)), held=30 <= mc <= 45)
L.append(f"DJ7 critical limit (1.25x, {best}): median {mc:.1f} deg (IQR {J['DJ7']['q25']:.1f}-{J['DJ7']['q75']:.1f}) -> {'held' if J['DJ7']['held'] else 'REFUTED'}")
gb = sets == "bolted"
pb, sb = int((fl[best][gb] <= np.deg2rad(20) + 1e-12).sum()), int(stored[20][gb].sum())
J["DJ8"] = dict(criterion=best, pred=pb, sim=sb, held=sb > 0 and 0.5 <= pb / sb <= 2.0)
L.append(f"DJ8 bolted-on at 20 deg ({best}): predicted {pb}, simulated {sb} of 640 -> {'held' if J['DJ8']['held'] else 'REFUTED'}")

open(os.path.join(HERE, "stats.txt"), "w").write("\n".join(L) + "\n")
json.dump(J, open(os.path.join(HERE, "stats.json"), "w"), indent=1)
print("\n".join(L))


# ---- post hoc (written after the lines above were read; not predictions) ----
def auc(score, y):
    """Probability that a dead flight has a lower critical limit than a surviving one (ties count half)."""
    s1, s0 = score[y], score[~y]
    if not len(s1) or not len(s0):
        return float("nan")
    s0s = np.sort(s0)
    lt = np.searchsorted(s0s, s1, side="right") - np.searchsorted(s0s, s1, side="left")
    gt = len(s0s) - np.searchsorted(s0s, s1, side="right")
    return float((gt + 0.5 * lt).sum() / (len(s1) * len(s0)))


L.append("")
L.append("Post hoc (written after DJ0-DJ8 were scored): how well does the C-tilt critical limit rank flights, and what 60-degree")
L.append("substitute would fit? AUC = P(a dead flight's predicted critical limit < a survivor's), per set and cap where both occur.")
PH = {}
for s in SETS:
    g = sets == s
    for cap in CAPS:
        y = stored[cap][g] == 1
        if 0 < y.sum() < y.size:
            a = auc(np.nan_to_num(fl["tilt"][g], posinf=99.0), y)
            PH[f"auc_{s}_{cap}"] = a
            L.append(f"  [{s}] {cap} deg: {int(y.sum())} of {y.size} dead, AUC {a:.3f}")
# per-flight predicted tilt amplitude at the cap, worst axis (deg): C-tilt says dead iff >= 60
amp_at = lambda cap: np.rad2deg(np.max(np.where(lc == 1, P["a_th"], np.where(lc == 0, 0.0, np.inf)), -1) * np.deg2rad(cap))
best_t, best_acc = None, -1.0
for thr in np.arange(30.0, 90.5, 0.5):
    ok = n = 0
    for cap in (30, 45, 59):
        pd = amp_at(cap)[grp] >= thr
        ok += int((pd == (stored[cap][grp] == 1)).sum()); n += pd.size
    if ok / n > best_acc:
        best_t, best_acc = float(thr), ok / n
PH["fit_threshold_deg"], PH["fit_acc"] = best_t, best_acc
L.append(f"  Amplitude threshold fitted on the DJ6 flight-caps (in-sample): {best_t:.1f} deg, accuracy {best_acc:.3f} (60 deg: {acc['tilt']:.3f}).")
for s in ("bolted", "1.25x"):
    g = sets == s
    a20 = amp_at(20)[g]
    L.append(f"  [{s}] predicted worst-axis tilt amplitude at 20 deg: median {np.median(a20):.1f} deg; among the flights dead at 20 deg (18 s) "
             f"{np.median(a20[stored[20][g] == 1]) if (stored[20][g] == 1).any() else float('nan'):.1f}, alive {np.median(a20[stored[20][g] == 0]):.1f}")
L.append("  Deaths at plants the linear model calls stable on both axes (the certificate's 'necessary' side, 12g scored it at 20 deg only):")
for s in SETS:
    g = sets == s; us = unst[g].any(-1)
    row = [f"{cap} deg {int(((stored[cap][g] == 1) & ~us).sum())} of {int((stored[cap][g] == 1).sum())}" for cap in CAPS]
    PH[f"dead_lin_stable_{s}"] = {cap: int(((stored[cap][g] == 1) & ~us).sum()) for cap in CAPS}
    L.append(f"  [{s}] " + "; ".join(row))
json.dump(dict(J, post_hoc=PH), open(os.path.join(HERE, "stats.json"), "w"), indent=1)
open(os.path.join(HERE, "stats.txt"), "a").write("\n".join(L[L.index(next(x for x in L if x.startswith("Post hoc"))) - 1:]) + "\n")
print("\n".join(L[-20:]))
