"""Costly urgency signals at a door: how much faking tips a reading robot back to yield-all?

Builds on `society-urgentdoor`. There robots read a partner's urgency perfectly. Here a person can only
*signal* urgency (hurry, press a button) at a private cost `c`, and the robot reads the signal, wrongly
with probability `e`. Urgent people (waiting cost `wu * w`) gain more from a yielding robot than normal
people (cost `w`), so a costly signal can separate them (Spence 1973); a normal person who signals is a faker.

Robots play `gS` against a partner who looks like a signaller, `gQ` otherwise. A signaller is read as one
w.p. 1 - e, a non-signaller is misread as one w.p. e. People choose to signal with a logit response of
sharpness `bs` to the gain from signalling net of `c`. Door play is as in `society-doorway`: logit people
with memory `m`. Mean field: four person-groups (urgent/normal x signal/not) share the human go rate h.
"""
import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "society-doorway" / "src"))
from society_doorway import cost_go, cost_yield, go_prob, human_go  # noqa: E402

DEF = dict(u=0.2, wu=3.0, k=3.0, w=1.0, d=1.0, m=9, beta=8.0, bs=8.0)


def _sig(x):
    return 1.0 / (1.0 + math.exp(max(-50.0, min(50.0, -x))))


def door(r, gS, gQ, sU, sN, e=0.0, u=0.2, wu=3.0, k=3.0, w=1.0, d=1.0, m=9, beta=8.0, **_):
    """Door equilibrium for given signalling probabilities sU (urgent) and sN (normal).
    A person's memory of partners spans many rounds with a mix of their own past signals, so it
    reflects the mixture q_X = r (s_X g_sig + (1 - s_X) g_nos) + (1 - r) h, and their go probability
    p_X depends on that, not on this round's signal. This round's signal changes only the chance
    that the partner goes. Returns per type: p, and cost if they signal / do not (door cost only)."""
    gsig = (1 - e) * gS + e * gQ      # robot's go prob against someone who signalled
    gnos = e * gS + (1 - e) * gQ      # ... against someone who did not
    types = {"U": (u, wu * w, sU), "N": (1 - u, w, sN)}

    def qmix(sx, h):
        return r * (sx * gsig + (1 - sx) * gnos) + (1 - r) * h

    def rhs(h):
        return sum(sh * human_go(qmix(sx, h), m, beta, k=k, w=ww, d=d) for sh, ww, sx in types.values())
    lo, hi = 0.0, 1.0
    for _ in range(60):
        mid = (lo + hi) / 2
        if rhs(mid) - mid > 0:
            lo = mid
        else:
            hi = mid
    h = (lo + hi) / 2
    out = {"h": h}
    for t, (sh, ww, sx) in types.items():
        pp = human_go(qmix(sx, h), m, beta, k=k, w=ww, d=d)
        cs = {}
        for sig, g in ((1, gsig), (0, gnos)):
            q = r * g + (1 - r) * h   # partner's go chance this encounter
            cs[sig] = pp * cost_go(q, k) + (1 - pp) * cost_yield(q, k, ww, d)
        out[t] = dict(p=pp, c1=cs[1], c0=cs[0], share=sh)
    return out


def equilibrium(r, gS, gQ, c, e=0.0, bs=8.0, iters=400, **kw):
    """Signalling equilibrium: each type signals w.p. logit(bs * (gain from signalling - c)).
    Damped fixed-point iteration from 'nobody signals'; returns the door solution plus sU, sN."""
    sU = sN = 0.0
    for _ in range(iters):
        D = door(r, gS, gQ, sU, sN, e, **kw)
        nU = _sig(bs * (D["U"]["c0"] - D["U"]["c1"] - c))
        nN = _sig(bs * (D["N"]["c0"] - D["N"]["c1"] - c))
        if abs(nU - sU) + abs(nN - sN) < 1e-10:
            break
        sU, sN = 0.5 * sU + 0.5 * nU, 0.5 * sN + 0.5 * nN
    D = door(r, gS, gQ, sU, sN, e, **kw)
    D.update(sU=sU, sN=sN)
    return D


