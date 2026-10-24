# A fading-objection model of queue-norm collapse under line-cutting robots

Short note; details and limitations in `../README.md`, numbers in `../experiments/results.txt`.

**Question.** What share of committed line-cutting robots breaks a queueing norm when objection to
cutting fades as cutting becomes common?

**Method.** Memory-majority agents (last `M` watched cut attempts); success probability
`1 − p0(1−z)^k`; exact mean-field map and bisection for `ρ_c`; agent simulation, N = 200, 500
rounds, 12 seeds.

**Findings.** At `M = 9`, `p0 = 0.9`, `ρ_c = 0.127`; simulation tips 0/12 at 0.107 and 10/12 at
0.127. `ρ_c` ranges 0 to 0.214 over `p0` 0.7 to 1.0, and 0.395 to 0.007 over `k` 0.5 to 4.

**Limitations.** `p0`, `k` unsourced and swept; binary one-counter model; not real queues.

**References.** Young (1993), *Econometrica* 61(1):57–84. Xie et al. (2011), *Phys. Rev. E*
84:011130. Centola et al. (2018), *Science* 360:1116–1119. Milgram, Liberty, Toledo, Wackenhut
(1986), *J. Personality and Social Psychology* 51:683–689.
