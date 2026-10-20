# How many designs should a digital twin shortlist for real-plant verification?

*Stylised: Gaussian design values, one twin-truth correlation, even budget split; pure Python, every number is from `experiments/results.txt` (seeded Monte Carlo except where marked exact).*

## Question
A twin ranks `K` designs; a fixed real budget of `B` unit-variance trials can verify only some. What shortlist size `m` maximises the true value of the finally chosen design, and what part of the gain is due to the twin?

## Model
`v_i ~ N(0,1)`, `t_i = ρ v_i + √(1−ρ²)e_i`. The top `m` by `t` are measured with noise sd `√(m/B)`; the best measurement is chosen. At `m=1` the value is exactly `ρ c_K` since `E[v|t] = ρ t` and the top `t` has mean `c_K`. At `m=K` the twin is ignored.

## Results
See the README: value is single-peaked in `m`; the optimum falls from 8 to 2 as `ρ` rises 0.6 to 0.95 (`K=50`, `B=20`) and rises with `B`. A useless twin (`ρ=0`) still gains 0.12 over real-only through random subsetting alone, so the twin's own contribution is the gain above that baseline.

## Limitations
No sequential allocation, `ρ` assumed known, Gaussian values, no twin cost. Preliminary.

## References
Nelson, B. L., Swann, J., Goldsman, D., Song, W. (2001). Simple procedures for selecting the best simulated system when the number of alternatives is large. *Operations Research* 49(6), 950–963.
