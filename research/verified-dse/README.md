# verified-dse: how much of a chip design search can cheap fidelity rungs save, with a guarantee?

Research programme on multi-fidelity, verification-aware design-space search for
open-source chip flows (Yosys, ABC, OpenROAD) on SKY130. **Status: proposal only;
no experiment has been run.** Produced with AI assistance (Claude Code). It builds
on none of the CU Boulder groups and claims no affiliation.

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/verified-dse/

## Question
Can cheap rungs (generic gates, liberty mapping, placement, global route) and a
prediction of formal-equivalence success cut the cost of finding a Pareto-good
routed design, with a coverage guarantee that holds whatever the rung bias?

## Contents
- [`PROPOSAL.md`](PROPOSAL.md): related work (12 checked ids), gap, hypotheses H1 to H5, evaluation, milestones, target venue (MLCAD).
- [`LOG.md`](LOG.md): research log.

## Next steps
Milestone 1: measure rung-to-rung bias on at least eight designs (H1).
