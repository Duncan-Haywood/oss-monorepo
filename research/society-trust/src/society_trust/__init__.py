"""Trust in a robot fleet that spreads by experience and by gossip.

N simulated people each hold a trust level t in [0, 1] in "the robots" (they do
not tell robots apart, so a fleet shares one reputation). Each round:

* Experience. A person relies on a robot with probability t (low trust means
  fewer encounters, so less evidence), and avoids robots altogether while
  t < theta (default 0: never), so an avoider learns nothing first-hand. The robot fails with the round's error
  rate e. Success: t += eta * (1 - t). Failure: t -= eta * w * t, where w = 1
  normally and w = tau < 1 when the robot explains its failure (transparency).
* Gossip. People are paired at random. Each hears the other's trust; hearing a
  lower value moves t toward it by beta * g of the gap, a higher value by g
  (beta > 1 is a negativity bias: bad news travels further than good news).

An incident raises e to e_bad for a few rounds. The question is whether the
fleet's reputation comes back, and how long it takes.

Stdlib only. Stylised: one trust number, one shared reputation, no
differences between people, no real data. Trust here is a model state, not a
measurement of any real person.
"""
import random


def steady_trust(e, w=1.0):
    """Fixed point of the experience-only update: (1 - e)(1 - t) = e w t."""
    return (1 - e) / ((1 - e) + e * w)


def gossip_step(t, g, beta, rng):
    """Pair people at random and exchange trust in place; odd one out sits out."""
    idx = list(range(len(t)))
    rng.shuffle(idx)
    for k in range(0, len(idx) - 1, 2):
        i, j = idx[k], idx[k + 1]
        ti, tj = t[i], t[j]
        d = tj - ti
        t[i] = ti + d * (g * beta if d < 0 else g)
        t[j] = tj - d * (g * beta if -d < 0 else g)


def experience_step(t, e, eta, w, rng, theta=0.0):
    """Each person with trust >= theta relies on a robot with probability t; below theta they avoid robots and learn nothing first-hand."""
    for i, ti in enumerate(t):
        if ti >= theta and rng.random() < ti:
            if rng.random() < e:
                t[i] = ti - eta * w * ti
            else:
                t[i] = ti + eta * (1 - ti)


def simulate(n=100, rounds=800, e0=0.05, e_bad=0.5, start=100, length=50, g=0.05,
             beta=1.0, tau=1.0, eta=0.1, seed=0, t_init=None, theta=0.0):
    """Return the mean-trust trajectory (one value per round, before the round's updates).

    Trust starts at the steady value for e0 (with no transparency discount) unless t_init is given.
    """
    rng = random.Random(seed)
    t = [steady_trust(e0) if t_init is None else t_init] * n
    t = list(t)
    traj = []
    for r in range(rounds):
        traj.append(sum(t) / n)
        e = e_bad if start <= r < start + length else e0
        experience_step(t, e, eta, tau, rng, theta)
        if g > 0:
            gossip_step(t, g, beta, rng)
    return traj


def summarise(traj, start, length, baseline, tol=0.05, tail=50):
    """(lowest mean trust, mean trust over the last `tail` rounds, rounds after the incident until trust is within tol of baseline or None)."""
    low = min(traj[start:])
    final = sum(traj[-tail:]) / tail
    back = None
    for r in range(start + length, len(traj)):
        if traj[r] >= baseline - tol:
            back = r - (start + length)
            break
    return low, final, back
