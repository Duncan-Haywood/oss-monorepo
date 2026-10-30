# Proposal: what does a 1:N model of a cargo UAV tell you about the 1:1 aircraft?

Programme `aerolog-scaling`, opened 2026-10-27 as the first programme of track 22 (`aerolog`,
`research/PROJECTS.md`). Written with AI assistance (Claude Code). This is a plan plus one
first-order calculation: no wind-tunnel, flight or high-fidelity result exists yet. Every claim
about outside work was first written from memory; "Citation status" says which references have since been checked.

## Question

For a cargo-carrying uncrewed aircraft, which of its flight-relevant quantities does a
dynamically (Froude) scaled model at 1:2 to 1:20 reproduce within a stated tolerance, which does it
miss, and by how much, so that a sub-scale demonstrator can be designed to *test* a full-size
configuration instead of merely resembling it?

Open because similitude cannot match Froude, Reynolds and Mach numbers at once; the classical
tables (Wolowicz et al., 1979) say which to keep, but they do not give the size of the error for
a modern electric cargo VTOL, where battery, motor and structure mass fractions scale differently
from the airframe and where small-vehicle aerodynamics is dominated by low-Reynolds effects.

## Why it matters

Delivery and cargo aircraft are developed with sub-scale prototypes because they are cheap to
crash. A team deciding whether a 1:5 model's endurance, gust response or stall margin predicts the
full-size machine needs per-quantity error bars. Regulators and operators rely on the same
inference when small-drone results are extrapolated to heavier aircraft. If the answer is
"endurance does not transfer, trim and dynamic modes do", sub-scale flights should be planned
around the quantities that do.

## Related work

Similitude and dynamically scaled flight testing:
- Wolowicz, Brown and Gilbert, "Similitude requirements and scaling relationships as applied to model testing", NASA TP-1435, 1979, https://ntrs.nasa.gov/citations/19790022005. The scaling table this programme starts from; pre-electric, no battery or motor scaling, no low-Re drag estimate for small models.
- Chambers, "Modeling flight: the role of dynamically scaled free-flight models in support of NASA's aerospace programs", NASA SP-2009-575, 2009, https://ntrs.nasa.gov/citations/20110012492. History of the practice and its failures; qualitative, not a per-quantity error budget.
- Jordan, Langford, Belcastro and Foster, "Development of a dynamically scaled generic transport model testbed for flight research experiments", AUVSI Unmanned Unlimited, 2004, https://ntrs.nasa.gov/citations/20040085988 (the AirSTAR testbed; a companion report is NTRS 20050232785). A 5.5%-scale transport flown for upset research; one airframe, jet-powered, and no energy-storage question.

Low-Reynolds-number aerodynamics:
- Mueller and DeLaurier, "Aerodynamics of small vehicles", *Annual Review of Fluid Mechanics* 35, 2003, doi:10.1146/annurev.fluid.35.101101.161102. Why drag rises and lift falls below Re of about 2e5; survey, not a scaling rule for a given airframe.
- Drela, "XFOIL: an analysis and design system for low Reynolds number airfoils", in *Low Reynolds Number Aerodynamics*, Springer LNE 54, 1989, https://web.mit.edu/drela/Public/web/xfoil/. The panel/boundary-layer code we will use for polars; known to be unreliable once bubbles burst.
- Selig et al., UIUC low-speed airfoil tests, https://m-selig.ae.illinois.edu/uiuc_lsat/Low-Speed-Airfoil-Data-V1.pdf. Measured polars at Re of 4e4 to 5e5 to check XFOIL against.
- Brandt and Selig, "Propeller performance data at low Reynolds numbers", AIAA 2011-1255, https://m-selig.ae.illinois.edu/props/propDB.html. Measured small-propeller efficiency, the check on how the powertrain loses at scale.

Delivery-drone energy, cost and operations:
- Stolaroff et al., "Energy use and life cycle greenhouse gas emissions of drones for commercial package delivery", *Nature Communications* 9, 2018, doi:10.1038/s41467-017-02411-5. Energy per parcel for one multicopter model; does not vary scale.
- Rodrigues et al., "Drone flight data reveal energy and greenhouse gas emissions savings for very small package delivery", *Patterns* 3, 2022, doi:10.1016/j.patter.2022.100569. Measured flights of one delivery quadcopter; the real-data anchor for the energy model.
- D'Andrea, "Guest editorial: Can drones deliver?", *IEEE Transactions on Automation Science and Engineering* 11, 2014, doi:10.1109/TASE.2014.2326952. The economics framing; no scaling argument.
- Murray and Chu, "The flying sidekick traveling salesman problem", *Transportation Research Part C* 54, 2015, doi:10.1016/j.trc.2015.03.005. Operations side, for the later fleet milestone.

