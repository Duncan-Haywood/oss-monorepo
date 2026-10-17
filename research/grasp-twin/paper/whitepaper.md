# Squeezing in simulation: grip-force policies planned in a digital twin with too little friction variability

*Stylised: static Coulomb threshold, `ln μ ~ N(m,s²)` and `ln F_c ~ N(f,r²)` independent, force in units of the minimum load per finger `w0 = W(1+a)/2`. Base case `μ=0.5` (`s=0.3`), crush at 6 `w0` (`r=0.15`), `L_s=L_c=1`; a chosen model, not data. Pure Python; every number is from `experiments/results.txt`.*

## Question
Grasp policies trained or tuned in a manipulation-workcell twin inherit the twin's friction model. Twins usually carry a nominal friction with little or no variability. When the object can either slip (too little force) or break (too much), what does an under-dispersed or biased twin do to the force the planner picks, and how far can domain randomisation or a few real measurements repair it?

## Method
Loss `J(x) = L_s Φ((−x−m)/s) + L_c Φ((x−f)/r)` for `x = ln F`. Setting `J'=0` and taking logs gives `(x+m)²/s² − (x−f)²/r² = 2 ln(L_s r/(L_c s))`, a quadratic; the root with `J''>0` is the optimum. The twin is a parameter set `(m̂,ŝ,f̂,r̂)`; its policy is `x̂ = x*(twin)`, and its real regret is `J_real(x̂) − J_real(x*)`, exact.

## Results
1. **Verification.** Closed-form optimum `x*=1.3977` (F* = 4.05 `w0`, `J*=0.01373`: slip 0.00942, crush 0.00431) matches a numeric search to 7 digits; Monte Carlo at `x*` and `x*±0.3` (400k grasps) agrees with the exact slip and crush probabilities to within 6e-4 (slip 0.00923 vs 0.00942 at `x*`; crush 0.26475 vs 0.26529 at `x*+0.3`).
2. **A too-clean twin under-grips and reports almost no risk.** Twin friction spread `ŝ` = 0.3 / 0.2 / 0.15 / 0.1 / 0.05 (real 0.3): force 4.05 / 3.72 / 3.46 / 3.12 / 2.65 `w0`; the twin claims `J` = 1.4e-2 / 1.7e-3 / 2.5e-4 / 1.1e-5 / 3.5e-8; the real `J` is 0.0137 / 0.0201 / 0.0337 / 0.0690 / 0.1735, i.e. regret 0 / 0.5 / 1.5 / 4.0 / 11.6 × `J*`. The twin's claim is off by orders of magnitude while its policy is off by a few tens of percent in force.
3. **Vanishing spread gives no unique policy.** At `ŝ=0.01` the twin's loss is ≈0 on a window, so "the twin-optimal force" depends on a tie-break: the lower edge (`μ̂F=1`, 2.00 `w0`) slips 50% of real grasps, the middle (2.77) 14%, and 3 crush-sd below crush (3.83, twin J 1.4e-3) is nearly optimal in reality (real J 0.0167). A planner that returns any feasible point of a twin's zero-risk set is not making a claim about the real system.
4. **Biased friction.** `m̂ = m+δ`, spread correct: regret/`J*` is 0.02 (±0.05), 0.19 (−0.15) vs 0.15 (+0.15), 0.85 (−0.3) vs 0.57 (+0.3), 1.63 (−0.4) vs 0.98 (+0.4). It is locally quadratic (`½J''(x*)Δx²`: 0.00026 vs exact 0.00025 at +0.05; 0.00948 vs 0.00778 at +0.3). Underestimating friction (planning to squeeze harder) costs more here because crush is a steeper cliff than slip in this parameter point; that asymmetry is specific to the chosen `r<s`, not a general law.
5. **Domain randomisation as a knob.** Replacing the twin's spread by a width `w` at its (biased) nominal friction can drive regret to ≈0 (best `w` = 0.38 for +0.15, 0.47 for +0.3, 0.22 for −0.15, 0.15 for −0.3; minimum regret ≤3e-5), because `x*` is a one-dimensional function of `(m,s)`. The width is set by the sign and size of the unknown bias: tuned for +0.3 (w=0.47) it has regret 0.0048 at zero bias and 0.0202 at −0.3 (1.5× `J*`). A single fixed width with the right mean is better than a wrong nominal but is not a fix for an unknown bias; this is a one-parameter-point observation about a scalar policy.
6. **Calibration budget.** Plug-in from `n` real friction measurements (2000 fits): mean regret 0.0109 (n=5), 0.00389 (10), 0.00153 (20), 0.00055 (50), 0.00027 (100), 0.00007 (400), 0.00003 (1000). The delta-method value `½J''(x*)·Var(x̂)` (Fisher variances of `m̂`, `ŝ`) is within 5% for `n ≥ 50` (0.95, 0.96, 1.00, 0.99 of measured at n=50, 100, 400, 1000) and under-predicts at small `n` (0.48× at 5, 0.67× at 10, 0.86× at 20) where the log-normal MLE of `s` is biased low and the regret is skewed. 95.3% of fits at `n=5` already beat a too-clean twin (`ŝ=0.1`), 99.9% at `n=10`.

## Limitations
No contact dynamics, compliance, slip detection or reactive re-grasp; a real gripper with tactile feedback would not commit to a single force. Independence of friction and fragility, known weight, and log-normal laws are all assumed. Parameters are chosen, not fitted to a real workcell; regrets scale with `L_s/L_c` and the `r`, `s` widths and only this base case plus the parameter points above were run. The bias asymmetry (item 4) and the width compensation (item 5) are not established beyond these points.

## Next steps
Measure friction and crush spreads from a real gripper on glassware and check the log-normal assumption; time-stepped contact simulation (PyBullet/MuJoCo) to replace the threshold model and test whether twin-trained RL reaches the analytic force; a reactive grasp that tightens on slip detection and the value of the twin's prior for it; per-object-class spreads (a twin that randomises friction per episode versus per step).

## References
- Murray, R. M., Li, Z. & Sastry, S. S. (1994). *A Mathematical Introduction to Robotic Manipulation*. CRC Press.
- Tobin, J. et al. (2017). Domain randomization for transferring deep neural networks from simulation to the real world. *IROS*. arXiv:1703.06907.
- Peng, X. B. et al. (2018). Sim-to-real transfer of robotic control with dynamics randomization. *ICRA*. arXiv:1710.06537.
