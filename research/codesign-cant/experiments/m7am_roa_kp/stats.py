"""Milestone 7am: score RB0-RB4 from results.json; writes stats.txt and stats.json."""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
S = np.array(R["scales"]); off = np.abs(np.array(R["off"])).max(1)       # (E,) worst-axis unscaled offset, m
DS = R["designs"]; kp = np.array([d["kp"] for d in DS]); N = len(DS)
wide = np.array([d["label"] == "t45 cap wide" for d in DS])
D = {(r["arm"], r["s"], r["cap"], r["steps"]): np.array(r["dead"], bool) for r in R["runs"]}   # (36, 64)
L18 = next(k[3] for k in D if k[3] is not None)
L, J = [], {}
say = L.append


def midranks(x):
    o = np.argsort(x, kind="mergesort"); xs = x[o]; r = np.empty(len(x))
    i = 0
    while i < len(x):
        j = i
        while j + 1 < len(x) and xs[j + 1] == xs[i]:
            j += 1
        r[o[i:j + 1]] = 0.5 * (i + j) + 1.0; i = j + 1
    return r


def auc(score, y):
    score, y = np.asarray(score, float), np.asarray(y, bool)
    npos, nneg = int(y.sum()), int((~y).sum())
    if npos == 0 or nneg == 0:
        return float("nan")
    r = midranks(score)
    return float((r[y].sum() - npos * (npos + 1) / 2) / (npos * nneg))


say(f"Milestone 7am: 36 designs of milestone 7l retrained at 45 deg (kp {kp.min():.2f}-{kp.max():.2f} s^-2), flown uncapped at a 45 deg")
say("tilt-command limit, lever 0, 64 held-out flights (seed 9999), 18 s, start-offset half-width 0.5 s m. kp10 = t45 and t45 cap (24 designs),")
say("wide = t45 cap wide (12). Deaths per group (kp10 of 1536, wide of 768).")
say("  s     half-width   quiet+O kp10  quiet+O wide   full kp10   full wide")
tab = {}
for s in S:
    q, f = D[("quiet+O", float(s), False, L18)], D[("full", float(s), False, L18)]
    row = [int(q[~wide].sum()), int(q[wide].sum()), int(f[~wide].sum()), int(f[wide].sum())]
    tab[float(s)] = row
    say(f"  {s:<5g} {0.5 * s:6.3f} m     {row[0]:>8}      {row[1]:>8}    {row[2]:>8}    {row[3]:>8}")
J["table"] = {str(k): v for k, v in tab.items()}
say("")

# RB0
b6, c6 = D[("full", 1.0, False, None)].sum(1), D[("full", 1.0, True, None)].sum(1)
sb, sc = np.array([d["stored_base"] for d in DS]), np.array([d["stored_cap"] for d in DS])
mis = int((b6 != sb).sum() + (c6 != sc).sum())
say(f"RB0 6 s check: uncapped {int(b6.sum())} (7l stored {int(sb.sum())}), capped {int(c6.sum())} (stored {int(sc.sum())}); "
    f"per-design mismatches {mis} of 72 -> {'held' if mis == 0 else 'REFUTED'}")
J["rb0"] = dict(base=int(b6.sum()), cap=int(c6.sum()), stored_base=int(sb.sum()), stored_cap=int(sc.sum()), mismatches=mis)

# grid of quiet+O deaths (ns, N, E)
G = np.stack([D[("quiet+O", float(s), False, L18)] for s in S], 0)
ever = G.any(0); first = np.where(ever, G.argmax(0), -1)
mono = np.array([[G[first[n, e]:, n, e].all() if ever[n, e] else True for e in range(G.shape[2])] for n in range(N)])
say(f"(context) quiet+O: {int(ever.sum())} (design, flight) pairs die somewhere on the grid; {int((mono & ever).sum())} die at every larger s")
J["mono"] = dict(ever=int(ever.sum()), mono=int((mono & ever).sum()))

# RB1
y = G.reshape(len(S), -1).ravel()
dist = (S[:, None, None] * off[None, None, :] * np.ones((1, N, 1))).ravel()
acc = (S[:, None, None] * off[None, None, :] * kp[None, :, None]).ravel()
a_acc, a_dist = auc(acc, y), auc(dist, y)
ok1 = a_acc >= 0.90 and a_acc - a_dist >= 0.03
say(f"RB1 quiet+O over {len(y)} (design, flight, s) pairs: AUC kp*s*max|off| {a_acc:.3f}, AUC s*max|off| {a_dist:.3f} "
    f"(bar >= 0.90 and >= distance + 0.03) -> {'held' if ok1 else 'REFUTED'}")
for nm, m in (("kp10", ~wide), ("wide", wide)):
    yy = G[:, m].ravel(); dd = (S[:, None, None] * off[None, None, :] * np.ones((1, m.sum(), 1))).ravel()
    aa = (S[:, None, None] * off[None, None, :] * kp[None, m, None]).ravel()
    say(f"    within {nm}: AUC acc {auc(aa, yy):.3f}, dist {auc(dd, yy):.3f}")
J["rb1"] = dict(auc_acc=a_acc, auc_dist=a_dist)