Design tools and full-size concepts:
- Sharpe, AeroSandbox (MIT thesis, 2021), https://github.com/peterdsharpe/AeroSandbox. Differentiable aircraft design tool (MIT licence); the intended engine for full-size and model sizing.
- Johnson, Silva and Solis, "Concept vehicles for VTOL air taxi operations", AHS Technical Conference, 2018, https://ntrs.nasa.gov/citations/20180003381. Open full-size VTOL sizing method that transfers to cargo.
- Raymer, *Aircraft Design: A Conceptual Approach*, AIAA, 6th ed. 2018. Weight and drag build-up relations for the full-size side.
- Hoekstra and Ellerbroek, "BlueSky ATC simulator project", ICRAT 2016, https://github.com/TUDelft-CNS-ATM/bluesky. For the later airspace milestone.

## Gap

Prior work gives the similitude table and warns that Reynolds number will not match. What is
missing, and narrow enough to check, is a **per-quantity error budget for a Froude-scaled model of
an electric cargo aircraft, across scale 1:2 to 1:20 and across the airframe parameters a
designer would vary**, with the energy side (cells, motor, propeller) included, plus an open
calculator that returns it. Our own `osrobot-uav`, `codesign-aero` and `uav-energy-twin` projects
size airframes at one scale and are prior work; none compares two scales.

## Hypotheses

- **H1 (what transfers).** Trim speed, mode frequencies and the response to a scaled gust agree between the 1:1 aircraft and its Froude model within 3% for n down to 0.1, in a vortex-lattice plus flight-dynamics model. Refuted if any exceeds 5%.
- **H2 (drag).** The Froude model needs at least 20% more power per unit of Froude-scaled power at n = 0.1 than the full-size aircraft (base-case first-order estimate already gives +27%, flat-plate drag only), and the figure stays above 20% when drag comes from XFOIL polars. Refuted if the XFOIL-based ratio is below 1.10.
- **H3 (stall).** The model's usable maximum lift coefficient at n = 0.1 is at least 0.2 below the full-size one for a cambered cargo wing. Refuted if the gap is under 0.1.
- **H4 (powertrain).** Motor-plus-propeller efficiency at n = 0.1 is at least 10 percentage points below full size, measured on UIUC propeller data. Refuted if under 5 points.
- **H5 (what a designer should do).** There is a corrected model (altered wing loading or airfoil) that restores H2 to within 5% at n = 0.2 without breaking H1. Refuted if no such correction exists in the design space searched.

## Method

Theory: derive the Froude table from the two invariants (Froude number and relative density),
then derive the first-order drag and battery corrections in closed form (`src/`: done). Experiments:
(1) trim, modes and gust response from a vortex-lattice model at n in {1, 0.5, 0.2, 0.1, 0.05}
(AeroSandbox); (2) section polars from XFOIL, checked against Selig's measured data; (3)
propeller and motor efficiency from the UIUC database; (4) energy against the Rodrigues et al.
measured flights; (5) a correction search for H5.

## Evaluation

Baselines: pure Froude scaling (the table), and Froude plus a flat-plate Reynolds correction (the
first-order model here). Measured data: UIUC airfoil and propeller databases, the Rodrigues flights.
Metrics: relative error per quantity per n. Sensitivity: sweep airframe parameters (aspect ratio,
form factor, wetted area, lift coefficient) and cell specific energy over published ranges;
report whether each conclusion survives the whole sweep. Statistics apply to the empirical
checks (seeds, bootstrap intervals over flights); the model sweeps are deterministic.

## Milestones

1. First-order calculator and result (this session): `src/`, 9 tests, `experiments/run.py`.
2. Reproduce NASA TP-1435's table from the invariants and open the paper to check it; open every reference here.
3. Vortex-lattice and flight-dynamics model in AeroSandbox; test H1.
4. XFOIL polars against Selig data; tests H2 and H3.
5. Powertrain efficiency from UIUC propeller data; tests H4.
6. Energy against Rodrigues et al. flights; H2 calibration.
7. Correction search (H5); sub-scale demonstrator specification for `aerolog-sitl`.
8. Paper draft in the venue's format.

## Target venue

AIAA SciTech (Aircraft Design or Applied Aerodynamics sessions), 12 to 16 pages, or the
*Journal of Aircraft* / *Aerospace Science and Technology* for the full study. An aim, not a claim
of acceptance.

## Citation status

Checked on 2026-10-27 (second session, registries reachable): `research/_shared/cite_check.py` confirmed
four of the five DOIs (Mueller and DeLaurier, Stolaroff et al., D'Andrea, Murray and Chu); Crossref
confirmed Rodrigues et al. (*Patterns*, Aug 2022, six authors) and Brandt and Selig
(doi:10.2514/6.2011-1255). The NTRS API confirmed TP-1435 (authors **Wolowicz, Brown and Gilbert**,
id 19790022005), Chambers (NASA/SP-2009-575, id 20110012492), Johnson, Silva and Solis (id
20180003381) and Jordan et al. (id 20040085988). The first draft of this file had the wrong middle
author for TP-1435 and wrong NTRS ids for three entries; they are corrected above. The UIUC pages
(propeller database, low-speed airfoil data) answered HTTP 200. Not re-opened: the venue and
publisher of Jordan et al. (the NTRS record gives the title and authors; check the proceedings
before it goes in a paper), Drela's 1989 chapter, Raymer 6th edition, and the BlueSky paper.
