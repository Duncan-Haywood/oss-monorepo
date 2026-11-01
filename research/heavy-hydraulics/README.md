# Which open hydraulic circuit gets a small excavator closest to stock energy use for the least money?

**Status: open research programme (proposal stage), milestone 1 done, 2a to 2g (cycle robustness, sourced margins, idle-time sensitivity, idle models) done; the sourced duty cycle (2) is still open.** A stdlib energy model
of three excavator hydraulic circuits (fixed open-centre, load-sensing, ideal independent
metering) over a work cycle (`src/heavy_hydraulics/`, 6 tests) and a first sweep of 2,916 cases
on an illustrative cycle: load-sensing uses a median **47%** of open-centre pump-shaft energy
(range 22 to 81%), and ideal independent metering a median 80% of load-sensing. The ordering
holds in every case, but only because each rung removes a loss term; the cycle and margins are
not sourced, so this is a first-order calculation, not a measurement of any machine.
See [`PROPOSAL.md`](PROPOSAL.md) and [`LOG.md`](LOG.md).

**Latest (2n, 2026-10-30):** the open-centre neutral drop read from Danfoss's PVG 32 bypass curve is about 10.9 bar at 45 L/min, which puts the load-sensing break-even margin at 28.0 bar: load-sensing uses less shaft energy than open-centre for both sourced margins (14 and 25 bar) at the measured load factor (`experiments/pvg_neutral.py`; one figure reading, standby flow still assumed).

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
python3 experiments/envelope.py > experiments/envelope_results.txt  # 20,000 random cycles
python3 experiments/idle_sensitivity.py > experiments/idle_sensitivity_results.txt  # milestone 2f, ~20 s
python3 experiments/idle_models.py > experiments/idle_models_results.txt  # milestone 2g, ~60 s
PYTHONPATH=src python3 experiments/regen_bound.py > experiments/regen_bound_results.txt  # milestone 5a, ~10 s
python3 experiments/regen_peaky.py > experiments/regen_peaky_results.txt  # milestone 5e, under 1 s
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

