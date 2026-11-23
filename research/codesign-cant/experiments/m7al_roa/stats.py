"""Milestone 7al: score RA0-RA5 from results.json; writes stats.txt and stats.json."""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
S = R["scales"]; off = np.abs(np.array(R["off"])).max(1)          # (E,) worst-axis unscaled offset, m
D = {(r["arm"], r["set"], r["s"], r["cap"]): np.array(r["dead"], bool) for r in R["runs"]}  # (10, 64)
L, J = [], {}
say = L.append


def auc(score, y):
    score, y = np.asarray(score, float), np.asarray(y, bool)
    pos, neg = score[y], score[~y]
    if len(pos) == 0 or len(neg) == 0:
        return float("nan")
    r = np.argsort(np.argsort(np.r_[pos, neg], kind="mergesort"), kind="mergesort") + 1.0
    allv = np.r_[pos, neg]
    for v in np.unique(allv):                                         # mid-ranks for ties
        m = allv == v; r[m] = r[m].mean()
    return float((r[:len(pos)].sum() - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg)))


say("Deaths of 640 (10 designs x 64 held-out flights, 18 s, lever 0, 45 deg limit) by start-offset half-width 0.5 s m.")
say("  s     half-width   quiet+O retr  quiet+O 1.25x   full retr   full 1.25x")
tab = {}
for s in S:
    row = [int(D[(a, st, s, False)].sum()) for a in ("quiet+O", "full") for st in ("retrained", "1.25x")]
    tab[s] = row
    say(f"  {s:<5g} {0.5 * s:6.2f} m     {row[0]:>8}      {row[1]:>8}    {row[2]:>8}     {row[3]:>8}")
say("With 7l's cap (perr_max = A_P / kp, A_P = 3.5 m/s^2):")
capt = {}
for s in R["cap_scales"]:
    row = [int(D[(a, st, s, True)].sum()) for a in ("quiet+O", "full") for st in ("retrained", "1.25x")]
    capt[s] = row
    say(f"  {s:<5g} {0.5 * s:6.2f} m     {row[0]:>8}      {row[1]:>8}    {row[2]:>8}     {row[3]:>8}")
J["table"] = {str(k): v for k, v in tab.items()}; J["cap"] = {str(k): v for k, v in capt.items()}
say("")

ra0 = dict(qO_retr=tab[1.0][0], qO_125=tab[1.0][1], q_retr=tab[0.02][0], q_125=tab[0.02][1], full_retr=tab[1.0][2], full_125=tab[1.0][3])
ok0 = ra0 == dict(qO_retr=28, qO_125=510, q_retr=0, q_125=205, full_retr=31, full_125=535)
say(f"RA0 check {ra0} vs 7ak (28, 510, 0, 205, 31, 535) -> {'held' if ok0 else 'MISMATCH'}")

# RA1: monotone in s for retrained quiet+O
st = "retrained"
G = np.stack([D[("quiet+O", st, s, False)] for s in S], 0)       # (ns, 10, 64)
ever = G.any(0)
first = np.where(ever, G.argmax(0), -1)
mono = np.array([[G[first[n, e]:, n, e].all() if ever[n, e] else True for e in range(G.shape[2])] for n in range(G.shape[1])])
n_ever = int(ever.sum()); n_mono = int((mono & ever).sum())
say(f"RA1 retrained quiet+O: {n_ever} flights die somewhere on the grid; {n_mono} die at every larger s ({n_mono / max(n_ever, 1):.3f}; bar 0.95) -> {'held' if n_mono >= 0.95 * n_ever else 'REFUTED'}")
J["ra1"] = dict(ever=n_ever, mono=n_mono)

# RA2: AUC of kp * s * max|off| vs s * max|off|
kp = np.array(R["kp"][st])
y, a_req, dist = [], [], []
for i, s in enumerate(S):
    y.append(G[i].ravel()); dist.append(np.broadcast_to(s * 0.5 / 0.5 * off[None, :], G[i].shape).ravel())
    a_req.append((kp[:, None] * s * off[None, :]).ravel())
y, a_req, dist = map(np.concatenate, (y, a_req, dist))
a1, a2 = auc(a_req, y), auc(dist, y)
say(f"RA2 retrained quiet+O over {len(y)} (flight, s) pairs: AUC kp*s*max|off| {a1:.3f}, AUC s*max|off| {a2:.3f} (bar >= 0.90 and above distance) -> {'held' if a1 >= 0.90 and a1 > a2 else 'REFUTED'}")
J["ra2"] = dict(auc_acc=a1, auc_dist=a2)

# RA3: median critical half-width among flights dying by s=2
crit = np.array(S)[first[ever]] * 0.5
med = float(np.median(crit)) if len(crit) else float("nan")
say(f"RA3 retrained quiet+O: median critical half-width {med:.3f} m over {len(crit)} flights (bar 0.4-0.7 m) -> {'held' if 0.4 <= med <= 0.7 else 'REFUTED'}")
J["ra3"] = dict(median_m=med, n=len(crit))

# RA4, RA5
r4 = {s: (tab[s][2], capt[s][2]) for s in R["cap_scales"]}
ok4 = all(c <= 0.1 * u for u, c in r4.values())
say(f"RA4 retrained full, (uncapped, capped) deaths {r4} (bar: cap removes >= 90% at s = 1 and 2) -> {'held' if ok4 else 'REFUTED'}")
u5, c5 = tab[1.0][3], capt[1.0][3]
say(f"RA5 1.25x full at s = 1: {u5} uncapped, {c5} capped; removed {(u5 - c5) / u5:.2f} (bar < 0.5) -> {'held' if (u5 - c5) < 0.5 * u5 else 'REFUTED'}")
J["ra4"] = {str(k): v for k, v in r4.items()}; J["ra5"] = [u5, c5]

say("")
say("Post hoc (written after RA0-RA5 were scored).")
for s_ in ("retrained", "1.25x"):
    Gs = np.stack([D[("full", s_, s, False)] for s in S], 0)
    per = Gs.sum(2)                                                   # (ns, 10)
    say(f"  [{s_}] full: deaths per design at each s (rows s):")
    for i, s in enumerate(S):
        say(f"     s={s:<5g} " + " ".join(f"{v:3d}" for v in per[i]))
# per-design threshold in acceleration terms for retrained quiet+O
th = []
for n in range(G.shape[1]):
    f = first[n][ever[n]]
    if len(f):
        th.append(float(np.min(kp[n] * np.array(S)[f] * off[ever[n]])))
say(f"  [retrained] quiet+O: per-design smallest initial proportional request that killed a flight, m/s^2: {np.round(th, 2).tolist()} (kp {np.round(kp, 2).tolist()})")
J["posthoc_min_acc"] = th
open(os.path.join(HERE, "stats.txt"), "w").write("\n".join(L) + "\n")
json.dump(J, open(os.path.join(HERE, "stats.json"), "w"), indent=1)
print("\n".join(L))

# Post hoc: are the capped residual deaths the small-offset deaths (the same plants), i.e. not a basin effect?
L2 = []
for a in ("quiet+O", "full"):
    for s in R["cap_scales"]:
        c = D[(a, "retrained", s, True)]
        small = D[(a, "retrained", 0.6, False)]
        L2.append(f"  [retrained] {a} capped s={s:g}: {int(c.sum())} deaths, {int((c & small).sum())} of them also die uncapped at s = 0.6 (0.30 m; {int(small.sum())} deaths there); designs {sorted(set(np.where(c)[0].tolist()))}")
open(os.path.join(HERE, "stats.txt"), "a").write("\n".join(L2) + "\n")
print("\n".join(L2))
