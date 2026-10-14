# Priority projects

The owner's priority projects, set on 2026-10-12. Runs started from `prompt.md` take their new
work from here. There are six tracks. Each one is open-ended: its milestones are a starting
order, not a checklist, so follow the results. Every project a track produces is a normal
`research/<slug>/` project. It needs a README, tests, a README bullet, a `site/projects.json`
entry and a passing `python site/build.py`, as `CLAUDE.md` says. Every rule in `prompt.md`
still applies, research integrity above all.

## Picking work

1. **Pick a track at random.** Draw a uniform random number and map it to the six tracks. Four
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
- **Lab tags where they fit.** Tracks 4 and 5 build naturally on the groups in `prompt.md`.
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

## References

These were checked on 2026-10-12. Check them again before citing one, as `prompt.md` requires.

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
