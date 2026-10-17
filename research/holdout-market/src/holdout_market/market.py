"""A model-improvement market with a hidden holdout. Stdlib only.

Contributors submit parameter vectors of a logistic model. The mechanism pays the *decrease in holdout log loss*
(a proper scoring rule, clipped so the loss lies in [0, ln(1/eps)]) relative to the current published model.

mode="raw":    accept a submission iff it lowers the holdout loss; pay B * (decrease).
mode="ladder": Blum-Hardt style: accept iff it beats the best published loss by more than eta, publish the loss
               rounded to a multiple of eta, pay B * (published decrease).
"""
import math
import random

EPS = 1e-3


def sigmoid(z):
    return 1.0 / (1.0 + math.exp(-z)) if z >= 0 else math.exp(z) / (1.0 + math.exp(z))


def predict(theta, x):
    p = sigmoid(sum(t * v for t, v in zip(theta, x)))
    return min(1 - EPS, max(EPS, p))


def log_loss(theta, X, y):
    tot = 0.0
    for x, yi in zip(X, y):
        p = predict(theta, x)
        tot -= math.log(p if yi else 1 - p)
    return tot / len(X)


def make_data(theta_star, n, rng):
    d = len(theta_star)
    X = [[rng.gauss(0, 1) for _ in range(d)] for _ in range(n)]
    y = [1 if rng.random() < sigmoid(sum(t * v for t, v in zip(theta_star, x))) else 0 for x in X]
    return X, y


def population_loss(theta, pop):
    """Loss on a large fresh sample standing in for the population."""
    return log_loss(theta, *pop)


def sgd(theta, X, y, lr=0.1, epochs=5, rng=None):
    theta = list(theta)
    idx = list(range(len(X)))
    rng = rng or random.Random(0)
    for _ in range(epochs):
        rng.shuffle(idx)
        for i in idx:
            g = sigmoid(sum(t * v for t, v in zip(theta, X[i]))) - y[i]
            for j, v in enumerate(X[i]):
                theta[j] -= lr * g * v
    return theta


class Market:
    def __init__(self, theta0, holdout, mode="raw", eta=0.02, budget_scale=1.0):
        assert mode in ("raw", "ladder")
        self.mode, self.eta, self.B = mode, eta, budget_scale
        self.X, self.y = holdout
        self.theta = list(theta0)
        self.loss0 = log_loss(theta0, self.X, self.y)
        self.pub = self._round(self.loss0)  # published (possibly rounded) loss
        self.pub0 = self.pub
        self.paid = 0.0
        self.queries = 0
        self.accepted = 0

    def _round(self, v):
        return round(v / self.eta) * self.eta if self.mode == "ladder" else v

    def submit(self, theta):
        """Returns payment; updates the published model if accepted."""
        self.queries += 1
        L = log_loss(theta, self.X, self.y)
        gate = self.eta if self.mode == "ladder" else 0.0
        if L < self.pub - gate:
            new = self._round(L)
            pay = self.B * (self.pub - new)
            self.pub, self.theta = new, list(theta)
            self.paid += pay
            self.accepted += 1
            return pay
        return 0.0

    def budget_bound(self):
        """Total payout never exceeds B * (published loss at the start): telescoping, loss >= 0."""
        return self.B * self.pub0


def hill_climb_attack(market, k, sigma, rng):
    """Adversary with no data: propose theta + sigma*noise around the published model, keep what gets paid."""
    for _ in range(k):
        cand = [t + sigma * rng.gauss(0, 1) for t in market.theta]
        market.submit(cand)
    return market
