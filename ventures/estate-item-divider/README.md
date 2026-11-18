# Estate Item Divider

Free, browser-only tool for executors and families dividing an estate's
personal property (the piano, the clock, the ring) between heirs. Every heir
privately writes down what each item is worth to them; the tool divides the
items so that nobody can say they were cheated.

**Live tool:** https://marisstella.app/estate-item-divider/

Two methods:

- **Sealed bids, cash evens it up.** Each item goes to the heir who values it
  most. With equal shares, cash payments are set so that **no heir would rather
  have another heir's items and cash** (envy-free), and among such payments the
  worst-off heir's margin above a fair 1/n share is as large as possible. With
  unequal shares (a will saying 50/25/25) it is Knaster's sealed-bid procedure
  with percentages: every heir gets their percentage of the estate by their own
  values plus their percentage of the surplus. Estate cash, if any, is split by
  share and can absorb what an heir owes.
- **Items only, no cash.** The division that maximises (weighted) Nash welfare,
  the product of each heir's value raised to their share. It is Pareto-optimal
  and envy-free up to one item (weighted EF1 for unequal shares).

Also: up to 8 heirs and 80 items, a blank **bid sheet** CSV to send round and
import back, copy as text, CSV export, save and load as JSON.

Open `index.html` over any static server (it is an ES module page). No build
step, no dependencies. `node --test *.test.mjs` runs the suite.

## How the engine works (`calc.mjs`)

- **Envy-free payments.** Envy-freeness with money is a system of difference
  constraints `p_i - p_k >= v_i(X_k) - v_i(X_i)`. It has no positive cycle
  because highest-bidder allocation maximises total value, so longest paths
  (max-plus Floyd-Warshall) give the least solution above a floor of
  `V_i/n + t - v_i(X_i)`. That least solution moves one-for-one with `t`, so
  the largest `t` with budget balance has a closed form, `t* = -sum p*(0) / n`.
  Envy-free and budget-balanced implies proportional, so `t* >= 0`.
- **Maximum Nash welfare.** Local search (moves and swaps) from a weighted
  picking sequence, a greedy start and 24 random greedy orders, then an exact
  branch and bound to prove the answer. The bound is the lesser of an
  optimistic "everyone gets every remaining item" bound and a **Lagrangian dual
  bound with market prices** taken from the incumbent
  (`pi_j = max_i w_i v_ij / U_i`); each heir's inner problem is solved greedily
  by value per unit price. If the proof runs out of its node budget the page
  says "best found"; if the result were ever not (weighted) EF1 it falls back
  to the weighted picking sequence, which always is (Chakraborty et al. 2021).

Measured 2026-11-13 on this machine (random values, 10 estates per size):

| Heirs x items | Proven optimal, uniform values | Proven, correlated values | Mean time |
|---|---|---|---|
| 3 x 15 | 10/10 | 10/10 | under 1 ms |
| 4 x 20-25 | 10/10 | 10/10 | 1-2 ms |
| 5-6 x 40 | 10/10 | 10/10 | 7 ms |
| 6 x 60 | - | 10/10 | 24 ms |
| 8 x 80 | 7/10 | 8/10 | 250 ms |

Before the dual bound, the same budget proved 0 of 10 at 4 x 20. Local search
alone matched a brute-force optimum on 400 of 400 small random estates (2-4
heirs, 3-10 items); the fallback to the picking sequence was never needed in
these runs.

## Tests

- `calc.test.mjs` - worked example; 500 random estates (payments sum to zero,
  envy-free, margin is the worst-off heir's excess, cents still balance);
  random perturbation search finds no envy-free balanced payment with a better
  worst-off margin; Knaster identities on 300 weighted estates; MNW against
  brute force (equal and weighted) and the dual bound's validity; weighted
  picking sequence is WEF1 on 400 estates; 8 x 80 runtime; bid sheet round trip;
  CSV formula injection.
- `page.test.mjs` - disclaimers, JSON-LD, labels, no network calls, and the
  guide's three worked tables recomputed from the engine.
- `usage.test.mjs` - local-only counters and the opt-out.

**No warranty.** Free and as-is; arithmetic on the numbers you type, not legal,
tax, financial or appraisal advice. The will, the executor, any court order and
local law decide how an estate is distributed.

**Privacy.** Everything runs in your browser; names, items and values are never
uploaded. Anonymous feature counts stay in local storage and can be switched off.

MIT licence, see `LICENSE`.

## References

- B. Knaster (1946), sealed-bid procedure; H. Steinhaus, "The problem of fair
  division", Econometrica 16 (1948).
- D. Halpern and N. Shah, "Fair division with subsidy", SAGT 2019 (envy graph
  and envy-freeable allocations).
- I. Caragiannis et al., "The unreasonable fairness of maximum Nash welfare",
  EC 2016.
- M. Chakraborty, A. Igarashi, W. Suksompong and Y. Zick, "Weighted
  envy-freeness in indivisible item allocation", ACM TEAC 2021.
