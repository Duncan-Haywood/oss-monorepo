# Queue-enforcing robots against line-cutting robots: a fading-objection model

Short note; details and limitations in `../README.md`, numbers in `../experiments/results.txt`.

**Question.** What share of enforcer robots, whose objection does not fade, holds a queueing norm against a given share of line-cutting robots?

**Method.** The `society-lineup` memory-majority model (last `M = 9` watched cut attempts, human objection `p0(1−z)^k`) plus enforcers who stop a cut with probability `1 − (1 − qe)^L`. Exact mean-field map, bisection for the critical cutter share and the least enforcer share; agent simulation, N = 200, 500 rounds, 12 seeds.

**Findings.** Critical cutter share 0.127 (e = 0), 0.201 (3%), 0.277 (5%). Against 30% cutters, 5.4% enforcers hold the norm at `L = 10, q = 0.5`. Simulation holds 0/12 at 0.044 and 12/12 at 0.064. No hysteresis.

**Limitations.** `L`, `q` unsourced and swept; no geometry, costs or adaptation; not real queues.

**References.** Young (1993), *Econometrica* 61(1):57–84. Xie et al. (2011), *Phys. Rev. E* 84:011130. Milgram, Liberty, Toledo, Wackenhut (1986), *J. Personality and Social Psychology* 51:683–689.