def summary(r, gS, gQ, c, e=0.0, **kw):
    """Mean cost per encounter by group (signalling cost included), shares, and fake share."""
    p = {**DEF, **kw}
    u, k, w, d = p["u"], p["k"], p["w"], p["d"]
    D = equilibrium(r, gS, gQ, c, e, **kw)
    sU, sN = D["sU"], D["sN"]
    cU = sU * (D["U"]["c1"] + c) + (1 - sU) * D["U"]["c0"]
    cN = sN * (D["N"]["c1"] + c) + (1 - sN) * D["N"]["c0"]
    gsig, gnos = (1 - e) * gS + e * gQ, e * gS + (1 - e) * gQ

    def vs(g, pp):  # robot goes w.p. g, partner goes w.p. pp
        return g * (pp * k) + (1 - g) * (pp * w + (1 - pp) * d)
    tot = 0.0
    for t, sx in (("U", sU), ("N", sN)):
        tot += D[t]["share"] * (sx * vs(gsig, D[t]["p"]) + (1 - sx) * vs(gnos, D[t]["p"]))
    crr = vs(gQ, gQ)
    cR = (1 - r) * tot + r * crr
    sig_total = u * sU + (1 - u) * sN
    return dict(cU=cU, cN=cN, cR=cR, crowd=(1 - r) * (u * cU + (1 - u) * cN) + r * cR,
                sU=sU, sN=sN, precision=(u * sU / sig_total if sig_total > 1e-12 else float("nan")),
                D=D)


def simulate(r, gS, gQ, sU, sN, e=0.0, u=0.2, wu=3.0, n=400, m=9, beta=8.0, rounds=500, burn=150,
             seed=0, k=3.0, w=1.0, d=1.0):
    """Agent-based check of the door part with the signalling probabilities fixed at (sU, sN):
    each round every person signals (or not) independently, robots read it with error e and go w.p.
    gS / gQ. Returns mean door cost by type (no signalling cost). Does not check the signalling equilibrium."""
    rng = random.Random(seed)
    n -= n % 2
    nr = round(r * n)
    nu = round(u * (n - nr))
    kind = ["R"] * nr + ["U"] * nu + ["N"] * (n - nr - nu)
    rng.shuffle(kind)
    mem = [[rng.random() < 0.5 for _ in range(m)] for _ in range(n)]
    tot = {"R": 0.0, "U": 0.0, "N": 0.0}
    cnt = {"R": 0, "U": 0, "N": 0}
    for t in range(rounds):
        order = list(range(n))
        rng.shuffle(order)
        sig = [(rng.random() < (sU if kind[i] == "U" else sN)) if kind[i] != "R" else False for i in range(n)]
        for a in range(0, n, 2):
            i, j = order[a], order[a + 1]
            acts = {}
            for x, y in ((i, j), (j, i)):
                if kind[x] == "R":
                    if kind[y] == "R":
                        g = gQ
                    else:
                        looks = sig[y] != (rng.random() < e)
                        g = gS if looks else gQ
                    acts[x] = rng.random() < g
                else:
                    wx = wu * w if kind[x] == "U" else w
                    acts[x] = rng.random() < go_prob(sum(mem[x]) / m, beta, k, wx, d)
            for x, y in ((i, j), (j, i)):
                wx = wu * w if kind[x] == "U" else w
                cst = k if acts[x] and acts[y] else (0.0 if acts[x] else (wx if acts[y] else d))
                if t >= burn:
                    tot[kind[x]] += cst
                    cnt[kind[x]] += 1
                mem[x].pop(0)
                mem[x].append(acts[y])
    return {kd: (tot[kd] / cnt[kd] if cnt[kd] else float("nan")) for kd in tot}
