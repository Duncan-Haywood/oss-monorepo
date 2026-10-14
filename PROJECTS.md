# Priority projects

The owner's priority projects, set on 2026-10-12, with tracks 7 to 9 added on 2026-10-14. Runs
started from `prompt.md` take their new work from here. There are nine tracks. Each one is
open-ended: its milestones are a starting order, not a checklist, so follow the results. Every
project a track produces is a normal `research/<slug>/` project. It needs a README, tests, a
README bullet, a `site/projects.json` entry and a passing `python site/build.py`, as `CLAUDE.md`
says. Every rule in `prompt.md` still applies, research integrity above all.

## Picking work

1. **Pick a track at random.** Draw a uniform random number and map it to the nine tracks. Four
   runs start in the same minute, and a random pick spreads them out.
2. **Take the track's next free milestone.** That is the first one that is not on `main` (check
   `research/` for the slug), not claimed by an open pull request, and not on a branch pushed
   in the last three hours. When the listed milestones are done, take the next step from the
   latest project's "Next steps" section in that track.
3. **Use the track's slug prefix and theme.** The prefix starts the slug (`selfrep-closure`).
   The theme id goes in `site/projects.json`. The first project in a track adds that theme,
   with a `--t-<id>` colour in both the light and dark blocks of `site/template.html`.

| Track | Prefix and theme id |
|---|---|
| 1. Self-replicating manufacturing | `selfrep` |
| 2. Ambient AI assistant | `ambient` |
| 3. LLM chip design loops | `chip` |
| 4. General-purpose robot manufacturing loops | `robofab` |
| 5. Simulation-first design | `simdesign` |
| 6. Engineered clothing | `garment` |
| 7. Automated algorithmic chip-design loops | `eda` |
| 8. Task-specific AI accelerators | `accel` |
| 9. Open-source purpose-built robots | `osrobot` |

## Rules for every track

- **Simulation first.** Every physical claim starts as a model that runs in the cloud container,
  on a CPU, in minutes. Hardware, purchases, fabrication and physical tests are owner steps.
  List them under "Owner steps" in the README, with a bill of materials and a source and date
  for every price. Never do them or order them yourself.
- **In-house.** Build on open-source tools that install with pip, apt, conda or a released
  binary. No paid services, no proprietary CAD, EDA or simulators, and no closed API that a
  result depends on. End each README with "Outside dependencies": what the project could not
  make or run itself. These are its *vitamins*; see track 1.
- **The loop.** Most tracks share one shape. A design written as code (CAD, RTL, a sewing
  pattern, a robot program) is scored by a simulator, a proposer changes it, and the cycle
  repeats. Compare every proposer against a baseline that uses no LLM, such as random search,
  a grid, CMA-ES or Bayesian optimisation, at the same evaluation budget.
- **LLMs in the loop.** The run environment has no model API key. Put model calls behind an
  environment variable (for example `ANTHROPIC_API_KEY`), with a deterministic stub so tests
  pass without it. With no key, the session may act as the proposer itself. Commit each
  proposal as a file, keep the scoring scripted, and label those results as written by the
  session agent, with the number of attempts. Never present them as a reproducible LLM
  benchmark.
- **Useful by-products.** Prefer milestones whose output is useful on its own: a printable
  part, a sewing pattern, a tool, a dataset.
- **Lab tags where they fit.** Tracks 4, 5 and 9 build naturally on the groups in `prompt.md`.
  Where a project builds on none of them, say so instead of stretching a connection.
- **Simulated is not real.** Say what each model leaves out, and keep simulated performance
  apart from any claim about a physical device.

## 1. Self-replicating manufacturing (`selfrep`)

**Goal.** A von Neumann-style factory that stays on Earth: a set of machines that can make
copies of itself, and useful goods along the way, while importing as little outside material
as possible. How close to full closure can a small shop get, how fast does it grow, and what
should it build next?

