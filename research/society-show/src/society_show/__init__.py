"""Seeded episodes of a simulated robot town, with a cast, turning points and a narration.

The dynamics are `society-trust`'s (copied here, with the same random-number order, so a
test can check the two agree): each person holds a trust level in the town's robots,
updated by their own encounters and by gossip. This module adds only the storytelling layer:
invented names for the people, a detector that finds the turning points from the recorded
trust of every person, and a narration built from those same numbers.

Everything here is fiction labelled as such. The people are invented, the robots are a
stylised fleet, and nothing depicts a real person or a real event. Stdlib only.
"""
import random

NAMES = ["Ada", "Bram", "Cleo", "Dov", "Esme", "Finn", "Gus", "Hana", "Ivo", "Juno", "Kai",
         "Lena", "Milo", "Nell", "Otto", "Pia", "Quin", "Rhea", "Sol", "Tove", "Uma", "Vik",
         "Wren", "Xia", "Yael", "Zed", "Alma", "Bo", "Cy", "Dara", "Ezra", "Faye", "Gil",
         "Hugo", "Ines", "Jory", "Kit", "Lux", "Mina", "Noor", "Oren", "Pax", "Remy", "Suki",
         "Teo", "Una", "Vera", "Wes"]


def steady_trust(e, w=1.0):
    """Fixed point of the experience-only update: (1 - e)(1 - t) = e w t."""
    return (1 - e) / ((1 - e) + e * w)


def _gossip(t, g, beta, rng):
    idx = list(range(len(t)))
    rng.shuffle(idx)
    for k in range(0, len(idx) - 1, 2):
        i, j = idx[k], idx[k + 1]
        d = t[j] - t[i]
        ti, tj = t[i], t[j]
        t[i] = ti + d * (g * beta if d < 0 else g)
        t[j] = tj - d * (g * beta if -d < 0 else g)


def _experience(t, e, eta, w, rng, theta):
    for i, ti in enumerate(t):
        if ti >= theta and rng.random() < ti:
            t[i] = ti - eta * w * ti if rng.random() < e else ti + eta * (1 - ti)


def run_town(n=48, rounds=240, e0=0.05, e_bad=0.8, start=40, length=30, g=0.05, beta=1.0,
             tau=1.0, eta=0.1, theta=0.3, seed=0):
    """Return the whole record: trust[r][i] before round r's updates, plus the settings."""
    rng = random.Random(seed)
    t = [steady_trust(e0)] * n
    t = list(t)
    trust = []
    for r in range(rounds):
        trust.append(list(t))
        e = e_bad if start <= r < start + length else e0
        _experience(t, e, eta, tau, rng, theta)
        if g > 0:
            _gossip(t, g, beta, rng)
    return {"trust": trust, "n": n, "rounds": rounds, "e0": e0, "e_bad": e_bad, "start": start,
            "length": length, "g": g, "beta": beta, "tau": tau, "theta": theta, "seed": seed,
            "baseline": steady_trust(e0)}


def mean(xs):
    return sum(xs) / len(xs)


def avoiders(row, theta):
    return sum(1 for x in row if x < theta)


def turning_points(ep, tol=0.05, tail=20):
    """Find the story's turning points from the record. Each is (round, kind, text-free facts)."""
    tr, n, th = ep["trust"], ep["n"], ep["theta"]
    s, end = ep["start"], ep["start"] + ep["length"]
    pts = [(s, "incident_start", {"error_rate": ep["e_bad"]})]
    means = [mean(r) for r in tr]
    av = [avoiders(r, th) for r in tr]
    first = next((r for r in range(s, len(tr)) if av[r] > 0), None)
    if first is not None:
        who = min(range(n), key=lambda i: tr[first][i])
        pts.append((first, "first_avoider", {"person": who, "trust": tr[first][who]}))
    half = next((r for r in range(s, len(tr)) if av[r] * 2 >= n), None)
    if half is not None:
        pts.append((half, "half_avoiding", {"count": av[half]}))
    low = min(range(s, end + 1), key=lambda r: means[r])
    if low != end:
        pts.append((low, "lowest_trust", {"mean": means[low], "avoiding": av[low]}))
    pts.append((end, "incident_end", {"mean": means[end], "avoiding": av[end]}))
    base = ep["baseline"]
    back = next((r for r in range(end, len(tr)) if means[r] >= base - tol), None)
    final_mean, final_av = mean(means[-tail:]), av[-1]
    if back is not None:
        pts.append((back, "recovered", {"mean": means[back], "rounds_after": back - end}))
    else:
        pts.append((len(tr) - 1, "locked_out", {"mean": final_mean, "avoiding": final_av}))
    pts.sort(key=lambda p: p[0])
    return pts


def outcome(ep, tol=0.05, tail=20):
    means = [mean(r) for r in ep["trust"]]
    return "recovered" if mean(means[-tail:]) >= ep["baseline"] - tol else "locked out"


def narrate(ep, cast, points):
    """One sentence per turning point, every number taken from the record."""
    tr, th = ep["trust"], ep["theta"]
    out = []
    for r, kind, f in points:
        if kind == "incident_start":
            out.append((r, f"Round {r}: the robots begin to fail {f['error_rate']:.0%} of their jobs."
                           + (" When one fails it explains why." if ep["tau"] < 1 else "")))
        elif kind == "first_avoider":
            out.append((r, f"Round {r}: {cast[f['person']]}'s trust drops to {f['trust']:.3f}, below the "
                           f"{th:.2f} line, and {cast[f['person']]} stops using robots at all."))
        elif kind == "half_avoiding":
            out.append((r, f"Round {r}: {f['count']} of {ep['n']} townspeople now avoid the robots."))
        elif kind == "lowest_trust":
            out.append((r, f"Round {r}: the town's average trust is at its lowest during the incident, at {f['mean']:.2f} "
                           f"(it was {ep['baseline']:.2f}), with {f['avoiding']} people avoiding."))
        elif kind == "incident_end":
            out.append((r, f"Round {r}: the robots are fixed. Average trust is {f['mean']:.2f}; "
                           f"{f['avoiding']} still avoid them."))
        elif kind == "recovered":
            out.append((r, f"Round {r}: trust is back within 0.05 of normal ({f['mean']:.2f}), "
                           f"{f['rounds_after']} rounds after the fix."))
        elif kind == "locked_out":
            out.append((r, f"Round {r}: the story ends with the town's trust at {f['mean']:.2f} and "
                           f"{f['avoiding']} of {ep['n']} still avoiding robots that now work. "
                           "Avoiders meet no robots, so only gossip can bring them back."))
    return out


def cast_for(n, seed):
    rng = random.Random(10_000 + seed)
    names = NAMES[:]
    rng.shuffle(names)
    return names[:n]
