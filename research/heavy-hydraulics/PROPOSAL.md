# Proposal: which open hydraulic circuit gets a small excavator closest to stock energy use for the least money?

Programme `heavy-hydraulics`, opened 2026-10-28 as the first programme of track 25 (`heavy`,
`research/PROJECTS.md`, milestone 2). Written with AI assistance (Claude Code). This is a plan
plus one first-order calculation; no bench, field or simulator result exists. The DOI registry
(Crossref) was unreachable from this session (403 through the egress proxy), so `cite_check.py` could not run;
the DOIs, arXiv id and venues of the entries above were confirmed by web search instead, and
"Citation status" says what remains unchecked.

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
- Vukovic, Leifeld and Murrenhoff, "Reducing fuel consumption in hydraulic excavators: a comprehensive analysis", *Energies* 10(5), 687, 2017, doi:10.3390/en10050687. A Willans-approximation fuel model validated on an 18 t excavator; shows that hydraulic efficiency alone can mislead. The baseline this programme must match on rigour and add openness and pricing to.
- Eriksson and Palmberg, "Individual metering fluid power systems: challenges and opportunities", *Proc. IMechE Part I* 225(2):196-211, 2011, doi:10.1243/09596518JSCE1111. Review of independent metering layouts and control; sets what the `metered` rung can and cannot claim.
- Williamson, "Power management for multi-actuator mobile machines with displacement controlled hydraulic actuators", PhD thesis, Purdue University, 2010, https://docs.lib.purdue.edu/dissertations/AAI3449412. Measured fuel reductions of a displacement-controlled 5 t compact excavator (reported 56% on a load-positioning cycle against the same system unoptimised); the external anchor for H4. The Caterpillar 40% truck-loading figure seen in a search summary was not traced to a source and is not used.
- Ivantysynova's group, Maha Fluid Power Research Center, publication list, https://engineering.purdue.edu/Maha/publications_ivantysynova. Pump-controlled excavator prototypes (e.g. Busquets and Ivantysynova, first displacement-controlled excavator with pump switching; exact reference to be opened). Removes throttling at the cost of several pumps.
- "Motion control of multi-actuator hydraulic systems for mobile machineries: recent advancements and future trends", *Frontiers of Mechanical Engineering* 13(2), 2018, https://journal.hep.com.cn/fme/EN/Y2018/V13/I2/151. A review found by search; authors and findings to be read before citing. Context for the pump-controlled and metered families.
- "Energy saving potential of load sensing system with hydro-mechanical pressure compensation and independent metering", *International Journal of Fluid Power*, https://journals.riverpublishers.com/index.php/IJFP/article/view/168. Found by search; authors, year and numbers to be read. The closest prior comparison of load-sensing against independent metering, and a candidate H4 anchor.
- Manring and Fales, *Hydraulic Control Systems*, 2nd ed., Wiley, 2019 (ISBN 978-1-119-41647-0); Merritt, *Hydraulic Control Systems*, Wiley, 1967. Textbook valve, pump and compensator models.
- Load-sensing application notes from valve makers (margin pressure about 14 to 30 bar): to be read from datasheets, not recalled; the `dp_ls` range swept here.

Soil and digging:
- Reece, "The fundamental equation of earth-moving mechanics", *Proc. ICE* Symposium on Earth Moving Machinery, 1964, and McKyes, *Soil Cutting and Tillage*, Elsevier, 1985. Cutting force from soil parameters; the load generator for milestone 2.
- Wong, *Theory of Ground Vehicles*, 4th ed., Wiley, 2008. Terramechanics for the tracked base. Project Chrono, https://projectchrono.org/ (BSD-3), for deformable soil if it installs.
- Jud, Kerscher, Wermelinger, Jelavic, Egli, Leemann, Hottiger and Hutter, "HEAP: the autonomous walking excavator", *Automation in Construction* 129, 103783, 2021, arXiv:2106.05059. Open autonomy on a real, instrumented machine with three arm actuation principles compared; a data source to look for.

Open hardware and standards:
- Open Source Ecology, Global Village Construction Set (LifeTrac, hydraulic power unit), https://www.opensourceecology.org/. Open designs with parts lists; no energy accounting.
- Pearce, "Building research equipment with free, open-source hardware", *Science* 337(6100):1303-1304, 2012, doi:10.1126/science.1228183. The cost argument for open hardware.
- ISO 20474 (earth-moving machinery safety) and ISO 10567 (hydraulic excavator lift capacity), cited as context, not claimed.
- Our own: `heavy-market` (milestone 1 of track 25, not built); track 16 `energy-density` for the electric rung.

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

`cite_check.py` could not run (Crossref 403). A web search confirmed the Vukovic, Eriksson and
Palmberg, Pearce and HEAP entries (an earlier draft had HEAP in the wrong journal; corrected).
Williamson's thesis was found by title. Found by search title only (not opened): the two review/IJFP entries. Not opened: Reece, McKyes, Wong, Merritt, Manring and
Fales (book details only), the valve-maker notes, the Busquets and Ivantysynova paper and the ISO
standards. Open each before it is relied on in a paper.
