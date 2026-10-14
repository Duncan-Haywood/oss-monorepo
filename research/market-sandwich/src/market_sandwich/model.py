"""Sandwich attacks on a binary LMSR. State q = (yes - no) shares, price p = sigmoid(q/b)."""
import math

__all__ = ["cost", "price", "trade_cost", "sandwich_profit", "mixed_difference", "victim_limit",
           "x_star", "attack", "fee_threshold", "batch_pro_rata_profit", "batch_best_x",
           "first_order_drift_limit", "optimal_tolerance", "fail_prob", "expected_loss",
           "best_tolerance_numeric", "shuffle_expected_profit"]


def cost(q, b):
    """LMSR cost C(q) = b ln(1+e^{q/b}), computed stably."""
    z = q / b
    return b * (max(z, 0.0) + math.log1p(math.exp(-abs(z))))


def price(q, b):
    return 1.0 / (1.0 + math.exp(-q / b))


def trade_cost(q, v, b):
    """Cost of buying v YES shares at state q."""
    return cost(q + v, b) - cost(q, b)


def mixed_difference(q, x, v, b):
    """C(q+x+v) - C(q+x) - C(q+v) + C(q): attacker profit (fee-free) and victim's extra cost."""
    return cost(q + x + v, b) - cost(q + x, b) - cost(q + v, b) + cost(q, b)


def sandwich_profit(q, x, v, b):
    """Attacker buys x, victim buys v, attacker sells x. Fee-free profit."""
    return mixed_difference(q, x, v, b)


def victim_limit(q, v, b, eps):
    """Victim's maximum payment: (1+eps) times the cost at the state it observed."""
    return (1 + eps) * trade_cost(q, v, b)


def x_star(q, v, b, eps):
    """Largest front-run x keeping the victim's cost within its limit; inf if the limit is >= v."""
    L = victim_limit(q, v, b, eps)
    if L >= v:
        return math.inf
    K = math.exp(L / b)
    E = math.exp(v / b)
    u = (K - 1.0) / (E - K)  # u = e^{(q+x)/b}
    return b * math.log(u) - q


def attack(q, v, b, eps):
    """Optimal sandwich under slippage tolerance eps. Returns dict; profit = eps * C0 exactly (fee-free)."""
    xs = x_star(q, v, b, eps)
    c0 = trade_cost(q, v, b)
    if xs <= 0 or math.isinf(xs):
        return dict(x=max(xs, 0.0), profit=0.0 if xs <= 0 else math.inf, c0=c0, capital=0.0, buy=0.0, sell=0.0)
    buy = cost(q + xs, b) - cost(q, b)
    sell = cost(q + xs + v, b) - cost(q + v, b)
    return dict(x=xs, profit=sell - buy,
                c0=c0, capital=buy, buy=buy, sell=sell)


def fee_threshold(q, v, b, eps):
    """Proportional fee phi (on buy cost and sell proceeds) that makes the optimal sandwich break even."""
    a = attack(q, v, b, eps)
    return a["profit"] / (a["buy"] + a["sell"]) if a["x"] > 0 else 0.0


def batch_pro_rata_profit(q, x, v, b):
    """Batch of attacker buy x and victim buy v, each charged the batch's average price; the
    attacker unwinds x alone in the next batch. Profit = revenue - cost."""
    Q = q + x + v
    paid = x / (x + v) * (cost(Q, b) - cost(q, b))
    got = cost(Q, b) - cost(q + v, b)
    return got - paid


def batch_best_x(q, v, b, grid=4000, xmax_mult=40.0):
    best = (0.0, 0.0)
    for i in range(1, grid + 1):
        x = xmax_mult * b * i / grid
        pr = batch_pro_rata_profit(q, x, v, b)
        if pr > best[1]:
            best = (x, pr)
    return best


def first_order_drift_limit(p, b, eps):
    """First-order net flow (shares) that pushes the victim's cost past (1+eps): eps*b/(1-p)."""
    return eps * b / (1 - p)


def _phi(z):
    return math.exp(-0.5 * z * z) / math.sqrt(2 * math.pi)


def optimal_tolerance(p, b, sigma, c0, G):
    """First-order optimum of  eps*c0 + G*P(drift > eps*b/(1-p)),  drift ~ N(0, sigma^2)."""
    s = sigma * (1 - p) / b           # sd of drift in units of eps
    r = G / (c0 * s * math.sqrt(2 * math.pi))
    if r <= 1:
        return 0.0
    return s * math.sqrt(2 * math.log(r))


def _Q(z):
    return 0.5 * math.erfc(z / math.sqrt(2))


def fail_prob(q, v, b, eps, sigma, n=2001):
    """Exact P(victim's cost after drift d ~ N(0,sigma^2) exceeds the limit), by quadrature over d."""
    L = victim_limit(q, v, b, eps)
    lo, hi = -8 * sigma, 8 * sigma
    h = (hi - lo) / (n - 1)
    tot = 0.0
    for i in range(n):
        d = lo + i * h
        w = _phi(d / sigma) / sigma * h * (0.5 if i in (0, n - 1) else 1.0)
        if trade_cost(q + d, v, b) > L:
            tot += w
    return tot


def expected_loss(q, v, b, eps, sigma, G, attacked=True):
    c0 = trade_cost(q, v, b)
    return (eps * c0 if attacked else 0.0) + G * fail_prob(q, v, b, eps, sigma)


def best_tolerance_numeric(q, v, b, sigma, G, attacked=True, grid=600, emax=1.0):
    best = (0.0, expected_loss(q, v, b, 0.0, sigma, G, attacked))
    for i in range(1, grid + 1):
        e = emax * i / grid
        l = expected_loss(q, v, b, e, sigma, G, attacked)
        if l < best[1]:
            best = (e, l)
    return best


def shuffle_expected_profit(q, x, v, b):
    """Attacker submits buy(x) and sell(x); victim buys v; sequencer orders the three uniformly at random.
    A sell that lands before its buy is void (attacker holds nothing). Expected fee-free profit."""
    import itertools
    tot = 0.0
    perms = list(itertools.permutations(["B", "V", "S"]))
    for perm in perms:
        state, held, pnl = q, 0.0, 0.0
        for o in perm:
            if o == "B":
                pnl -= cost(state + x, b) - cost(state, b); state += x; held += x
            elif o == "V":
                state += v
            elif held > 0:
                pnl += cost(state, b) - cost(state - x, b); state -= x; held -= x
        if held > 0:  # unsold inventory marked at the state price value ... liquidate at own-path cost
            pnl += cost(state, b) - cost(state - held, b)
        tot += pnl
    return tot / len(perms)
