# Does the observed objection to line-cutting keep a queueing norm in a robot crowd?

Short note; details and limitations in `../README.md`, numbers in `../experiments/results.txt`.

**Question.** `society-enforcers` assumed a lone-cut stopping chance `p0 = 0.9`. What do field rates imply?

**Method.** The `society-enforcers` model unchanged; bisection for the least `p0` at which people alone keep a norm; sweep of `p0` in 0.1 to 0.9 for the enforcer share needed.

**Findings.** People alone keep a norm only for `p0 >= 0.786` (M = 9). Milgram et al. reactions (about 0.5, ejection 0.10; secondary source) imply 7.5% to 12.3% enforcers with no cutters, and 9.2% to 12.6% against 30% cutters, against 5.4% at 0.9.

**Limitations.** Inputs not read from the original paper; reaction is not a stopped cut; `L`, `q` unsourced.

**References.** Milgram, Liberty, Toledo, Wackenhut (1986), *J. Personality and Social Psychology* 51:683-689. Young (1993), *Econometrica* 61(1):57-84. Xie et al. (2011), *Phys. Rev. E* 84:011130.
