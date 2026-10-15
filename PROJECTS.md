# Priority projects

The owner's priority projects, set on 2026-10-12, with tracks 7 to 11 added on 2026-10-14. Runs
started from `prompt.md` take their new work from here. There are eleven tracks. Each one is
open-ended: its milestones are a starting order, not a checklist, so follow the results. Every
project a track produces is a normal `research/<slug>/` project. It needs a README, tests, a
README bullet, a `site/projects.json` entry, a home page on the Pages site (milestone 9 below)
and a passing `python site/build.py`, as `CLAUDE.md` says. Every rule in `prompt.md` still applies, research integrity above all.

## Repository merge (before the tracks)

Set on 2026-10-14. All work is moving to `Duncan-Haywood/oss-monorepo`, under `research/`. Until
then the two repositories are mirrored, with no history lost. `prompt.md` (Repository merge) has
the rules. This is the action list. It is not a track and makes no `research/<slug>/` project.

**Before you pick a track,** take the first milestone below that is not done, not claimed by an
open pull request in either repository, and not on a branch pushed in the last three hours. Put
the milestone's name first in the pull request title, so the next run sees the claim. If every
milestone is done or claimed, pick a track as usual. Milestones marked *oss-monorepo* push there.
If your session cannot add that repository (`add_repo`, push access), skip them. Its
`CLAUDE.md` governs those pull requests, except that a mirror pull request merges with a merge
commit, never a squash.

**The mirror.** <https://github.com/Duncan-Haywood/oss-monorepo/pull/6832> merged this
repository's history into oss-monorepo through #474. It also carried all of oss-monorepo#6143.
Every commit here keeps its hash there, and `git log -- research/<slug>` lists the same commits
in both. oss-monorepo's `research/_mirror/mirror.py` keeps its `research/` an exact copy of this
`main`, and `research/_mirror/README.md` there is the spec.
- `sync` merges this `main` as a parent and copies files by a fixed map. `research/**` keeps its
  path, `site/**` goes to `research/_homepage/**`, and `LICENSE`, `.gitignore` and `PROJECTS.md`
  go to `research/`. `README.md` is derived from this one, and each line of `prompts/runs.jsonl`
  becomes a record under `prompts/runs/`.
- Five files are *adapted* by hand there, each pinned to the version it was ported from:
  `CLAUDE.md`, `prompt.md` (as `prompts/research/prompt-0.md`), `site/build.py`,
  `site/template.html` and `.github/workflows/pages.yml`. A change to one of them here has to be
  ported there by hand, then confirmed with `mirror.py ack`.
- `sync` deletes any file in the copy that this repository lacks, and overwrites any edit. So
  before cutover nobody adds or edits files under `research/` there.
- `check` proves the copy is exact. On 2026-10-14 it was exact at #474 and 33 commits behind.

**Milestones.**
1. `mirror-sync` (*oss-monorepo*, recurring): whenever this `main` is ahead of `upstream_commit`
   in `research/_mirror/state.json` there, sync it as that README says.
   1. Run `mirror.py sync`.
   2. Port each adapted file it lists, then run `mirror.py ack <path>`.
   3. Run `mirror.py check`, `python3 research/_homepage/build.py` and
      `python3 prompts/promptctl.py validate`.
   4. Merge with a merge commit. If GitHub refuses one, that setting is the owner's: comment the
      blocker on the pull request and stop. Never squash instead.
   5. Confirm `git merge-base --is-ancestor <this main> origin/main` there.
2. `mirror-guards` (*oss-monorepo*): make the rules enforce themselves.
   - The auto-merge in `platform/ci/agent_review` squashes. Make it skip a mirror pull request
     (one that changes `research/_mirror/state.json`) or merge it with a merge commit. Add a test.
   - Run `mirror.py check --allow-behind` in `research-ci.yml` with full history, so a pull
     request that edits the copy directly fails CI.
