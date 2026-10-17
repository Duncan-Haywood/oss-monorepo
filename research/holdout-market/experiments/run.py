"""Experiments for holdout-market. Run: PYTHONPATH=src python3 experiments/run.py"""
import random
import statistics as st
from holdout_market import Market, make_data, sgd, hill_climb_attack, population_loss

D, NH, SEEDS = 20, 100, 8


def world(seed):
    rng = random.Random(seed)
    ts = [rng.gauss(0, 1) for _ in range(D)]
    return rng, ts, make_data(ts, NH, rng), make_data(ts, 5000, rng)


def honest_phase(rng, ts, hold, mode, eta, n_contrib=10, shard=60):
    m = Market([0.0] * D, hold, mode=mode, eta=eta)
    for _ in range(n_contrib):
        X, y = make_data(ts, shard, rng)
        m.submit(sgd(m.theta, X, y, lr=0.05, epochs=3, rng=rng))
    return m


print("[1] honest phase: 10 contributors, 60 samples each, holdout n=%d. paid = B*(published loss drop); true = population drop" % NH)
print("    mode        eta   paid    true    gap(paid-true)")
for mode, eta in (("raw", 0), ("ladder", 0.02), ("ladder", 0.05), ("ladder", 0.1)):
    P, T = [], []
    for s in range(SEEDS):
        rng, ts, hold, pop = world(s)
        m = honest_phase(rng, ts, hold, mode, eta)
        P.append(m.paid)
        T.append(population_loss([0.0] * D, pop) - population_loss(m.theta, pop))
    print(f"    {mode:7s} {eta:6.2f} {st.mean(P):7.3f} {st.mean(T):7.3f} {st.mean(P)-st.mean(T):7.3f}")

print("\n[2] attack: zero-data adversary hill-climbs on paid feedback after honest phase (raw). sigma=0.05")
print("    mode   eta   k      paid   true_gain   overpayment(paid-true)  accepted")
for mode, eta in (("raw", 0), ("ladder", 0.02), ("ladder", 0.05)):
    for k in (100, 1000, 5000):
        P, T, A = [], [], []
        for s in range(SEEDS):
            rng, ts, hold, pop = world(s)
            base = honest_phase(rng, ts, hold, "raw", 0).theta
            m = Market(base, hold, mode=mode, eta=eta)
            hill_climb_attack(m, k, 0.05, rng)
            P.append(m.paid)
            T.append(population_loss(base, pop) - population_loss(m.theta, pop))
            A.append(m.accepted)
        print(f"    {mode:6s} {eta:5.2f} {k:5d} {st.mean(P):8.4f} {st.mean(T):10.4f} {st.mean(P)-st.mean(T):14.4f}  {st.mean(A):8.1f}")

print("\n[3] cost of the ladder on honest small contributors: contributors with 10 samples each (small real gains)")
for mode, eta in (("raw", 0), ("ladder", 0.02), ("ladder", 0.05)):
    P, T = [], []
    for s in range(SEEDS):
        rng, ts, hold, pop = world(s)
        m = honest_phase(rng, ts, hold, mode, eta, n_contrib=30, shard=10)
        P.append(m.paid)
        T.append(population_loss([0.0] * D, pop) - population_loss(m.theta, pop))
    print(f"    {mode:7s} eta={eta:4.2f} paid={st.mean(P):.3f} true_gain_of_final_model={st.mean(T):.3f}")
