# sim2real-inference m7h: for the next run

- Result: with a bet cap of 0.99/m, the twin-assisted betting interval (exact twin mean) beats real-only betting on 20/21 pendulum pairs at n = 240 and 960. Reverses the "never tighter" claim of m3c to m7g, which holds only for empirical Bernstein and the capped bet.
- Next (m7i): make it valid, with the twin mean bounded from a finite pool (N = 500 and 4,000; union bound or joint capital), and see if the win survives. Then test on real paired data if any becomes reachable (arXiv, SIMPLER episode logs were not: proxy 403).
- Run it: `experiments/m7h_uncapped_betting/uncapped.py 300` (about 8 min with 4 processes; use run_in_background).
- Paper abstract and a new m7h paragraph were corrected; check any further "never" wording against this.
