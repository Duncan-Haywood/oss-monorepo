# Which open hydraulic circuit gets a small excavator closest to stock energy use for the least money?

**Status: open research programme (proposal stage), milestone 1 done.** A stdlib energy model
of three excavator hydraulic circuits (fixed open-centre, load-sensing, ideal independent
metering) over a work cycle (`src/heavy_hydraulics/`, 6 tests) and a first sweep of 2,916 cases
on an illustrative cycle: load-sensing uses a median **47%** of open-centre pump-shaft energy
(range 22 to 81%), and ideal independent metering a median 80% of load-sensing. The ordering
holds in every case, but only because each rung removes a loss term; the cycle and margins are
not sourced, so this is a first-order calculation, not a measurement of any machine.
See [`PROPOSAL.md`](PROPOSAL.md) and [`LOG.md`](LOG.md).

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/heavy-hydraulics/

**Programme.** Track 25 (`heavy`, open-source construction, mining and heavy equipment) in
[`../PROJECTS.md`](../PROJECTS.md), milestone 2. Related labs: the repository's robotics and
autonomy groups (ARPG, RECUV, HIRO) for the later autonomy milestones; no lab has reviewed this.

**Safety.** Heavy machines kill. This is simulation and arithmetic, not a design, a
certified machine or a safety system. Nothing here was run on a real machine.

## Reproduce

```bash
cd research/heavy-hydraulics
PYTHONPATH=src python3 -m pytest tests -q                      # 6 tests
python3 experiments/run.py > experiments/results.txt           # 2,916 cases, under 5 s
```

## Method

Each phase of the cycle lists actuator load pressure (bar) and demanded flow (L/min). Hydraulic power
is `p * Q / 0.6` W. Open-centre: the pump delivers full flow at the highest load pressure plus a
spool drop. Load-sensing: summed demand at the highest load pressure plus a margin. Metered: each
actuator at its own pressure plus a small drop. Shaft energy divides by pump efficiency.

## Results

See [`experiments/results.txt`](experiments/results.txt) and the log. Swept: flow demand,
pressure spread, pump size, load-sensing margin (14 to 30 bar), spool drop, metering drop,
pump efficiency (0.75 to 0.92). None is sourced yet.

## Limitations and next steps

Illustrative cycle written from memory; no dynamics, leakage, line losses or energy recovery;
no parts cost; no reference machine-checked. Next: a sourced duty cycle (earthmoving equation or a
public measured cycle), then parts cost with `heavy-market`.