*Closure* is the share of a machine's parts, by count, mass or cost, that the system can make
itself. *Vitamins* are the parts it cannot make, such as motors, electronics, bearings and
fasteners (the RepRap project's term).

**Prior work.** von Neumann (1966), *Theory of Self-Reproducing Automata*. Freitas and
Gilbreath (eds., 1982), *Advanced Automation for Space Missions*, NASA CP-2255. Freitas and
Merkle (2004), *Kinematic Self-Replicating Machines*. Jones et al. (2011), "RepRap – the
replicating rapid prototyper", *Robotica*. Zykov et al. (2005), "Self-reproducing machines",
*Nature*. Lackner and Wendt (1995), "Exponential growth of large self-reproducing machine
systems", *Mathematical and Computer Modelling*. Open Source Ecology's Global Village
Construction Set.

**Milestones.**
1. `selfrep-closure`: model one real open machine (a RepRap-class printer, from its published
   bill of materials) as a graph of parts, materials and processes. Compute part, mass and
   cost closure for growing seed shops: printer alone; plus CNC router and laser cutter; plus
   metal casting. List the vitamins, with a source for each figure.
2. `selfrep-nextmachine`: choose which machine or process to add next to gain the most closure
   per dollar or per hour, as an integer program or greedy rule. Check it against exhaustive
   search on small instances.
3. `selfrep-growth`: simulate a replicating shop as a discrete-event model (SimPy) or ODE, with
   vitamin imports, replication time and failure rates. Report doubling time against import
   budget, and compare with Lackner and Wendt's growth model.
4. `selfrep-reinvest`: split output between building more machines and making useful or
   sellable goods, as an optimal-control problem. Compare bang-bang and smooth policies and
   report the value of the goods produced.
5. `selfrep-materials`: work out the mass and energy balance of material recycling, such as
   shredding plastic into filament and casting aluminium. Which imported materials dominate?
6. Later: robots that assemble the shop's own parts (track 4), and machines redesigned to need
   fewer kinds of vitamin (track 5's loop).

## 2. Ambient AI assistant (`ambient`)

**Goal.** An always-on, audio-first assistant. It listens, follows context, and speaks into
your ear only when that helps, with an occasional glanceable display. The first prototype is a
background phone app with earbuds, Android first. Later comes a small custom wearable. A
discreet variant is secondary (see the guardrails below). When should an always-on assistant
speak, and how fast and cheap can the pipeline run on the device?

**Prior work.** Horvitz (1999), "Principles of mixed-initiative user interfaces", CHI, on when
to interrupt. Lu et al. (2025), "Proactive Agent", ICLR. Radford et al. (2023), Whisper, ICML.
whisper.cpp (MIT). Silero VAD (MIT). Omi (MIT), an open-source AI wearable. For speech
synthesis, Piper's original MIT repository is archived; its successor is GPL-3.0, so check the
licence before bundling it.

**Milestones.**
1. `ambient-pipeline`: run a streaming pipeline on recorded audio in the container, using open
   models on a CPU: voice activity detection, then speech recognition, an LLM and speech
   synthesis. Measure latency, real-time factor and memory per stage, and derive the latency
   budget for a reply that feels natural.
2. `ambient-interject`: decide when to speak, simulation first. Build simulated conversations,
   scripted or generated and then labelled, that mark the moments where help is wanted.
   Compare policies such as a wake word, keyword or intent triggers, confidence thresholds and
   a learned classifier. Score precision of interruptions, missed chances and an annoyance
   cost. The simulated speakers are digital twins of real conversations, so say what they
   leave out.
3. `ambient-memory`: turn a day of transcripts into retrieval and summaries, on the device,
   with retention limits.
4. `ambient-android`: build an Android prototype as a Kotlin foreground service with microphone
   access, Bluetooth headset routing, on-device voice detection and streaming to the
   pipeline. Build it if the Android SDK installs; otherwise ship the sources and unit tests
   and say the app is unbuilt. iOS (Swift, background audio mode) comes after. Building it
   needs the owner's Mac.
5. `ambient-wearable`: design a custom wearable for the owner to build: a microcontroller, a
   MEMS microphone and Bluetooth LE audio. Give a power budget from datasheets, a priced bill
   of materials, and firmware that compiles in the container. Compare it with Omi.
6. `ambient-glance`: add occasional visual output, such as a watch notification or a small
   e-ink or LED display. When is a glance better than speech?

**Guardrails: discreet, not covert.** In scope: inconspicuous hardware (one earbud, bone
conduction, no visible screen), output that only the wearer perceives, and low-profile
controls. Out of scope: hiding recording from people whose consent the law requires,
defeating the operating system's microphone indicators, and evading exam proctoring,
interview checks or anti-cheating tools. US federal law needs one party's consent to record a
conversation, but some states need everyone's, California among them. By default, process
audio on the device, keep no raw audio unless the user opts in, and state the consent rules in
each README.

## 3. LLM chip design loops (`chip`)

**Goal.** Put LLMs into the hardware design loop with an all-open toolchain, and aim the loop
at small AI accelerators: AI designing the chips that AI runs on. The loop runs from a spec to
RTL, then simulation and formal checks, synthesis, place and route, and PPA (power,
performance and area).

**Prior work.** Liu et al. (2023), VerilogEval, ICCAD. Lu et al. (2024), RTLLM, ASP-DAC. Liu
et al. (2023), ChipNeMo, arXiv. Blocklove et al. (2023), Chip-Chat, MLCAD. On learned placement
and the debate over reproducing it: Mirhoseini et al. (2021), *Nature*, and Cheng et al.
(2023), ISPD. Tools: Yosys, Icarus Verilog, Verilator, cocotb, OpenROAD and the SkyWater SKY130
open PDK. Tiny Tapeout is the path to a real chip. Since Efabless shut down in 2025, its
shuttles run on SKY130, IHP SG13G2 and GF180MCU.

**Milestones.**
1. `chip-toolchain`: install the open flow reproducibly in the container (Yosys, Icarus or
   Verilator, cocotb, and OpenROAD if it installs). Report synthesis area and depth for a few
   smoke designs and record tool versions.
2. `chip-rtl-loop`: generate RTL with feedback on a small task suite, with your own
   testbenches or a licence-compatible subset of a published benchmark. Measure pass rate
   against the number of feedback rounds from lint, simulation and formal equivalence checks.
3. `chip-ppa-loop`: have a proposer rewrite working designs (adders, multipliers, FIFOs).
   Check each rewrite for equivalence with Yosys or SymbiYosys, score area and delay with
   Yosys and ABC, and compare with a parameter-sweep baseline.
4. `chip-accel`: build a parameterised MAC or systolic-array accelerator for a tiny quantised
   MLP. Check it cycle by cycle against a NumPy reference, then explore array size and bit
   width against area and throughput.
5. `chip-pnr`: place and route on SKY130 with OpenROAD. How far do synthesis-only PPA
   estimates sit from post-layout numbers? It is a fidelity question, like the twin projects.
6. Later: a design sized for Tiny Tapeout and ready to submit. Submitting it, and paying for
   it, is the owner's call.

## 4. General-purpose robot manufacturing loops (`robofab`)

**Goal.** General-purpose robot arms that make and assemble things, including their own parts
and track 1's shop. Each process is designed, programmed and checked in simulation before
anything runs on hardware. It connects to CAIRO (task and motion planning, learning from
demonstration) and HIRO (workcell twins); cite them as `prompt.md` says.

**Prior work.** Liang et al. (2023), "Code as Policies", ICRA. Narang et al. (2022), "Factory",
RSS. Tang et al. (2023), "IndustReal", RSS. Tian et al. (2024), "ASAP", ICRA. Todorov et al.
(2012), MuJoCo, IROS. Hugging Face LeRobot, and the SO-101 open arm.

**Milestones.**
1. `robofab-sequence`: plan the assembly order of a small product, such as a gearbox of printed
   parts, by assembly-by-disassembly with collision and stability checks in simulation.
   Compare it with an LLM-proposed order checked in the same simulator.
2. `robofab-insert`: learn peg-in-hole and snap-fit insertion with domain randomisation, and
   measure transfer across simulator fidelity (sim to sim). Build on the repository's twin
   projects.
3. `robofab-program`: check LLM-written robot programs in a digital twin before they run. How
   many failures does the twin catch, and at what fidelity?
4. `robofab-cell`: model a cell of an arm, a 3D printer and an inspection station as a
   discrete-event twin. Schedule it for throughput as a job shop, and find the bottleneck.
5. `robofab-selfparts`: in simulation, have the arm assemble part of a copy of its own gripper
   or arm from printed parts (joins track 1).
6. Owner steps: test the best simulated result on a low-cost open arm such as the SO-101, with
   a priced bill of materials in the README.

## 5. Simulation-first design (`simdesign`)

**Goal.** The shared engine for the other tracks: a design written as code is simulated,
optimised and turned into manufacturing files, with an open toolchain kept in-house. Each
project here should ship something another track can use.

**Prior work.** CadQuery and build123d for CAD as code. Gustafsson and McBain (2020),
scikit-fem, *JOSS*. Sigmund (2001), "A 99 line topology optimization code written in Matlab",
*Structural and Multidisciplinary Optimization*. MuJoCo.

**Milestones.**
1. `simdesign-bracket`: build a parametric part (CadQuery or build123d), analyse it with finite
   elements (scikit-fem) and optimise a printable bracket under load. Export an STL and check
   printability (overhangs, minimum wall).
2. `simdesign-topopt`: reproduce Sigmund's 99-line topology optimisation in Python, then turn
   the density field into printable CAD.
3. `simdesign-fidelity`: compare beam theory with 2D and 3D finite elements. When does the
   cheaper model pick the same design? This is the repository's central sim-fidelity theme.
4. `simdesign-llm`: score LLM-proposed designs in the simulator against CMA-ES and Bayesian
   optimisation at equal evaluation budgets.
5. `simdesign-dfm`: add manufacturability constraints for the processes track 1's shop has:
   FDM printing, CNC routing, laser cutting and casting.

## 6. Engineered clothing (`garment`)

**Goal.** Fashion from an engineering point of view, with two questions. Designer pieces sell
for $5,000 to $10,000: what do they cost to make, and how close can a $20 to $50 build get?
And with a real budget of a few hundred to a few thousand dollars, what can materials science,
mechanics and electronics do for clothes? Think protection, athletic assistance, smart
garments, and fabrics that manage light, radio waves and heat.

**Prior work.** FreeSewing for parametric sewing patterns. Baraff and Witkin (1998), "Large
steps in cloth simulation", SIGGRAPH. Bennell and Oliveira (2008), "The geometry of nesting
problems: A tutorial", *EJOR*. Cunniff (1999), on dimensionless parameters for textile body
armour. Lee, Wetzel and Wagner (2003), on Kevlar treated with shear-thickening fluid. Collins
et al. (2015), an unpowered ankle exoskeleton, *Nature*. Kim et al. (2019), a portable
exosuit, *Science*. Seth et al. (2018), OpenSim. Poupyrev et al. (2016), "Project Jacquard",
CHI. Hsu et al. (2016), a radiative-cooling textile, *Science*. Zhang et al. (2019), a textile
that gates infrared, *Science*. Thys et al. (2019) and Xu et al. (2020), adversarial patterns
against person detectors. Gagge et al.'s two-node thermoregulation model and ISO 7730 for
thermal comfort. The Clean Clothes Campaign on where a garment's retail price goes.

**Milestones.**
1. `garment-teardown`: build a cost model for a garment: fabric area from the pattern times
   price per metre, trims, labour minutes times regional wage, overhead and volume. Apply it
   to a few designer garments with public retail prices, citing each price and its date.
   Where does the price go, and what does a $20 to $50 replica keep or lose in fabric,
   construction and fit?
2. `garment-pattern-fit`: drape parametric patterns (FreeSewing or your own code) on a body
   model with cloth simulation. Score fit by strain, gaps and drape, and optimise the pattern
   for a target body.
3. `garment-nesting`: nest pattern pieces on fabric to cut waste (marker making, an operations
   research problem). Compare greedy, metaheuristic and exact methods on small markers.
4. `garment-thermal`: model the heat balance between body, clothing and surroundings (the
   two-node model, ISO 7730 comfort) with fabric optical properties. How much does a
   radiative-cooling or infrared-gating textile change comfort, and which properties matter
   most?
5. `garment-protective`: analyse protective tailoring in the style of Cunniff: aramid,
   UHMWPE and shear-thickening-fluid fabrics, trading areal density against protection and
   flexibility. What would a suit that looks like a suit weigh and cost? Modelling only.
6. `garment-assist`: simulate an elastic or soft-exosuit garment on a musculoskeletal model
   (OpenSim or MyoSuite). Report the change in metabolic cost or joint torque against the
   added mass.
7. `garment-smart`: feed sensing garments (IMU, strain or capacitive textile sensors) into
   track 2's assistant. Recognise activity and gestures from simulated or public sensor data.
8. `garment-optics`: study light and radio in fabric: structural colour, infrared signature,
   RF-shielding fabrics, and adversarial patterns tested against open-source person detectors
   in rendered scenes.

Each project prices a build at about $300, $1,000 and $3,000, with sourced material prices.
Building it is an owner step.

**Guardrails.**
- *No counterfeits.* Copy no logos, brand names, signature prints or trade dress, and make
  nothing that could be sold as, or mistaken for, the original. In the US, copyright does not
  cover a garment's cut or shape, only artistic features separable from it (*Star Athletica v.
  Varsity Brands*, 2017). A design patent can still protect a particular garment, though. In
  the EU, a new design is protected against copying for three years from first disclosure even
  when unregistered (the unregistered EU design). Check which applies before copying a
  distinctive piece.
- *No protection claims from simulation.* A garment is armour only after certified testing,
  such as to NIJ Standard 0101.07 (ballistic) or 0115.00 (stab), and the README must say so.
  Some US states restrict civilian body armour; New York is one (Penal Law § 270.21).
- *Adversarial patterns are privacy research.* Test them against open models only.

## 7. Automated algorithmic chip-design loops (`eda`)

**Goal.** A chip-design loop that runs unattended on an all-open toolchain and needs no LLM.
Algorithms propose designs and flow settings, and open simulators and tools score them. A
specification and a search space go in. Checked RTL, a Pareto front of power, performance and
area, and a log of every evaluation come out. The simulators are part of the subject: a cheap
cost model, cycle-accurate simulation, synthesis, and place and route form a fidelity ladder.
That ladder is the chip-design form of the repository's digital-twin theme. Which rung ranks
designs like the expensive one, and how should a fixed compute budget be spread across the
rungs?

**How it relates to track 3.** Track 3 asks what an LLM adds to the loop. It already has the
flow (`chip-toolchain`, `chip-pnr`) and a first search over ABC scripts (`chip-scriptsearch`).
This track builds the loop as a reusable tool, makes the algorithmic proposers strong, and gives
track 3 the baselines it compares against. Reuse track 3's designs and wrappers rather than
rebuilding them. LLM proposers belong to track 3 and plug into this track's harness.

**Prior work.** Ajayi et al. (2019), on OpenROAD's aim of a flow with no human in the loop,
DAC. Brayton and Mishchenko (2010), ABC, CAV. Yu, Xiao and De Micheli (2018), synthesis flows
developed without human knowledge, DAC. Hosny et al. (2020), DRiLLS, ASP-DAC. Neto et al.
(2023), FlowTune, *IEEE TCAD*. Jung et al. (2021), METRICS2.1 and OpenROAD's AutoTuner, ICCAD.
Huang et al. (2021), a survey of machine learning for EDA, *ACM TODAES*. On search and fidelity:
Deb et al. (2002), NSGA-II; Li et al. (2018), Hyperband, *JMLR*; Peherstorfer, Willcox and
Gunzburger (2018), a survey of multifidelity methods, *SIAM Review*. Fine and Ziv (2003),
coverage-directed test generation, DAC. Tools: Yosys and ABC, Verilator, Icarus Verilog, cocotb,
SymbiYosys, OpenROAD and OpenROAD-flow-scripts, the SKY130 PDK, and Optuna.

**Milestones.**
1. `eda-harness`: the loop as a tool. One command takes a parameterised design generator and a
   search space, and runs each candidate through lint, simulation against a reference model, an
   equivalence or property check, synthesis and, optionally, place and route. It caches results
   by design hash and logs each evaluation as a JSON line. Proposers plug in behind one
   interface. Demonstrate it on `chip-accel`'s MAC engine, report where the wall time goes by
   stage, and publish the evaluation log as a dataset.
2. `eda-proposers`: compare algorithmic proposers on the harness at equal evaluation budgets:
   random search, a grid, simulated annealing, a genetic algorithm, NSGA-II for several
   objectives, and Bayesian optimisation (TPE or a Gaussian process). Report Pareto-front
   hypervolume against evaluations, over seeds, with confidence intervals.
3. `eda-flowtune`: tune the flow instead of the design. Search ABC pass sequences and OpenROAD
   settings (utilisation, clock period, placement density) with a bandit or Bayesian
   optimisation, in the spirit of FlowTune and AutoTuner. This extends `chip-scriptsearch` and
   `chip-pnr`. Does the best recipe for one design transfer to another?
4. `eda-fidelity`: build the fidelity ladder (an analytical cost model, cycle-accurate Verilator
   simulation, synthesis-only PPA, post-route PPA) and measure the rank correlation between rungs
   over the logged designs. Then run a multi-fidelity search, such as successive halving or
   Hyperband, that promotes candidates up the ladder. How much post-route budget does it save for
   the same front?
5. `eda-surrogate`: train a surrogate on the evaluation log that predicts post-route PPA from RTL
   or netlist features, and use it to screen proposals. Report held-out error, the evaluations
   saved, and what happens when the design family changes.
6. `eda-verify`: put verification in the loop, with coverage-directed random tests in cocotb and
   formal properties in SymbiYosys. Inject bugs (mutations) into known-good designs and measure
   how many the automated checks catch per CPU-minute.
7. Later: an unattended run from a written specification to a Tiny Tapeout-sized layout, with
   track 3's LLM proposer and this track's best algorithm compared head to head in the same
   harness. Submitting a design, and paying for a shuttle, is the owner's call.

**Guardrails.**
- *Open tools only.* No commercial EDA tool, not even under a free academic licence.
- *Versions travel with results.* Record every tool version and PDK commit next to each number,
  because PPA moves between releases.
- *Not sign-off.* Post-route numbers from an open flow are estimates. They are not sign-off
  results and say nothing measured about silicon.
- *Equal budgets.* Claims for learned methods in EDA have been disputed (see Cheng et al., 2023,
  in track 3). Report every comparison at an equal evaluation budget, with seeds and the logged
  runs, and claim only what those runs show.

## 8. Task-specific AI accelerators (`accel`)

**Goal.** Small accelerators designed together with the AI model for one particular task,
instead of a general engine sized for any network. The model (architecture, width,
quantisation, sparsity) and the hardware (dataflow, array shape, bit width, on-chip memory) are
searched together against the task's own measures: accuracy, latency, energy per inference and
area. The tasks come from the other tracks. Examples are always-on voice detection and keyword
spotting for track 2's assistant, a control or grasp network inside track 4's robot loop,
inspection in track 1's shop, surrogate models for track 5's simulators, and the robots of
track 9. For a fixed task and budget, how much does co-design beat pairing the best model with
a generic accelerator? Which features of the task decide the hardware?

**How it relates to track 3.** `chip-accel` and the `chip-systolic-*` projects sized a generic
MAC-lane engine and systolic arrays for a toy quantised MLP. At that size the systolic array did
not pay. This track starts from a real task and dataset, and lets the model change too. Build on
track 3's RTL and checks, and on track 7's harness once it exists.

**Prior work.** Jouppi et al. (2017), the TPU, ISCA. Chen, Emer and Sze (2016), Eyeriss and its
row-stationary dataflow, ISCA. Sze et al. (2017), a tutorial and survey on efficient processing
of deep neural networks, *Proc. IEEE*. Parashar et al. (2019), Timeloop, ISPASS. Wu, Emer and
Sze (2019), Accelergy, ICCAD. Samajdar et al. (2020), SCALE-Sim, ISPASS. Genc et al. (2021),
Gemmini, DAC. Umuroglu et al. (2017), FINN, FPGA. Duarte et al. (2018), the paper behind hls4ml,
*JINST*. Jacob et al. (2018), integer-only quantised inference, CVPR. Lin et al. (2020),
MCUNet, NeurIPS. Lin, Yang and Han (2021), NAAS, DAC. Banbury et al. (2021), MLPerf Tiny.
Warden (2018), the Speech Commands dataset. Zhang et al. (2017), "Hello Edge", keyword spotting
on microcontrollers. Horowitz (2014), energy per operation, ISSCC.

**Milestones.**
1. `accel-kws`: a keyword-spotting accelerator for track 2's wake word. Train small quantised
   models (an MLP, or a depthwise-separable CNN on MFCC features) on Speech Commands, on a CPU.
   Sweep model size and bit width. Map each model to RTL, checked bit for bit against an integer
   NumPy reference. Report accuracy against cycles, cell area and estimated energy per inference,
   and compare the always-on power with `ambient-wearable`'s budget.
2. `accel-codesign`: search the model and the hardware together, with NSGA-II or Bayesian
   optimisation. Compare against a sequential baseline that picks the best model first and then
   sizes hardware for it, at equal evaluation budgets. Report the fronts of accuracy against
   energy and against area.
3. `accel-dataflow`: compare weight-, output- and row-stationary dataflows for the chosen task's
   layers with an analytical model: Timeloop and Accelergy if they install, otherwise a loop-nest
   cost model written here. Check the model's cycle counts against RTL simulation at a few
   points. This is a fidelity question.
4. `accel-policy`: an accelerator for a small control or grasp network inside track 4's arm
   loop, where the constraint is a deadline at the control rate. Compare it with running the
   same network on a microcontroller, with cycles estimated from datasheet figures.
5. `accel-sparse`: spend the task's slack on pruning, binary or ternary weights, and lookup-table
   inference. When does the task's accuracy tolerance let the hardware drop multipliers
   altogether?
6. `accel-fpga`: put the best design through an open FPGA flow (Yosys with nextpnr, for iCE40 or
   ECP5) and report LUTs and maximum clock. Buying a low-cost board and measuring its power are
   owner steps, with a priced bill of materials.
7. Later: a design sized for Tiny Tapeout (track 3, milestone 6), and accelerators for the rest
   of track 2's pipeline and for track 5's surrogates.

**Guardrails.**
- *Estimates are not measurements.* Energy and area here come from models. Name the model, and
  the process node behind any per-operation energy figure; Horowitz's table is for 45 nm.
- *Like with like.* Compare with a published accelerator only after normalising for process
  node, bit width and task, or not at all.
- *Datasets.* Check each dataset's licence before using it, and cite it.
- *Vendor back ends.* FINN_HLS4ML_NOTE

## 9. Open-source purpose-built robots (`osrobot`)

**Goal.** Open-source robots built for one job: specialised in body and software, and driven by
a purpose. Track 4 asks how far general-purpose arms can go. This track starts from the task
and lets it decide the body, sensors, actuators and software, all of them open: ROS 2, MuJoCo or
Gazebo, open flight stacks and open hardware. Candidate purposes include a lab-automation robot
(HIRO's robots in chemistry labs), an agricultural robot such as a FarmBot-style gantry, a UAV
for targeted weather observation (RECUV), a field or subterranean mapping robot (ARPG), and an
assistive robot that works beside a person (CAIRO). When does a robot built for one job beat a
general-purpose robot doing it, on cost, speed and reliability? How should its design be
chosen?

**Prior work.** Macenski et al. (2022), ROS 2, *Science Robotics*. Koenig and Howard (2004),
Gazebo, IROS. Todorov et al. (2012), MuJoCo (track 4). Meier, Honegger and Pollefeys (2015),
PX4, ICRA. Grimminger et al. (2020), the Open Dynamic Robot Initiative's open legged robots,
*IEEE RA-L*. Ha (2019), learning a body and its policy together, *Artificial Life*. Zhao et al.
(2020), RoboGrammar, *ACM TOG*. Burger et al. (2020), a mobile robotic chemist, *Nature*.
Erickson et al. (2020), Assistive Gym, ICRA. Open projects: FarmBot, Opentrons, ArduPilot and
LeRobot.

**Milestones.**
1. `osrobot-specialise`: specialised against general. Take two or three tasks, such as pipetting,
   pick-and-place sorting and weeding a bed. For each, model a purpose-built design (a gantry, a
   SCARA arm or a fixed-path mechanism) and a general-purpose arm, such as track 4's SO-101,
   doing the same job in simulation. Compare bill of materials, cycle time, success rate and
   energy. Where is the break-even?
2. `osrobot-morph`: design the body and the controller together for one task. Search link
   lengths, joint count and layout, with the controller tuned in the loop in MuJoCo, against a
   fixed off-the-shelf body at the same budget, in the spirit of Ha (2019) and RoboGrammar.
3. `osrobot-lab`: build a digital twin of a liquid-handling bench (an Opentrons-class robot) that
   checks protocols for collisions, volume errors and scheduling before they run. It builds on
   HIRO and on `workcell-twin`.
4. `osrobot-uav`: size a purpose-built UAV (frame, motors, battery) for targeted observation,
   then fly the mission in PX4 or ArduPilot software-in-the-loop simulation if it installs. It
   builds on RECUV, `uav-energy-twin` and `targeted-observation-twin`.
5. `osrobot-field`: a field robot for one job, such as weeding or inspection, with coverage
   planning, perception from cheap sensors, and terrain from `terrain-twin`. It builds on ARPG
   where it does perception or mapping.
6. `osrobot-assist`: an assistive task done beside a person, such as feeding or dressing, in
   Assistive Gym or MuJoCo with a human model. Score task success and contact forces. It builds
   on CAIRO.
7. Owner steps: build the best design from open hardware, with a priced bill of materials. Track
   8 can supply its task-specific compute, and track 1's shop could make its parts.

**Guardrails.**
- *Open-hardware licences.* Check each design's licence before reusing it (CERN-OHL-S, -W or -P,
  or another), and credit it.
- *Simulation is not a safety case.* A robot that works near people needs the owner's risk
  assessment, against the relevant standard, before any hardware test. ISO 10218 covers
  industrial robots and ISO 13482 covers personal-care robots.
- *Flying is an owner step.* Flying outdoors falls under FAA rules: 14 CFR Part 107, or the
  exception for recreational flyers in 49 U.S.C. § 44809.
- *No weapons.* Build no weapons and no payloads meant to harm.

## References

Tracks 1 to 6 were checked on 2026-10-12 and tracks 7 to 9 on 2026-10-14. Check them again before
citing one, as `prompt.md` requires.

**Track 1.**
- von Neumann, ed. Burks (1966). *Theory of Self-Reproducing Automata*. Univ. of Illinois Press. <https://archive.org/details/theoryofselfrepr00vonn_0>
- Freitas and Gilbreath, eds. (1982). *Advanced Automation for Space Missions*. NASA CP-2255. <https://ntrs.nasa.gov/citations/19830007077>
- Freitas and Merkle (2004). *Kinematic Self-Replicating Machines*. Landes Bioscience. <http://www.molecularassembler.com/KSRM.htm>
- Jones et al. (2011). RepRap – the replicating rapid prototyper. *Robotica* 29(1):177–191. <https://doi.org/10.1017/S026357471000069X>
- Zykov, Mytilinaios, Adams and Lipson (2005). Self-reproducing machines. *Nature* 435:163–164. <https://doi.org/10.1038/435163a>
- Lackner and Wendt (1995). Exponential growth of large self-reproducing machine systems. *Math. Comput. Modelling* 21(10):55–81. <https://doi.org/10.1016/0895-7177(95)00071-9>
- Open Source Ecology, Global Village Construction Set. <https://wiki.opensourceecology.org/wiki/Global_Village_Construction_Set>

**Track 2.**
- Horvitz (1999). Principles of mixed-initiative user interfaces. CHI '99, 159–166. <https://doi.org/10.1145/302979.303030>
- Lu et al. (2025). Proactive Agent: Shifting LLM Agents from Reactive Responses to Active Assistance. ICLR. <https://arxiv.org/abs/2410.12361>
- Radford et al. (2023). Robust Speech Recognition via Large-Scale Weak Supervision. ICML, PMLR 202. <https://proceedings.mlr.press/v202/radford23a.html>
- whisper.cpp <https://github.com/ggml-org/whisper.cpp>; Silero VAD <https://github.com/snakers4/silero-vad>; Omi <https://github.com/BasedHardware/omi>; Piper, successor repository <https://github.com/OHF-Voice/piper1-gpl>
- 18 U.S.C. § 2511(2)(d) <https://www.law.cornell.edu/uscode/text/18/2511>; Cal. Penal Code § 632 <https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=PEN&sectionNum=632>

**Track 3.**
- Liu, Pinckney, Khailany and Ren (2023). Invited Paper: VerilogEval: Evaluating Large Language Models for Verilog Code Generation. ICCAD. <https://doi.org/10.1109/ICCAD57390.2023.10323812>
- Lu, Liu, Zhang and Xie (2024). RTLLM: An Open-Source Benchmark for Design RTL Generation with Large Language Model. ASP-DAC, 722–727. <https://doi.org/10.1109/ASP-DAC58780.2024.10473904>
- Liu et al. (2023). ChipNeMo: Domain-Adapted LLMs for Chip Design. arXiv. <https://arxiv.org/abs/2311.00176>
- Blocklove, Garg, Karri and Pearce (2023). Chip-Chat: Challenges and Opportunities in Conversational Hardware Design. MLCAD. <https://doi.org/10.1109/MLCAD58807.2023.10299874>
- Mirhoseini et al. (2021). A graph placement methodology for fast chip design. *Nature* 594:207–212. <https://doi.org/10.1038/s41586-021-03544-w>
- Cheng, Kahng, Kundu, Wang and Wang (2023). Assessment of Reinforcement Learning for Macro Placement. ISPD, 158–166. <https://doi.org/10.1145/3569052.3578926>
- Yosys <https://yosyshq.net/yosys/>; OpenROAD <https://theopenroadproject.org/>; Verilator <https://www.veripool.org/verilator/>; cocotb <https://www.cocotb.org/>; SKY130 PDK <https://github.com/google/skywater-pdk>; Tiny Tapeout <https://tinytapeout.com/>

**Track 4.**
- Liang et al. (2023). Code as Policies: Language Model Programs for Embodied Control. ICRA, 9493–9500. <https://doi.org/10.1109/ICRA48891.2023.10160591>
- Narang et al. (2022). Factory: Fast Contact for Robotic Assembly. RSS. <https://doi.org/10.15607/RSS.2022.XVIII.035>
- Tang, Lin et al. (2023). IndustReal: Transferring Contact-Rich Assembly Tasks from Simulation to Reality. RSS. <https://doi.org/10.15607/RSS.2023.XIX.039>
- Tian et al. (2024). ASAP: Automated Sequence Planning for Complex Robotic Assembly with Physical Feasibility. ICRA, 4380–4386. <https://doi.org/10.1109/ICRA57147.2024.10611595>
- Todorov, Erez and Tassa (2012). MuJoCo: A physics engine for model-based control. IROS, 5026–5033. <https://doi.org/10.1109/IROS.2012.6386109>
- LeRobot <https://github.com/huggingface/lerobot>; SO-100 and SO-101 arms <https://github.com/TheRobotStudio/SO-ARM100>

**Track 5.**
- Sigmund (2001). A 99 line topology optimization code written in Matlab. *Struct. Multidisc. Optim.* 21(2):120–127. <https://doi.org/10.1007/s001580050176>
- Gustafsson and McBain (2020). scikit-fem: A Python package for finite element assembly. *JOSS* 5(52):2369. <https://doi.org/10.21105/joss.02369>
- CadQuery <https://github.com/CadQuery/cadquery>; build123d <https://github.com/gumyr/build123d>

**Track 6.**
- FreeSewing <https://github.com/freesewing/freesewing>
- Baraff and Witkin (1998). Large steps in cloth simulation. SIGGRAPH '98, 43–54. <https://doi.org/10.1145/280814.280821>
- Bennell and Oliveira (2008). The geometry of nesting problems: A tutorial. *EJOR* 184(2):397–415. <https://doi.org/10.1016/j.ejor.2006.11.038>
- Cunniff (1999). Dimensionless parameters for optimization of textile-based body armor systems. Proc. 18th Int. Symposium on Ballistics, San Antonio. Print proceedings only.
- Lee, Wetzel and Wagner (2003). The ballistic impact characteristics of Kevlar woven fabrics impregnated with a colloidal shear thickening fluid. *J. Mater. Sci.* 38(13):2825–2833. <https://doi.org/10.1023/A:1024424200221>
- Collins, Wiggin and Sawicki (2015). Reducing the energy cost of human walking using an unpowered exoskeleton. *Nature* 522:212–215. <https://doi.org/10.1038/nature14288>
- Kim et al. (2019). Reducing the metabolic rate of walking and running with a versatile, portable exosuit. *Science* 365(6454):668–672. <https://doi.org/10.1126/science.aav7536>
- Seth et al. (2018). OpenSim: Simulating musculoskeletal dynamics and neuromuscular control to study human and animal movement. *PLOS Comput. Biol.* 14(7):e1006223. <https://doi.org/10.1371/journal.pcbi.1006223>
- Caggiano et al. (2022). MyoSuite: A contact-rich simulation suite for musculoskeletal motor control. L4DC, PMLR 168:492–507. <https://proceedings.mlr.press/v168/caggiano22a.html>
- Poupyrev et al. (2016). Project Jacquard: Interactive Digital Textiles at Scale. CHI '16, 4216–4227. <https://doi.org/10.1145/2858036.2858176>
- Hsu et al. (2016). Radiative human body cooling by nanoporous polyethylene textile. *Science* 353(6303):1019–1023. <https://doi.org/10.1126/science.aaf5471>
- Zhang et al. (2019). Dynamic gating of infrared radiation in a textile. *Science* 363(6427):619–623. <https://doi.org/10.1126/science.aau1217>
- Thys, Van Ranst and Goedemé (2019). Fooling automated surveillance cameras: adversarial patches to attack person detection. CVPR Workshops, 49–55. <https://doi.org/10.1109/CVPRW.2019.00012>
- Xu et al. (2020). Adversarial T-Shirt! Evading Person Detectors in a Physical World. ECCV, 665–681. <https://doi.org/10.1007/978-3-030-58558-7_39>
- Gagge, Stolwijk and Nishi (1971). An effective temperature scale based on a simple model of human physiological regulatory response. *ASHRAE Trans.* 77(1). <https://hdl.handle.net/2115/37901>
- ISO 7730:2025, Ergonomics of the thermal environment. <https://www.iso.org/standard/85803.html>
- Clean Clothes Campaign, living-wage FAQ. <https://cleanclothes.org/faq/pay-living-wages>
- *Star Athletica, L.L.C. v. Varsity Brands, Inc.*, 580 U.S. 405 (2017). <https://www.supremecourt.gov/opinions/16pdf/15-866_0971.pdf>
- Regulation (EU) 2024/2822, amending Council Regulation (EC) No 6/2002 on designs. <https://eur-lex.europa.eu/eli/reg/2024/2822/oj>
- NIJ Standard 0101.07, Ballistic Resistance of Body Armor (2023) <https://nij.ojp.gov/library/publications/ballistic-resistance-body-armor-nij-standard-010107>; NIJ Standard 0115.00, Stab Resistance of Personal Body Armor (2000) <https://www.ojp.gov/pdffiles1/nij/183652.pdf>
- New York Penal Law § 270.21. <https://www.nysenate.gov/legislation/laws/PEN/270.21>
