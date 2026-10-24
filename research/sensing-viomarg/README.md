# sensing-viomarg: does marginalising old keyframes fix long-path drift in a visual-inertial smoother, and does IMU grade then matter?

**On 30 s synthetic paths, replacing the pinned oldest pose of the `sensing-vio` smoother by a Schur-complement (marginalisation) prior cut rms drift from 12.3 % to 2.5 % of path length at baseline IMU noise (8 paired seeds), and made IMU grade matter: 0.25× noise gave 2.1 %, 1× 2.5 %, 4× 6.5 %. With the pinned prior the three grades were indistinguishable (23.6, 12.3, 12.3 %, standard errors 5 to 7).** Produced with AI assistance (Claude). Follow-up to `sensing-vio` (track 15, `PROJECTS.md`); it builds on none of the CU Boulder groups. Planar and synthetic; **not run on EuRoC or any real data**.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/sensing-viomarg/

**Builds on.** [`sensing-vio`](../sensing-vio) (world, sensors, factors and its stated first next step). Marginalisation in sliding-window VIO: Leutenegger et al., OKVIS, *IJRR* 2015; Qin, Li and Shen, VINS-Mono, *IEEE T-RO* 2018; IMU preintegration: Forster et al., *IEEE T-RO* 2017. This is a small independent re-implementation of the idea, not a reproduction.

## Method
Identical to `sensing-vio` except the prior on the oldest keyframe in the window. *Pinned* (control, the `sensing-vio` code path, checked equal by a test): a diagonal Gaussian at its previous estimate. *Marginalised*: after each solve, form the Gauss-Newton information of keyframes 0 and 1 from the current prior on 0 and the IMU preintegration factor 0→1, eliminate keyframe 0 by Schur complement, and use the result (Λ, b, linearised at the solution, 8 states: position, yaw, velocity, gyro and accelerometer biases) as the dense prior on keyframe 1 for the next solve. Not done: bearing factors of the dropped keyframe are not marginalised (it would couple landmarks), so their information is lost, and there is no first-estimate Jacobian handling. Error: rms position error over keyframes as a percentage of path length; seeds paired across priors.

## Reproduce
```bash
pip install numpy scipy pytest
cd research/sensing-viomarg
python -m pytest -q tests                                # 5 tests, ~20 s
OMP_NUM_THREADS=1 python experiments/run.py 8 30         # writes experiments/results_T30.txt (~25 min on 4 cores)
```

## Results (`experiments/results_T30.txt`; 8 seeds, 30 s paths)
| IMU noise | prior | rms drift % (mean ± sem) | median | worst seed | paired ratio to pinned |
|---|---|---|---|---|---|
| 0.25× | pinned | 23.6 ± 7.4 | 23.2 | 63.2 | 1 |
| 0.25× | marginalised | 2.1 ± 1.2 | 0.81 | 10.4 | 0.10 |
| 1× | pinned | 12.3 ± 5.3 | 5.8 | 47.1 | 1 |
| 1× | marginalised | 2.5 ± 0.2 | 2.5 | 3.4 | 0.32 |
| 4× | pinned | 12.3 ± 5.5 | 6.4 | 46.0 | 1 |
| 4× | marginalised | 6.5 ± 0.9 | 7.0 | 10.0 | 1.10 |

- Marginalisation removes the divergence that `sensing-vio` reported: the pinned smoother has seeds at 46 to 63 % drift, the marginalised one at most 10 %.
- With the marginalised prior drift orders with IMU grade (2.1 → 2.5 → 6.5 %), the dependence `sensing-vio` could not see on 12 s paths. The 0.25× vs 1× difference is within noise (one 10 % seed); the 4× penalty is clearer.
- The 4× paired ratio (1.10) is above 1 while the means are lower (6.5 vs 12.3): the geometric mean weights low-drift seeds equally with diverged ones (per-seed values were not inspected), so read it with the means and medians, not alone. The pinned results are too variable (sem 5 to 7) to rank against each other.
- This tells nothing about which sensor to buy; no prices are used.

## Tests
Pinned mode equals `sensing_vio.run_vio`; the marginal prior's cost matches a brute-force profile over the eliminated state; the prior is finite; a short marginalised run is bounded; noiseless sensors recover the path (< 0.5 %).

## Limitations
- Planar, point landmarks, known association, no outliers, rolling shutter or loop closure; illustrative noise levels from `sensing-vio`.
- 8 seeds, one path length (30 s), one camera setting. Solves with non-finite values are discarded (numpy warnings in the log), which can hide failures; the count was not recorded.
- Partial marginalisation (bearing factors of the dropped frame ignored) and no FEJ; a full implementation could differ.
- The result is about this estimator's prior, not about any real system.

## Next steps
Marginalise landmarks and bearing factors too; 3D with gravity alignment; longer paths (60 to 120 s); a licensed public dataset with degraded IMU; count discarded solves.

## Outside dependencies
numpy, scipy, pytest. No hardware, no datasets.
