# sim2real-inference m7i: for the next run

- Result: with a finite twin pool (union bound, alpha split 0.025/0.025) the twin-assisted betting interval beats real-only betting on 8/21 pendulum pairs at n = 960 with N = 4,000 twin runs (best ratio 0.80, median 1.05), on 0/21 with N = 500, and on 0/21 cart-pole pairs. 7h's exact-mean win (20/21) was mostly the exact-mean assumption. H7i-i (at least 10 pairs) refuted narrowly.
- Next (m7j): sweep N up to 100,000, uneven alpha split, joint capital; then real paired data if reachable.
- Run it: `/usr/bin/python3.13 experiments/m7i_finite_twin/finite_twin.py 300` (about 10 min, 4 processes; use run_in_background). When waiting on it, bracket the first letter of the process pattern, or the wait matches itself.
- Check any "twin never helps" or "twin helps" wording in `paper/` against this: the claim is conditional on N and rho.
