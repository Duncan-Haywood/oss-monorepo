"""Milestone 6j: does the analytic spare-pack rule give the waiting-time tail, and so 6c's p95 <= 300 s count?

6i's rule gives the share of orders that wait at all. 6c sized the hub on a different criterion, p95 wait
<= 300 s, which needs the waiting-time distribution. Same hub (8 pads, 8 chargers, D = 2520 s charge for
20-90% at 1C, T_PAD = 180 s swap+load), same no-feedback model as 6i.

Derivation (no feedback, no pad waits). Depleted packs reach the chargers T_PAD after their order and are
charged FIFO; with deterministic D, packs leave the chargers in the order they arrived, so the pool of S
packs is used cyclically: order n gets the pack freed by order n - S, ready at
    R_{n-S} = t_{n-S} + T_PAD + Wq_{n-S} + D,
and waits W_n = max(0, T_PAD + D + Wq_{n-S} - H_S), with H_S = t_n - t_{n-S}.
For FIFO M^X/D/c, customer n departs at max(t_n, Dep_{n-c}) + D, so V_n = Dep_{n-c} - t_n obeys the Lindley
recursion V_{n+c} = max(V_n, 0) + D - (t_{n+c} - t_n): the charger wait is that of a single-server queue with
deterministic service D and Erlang-(c/k) gaps (batches of k, k dividing c). Wq_{n-S} depends only on arrivals
up to n - S and H_S only on later gaps, so they are independent; for order position p (0..k-1) in its batch,
H_S ~ Gamma(ceil((S - p)/k), batch rate). Both steps are "add a constant, subtract a sum of exponentials,
clip at 0", which on a 10 s grid costs O(grid) per exponential: stdlib, no simulation.

Predictions (written before the first run):
 (1) Consistency: P(W > 0) from this tail equals 6i's wait share (a different derivation of the same model)
     within 0.003 at every S tested.
 (2) Smallest S with p95 wait <= 300 s: analytic within 1 pack of the simulator (6c's sim logic as copied in
     6i, 5 seeds x 40,000 orders, every S on a 1-pack grid) for k = 1, 2, 4 at 70% and 85% of the
     11.4 flights/h charger limit, and for k = 8 at 70%.
 (3) Where the simulated P(W > 300 s) is between 0.01 and 0.3 and S >= E[N_out] + 2, the analytic value is within
     0.01 of it.
 (4) The analytic p95 count is never above the simulated one (the rule errs optimistic, as 6i found).
 (5) Validation of the charger queue: analytic mean Wq of M^X/D/c within 3% of a direct FIFO simulation of the
     charger queue alone (5 seeds x 200,000 orders) in all 8 cases.
Inputs as 6c (vendor swap and charge figures, see run.py); batch size swept, not measured. Preliminary.
"""
