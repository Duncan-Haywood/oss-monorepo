"""Robots that learn to honour or ignore an urgency cue at a door.

Builds on `society-cheapcue`, where the fleet's rule was fixed: yield to a partner who sends the cue (`gS = 0`),
go against one who does not (`gQ = 1`). That fleet cost the robots themselves 0.29 per encounter, so a robot that
cares only about its own cost may not keep the rule. Here each robot, a negligible part of the fleet, picks its go
probability separately for partners who send the cue (`gS`) and who do not (`gQ`) by a logit response to its own
expected cost, taking the people's equilibrium (cue sending, door play) as given. The fleet's `(gS, gQ)` is a fixed
point of that response; people then re-equilibrate. The door and signalling model is imported unchanged from
`society-cheapcue`; the robot's own waiting cost is `w` and its collision cost `k`, as for people.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "society-cheapcue" / "src"))
from society_cheapcue import DEF, _sig, equilibrium, summary  # noqa: E402,F401


def partner_go(r, gS, gQ, cU, cN, e=0.0, **kw):
    """What a robot expects of its partner, split by what it observes.
    Returns (pS, pQ): the chance the partner goes given it looks like a signaller / a non-signaller, and the
    chance of seeing each look (mS, mQ), counting robot partners (who never signal and go with gQ)."""
    p = {**DEF, **kw}
    u, r_ = p["u"], r
    D = equilibrium(r, gS, gQ, cU, cN, e, **kw)
    sU, sN = D["sU"], D["sN"]
    # humans: (weight, signals, go prob). A signaller is seen as one w.p. 1-e, a non-signaller w.p. e.
    parts = []
    for share, s, t in ((u, sU, "U"), (1 - u, sN, "N")):
        pp = D[t]["p"]
        parts += [((1 - r_) * share * s, 1, pp), ((1 - r_) * share * (1 - s), 0, pp)]
    parts.append((r_, 0, gQ))
    wS = wQ = nS = nQ = 0.0
    for wgt, sig, pg in parts:
        look = 1 - e if sig else e
        wS += wgt * look
        nS += wgt * look * pg
        wQ += wgt * (1 - look)
        nQ += wgt * (1 - look) * pg
    return (nS / wS if wS > 1e-12 else 0.5), (nQ / wQ if wQ > 1e-12 else 0.5), wS, wQ


def go_gain(pp, k=3.0, w=1.0, d=1.0):
    """Robot's cost of yielding minus cost of going against a partner who goes w.p. pp (positive favours going)."""
    return (pp * w + (1 - pp) * d) - pp * k


def respond(r, gS, gQ, cU, cN, e=0.0, br=8.0, **kw):
    """Logit best response of one robot to the fleet (gS, gQ): its go probability per observed look."""
    p = {**DEF, **kw}
    pS, pQ, _, _ = partner_go(r, gS, gQ, cU, cN, e, **kw)
    return (_sig(br * go_gain(pS, p["k"], p["w"], p["d"])),
            _sig(br * go_gain(pQ, p["k"], p["w"], p["d"])))


def learn(r, cU, cN, e=0.0, br=8.0, start=(0.0, 1.0), iters=400, step=0.25, **kw):
    """Damped fixed-point iteration of the robots' response from `start`; returns (gS, gQ, converged)."""
    gS, gQ = start
    for _ in range(iters):
        nS, nQ = respond(r, gS, gQ, cU, cN, e, br, **kw)
        if abs(nS - gS) + abs(nQ - gQ) < 1e-6:
            return gS, gQ, True
        gS, gQ = gS + step * (nS - gS), gQ + step * (nQ - gQ)
    return gS, gQ, False


def outcome(r, gS, gQ, cU, cN, e=0.0, **kw):
    """Group costs at a given fleet rule (people's signalling equilibrium included)."""
    return summary(r, gS, gQ, cU, cN, e, **kw)
