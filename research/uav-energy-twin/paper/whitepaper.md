# Battery reserves planned in a constant-wind digital twin of a UAV leg

*Stylised: power `P(v)=(v³+1/v)/2` (speed in units of `V0`), headwind constant within a flight and `U[μ−a, μ+a]` across flights, base case `μ=0.3`, `a=0.25`; chosen values, not data. Pure Python; every number is from `experiments/results.txt`.*

## Question
Mission planners for UAV survey or observation legs often run a twin with a single mean wind. The twin picks a cruise speed and a battery reserve. Which of those two decisions does a missing wind spread break, and when does it break the speed too?

## Method
Energy per distance at airspeed `v` and headwind `w` is `P(v)/(v−w)`. For uniform `w` the expectation is `J(v) = P(v)·(1/2a)·ln((v−μ+a)/(v−μ−a))` for `v>μ+a` and infinite otherwise; relative to the twin's claim `P(v)/(v−μ)` it is exactly `artanh(x)/x` with `x=a/(v−μ)`. Energy is monotone in `w`, so a battery `B=(1+m)·P(v)/(v−μ)` per unit distance is exceeded iff `w > μ + (v−μ)m/(1+m)`, giving depletion probability `½ − (v−μ)m/(2a(1+m))` and required margin `q/(1−q)`, `q=a(1−2ε)/(v−μ)`. The twin speed minimises `P(v)/(v−μ)`, i.e. the root of `2v⁵−3μv⁴−2v+μ=0` (`v=1` at `μ=0`); the real optimum is found by golden section on `J`.

## Results
1. **Verification.** Exact `J` matches 300k-wind Monte Carlo to within 0.05% at `v` = 0.8, 1.0, 1.2, 1.5; the quintic root is the argmin of the twin energy (unit-tested) and equals 1 at `μ=0`; the required-margin formula reproduces its target depletion exactly and Monte Carlo gives 0.0507 for a 5% target.
2. **The speed is nearly right.** Twin speed 1.0996 vs real optimum 1.1230; regret 0.0015 in energy per distance, 0.10% of `J*=1.447`. A speed-only audit of this twin would pass it.
3. **The claim and the reserve are not.** At its own speed the twin claims 1.400; real expected energy is 1.449 (ratio 1.0346, equal to `artanh(x)/x` at `x=0.313`). A battery sized to the claim (`m=0`) depletes in 50% of real flights; `m` = 0.05 / 0.10 / 0.20 / 0.30 gives 42% / 35% / 23% / 13% (the twin says 0 throughout). Margins for real depletion ≤ 25% / 10% / 5% / 1% / 0.1%: 18.5% / 33.4% / 39.2% / 44.2% / 45.4%; no finite margin exists once `ε` implies `w ≥ v`. Flying the real-optimal speed lowers the 5% margin only from 39.2% to 37.6%, so most of the reserve gap is due to the spread, not to the speed.
4. **Wind spread sweep (μ fixed).** Regret/`J*` of the twin speed is 0.0002 (`a`=0.1), 0.0004 (0.2), 0.0022 (0.3), 0.0081 (0.4), 0.024 (0.5), 0.064 (0.6), 0.18 (0.7); the energy claim is low by 0.5% / 2.2% / 5.1% / 9.9% / 17% / 30% / 55% at `a` = 0.1 / 0.2 / 0.3 / 0.4 / 0.5 / 0.6 / 0.7. There is a cliff: for `a > v_twin−μ = 0.80` the twin speed meets a stalling wind with positive probability (0.03% at `a`=0.8, 10% at `a`=1.0) and expected energy is infinite, while the twin still reports a finite claim.
5. **Wrong mean wind.** Twin `μ̂ = μ+δ` (spread 0, real `a`=0.25): regret/`J*` 0.019 (δ=−0.2), 0.0078 (−0.1), 0.0037 (−0.05), 0.0000 (+0.05), 0.0010 (+0.1), 0.0109 (+0.2). The +0.05 case is a coincidence of two errors: overestimating the headwind raises the speed by about what the missing spread would. Sized at `m=0.10`, the twin's own mean plan depletes in 73% (δ=−0.2) to 0% (δ=+0.2) of real flights.
6. **Repair by logging winds.** Moment-fit `(μ̂,â)` from `n` real winds (3000 fits each), then re-plan: mean regret 0.0043 (n=3), 0.0026 (5), 0.0015 (10), 0.00074 (20), 0.00030 (50), 0.00007 (200) (absolute energy units; the twin's is 0.0015); the refit beats the constant-wind twin's speed in 42%, 54%, 67%, 84%, 97%, 100% of fits. No fit stalled at these parameters (the cliff is far away at `a`=0.25).

## Limitations
The central negative result is that at this parameter point cruise speed is a weak lever: the damage is in the reserve. Whether that holds at other `P(v)` shapes or wind laws was not run. A uniform wind law makes every quantile exact, and a heavier-tailed wind would push the cliff closer. Wind is fixed within a flight, so there is no gust process, reactive replanning or turn-back, and no discharge nonlinearity, altitude change or vertical wind. Parameters are chosen, not fitted to a UAV or a wind record.

## Next steps
Fit `P(v)` and wind to a logged flight (PX4/ArduPilot SITL wind models) and test the uniform-wind assumption; a within-flight gust process with a turn-back rule and its exact or bounded stopping value; round trips where wind reverses relative to heading; joint speed-and-reserve planning under a depletion budget.

## References
- Stevens, B. L., Lewis, F. L. & Johnson, E. N. (2016). *Aircraft Control and Simulation*, 3rd ed. Wiley.
- Tobin, J. et al. (2017). Domain randomization for transferring deep neural networks from simulation to the real world. *IROS*. arXiv:1703.06907.
- Peng, X. B. et al. (2018). Sim-to-real transfer of robotic control with dynamics randomization. *ICRA*. arXiv:1710.06537.
