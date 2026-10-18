"""Flip the make/buy judgements behind selfrep-closure and see how far the closure numbers move.

Reuses the sibling ``selfrep-closure`` source tree (relative path). The unit masses and costs are that
project's ASSUMED placeholders; here they are held fixed and only the binary "can the shop make it" judgement varies.
"""
import pathlib, random, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3] / "selfrep-closure" / "src"))
from selfrep_closure.bom import PARTS, SHOPS  # noqa: E402
from selfrep_closure.closure import makeable, parts_for  # noqa: E402

SHOP = "printer+cnc+laser+casting"
# Lines the original project calls optimistic (it marks them in bom.py): they are makeable only by judgement.
JUDGED = ("M8 washer", "M3 washer", "16-tooth GT2 pulley", "MDF print-bed plate", "8x25 mm brass bushing")
# Vitamin kinds a reader could plausibly argue a well-equipped shop makes in-house (nuts, bolts, rods, tubing, belts);
# electronics, motors, bearings and glass are left out because no process here comes near them.
ARGUABLE_KINDS = ("fastener", "rod", "belt", "other")


def base_makeable(variant, shop=SHOP):
    return {p.name: makeable(p, SHOPS[shop]) for p in parts_for(variant)}


def score(variant, can):
    """Closure by lines, mass and cost given a name -> bool map of makeable lines."""
    tot = {"lines": 0.0, "mass": 0.0, "cost": 0.0}
    got = dict(tot)
    for p in parts_for(variant):
        for k, v in (("lines", 1), ("mass", p.qty * p.mass_g), ("cost", p.qty * p.cost)):
            tot[k] += v
            if can[p.name]:
                got[k] += v
    return {k: got[k] / tot[k] for k in tot}


def drop_one(variant):
    """Closure change when each judged-makeable line is instead bought (a vitamin)."""
    base = base_makeable(variant)
    s0 = score(variant, base)
    rows = []
    for p in parts_for(variant):
        if base[p.name] and p.name in JUDGED:
            can = dict(base); can[p.name] = False
            s = score(variant, can)
            rows.append((p.name, {k: s[k] - s0[k] for k in s}))
    return s0, rows


def add_one(variant):
    """Closure change when each current vitamin becomes makeable: the leverage of a capability the shop lacks."""
    base = base_makeable(variant)
    s0 = score(variant, base)
    rows = []
    for p in parts_for(variant):
        if not base[p.name]:
            can = dict(base); can[p.name] = True
            s = score(variant, can)
            rows.append((p.name, p.kind, {k: s[k] - s0[k] for k in s}))
    return s0, rows


def monte_carlo(variant, n=5000, keep=0.5, gain=0.1, seed=0):
    """Each judged line stays makeable with probability ``keep``; each arguable vitamin becomes makeable with ``gain``."""
    rng = random.Random(seed)
    base = base_makeable(variant)
    ps = parts_for(variant)
    out = {"lines": [], "mass": [], "cost": []}
    for _ in range(n):
        can = {}
        for p in ps:
            if base[p.name]:
                can[p.name] = rng.random() < keep if p.name in JUDGED else True
            else:
                can[p.name] = p.kind in ARGUABLE_KINDS and rng.random() < gain
        s = score(variant, can)
        for k in out:
            out[k].append(s[k])
    q = lambda xs, f: sorted(xs)[int(f * (len(xs) - 1))]
    return {k: (q(v, .05), q(v, .5), q(v, .95)) for k, v in out.items()}
