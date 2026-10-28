# Proposal: which open hydraulic circuit gets a small excavator closest to stock energy use for the least money?

Programme `heavy-hydraulics`, opened 2026-10-28 as the first programme of track 25 (`heavy`,
`research/PROJECTS.md`, milestone 2). Written with AI assistance (Claude Code). This is a plan
plus one first-order calculation; no bench, field or simulator result exists. The DOI registry
(Crossref) was unreachable from this session (403 through the egress proxy), so **no reference
below is machine-checked**; "Citation status" says what must be opened before use.

## Question

For a 1.5 to 3 t class excavator, which hydraulic circuit a small shop can build from catalogue
parts (fixed-pump open-centre, load-sensing, or electro-hydraulic independent metering) gets
closest to a stock machine's cycle time and fuel use, and at what parts cost, and where does the
ranking flip with duty cycle and component margins?

Open because the energy literature compares circuits on one machine with one measured cycle,
usually proprietary, and none prices the circuit from public parts lists; the open-hardware
projects (LifeTrac, the Global Village Construction Set) publish designs but no energy figures.

## Why it matters

Hydraulics is where an excavator's cost and its fuel burn both sit. A contractor, a mine or a
fabricator deciding whether to retrofit or build wants to know whether the extra cost of a
load-sensing pump or independent-metering valves pays back in fuel, and a builder of an open
machine wants the cheapest circuit that does not waste most of the engine's energy as heat.

## Related work

Energy use and circuit architecture of excavators:
- Vukovic, Leifeld and Murrenhoff, "Reducing fuel consumption in hydraulic excavators: a comprehensive analysis", *Energies* 10(5), 2017. Compares circuit and hybrid options on a simulated machine; the strongest recent survey-plus-model, and the baseline this programme must beat on openness and pricing.
- Eriksson and Palmberg, "Individual metering fluid power systems: challenges and opportunities", *Proc. IMechE Part I* 225(2), 2011. Independent-metering architecture and its control problems; sets what the `metered` rung can and cannot claim.
- Ivantysynova's group (Purdue), displacement-controlled (pump-controlled) actuators for excavators, e.g. Williamson and Ivantysynova, "Power optimization for multi-actuator pump-controlled systems", 2008 (title from memory). Pump-controlled circuits remove throttling; they need several pumps and cost more.
- Hippalgaonkar and Ivantysynova, work on hydraulic hybrid excavators (title from memory). Energy recovery on boom lowering; outside this proposal's first rungs.
- Merritt, *Hydraulic Control Systems*, Wiley, 1967; Manring and Fales, *Hydraulic Control Systems*, 2nd ed., Wiley, 2019. Textbook valve, pump and flow-compensator models that the lumped rungs use.
- Rexroth and Danfoss load-sensing application notes (margin pressure about 14 to 30 bar; value to be read from the datasheets, not recalled). The `dp_ls` range swept here.

Soil and digging:
- Reece, "The fundamental equation of earth-moving mechanics", *Proc. ICE* Symposium on Earth Moving Machinery, 1964. Cutting force from soil parameters; the load generator for milestone 3.
- McKyes, *Soil Cutting and Tillage*, Elsevier, 1985. Extends the fundamental equation to tool shapes.
- Wong, *Theory of Ground Vehicles*, 4th ed., Wiley, 2008 and Bekker, *Introduction to Terrain-Vehicle Systems*, 1969. Terramechanics for the tracked base.
- Jud et al., autonomous excavation with a walking excavator (HEAP), ETH Zurich, *Science Robotics* / *IEEE RA-L* (exact venue and year to be checked). Open autonomy on a real, instrumented machine; the data source to look for.

Open hardware and standards:
- Open Source Ecology, Global Village Construction Set (LifeTrac, hydraulic power unit), https://www.opensourceecology.org/. Open designs with parts lists; no energy accounting.
- Pearce, "Building research equipment with free, open-source hardware", *Science* 337, 2012. Cost argument for open hardware (title from memory).
- ISO 20474 (earth-moving machinery safety), ISO 10567 (hydraulic excavator lift capacity) and ISO 6015 (hydraulic excavators, terminology and commercial specifications), cited as context and for rated figures; not claimed.
- Our own: `heavy-market` (milestone 1, not built), track 16 `energy-density` for the electric rung.

## Gap

Prior work gives circuit architectures, textbook models and a few measured proprietary cycles.
Missing, and narrow enough to check: an **open, runnable energy-and-parts-cost comparison of
three buildable circuits on a published duty cycle, with a sensitivity map for the unsourced
margins** (load-sensing margin, spool drop, pump efficiency, pressure imbalance between
simultaneous actuators), and a statement of where the cheaper circuit stops being worth its energy.

## Hypotheses

- **H1 (structural ordering).** On any cycle with two or more simultaneous actuators at unequal pressure, shaft energy orders open-centre > load-sensing > independent metering. Refuted if any swept case with sourced margins reverses a pair.
- **H2 (where load-sensing pays).** The load-sensing saving over fixed open-centre grows as mean flow demand falls (the fixed pump idles at pressure). Refuted if the saving is flat or shrinks with demand.
- **H3 (metering needs imbalance).** Independent metering's saving over load-sensing is small (under 15% of shaft energy) when simultaneous actuators have similar pressure and grows with pressure spread. Refuted if it exceeds 15% at zero spread.
- **H4 (real cycle).** On a measured duty cycle from a public dataset, the modelled load-sensing to open-centre ratio is within 15% of the measured fuel ratio reported for a comparable pair of machines. Refuted if outside; this is the test that matters and is not yet run.
- **H5 (parts cost).** The extra parts cost of load-sensing over fixed open-centre is repaid in fuel within 2,000 operating hours at a sourced diesel price. Refuted if the payback exceeds 2,000 h.

## Method

Theory: closed-form shaft energy per circuit for a piecewise-constant cycle (done in
`src/heavy_hydraulics/circuits.py`); single-actuator load-sensing energy is exactly
`useful * (1 + dp/p) / eta`, used as a test. Experiments: (1) first-order sweep on an illustrative
cycle (done, milestone 1); (2) replace the cycle with one derived from digging forces
(fundamental earthmoving equation) on arm kinematics, or a published measured cycle; (3) dynamic
valve and pump models (flow compensators, relief) in a lumped simulator; (4) parts cost from
public catalogue prices (`heavy-market`); (5) the electric rung from `energy-density`.

## Evaluation

Baselines: fixed open-centre (stock-like small machines), load-sensing (mid-range stock), and the
published energy results of Vukovic et al. as the external anchor for H4. Metrics: shaft energy
per cycle, hydraulic efficiency, heat rejected, parts cost, payback hours. Sweeps are
deterministic grids reporting the share of cases where each conclusion holds; any comparison to
measured data reports a bootstrap interval over cycles.

## Milestones

1. Circuit energy model and first sweep (this session): `src/`, 6 tests, `experiments/run.py`.
2. A sourced duty cycle: from the fundamental earthmoving equation or a public measured cycle (H4).
3. Dynamic lumped model (compensator, relief, line volumes) and cycle time effects.
4. Parts cost per circuit from public catalogues, payback (H5, with `heavy-market`).
5. Energy recovery on boom lowering and the electric rung (track 16).
6. Paper draft in the venue's format.

## Target venue

*International Journal of Fluid Power* or the Bath/ASME Symposium on Fluid Power and Motion
Control (short paper), 8 to 12 pages; an aim, not a claim of acceptance.

## Citation status

None of the references above is machine-checked (Crossref blocked this session). Titles marked
"from memory" may be wrong in detail. Open each before it is relied on in a paper.
