"""Experiments for data-valuation-replication. All numbers are exact (no sampling)."""
from data_valuation_replication import *

n, a, tau = 9, 1.0, 1.0
KS = (1, 2, 3, 5, 10, 50, 200)
print(f"Setup: n={n} honest others (precision {tau}), replicator precision {a}, prior precision 1. Pot(k=1) = {value(1, n, a, tau, 1):.4f}")

print("\nE1. Replicator's total Shapley payment vs number of copies k, by copy correlation rho")
print("k        " + "".join(f"{k:>9d}" for k in KS))
for rho in (0.0, 0.5, 1.0):
    print(f"rho={rho:<4}" + "".join(f"{group_shapley(k, n, a, tau, rho):9.4f}" for k in KS))
print("share of pot (rho=1): " + " ".join(f"{share(k, n, a, tau, 1.0):.3f}" for k in KS))
print("share of pot (rho=0): " + " ".join(f"{share(k, n, a, tau, 0.0):.3f}" for k in KS))
print(f"stand-alone limit g(a) = {standalone_limit(a):.4f}; gain factor at k=200 (rho=1) = {group_shapley(200, n, a, tau, 1.0) / group_shapley(1, n, a, tau, 1.0):.2f}x; limit {standalone_limit(a) / group_shapley(1, n, a, tau, 1.0):.2f}x")

print("\nE2. Limit gain factor g(a)/phi_1 by number of honest others n (rho=1)")
for nn in (1, 3, 9, 30, 100):
    print(f"n={nn:<4} phi_1={group_shapley(1, nn, a, tau, 1.0):.4f} limit={standalone_limit(a):.4f} ratio={standalone_limit(a) / group_shapley(1, nn, a, tau, 1.0):.2f}")

print("\nE3. Leave-one-out total payment to the replicator")
print("k        " + "".join(f"{k:>9d}" for k in KS))
for rho in (0.0, 1.0):
    print(f"rho={rho:<4}" + "".join(f"{group_loo(k, n, a, tau, rho):9.4f}" for k in KS))
pot = value(1, n, a, tau, 1.0)
print(f"LOO total distributed at k=1: {(n + 1) * group_loo(1, n, a, tau, 1.0):.4f} of pot {pot:.4f} ({(n + 1) * group_loo(1, n, a, tau, 1.0) / pot:.1%})")

print("\nE4. Optimal number of copies when each extra copy costs c (rho=1, kmax=200)")
for c in (0.0, 0.001, 0.005, 0.01, 0.02, 0.054, 0.06):
    k = best_k(n, a, tau, 1.0, c, kmax=200)
    print(f"c={c:<6} best k={k:<4} net gain over k=1: {group_shapley(k, n, a, tau, 1.0) - c * (k - 1) - group_shapley(1, n, a, tau, 1.0):.4f}")
print(f"marginal value of the first extra copy (break-even cost) = {break_even_cost(2, n, a, tau, 1.0):.4f}")

print("\nE5. Cost of the dedup fix: two honest contributors with genuinely independent data (rho=0) collapsed into one cluster")
pair = group_shapley(2, n, a, tau, 0.0)
print(f"paid separately: {pair:.4f}; collapsed (one cluster, pays like k=1 at rho=0 stand-in): {group_shapley(1, n, a, tau, 0.0):.4f}; underpayment {1 - group_shapley(1, n, a, tau, 0.0) / pair:.1%}")

print("\nE6. Attack against a mis-estimated correlation: evaluator assumes rho_hat, truth is rho=1")
print("The payment uses value with rho_hat; the attacker submits k=10 copies.")
for rh in (0.0, 0.25, 0.5, 0.75, 0.9, 1.0):
    print(f"rho_hat={rh:<5} paid {group_shapley(10, n, a, tau, rh):.4f}  (honest k=1 gets {group_shapley(1, n, a, tau, rh):.4f}; true k=1 benchmark {group_shapley(1, n, a, tau, 1.0):.4f})")