3. `mirror-movable` (here): cut down the hand-porting. Make `site/build.py` and
   `site/template.html` run unchanged at `oss-monorepo/research/_homepage/`, by finding projects
   and the README relative to the layout. Keep `CLAUDE.md` and `prompt.md` free of anything that
   only fits this repository. Then move those files to the exact map in `mirror.py`.
   - *Progress (2026-10-15):* `site/build.py` and `site/template.html` now run unchanged in both
     layouts (tested on a copy laid out as `research/_homepage/`); only the repository name differs,
     via `HOMEPAGE_REPO` or `--repo`. Still open: `CLAUDE.md` and `prompt.md` portability, and the
     `oss-monorepo` side that sets `HOMEPAGE_REPO` and drops `build.py` from the hand-ported list.
4. `mirror-cutover` (both): prepare the cutover that `research/_mirror/README.md` describes. That
   covers the "moved" notices for this README, `CLAUDE.md` and the Pages homepage, and serving the
   research homepage from oss-monorepo's Pages, which already builds it at `/research/`. The
   steps, in order:
   1. The owner points the scheduled research routines at `oss-monorepo`.
   2. A run merges the notices here, runs a final sync, and confirms `mirror.py check` exits 0
      there.
   3. The owner archives this repository and never deletes it. Its pull requests, review
      threads, issues, branches and Pages site live only here.
   4. A run removes `research/_mirror/` there. From then on, work lands in
      `oss-monorepo/research/`.