# RB2: per-design median critical half-width
ec = np.where(ever, S[np.maximum(first, 0)] * 0.5, np.nan)               # (N, E) m; the grid point, not the flight's offset
# critical along each flight's ray as the worst-axis offset at the first dying s
ecray = np.where(ever, S[np.maximum(first, 0)] * off[None, :], np.nan)
nd = ever.sum(1)
med = np.array([np.nanmedian(ec[n]) if nd[n] else np.nan for n in range(N)])
medr = np.array([np.nanmedian(ecray[n]) if nd[n] else np.nan for n in range(N)])
use = nd >= 8
b, a0 = np.polyfit(np.log(kp[use]), np.log(med[use]), 1) if use.sum() >= 3 else (np.nan, np.nan)
br = np.polyfit(np.log(kp[use]), np.log(medr[use]), 1)[0] if use.sum() >= 3 else np.nan
ok2 = -1.3 <= b <= -0.7
say(f"RB2 log median e_c on log kp over {int(use.sum())} designs with >= 8 deaths by s = 2: slope {b:.2f} (bar -1.3 to -0.7; "
    f"distance alone 0) -> {'held' if ok2 else 'REFUTED'}; with e_c measured along each ray (s * max|off|) the slope is {br:.2f}")
say("  per design (label, geom, seed, kp, flights dying by s=2, median e_c m, median kp*e_c m/s^2):")
for n in np.argsort(kp):
    say(f"    {DS[n]['label']:<13} {DS[n]['geom']:<5} {DS[n]['seed']}  kp {kp[n]:6.2f}  {int(nd[n]):>3}  "
        + (f"e_c {med[n]:.3f}  kp*e_c {kp[n] * med[n]:.2f}" if nd[n] else "none"))
for nm, m in (("kp10", ~wide & use), ("wide", wide & use)):
    if m.any():
        say(f"  {nm}: median of per-design median e_c {np.median(med[m]):.3f} m, of kp*e_c {np.median(kp[m] * med[m]):.2f} m/s^2 ({int(m.sum())} designs)")
J["rb2"] = dict(slope=float(b), slope_ray=float(br), n=int(use.sum()), kp=kp.tolist(), n_dead=nd.tolist(),
                med_ec=[None if np.isnan(v) else float(v) for v in med], wide=wide.tolist())

# RB3
low = acc < 4.7
fr = float(y[low].mean()) if low.any() else float("nan")
say(f"RB3 quiet+O pairs with initial request kp*s*max|off| < 4.7 m/s^2: {int(low.sum())}, of which {int(y[low].sum())} die ({fr:.4f}; bar <= 0.01) -> "
    f"{'held' if fr <= 0.01 else 'REFUTED'}")
for nm, m in (("kp10", ~wide), ("wide", wide)):
    mm = np.broadcast_to(m[None, :, None], G.shape).ravel() & low
    say(f"    {nm}: {int(mm.sum())} pairs, {int(y[mm].sum())} die")
mind = [float(acc[y & np.broadcast_to(m[None, :, None], G.shape).ravel()].min()) if (y & np.broadcast_to(m[None, :, None], G.shape).ravel()).any() else None for m in (~wide, wide)]
say(f"    smallest initial request that killed a flight: kp10 {mind[0]:.2f}, wide {mind[1]:.2f} m/s^2")
J["rb3"] = dict(n_low=int(low.sum()), dead_low=int(y[low].sum()), min_kill=mind)

# RB4
r4 = {}
for s in R["cap_scales"]:
    u, c = D[("full", s, False, L18)][wide].sum(), D[("full", s, True, L18)][wide].sum()
    uk, ck = D[("full", s, False, L18)][~wide].sum(), D[("full", s, True, L18)][~wide].sum()
    r4[str(s)] = dict(wide=[int(u), int(c)], kp10=[int(uk), int(ck)])
ok4 = all(v["wide"][1] <= 0.1 * v["wide"][0] for v in r4.values())
say(f"RB4 full, (uncapped, capped) deaths {r4} (bar: cap removes >= 90% of the wide designs' at s = 1 and 2) -> {'held' if ok4 else 'REFUTED'}")
J["rb4"] = r4


# Post hoc (written after RB0-RB4 were scored): the critical request along each ray against the tilt limit's acceleration
areq = kp[:, None] * ecray                                               # (N, E) m/s^2 at the first dying grid point
pd = np.array([np.nanmedian(areq[n]) if nd[n] else np.nan for n in range(N)])
g45 = 9.80665 * np.tan(np.deg2rad(45.0))
for nm, m in (("kp10", ~wide & use), ("wide", wide & use)):
    say(f"Post hoc {nm}: per-design median critical request kp*s*max|off| (ray) median {np.median(pd[m]):.2f} m/s^2 "
        f"(range {np.min(pd[m]):.2f}-{np.max(pd[m]):.2f}); g tan 45 deg = {g45:.2f}")
say(f"Post hoc grid censoring: {int((~wide & use).sum())} kp10 designs, {int(np.sum(med[~wide & use] >= 1.0))} with median e_c at the grid's top (1.0 m)")
J["posthoc"] = dict(med_req_ray=[None if np.isnan(v) else float(v) for v in pd], g_tan45=g45)

open(os.path.join(HERE, "stats.txt"), "w").write("\n".join(L) + "\n")
json.dump(J, open(os.path.join(HERE, "stats.json"), "w"), indent=1)
print("\n".join(L))