**Milestone 5c, the electric rung (preliminary).** Against a vendor runtime claim (Volvo ECR25 Electric: 20 kWh for up to 4 h, a 5 kW mean draw; [product page](https://www.volvoce.com/europe/en/products/electric-machines/ecr25-electric/)), the modelled duty cycle (load factor 0.346) needs only 2.5 to 4.3 kW at the battery for a chain efficiency of 0.80 to 0.92, so 20 kWh would last 4.7 to 8.0 h. The model sits 1.2 to 2x below the vendor's mean draw; what it omits (travel, auxiliaries, heavier duty) or vendor conservatism cannot be separated with this data. The circuit ranking is unchanged by electrification because the chain efficiency is common to both circuits. Table: [`experiments/electric_rung_results.txt`](experiments/electric_rung_results.txt); detail in [`LOG.md`](LOG.md).

## Limitations and next steps

Illustrative cycle written from memory; no dynamics, leakage, line losses or energy recovery;
no parts cost; references web-searched, not cite_check-ed. Next: a sourced duty cycle (earthmoving equation or a
public measured cycle), then parts cost with `heavy-market`.

## Milestone 2a: random cycles inside a machine envelope

20,000 random four-phase cycles (pump 45 L/min, section flows 17.3/17.3/10.4 L/min, 20 to 180 bar;
envelope from an unopened search summary of a Kubota KX018-4 listing) give load-sensing a median
**0.44** of open-centre shaft energy (5 to 95%: 0.26 to 0.64) and metering a median 0.72 of
load-sensing (0.87 when actuators in a phase share one pressure). H3 ("metering saves under 15%
at zero spread") holds on the median but fails in about a third of equal-pressure cycles. The
cycles are random, not measured, so H4 is still untested. Details: [`LOG.md`](LOG.md),
`experiments/envelope_results.txt`.


## Milestone 2b: the measured cycle times and pump curve of one machine

Juza and Heřmánek (2023, [doi:10.17221/77/2021-RAE](https://doi.org/10.17221/77/2021-RAE)) measured a
25 s mean cycle (six phases) and a pump half's flow against pressure on a UDS 214 telescopic
excavator (a much larger machine than the mini-excavator above). With those sourced, and the
open-centre flow taken from the measured curve instead of held constant, load-sensing's median
shaft energy is **0.67** of open-centre (5 to 95%: 0.48 to 0.86), up from 0.44, and metering is
0.87 of load-sensing (0.78 to 0.93). The ordering open-centre >= load-sensing >= metered fails in
0.14% of cycles, where demand nearly fills the pump and load-sensing's margin costs more than
the sourced 6 bar block loss. Pressures and demands are still random (the paper has no pressure
trace), so this is a sensitivity result. Details: [`LOG.md`](LOG.md),
`experiments/measured_cycle_results.txt`.

## Milestone 2c: pressures from a force model

Tying each phase's pressure to a load (Reece-form cutting force, bucket weight, swing inertia; all
parameters assumed typical ranges, not sourced) changes the picture: load-sensing's median shaft
energy is **0.84** of open-centre (0.63 to 1.12), and it uses more than open-centre in 17% of
cycles, because most phases are low-pressure and its 14 to 30 bar margin is then a large share of
the load. Metering is 0.70 of load-sensing (0.58 to 0.83). So the 2a and 2b ratios depend on random
high pressures; a measured pressure trace is what settles it. Details: [`LOG.md`](LOG.md),
`experiments/physics_cycle_results.txt`.

## Milestone 2d: the same force model with sourced margins

Pinning the margins to opened sources (load-sensing differential limiter 25 bar from a simulated
midi-excavator thesis, Briganti 2022; open-centre block drop 6 bar and pump efficiency 0.883 from
Juza and Hermanek 2023) reverses the picture: load-sensing uses a median **1.04** of open-centre
energy (0.83 to 1.26) and loses in 61% of cycles; the break-even margin is near 23 bar. Metering
stays below load-sensing in every cycle (median 0.66). The two margins come from different machines
and the pressures are still the assumed force model, so this is a sensitivity result, not an energy
figure. Run `python3 experiments/physics_cycle.py --sourced`; output in
`experiments/physics_cycle_sourced_results.txt`; reasoning in [`LOG.md`](LOG.md).

## Milestone 2e: is the assumed cycle's load shape like a measured excavator's?

A public electrical power trace of an electric excavator (Zenodo 18862594, CC-BY-4.0; copied to
`experiments/data/`) has a load factor (mean over peak) of 0.346 and spends 52% of the time below
30% of its peak. The force-model cycles have a median load factor of 0.606 (5 to 95%: 0.41 to 0.78)
and a median 14% of time below 30% of peak, so the model has *less* low-load time than the machine,
and the 2d finding is not an artefact of too many idle phases. The trace is electrical input to a
different, larger machine, so this is a shape check only; it says nothing about which circuit wins.
Run `python3 experiments/trace_shape.py`; output in `experiments/trace_shape_results.txt`; reasoning
in [`LOG.md`](LOG.md).

## Milestone 2f: idle time decides whether load-sensing beats open-centre

With sourced margins (6 bar spool, 25 bar load-sensing, 0.883 pump efficiency) and a force-model cycle with no idle time, load-sensing used a median 104% of open-centre energy (2d). Adding idle time until the cycle's load factor matches the measured electric-excavator traces (0.346 to 0.375, Zenodo 18862594) turns that to 79 to 82%, with load-sensing losing in 8 to 12% of cycles. The break-even load factor is near 0.5 to 0.55. Idle demand is assumed and the load factor comes from a different machine's electrical power, so this is a sensitivity result, not a measurement. Table: [`experiments/idle_sensitivity_results.txt`](experiments/idle_sensitivity_results.txt); detail in [`LOG.md`](LOG.md).

## Milestone 2g: the idle-time ranking depends on the open-centre neutral pressure
2f's 21% load-sensing advantage at the measured load factor (0.346) is a mid-range point. Charging idle physically (open-centre through its bypass at a neutral pressure p_n; load-sensing with a standby flow) gives a load-sensing/open-centre energy ratio of 0.64 at p_n = 40 bar, 0.82 at 20 bar and 0.98 to 1.04 at 8 bar with 0 to 6 L/min standby. p_n and the standby flow are assumed, so the sign of the ranking at that load factor is not settled; a datasheet source is the next step. Table: [`experiments/idle_models_results.txt`](experiments/idle_models_results.txt); detail in [`LOG.md`](LOG.md).


## Milestone 2i: a sourced neutral pressure reverses 2f's idle ranking
Reading the open-centre neutral drop from a published sectional-valve catalogue (Salami VD8A, 75 L/min nominal, about 1 bar per section at nominal flow; Q^2 scaling) gives 1.1 to 3.2 bar at the model's 45 L/min for 3 to 8 sections, below 2h's 6.4 to 10.8 bar break-even. At the measured load factor 0.346 load-sensing then uses 8 to 12% more shaft energy than open-centre (median LS/OC 1.08 to 1.12; 1.02 to 1.03 even with an assumed extra 5 bar for return line and cooler), the opposite sign of 2f's 21% saving. One manufacturer, a 75 L/min-class valve, a reading off a figure; the load-sensing side is still unsourced. Table: [`experiments/neutral_sourced_results.txt`](experiments/neutral_sourced_results.txt); detail in [`LOG.md`](LOG.md).
## Milestone 4 (first pass): parts cost and payback (H5)
Priced from public retail listings (a 28 cc load-sensing piston pump $1,708 against a 28 cc gear pump about $147, an open-centre 3-section monoblock $343, no public load-sensing valve price) and fuelled at $6.28/US gal, load-sensing's extra parts cost repays in 2,566 h at best (high diesel price, 40 bar open-centre neutral pressure, valve priced like the monoblock) and in 7,000 to 14,000 h at a 20 bar neutral pressure; at 8 bar it never does in practice (more than 160,000 h). H5's 2,000 h limit is not met anywhere in the grid. Brand and quality classes differ between listings, the valve price is swept, fuel consumption is assumed and the energy side inherits 2g's assumptions. Table: [`experiments/payback_results.txt`](experiments/payback_results.txt); detail in [`LOG.md`](LOG.md).

## Milestone 5a: boom-lowering energy recovery is worth about 1 to 10% of cycle energy

Recoverable energy `(m_arm + m_load) g dh x eta_rt`, capped by the lift phase's shaft energy, over 5,000 force-model cycles
(`experiments/regen_bound.py`). Median share of pump-shaft energy: 3.3% (open-centre) and 3.2% (load-sensing) at 300 kg,
0.8 m, 70% round trip; 10.0% and 10.3% at 600 kg, 1.2 m, 92%. Arm mass, drop height and round-trip efficiency are swept, not
sourced; the model's lift phase does a median 5.6 times the work of lifting the bucket load alone, so the cap may be generous.
Details and the pre-registered predictions: `LOG.md`.

## Milestone 3l: pricing the larger pump (prediction refuted on energy)
A pump 1.2 x the peak demand removes the open-centre median time penalty (3k), but burns 14.1% more shaft energy per cycle (1.5 x: 34.8%) because the fixed pump's whole flow runs at load pressure in every work phase. Cycle time falls 2.6% and 4.7%. With the pump priced linearly in flow from one retail listing (assumed) and fuel at $6.28/gal, the extra fuel is $0.18 to $0.45 per hour, so the larger pump pays if an hour of the machine is worth more than about $8 to $12 (`experiments/pump_cost.py`). I had predicted an energy rise under 5% (1.2 x); that part was wrong, the break-even bound held. The 0.8 x row is not valid (most cycles exceed the pump flow). Details: `LOG.md`.

## Milestone 3n: how much of the pump-size penalty is the full-flow assumption?
With open-centre drawing `q_dem + f (Q_pump - q_dem)` at load pressure, the median load-sensing/open-centre break-even margin at a 1.2 x pump falls from 44.5 bar (f = 1, 3m) to 31.7 (f = 0.5) and 18.8 (f = 0, demand-matched), where it equals the 1.0 x value. My prediction (below 28 bar at f = 0.5, below 14 at f = 0) was refuted. f is swept, not sourced, so this brackets the answer rather than settling it. Run `python3 experiments/surplus_fraction.py`; output in `experiments/surplus_fraction_results.txt`; reasoning in [`LOG.md`](LOG.md).