5. `site-redesign` (both): give the two GitHub Pages homepages a comprehensive, modern,
   professional redesign, with one super homepage that routes to both. Added on 2026-10-14 at the
   owner's request. It is independent of milestones 1 to 4, so a run may take it while they are
   claimed.
   - **The two sites.** The research homepage
     (<https://duncan-haywood.github.io/oss-research-monorepo/>) is built here by
     `site/build.py` from `site/template.html` and `site/projects.json`. The product catalogue
     (<https://duncan-haywood.github.io/monorepo-projects/>) is built in `oss-monorepo` by
     `platform/pages/build.mjs`.
   - **The super homepage.** One landing page introduces the whole portfolio and routes visitors
     to the products and to the research. It must not be a third, thin page that each side
     forgets to update. Prefer making it the `oss-monorepo` Pages root, with the catalogue and
     the research homepage (`/research/`, milestone 4) under it, and keep the old URLs working
     with redirects or links.
   - **Better HTML, CSS and JS.** Use semantic HTML and a shared design system: tokens for
     colour, type and spacing, light and dark themes, and a responsive layout from phone width
     up. Add a sticky header with navigation, a hero, featured work, theme or category sections,
     and fast client-side search and filtering. Use no framework and no build step beyond the
     existing builders, and no third-party tracking. Make it accessible (WCAG AA contrast,
     labelled controls, keyboard navigation) and fast, with no layout shift.
   - **Keep what already works.** Every project and product card, the per-project test counts,
     the disclaimers, usage tracking, sitemaps and SEO metadata all stay. `python site/build.py`
     still prints `ok`. In `oss-monorepo`, run the starvation checklist from its `CLAUDE.md`,
     including `regen.mjs --verify` and the browser checks (`contrast.mjs`).
   - **Done when** both homepages and the super homepage ship the new design, each links to the
     other two, and before and after screenshots at phone and desktop widths are in the pull
     request. Restyle the research side here. The mirror sync carries it across, but
     `site/build.py` and `site/template.html` are ported by hand until milestone 3. Do the
     catalogue and the super homepage in `oss-monorepo`.

9. `project-pages` (both): give every project and product its own home page on the GitHub-hosted
   site, by default. Added on 2026-10-14 at the owner's request. The goal (`oss-monorepo`
   `prompts/goals.md`, web presence) is one website on GitHub Pages from which all the work can be
   checked out visually. Independent of milestones 1 to 7; build on milestone 8's design system if
   it has landed, and do not wait for it if not.
   - **Research (here).** `site/build.py` also writes `_site/<slug>/index.html` for every project:
     the question it answers, the abstract and headline results, one or two figures from the
     project's own output, the test count, the white paper, code and results links, the AI
     assistance note, and its theme. The homepage card links to it. Generate it from
     `projects.json`, the README and the project's files, so a new project gets its page with no
     extra step, and make the build fail when a project's page cannot be built.
   - *Progress (2026-10-15):* `site/build.py` now writes `_site/<slug>/index.html` from
     `site/project.html` for all projects (abstract, test count, links, AI note, and the first
     image under the project's `experiments/`), the homepage card links to it, and the build
     fails if a page cannot be built. Most projects ship no image yet (five were added 2026-10-15
     via `experiments/figure.py`, which parses the committed `results.txt`); `robofab-cell`, `robofab-cell-cv` and `robofab-cell-mva` followed, redrawn from their `results.json`, so most pages have no
     figure yet. Four more (`appeal-panels`, `audit-weighted-scoring`, `balanced-routing`, `chip-abc-sweep`, 2026-10-15) follow the same pattern. Six more (`abstention-scoring`, `ambient-bandit`, `calibration-hedging`, `categorical-scores`, `chip-accel`, `challenge-window`) followed, each drawn by an `experiments/figure.py` that parses the committed `results.txt`. `chip-systolic-small`, `selfrep-reconcile` and `simdesign-filletfloor` followed (2026-10-15, grouped-bar SVGs parsed from `results.txt`). `blur-twin` and `aliasing-twin` followed (2026-10-15, line-plot SVGs parsed from `results.txt`). `selfrep-extinction` (log-scale bars: exact chain vs chain Monte Carlo vs DES), `simdesign-meshmargin` and `simdesign-patchsearch` (grouped bars from `results.txt`) followed (2026-10-15). `chip-ppa-script`, `chip-systolic-batch`, `compute-procurement` and `effort-contracts` followed the same way (2026-10-15). `chip-systolic-edge`, `chip-systolic-fanin`, `chip-systolic-hidden` and `chip-systolic-p32` followed (2026-10-15, best-systolic vs best-MAC-lane bars from `results.txt`). `swe-prflow`, `swe-ledger`, `osrobot-morph` and `garment-twonodelag` followed (2026-10-15, bar and line SVGs parsed from `results.txt`). Still open: have each project's experiment code write a figure, and the
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

1. **Pick a track at random.** Draw a uniform random number. If it is below 0.05, this is a
   free-choice run (below). Otherwise map it to the eleven tracks. Four runs start in the same
   minute, and a random pick spreads them out.

   **Free choice (about 5% of runs).** In the spirit of Google's "20% time", about one run in
   twenty works on whatever research question it finds most interesting, in or out of the
   tracks below: a hunch from a recent project, an unusual method, a gap nobody here has
   looked at. Pick something you can finish and land in one run. It follows every rule in
   "Rules for every track" and every integrity, licensing and landing rule in `prompt.md`, and
   it is held to the same bar: a complete README, passing tests, honest results. Use the
   `free` slug prefix and theme id unless the project fits an existing track's theme better,
   and say in the README's first lines why it seemed worth doing. Record `"task": "free-choice"`
   in the run line, so the review can see whether these runs pay off.
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
| 10. The software-engineering loop | `swe` |
| 11. Adversarial human imitation | `mimic` |
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
   duplicate projects, merge conflicts on `README.md` and `site/projects.json`, and run-log
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
   a fleet of agent sessions, and why. Each run adds sources, re-scores the open proposals and
   updates the "Next steps".
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
- *Lab tags.* Milestones that use the imitator as a simulated partner build on CAIRO's and
  HIRO's directions in `prompt.md`, simulated human models and social intelligence. The others
  build on none of the groups, so say so.

## References

Tracks 1 to 6 were checked on 2026-10-12 and tracks 7 to 11 on 2026-10-14. Check them again before
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
