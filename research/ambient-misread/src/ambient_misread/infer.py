"""Choosing a delivery mode when the urgency label is noisy. Stylised."""
import numpy as np
from .sim import MODES, URGENCY, utilities

CLASSES = tuple(URGENCY)  # low, normal, high
PRIOR = np.array([URGENCY[u][2] for u in CLASSES])


def confusion(acc, kind="uniform"):
    """C[t, o] = P(observed label o | true class t). 'uniform': errors split evenly over the other
    classes. 'adjacent': errors only to a neighbouring class (low<->normal<->high); the middle class
    splits its errors evenly and the end classes put all of them on the middle."""
    n = len(CLASSES)
    C = np.zeros((n, n))
    for t in range(n):
        C[t, t] = acc
        if kind == "uniform":
            others = [o for o in range(n) if o != t]
        else:
            others = [o for o in (t - 1, t + 1) if 0 <= o < n]
        for o in others:
            C[t, o] = (1 - acc) / len(others)
    return C


def posterior(C, prior=PRIOR):
    """P[o, t] = P(true t | observed o), by Bayes' rule (needs the prior and the confusion matrix)."""
    joint = prior[:, None] * C            # t, o
    return (joint / joint.sum(axis=0, keepdims=True)).T


def _u_table(p, ctx):
    return np.array([[utilities(p, *ctx, t)[m] for m in MODES] for t in CLASSES])  # t, m


def policy_values(p, ctx, C, prior=PRIOR):
    """Expected utility per message in one context for four policies, scored under the true
    classes, the prior and the confusion matrix C:
    oracle (knows t), blind (ignores the label), naive (acts on the label as if correct),
    bayes (acts on the label with the posterior)."""
    U = _u_table(p, ctx)
    oracle = float((prior * U.max(axis=1)).sum())
    blind_m = int(np.argmax(prior @ U))
    blind = float(prior @ U[:, blind_m])
    post = posterior(C, prior)
    naive = bayes = 0.0
    for o in range(len(CLASSES)):
        w = prior * C[:, o]                       # P(t, o)
        naive_m = int(np.argmax(U[o]))            # best mode if the label were true (ties: first, quieter)
        bayes_m = int(np.argmax(post[o] @ U))
        naive += float(w @ U[:, naive_m])
        bayes += float(w @ U[:, bayes_m])
    return {"oracle": oracle, "bayes": bayes, "naive": naive, "blind": blind}


def mean_values(p, ctxs, C, prior=PRIOR):
    vals = [policy_values(p, c, C, prior) for c in ctxs]
    return {k: float(np.mean([v[k] for v in vals])) for k in vals[0]}


def simulate_policy(p, ctx, C, policy, n, rng, prior=PRIOR):
    """Monte Carlo mean utility of a policy on n messages: draw t from the prior, o from C[t],
    pick the mode from the policy, and score the *expected* utility of that mode under the true t."""
    U = _u_table(p, ctx)
    post = posterior(C, prior)
    t = rng.choice(len(CLASSES), n, p=prior)
    cum = C[t].cumsum(axis=1)
    o = (rng.random(n)[:, None] > cum).sum(axis=1).clip(max=len(CLASSES) - 1)
    if policy == "oracle":
        m = U.argmax(axis=1)[t]
    elif policy == "naive":
        m = U.argmax(axis=1)[o]
    elif policy == "bayes":
        m = np.array([int(np.argmax(post[k] @ U)) for k in range(len(CLASSES))])[o]
    else:
        m = np.full(n, int(np.argmax(prior @ U)))
    return float(U[t, m].mean())
