# Do robot agents keep the norms they state? A say–do harness with a deterministic stub

*Research track 17 (`society`), milestone 5. Produced with AI assistance (Claude). Stylised
simulation; no language model was run and no claim is made about real people or robots.*

## Abstract

We build a small town of robot agents that state a door norm each day and act at door meetings with
scripted people, and measure the share of meetings whose action matches the stated norm (the keep
rate) and the cost to people. Agents are any object with `state_norm` and `act`; a deterministic
stub and an optional model adapter are provided. With the stub, the keep rate of "always yield" is
`1 − 0.4·pressure` (1.000, 0.799, 0.601 at pressure 0, 0.5, 1.0, 20 seeds), matching its closed
form, and people's cost per meeting rises from 0.200 to 1.077. These are properties of the stub
rule, so the contribution is the instrument and the baseline it sets for model-driven agents.

## 1. Background

Park et al. (2023) showed language-model agents with memory and plans acting in a simulated town.
Leibo et al. (2017) framed yielding as a sequential social dilemma. We combine the two ideas in a
measurement harness and leave model runs to a funded follow-up.

## 2. Model

As in the README: three norms, urgency `u ~ U(0,1)` per meeting, stub go-probabilities
`0.8·pressure·u` (always_yield), `1[u ≥ 0.5]` (yield_when_not_late) and 0.5 (first_come); people go
first with probability 0.8; costs 3 for a collision, `u·pressure` for a robot's yield, 1 for a stall.

## 3. Results

See `experiments/results.txt` (section A: keep rate and person cost by pressure for 0%, 20% and 50%
hurried robots; section B: all norms). E[0.8·p·u] = 0.4p predicts the keep rate within 0.003.

## 4. Limitations

Hand-written policy; no model run; scripted non-adaptive people; arbitrary cost weights.

## References

- Park, J. S., O'Brien, J. C., Cai, C. J., Morris, M. R., Liang, P., Bernstein, M. S. (2023).
  Generative agents: interactive simulacra of human behavior. *UIST '23*.
- Leibo, J. Z., Zambaldi, V., Lanctot, M., Marecki, J., Graepel, T. (2017). Multi-agent
  reinforcement learning in sequential social dilemmas. *AAMAS '17*.
