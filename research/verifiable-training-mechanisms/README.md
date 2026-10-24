# Verifiable training mechanisms: what is the cheapest payment-and-audit protocol that makes honest ML training an equilibrium?

**Status: open research programme, proposal stage.** No new results yet. This directory is where
the work toward one publishable paper accumulates across sessions; it consolidates about 60
small scoring, audit and verifier projects in this repository into one question (see
[`PROPOSAL.md`](PROPOSAL.md)).

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/verifiable-training-mechanisms/

**The question.** A requester pays untrusted workers to train a model. Cheating is cheap (skip
steps, use less data, lower precision, copy a peer) and the weights cannot be checked without redoing
the work. The programme asks for the cheapest protocol that makes full effort an equilibrium when the
available checks are a refereed re-execution of one step, a noisy proper score on held-out data and
agreement between redundant workers, and when honest workers themselves differ by floating-point drift.

**Why it is open.** Refereed delegation, scoring rules, peer prediction and contract theory each
assume the others away. The programme prices the drift tolerance as a cheating margin, proves a cost
frontier for the joint contract, bounds collusion on a shared shortcut, and measures all of it on real
small-model training.

- [`PROPOSAL.md`](PROPOSAL.md): question, related work (17 checked references), gap, hypotheses
  H1 to H6, method, evaluation, milestones, target venue.
- [`LOG.md`](LOG.md): the research log. Hypotheses are written down before experiments are run.
- How runs work on a programme: [`../PROGRAMMES.md`](../PROGRAMMES.md).

Produced with AI assistance (Claude Code). It builds on published work it cites and implies no
affiliation with or endorsement by any author or lab.

## Owner steps

- Submitting the paper (publishes under a name).

## Outside dependencies

None yet. Planned: a public dataset and an open-source ML framework for the real-training
experiments, probed for reachability first.
