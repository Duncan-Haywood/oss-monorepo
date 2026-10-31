# Priority projects

The owner's priority projects, set on 2026-10-12, with tracks 7 to 11 added on 2026-10-14, track 12 on 2026-10-16 tracks 13 to 15 on 2026-10-19, tracks 16 and 17 on 2026-10-19, track 18 on 2026-10-19 track 19 on 2026-10-20 tracks 20 and 21 on 2026-10-21 tracks 22 and 23 on 2026-10-24 track 24 on 2026-10-24 and track 25 the same day. Runs
started from `prompt.md` take their new work from here. The tracks are numbered below. Each one is
open-ended: its milestones are a starting order, not a checklist, so follow the results. Every
project a track produces is a normal `research/<slug>/` project. It needs a README, tests, a
README bullet, a `_homepage/projects.json` entry, a home page on the Pages site (milestone 9 below)
and a passing `python3 research/_homepage/build.py`, as `CLAUDE.md` says. Every rule in `prompt.md` still applies, research integrity above all.

## Repository merge (done 2026-10-16)

`oss-research-monorepo` was merged into `oss-monorepo` under `research/` with its full history
(oss-monorepo#6832), mirrored while both were live, and cut over on 2026-10-16: the mirror is
retired and research lands here. The old repository is read-only history, archived and never
deleted; its pull requests, review threads and old Pages site stay there.

## Site milestones (both portfolios)

5. `site-redesign` (both): give the two GitHub Pages homepages a comprehensive, modern,
   professional redesign, with one super homepage that routes to both. Added on 2026-10-14 at the
   owner's request.
   - **The two sites.** The research homepage
     (<https://duncan-haywood.github.io/oss-research-monorepo/>) is built here by
     `_homepage/build.py` from `_homepage/template.html` and `_homepage/projects.json`. The product catalogue
     (<https://duncan-haywood.github.io/monorepo-projects/>) is built in `oss-monorepo` by
     `platform/pages/build.mjs`.
   - **The super homepage.** One landing page introduces the whole portfolio and routes visitors
     to the products and to the research. It must not be a third, thin page that each side
     forgets to update. Prefer making it the `oss-monorepo` Pages root, with the catalogue and
     the research homepage (`/research/`) under it, and keep the old URLs working
     with redirects or links.
   - **Better HTML, CSS and JS.** Use semantic HTML and a shared design system: tokens for
     colour, type and spacing, light and dark themes, and a responsive layout from phone width
     up. Add a sticky header with navigation, a hero, featured work, theme or category sections,
     and fast client-side search and filtering. Use no framework and no build step beyond the
     existing builders, and no third-party tracking. Make it accessible (WCAG AA contrast,
     labelled controls, keyboard navigation) and fast, with no layout shift.
   - **Keep what already works.** Every project and product card, the per-project test counts,
     the disclaimers, usage tracking, sitemaps and SEO metadata all stay. `python3 research/_homepage/build.py`
     still prints `ok`. In `oss-monorepo`, run the starvation checklist from its `CLAUDE.md`,
     including `node platform/marketing/regen.mjs --verify` and the browser checks (`contrast.mjs`).
   - **Done when** both homepages and the super homepage ship the new design, each links to the
     other two, and before and after screenshots at phone and desktop widths are in the pull
     request. The research side, the catalogue and the super homepage are all in this
     repository now.

9. `project-pages` (both): give every project and product its own home page on the GitHub-hosted
   site, by default. Added on 2026-10-14 at the owner's request. The goal (`oss-monorepo`
   `prompts/goals.md`, web presence) is one website on GitHub Pages from which all the work can be
   checked out visually. Independent of milestones 1 to 7; build on milestone 8's design system if
   it has landed, and do not wait for it if not.
   - **Research (here).** `_homepage/build.py` also writes `_site/<slug>/index.html` for every project:
     the question it answers, the abstract and headline results, one or two figures from the
     project's own output, the test count, the white paper, code and results links, the AI
     assistance note, and its theme. The homepage card links to it. Generate it from
     `projects.json`, the README and the project's files, so a new project gets its page with no
     extra step, and make the build fail when a project's page cannot be built.
   - *Progress (2026-10-15):* `_homepage/build.py` now writes `_site/<slug>/index.html` from
     `site/project.html` for all projects (abstract, test count, links, AI note, and the first
     image under the project's `experiments/`), the homepage card links to it, and the build
     fails if a page cannot be built. Most projects ship no image yet (five were added 2026-10-15
     via `experiments/figure.py`, which parses the committed `results.txt`); `robofab-cell`, `robofab-cell-cv` and `robofab-cell-mva` followed, redrawn from their `results.json`, so most pages have no
     figure yet. Every later figure follows the same pattern, drawn by an `experiments/figure.py` that parses the committed `results.txt` (the per-project changelog that sat here was dropped 2026-10-17 as unscannable; `git log -- research/*/experiments/figure.py` has it). Still open: have each project's experiment code write a figure (list them with `python3 platform/ci/figureless_projects.py`; it counts .png and .svg, so do not recount by hand), and the
     `oss-monorepo` products half.
   - **Products (*oss-monorepo*).** Every venture gets a home or marketing page from the Pages
     build, including the CLIs, servers and apps the mirror excludes today: what it does and for
     whom, a screenshot or demo, how to install or run it, and links to the code, with the
     disclaimers and usage tracking every published page carries. Make the build or a check fail
     on a venture with no page.
   - **Done when** every project and every venture on `main` has a page reachable from its
     homepage, the builds enforce it for new ones, and screenshots of a few pages at phone and
     desktop widths are in the pull request.

## Picking work

Since 2026-10-24 the unit of work is the programme, not the project: one hard question
pursued across sessions toward a paper ([`PROGRAMMES.md`](PROGRAMMES.md), which sets the bar).
`pick_track.py` draws an open programme for most runs. A track draw means opening a programme
in that area, or advancing one, and the track's milestones below become raw material for it,
not separate slugs. The steps below still apply to track and free-choice draws.

1. **Pick a track at random:** `python3 research/_shared/pick_track.py` (below 0.05 is a
   free-choice run; otherwise it maps the draw onto tracks 1-25, redraws any track with 40+ projects, and lists the track's newest projects). Four runs start in the same
   minute, and a random pick spreads them out. Since 2026-10-31 half of the draws map onto the
   owner's focus tracks only (12 `house`, 20 `buildbot`, 25 `heavy`, 15 `sensing`, 16 `energy`,
   21 `infra`, 9 `osrobot`, 22 `aerolog`, 23 `marine`: industrial, energy, construction, sensing
   and autonomy), so about two thirds of track runs land there; the others stay open.

   **Free choice (about 5% of runs).** In the spirit of Google's "20% time", about one run in
   twenty works on whatever research question it finds most interesting, in or out of the
   tracks below: a hunch from a recent project, an unusual method, a gap nobody here has
   looked at. Aim it at a question worth a programme; land a real step this run. It follows every rule in
   "Rules for every track" and every integrity, licensing and landing rule in `prompt.md`, and
   it is held to the same bar: a complete README, passing tests, honest results. Use the
   `free` slug prefix and theme id unless the project fits an existing track's theme better,
   and say in the README's first lines why it seemed worth doing. Record `"task": "free-choice"`
   in the run line, so the review can see whether these runs pay off.
2. **Take the track's next free milestone.** That is the first one that is not on `main` (check
   `research/` for the slug), not claimed by an open pull request, and not on a branch pushed
   in the last three hours. When the listed milestones are done, take the next step from the
   latest project's "Next steps" section in that track. If that chain has gone to micro-variants
   of one result (a new seed, a bigger N, the same test on a neighbouring dataset), skip it:
   ask the harder question the chain was circling, and make it a programme (`PROGRAMMES.md`).
3. **Use the track's slug prefix and theme.** The prefix starts the slug (`selfrep-closure`).
   The theme id goes in `_homepage/projects.json`. The first project in a track adds that theme,
   with a `--t-<id>` colour in both the light and dark blocks of `_homepage/template.html`.

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
| 10. The software-engineering loop | `swe` |
| 11. Adversarial human imitation | `mimic` |
| 12. Open-source residential construction | `house` |
| 13. Autonomous multi-angle capture | `capture` |
| 14. Agentic co-design of low-cost robots | `codesign` |
| 15. Sensor fusion, imaging and 3D from real captures | `sensing` |
| 16. Energy supply and dense energy storage | `energy` |
| 17. Societies of AI agents in robots among people | `society` |
| 18. Laundry-hanging robots and custom hangers | `hanger` |
| 19. Machine learning on qualitative data with LLMs | `qual` |
| 20. Robots on the residential building site | `buildbot` |
| 21. Applied R&D for the industries modern life runs on | `infra` |
| 22. Autonomous flying machines for commercial logistics | `aerolog` |
| 23. Autonomous water vehicles of every sort | `marine` |
| 24. Civilizations, group psychology and interventions | `civ` |
| 25. Open-source construction, mining and heavy equipment | `heavy` |
| Free choice (about 5% of runs) | `free` |

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
- **A home page by default.** Every project gets its own page on the GitHub Pages site, with a
  figure from its own output, so the work can be checked out visually without reading the code
  (milestone 9). Until the builder generates it, the project is not done without one.
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

**Prior work.** Ajayi et al. (2019), on OpenROAD's aim of a self-driving open flow, DAC. Brayton and Mishchenko (2010), ABC, CAV. Yu, Xiao and De Micheli (2018), synthesis flows
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
   (The 3.3 GB download is unreachable from cloud sessions, so every step here that needs the
   real data is blocked there; use the substitute-task pattern of `accel-sparse` or pick another track.)
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
5. `accel-sparse` (first pass landed 2026-10-15 on a substitute digits task because Speech Commands was unreachable; re-run on KWS features, add the lookup-table variant and synthesis still open): spend the task's slack on pruning, binary or ternary weights, and lookup-table
   inference. When does the task's accuracy tolerance let the hardware drop multipliers
   altogether?
6. `accel-fpga` (first pass landed 2026-10-15 as `research/accel-fpga`: 15 `accel-kws` engine geometries through Yosys and nextpnr-ice40 on UP5K and HX8K, random weights; the best trained design, power and a board remain open): put the best design through an open FPGA flow (Yosys with nextpnr, for iCE40 or
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
- *Vendor back ends.* FINN's hardware flow needs AMD Vivado or Vitis. Every released hls4ml
  back end also synthesises with a vendor HLS tool, though its bit-accurate C++ emulation needs
  only a compiler. Under "In-house", use them as references, or only the parts that run without
  a vendor tool, and say so wherever a result leans on them.

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
Erickson et al. (2020), Assistive Gym, ICRA. Open projects: FarmBot (open software and
hardware), ArduPilot, PX4, LeRobot, and Opentrons (open software; the OT-2's hardware is only
partly published, with no licence stated).

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
   checks protocols for collisions, volume errors and scheduling before they run, using
   Opentrons' Apache-2.0 protocol software but not claiming the hardware is open. It builds on
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
  assessment, against the relevant standard, before any hardware test. ISO 10218-1 and -2
  (2025) cover industrial robots, and ISO 13482 (2014, under revision) covers personal-care
  robots.
- *Flying is an owner step.* Flying outdoors falls under FAA rules: 14 CFR Part 107, or the
  exception for recreational flyers in 49 U.S.C. § 44809.
- *No weapons.* Build no weapons and no payloads meant to harm.

## 10. The software-engineering loop (`swe`)

**Goal.** The agents that build this portfolio form a loop of their own. The brief
(`prompt.md` and this file) is the design, each run is an evaluation, and the merged projects
are the output. Optimise that loop for one number: the throughput of useful, valuable and
correct projects within a fixed compute budget. The budget is several Claude Code Max 20x
subscriptions ($200 a month each on 2026-10-14). Each one's usage limit resets every five hours,
a weekly limit sits on top, and Claude Code shares both with chat. Those limits, not dollars,
are the binding constraint, so cost is measured in tokens and in time against them. Which
brief, task mix, model, schedule and review policy land the most valuable correct work per
subscription-week? This is an operations-research problem in its own right (budgeted
experimentation, allocation, queueing), and it fits the portfolio's operations-research and
industrial-engineering strand.

**The metric.** A project counts when it is all of the following:
- *Correct.* It merged with CI green. When audited, its README numbers match a re-run of its
  code and its citations check out. It needed no revert or fix-up within 14 days, and it has no
  integrity issue.
- *Useful.* It ships something usable on its own (a tool, a dataset, a printable part, a
  pattern), a later project builds on it, or it answers a question its track asked.
- *Valuable.* It moves its track forward. A listed milestone or a substantive new question
  scores higher than a parameter variation of the previous project, and a duplicate scores
  zero. A reviewer run scores value against a written rubric, blind to the prompt version that
  produced the project wherever it can be.

Throughput is the value-weighted count of such projects per subscription-week, reported with
the tokens and wall time behind it.

**Prior work.** Forsgren, Humble and Kim (2018), *Accelerate*, on measuring delivery throughput
and stability together (the DORA metrics). Little (1961), on throughput and work in progress.
Badanidiyuru, Kleinberg and Slivkins (2018), bandits with knapsacks, for learning under a
budget. Russo et al. (2018), a tutorial on Thompson sampling. Johari et al. (2017) and Kohavi,
Tang and Xu (2020), on controlled experiments and the cost of peeking at them. Kapoor et al.
(2025), "AI Agents That Matter", on judging agents by cost as well as accuracy. Jimenez et al.
(2024), SWE-bench, and Yang et al. (2024), SWE-agent. Yang et al. (2024), OPRO, and Khattab et
al. (2024), DSPy, on optimising prompts. Strathern (1997), on what happens when a measure
becomes a target. Cohen (1960), kappa, for agreement between raters.

**Milestones.**
1. `swe-ledger`: build the measurement. Backfill `prompts/runs.jsonl` from git history, pull
   requests and CI. That is the first review session `prompt.md` describes, which has not run
   yet. Fill in tokens, cost and wall time from session metadata wherever it can still be read.
   Claude Code's `/usage` command shows plan usage for the owner to read. Then write a script
   that computes the metric per run, prompt version, model, track and task type, with counts and
   intervals. On 2026-10-14 the log held 159 runs, and none recorded
   tokens or cost.
2. `swe-audit`: estimate the correctness term. Re-run a random sample of merged projects, check
   their README numbers against fresh output and their citations, and report the defect rate
   with a confidence interval, by track and model. Choose the sample size from the precision
   wanted.
3. `swe-value`: write the value rubric and test it. Two independent scoring passes over the same
   projects give an agreement score (Cohen's kappa), and the disagreements sharpen the rubric.
   Then ask the log questions. For example, on 2026-10-14 `research/` held ten
   `garment-twonode*`, nine `chip-systolic*` and eight `simdesign-gauge*` projects. Are runs of
   follow-ups like these worth as much per token as new milestones?
4. `swe-allocate`: allocate the budget. Fit a simple model of each run's cost and value, by
   track and task type, from the ledger. Compare policies offline: the current uniform pick of a
   track, a greedy value-per-token rule, Thompson sampling, and a bandits-with-knapsacks policy.
   Adopt a policy only if it wins both in the model and in a live trial.
5. `swe-schedule`: schedule across subscriptions. Four runs start in the same minute, so
   duplicate projects, merge conflicts on `README.md` and `_homepage/projects.json`, and run-log
   races all cost budget. Measure each from history. Model the runs as a queue against each
   subscription's usage limits, and test staggered starts, claim protocols and limits on work in
   progress in simulation.
6. `swe-prompt`: run prompt experiments on this metric. Put candidate briefs through
   `prompt.md`'s experiment process with a sequential test that can stop early safely. Report
   what each change did to valuable correct throughput, not only to the success rate.
7. `swe-orgs`: learn from engineering organisations that ship. This is a standing,
   long-term milestone: each run takes the next batch of sources, and the catalogue grows.
   Study how successful software and engineering companies organise and run their engineering,
   at every stage: early-stage, venture-backed teams (seed to Series B) first, then growth-stage
   companies and large engineering organisations. Read engineering blogs, books, talks,
   postmortems, papers and investor writing on engineering teams, from many companies, sectors
   and countries, and record what each says about throughput, quality, review, release, team
   shape, on-call and monorepos. Build a cited catalogue as a dataset: one row per practice,
   with its source and date, the stage and size of company it comes from, the evidence behind
   it (measured, case study or opinion), and what it claims to improve. Then map each practice
   to this portfolio's loop (`prompt.md`, the `oss-monorepo` briefs, CI, review and landing)
   and estimate its cost and gain on the ledger from milestone 1. A practice is proposed only
   when its expected gain is clearly worth it: throughput must not drop much unless the upside
   is worth more. Proposals go through `prompt.md`'s experiment process, as in milestone 6,
   and none is adopted from a source's reputation alone. Most practices were built for teams of
   people, so say which assumptions (headcount, meetings, hiring, salaries) do not carry over to
   a fleet of agent sessions, and why. Each run adds sources, re-scores the open proposals,
   updates the "Next steps" and appends a dated entry to `research/swe-orgs/LOG.md`, which
   the project page shows as its research log.
8. Later: the model and effort level per kind of task (a cheaper model for landing and logging,
   a stronger one for new milestones), subagents against a single agent, and how often review
   sessions should run.

**Guardrails.**
- *Integrity is a constraint, not a trade.* No throughput gain excuses an integrity issue. A run
  that has one counts against its prompt version, and its project is fixed or withdrawn.
- *Guard the metric.* A separate review pass scores correctness and value from git, CI and
  re-runs, never from a run's own report. Change a metric's definition only through a logged
  experiment, and keep the old definition computable so trends stay comparable.
- *Stay inside the plans.* Use each subscription within its usage limits and its terms.
  Scheduling work into unused capacity is in scope; working around a limit is not. Anthropic's
  terms do not directly address one person holding several subscriptions. The Usage Policy
  taking effect on 2026-11-12 bars creating multiple accounts to circumvent product guardrails.
  Confirming that the setup complies is an owner step. A run never splits one task across
  accounts to get past a limit.
- *Projects, not process notes.* Every milestone here is a normal `research/` project with code
  and tests. Changes to `prompt.md` itself go through its experiment process, or come from the
  owner.
- *Privacy.* Redact recorded inputs as `prompt.md` requires, and publish no tokens, email
  addresses or other personal data. This track builds on none of the groups in `prompt.md`.

## 11. Adversarial human imitation (`mimic`)

**Goal.** Two frozen LLMs play the imitation game in a loop. The *imitator* writes what a person
would write in a given context. The *detector* reads a text, or a human text and an imitator
text side by side, and says which one a person wrote. Neither model's weights change: the only
thing either side may change is its own prompt. Between rounds, each side's prompt is rewritten
to beat the other side's latest one. A context is data, not code: a situation, any earlier
turns, format limits and human-written examples from that setting. So one loop serves a forum
reply, a product review, an answer to a question, a chat turn, a recipe or a poem, and adding a
context means adding rows. Can prompts alone make an LLM indistinguishable from people across
contexts, against a detector that adapts through prompts alone? Which side wins at an equal
budget? Does the game settle or cycle? Does a prompt that wins in one context carry over to
others?

The imitator is a simulated human, a digital twin of how people write in a context. The
detector's accuracy is a fidelity score for that twin, as a discriminator's is for a GAN, and a
classifier two-sample test is for any simulator. That is the track's tie to the portfolio's
theme. Whether a twin that fools a detector is also more useful, for example as the simulated
speakers in `ambient-interject` (track 2), is a question for the later milestones. Text comes
first because it fits the container's CPU. Speech, images and video follow only as far as their
measured compute cost allows (milestone 7).

**What is free and what is fixed.**
- *Free:* the imitator's prompt and the detector's prompt. A prompt may hold instructions, a
  persona and few-shot examples, but examples come only from the training split.
- *Fixed for a run:* the model weights, the decoding settings, the contexts and their splits,
  the optimiser that rewrites the prompts and its own instructions, and the number of model
  calls per round, which is the same for both sides.
- *Scored:* the detector gives a probability, read from its answer tokens' log-probabilities
  where the model exposes them, so results report AUROC as well as accuracy. It runs in two
  modes: one text at a time, and paired, with a human text and an imitator text for the same
  context in random order, where chance is 50%.
- *Models:* the imitator and the detector are open-weight models run locally, sized to finish on
  the container's CPU (llama.cpp or transformers), so the results can be reproduced. The
  optimiser follows the "LLMs in the loop" rule above. A closed model behind an environment
  variable is at most a labelled extra, never the source of a headline number.

**Prior work.** Turing (1950), the imitation game. Goodfellow et al. (2014), generative
adversarial nets. Lopez-Paz and Oquab (2017), classifier two-sample tests. Jones and Bergen
(2024; 2026), Turing tests of LLMs in which the witness prompt drove the pass rate: in the
three-party test, GPT-4.5 given a humanlike persona prompt was judged to be the human 73% of the
time, and 36% without it. Jannai et al. (2023), "Human or Not?", ran a Turing test as an online
game. Ippolito et al. (2020) and Clark et al. (2021), on people and machines judging generated
text. On detectors: Mitchell et al. (2023), DetectGPT; Hans et al. (2024), Binoculars; Dugan et
al. (2024), the RAID benchmark; Sadasivan et al. (2025), on the limits of detection; and Liang
et al. (2023), on detectors' bias against non-native English writers. On evasion and adversarial
training: Krishna et al. (2023), on paraphrasing; Lu et al. (2024), SICO, which evades detectors
by optimising only the prompt, against a fixed proxy detector; and Hu, Chen and Ho (2023),
RADAR, which trains a paraphraser and a detector against each other by updating weights. This
track's set-up, where both sides adapt and only through prompts, sits between those two. On
prompt optimisation: Zhou et al. (2023), APE; Yang et al. (2024), OPRO; Pryzant et al. (2023);
Prasad et al. (2023), GrIPS; Fernando et al. (2024), Promptbreeder; and Yuksekgonul et al.
(2025), TextGrad. On game dynamics: Lanctot et al. (2017), PSRO, and Balduzzi et al. (2019), on
strategic cycles in non-transitive games. On simulated humans: Argyle et al. (2023), on
"algorithmic fidelity"; Aher, Arriaga and Kalai (2023); and Park et al. (2023), generative
agents. Pillutla et al. (2021), MAUVE, compares model and human text as distributions.

**Milestones.**
1. `mimic-contexts`: build the context suite and the reference detectors. Gather human-written
   text from licence-checked corpora in at least six context families, each item stored with the
   context that produced it. RAID (MIT) comes first. HC3 and M4 keep each source's licence, some
   of them non-commercial or unknown, so use only the parts whose licence is known and
   compatible. Split by family, not by item, so later milestones can hold whole families out.
   Fit reference detectors that use no prompt: a logistic regression on character and word
   n-grams, and a zero-shot score from a small open model's perplexity (Binoculars-style if two
   related models fit on the CPU). Score them against an imitator given only a plain prompt
   ("Write a reply to this post."). The suite and the detectors are useful on their own.
2. `mimic-loop`: run the loop on two or three context families, with one small open instruct
   model as both imitator and detector. Alternate rounds: optimise the detector's prompt against
   the imitator's current one, then the reverse. Compare proposers at the same budget of model
   calls: an LLM optimiser that reads scores and failures (OPRO- or TextGrad-style) against
   baselines with no LLM proposer, namely random search and a genetic algorithm over a fixed
   bank of prompt fragments, and GrIPS-style edits without its paraphrase step. Report AUROC and
   paired accuracy per round. Check that the texts still do their job, with a judge prompt the
   loop never changes, and check their length and n-gram overlap with the human references. An
   imitator that copies people, or says almost nothing, can fool a detector without imitating
   anyone.
3. `mimic-crossplay`: does the game settle, cycle or tip? Score every imitator prompt from a run
   against every detector prompt to get the full payoff matrix. Look for cycles, where a later
   imitator prompt loses to an earlier detector prompt. Solve the matrix game for its Nash
   mixture, one of PSRO's meta-solvers, and compare it with the last round's pair: a prompt that beats only
   its latest opponent has overfitted to it. Then vary the two sides' model sizes. Who wins at
   an equal budget, and does the larger model always win?
4. `mimic-anycontext`: test "any context". Optimise on some context families and score on
   held-out ones. Compare one universal imitator prompt, a prompt per family, and a prompt the
   imitator writes for itself from the context, and do the same for detectors. Report the gap
   between seen and held-out families. A universal prompt that holds up on held-out families is
   the track's main claim; one that does not is a negative result worth reporting.
5. `mimic-transfer`: indistinguishable to whom? Score the best imitator prompts against
   detectors the loop never saw: milestone 1's reference detectors, a larger open model as the
   detector, and detector prompts from other runs. Score the best detector prompts on text from
   other models, such as RAID's generations. Check at the level of distributions too: a detector
   that sees a batch can catch an imitator whose texts are each plausible but too much alike, so
   compare imitator and human diversity per context with MAUVE and distinct n-grams. MAUVE's
   package is GPL-3.0, so install it as a dependency and do not vendor it. The detector is the
   defence, as in RADAR. Do detector prompts hardened in the loop generalise better than prompts
   tuned on plain LLM text?
6. `mimic-dialogue`: multi-turn contexts. The imitator continues real conversations from
   licence-checked dialogue corpora for several turns, and the detector judges one turn or the
   whole thread. A live Turing test, where the detector questions a witness, needs real people
   on the human side, so it is an owner step (see the guardrails).
7. `mimic-media`: speech, images and video, compute first. Before running any loop, time each
   candidate generator and detector per sample on the container's CPU, and work out how many
   rounds fit in a run. Run the modalities that fit, cheapest first. The prompt stays the only
   free parameter: the text description that steers a speech model such as Parler-TTS, Hugging
   Face's open reproduction of Lyth and King (2024), the text prompt of an image model, and the
   prompt of an open audio- or vision-language model as the detector. Human references come from
   licence-checked corpora, such as LibriSpeech and Common Voice for speech. Compare with
   detectors from the deepfake-detection literature, such as the ASVspoof 2019 baselines for
   speech and Wang et al. (2020) for images. Video will probably not fit on a CPU. Give its GPU
   cost as an owner step, with a priced estimate and a source and date for the price.
8. Later: is a twin that fools the detector more useful? Use imitators at several detector
   scores as the simulated speakers in `ambient-interject`, or as simulated users of an
   assistant, and check whether what is tuned against the better twin does better on held-out
   human data. The same score works for the portfolio's physical twins: a classifier that tells
   simulated from real trajectories measures any simulator's fidelity. And how much of the gain
   from updating weights, as in RADAR, does prompt-only adaptation reach? Fine-tuning on a GPU
   is an owner step.

**Owner direction, 2026-10-20: three subjects, code as a free parameter, shared feedback.**
The owner asked for browser use and webcam to be subjects alongside writing, for code (not only
the prompt) to be something either side may change, and for the detector and imitator agents
to share feedback. This widens "what is free" above:
- *Subjects.* Writing (milestones 1 to 6), browser use (how a person moves a cursor, types and
  scrolls in a web page) and webcam (how a person's face and head behave on camera, as signals
  such as expression, head pose and blinks). Each needs licence-checked human references.
- *Code is free too.* Either side's program may change, not only its prompt: an imitator's
  generator (for a cursor, its path, speed profile, event clock and noise components), a
  detector's feature functions. Say whether the code comes from a fixed component library, a
  search over it, or a model that writes code, because those are different claims.
- *Shared feedback.* Besides the blind game, run conditions where the detector tells the
  imitator why it caught it (which features, how far apart), and where the imitator shares its
  program with the detector. Hold the evaluation budget equal across conditions and report
  which channel helps which side, on a detector neither side saw.

9. `mimic-cursor`: browser use, code as the free parameter, with and without shared feedback.
   Human cursor strokes from DUX (Bieber et al. 2023, CC-BY-4.0: 46 people filling in a web
   form), split by person. The imitator is a stroke generator built from code components;
   the detector picks feature functions. Four feedback conditions at equal budget, scored by a
   reference detector the loop never sees, with a memorization check on any component that
   draws on human examples. Keystroke timing and scrolling from the same corpus come next.
   Landed 2026-10-20: every final imitator is caught at reference AUROC 0.99 to 1.00, shared
   feedback did not help the imitator, and an 8 times larger search stops at the level of
   replaying real strokes (0.88), so the component library is the limit; two-way sharing gave
   the strongest detectors in cross-play, not yet significant at 8 seeds.
10. `mimic-webcam`: webcam signals, signals first. Start from derived per-frame signals, not
   pixels: DUX also logs webcam emotion scores from a facial-coding tool for each event, and
   open face-landmark or head-pose corpora with a known licence are candidates. The imitator
   writes the signal sequence for a context (filling in a form, reading an error message); the
   detector tells it from a person's. Rendering faces is out of scope until the guardrails
   below are met. Time any vision model on the CPU first, as in milestone 7.
11. `mimic-codeloop`: code written by a model. Replace the component search with an open
   code model that reads the detector's feedback and rewrites the generator or the feature
   functions, at the same budget as the component search, so the two can be compared. Size the
   model to the CPU and give a GPU's priced cost as an owner step if it does not fit.

**Guardrails: research on detection, not an evasion service.**
- *Both sides ship.* Every imitator result ships with the detector prompts and the cross-play
  results that answer it. The detector is a deliverable, not a foil.
- *Labelled, never passed off.* Generated text, audio and images stay in this repository,
  labelled as generated in file names and metadata. Nothing a run generates is posted, submitted
  or sent anywhere as if a person made it: not to forums, social media, reviews, schools,
  journals, job applications or customer channels.
- *No real people.* Imitate contexts, genres and registers, never a named or identifiable
  person. No voice cloning, and no images or video of real or identifiable people. Human
  references come from published corpora whose licence allows the use, never from private
  messages or scraped personal accounts.
- *No third-party detectors.* Test only detectors built here, or open models run locally. Never
  test against commercial or institutional detectors, plagiarism checkers, proctoring tools or a
  platform's bot filters.
- *Human judges are an owner step.* A Turing test with people is human-subjects research. It
  needs informed consent, a debrief that reveals the deception, and review by an institutional
  review board or its equivalent where one applies. In the US that is the Common Rule (Subpart A
  of 45 CFR 46) for research a federal agency conducts or supports. A run never recruits or
  tests people.
- *Fairness.* Report each detector's false-positive rate on human text by group wherever the
  corpus records it, such as native and non-native writers. A detector that wins by flagging a
  group of people is a harm, not a result.
- *Say who was fooled.* "Indistinguishable" always means indistinguishable to something: name
  the detectors, contexts, models and mode. Chance accuracy against the loop's own detector is
  the weakest form of the claim.
- *Synthetic media.* Before generated audio, images or video leave the repository, check the
  disclosure duties that apply, such as Article 50 of the EU AI Act, which applies from 2 August
  2026.
- *Browser use stays in the lab.* Generated cursor, keyboard and scroll input is scored only
  offline by detectors built here. It is never replayed in a live site, a CAPTCHA, a login or
  a platform's bot filter, and the generators are not packaged as plug-ins for browser
  automation tools. Every generator ships with the detector that answers it.
- *Webcam is signals, not faces.* Use derived signals (expression scores, landmarks, head pose)
  from licence-checked corpora. Never render, synthesise or alter video of a real or
  identifiable person, and never capture anyone's webcam: recording people is an owner step,
  as for human judges above.
- *Lab tags.* Milestones that use the imitator as a simulated partner build on CAIRO's and
  HIRO's directions in `prompt.md`, simulated human models and social intelligence. The others
  build on none of the groups, so say so.

## 12. Open-source residential construction (`house`)

Added on 2026-10-16 at the owner's request, as a long-term track.

**Goal.** Cut what it costs to design and build a new home, and publish the designs. Framing is
about a sixth of a new US house's construction cost, and construction is about two thirds of
its price (NAHB, 2024). Most of the engineering behind a house, from span tables and energy
models to framing layouts and cost estimates, sits in copyrighted tables, paid software and
contractors' heads. This track does it as open, testable code. Which design and process choices
cut cost most per square foot without losing strength, comfort or energy performance? How much
of a house can be designed as parametric code that anyone can change, check and build from?

**Prior work.** The NAHB Research Foundation's optimum value engineering (OVE) for HUD (1978/79)
and Home Innovation Research Labs on how little of it builders use. The American Wood Council's
NDS for wood design and ASCE 7 for loads. Carpenter and Schumacher (2003) on measured framing
factors. NREL's BEopt and DOE's EnergyPlus and OpenStudio for cost-optimal energy design.
OpenSees for structural simulation. WikiHouse and Open Source Ecology for open building systems.
IfcOpenShell and FreeCAD for open BIM. NAHB's *Cost of Constructing a Home* survey and the US
Census Survey of Construction for where a house's price goes.

**Milestones.**
1. `house-framing` (done 2026-10-16): conventional versus advanced (OVE) framing of a house's
   exterior walls. Lumber, pieces, whole-wall R-value, and the NDS stud and header checks that
   say whether the lighter frame carries the roof.
2. `house-spans` (done 2026-10-16): an open span and sizing tool built from first principles: joists, rafters,
   headers and beams from NDS design values and ASCE 7 loads, with bending, shear, deflection
   and bearing checks. Compare it with published span tables only where their licence allows,
   and say where they differ and why. The output is a tool people can use.
3. `house-plan` (done 2026-10-16; the layout search and CMA-ES baseline are next steps): a house plan as data. A parametric plan (rooms, walls, openings, roof) that
   produces a framing takeoff, a bill of materials and an IFC model through IfcOpenShell. Then
   the loop: optimise a plan for cost per square foot of living space, under room-size and
   layout rules written as checks, against a random-search or CMA-ES baseline.
4. `house-cost` (share-anchored version done 2026-10-17; the priced takeoff and Census reconciliation are next steps): where a new home's price goes. An open quantity-based cost model (materials
   from the takeoff, labour hours, land, fees, financing and margin), reconciled with NAHB's
   survey and the Census Survey of Construction, with every price sourced and dated. Which
   levers move the price most: size, shape, storeys, foundation type, finish level, fees?
5. `house-energy`: cost-optimal envelopes by climate zone. EnergyPlus or OpenStudio, run from
   scripts, sweeping insulation, windows, air tightness and HVAC. Report the net present cost of
   building plus 30 years of energy, BEopt-style, with the assumptions shown.
6. `house-structure` (first version done 2026-10-17: wood-frame wind and seismic shear walls; the alternative systems are next steps): lateral design and alternative systems. Shear walls and bracing under
   wind and seismic load in OpenSees or a frame model, then wood frame against steel stud,
   insulated concrete forms, structural insulated panels, cross-laminated timber and 3D-printed
   concrete, on cost, carbon, speed and strength.
7. `house-offsite`: factory against site. Panelised and modular construction as a simulated
   process: wall-panel layout, sheet-goods nesting (reuse `garment-nesting`'s nester for
   sheathing), transport limits, crew time and weather. When does offsite win, and by how much?
8. `house-schedule` (first version done 2026-10-17; the seasonal calendar is `house-season`, calibration is a next step): the build as a process. A discrete-event model of the trades, inspections,
   weather and material lead times. How much do sequencing, prefabrication and fewer handoffs
   cut the build time and the interest paid while it runs?
9. `house-open-design` (first version done 2026-10-18: a 480 sq ft ADU plan set composed from milestones 2 to 8; line-by-line pricing, a truss option and a licensed review are next steps): an open-source plan set. A small house (for example an accessory
   dwelling unit) generated from milestones 2 to 8, with drawings, a takeoff, a cost estimate,
   energy and structural reports, all reproducible from code. A licensed review and a permit
   are owner steps.
10. `open-house-plans` (product, first version done 2026-10-21, in `ventures/open-house-plans/`): the
   generator milestone 9 pointed at. From a brief or a sentence it searches single-storey layouts
   (studio to five bedrooms, six styles, garage, porch, accessible option), sizes members with the
   house-spans and house-framing checks (ported to JS, pinned by tests), runs IRC-paraphrased checks,
   takes off materials, prices with an NAHB-anchored model and exports SVG, DXF, IFC4, OBJ and CSV
   under CC0. Two storeys, L-shaped plans, a site plan and a licensed review of one design are next.

Each project that prices a build cites every price and its date. Building anything is an owner
step.

**Guardrails.**
- *No design is buildable on this track's say-so.* Simulation and code checks are research.
  Every README says the design needs a licensed architect's or engineer's review, or the local
  code's prescriptive path, and a permit, before anyone builds it. Never claim code compliance.
- *Codes and tables are copyrighted.* The ICC's model codes (IRC, IBC, IECC) and many span and
  design tables are copyrighted even where a jurisdiction adopts them. Cite sections; do not
  copy tables or text. Derive values from first principles or from openly licensed sources.
- *Life safety.* Structure, fire, egress and gas are life-safety systems. Results about them
  say what was not checked, and never present a simulated capacity as a tested one.
- *Licences for designs.* Open designs carry a licence that allows building from them, and the
  README says what the licence does and does not cover (it is not a warranty).
- *Lab tags.* No group in `prompt.md` covers construction. Say so rather than stretching a
  connection; `house-offsite` and `house-schedule` may build on track 4's manufacturing loops.

## 13. Autonomous multi-angle capture for travel creators (`capture`)

Added on 2026-10-19 at the owner's request, from a problem the owner runs into.

**Goal.** A travel creator filming for Instagram and similar platforms wants every angle of
themselves at every moment: ultra-wide to telephoto, 360-degree, several viewpoints at once so
post-production can pick the shot, track motion or rebuild the scene in 3D. Today that means
packing and charging several cameras, lenses, batteries and tripods, or bringing people to film.
The ideal is a box you open, from which cameras surround you, film without effort, avoid people,
draw no negative attention, never run flat, and feed an automated edit that outputs reels. That
ideal is far off: small cameras lose sensor size, batteries trade energy against weight and are
capped at 100 Wh each in carry-on without airline approval (FAA PackSafe, checked 2026-10-19), and
drones carry flight rules. This track asks which open hardware and software gets closest at a
given weight, cost and energy, and proves each step in simulation first. Options span a 360
camera on a telescoping pole with software reframing, rigs of several cameras (stereo and
trinocular baselines for depth and parallax), a wheeled or legged follow robot with a mast or
arm, and drones; and computational photography (a chosen "film look") in the edit.

**Prior work.** Kanade, Rander and Narayanan (1997), Virtualized Reality, *IEEE MultiMedia*. Joo
et al. (2015), the Panoptic Studio, ICCV. Snavely, Seitz and Szeliski (2006), Photo Tourism, *ACM
TOG*. Mildenhall et al. (2020), NeRF, ECCV, and Kerbl et al. (2023), 3D Gaussian splatting, *ACM
TOG*, for novel views from many cameras. Su and Grauman (2017), automatic reframing of 360 video
into normal-field-of-view shots, CVPR. Bonatti et al. (2020), autonomous aerial cinematography,
*Journal of Field Robotics*. Open tools: FFmpeg, OpenCV, COLMAP, PySceneDetect, ROS 2, PX4 and
ArduPilot (track 9).

**Milestones.**
1. `capture-crop` (done 2026-10-19): the 360-on-a-pole baseline. How long a lens a 360 camera
   can fake by cropping into a reel (an 8K equirect is native only to about 24 mm-equivalent at
   1080x1920), and the perspective no crop can fake (the camera has to stand back).
2. `capture-kit`: what to pack. A kit optimiser over camera classes, lenses, mounts and battery
   packs: shot variety (focal-length bands times viewpoints) and recording hours against carried
   weight, with every battery at or under 100 Wh and spares in carry-on. Exact search against a
   greedy baseline, with every device figure sourced and dated or labelled assumed.
3. `capture-rig`: how many cameras, where. Place N cameras on a ring, sphere or mast around a
   subject in simulation and score angle coverage, stereo depth error by baseline, and the quality
   of novel views reconstructed between them, against the pixel and perspective limits of
   milestone 1.
4. `capture-follow`: the platform. A follow robot (omnidirectional wheels or wheel-legs with a
   telescoping mast) against a drone and against static tripods, in a crowd simulation: framing
   distance held, pedestrians avoided, terrain crossed, energy per hour, packed size.
5. `capture-edit`: the automated edit. An open pipeline from multi-camera raw footage to a reel
   (sync, shot detection, reframing, angle selection, a film-look grade), scored on openly
   licensed footage against a fixed-cut baseline.
6. `capture-bystander` (done 2026-10-19): filming in public without harm. Automatic blurring of bystanders' faces
   and plates, and how conspicuous each platform is; a design input, not a way to hide filming.
7. Owner steps: build the best kit from open hardware, with a priced bill of materials, and test
   it on a trip.

**Guardrails.**
- *Discreet is not covert.* Design to be unobtrusive and safe around people, never to hide that
  filming is happening. Respect recording, privacy and data-protection laws where filmed (the
  GDPR covers identifiable people in the EU), and blur bystanders by default.
- *Batteries.* Never design a pack over 160 Wh, or one between 100 and 160 Wh without saying it
  needs airline approval. Spares go in carry-on, terminals protected. Lithium pack design that
  will be built is an owner step with a certified cell and protection circuit.
- *Flying is an owner step*, as in track 9: FAA 14 CFR Part 107 or 49 U.S.C. &sect; 44809 in the
  US, and the local rules where the trip goes (many parks and cities ban drones).
- *Simulated is not real.* Image-quality claims from geometry are upper bounds; say so, and
  measure from footage where it matters.
- *Lab tags.* `capture-follow` may build on RECUV and track 9's `osrobot-uav`; otherwise no group
  in `prompt.md` covers this, and the README says so.

## 14. Agentic co-design of low-cost robots with simulated RL (`codesign`)

Added on 2026-10-19 at the owner's request. The owner started from low-cost military robotics
and chose civilian domains instead. Open-sourcing cheap military designs mostly helps people
who could not build them otherwise, and military robot designs and their technical data can
be export-controlled (ITAR, the EAR's 600 series). Search and rescue, manufacturing,
agriculture, logistics and aerospace keep the same research question without those problems.

**Goal.** A loop that designs a cheap robot and its controller together. An LLM agent proposes
a design written as code (geometry, actuators, sensors, bill of materials). Reinforcement
learning trains a policy for that body in simulation. The agent then reads what happened, not
just the score: how each episode failed, contact and torque logs, energy, cost and print time.
From that it proposes the next design. The question is whether this richer feedback finds
better designs per evaluation than a proposer that sees only the score. The baselines are
random search, CMA-ES and Bayesian optimisation at the same budget. A second question is
whether the designs survive the move to a real 3D print. Tracks 5 and 9 already score
proposers on fixed-controller tasks (`simdesign-llm`, `osrobot-morph`, `osrobot-bodysearch`).
This track adds a learned policy per design and diagnostic feedback to the agent, and moves
across domains.

**Prior work.** Sims (1994), evolving virtual creatures, SIGGRAPH. Ha (2019) and Zhao et al.
(2020), RoboGrammar (track 9). Gupta, Savarese, Ganguli and Fei-Fei (2021), learning and
evolution of bodies, *Nature Communications*. Yuan et al. (2022), Transform2Act, ICLR. Lehman
et al. (2022), evolution through large models (LLM-proposed Sodarace robots). Ma et al.
(2024), Eureka, LLM-written reward functions, ICLR. Schulman et al. (2017), PPO. Tobin et al.
(2017), domain randomisation, IROS. Rudin et al. (2022), massively parallel legged RL, CoRL.
Ha, Xu and Song (2020), Fit2Form, gripper form design, CoRL. Calli et al. (2015), the YCB
object set. Open tools: MuJoCo, Gymnasium, Stable-Baselines3 or CleanRL, CadQuery and
build123d.

**Milestones.**
1. `codesign-gripper` (manufacturing): parametric 3D-printable fingers in CadQuery. A grasp
   policy or controller is trained per design in MuJoCo on simple shapes and YCB-like objects.
   Score grasp success, slip, print time and plastic cost. Compare the agent against random
   search, CMA-ES and Bayesian optimisation at equal budget. Export the winner's STLs. This
   builds on `robofab-grasp` and `simdesign-llm`, and the printable gripper is a useful
   by-product.
2. `codesign-diagnose`: the core ablation. Run the same agent with only the score, with the
   score plus a failure summary, and with full rollout logs. Does diagnostic feedback earn its
   tokens? Report evaluations to reach a target and the final quality, over several seeds.
3. `codesign-sar` (search and rescue): a legged or wheel-legged robot for rubble and stairs,
   on terrain from `terrain-twin`, carrying a sensor or radio-relay payload under a parts-cost
   cap. Score distance covered, falls, recovery and energy per metre. Keep the RL budget small
   enough to run on a CPU, and report the budget.
4. `codesign-agri` (agriculture): an end effector or row-crop rover for one job, such as
   weeding or picking soft fruit without bruising it. This builds on `osrobot-field`.
5. `codesign-logistics`: a low-cost gripper or mobile base for mixed totes and boxes, compared
   with a general-purpose arm at the same cost, as in `osrobot-specialise`.
6. `codesign-aero` (aerospace): an airframe and a learned attitude controller sized together
   for inspection or observation. This builds on `osrobot-uav` and `uav-energy-twin`, with
   PX4 or ArduPilot software-in-the-loop if it installs.
7. `codesign-transfer`: which designs are robust? Widen the domain randomisation (friction,
   mass, motor strength, print tolerance) and measure how the ranking of designs changes. A
   design that wins only in a narrow simulation is a weak candidate to print.
8. Owner steps: print and test the top designs from milestones 1 and 7, with a priced bill of
   materials, and record real against simulated success.

**Guardrails.**
- *Civilian only.* Build no weapons, no payloads meant to harm, no targeting, and no
  anti-jamming or counter-detection features. Do not tune designs to military missions. The
  methods are dual-use by nature, and that is acceptable. Military applications are not
  developed or published here.
- *Agent results are labelled.* Follow "LLMs in the loop": commit proposals as files, script
  the scoring, and give the attempt count. Use three or more seeds per RL comparison, and
  report the training budget.
- *Simulation is not a safety case*, as in track 9. A search-and-rescue robot is a tool for
  trained responders, and any field use is an owner step.
- *Lab tags.* Milestones 3 and 4 may build on ARPG, milestone 6 on RECUV, and milestones 1
  and 5 on HIRO. Otherwise say none fits.

## 15. Sensor fusion, computational imaging and 3D models from real captures (`sensing`)

Added on 2026-10-19 at the owner's request.

**Goal.** Get more from cheap sensors. There are three parts. *Fusion:* when do several cheap
sensors (MEMS IMUs, phone cameras, GNSS, wheel odometry, small thermal cameras), fused well,
match one expensive sensor at the same cost, and where do correlated errors and calibration
drift stop that? *Computational imaging:* burst denoising, HDR, deblurring and super-resolution
that let a small sensor stand in for a large one. *Real to 3D:* turn photos, phone video or
depth scans of real objects and places into accurate 3D models. That means meshes, Gaussian
splats and editable parametric CAD, with measured accuracy against capture effort (number of
views, baseline, lighting, sensor). Twin projects already cover parts of this (`fusion-twin`,
`stereo-twin`, `lens-twin`, `gnss-twin`, `odometry-twin`), and track 13 needs it for
multi-camera capture and novel views.

**Prior work.** Kalman (1960). Julier and Uhlmann (1997), the unscented filter. Mourikis and
Roumeliotis (2007), MSCKF, ICRA. Forster et al. (2017), IMU preintegration, *IEEE T-RO*. Qin,
Li and Shen (2018), VINS-Mono, *IEEE T-RO*. Furgale, Rehder and Siegwart (2013), Kalibr, IROS.
Zhang (2000), camera calibration, *IEEE TPAMI*. Hasinoff et al. (2016), HDR+ burst
photography, *ACM TOG*. Gallego et al. (2022), event cameras, *IEEE TPAMI*. Schönberger and
Frahm (2016), structure from motion revisited (COLMAP), CVPR. Mildenhall et al. (2020), NeRF,
and Kerbl et al. (2023), 3D Gaussian splatting (track 13). Burri et al. (2016), the EuRoC MAV
dataset, *IJRR*. Geiger et al. (2012), KITTI, CVPR. Open tools: OpenCV, GTSAM, COLMAP, Open3D,
gsplat, rawpy (LibRaw) and OpenVINS.

**Milestones.**
1. `sensing-imuarray`: N cheap MEMS IMUs against one better unit at equal cost. Use Allan
   variance models for each grade and errors correlated between units (as `fusion-twin`
   found). Where is the break-even, and what does a shared mount or temperature drift do to
   it?
2. `sensing-vio`: visual-inertial odometry on a public dataset (EuRoC, if its licence
   allows). Degrade the camera (resolution, frame rate, rolling shutter) and the IMU (noise,
   bias) to draw a curve of drift against sensor cost. Which upgrade buys the most accuracy
   per dollar?
3. `sensing-timesync`: camera-to-IMU time offset and extrinsic error. How many milliseconds of
   offset doubles the drift, and can online calibration recover it? This builds on
   `lens-twin`.
4. `sensing-burst`: burst denoising and HDR merge from a small sensor against one frame from a
   larger one, on openly licensed raw images or synthetic ones with a known noise model. This
   feeds track 13's sensor-size limit.
5. `sensing-recon`: real to 3D. Reconstruct objects with structure from motion and multi-view
   stereo, or with Gaussian splats, from openly licensed image sets. Score accuracy (Chamfer
   distance against a reference scan) against the number of views, baseline and image
   quality. How few photos make a usable model?
6. `sensing-scan2cad`: from a scanned mesh to editable, printable CAD. Fit planes, cylinders
   and a parametric model (CadQuery) to a reconstruction and measure dimensional error. Can a
   phone scan of a broken part yield a replacement part to print? This feeds tracks 1 and 5.
7. `sensing-thermalfuse`: RGB plus a low-resolution thermal camera for finding people in
   darkness or smoke, for search and rescue (track 14's `codesign-sar`). Compare against each
   sensor alone on open data, and measure how alignment error hurts.
8. Owner steps: capture real scans and sensor logs on owned hardware, and measure printed
   replacement parts against the originals.

**Guardrails.**
- *Real data, licensed.* Use datasets and image sets whose licence allows research use and
  redistribution of results, and cite them. Never scrape personal photos.
- *People are not targets.* Detecting people is for rescue and safety. Build no tracking or
  identification of specific people and no covert surveillance, and blur bystanders as in
  track 13.
- *GPU work is scaled down.* Gaussian splatting and NeRF training usually need a GPU. Run a
  reduced CPU version (few views, low resolution), report it as such, and list the full run
  as an owner step.
- *Code licences.* Some reference implementations are non-commercial (the original 3D
  Gaussian splatting code) or GPL (ORB-SLAM3). Prefer permissive alternatives such as gsplat
  (Apache-2.0), and never copy restricted code into this MIT tree.
- *Simulated is not real.* Keep synthetic-noise results apart from results on real captures.
- *Lab tags.* Milestones 2, 3 and 7 may build on ARPG (perception and mapping). Otherwise say
  none fits.

## 16. Energy supply and dense energy storage (`energy`)

Added on 2026-10-19 at the owner's request, as a long-term track: "one of the more important
things for humanity to progress on."

**Goal.** Cheap, clean energy supply depends on storing energy densely, cheaply and for a long
time: in vehicles and devices per kilogram and litre, on the grid per dollar of kWh delivered
over a lifetime. This track works on both halves in open, testable code. What limits each
storage technology (thermodynamics, materials, cost, degradation), how close real devices get,
which designs move the limits, and what mix of supply and storage meets demand at least cost?
The track cannot discover a new chemistry: that needs synthesis and cell testing, which are
owner steps. What it can produce is sound models, open tools, design searches scored by
simulators, and techno-economic analysis that others can check and build on.

**Prior work.** Bruce et al. (2012), *Nature Materials*, on the theoretical energy of Li-O<sub>2</sub>
and Li-S cells against Li-ion. Doyle, Fuller and Newman (1993), *J. Electrochem. Soc.*, for the
porous-electrode (DFN) cell model, implemented openly in PyBaMM (Sulzer et al. 2021, *J. Open
Research Software*). Brown, H&ouml;rsch and Schlachtberger (2018), *J. Open Research Software*,
for PyPSA power-system optimisation. Ziegler et al. (2019), *Joule*, on the storage cost that
long-duration storage needs to reach for wind and solar to supply most demand. NREL's Annual
Technology Baseline and Cole and Ramasamy's cost projections for utility-scale batteries. Open
tools: PyBaMM, PyPSA, HiGHS, CoolProp, Cantera, pymatgen.

**Milestones.**
1. `energy-density` (done 2026-10-19): theoretical ceilings per kilogram for batteries, hydrogen,
   flywheels, pumped hydro and thermal storage from first principles, reproducing published
   values, with the per-atom view (Wh/kg = 26,801 &times; eV per atom / mean atomic mass).
2. `energy-practical`: the gap between ceiling and product. Published cell-, pack- and
   system-level Wh/kg, Wh/L, cycle life and efficiency for each technology, every figure sourced
   and dated, as an open dataset, and where each gap comes from (inactive mass, voltage loss,
   utilisation).
3. `energy-cell`: cell design as a search. A PyBaMM cell (electrode thickness, porosity, active
   loading, N/P ratio) scored on energy density at a required power and on modelled
   degradation, with an LLM or session proposer against random search and Bayesian optimisation
   at the same budget.
4. `energy-lcos` (first version done 2026-10-19, assumed inputs): levelised cost of storage. Cost per kWh delivered over a lifetime for each
   technology and duration (hours to weeks), from capital cost, efficiency, cycle life and
   degradation, every price sourced and dated. Which technology wins at which duration?
5. `energy-mix` (first version done 2026-10-20, assumed costs, Germany 2019): supply design. The least-cost mix of solar, wind, firm supply and storage that
   meets a year of hourly demand in an open dataset, in PyPSA, and how sensitive it is to the
   cost and duration of storage.
6. `energy-thermal`: heat storage designed. A sand or rock store as a transient model (charging,
   losses through insulation, discharge to heat or power), sized for a house (with track 12) and
   for district heat, against a hot-water tank and a heat pump.
7. `energy-home`: solar plus battery sizing for a home, from an open hourly model, as a tool
   people can use (a candidate for `ventures/`).

**Guardrails.**
- *Ceilings and simulations are not devices.* Keep theoretical, simulated and measured figures
  apart, and never present a modelled cell or store as a tested one.
- *Every price and device figure is sourced and dated, or labelled assumed.*
- *Batteries, hydrogen and pressure are hazards.* Building, charging or testing cells, packs,
  pressure vessels or high-temperature stores is an owner step with certified parts and
  protection; results about them say what safety analysis was not done.
- *No grid or electrical work.* Anything that connects to the grid or a building's wiring needs a
  licensed electrician and the utility's approval; designs here are research.
- *Lab tags.* No group in `prompt.md` covers energy storage. Say so rather than stretching a
  connection; work on vehicle or UAV batteries may build on RECUV and track 9.

## 17. Societies of AI agents in robots among people (`society`)

Added on 2026-10-19 at the owner's request, as a research and entertainment direction. (Track 16, energy, was
added the same day.)

**Goal.** Simulate many AI-driven robots living and working among many people, and study the
society that forms. Robots carry programmed or learned behaviour; people adapt to each other
and to the robots. What conventions emerge (passing side, queueing, who yields at a door),
who sets them, and what do they cost the people? When do robots that coordinate among
themselves help a crowd, and when do they push it somewhere it did not choose? Does trust in
robots build or collapse as it spreads by word of mouth? The simulated people are digital
twins of human social behaviour, so every result is also a question about twin fidelity: does
a conclusion survive a more humanlike simulated crowd (track 11's imitators)? That is the
track's tie to the portfolio's theme.

The same simulations are also entertainment. A seeded run of a robot town is a story with a
cast, conflicts and turning points, and it can be watched in a browser. The entertainment
milestones turn research runs into watchable, clearly fictional episodes. They never present a
simulation as footage of real events.

**Prior work.** Reynolds (1987), boids, SIGGRAPH. Helbing and Molnár (1995), the social force
model, *Phys. Rev. E*. Moussaïd et al. (2009), side preference in pedestrian avoidance, *Proc. R.
Soc. B*. Lewis (1969), *Convention*. Young (1993), the evolution of conventions, *Econometrica*.
Shoham and Tennenholtz (1997), emergence of social conventions, *Artificial Intelligence*. Xie
et al. (2011), committed minorities, *Phys. Rev. E*. Centola et al. (2018), tipping points in
social convention, *Science*. Baronchelli (2018), the emergence of consensus, *R. Soc. Open
Sci.* Leibo et al. (2017), sequential social dilemmas, AAMAS, and Leibo et al. (2021), Melting
Pot, ICML. Park et al. (2023), generative agents, UIST. Kruse et al. (2013), human-aware robot
navigation, *Robotics and Autonomous Systems*. Mavrogiannis et al. (2023), social robot
navigation, *ACM THRI*. Hancock et al. (2011), trust in human-robot interaction, *Human
Factors*. Open tools: Mesa, PettingZoo, Gymnasium, and a browser canvas for replays.

**Milestones.**
1. `society-robotnorms`: robots as a committed minority in a human walking convention. People
   pick a passing side by memory of recent partners; robots either hold a programmed side or
   adapt. What robot share tips the crowd, how does it depend on memory and on where robots
   are placed, and what does a fleet that tries and fails cost the people? Mean field against
   simulation.
2. `society-plaza`: the same question in continuous space, with a social-force crowd and
   robots that have their own side bias and speed. Do lanes form around the robots' choice?
   Score people's detours and personal-space intrusions. Ship a seeded browser replay.
3. `society-trust`: people's trust in robots updated by their own encounters and by gossip.
   When does one robot's error rate sink the fleet's reputation, and does transparency (robots
   that explain a failure) change that? Stylised trust dynamics, citing measured factors from
   Hancock et al.
4. `society-commons`: robots and people sharing a scarce resource (a lift, a narrow pavement,
   charging points) as a sequential social dilemma. How much robot throughput does a
   deferential policy cost, and how much human welfare does it buy?
5. `society-llmtown`: a small town of LLM-driven robot agents with memory and plans, as in
   generative agents, among scripted or imitated people. Which norms do the agents state, and
   which do they keep? Model calls sit behind an environment variable with a deterministic
   stub, per "LLMs in the loop".
6. `society-twinfidelity`: rerun milestones 1 and 2 with simulated people drawn from track 11's
   imitators or from published trajectory data. Which conclusions change when the crowd is
   more humanlike?
7. `society-show` (entertainment): turn seeded runs into short watchable episodes in the
   browser, with a cast, a log of turning points and a narrated summary. Every episode says it
   is a simulation and fiction, and its seed and code reproduce it exactly.
8. Owner steps: any study with real people (a survey, an online game, a corridor with a real
   robot) needs informed consent and ethics review, and is the owner's to run. Publishing the
   show under a name, or as a product in `ventures/`, is also the owner's call.

**Guardrails.**
- *Simulated people are not people.* Keep every result about simulated crowds apart from claims
  about real human behaviour, and say which behavioural rule each result assumes.
- *No covert manipulation.* Robots that shift human norms raise consent questions. Report the
  cost to people of every norm-shifting policy, and build no design for covert persuasion,
  crowd control, policing or surveillance, and no identification of real people.
- *Fiction is labelled.* Entertainment output is marked as simulated and fictional, depicts no
  real person, and is never passed off as real footage or a real event.
- *No human-subject work in a run.* Studies with people are owner steps (milestone 8).
- *Lab tags.* Milestones 1 to 4 may build on HIRO (social intelligence) and CAIRO (human-robot
  collaboration, simulated human models). Say so only where the project actually does.

## 18. Laundry-hanging robots and custom hangers (`hanger`)

Added on 2026-10-19 at the owner's request, as a long-term robotics project.

**Goal.** A robot that takes clothes out of a dryer, or from a loader that a person or a
washer-dryer fills, and puts every item on a hanger, so laundry comes out hung and needs
little or no pressing. "Every item" is the hard part: tees, shirts, trousers, dresses,
children's clothes and knits all differ in size, opening and how they want to hang. So the
hangers are part of the design. They can be custom shapes, a small rack of sizes, or an
adjustable hanger the robot sets per garment, and they are designed in a simulation feedback
loop: a cloth model scores how well a hanger holds a garment in its worn, pressed shape, a
proposer changes the hanger, and the cycle repeats. The robot also decides, per item, whether
hanging will leave it better pressed than folding (a heavy knit can stretch on any hanger),
and folds or sets aside what should not hang.

**Prior work.** Maitin-Shepard, Cusumano-Towner, Lei and Abbeel (2010), towel folding with a
PR2, ICRA. Doumanoglou et al. (2016), garment unfolding and recognition, *IEEE T-RO*.
Seita et al. (2019–2021), fabric smoothing and VisuoSpatial Foresight, RSS. Ha and Song
(2022), FlingBot, CoRL. Avigal et al. (2022), SpeedFolding, IROS. Chi et al. (2023), diffusion
policy, RSS. Kawabata (1980), the KES-FB fabric measurement system. Baraff and Witkin (1998),
large steps in cloth simulation, SIGGRAPH, and Bergou et al. (2008), discrete elastic rods,
SIGGRAPH. Hansen (2016), the CMA evolution strategy tutorial. Commercial folding machines
(FoldiMate, Laundroid) are context, not sources of data. Open tools: NumPy, MuJoCo,
PyBullet, SoftGym, Blender's cloth solver, Gymnasium. Check each before citing it.

**Milestones.**
1. `hanger-fit` (done 2026-10-19): a hanger designed in a sim loop. A 2D drape model of a garment's shoulder
   line and sleeve over a hanger arm scores how far the garment hangs from its worn shape and
   how sharply it is bent (the cause of shoulder bumps). Compare stock hangers, a custom hanger
   per garment, one universal hanger, an adjustable-width hanger and a rack of k sizes, with
   CMA-ES against random search at the same budget.
2. `hanger-fold` (done 2026-10-20; the fold side is a one-line crease model and drives the result): hang or fold? Add a wrinkle and stretch-set model per fabric and the folded
   alternative, and learn the decision rule a robot can apply from what it can sense (size,
   weight, stretch when lifted).
3. `hanger-insert` (done 2026-10-20; a perimeter-bound model, not cloth: rigid hangers need 43–61 cm of loop, a collapsing one 31 cm): getting the hanger in. Simulate inserting a rigid, collapsible or
   adjustable hanger through the neck or hem of a garment held by one or two grippers. Score
   success, neck stretch and time, and feed the result back into the hanger design.
4. `hanger-3d` (done 2026-10-20; one 20 cm strip, assumed constants: matches the 2D chain on a deep arm, and arm depth drives the 3D error): the drape in 3D with an open cloth solver (front and back panels, sleeves,
   collars), checked against milestone 1 on the cases both can run.
5. `hanger-pick` (done 2026-10-20; stylised disc pile with assumed times: aiming at a visible opening takes 13.4 s per garment, pinching and regrasping 22.7 s, and blind sweeping is slower than aiming): picking one garment out of a tangled dryer load and finding its neck or
   waistband, on simulated cloth, with a scripted baseline before any learned policy.
6. `hanger-cell` (done 2026-10-20; station times other than insertion are assumed placeholders: pick and fold dominate, the hanger design moves time per load by under 3%): the whole cell as a discrete-event model (dryer or loader, picker, hanger
   feeder, rail): throughput, failure and recovery rates, and the cost of each station, built
   on milestones 2 to 5.
7. `hanger-print` (done 2026-10-20; strength never limits the round-ended designs, the print bed does: nothing useful fits 220 mm whole): the winning hanger shapes as parametric, printable CAD (OpenSCAD or
   CadQuery) with a strength check, a printable by-product people can use today.
8. Owner steps: buying or printing hangers, building the robot, measuring real fabrics and
   garments, and any test with real laundry.

**Guardrails.**
- *Simulated cloth is not cloth.* Fabric constants are assumed until an owner step measures
  them; say which result depends on which assumption, and keep simulated hanging quality apart
  from any claim about real garments.
- *Safety.* A real cell has pinch points, heat from the dryer and moving rails near people;
  every hardware design lists the hazards and a stop, and no run builds or powers hardware.
- *Lab tags.* This track may build on track 9's purpose-built robots and track 14's co-design
  loop; say so only where a project actually does.

## 19. Machine learning on qualitative data with LLMs (`qual`)

Added on 2026-10-20 at the owner's request, marked as an interesting topic for future research
and applications.

**Goal.** Machine learning has needed numbers. Qualitative data (interviews, open survey answers,
reviews, support tickets, field notes) could join in only after slow hand-coding or crude word
counts. LLMs read text the way a coder does and follow a codebook written in plain language, so
qualitative data can now be coded, counted, compared, modelled and used to generate hypotheses at
scale. This track asks what that makes possible and when the resulting numbers can be trusted:
an LLM's code is a measurement with error, and the error can differ between groups.

**Prior work.** Gilardi, Alizadeh and Kubli (2023), *PNAS*, LLM vs crowd-worker annotation.
Ziems et al. (2024), *Computational Linguistics*, LLMs on 24 computational social science
benchmarks. Egami, Hinck, Stewart and Wei (2023), NeurIPS, design-based supervised learning for
LLM labels. Angelopoulos et al. (2023), *Science*, prediction-powered inference. Pham et al.
(2024), NAACL, TopicGPT. Lam et al. (2024), CHI, LLooM concept induction. Hegselmann et al.
(2023), AISTATS, TabLLM. Ludwig and Mullainathan (2024), *QJE*, ML for hypothesis generation.
Argyle et al. (2023), *Political Analysis*, simulated survey samples. Krippendorff (2011),
alpha reliability. Check each before citing it.

**Milestones.**
1. `qual-correction` (done 2026-10-20): when can you count an LLM's codes? Naive, human-only and
   prediction-powered estimates of a code's prevalence and of a group gap, against simulated
   coders with known error. An 89%-accurate coder is confidently wrong; with differential error
   the naive gap has the wrong sign; PPI with 200 hand-coded items fixes both, and stops paying
   below about 80% coder accuracy.
2. `qual-real`: the same pipeline on a public, hand-coded corpus (open-ended survey answers or
   annotated reviews with a licence that allows it), with a model behind `ANTHROPIC_API_KEY` and a
   deterministic stub. Without a key, label any session-agent coding as such.
3. `qual-dialect` (done 2026-10-21, no LLM yet): measure milestone 1's mechanism on real data, whether LLM coding accuracy
   differs across dialects, languages or writing fluency, and how much that moves group
   comparisons.
4. `qual-induce` (no-LLM baseline done 2026-10-21; an LLM-proposed codebook still open): inductive coding. Compare LLM-proposed codebooks (TopicGPT/LLooM style) with
   a human codebook on the same corpus: coverage, redundancy, and agreement when each is applied.
5. `qual-features` (done 2026-10-21): qualitative codes and LLM-scored dimensions as features next to numeric ones
   in a predictive model, against embeddings and bag-of-words at the same labelling budget.
6. `qual-hypothesis` (done 2026-10-20): LLM-proposed, human-readable hypotheses about what separates two sets of
   documents, scored on held-out data, with a check for hypotheses that merely restate the label.
7. `qual-regression` (done 2026-10-20): extend the correction from means to regression coefficients (DSL, PPI++)
   and to multi-class codes.

**Applications.** Customer feedback and support-ticket analytics, open-ended survey analysis,
user research synthesis, policy consultation responses, qualitative health research, and the
portfolio's own run records. Each needs the same validation step.

**Guardrails.**
- *Codes are measurements.* Every count, gap or model built on LLM codes reports how it was
  validated against a random hand-coded sample, not just an agreement score.
- *Privacy and consent.* Use only public data whose licence allows the use; never put personal
  data in the repository.
- *No benchmark claims without a real model.* Simulated coders are labelled as simulated.

## 20. Robots on the residential building site (`buildbot`)

Added on 2026-10-21 at the owner's request, as a long-term direction: "physics sims with
already available consumer robots training on construction tasks to reduce the cost of new
residential home construction. maybe alongside humans? the goal is to have outputs of useful
skills. either on already manufactured robots like unitree or alternatively on custom built
robotics fully designed."

**Goal.** Cut the labour cost of building a new home with robots that work on an ordinary
residential site, alone or beside a crew, and publish the skills as reusable outputs: trained
policies, controllers, task specifications and the simulation scenes that score them. Labour
is a large share of a new house's construction cost, and the track-12 models (`house-cost`,
`house-schedule`, `house-offsite`) already say which tasks take the hours. Two kinds of robot
are in scope. *Off the shelf*: robots anyone can buy now, such as Unitree's G1 and H1
humanoids, its Go2 quadruped and Z1 arm, or the SO-101 arm of track 4, which have open
simulation models in MuJoCo Menagerie. *Purpose-built*: robots designed from the task in the
loop of tracks 9 and 14, such as a framing-table gantry or a sheet-hanging lift. The question
is the same for both. Which residential tasks can a robot do to a builder's tolerance in
simulation, at what speed, and what does that take off a house's price once the robot's own
cost is counted? Where does a robot beside a person beat either alone?

**Prior work (not yet checked; check before citing).** Todorov et al. (2012), MuJoCo; Zakka
et al. (2022), MuJoCo Menagerie; Zakka et al. (2025), MuJoCo Playground; Rudin et al. (2022),
massively parallel legged RL (track 14). Radosavovic et al. (2024), real-world humanoid
locomotion with RL, *Science Robotics*. Sferrazza et al. (2024), HumanoidBench. Zhao et al.
(2023), ACT and ALOHA; Chi et al. (2023), diffusion policy (track 18). Kumagai et al. (2019),
AIST's HRP-5P humanoid installing gypsum board. Dorfler et al. (2016), ETH Zurich's In situ
Fabricator. Commercial site robots as context, not as open work: FBR's Hadrian X
(bricklaying), Construction Robotics' SAM and MULE (masonry lift assist), Canvas (drywall
finishing), Dusty Robotics (layout printing), Built Robotics (autonomous excavation).
ISO 10218-1 and -2 (2025) and ISO/TS 15066 (2016) for robots working with people. Waters et
al. (1993), the revised NIOSH lifting equation, for the human side of a shared lift.

**Milestones.**
1. `buildbot-payload` (done 2026-10-21): what can a stock humanoid lift? Whole-body static
   payload envelopes of the Menagerie G1 and H1 (feet fixed, balance kept, every joint within
   its torque limit) over hand height and reach, and a table of residential handling tasks
   against them, solo and shared with a person.
2. `buildbot-taskbook` (done 2026-10-21): an open task specification of a wood-frame house. For each task
   (carry, place, hold, fasten, cut, lay out, finish): masses, forces, reach, tolerance,
   cycle count and crew hours, taken from the track-12 takeoffs and schedule. Which tasks hold
   the most labour cost per unit of robot difficulty? The output is a dataset other robot
   projects can score against.
3. `buildbot-carry` (envelope done 2026-10-21; a walking policy, falls and drops still open): dynamic carrying. A learned (or model-based) walking policy carries a stud,
   a sheet or a block across a site floor and over thresholds and ramps from `terrain-twin`.
   Score falls, items dropped, metres per minute and energy per item, on a CPU budget stated
   in the README. Does a stock humanoid's carry rate beat one labourer's?
4. `buildbot-fasten`: driving nails and screws. Tool reaction forces, the stud-face tolerance
   (a 1.5 in face behind sheathing) against arm placement error, and a policy that drives a
   sheathing nailing schedule. The skill is the output: a policy plus its test scene.
   *Stud-finding follow-up (`buildbot-studfind`, done 2026-10-22):* a single stud read must be good to 0.89 mm for 95% clean sheets; averaging and pooling help, re-measuring each nail does not.
5. `buildbot-cohold` (done 2026-10-21): a person and a robot holding one sheet. The robot follows a simulated
   person's lead under impedance control while the person fastens. Score interaction forces
   against ISO/TS 15066 body-region limits, sheet placement error and the person's lifted load
   against the NIOSH limit.
6. `buildbot-skills` (sim-to-sim check of the cohold follow skill done 2026-10-22; loadable skill files, a loader and a re-scorer done 2026-10-22 as `buildbot-skillpack`; the carry and fasten skills as controllers are still open): a skill library. Train the skills of milestones 3 to 5 with domain
   randomisation, check them across a second simulator or contact model (sim-to-sim as the
   proxy for sim-to-real, `codesign-transfer`), and publish policies, scenes and success rates
   in a form a robot owner could load.
7. `buildbot-custom` (done 2026-10-21, a modelled sheathing-nailing gantry; no machine built or quoted): purpose-built against humanoid. Design a task-specific machine for the
   costliest task from milestone 2 with the track-9 and track-14 loops, and compare it with the
   best stock robot on cost, cycle time and success.
8. `buildbot-cost` (done 2026-10-21): what it is worth. Crew hours replaced or shortened, times wages, against the
   robot's purchase, upkeep and supervision per hour, fed through `house-cost` and
   `house-schedule`. What share of a new home's price does a credible robot crew remove?
9. Owner steps: buy or rent a robot (a G1 is the cheapest humanoid in the Menagerie set) and
   test the published skills on a mock-up wall, with a priced bill of materials.

**Guardrails.**
- *Simulation is not a safety case.* A robot carrying lumber beside a person is a
  falling-object and crush hazard. Any test near people needs the owner's risk assessment
  against ISO 10218 and ISO/TS 15066 and the site's OSHA obligations. Never present a simulated
  envelope as a rated payload.
- *Vendor numbers are claims.* Quote a manufacturer's payload, torque or speed as the
  manufacturer's figure with its date and source, and keep it apart from simulated results.
  The Menagerie models are the community's approximations of the robots, not the vendor's
  validated dynamics.
- *Model licences.* The Unitree models in Menagerie are BSD-3-Clause; fetch them at a pinned
  commit rather than copying meshes into the tree, and credit them.
- *Honest about labour.* Report hours and costs, not claims about jobs. A result about a robot
  "beside a crew" says what the people still do.
- *Lab tags.* No group in `prompt.md` covers construction; milestones 3 and 7 may build on the
  groups track 9 names. Say so rather than stretching a connection.

## 21. Applied R&D for the industries modern life runs on (`infra`)

Added on 2026-10-21 at the owner's request: "I want to work on tools for water and sanitation
shelter and climate control energy electric utiltiies and grid mining and extraction basic
materials and heavy industry transportation and logistic including other propulsion and
trasnportation methods. Semiconductors and electronics Finance and payments Manufacturing and
machine tools Waste management looking for innovations and applications of advanced research to
these domains to improve efficiency be useful in smalll or large jumps." And, on order: "Energy
as the master resource ... If you had to pick just one, pick energy, including the grid."

**Goal.** Take methods that already work somewhere (optimisation, statistics, simulation,
machine learning, robotics, the repo's own research tools) and apply them where they are thin:
the physical industries everything else depends on. Water and sanitation, shelter and climate
control, energy and the grid, mining, basic materials (cement, steel, chemicals), transport and
logistics (including other propulsion), semiconductors, payments, manufacturing and machine
tools, and waste. Each project picks one costly, measurable problem in one of them, reproduces
the standard method on an open benchmark, then asks whether a transferred method does better at
the same budget. A small, checked gain on a real benchmark beats a large one on a toy.
Energy comes first: most of these industries are limited by cheap, reliable energy, so grid
and energy milestones lead the list and take ties. Track 16 (`energy`) covers storage and supply
mix; this track covers the grid and energy use inside the other industries. A project that is
really a storage question belongs in track 16, a house-scale one in track 12, and robots on a building site in track 20.

**Prior work and open tools.** Check each before citing it. Grid: EPRI's OpenDSS
(`opendssdirect.py`), pandapower (Thurner et al. 2018, *IEEE Trans. Power Systems*), the IEEE PES
distribution test feeders, IEEE C57.91 (transformer loading and insulation ageing). Water:
EPANET and WNTR (Klise et al. 2017), the BattLeDIM 2020 leakage benchmark and its L-Town network
(Vrachimis et al. 2022, *J. Water Resources Planning and Management*). Logistics: Solomon's
(1987) VRPTW instances, the electric VRP with recharging stations (Schneider, Stenger and Goeke
2014, *Transportation Science*), OR-Tools and HiGHS. Materials: limestone calcined clay cement
(Scrivener et al. 2018, *Cement and Concrete Research*). Mining: Bond's (1952) work index for
grinding energy. Machine tools: analytical chatter stability (Altintas and Budak 1995, *CIRP
Annals*). Payments: gridlock resolution and liquidity-saving mechanisms (Bech and Soram&auml;ki
2001; Martin and McAndrews 2008, *J. Monetary Economics*). Waste: the ZeroWaste sorting dataset
(Bashkirova et al. 2022, CVPR). Buildings: MPC for buildings (Drgo&ntilde;a et al. 2020,
*Annual Reviews in Control*).

**Milestones.** Grid and energy first; the rest in any order.
1. `infra-hosting` (done 2026-10-21; IEEE 13-node only, snapshots): how much rooftop PV and EV charging can a distribution feeder take before
   voltage or thermal limits bind, and how much do cheap measures (inverter volt-var, smart
   charging, a tap change) add? OpenDSS on IEEE test feeders, hosting capacity as a stochastic
   sweep, each measure scored on the same placements.
2. `infra-transformer` (done 2026-10-21; transformer constants swept, not verified against the standard): distribution transformer ageing under heat-pump and EV load growth. The
   IEEE C57.91 hot-spot and ageing model on an hourly load profile: how much load growth doubles
   loss of life, and how much of it a charging schedule buys back, before a replacement is due.
3. `infra-waterloss` (done 2026-10-21; Net3 with simulated leaks, BattLeDIM unreachable from the proxy, so the L-Town baseline is still open): finding leaks from pressure data. WNTR on BattLeDIM's L-Town with its
   published leak schedule: the competition's best methods as baselines, and the repo's
   `changepoint-detector` (PELT, Bayesian online) applied to residuals, scored by detection
   delay and false alarms.
4. `infra-propulsion` (done 2026-10-21; floors only, most inputs assumed and swept): energy per tonne-km by mode from first principles (rolling resistance,
   aerodynamic and hull drag, lift), reproducing published figures, then the range and payload
   each storage technology from `energy-density` and `energy-practical` gives a truck, train,
   ship and aircraft. Which modes can electrify directly, and which need a fuel?
5. `infra-routing` (done 2026-10-22; Solomon RC208 with assumed battery, Schneider instances unreachable, no tariff): electric delivery fleets. EVRPTW on the Schneider et al. instances, OR-Tools
   and an LLM or session proposer against the published best-known solutions at the same
   budget, with charging cost on a time-of-use tariff (track 16's `energy-tou`).
6. `infra-cement` (done 2026-10-21; strength from one study's table read via search summary, primary papers unreachable): clinker substitution. Mass and energy balance of OPC, LC3 and slag blends
   per tonne of cement, with CO<sub>2</sub> split into calcination and fuel, every factor
   sourced; which substitution levels keep a published strength class?
7. `infra-grind` (done 2026-10-21; model parameters typical values, swept, not fitted to a mill; open/closed gap far above the published factors): comminution circuits. A population-balance ball-mill and classifier model
   against Bond's law; the energy saved by circuit choices (cut size, recirculation load) at
   the same product size, set against published plant figures.
8. `infra-chatter` (done 2026-10-21; one benchmark mode, no measured FRF): stability lobes for milling. The Altintas-Budak zero-order solution against
   time-domain simulation, then the spindle speeds that maximise metal removal rate for a
   measured tool tip FRF from a public dataset.
9. `infra-yield` (done 2026-10-21; wafer prices and D0 are 2020 secondary-source snapshots, packaging assumed and swept): cost per good die. Poisson, Murphy and negative-binomial yield models against
   die area and defect density, reproducing published curves, and the chiplet break-even
   (tracks 3, 7 and 8 cover design; this covers the fab and packaging economics).
10. `infra-sorting` (done 2026-10-22; TACO annotations only, detector assumed not trained): robotic waste sorting. A detector trained on ZeroWaste or TACO, and a
    simulated conveyor pick cell (with track 4's twin) scored on purity, recovery and picks per
    minute against belt speed.
11. `infra-netting` (done 2026-10-22; synthetic payments fitted to the paper's published bounds, Finnish delay reduction unexplained): liquidity in payment systems. A simulated RTGS day with a published
    payment-size distribution: how much liquidity bilateral and multilateral offsetting saves,
    and how much delay it costs, against the Bech-Soram&auml;ki algorithm.
12. `infra-hvacmpc` (done 2026-10-22; envelope from recalled ASHRAE 140 values, no measured dataset reachable so nothing fitted): heating and cooling control. A grey-box RC building model fitted to an
    open dataset, MPC against a thermostat rule on a time-of-use tariff and a forecast that
    is not perfect (the lesson of `energy-tou-lp-forecast`).
13. `infra-pumpsched` (done 2026-10-23; Net3 only, tariff shapes assumed and swept): pump scheduling. A daily lake-pump window on Net3 against time-of-use tariffs, separating the energy saved by changing the source mix from what the tariff adds.

14. `infra-dcopf` (done 2026-10-23; three MATPOWER cases, branch limits never bind on case118, tightened-limit solves often fail): how wrong is the DC approximation of optimal power flow, in cost and in the AC feasibility of its dispatch.
15. `infra-leakpdd` (done 2026-10-23; Net3 only, noise-free sensor response, required pressure assumed and swept): does demand-driven simulation mislead leak detection. Net3 leak signals under demand-driven and pressure-driven demand across demand levels: identical to 1.25 times base demand, both models fail beyond 1.5 times.
**Method transfers worth trying.** The point of the track is the transfer, so say in each README
where the method came from. Changepoint detection and conformal prediction for sensor and meter
data; Bayesian optimisation and LLM proposers for process settings; LP and MILP (HiGHS) for
scheduling and dispatch; queueing and discrete-event twins (track 4's `robofab-cell`) for ports,
yards and warehouses; survival analysis for asset failure; graph algorithms for networks and
netting; simulators plus learned surrogates for anything slow.

**Guardrails.**
- *Models are not plants.* Keep simulated, benchmark and field figures apart, and never present a
  modelled feeder, network, mill or cell as a measured one.
- *No connection to real operational systems.* No SCADA, OT, utility, payment-network or plant
  system is touched, scanned or probed, and no vulnerability research targets real
  infrastructure. Public datasets and simulators only.
- *Safety-critical designs are research.* Drinking water, grid protection, pressure, structural
  and machine-guarding work needs licensed engineers and the operator's approval before any use;
  say so in the README. Track 16's grid and electrical rule applies.
- *Payments and money.* No real accounts, funds or customer data. Results are not financial
  advice.
- *Every price, emission factor and device figure is sourced and dated, or swept.*

## 22. Autonomous flying machines for commercial logistics (`aerolog`)

Added on 2026-10-24 at the owner's request: "I want one of the research directions to be
commmercial logistics autonomous flying machines. to work on both at scale models and 1:1 work".

**Goal.** Uncrewed aircraft that move goods for a living: parcel and medical drones, cargo
VTOL and fixed-wing feeders, the fleets that fly them and the ground they work from. Work at
two sizes and keep them joined. *Scale models* are what this repo and the owner can build and
fly: sub-scale and small aircraft (under the 55 lb FAA Part 107 limit) that test an airframe,
controller or operation cheaply. *1:1 work* is the full-size vehicle and its operation: a cargo
VTOL or a converted feeder aircraft sized for a real payload and route, studied by design and
simulation. The question that runs through the track is what a model at 1:N tells you about
the machine at 1:1, and where it lies: similitude says Froude, Reynolds and Mach numbers cannot
all be matched at once, and batteries, motors and structure do not scale the same way either.
Each project says which size it works at, and a project at one size names what would change at
the other.

Neighbouring tracks already hold pieces of this. `osrobot-uav` and its follow-ups size a
purpose-built observation UAV, `codesign-aero` sizes an airframe and a learned attitude
controller together, `uav-energy-twin` plans battery margin under wind, `infra-propulsion`
compares freight modes per tonne-km and `infra-routing` routes electric delivery vans. This
track builds on them and asks the logistics questions they leave out: payload, cost per
delivery, fleet and hub throughput, airspace and noise, and the jump between sizes.

**Prior work and open tools.** Check each before citing it. Similitude and sub-scale flight
testing: Wolowicz, Bowman and Gilbert (1979), NASA TP-1435; NASA's AirSTAR dynamically scaled
transport model (Jordan et al. 2006, AIAA). Delivery-drone energy and emissions: Stolaroff et al.
(2018), *Nature Communications*; Rodrigues et al. (2022), *Patterns*, with an open dataset of
measured delivery-quadcopter flights; D'Andrea (2014), "Can drones deliver?", *IEEE T-ASE*.
Truck-and-drone routing: Murray and Chu (2015), the flying sidekick TSP, *Transportation
Research C*; Agatz, Bouman and Schmidt (2018), *Transportation Science*. Full-size concepts:
Johnson, Silva and Solis (2018), NASA's concept vehicles for VTOL air taxi operations (the
sizing method transfers to cargo). Airspace: the BlueSky open ATM simulator (Hoekstra and
Ellerbroek 2016, ICRAT). Propellers at small scale: the UIUC propeller database (Brandt and Selig
2011, AIAA 2011-1255). Open tools: AeroSandbox (Sharpe, MIT), OpenVSP, XFOIL, PX4 or ArduPilot
software-in-the-loop with Gazebo, OR-Tools and HiGHS. Raymer, *Aircraft Design: A Conceptual
Approach*, for the full-size weight and sizing relations.

**Milestones.** A starting order; follow the results.
1. `aerolog-scaling`: what does a 1:N model tell you about the 1:1 aircraft? Take one cargo
   airframe, model it in AeroSandbox at full size and at 1:2 to 1:10, and measure which
   quantities a Froude-scaled model reproduces (trim, dynamic modes, gust response) and which
   it misses (Reynolds-driven drag and stall, battery and motor mass fractions). Reproduce the
   scaling relations of NASA TP-1435 first. The by-product is a scaling calculator both halves
   of the track use.
2. `aerolog-energy`: energy and cost per delivery. A first-principles multicopter, fixed-wing
   and lift-plus-cruise model fitted to the measured flights in Rodrigues et al. (2022), checked
   against Stolaroff et al. (2018), then compared with a van per parcel at the same route
   density. Where in payload and distance does each win?
3. `aerolog-sizing` (1:1): size a full-size cargo VTOL for payloads from 5 to 500 kg and
   ranges to a few hundred km, battery against hybrid, with sourced battery figures from
   `energy-density`. Where does battery-electric stop closing, and how sensitive is that to
   cell specific energy? Then use milestone 1 to derive the sub-scale demonstrator that would
   test the winning configuration.
4. `aerolog-sitl` (scale model): fly the sub-scale demonstrator in PX4 or ArduPilot SITL on a
   delivery mission in wind, and compare endurance and tracking against milestone 2's
   analytic model and `uav-energy-twin`'s wind margin.
5. `aerolog-dispatch`: fleet operations. Truck-and-drone and hub-and-spoke drone delivery on
   published instances (Murray and Chu's, or Solomon's), with battery and wind from the models
   above, against a van-only baseline. How many aircraft per hub, and what does wind
   cancellation do to the service level?
6. `aerolog-hub`: the ground side. Charging against battery swap, landing-pad and loading
   throughput, as a queueing or discrete-event model (track 4's `robofab-cell` method); which
   resource binds first as demand grows?
7. `aerolog-airspace`: traffic density. BlueSky with a city-scale delivery demand: conflict
   rate and deconfliction cost against aircraft per km<sup>2</sup>, and the capacity a corridor
   or layered airspace buys.
8. `aerolog-noise`: community noise. Sound level on the ground against altitude, rotor tip
   speed and configuration, checked against published delivery-drone measurements; which
   design changes buy the most decibels per watt?
9. `aerolog-handoff`: the last metre. Winch-lowered against landed and dropped delivery:
   precision, time on station and energy, with a simple tether-and-gust model.
10. Owner steps: build and fly the sub-scale demonstrator under Part 107 (or the local
    equivalent), log real flights and record measured against simulated endurance and energy.
    Full-size hardware and flight are for a certificated operator and manufacturer, never
    for this repo.

**Guardrails.**
- *Civilian logistics only.* No weapons, no payload release aimed at people or property, no
  targeting, no anti-jamming, counter-detection or evasion features, and no tuning to military
  missions. Track 14's rule applies.
- *Export control.* Complete designs of long-range uncrewed aircraft can be controlled (the
  EAR's 9A012 and 600 series; MTCR Category II covers UAV systems with a range of 300 km or
  more). Keep published 1:1 work at the conceptual-sizing level, and flag to the owner before
  publishing anything closer to a buildable design of such an aircraft.
- *Flying is an owner step.* No flight, no airspace use, no connection to real aircraft,
  ground stations, UTM/LAANC services or air-navigation systems from this repo. Any flight
  follows the local rules (FAA Part 107 in the US; commercial delivery needs more, such as Part
  135, and the proposed Part 108 for beyond-visual-line-of-sight work).
- *Simulation is not airworthiness.* Results are research, not a safety case or a
  certification basis; say so in each README. Keep scale-model, SITL, full-size simulated and
  measured figures apart, and never present a modelled aircraft as a flown one.
- *Every battery, motor, mass and price figure is sourced and dated, or swept*, as the
  research rules require.
- *Lab tags.* RECUV fits most milestones (UAV flight and airspace); say so where it does and
  say none fits otherwise.

## 23. Autonomous water vehicles of every sort (`marine`)

Added on 2026-10-24 at the owner's request: "I also want one of the development directions to be
autonomous water vehicles of multiple sorts very cool system."

**Goal.** Autonomous craft on and under the water, treated as one system: the vehicle, its
energy, its sense of where it is, the rules of the road it must follow, and the fleet it works
in. "Multiple sorts" is the point. Surface vessels (small survey boats, catamarans, hydrofoils,
autonomous ferries), sailing and wing-sail drones, wave- and solar-powered station keepers,
propeller AUVs, buoyancy-driven gliders, tethered ROVs and amphibious craft each trade speed,
endurance, payload and cost differently. Which body suits which job (bathymetric survey, water
quality sampling, harbour inspection, aquaculture net checks, search patterns, small-cargo
shuttles), and what limits each: drag, energy, navigation without GNSS, acoustic communication,
or collision rules? Track 9 (`osrobot`) builds purpose-built robots in general and track 14
(`codesign`) co-designs bodies with RL, and track 22 (`aerolog`) takes the air; this track owns anything whose medium is water. The
freight-ship energy floor in `infra-propulsion` (track 21) is a starting point, not this track.

**Prior work and open tools.** Check each before citing it. Dynamics and control: Fossen (2011),
*Handbook of Marine Craft Hydrodynamics and Motion Control* (Wiley) and his open Python and MATLAB
vehicle toolbox (MSS). Resistance: the ITTC 1957 friction line and Holtrop and Mennen (1982), *An
approximate power prediction method*, International Shipbuilding Progress. Sea states:
Pierson and Moskowitz (1964) and the JONSWAP spectrum (Hasselmann et al. 1973). Rules of the road:
the IMO COLREGs (1972); velocity obstacles (Fiorini and Shiller 1998, *IJRR*) and their COLREGs
form for USVs (Kuwata et al. 2014, *IEEE J. Oceanic Engineering*). Gliders: Rudnick et al. (2004),
*Underwater gliders for ocean research*, Marine Technology Society Journal. Simulators and stacks:
Gazebo's VRX (Virtual RobotX; Bingham et al. 2019, OCEANS), Stonefish (Cie&sacute;lak 2019, OCEANS),
ArduPilot Rover (boat frames) and ArduSub, ROS 2. Perception data: MaSTr1325 (Bovcon et al. 2019,
IROS) and its successors for maritime obstacle segmentation. Environment data: NOAA tides and
currents, Copernicus Marine and public AIS archives (probe each through the proxy first).

**Milestones.** A starting order; follow the results.
1. `marine-hull`: which small hull carries a survey payload furthest per kWh? Monohull, catamaran,
   SWATH, planing hull and hydrofoil from ITTC 1957 plus form factors (Holtrop-Mennen where it
   applies), checked against a published resistance curve, then endurance on a sourced battery
   and solar figure from track 16's `energy-density` at survey speeds.
2. `marine-path`: holding a survey line in wind, waves and current. Fossen's 3-DOF surface model,
   line-of-sight guidance with PID, integral LOS and MPC, scored on cross-track error and energy
   across sea states from a JONSWAP spectrum.
3. `marine-colregs`: collision avoidance that obeys the rules. Velocity obstacles, sampling MPC and
   a rule-based baseline on a scripted library of head-on, crossing and overtaking encounters (and
   real encounter geometries replayed from public AIS where reachable), scored on closest point of
   approach, rule compliance and detour length. An LLM or session proposer may tune the cost
   weights against CMA-ES at the same budget.
4. `marine-glider`: when does a glider beat a propeller AUV? A buoyancy-engine saw-tooth model:
   range against glide angle and dive depth, against a propeller AUV of the same mass and battery,
   reproducing a published glider range figure first.
5. `marine-sail`: autonomous sailing routes. A polar diagram for a small wing-sail drone,
   isochrone weather routing on a recorded wind and current field, and how much a tack-aware
   controller loses to the ideal route.
6. `marine-dr`: navigating under water without GNSS. DVL plus IMU dead-reckoning drift, then the
   gain from acoustic range aids (LBL, USBL) and surfacing for a fix, scored on position error
   against energy spent; builds on track 15's filters and the repo's `gnss-twin` and `doppler-twin`.
7. `marine-fleet`: one big vehicle or several small ones? Coverage planning for a bathymetric or
   water-quality survey with heterogeneous craft, acoustic bandwidth and range limits, and battery
   swaps, against a single larger vehicle at the same cost.
8. `marine-dock`: autonomous docking and charging. Approach and capture into a dock in current and
   waves, success rate against approach strategy and sensor noise; the dock is a by-product design.
9. `marine-detect`: seeing obstacles on the water. Reproduce a published segmentation baseline on
   MaSTr1325 (or a successor), then measure how glare, fog and small-object size cut recall, and
   what the detector's miss rate does to `marine-colregs`.
10. `marine-wave`: station keeping on wave and solar power alone. A Wave Glider-style two-body
    thrust model and a solar budget by latitude and month, against a battery-only buoy drone.

**Method transfers worth trying.** Twins and domain randomisation from the `*-twin` projects;
CMA-ES, Bayesian optimisation and LLM proposers for hull and controller parameters; MPC and LP
from tracks 16 and 21; coverage and routing solvers (OR-Tools) for fleets; track 15's filters
for navigation.

**Guardrails.**
- *Simulation first, as every track.* Building, buying or putting a vehicle in the water is an
  owner step with a sourced bill of materials. Never present a simulated craft as a tested one.
- *Rules of the water.* Any real operation needs the flag state's and local authority's rules
  (COLREGs, coast guard or harbour master, permits for protected waters and wildlife). Say so in
  the README; a COLREGs-compliant planner here is research, not a certified system.
- *No weapons, no surveillance of people.* No military, mine-countermeasure or targeting work, no
  tracking or identifying people or particular vessels; public AIS is used only as anonymised
  encounter geometry. Check export-control limits (EAR, ITAR) before publishing anything about
  long-range autonomous underwater navigation; track 14's rule applies.
- *No interference with real systems.* Never transmit, spoof or probe AIS, GNSS or any vessel or
  port system. Public datasets and simulators only.
- *Every hull, battery, sensor and price figure is sourced and dated, or swept.*

## 24. Civilizations, group psychology and interventions (`civ`)

Added on 2026-10-24 at the owner's request, as a curiosity project: "civilization simulations of
group psychology and civilization and society, both modeling and modeling interventions to change
the path of large groups of people. it's a curiosity project more than anything."

**Goal.** Simulate large groups of people with the established models of social influence,
cultural drift, contagion, cooperation and collective action, and ask which interventions change
where a society goes. Track 17 (`society`) asks this about robots among people; this track is
about people among people, at the scale of towns to civilizations. The standing method: the
inputs that matter most (how far people accept or reject other views, how much they copy,
punish or cooperate) are rarely measured, so each project **sweeps them and reports which
recommendations survive**, checks its model against a published result first, and ships a
browser sandbox where a reader can try the levers. Results are about simulated people following
stated rules, never forecasts or advice for steering real populations; nothing here targets a
real group or individual.

**Prior work.** DeGroot (1974), *JASA*. Granovetter (1978), threshold models of collective
behaviour, *AJS*. Axelrod (1997), the dissemination of culture, *J. Conflict Resolution*.
Deffuant et al. (2000), *Adv. Complex Syst.* Hegselmann and Krause (2002), *JASSS*. Jager and
Amblard (2005), *Comput. Math. Organ. Theory*. Castellano, Fortunato and Loreto (2009),
statistical physics of social dynamics, *Rev. Mod. Phys.* Centola and Macy (2007), complex
contagions, *AJS*. Fehr and Gächter (2000), cooperation and punishment in public goods
experiments, *AER*. Turchin (2003), *Historical Dynamics*. Pettigrew and Tropp (2006),
*JPSP*. Bail et al. (2018), *PNAS*. Guess and Coppock (2020), *BJPolS*. Park et al. (2023),
generative agents, UIST.

**Milestones.**

1. `civ-levers` (done 2026-10-24): which interventions merge a polarized two-camp society under
   bounded confidence with backfire swept from none to strong? Bridging contact backfires; a
   ladder of committed voices within reach merges the camps in 24 of 25 settings. Ships a
   browser simulator.
2. `civ-contact` (landed in civ-levers 2026-10-26): contact that also widens tolerance (Pettigrew and Tropp's prejudice reduction
   as a change in ε), and identity: a moderate voice each camp reads as the other side's. Does
   the bridging verdict flip?
3. `civ-cascades`: Granovetter thresholds and complex contagion on clustered against random
   networks. Where to seed a behaviour (hubs, bridges, clustered patches) and how many seeds it
   takes; check against Centola and Macy (2007) and Centola et al. (2018)'s 25% tipping point.
4. `civ-culture` (first run landed in civ-levers 2026-10-28; broadcast fragments, q_c at L=150 not reproduced): Axelrod's culture model with media and migration. Does a common broadcast
   homogenise or fragment culture (Shibanai, Yasuno and Ishiguro 2001)? Reproduce the
   order–disorder transition of Castellano, Marsili and Vespignani (2000) first.
5. `civ-commons`: public goods with punishment and institutions. Which sanctioning
   institutions keep cooperation in large, mobile populations; fit contribution decay to
   Fehr and Gächter's published rounds.
6. `civ-calibrate`: estimate ε and τ from public panel data on attitude change (e.g. ANES or
   GSS panels) and rerun milestones 1–2 at the fitted values.
7. `civ-history`: structural-demographic dynamics (Turchin) as a toy civilization: population,
   elites and state capacity over centuries, and which policy levers damp the cycles.
8. `civ-llmsociety`: a town of language-model agents against the same levers, behind an
   environment variable with a deterministic stub. Do LLM agents assimilate and backfire like
   the rule-based models, and does `civ-levers`' ranking survive?

## 25. Open-source construction, mining and heavy equipment (`heavy`)

Added on 2026-10-24 at the owner's request, as a long-term direction: "I want one of the
directions to be working on open source hardware-firmware-software for construction machines.
open source reduce the cost of entry in construction equipment and machines. autonomy is plus in
this but creating low cost competitors to existing stuff is also acceptable. also mining and
other heavy equipment."

**Goal.** Lower the cost of owning and running heavy machines (excavators, loaders, skid steers,
compact track loaders, dozers, telehandlers, haul trucks, drills and the like) by publishing
open designs a small contractor, mine or fabricator can build, repair, retrofit or extend: the
hardware (structure, hydraulics, drivetrain, electrics), the firmware (machine controllers,
CAN bus, valve drivers, interlocks) and the software (operator interfaces, telematics,
simulation, autonomy). Two kinds of output are equally welcome. *Low-cost competitors*: an
open machine or subsystem that does a stock machine's job for much less, priced from a sourced
bill of materials. *Autonomy and assistance*: remote operation, operator assist and autonomous
work cycles, on an open machine or as a retrofit kit for one already on site. The question for
every project is the same: what does the open version cost and do, against the machine it would
replace, with both sides sourced? Mining is in scope (haulage, loading, drilling, ventilation);
track 21's `infra-grind` covers the processing plant, this track covers the machines. Robots on
a house site belong in track 20 and residential structure in track 12; a compact machine that
digs a house's footings belongs here.

**Prior work and open tools (not yet checked; check before citing).** Open Source Ecology's
Global Village Construction Set: LifeTrac (an open tractor and loader), MicroTrac, the CEB press
and the hydraulic power unit (track 1 already cites the GVCS). ETH Zurich's HEAP walking
excavator: Jud et al. (2021), autonomous excavation with a walking excavator, *Science
Robotics*. Project Chrono (BSD-3) and its SCM deformable soil; Bekker (1969) and Wong (2008),
*Theory of Ground Vehicles*, for terramechanics; Reece (1964) and McKyes (1985), the fundamental
earthmoving equation, for cutting force. ROS 2, Nav2, Autoware and ArduPilot Rover as open
autonomy stacks. SAE J1939 (heavy-vehicle CAN), ISO 11783 (ISOBUS), SocketCAN, `python-can` and
`cantools`. ISO 15143-3 (the AEMP 2.0 telematics API). Safety standards to design against, not
to claim: ISO 20474 (earth-moving machinery safety), ISO 19014 (functional safety for
earth-moving machinery), ISO 17757 (autonomous and semi-autonomous machine system safety, earth
moving and mining), ISO 13849 and ISO 3471 (ROPS). Commercial systems as context, not as open
work: Built Robotics (autonomous excavation retrofits), SafeAI, Caterpillar MineStar Command and
Komatsu FrontRunner (autonomous haulage), Teleo (remote operation retrofits). Right to repair as
context: Colorado HB23-1011 (agricultural equipment, 2023) and the US Copyright Office's DMCA
section 1201 exemptions for vehicle diagnosis and repair.

**Milestones.** A starting order, not a checklist.
1. `heavy-market`: where the money goes. A sourced market report on compact and mid-size
   machines: new and used prices by class and operating weight, ownership and operating cost per
   hour (fuel, wear parts, hydraulics, repairs), dealer and parts margins where public, and the
   open-source BOM floor (LifeTrac and similar). Which machine class has the widest gap between
   price and the cost of its parts, and which subsystem holds it? Every price sourced and dated.
2. `heavy-hydraulics`: the hydraulic system as a model. Pump, valves, hoses and cylinders of an
   excavator arm or loader as a lumped simulation; open-centre against load-sensing against
   electro-hydraulic independent metering on a published dig or load cycle; energy per cycle,
   heat, and the parts cost of each circuit. Which open circuit gets closest to a stock machine
   for the least money?
3. `heavy-digtwin`: an open digging twin. Arm kinematics and dynamics with a soil model (the
   fundamental earthmoving equation first, Chrono SCM if it installs), reproducing a published
   bucket-force or fill-factor figure, and scored on payload per pass, cycle time and energy.
   This is the scene later milestones score against.
4. `heavy-controller`: open machine-controller firmware. A J1939 CAN stack, joystick input,
   proportional-valve PWM drivers and the interlocks (operator presence, neutral start, e-stop,
   boom lock-out) for a cheap microcontroller, in Rust or C (the Rust direction applies),
   tested software-in-the-loop over virtual CAN against the milestone 2 or 3 twin, with fault
   injection (dropped frames, stuck valve, sensor out of range). The firmware and its test
   harness are the output.
5. `heavy-autodig`: autonomous work cycles. A trenching or truck-loading policy (model-based or
   learned, track 14's loop) against a scripted baseline in the milestone 3 twin: volume per
   hour, trench grade tolerance, energy, and failures. What does autonomy add over a skilled
   operator figure from the literature?
6. `heavy-retrofit`: a retrofit kit. What it takes to make an existing machine remote-operable
   or autonomous: sensors, actuators on the pilot hydraulics or the joystick, compute, radio,
   e-stop chain, with a priced BOM against the commercial retrofits' public prices.
7. `heavy-electric`: battery-electric compact machines. Duty-cycle energy from milestone 3,
   battery size and cost from track 16, charging on site, and the cost per operating hour
   against diesel. Where does electric win today?
8. `heavy-haul`: mining haulage. A discrete-event open-pit haul cycle (shovel, trucks, dump,
   queues; track 4's `robofab-cell` and track 21's twins), manned against autonomous fleets of
   smaller, cheaper trucks: tonnes per hour, cost per tonne and sensitivity to truck size. Does a
   fleet of small open trucks beat a few large ones?
9. `heavy-structure`: a weldable open boom and frame. Plate-steel boom, stick and loader arms
   designed with track 5's simulation loop (FEA, buckling, fatigue at weld toes) for a shop that
   has a plasma table and a welder; mass, cost and safety factor against a stock part's
   published figures.
10. `heavy-telematics`: open telematics. Read J1939 and ISO 15143-3 data into an owner's own
    fleet tool, and test whether survival analysis or changepoint detection (track 21's method
    transfers) predicts wear-part failures on a public or simulated dataset.
11. Owner steps: build or buy a machine or subsystem, bench-test the controller on real valves,
    and any field trial, each with a priced BOM, a risk assessment and a qualified engineer.

**Guardrails.**
- *Heavy machines kill.* Crush, rollover, struck-by and hydraulic-injection hazards are real.
  Every design, controller and autonomy result is research, not a certified machine or safety
  system; say so in the README. Nothing is run on a real machine, near a person, by a session.
  Any physical test is an owner step with a risk assessment against ISO 20474, ISO 19014 and,
  for autonomy, ISO 17757, plus OSHA or MSHA obligations. Never present a simulated interlock
  as a functional-safety rating.
- *No emissions tampering.* Nothing that removes, bypasses or defeats an engine's emissions
  controls (EGR, DPF, SCR, DEF) or its software. In the US that is a Clean Air Act violation;
  it is out of scope however it is framed.
- *Interoperate, don't break locks.* Read published buses and standards (J1939, ISO 15143-3)
  and the owner's own data. No circumventing an OEM's access controls or copying proprietary
  firmware, service software or service manuals; work within the law and the DMCA exemptions,
  and when unsure, don't.
- *Names and marks.* Describe compatibility factually ("fits a 1.7 t class mini excavator");
  never use a manufacturer's marks in a way that implies affiliation. Vendor figures are the
  vendor's claims, sourced and dated, kept apart from simulated results.
- *Licences.* Original designs, firmware and software are MIT like the rest of the repository.
  GVCS material is CC BY-SA and GPL; build on its ideas with credit, and keep its files under
  their own licence if one is ever needed.
- *Every price is sourced and dated, or swept.* Used-machine prices move fast; give the source,
  date and class.
- *Lab tags.* No group in `prompt.md` covers heavy equipment; milestones 3, 5 and 9 may build on
  the groups tracks 5, 9 and 14 name. Say so rather than stretching a connection.


## References

Tracks 1 to 6 were checked on 2026-10-12, tracks 7 to 11 on 2026-10-14 track 12 on 2026-10-16 and track 13 on 2026-10-19; tracks 14 and 15, added on 2026-10-19, are not yet checked; track 16's were not all re-checked (`energy-density`'s README marks which it checked); track 17's were checked when it was added on 2026-10-19; track 18's, added on 2026-10-19, are not yet checked; tracks 20's and 21's, added on 2026-10-21, and tracks 22's to 25's, added on 2026-10-24, are not yet checked. Check them again before
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

**Track 7.**
- Ajayi et al. (2019). Toward an Open-Source Digital Flow: First Learnings from the OpenROAD Project. DAC, 1–4. <https://doi.org/10.1145/3316781.3326334>
- Brayton and Mishchenko (2010). ABC: An Academic Industrial-Strength Verification Tool. CAV, LNCS 6174, 24–40. <https://doi.org/10.1007/978-3-642-14295-6_5>
- Yu, Xiao and De Micheli (2018). Developing synthesis flows without human knowledge. DAC, 1–6. <https://doi.org/10.1145/3195970.3196026>
- Hosny, Hashemi, Shalan and Reda (2020). DRiLLS: Deep Reinforcement Learning for Logic Synthesis. ASP-DAC, 581–586. <https://doi.org/10.1109/ASP-DAC47756.2020.9045559>
- Neto, Li, Gaillardon and Yu (2023). FlowTune: End-to-End Automatic Logic Optimization Exploration via Domain-Specific Multiarmed Bandit. *IEEE TCAD* 42(6):1912–1925. <https://doi.org/10.1109/TCAD.2022.3213611>. An earlier conference version: Yu (2020), FlowTune: Practical Multi-armed Bandits in Boolean Optimization, ICCAD, 1–9. <https://doi.org/10.1145/3400302.3415615>
- Jung, Kahng, Kim and Varadarajan (2021). METRICS2.1 and Flow Tuning in the IEEE CEDA Robust Design Flow and OpenROAD. ICCAD, 1–9. <https://doi.org/10.1109/ICCAD51958.2021.9643541>
- Huang et al. (2021). Machine Learning for Electronic Design Automation: A Survey. *ACM TODAES* 26(5), 1–46. <https://doi.org/10.1145/3451179>
- Deb, Pratap, Agarwal and Meyarivan (2002). A fast and elitist multiobjective genetic algorithm: NSGA-II. *IEEE Trans. Evol. Comput.* 6(2):182–197. <https://doi.org/10.1109/4235.996017>
- Li et al. (2018). Hyperband: A Novel Bandit-Based Approach to Hyperparameter Optimization. *JMLR* 18(185):1–52. <https://jmlr.org/papers/v18/16-558.html>
- Peherstorfer, Willcox and Gunzburger (2018). Survey of Multifidelity Methods in Uncertainty Propagation, Inference, and Optimization. *SIAM Review* 60(3):550–591. <https://doi.org/10.1137/16M1082469>
- Fine and Ziv (2003). Coverage directed test generation for functional verification using Bayesian networks. DAC, 286–291. <https://doi.org/10.1145/775832.775907>
- Akiba et al. (2019). Optuna: A Next-generation Hyperparameter Optimization Framework. KDD, 2623–2631. <https://doi.org/10.1145/3292500.3330701>
- OpenROAD-flow-scripts and its AutoTuner <https://openroad-flow-scripts.readthedocs.io/en/latest/user/InstructionsForAutoTuner.html>; SymbiYosys <https://github.com/YosysHQ/sby>; Optuna <https://github.com/optuna/optuna> (MIT)

**Track 8.**
- Jouppi et al. (2017). In-Datacenter Performance Analysis of a Tensor Processing Unit. ISCA, 1–12. <https://doi.org/10.1145/3079856.3080246>
- Chen, Emer and Sze (2016). Eyeriss: A Spatial Architecture for Energy-Efficient Dataflow for Convolutional Neural Networks. ISCA, 367–379. <https://doi.org/10.1109/ISCA.2016.40>
- Sze, Chen, Yang and Emer (2017). Efficient Processing of Deep Neural Networks: A Tutorial and Survey. *Proc. IEEE* 105(12):2295–2329. <https://doi.org/10.1109/JPROC.2017.2761740>
- Parashar et al. (2019). Timeloop: A Systematic Approach to DNN Accelerator Evaluation. ISPASS, 304–315. <https://doi.org/10.1109/ISPASS.2019.00042>
- Wu, Emer and Sze (2019). Accelergy: An Architecture-Level Energy Estimation Methodology for Accelerator Designs. ICCAD, 1–8. <https://doi.org/10.1109/ICCAD45719.2019.8942149>
- Samajdar et al. (2020). A Systematic Methodology for Characterizing Scalability of DNN Accelerators using SCALE-Sim. ISPASS, 58–68. <https://doi.org/10.1109/ISPASS48437.2020.00016>
- Genc et al. (2021). Gemmini: Enabling Systematic Deep-Learning Architecture Evaluation via Full-Stack Integration. DAC, 769–774. <https://doi.org/10.1109/DAC18074.2021.9586216>
- Umuroglu et al. (2017). FINN: A Framework for Fast, Scalable Binarized Neural Network Inference. FPGA, 65–74. <https://doi.org/10.1145/3020078.3021744>
- Duarte et al. (2018). Fast inference of deep neural networks in FPGAs for particle physics. *JINST* 13(07):P07027. <https://doi.org/10.1088/1748-0221/13/07/P07027>
- Jacob et al. (2018). Quantization and Training of Neural Networks for Efficient Integer-Arithmetic-Only Inference. CVPR, 2704–2713. <https://doi.org/10.1109/CVPR.2018.00286>
- Lin et al. (2020). MCUNet: Tiny Deep Learning on IoT Devices. NeurIPS 33, 11711–11722. <https://proceedings.neurips.cc/paper/2020/hash/86c51678350f656dcc7f490a43946ee5-Abstract.html>
- Lin, Yang and Han (2021). NAAS: Neural Accelerator Architecture Search. DAC, 1051–1056. <https://doi.org/10.1109/DAC18074.2021.9586250>
- Banbury et al. (2021). MLPerf Tiny Benchmark. NeurIPS Datasets and Benchmarks Track. <https://datasets-benchmarks-proceedings.neurips.cc/paper/2021/hash/da4fb5c6e93e74d3df8527599fa62642-Abstract-round1.html>
- Warden (2018). Speech Commands: A Dataset for Limited-Vocabulary Speech Recognition. arXiv. <https://arxiv.org/abs/1804.03209>. The dataset is released under CC BY 4.0.
- Zhang, Suda, Lai and Chandra (2017). Hello Edge: Keyword Spotting on Microcontrollers. arXiv. <https://arxiv.org/abs/1711.07128>
- Horowitz (2014). Computing's energy problem (and what we can do about it). ISSCC, 10–14. <https://doi.org/10.1109/ISSCC.2014.6757323>
- Timeloop <https://github.com/NVlabs/timeloop> (BSD-3-Clause); Accelergy <https://github.com/Accelergy-Project/accelergy> (MIT); SCALE-Sim v2 <https://github.com/scalesim-project/scale-sim-v2> (MIT); hls4ml <https://github.com/fastmachinelearning/hls4ml> (Apache-2.0); FINN <https://github.com/Xilinx/finn> (BSD-3-Clause); nextpnr <https://github.com/YosysHQ/nextpnr> (ISC)

**Track 9.**
- Macenski, Foote, Gerkey, Lalancette and Woodall (2022). Robot Operating System 2: Design, architecture, and uses in the wild. *Science Robotics* 7(66):eabm6074. <https://doi.org/10.1126/scirobotics.abm6074>
- Koenig and Howard (2004). Design and use paradigms for Gazebo, an open-source multi-robot simulator. IROS, vol. 3, 2149–2154. <https://doi.org/10.1109/IROS.2004.1389727>
- Meier, Honegger and Pollefeys (2015). PX4: A node-based multithreaded open source robotics framework for deeply embedded platforms. ICRA, 6235–6240. <https://doi.org/10.1109/ICRA.2015.7140074>
- Grimminger et al. (2020). An Open Torque-Controlled Modular Robot Architecture for Legged Locomotion Research. *IEEE RA-L* 5(2):3650–3657. <https://doi.org/10.1109/LRA.2020.2976639>
- Ha (2019). Reinforcement Learning for Improving Agent Design. *Artificial Life* 25(4):352–365. <https://doi.org/10.1162/artl_a_00301>
- Zhao et al. (2020). RoboGrammar: Graph Grammar for Terrain-Optimized Robot Design. *ACM TOG* 39(6), 1–16. <https://doi.org/10.1145/3414685.3417831>
- Burger et al. (2020). A mobile robotic chemist. *Nature* 583(7815):237–241. <https://doi.org/10.1038/s41586-020-2442-2>
- Erickson, Gangaram, Kapusta, Liu and Kemp (2020). Assistive Gym: A Physics Simulation Framework for Assistive Robotics. ICRA, 10169–10176. <https://doi.org/10.1109/ICRA40945.2020.9197411>
- FarmBot, licensing (software MIT, hardware CAD and docs CC0) <https://meta.farm.bot/v2025/farmbot/intro/licensing>; Opentrons <https://github.com/Opentrons/opentrons> (Apache-2.0; OT-2 hardware files partly published at <https://cadlab.io/projects/ot2>, no licence stated); ArduPilot <https://github.com/ArduPilot/ardupilot> (GPL-3.0); PX4-Autopilot <https://github.com/PX4/PX4-Autopilot> (BSD-3-Clause); Assistive Gym <https://github.com/Healthcare-Robotics/assistive-gym> (MIT); CERN-OHL v2 <https://ohwr.org/cern_ohl_s_v2.txt>
- ISO 10218-1:2025, Robotics — Safety requirements — Part 1: Industrial robots <https://www.iso.org/standard/73933.html>; ISO 10218-2:2025, Part 2: Industrial robot applications and robot cells <https://www.iso.org/standard/73934.html>; ISO 13482:2014, Safety requirements for personal care robots <https://www.iso.org/standard/53820.html>, under revision as ISO/FDIS 13482 <https://www.iso.org/standard/83498.html>
- 14 CFR Part 107, Small Unmanned Aircraft Systems <https://www.ecfr.gov/current/title-14/chapter-I/subchapter-F/part-107>; 49 U.S.C. § 44809 <https://www.law.cornell.edu/uscode/text/49/44809>

**Track 10.**
- Forsgren, Humble and Kim (2018). *Accelerate: The Science of Lean Software and DevOps*. IT Revolution Press. ISBN 978-1-942788-33-1.
- Little (1961). A Proof for the Queuing Formula: L = λW. *Operations Research* 9(3):383–387. <https://doi.org/10.1287/opre.9.3.383>
- Badanidiyuru, Kleinberg and Slivkins (2018). Bandits with Knapsacks. *J. ACM* 65(3), 1–55. <https://doi.org/10.1145/3164539>. Conference version: FOCS 2013, 207–216. <https://doi.org/10.1109/FOCS.2013.30>
- Russo, Van Roy, Kazerouni, Osband and Wen (2018). A Tutorial on Thompson Sampling. *Foundations and Trends in Machine Learning* 11(1):1–96. <https://doi.org/10.1561/2200000070>
- Johari, Koomen, Pekelis and Walsh (2017). Peeking at A/B Tests: Why it matters, and what to do about it. KDD, 1517–1525. <https://doi.org/10.1145/3097983.3097992>
- Kohavi, Tang and Xu (2020). *Trustworthy Online Controlled Experiments: A Practical Guide to A/B Testing*. Cambridge University Press. <https://doi.org/10.1017/9781108653985>
- Kapoor, Stroebl, Siegel, Nadgir and Narayanan (2025). AI Agents That Matter. *TMLR*. <https://openreview.net/forum?id=Zy4uFzMviZ>
- Jimenez et al. (2024). SWE-bench: Can Language Models Resolve Real-World GitHub Issues? ICLR. <https://openreview.net/forum?id=VTF8yNQM66>
- Yang et al. (2024). SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering. NeurIPS 37, 50528–50652. <https://doi.org/10.52202/079017-1601>
- Yang et al. (2024). Large Language Models as Optimizers. ICLR. <https://openreview.net/forum?id=Bb4VGOWELI>
- Khattab et al. (2024). DSPy: Compiling Declarative Language Model Calls into State-of-the-Art Pipelines. ICLR. <https://openreview.net/forum?id=sY5N0zY5Od>
- Strathern (1997). 'Improving ratings': audit in the British University system. *European Review* 5(3):305–321. <https://doi.org/10.1002/(SICI)1234-981X(199707)5:3<305::AID-EURO184>3.0.CO;2-4>
- Track 10, milestone 7 (`swe-orgs`), starting sources: Brooks (1975). *The Mythical Man-Month*. Addison-Wesley. Conway (1968). How Do Committees Invent? *Datamation* 14(4):28–31. <https://www.melconway.com/Home/Committees_Paper.html>. Winters, Manshreck and Wright (2020). *Software Engineering at Google*. O'Reilly. <https://abseil.io/resources/swe-book>. Potvin and Levenberg (2016). Why Google Stores Billions of Lines of Code in a Single Repository. *Communications of the ACM* 59(7):78–87. <https://doi.org/10.1145/2854146>. Sadowski, Söderberg, Church, Sipko and Bacchelli (2018). Modern Code Review: A Case Study at Google. ICSE-SEIP. <https://doi.org/10.1145/3183519.3183525>. Beyer, Jones, Petoff and Murphy (2016). *Site Reliability Engineering*. O'Reilly. <https://sre.google/sre-book/table-of-contents/>. Skelton and Pais (2019). *Team Topologies*. IT Revolution Press. Larson (2019). *An Elegant Puzzle: Systems of Engineering Management*. Stripe Press. Reinertsen (2009). *The Principles of Product Development Flow*. Celeritas. Graham (2013). Do Things that Don't Scale. <https://paulgraham.com/ds.html>
- Cohen (1960). A Coefficient of Agreement for Nominal Scales. *Educational and Psychological Measurement* 20(1):37–46. <https://doi.org/10.1177/001316446002000104>
- Anthropic help centre, read 2026-10-14: Max plan <https://support.claude.com/en/articles/11049741-what-is-the-max-plan>; Claude Code with a Pro or Max plan <https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan>; usage limits <https://support.claude.com/en/articles/11647753-understanding-usage-and-length-limits>; Claude Code `/usage` <https://code.claude.com/docs/en/costs>. Terms: Consumer Terms <https://www.anthropic.com/legal/consumer-terms>; Usage Policy <https://www.anthropic.com/legal/aup>

**Track 11.**
- Turing (1950). Computing Machinery and Intelligence. *Mind* 59(236):433–460. <https://doi.org/10.1093/mind/LIX.236.433>
- Goodfellow et al. (2014). Generative Adversarial Nets. NeurIPS 27. <https://proceedings.neurips.cc/paper_files/paper/2014/hash/f033ed80deb0234979a61f95710dbe25-Abstract.html>
- Lopez-Paz and Oquab (2017). Revisiting Classifier Two-Sample Tests. ICLR. <https://openreview.net/forum?id=SJkXfE5xx>
- Jones and Bergen (2024). Does GPT-4 pass the Turing test? NAACL, 5183–5210. <https://doi.org/10.18653/v1/2024.naacl-long.290>. A two-player test.
- Jones and Bergen (2026). Large language models pass a standard three-party Turing test. *PNAS* 123(21):e2524472123. <https://doi.org/10.1073/pnas.2524472123>. Preprint: arXiv:2503.23674 (2025).
- Jannai, Meron, Lenz, Levine and Shoham (2023). Human or Not? A Gamified Approach to the Turing Test. arXiv. <https://arxiv.org/abs/2305.20010>
- Ippolito, Duckworth, Callison-Burch and Eck (2020). Automatic Detection of Generated Text is Easiest when Humans are Fooled. ACL, 1808–1822. <https://doi.org/10.18653/v1/2020.acl-main.164>
- Clark et al. (2021). All That's 'Human' Is Not Gold: Evaluating Human Evaluation of Generated Text. ACL-IJCNLP, 7282–7296. <https://doi.org/10.18653/v1/2021.acl-long.565>
- Mitchell et al. (2023). DetectGPT: Zero-Shot Machine-Generated Text Detection using Probability Curvature. ICML, PMLR 202:24950–24962. <https://proceedings.mlr.press/v202/mitchell23a.html>
- Hans et al. (2024). Spotting LLMs With Binoculars: Zero-Shot Detection of Machine-Generated Text. ICML, PMLR 235:17519–17537. <https://proceedings.mlr.press/v235/hans24a.html>
- Dugan et al. (2024). RAID: A Shared Benchmark for Robust Evaluation of Machine-Generated Text Detectors. ACL, 12463–12492. <https://doi.org/10.18653/v1/2024.acl-long.674>. Code <https://github.com/liamdugan/raid> and data <https://huggingface.co/datasets/liamdugan/raid> are MIT.
- Sadasivan et al. (2025). Can AI-Generated Text be Reliably Detected? Stress Testing AI Text Detectors Under Various Attacks. *TMLR*. <https://openreview.net/forum?id=OOgsAZdFOt>
- Liang et al. (2023). GPT detectors are biased against non-native English writers. *Patterns* 4(7):100779. <https://doi.org/10.1016/j.patter.2023.100779>. An opinion article: seven detectors on 91 TOEFL essays and 88 US eighth-grade essays.
- Krishna et al. (2023). Paraphrasing evades detectors of AI-generated text, but retrieval is an effective defense. NeurIPS 36, 27469–27500. <https://doi.org/10.52202/075280-1195>
- Lu et al. (2024). Large Language Models can be Guided to Evade AI-generated Text Detection. *TMLR*. <https://openreview.net/forum?id=lLE0mWzUrr>
- Hu, Chen and Ho (2023). RADAR: Robust AI-Text Detection via Adversarial Learning. NeurIPS 36, 15077–15095. <https://doi.org/10.52202/075280-0662>
- Zhou et al. (2023). Large Language Models are Human-Level Prompt Engineers. ICLR. <https://openreview.net/forum?id=92gvk82DE->
- Yang et al. (2024). Large Language Models as Optimizers. ICLR. <https://openreview.net/forum?id=Bb4VGOWELI>
- Pryzant et al. (2023). Automatic Prompt Optimization with "Gradient Descent" and Beam Search. EMNLP, 7957–7968. <https://doi.org/10.18653/v1/2023.emnlp-main.494>
- Prasad, Hase, Zhou and Bansal (2023). GrIPS: Gradient-free, Edit-based Instruction Search for Prompting Large Language Models. EACL, 3845–3864. <https://doi.org/10.18653/v1/2023.eacl-main.277>. Its paraphrase edit uses a PEGASUS model, and all edits act on phrases from a constituency parser.
- Fernando et al. (2024). Promptbreeder: Self-Referential Self-Improvement via Prompt Evolution. ICML, PMLR 235:13481–13544. <https://proceedings.mlr.press/v235/fernando24a.html>
- Yuksekgonul et al. (2025). Optimizing generative AI by backpropagating language model feedback. *Nature* 639(8055):609–616. <https://doi.org/10.1038/s41586-025-08661-4>
- Lanctot et al. (2017). A Unified Game-Theoretic Approach to Multiagent Reinforcement Learning. NeurIPS 30. <https://proceedings.neurips.cc/paper_files/paper/2017/hash/3323fe11e9595c09af38fe67567a9394-Abstract.html>
- Balduzzi et al. (2019). Open-ended learning in symmetric zero-sum games. ICML, PMLR 97:434–443. <https://proceedings.mlr.press/v97/balduzzi19a.html>
- Argyle et al. (2023). Out of One, Many: Using Language Models to Simulate Human Samples. *Political Analysis* 31(3):337–351. <https://doi.org/10.1017/pan.2023.2>
- Aher, Arriaga and Kalai (2023). Using Large Language Models to Simulate Multiple Humans and Replicate Human Subject Studies. ICML, PMLR 202:337–371. <https://proceedings.mlr.press/v202/aher23a.html>
- Park et al. (2023). Generative Agents: Interactive Simulacra of Human Behavior. UIST, 1–22. <https://doi.org/10.1145/3586183.3606763>
- Pillutla et al. (2021). MAUVE: Measuring the Gap Between Neural Text and Human Text using Divergence Frontiers. NeurIPS 34, 4816–4828. <https://proceedings.neurips.cc/paper_files/paper/2021/hash/260c2432a0eecc28ce03c10dadc078a4-Abstract.html>. Package <https://github.com/krishnap25/mauve> (GPL-3.0).
- Guo et al. (2023). How Close is ChatGPT to Human Experts? Comparison Corpus, Evaluation, and Detection. arXiv. <https://arxiv.org/abs/2301.07597>. HC3 data <https://huggingface.co/datasets/Hello-SimpleAI/HC3>: CC BY-SA 4.0 on the card, but a stricter source licence overrides it, and one split is CC BY-NC 4.0.
- Wang et al. (2024). M4: Multi-generator, Multi-domain, and Multi-lingual Black-Box Machine-Generated Text Detection. EACL, 1369–1407. <https://doi.org/10.18653/v1/2024.eacl-long.83>. Data <https://github.com/mbzuai-nlp/M4>: no single licence; human text keeps each source's.
- Panayotov, Chen, Povey and Khudanpur (2015). Librispeech: An ASR corpus based on public domain audio books. ICASSP, 5206–5210. <https://doi.org/10.1109/ICASSP.2015.7178964>. Data <https://www.openslr.org/12/> (CC BY 4.0).
- Ardila et al. (2020). Common Voice: A Massively-Multilingual Speech Corpus. LREC, 4218–4222. <https://aclanthology.org/2020.lrec-1.520/>. Data (CC0), distributed since October 2025 through Mozilla Data Collective <https://datacollective.mozillafoundation.org>; read its terms before downloading.
- Wang et al. (2020). ASVspoof 2019: A large-scale public database of synthesized, converted and replayed speech. *Computer Speech & Language* 64:101114. <https://doi.org/10.1016/j.csl.2020.101114>. Data <https://doi.org/10.7488/ds/2555> (ODC-By).
- Wang, Wang, Zhang, Owens and Efros (2020). CNN-Generated Images Are Surprisingly Easy to Spot… for Now. CVPR, 8692–8701. <https://doi.org/10.1109/CVPR42600.2020.00872>
- Lyth and King (2024). Natural language guidance of high-fidelity text-to-speech with synthetic annotations. arXiv. <https://arxiv.org/abs/2402.01912>. Parler-TTS, Hugging Face's reproduction: code <https://github.com/huggingface/parler-tts> and parler-tts-mini-v1 weights <https://huggingface.co/parler-tts/parler-tts-mini-v1> (both Apache-2.0).
- Open models that fit a CPU, all Apache-2.0: Qwen2.5-0.5B-Instruct <https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct>; Qwen2.5-1.5B-Instruct <https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct>; SmolLM2-1.7B-Instruct <https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct>; SmolVLM-256M-Instruct <https://huggingface.co/HuggingFaceTB/SmolVLM-256M-Instruct>. llama.cpp <https://github.com/ggml-org/llama.cpp> (MIT).
- Regulation (EU) 2024/1689 (the AI Act), Article 50, transparency obligations for synthetic audio, image, video and text; applies from 2 August 2026 under Article 113. Amended by Regulation (EU) 2026/1744 (the Digital Omnibus on AI), which leaves Article 50's text unchanged. <https://eur-lex.europa.eu/eli/reg/2024/1689/oj>; <https://eur-lex.europa.eu/eli/reg/2026/1744/oj>
- 45 CFR part 46, Protection of Human Subjects; Subpart A is the Common Rule (IRB review in § 46.109, informed consent in § 46.116). <https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-A/part-46>

**Track 12.**
- NAHB Research Foundation for HUD (1978/79). *Reducing Home Building Costs with OVE Design and Construction*. HUD Guideline 5. <https://www.huduser.gov/PORTAL/sites/default/files/pdf/Reducing-Home-Building-Costs.pdf>
- Home Innovation Research Labs. *Advanced Framing: An Examination of its Practical Use in Residential Construction*. <https://HomeInnovation.com/trends_and_reports/featured_reports/advanced_framing_-_an_examination_of_its_practical_use_in_residential_construction>
- NAHB (2025). Cost of Constructing a Home in 2024. <https://eyeonhousing.org/2025/01/cost-of-constructing-a-home-in-2024/>
- Carpenter and Schumacher (2003). Characterization of framing factors for wood-framed low-rise residential buildings. *ASHRAE Transactions* 109 (RP-904). <https://basc.pnnl.gov/library/characterization-framing-factors-wood-framed-low-rise-residential-buildings>
- American Wood Council, *National Design Specification for Wood Construction* and Supplement; SPF values as reprinted by NELMA <https://www.nelma.org/wp-content/uploads/2022/06/Base-Design-Values-for-SPFs-and-SPF.pdf>
- Not yet checked; check before citing: ASCE 7 (loads); EnergyPlus <https://energyplus.net>; OpenStudio <https://openstudio.net>; BEopt (NREL); OpenSees <https://opensees.berkeley.edu>; IfcOpenShell <https://ifcopenshell.org>; FreeCAD; WikiHouse <https://www.wikihouse.cc>; US Census Survey of Construction <https://www.census.gov/construction/soc/>

**Track 13.**
- FAA, PackSafe: Airline Passengers and Batteries (checked 2026-10-19): under 100 Wh no FAA limit for personal use; 101–160 Wh needs airline approval, at most two spares; over 160 Wh forbidden; spares carry-on only. <https://www.faa.gov/hazmat/packsafe/airline-passengers-and-batteries>
- Not yet checked; check before citing: Kanade, Rander and Narayanan (1997), Virtualized Reality, *IEEE MultiMedia* 4(1); Joo et al. (2015), Panoptic Studio, ICCV; Snavely, Seitz and Szeliski (2006), Photo Tourism, *ACM TOG* 25(3); Mildenhall et al. (2020), NeRF, ECCV; Kerbl et al. (2023), 3D Gaussian Splatting, *ACM TOG* 42(4); Su and Grauman (2017), Making 360° video watchable in 2D, CVPR; Bonatti et al. (2020), Autonomous aerial cinematography in unstructured environments with learned artistic decision-making, *J. Field Robotics* 37(4); COLMAP <https://colmap.github.io>; PySceneDetect <https://www.scenedetect.com>.

**Track 14.**
- Not yet checked; check before citing: Sims (1994), Evolving virtual creatures, SIGGRAPH '94; Gupta, Savarese, Ganguli and Fei-Fei (2021), Embodied intelligence via learning and evolution, *Nature Communications* 12; Yuan et al. (2022), Transform2Act, ICLR; Lehman et al. (2022), Evolution through large models, arXiv:2206.08896; Ma et al. (2024), Eureka: human-level reward design via coding large language models, ICLR; Schulman et al. (2017), Proximal policy optimization algorithms, arXiv:1707.06347; Tobin et al. (2017), Domain randomization for transferring deep neural networks from simulation to the real world, IROS; Rudin et al. (2022), Learning to walk in minutes using massively parallel deep reinforcement learning, CoRL; Ha, Xu and Song (2020), Fit2Form, CoRL; Calli et al. (2015), the YCB object and model set, *IEEE Robotics & Automation Magazine* 22(3); 22 CFR parts 120–130 (ITAR) and 15 CFR parts 730–774 (EAR).

**Track 15.**
- Not yet checked; check before citing: Kalman (1960), A new approach to linear filtering and prediction problems, *J. Basic Eng.* 82(1); Julier and Uhlmann (1997), A new extension of the Kalman filter to nonlinear systems, Proc. SPIE 3068; Mourikis and Roumeliotis (2007), A multi-state constraint Kalman filter for vision-aided inertial navigation, ICRA; Forster et al. (2017), On-manifold preintegration for real-time visual-inertial odometry, *IEEE T-RO* 33(1); Qin, Li and Shen (2018), VINS-Mono, *IEEE T-RO* 34(4); Furgale, Rehder and Siegwart (2013), Unified temporal and spatial calibration for multi-sensor systems, IROS; Zhang (2000), A flexible new technique for camera calibration, *IEEE TPAMI* 22(11); Hasinoff et al. (2016), Burst photography for high dynamic range and low-light imaging on mobile cameras, *ACM TOG* 35(6); Gallego et al. (2022), Event-based vision: a survey, *IEEE TPAMI* 44(1); Schönberger and Frahm (2016), Structure-from-motion revisited, CVPR; Burri et al. (2016), The EuRoC micro aerial vehicle datasets, *IJRR* 35(10); Geiger, Lenz and Urtasun (2012), Are we ready for autonomous driving? The KITTI vision benchmark suite, CVPR; gsplat <https://github.com/nerfstudio-project/gsplat>; Open3D <https://www.open3d.org>; GTSAM <https://gtsam.org>; OpenVINS <https://github.com/rpng/open_vins>.

**Track 17.**
- Reynolds (1987). Flocks, herds and schools: a distributed behavioral model. *SIGGRAPH Computer Graphics* 21(4):25–34. <https://doi.org/10.1145/37402.37406>
- Helbing and Molnár (1995). Social force model for pedestrian dynamics. *Phys. Rev. E* 51(5):4282–4286. <https://doi.org/10.1103/PhysRevE.51.4282>
- Moussaïd, Helbing, Garnier, Johansson, Combe and Theraulaz (2009). Experimental study of the behavioural mechanisms underlying self-organization in human crowds. *Proc. R. Soc. B* 276(1668):2755–2762. <https://doi.org/10.1098/rspb.2009.0405>
- Lewis (1969). *Convention: A Philosophical Study*. Harvard University Press.
- Young (1993). The evolution of conventions. *Econometrica* 61(1):57–84. <https://doi.org/10.2307/2951778>
- Shoham and Tennenholtz (1997). On the emergence of social conventions: modeling, analysis, and simulations. *Artificial Intelligence* 94(1–2):139–166. <https://doi.org/10.1016/S0004-3702(97)00028-3>
- Xie, Sreenivasan, Korniss, Zhang, Lim and Szymanski (2011). Social consensus through the influence of committed minorities. *Phys. Rev. E* 84:011130. <https://doi.org/10.1103/PhysRevE.84.011130>
- Centola, Becker, Brackbill and Baronchelli (2018). Experimental evidence for tipping points in social convention. *Science* 360(6393):1116–1119. <https://doi.org/10.1126/science.aas8827>
- Baronchelli (2018). The emergence of consensus: a primer. *R. Soc. Open Sci.* 5:172189. <https://doi.org/10.1098/rsos.172189>
- Leibo, Zambaldi, Lanctot, Marecki and Graepel (2017). Multi-agent reinforcement learning in sequential social dilemmas. AAMAS. <https://arxiv.org/abs/1702.03037>
- Leibo et al. (2021). Scalable evaluation of multi-agent reinforcement learning with Melting Pot. ICML. <https://arxiv.org/abs/2107.06857>
- Park, O'Brien, Cai, Morris, Liang and Bernstein (2023). Generative agents: interactive simulacra of human behavior. UIST. <https://doi.org/10.1145/3586183.3606763>
- Kruse, Pandey, Alami and Kirsch (2013). Human-aware robot navigation: a survey. *Robotics and Autonomous Systems* 61(12):1726–1743. <https://doi.org/10.1016/j.robot.2013.05.007>
- Mavrogiannis, Baldini, Wang, Zhao, Trautman, Steinfeld and Oh (2023). Core challenges of social robot navigation: a survey. *ACM Trans. Hum.-Robot Interact.* 12. <https://doi.org/10.1145/3583741>
- Hancock, Billings, Schaefer, Chen, de Visser and Parasuraman (2011). A meta-analysis of factors affecting trust in human-robot interaction. *Human Factors* 53(5):517–527. <https://doi.org/10.1177/0018720811417254>

**Track 22.** Added on 2026-10-24; not yet checked. Verify each entry before citing it.
- Wolowicz, Bowman and Gilbert (1979). Similitude requirements and scaling relationships as applied to model testing. NASA TP-1435.
- Jordan, Foster, Bailey and Belcastro (2006). AirSTAR: a UAV platform for flight dynamics and control system testing. AIAA 2006-3307.
- D'Andrea (2014). Guest editorial: can drones deliver? *IEEE Trans. Automation Science and Engineering* 11(3):647–648.
- Murray and Chu (2015). The flying sidekick traveling salesman problem. *Transportation Research Part C* 54:86–109. <https://doi.org/10.1016/j.trc.2015.03.005>
- Stolaroff et al. (2018). Energy use and life cycle greenhouse gas emissions of drones for commercial package delivery. *Nature Communications* 9:409. <https://doi.org/10.1038/s41467-017-02411-5>
- Agatz, Bouman and Schmidt (2018). Optimization approaches for the traveling salesman problem with drone. *Transportation Science* 52(4):965–981.
- Johnson, Silva and Solis (2018). Concept vehicles for VTOL air taxi operations. AHS Technical Conference on Aeromechanics Design for Transformative Vertical Flight.
- Rodrigues et al. (2022). Drone flight data reveal energy and greenhouse gas emissions savings for very small package delivery. *Patterns* 3(8).
- Hoekstra and Ellerbroek (2016). BlueSky ATC simulator project: an open data and open source approach. ICRAT.
- Brandt and Selig (2011). Propeller performance data at low Reynolds numbers. AIAA 2011-1255. UIUC Propeller Database: <https://m-selig.ae.illinois.edu/props/propDB.html>
- Sharpe. AeroSandbox. <https://github.com/peterdsharpe/AeroSandbox>
- Raymer. *Aircraft Design: A Conceptual Approach*. AIAA Education Series.

**Track 23.**
- Not yet checked; check before citing: Fossen (2011), *Handbook of Marine Craft Hydrodynamics and Motion Control*, Wiley; ITTC (1957) model-ship correlation line; Holtrop and Mennen (1982), An approximate power prediction method, *International Shipbuilding Progress* 29; Pierson and Moskowitz (1964), *J. Geophysical Research* 69(24); Hasselmann et al. (1973), JONSWAP, *Deutsche Hydrographische Zeitschrift* A8(12); IMO (1972), Convention on the International Regulations for Preventing Collisions at Sea; Fiorini and Shiller (1998), Motion planning in dynamic environments using velocity obstacles, *IJRR* 17(7); Kuwata et al. (2014), Safe maritime autonomous navigation with COLREGS, using velocity obstacles, *IEEE J. Oceanic Engineering* 39(1); Rudnick et al. (2004), Underwater gliders for ocean research, *Marine Technology Society Journal* 38(2); Bingham et al. (2019), Toward maritime robotic simulation in Gazebo, OCEANS; Cie&sacute;lak (2019), Stonefish, OCEANS; Bovcon et al. (2019), The MaSTr1325 dataset for training deep USV obstacle detection models, IROS; VRX <https://github.com/osrf/vrx>; ArduPilot <https://ardupilot.org>.
