# Sparse outer synchronisation: error feedback removes the bandwidth penalty on the noise floor, and caps the speed at √(1−p)

*Stylised: one quadratic mode at a time, independent Gaussian gradient noise, independent Bernoulli sparsification of the pseudo-gradient, identical workers. Pure Python; every formula is checked against a literal simulation (`tests/`, `experiments/results.txt`).*

## Question
In DiLoCo-style training the outer step moves the model along the averaged pseudo-gradient, and that vector is what crosses the wire. Communication can be cut by sending only a fraction `p = k/d` of its coordinates. Sending a random subset rescaled by `1/p` (unbiased) is simple; letting each worker keep a memory of what it did not send and add it to the next message (error feedback) is the standard fix. What does each cost in stationary noise floor, in the largest stable outer step, and in speed, and how does the answer change with the number of workers `N`?

## Model
Coordinates of a diagonal quadratic are modes, and modes decouple, so the total excess loss is the sum over modes of `(a/2)·Var x` and only each coordinate's own mask sequence matters (rand-`k` and independent Bernoulli give identical results). One mode has outer curvature `s` and worker noise variance `V` (from `noisy-local-sgd`: `s = 1−(1−ηa)^H`, `V = η²σ²(1−q^{2H})/(1−q²)`). Worker `i` has pseudo-gradient `g_i = s x + n_i`; it transmits with probability `p` each round.

- **Unbiased:** `x' = x − α · (1/N) Σ b_i g_i / p`.
- **Error feedback:** worker sends `C_i = b_i P_i`, `P_i = e_i + g_i`, keeps `e_i' = P_i − C_i`; `x' = x − α · (1/N) Σ C_i`.

## Exact results
Let `w = 1/p − 1`.
1. **Unbiased: `Var x = α V (1+w) / (N s (2 − αs(1+w/N)))`, stable iff `αs(1+w/N) < 2`.** The noise floor is `1/p` times the uncompressed floor at small steps: bandwidth is bought with noise one for one (2.001, 4.008, 10.06, 20.2 at `p` = 0.5, 0.25, 0.1, 0.05, `α=0.01`).
2. **Error feedback: the second moments `E x², E x e_i, E e_i², E e_i e_j` close on a four-dimensional linear recursion**, solved in closed form (`floor_ef_closed`; it matches the moment solve to 1e-9 and simulation to 1.4%). For one worker `Var x = αV / (s(2 − αs(2/p − 1)))`, stable iff `αs < 2p/(2−p)` (0.667 at `p=0.5`, 0.105 at `p=0.1`).
3. **The bandwidth penalty vanishes at small steps.** Against the uncompressed floor, error feedback costs `1 + αs·w` to first order, for every `N` (at `α=0.01`: 1.010, 1.030, 1.091, 1.194 against 2.0, 4.0, 10.1, 20.2). The reason is that the virtual iterate `y = x − α·mean(e)` follows uncompressed SGD exactly, `y' = y − α g(x)`, so nothing is lost, only delayed; the `αs·w` is the price of evaluating gradients at `x` rather than `y`.
4. **The price is speed.** The mean of `(x, e)` obeys `λ² − (1−αsp+q)λ + q = 0`, `q = 1−p`: the determinant is `q` for every step size, so the contraction rate is at least `√(1−p)`, reached exactly for `αs ∈ ((1−√q)²/p, (1+√q)²/p)`, whatever `N` (0.866 at `p=0.25`, 0.949 at `p=0.1`, 0.990 at `p=0.02`). Error feedback is second-order, heavy-ball-like dynamics with damping set by the bandwidth. A run needs on the order of `1/p` rounds before the compression has been paid off.
5. **Stability limits are not ordered.** For one worker error feedback halves the usable step (0.667 against 1.0 at `p=0.5`); with many workers it widens (`N=32`: 4.8, 5.6, 3.1 against 1.94, 1.83, 1.56 at `p` = 0.5, 0.25, 0.1) because averaged independent memories smooth the update.
6. **At a target rate the picture is clean.** With `N=8`, `p=0.25`, floor at mean rate ≤ 0.95: full 0.0032, unbiased 0.0130, error feedback 0.0030; at ≤ 0.90: 0.0066, 0.0270, 0.0052; at ≤ 0.80 error feedback cannot get there (its limit is 0.866) while unbiased pays 0.058.
7. **Over a horizon** (spectrum `a = 1, 0.3, 0.1, 0.03`, `N=16`, `H=8`, best outer step, exact loss after `T` rounds): at `T=400` error feedback is 0.39, 0.24 and 0.17 times the unbiased loss at `p` = 0.25, 0.1, 0.03. At `T=100` and `p=0.03` the advantage is gone (0.95): the horizon is shorter than `1/p` and the speed cap binds.

## Limitations
One mode, Bernoulli masks (a data-dependent selection such as top-`k` is not covered: it correlates the mask with the state), Gaussian noise only through its variance, no outer momentum, no quantisation (only sparsification), no straggling or dropped workers (see `partial-participation`), and the closed form for `N>1` is an algebraic solution rather than a simple expression. The `√(1−p)` law concerns the mean; the second moment has its own limit (item 5).

## Relevance
For bandwidth-limited decentralised training: never send rescaled random subsets when a memory is affordable, since it costs `1/p` in noise; with error feedback pick `α` at the small-step end of the band and budget at least `~1/p` rounds; with a single worker the largest stable `αs` falls from 2 to `2p/(2−p)`, with many workers the limit relaxes. Companion to `noisy-local-sgd`, `outer-momentum`, `partial-participation` and `local-sgd-bias`.
