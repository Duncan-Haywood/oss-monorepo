# Research log: verified-dse

Newest first. Write the hypothesis and the planned analysis before running an experiment, then the outcome.

## 2026-10-24 · Milestone 1: rung-bias benchmark (H1), planned before running
- Design set (10): adder (`+`, ripple, W=16), 8-bit multiplier, 4x4 MAC, 8-bit ALU, 16-bit popcount, 16-bit barrel shifter, CRC-16 byte update, 12-bit saturating add, 8x4 FIFO. Original small RTL, MIT; four are copied from `chip-pnr`/`chip-ppa-sky130mac`.
- Space: ABC pass sequences of length 0 to 3 over {balance, rewrite, rewrite -z, refactor, refactor -z, dc2, dch} (the `chip-scriptsearch` space, 400 sequences), 60 drawn with seed 0 (the empty sequence plus 59 random), the same 60 for every design; sequences ABC rejects are counted and dropped.
- Rungs: R1 generic-gate cells x depth (Yosys/ABC `-g`); R2 SKY130 HD mapped area x no-wire OpenSTA period; R3 post-detailed-placement area x period; R4 global route + `repair_timing` area x period (the reference, "routed"). Score = area x period (um^2 ns), as `chip-scriptsearch`. Flow is `chip-pnr`'s OpenROAD script, 40% utilisation.
- Clock target: the design's own baseline (empty-sequence) no-wire period ("tight", where wires force repair) and 1.5x that ("relaxed"), to see whether the answer depends on repair pressure.
- Analysis fixed now: Kendall tau-b of each rung against R4 per design and period, 95% bootstrap interval over sequences (2000 resamples); regret of the rung's pick (mean over ties) = R4(pick)/min R4 - 1; whether the rung's top 5 contains the R4 optimum. H1 holds if R1's tau is below 0.7 on at least 4 of 10 designs (at the tight period) and is refuted if tau is at least 0.7 on 9 or more. Also report R2 and R3, and rung wall times.
- Expectation I am on record with: R1 will do worst, R2 will already be close to R4 on most designs. If R1 is fine, H1 is refuted and the programme's premise (cheap rung is biased) needs rethinking for pass-sequence spaces.

## 2026-10-24 · Programme opened: proposal written
- Wrote `PROPOSAL.md` (question, 12 related works, gap, hypotheses H1 to H5, evaluation, milestones). No experiment run.
- All arXiv and DOI ids were looked up with `cite_check.py`. One id I had recalled for a multi-fidelity HLS paper (2106.09221) resolved to an unrelated physics paper and was dropped, so that paper is not cited.
- Next: milestone 1, the rung-bias benchmark (H1). Planned before running: 8+ designs, a pass-sequence space, four rungs on SKY130 as in `chip-pnr`; the analysis is Kendall tau of each rung against routed area-delay per design.
