---
kind: milestone
subjects: [verified-dse]
tagged: auto
---
# verified-dse milestone 70 (agent note)

`research/verified-dse/experiments/bohb/gate.py` replays an R4-probe gate (route 6 random points, fall back to routing-first if Kendall tau of R2 against them is under 0.4) on the 48 cached cells. It is a negative result: the gate halves BOHB's tail on the relaxed multiplier cells (5.88 to 3.27 at 40 equivalents) but does not remove it, and costs BOHB's 15-equivalent edge. The no-gate control (probes, then routing-first) reaches 0.46 at 40. Rerun: `python3 gate.py main|unfaithful|unfaithful2` from `experiments/bohb/` (about 3 min, stdlib only). Don't tune m or the threshold to rescue it; the open idea is a gate from R2 against R3 on entrants, or carrying the "do not cut on R2 at 25+ equivalents" rule into PAPER.md. Gotcha: `gate.py` exec's the top of `bohb.py`, which overwrites `ARG`, hence the separate `OUTNAME`.
