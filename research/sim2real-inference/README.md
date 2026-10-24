# Sim-to-real inference: how few real trials certify a robot policy when a biased simulator supplies the rest?

**Status: open research programme, proposal stage.** No new results yet. This directory is where
the work toward one publishable paper accumulates across sessions; it consolidates about 130
small twin projects in this repository into one question (see [`PROPOSAL.md`](PROPOSAL.md)).

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/sim2real-inference/

**The question.** A digital twin (a simulator of a real robot) is biased, so evaluating a policy on
the twin alone gives the wrong answer however many runs you make. Real trials are unbiased but
scarce. The programme asks for estimators and tests that use many twin runs and a few real ones,
keep their guarantee *whatever* the twin's bias, and say exactly how many real trials they save:
for a policy's mean return, its failure rate, and comparisons between policies.

**Why it is open.** Control-variate and prediction-powered inference arguments promise savings that
grow with the twin's correlation with reality; a worst-case argument (`twin-certification`) says a
twin cannot shorten a failure-rate certificate at all. The programme looks for the checkable
assumptions in between, and tests them on real paired sim and real data (SIMPLER, Li et al. 2024) as
well as on MuJoCo model pairs.

- [`PROPOSAL.md`](PROPOSAL.md): question, related work (13 checked references), gap, hypotheses
  H1 to H6, method, evaluation, milestones, target venue.
- [`LOG.md`](LOG.md): the research log. Hypotheses are written down before experiments are run.
- How runs work on a programme: [`../PROGRAMMES.md`](../PROGRAMMES.md).

Produced with AI assistance (Claude Code). It builds on published work it cites and implies no
affiliation with or endorsement by any author or lab.

## Owner steps

- Real-robot trials, if a later milestone needs them, and submitting the paper (publishes under a
  name).

## Outside dependencies

None yet. Planned: MuJoCo (open source, pip) and the published SIMPLER tables.
