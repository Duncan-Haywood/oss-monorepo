"""Public-goods game with peer punishment (Fehr and Gaechter 2000 protocol).

Groups of n, endowment E = 20, return per token m = 1.6 / n (0.4 at n = 4, the published
setting), so full contribution is socially best and zero is the dominant strategy.
Punishment stage: a punisher pays 1 token to remove 3 from a target (the published ratio).
Agent types follow the conditional-cooperation finding (Fischbacher, Gaechter and Fehr 2001):
free riders, and conditional cooperators who give `lam` times the others' last mean
(lam < 1 is the self-serving shortfall that makes contributions decay).
`react` is how many tokens a punished agent adds next round per 4 tokens of shortfall it was
punished for (0 = no behavioural response); it is the unmeasured link, so it is swept. Type shares, lam
and the punishment rule are assumptions, swept in experiments/commons/run.py.
"""
import numpy as np

E = 20


def play(n_agents, group, rounds, rng, free=0.3, lam=0.85, punish=False, punisher=0.5,
         stranger=False, react=0.0, noise=2.0, sanction_cost=1.0, sanction_hit=3.0, pooled=False):
    """Returns (mean contribution per round, mean net payoff per round)."""
    free_rider = rng.random(n_agents) < free
    punisher_t = rng.random(n_agents) < punisher
    m = 1.6 / group
    perm = np.arange(n_agents)
    belief = np.full(n_agents, 12.0)   # first-round mean near the ~10 of 20 reported for round 1
    hit = np.zeros(n_agents)           # points removed from each agent last round
    contrib_hist, pay_hist = [], []
    for _ in range(rounds):
        if stranger:
            rng.shuffle(perm)
        g = np.clip(lam * belief + rng.normal(0, noise, n_agents), 0, E)
        g = np.where(free_rider, np.clip(rng.normal(1, noise, n_agents), 0, E), g)
        g = np.round(g)
        g = np.where(hit > 0, np.maximum(g, np.minimum(E, g + react * hit / sanction_hit * 4)), g)
        hit = np.zeros(n_agents)
        pay = np.zeros(n_agents)
        cont = np.zeros(n_agents)
        for s in range(0, n_agents, group):
            idx = perm[s:s + group]
            tot = g[idx].sum()
            pay[idx] = E - g[idx] + m * tot
            cont[idx] = (tot - g[idx]) / (group - 1)
            if punish and pooled:
                # institution: one fine per member below the group mean (not one per punisher),
                # same schedule (tokens = shortfall/4, cap 10, 3 removed per token), the cost of
                # running it split equally across the whole group (a tax, Sigmund et al. 2010 style)
                short = np.maximum(g[idx].mean() - g[idx], 0.0)
                tok = np.minimum(short / 4.0, 10.0)
                pun = tok * sanction_hit
                pay[idx] += -np.minimum(pun, pay[idx]) - tok.sum() * sanction_cost / group
                hit[idx] = pun
            elif punish:
                pun = np.zeros(group)
                cost = np.zeros(group)
                for a, i in enumerate(idx):
                    if not punisher_t[i]:
                        continue
                    for b, j in enumerate(idx):
                        gap = g[i] - g[j]
                        if a != b and gap > 0:
                            p = min(gap / 4.0, 10.0)   # tokens spent grow with the shortfall
                            cost[a] += p * sanction_cost
                            pun[b] += p * sanction_hit
                pay[idx] += -cost - np.minimum(pun, pay[idx])
                hit[idx] = pun
        # beliefs: the others' mean this round, tempered by a person's own memory
        belief = cont
        contrib_hist.append(g.mean())
        pay_hist.append(pay.mean())
    return np.array(contrib_hist), np.array(pay_hist)
