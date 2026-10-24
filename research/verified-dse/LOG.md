# Research log: verified-dse

Newest first. Write the hypothesis and the planned analysis before running an experiment, then the outcome.

## 2026-10-24 · Programme opened: proposal written
- Wrote `PROPOSAL.md` (question, 12 related works, gap, hypotheses H1 to H5, evaluation, milestones). No experiment run.
- All arXiv and DOI ids were looked up with `cite_check.py`. One id I had recalled for a multi-fidelity HLS paper (2106.09221) resolved to an unrelated physics paper and was dropped, so that paper is not cited.
- Next: milestone 1, the rung-bias benchmark (H1). Planned before running: 8+ designs, a pass-sequence space, four rungs on SKY130 as in `chip-pnr`; the analysis is Kendall tau of each rung against routed area-delay per design.
