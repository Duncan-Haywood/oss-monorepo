"""Do robots that learn from their own payoffs drift to going at a door?

Builds on `society-doorway` (go-or-yield game, people with memory, mean field) and
`society-doorcost` (the collision cost `k*` above which a fleet that always yields is stable).
There robots followed a fixed go probability `g`. Here each robot learns:

* it keeps a running estimate `Q[a]` of the cost of each action `a` (go, yield) and updates only the
  action it played, `Q[a] += alpha (cost - Q[a])` (bandit feedback, constant step size);
* it goes with probability `1 / (1 + exp(-beta_r (Q[yield] - Q[go])))` (logit response).

Mean-field prediction: when the estimates have converged, the fleet's go probability is the fixed
point `g = sigmoid(beta_r * gain(g))`, where `gain` is `society-doorcost`'s `deviation_gain` (the cost of
yielding minus the cost of going at the partner go share `q(r, g)`): a logit quantal-response equilibrium.
"""
import math
import random
import sys
from pathlib import Path

_R = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(_R / "society-doorway" / "src"))
sys.path.insert(0, str(_R / "society-doorcost" / "src"))
from society_doorway import go_prob  # noqa: E402
from society_doorcost import deviation_gain, threshold_k  # noqa: E402,F401


def _sig(x):
    return 1.0 / (1.0 + math.exp(max(-50.0, min(50.0, -x))))


def qre_fleet(r, beta_r, k, w=1.0, d=1.0, m=9, beta=8.0):
    """Fixed point g = sigmoid(beta_r * gain(g)) of the fleet's go probability.
    gain(g) falls in g (more going by robots raises q, which favours yielding), so
    g - sigmoid(...) is increasing and bisection finds the single root."""
    lo, hi = 0.0, 1.0
    for _ in range(60):
        mid = (lo + hi) / 2
        if _sig(beta_r * deviation_gain(r, mid, k, w, d, m, beta)) - mid > 0:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def simulate_learning(r, k, w=1.0, d=1.0, n=200, m=9, beta=8.0, beta_r=8.0, alpha=0.05,
                      rounds=3000, burn=1500, seed=0, g0=0.0):
    """n agents, share r learning robots (start with go probability ~g0 via Q), people as in
    society-doorway. Returns the robots' mean go probability, the people's go share and the
    mean cost per encounter of robots, people and all, over the rounds after `burn`."""
    rng = random.Random(seed)
    n -= n % 2
    nr = round(r * n)
    robot = [i < nr for i in range(n)]
    mem = [[rng.random() < 0.5 for _ in range(m)] for _ in range(n)]
    # Q[0] = cost estimate of going, Q[1] = of yielding; start so that P(go) = g0
    # (g0 = 0 or 1 is clipped to 0.02 / 0.98 so the robot can still learn)
    g0 = min(0.98, max(0.02, g0))
    q0 = math.log(g0 / (1 - g0)) / beta_r
    Q = [[0.0, q0] for _ in range(n)]          # P(go) = sigmoid(beta_r (Qy - Qg)) = g0
    tg_r = tg_h = ch = cr = cnt_r = cnt_h = 0.0
    for t in range(rounds):
        order = list(range(n))
        rng.shuffle(order)
        acts = [False] * n
        for i in range(n):
            if robot[i]:
                pg = _sig(beta_r * (Q[i][1] - Q[i][0]))
                acts[i] = rng.random() < pg
                if t >= burn:
                    tg_r += pg
            else:
                acts[i] = rng.random() < go_prob(sum(mem[i]) / m, beta, k, w, d)
        for a in range(0, n, 2):
            i, j = order[a], order[a + 1]
            for x, y in ((i, j), (j, i)):
                c = k if acts[x] and acts[y] else (0.0 if acts[x] else (w if acts[y] else d))
                if robot[x]:
                    act = 0 if acts[x] else 1
                    Q[x][act] += alpha * (c - Q[x][act])
                if t >= burn:
                    if robot[x]:
                        cr += c
                        cnt_r += 1
                    else:
                        ch += c
                        cnt_h += 1
                        tg_h += acts[x]
                mem[x].pop(0)
                mem[x].append(acts[y])
    g = tg_r / cnt_r if cnt_r else float("nan")
    return {"g": g, "p_h": tg_h / cnt_h, "cost_r": cr / cnt_r if cnt_r else float("nan"),
            "cost_h": ch / cnt_h, "cost_all": (cr + ch) / (cnt_r + cnt_h)}
