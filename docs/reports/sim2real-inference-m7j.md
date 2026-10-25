# sim2real-inference m7j: for the next run

- Result: valid finite-pool betting interval, pendulum, n = 960: N = 20,000 wins 20/21 (median ratio 0.84 to 0.86); N = 4,000 wins 7/21; split f = 0.1 vs 0.5 matters only at n = 240.
- Next (m7k): cart-pole at N = 20,000 / 100,000; a twin pool of >4,000 distinct contexts (the 20,000 draws here are resampled from the 4,000-pool); real paired data is still the main gap.
- Run it: `experiments/m7j_n_sweep/n_sweep.py 200` (about 10 min; run_in_background).
- Paper: m7i/m7j paragraph and abstract updated.
