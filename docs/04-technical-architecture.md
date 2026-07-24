# Technical Architecture

Everything in the brief and the mastery model is aspirational until it runs
on real infrastructure. This document covers the three layers that make the
platform buildable: the simulation environments students actually learn in,
the path from simulation to physical hardware, and the software architecture
underneath all of it.

The guiding constraint throughout: this has to work for a 15-year-old with a
laptop and no lab, and it has to work for a 22-year-old building a
manufacturable product. The architecture has to serve both without forcing
either into the other's constraints.

---

## 1. Simulation Architecture

### Why simulation is the default, not an add-on

Physical iteration is slow, expensive, and unforgiving of the mistakes
beginners are supposed to make. A student learning MOSFET switching should be
able to blow up a virtual component fifty times in an hour and learn
something each time. That's not possible with real parts, real money, and
real shipping times. Simulation is where the *volume* of iteration happens;
hardware is where the *validation* happens.

This has a direct implication for sequencing: every module should be
simulate-first. A student doesn't touch a breadboard until they've proven
the design works in a model. This mirrors how practicing engineers actually
work — nobody spins a PCB before running SPICE, nobody CNCs a bracket before
running FEA, nobody flashes firmware to a drone before running it in a
flight simulator.

This is also, deliberately, a business decision and not only a pedagogical
one (see Business Principles in the brief). Simulation is cheap to run at
scale in a way that shipping physical components to every learner never
will be — a virtual MOSFET that blows up costs compute, not shipping, and
not a subsidy. That's the lever that makes genuine global access possible
without diluting quality: a learner in Lagos gets the same simulate-first
iteration loop, at the same fidelity, as a learner in Boston, because the
marginal cost of one more simulation run is close to zero regardless of
where the request originates. Physical prototyping still matters and still
happens — see "Where simulation cannot substitute for hardware" below — but
the architecture should push as much of the iteration loop as it credibly
can into simulation before a learner needs real hardware, precisely because
every step moved into simulation is a step that doesn't require the
platform to subsidize someone's parts, shipping, or lab access to keep the
ceiling of competence equal across geographies.

The platform needs four distinct simulation capabilities, because they solve
different problems and fail in different ways.

### Circuit simulation (SPICE-class)

This is the highest-leverage simulation capability because electrical
engineering runs through it constantly, from the first circuits module to
power electronics near the top of the curriculum.

Requirements:

- **Analog SPICE-class simulation**: transient, DC, AC/frequency-response
  analysis. A student building a mic preamp needs to see gain, noise floor,
  and clipping before etching anything.
- **Digital/mixed-signal simulation**: logic-level simulation for
  microcontroller peripherals, timing diagrams, protocol traces (I2C, SPI,
  UART) so a student can debug a bus conflict without an oscilloscope.
- **In-browser, zero-install**: the single biggest adoption blocker for
  circuit simulation historically has been "download and compile ngspice."
  A student should be able to open a lesson and get a working schematic
  editor and simulator in the same tab, no setup. This likely means a
  WASM-compiled SPICE engine (ngspice compiles to WebAssembly reasonably
  well) behind a schematic-capture UI, rather than a server round-trip for
  every simulation run. Server-side simulation is a fallback for
  heavier analyses, not the default path, because round-trip latency kills
  the "change a value, see the result" loop that makes simulation useful for
  learning.
- **Schematic capture that produces real artifacts**: the schematic a
  student draws for simulation should be exportable to a real PCB tool, not
  a throwaway teaching widget. This is where deep integration with a tool
  like KiCad matters — KiCad's file formats are open and scriptable, which
  makes it realistic to imagine a browser-based schematic/simulation
  front end that round-trips into real KiCad projects a student can later
  open locally, hand to a fab house, or fork into a portfolio repo.

The point of failure to design against: SPICE models are idealized.
Component tolerances, parasitic inductance from real PCB traces, thermal
drift — none of that shows up in a first-order simulation. The curriculum
has to be explicit that "it works in simulation" is a checkpoint, not a
finish line.

### Mechanical / CAD simulation

Mechanical engineering and robotics modules need:

- **Stress and structural analysis (FEA)**: will this bracket survive the
  load, will this drone frame flex at resonance, will this pressure vessel
  hold. Even a simplified FEA solver — coarse mesh, linear-elastic
  assumptions — is enough for a student to develop intuition about where
  material actually needs to go, which is the real pedagogical goal, more
  than getting a lab-grade stress number.
- **Kinematics and motion simulation**: for anything with linkages, gears,
  or multi-body motion (robot arms, four-bar linkages, suspension geometry),
  students need to simulate motion envelopes and interference before cutting
  material.
- **Thermal simulation**: enclosure design, heat sink sizing, and battery
  thermal management all show up early (the irrigation controller left in a
  hot garden shed, the amplifier that needs a heat sink). Coupled
  thermal-mechanical simulation is advanced but a basic steady-state thermal
  solve is achievable and pedagogically valuable much earlier.
- **CAD as a first-class artifact, not a screenshot**: rather than building
  a proprietary in-browser CAD tool from scratch, the more realistic path is
  integrating with existing CAD platforms that expose APIs — Onshape's REST
  API is the most mature example of cloud-native, API-accessible CAD; FreeCAD
  is the most realistic open-source, scriptable option for a
  self-hosted or offline-capable path. The platform's job is orchestration
  and review (pulling geometry, mass properties, and simulation results back
  into the AI mentor's feedback loop), not reinventing a CAD kernel.

Mechanical simulation is where "simulate first" is weakest as a universal
rule, because tolerance stack-up, real material properties, and
manufacturing defects dominate outcomes in ways that are hard to model
cheaply. The curriculum should treat mechanical FEA as directionally
correct, not load-bearing truth, and push students to physical prototypes
earlier in mechanical modules than in, say, digital logic modules.

### Embedded / firmware simulation

This is the newest and least mature category of the four, and also one of
the most important, because embedded systems sit at the center of almost
every flagship project in the brief (the irrigation controller, the drone
autopilot, the dog feeder).

- **Run real firmware against simulated peripherals**: the student writes
  actual C/C++ (or Rust) that targets a real microcontroller (say an
  STM32 or an ESP32), and it runs against a simulated chip with simulated
  GPIO, timers, ADC, and simulated sensors (temperature, IMU, ultrasonic
  distance) feeding it synthetic data. Wokwi is the clearest existing proof
  of concept here — full chip simulation with a wired-up virtual breadboard,
  running in the browser, with real toolchains underneath. That's the right
  shape for this platform's early modules: zero-setup, immediate feedback,
  real firmware code.
- **Fault injection**: simulated peripherals should be able to lie —
  return garbage, disconnect, return values out of spec — because
  learning to handle a sensor that fails is as important as reading one
  that works. This is something physical hardware struggles to test
  systematically and simulation does well.
- **Hardware-in-the-loop (HIL) as the bridge, not the endpoint**: for later
  modules, the firmware should run on real silicon while some or all of the
  physical environment remains simulated — real ESP32, simulated pump and
  soil-moisture sensor, so a student can validate real timing and real
  interrupt behavior without needing an actual greenhouse. HIL is the
  natural middle rung between "simulated everything" and "physical
  everything," and it's a good place for remote lab infrastructure (see
  Hardware Integration below) to do double duty.
- **Reality gap to design against**: simulated peripherals are
  deterministic and clean. Real sensors have noise, drift, cross-talk, and
  power-supply-dependent behavior that no simulated ADC reproduces by
  default. A student whose code only ever ran against a simulated
  temperature sensor will be unprepared for a real one that returns garbage
  on power-up. The curriculum needs to inject this reality gap deliberately
  — either through fault injection in simulation or, better, by requiring
  physical validation before a project can be marked complete.

### Control systems simulation

Control theory is the connective tissue across EE, ME, chemical, and
robotics (PID loops show up in the greenhouse controller, the drone
autopilot, and the espresso machine alike), so it deserves its own
simulation environment rather than being bolted onto circuit or embedded
sim.

- **Block-diagram / plant-model sandboxes**: a Simulink-style visual
  environment where students wire up a plant model (drone dynamics,
  thermal mass of a greenhouse, espresso boiler dynamics) to a controller
  block (P, PI, PID, or later state-space/MPC) and watch step response,
  overshoot, and settling time in real time as they tune gains. Existing
  prior art worth drawing on: Simulink's block-diagram paradigm, and
  browser-native alternatives like the control-systems notebooks built on
  Python's `control` library or JupyterLite, which avoid a licensed desktop
  dependency.
- **PID tuning as a game, not a lecture**: because the feedback loop
  (change Kp, immediately see the step response) is exactly the kind of
  tight iteration loop that builds intuition fast, this is one of the
  highest-value simulation investments for the curriculum's teaching
  effectiveness relative to build cost.
  **Progressive plant fidelity**: start with a simplified linear model
  (first-order lag for the espresso boiler), then introduce nonlinearity,
  delay, and disturbance (a door opening near the greenhouse sensor, wind
  gusting on the drone) as the student advances, so the sandbox grows with
  them instead of maxing out its usefulness after week one.
- **Bridge to embedded sim**: a control-systems sandbox and a firmware
  simulator solve different problems. The natural progression is: tune the
  controller in the block-diagram sandbox, then implement it as real C code
  in the firmware simulator, then run it against a simulated plant (or, on
  the HIL bridge, a real plant) — so the "does the algorithm work" step and
  the "does the implementation work" step are separated, matching how
  control engineers actually work.

### Where simulation cannot substitute for hardware

This has to be stated plainly and reflected in curriculum gates, not left
implicit:

- **Real-world noise**: EMI, ground loops, thermal noise, and power-supply
  ripple are structurally hard to simulate faithfully because they depend
  on physical layout, cable routing, and environmental conditions that
  don't exist as parameters in a schematic. A circuit that's clean in SPICE
  can be unusable on a real breadboard because of a ground loop the
  simulator has no concept of.
- **Manufacturing tolerances**: resistors are rated to a tolerance band,
  not an exact value; 3D-printed parts warp; PCB fab has real minimum
  trace/space limits and real solder-mask registration error. A design that
  simulates perfectly can fail because of stack-up across a dozen
  ordinary tolerances, and that failure mode only ever shows up with real
  parts.
- **Human factors**: does the enclosure feel good to hold, is the switch
  actuation force right, is the UI actually usable by someone who isn't the
  designer. No simulator has an opinion on this.
- **Assembly and rework reality**: how hard is this actually to solder,
  does the enclosure actually close, does the connector actually fit — these
  only show up when a student is holding the part.

Because of this, the curriculum should treat "passes simulation" as a
necessary but not sufficient gate. Concretely: a project shouldn't be
markable as complete — shouldn't generate a portfolio artifact — until
there's physical evidence attached (see Hardware Integration, below).
Advanced projects should explicitly require a **simulation-vs-reality
delta report**: what did the simulation predict, what did you actually
measure, and why do they differ. That delta is often the most valuable
learning in the whole project, and making students write it down turns an
implicit lesson into an explicit deliverable.

---

## 2. Hardware Integration

Simulation gets a student to a validated design. At some point the platform
has to get real components into real students' hands, get real boards
fabricated, and get real evidence of real hardware working back into the
grading loop. This is the layer where an AI-mediated platform is most
exposed to the physical world, and it's worth designing deliberately rather
than treating as a logistics afterthought.

### Starter kit progression

Not every student needs the same hardware, and requiring too much too early
is a real barrier to entry (cost, and intimidation). The kit should scale
with the curriculum, not be handed out all at once.

**Day one kit** (targeting under $50, ships anywhere):

- A breadboard, jumper wires, a basic multimeter
- A handful of resistors, capacitors, LEDs, diodes, a couple of common
  op-amps and transistors
- One capable, cheap microcontroller dev board (an ESP32 dev board is a
  reasonable default: WiFi built in, well supported by open toolchains,
  cheap enough to make replacement low-stakes)
- A small assortment of sensors matched to the first few projects (a
  temperature/humidity sensor, a photoresistor, a simple ultrasonic
  distance sensor)

This kit should be enough to complete the first several dozen projects
without a second purchase. The point isn't minimalism for its own sake —
it's removing "I need to buy something else first" as a reason to stall.

**Intermediate kit** (as students move into PCB design and more serious
embedded work):

- A soldering iron and basic hand tools
- A USB oscilloscope or logic analyzer (inexpensive USB-based scopes have
  gotten good enough to be genuinely useful for this level of work, at a
  fraction of a bench scope's cost)
- Access to a 3D printer (owned, shared, or via a print-on-demand service)
  for enclosures and mechanical parts
- A wider component library, moving from through-hole toward a mix of
  through-hole and hand-solderable surface-mount parts

**Manufacturable-product kit** (top of the curriculum, students building
toward "commercial-quality" and "manufacturable" projects per the brief's
progression):

- A real bench multimeter and oscilloscope, or reliable remote/shared
  access to one (see below)
- Fabricated PCBs rather than breadboards or protoboards, sourced through a
  fab partnership
- Access to reflow (a toaster-oven-class reflow setup is enough at this
  stage; a shared/remote reflow oven is a reasonable alternative to owning
  one)
- Real enclosure fabrication — CNC, injection-mold-adjacent processes via a
  service bureau, or advanced 3D printing

The principle underneath all three tiers: **own what's cheap and used
constantly (breadboard, multimeter, hand tools); rent or share what's
expensive and used occasionally (reflow oven, real oscilloscope, CNC
mill).** That principle is what makes remote/shared lab access a real
architectural component rather than a nice-to-have.

This tiering is also the concrete mechanism behind the Lagos-equals-Boston
parity goal, not just a cost-conscious default. A sub-$50 day-one kit means
the first-dollar barrier to starting real engineering work is low enough
that geography and local income shouldn't determine who gets to begin.
Shared and remote access to the expensive tier — the oscilloscope, the
reflow oven, the CNC mill — means reaching advanced, manufacturable-product
work doesn't require a student to personally own capital-intensive
equipment, which is exactly the requirement that would otherwise re-impose
the access gap the platform exists to close. A student in Lagos who can
afford the day-one kit and can book time on a remote scope or a shared fab
lab should be able to reach the same competence ceiling as a student in
Boston with a garage full of bench equipment — the tiering is what makes
that literally true in terms of what hardware a learner is required to
personally own at each stage, not just an aspiration.

### Distributor, fab, and assembly partnerships

The platform should integrate directly with the supply chain a real
engineer uses, both for iteration speed and to make cost realism part of
the pedagogy, not something abstracted away.

- **Component sourcing**: a Digi-Key/Mouser-style API integration lets a
  student's BOM be checked for real-world availability and real-world
  pricing directly inside the platform — "your BOM says $145, here's what
  it actually costs to source these exact parts today, including the
  $8 minimum-order fee your connector triggers" is a much sharper lesson
  than an estimate. This also naturally teaches sourcing risk: parts go
  out of stock, lead times spike, and a curriculum that surfaces real
  distributor data teaches students to design with second-source
  alternatives in mind, which is a real skill gap in junior engineers.
- **PCB fab and assembly**: a JLCPCB-style fab-plus-assembly partnership
  (cheap small-batch boards, optional SMT assembly) is what makes "design a
  PCB, get it in your hands in a week" viable for a student, rather than a
  multi-month, multi-hundred-dollar ordeal. This is also the natural point
  to introduce design-for-manufacturing feedback: fab-house DRC (design
  rule check) output — trace width violations, drill-to-copper clearance,
  panelization constraints — can be surfaced through the AI mentor as part
  of the review, not just as a fab-side rejection email days later.
  Integrating directly with a fab's API (order status, DRC results,
  pricing by quantity) turns "how much would this cost to make 100 of"
  from a hypothetical into a real number the student can pull on demand.
- **BOM cost realism as a graded dimension**: because the brief already
  asks the AI mentor to push on "can this be built for $20 instead of
  $100," the sourcing integration is what makes that question answerable
  precisely instead of impressionistically. This closes the loop between
  the brief's "economical / manufacturable" evaluation dimensions and
  actual purchasable data.
- **Negotiating leverage as the platform scales**: at meaningful volume,
  aggregate ordering (bulk component buys, batched PCB panels across many
  students' small orders) becomes a real lever for driving down the
  effective cost of hardware for students — worth an explicit line in a
  future operations/business document, not solved here, but worth noting
  as a reason to build the fab/distributor integration as a real
  transactional relationship rather than just an affiliate link.

### Remote and shared lab access

Requiring every student to own an oscilloscope, a 3D printer, and a reflow
oven on day one is both a cost barrier and unnecessary — most of that
equipment sees light, occasional use per student, especially early on.

- **Remote instrument access**: a bank of internet-controllable
  oscilloscopes, logic analyzers, and power supplies — a student runs a
  design of experiment, sees a real scope trace of a real circuit, without
  owning a scope. This is a well-proven pattern in remote-lab research and
  in hobbyist "tele-lab" projects; the platform's job is packaging it
  cleanly and tying the captured data straight into the AI mentor's review
  flow.
- **Shared fabrication access**: regional partnerships with makerspaces,
  fab labs, or the platform's own regional hubs as the platform scales,
  giving students physical access to 3D printers, laser cutters, reflow
  ovens, and basic machine tools without each of them owning one. This also
  creates a natural in-person/community layer on top of an otherwise fully
  remote platform, which likely matters for younger students in particular.
- **Queue-based access to platform-owned HIL rigs**: for embedded and
  control-systems capstones, a shared bank of physical HIL rigs (real
  motor + real driver + simulated load, for instance) that students book
  time on remotely is a good middle ground between full simulation and
  requiring every student to own a drone frame.
- **This is a phased build, not a day-one requirement**: remote lab
  infrastructure is expensive to stand up. The MVP (electrical
  engineering: circuits, electronics, embedded systems per the brief)
  can run almost entirely on the cheap starter kit plus in-browser
  simulation. Remote/shared labs become necessary as the curriculum
  reaches modules that need equipment students shouldn't be expected to
  own (structural test rigs for civil engineering, process equipment for
  chemical engineering).

### AI review of physical evidence

The AI mentor's review loop can't stop at "does the code compile" or "does
the simulation pass" once a project reaches the physical stage — it has to
be able to look at, and reason about, real-world evidence.

- **Photo and video review**: solder joint quality, enclosure fit and
  finish, wiring dress and strain relief, mechanical assembly — a
  vision-capable model can catch a cold solder joint, a reversed polarity
  connector, or a stress-cracked 3D print from a photo, the same way a
  human lab instructor would glance at a student's bench. This is
  achievable with current-generation multimodal models and should be a
  required submission format for any project claiming physical completion,
  not an optional nice-to-have.
- **Oscilloscope and multimeter capture as structured data, not just
  images**: where the remote-lab or a student's own USB scope can export a
  waveform (CSV/trace data, not just a screenshot), the AI mentor should be
  able to reason over the actual data — measure real rise time, real noise
  floor, real ripple — rather than eyeballing a picture of a screen. This
  is a strong argument for USB-instrument integrations (many
  affordable USB scopes and multimeters already expose SCPI or similar
  programmatic interfaces) over "take a photo of the screen" as the default
  capture path, with photo capture as the fallback for students on
  cheaper gear.
- **Provenance matters for evidence, same as for code**: a photo or scope
  capture submitted as evidence needs to be tied to *this* project
  attempt, timestamped, and difficult to reuse across submissions. This
  connects directly to the artifact-provenance requirement in the platform
  data model (below) — physical evidence is an artifact type like any
  other, versioned and audited the same way.
- **The simulation-vs-reality delta report closes the loop here**: because
  the AI mentor has access to both the simulated prediction and the
  physical evidence, it's positioned to actually grade the delta report
  described above, not just accept it at face value — "you said you
  expected 60 dB gain, your submitted scope capture shows 52 dB, why?" is
  exactly the kind of Socratic follow-up the brief calls for, and it only
  works if the mentor has structured access to both sides of the
  comparison.

---

## 3. Platform Technical Architecture

This section describes the software system underneath the curriculum,
simulation, and hardware layers above — conceptually, not as an
implementation spec. The goal is a system that's buildable with an MVP-sized
team, cheap enough per learner to sustain unlimited AI mentorship, and
structured so disciplines beyond the EE-first MVP can be added without a
rewrite.

### Core services

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI Mentor Orchestration                   │
│   (agent loop: plan → retrieve → tool-call → evaluate → respond) │
└───────┬───────────┬───────────┬────────────┬────────────┬───────┘
        │            │           │            │            │
   ┌────▼────┐  ┌────▼─────┐ ┌───▼─────┐ ┌────▼─────┐ ┌────▼─────┐
   │ Learner │  │Knowledge  │ │Curriculum│ │Simulation│ │ Review   │
   │ Model   │  │  Graph    │ │ / Project│ │ Sandboxes│ │Pipelines │
   │ Store   │  │ Service   │ │ Content  │ │(circuit, │ │(code,CAD,│
   │(mastery,│  │(concepts, │ │  System  │ │mech,     │ │schematic,│
   │ history)│  │dependency │ │          │ │embedded, │ │ physical │
   │         │  │  edges)   │ │          │ │control)  │ │evidence) │
   └─────────┘  └───────────┘ └──────────┘ └──────────┘ └──────────┘
                                     │
                              ┌──────▼──────┐
                              │  Portfolio /  │
                              │ Artifact Store│
                              │ (versioned,   │
                              │  provenance-  │
                              │  tracked)     │
                              └───────────────┘
```

- **Learner model store**: per-student mastery state — which concepts
  they've demonstrated, at what confidence, decaying over time (see data
  model below). This is the system the adaptive curriculum reads from to
  decide what to present next, and the system the AI mentor reads from to
  decide how much scaffolding to offer versus how hard to push.
- **Knowledge graph service**: the structured map of concepts and their
  prerequisite relationships across all disciplines (Ohm's Law before
  MOSFET switching, statics before machine design, PID before state-space
  control) — the graph the curriculum engine and the mentor both query to
  answer "what does this student need before they can tackle this
  project." This is a distinct service from curriculum *content* because
  the graph is relatively stable structural knowledge while content
  (specific projects, lessons) can be authored and iterated independently
  on top of it.
- **AI mentor orchestration layer**: the agent runtime that actually talks
  to the student — covered in detail below.
- **Project / curriculum content system**: the authored material — project
  briefs, guided exercises, reference explanations, worked examples —
  versioned like code, because curriculum quality is itself iterative and
  needs the same review/rollback discipline as software.
- **Portfolio / artifact store**: every deliverable a student produces
  (code, CAD files, schematics, BOMs, photos, scope captures, written
  reflections) lives here, versioned, with enough metadata to reconstruct
  "what did this student actually do and when."
- **Simulation sandboxes**: the circuit, mechanical, embedded, and control
  simulation environments described above, exposed as callable services
  the mentor (and the student's own project) can invoke, not just
  standalone tools bolted onto lesson pages.
- **Code / CAD / schematic review pipelines**: automated static analysis,
  DRC/ERC checks, linting, and test execution that run before and alongside
  AI mentor review — the AI mentor should never be doing a syntax check by
  itself when a deterministic tool can do it faster and cheaper. This
  matters as much for cost as for quality: cheap deterministic checks
  should filter and pre-annotate what reaches the LLM, not the other way
  around.

### How the AI mentor is likely built

The mentor is best modeled as an **agent with tool use**, not a single
prompt-and-response chat interface. Concretely:

- **Tools the agent can call**: run code and inspect output; invoke a
  circuit/mechanical/embedded/control simulation and read back results;
  retrieve from the knowledge graph (what should this student know already,
  what's the standard next step); retrieve from curriculum content (pull
  the actual project brief, rubric, or reference material); query the
  learner model (what has this student struggled with before, what's their
  current mastery estimate); pull artifacts from the portfolio store for
  comparison across attempts; invoke the review pipelines described above.
- **Planning and evaluation loop**: for a substantive review (grading a
  submitted project, walking through a design flaw), the agent should
  plan its evaluation across the brief's stated dimensions — correctness,
  cost, manufacturability, reliability, maintainability, competitiveness
  — rather than free-associating a response. This is closer to a
  structured rubric-driven evaluation with LLM judgment filling in each
  cell than an open-ended chat reply, which both improves consistency and
  makes the mentor's output auditable.
- **Model tiering for cost control**: not every mentor interaction needs
  the most capable model available. The orchestration layer should route
  cheaper models to routine, well-specified checks (does this code
  compile, does this schematic pass ERC, is this BOM within budget) and
  reserve expensive, higher-capability models for genuinely judgment-
  heavy moments (is this design tradeoff reasonable, is this misconception
  worth a Socratic question or a direct explanation). Given how fast
  model capability-per-dollar has moved, this tiering should be a
  configuration decision revisited regularly, not a hardcoded assumption.
- **Persistent per-learner memory and state**: the mentor's context for a
  given interaction should be assembled from the learner model, not
  reconstructed from raw conversation history every time. That means the
  agent's "memory" is structured (mastery estimates, known
  misconceptions, project history, stated goals) and retrieved
  deliberately, rather than an ever-growing raw transcript stuffed into a
  context window. This is both a cost necessity (raw transcript replay
  doesn't scale) and a quality one (structured state is more reliable
  than hoping the right detail survived N previous conversations).
- **Guardrails against "just giving the answer"**: because the brief is
  explicit that the mentor should avoid handing out answers, this needs to
  be an enforced behavior, not just a prompted preference — likely a
  combination of prompt-level instruction, a review/critic pass on the
  mentor's own draft responses before they reach the student, and
  telemetry that flags patterns (e.g., a student pasting an error message
  and immediately getting corrected code back) for tuning.

### Data model considerations

- **Versioned learner mastery state**: mastery per concept shouldn't be a
  single scalar overwritten on each assessment — it should be a
  time-series (or at least an append-only log) so the platform can see
  trajectory (improving, plateaued, regressing), support the knowledge
  graph's decay/review-recommendation logic, and let a student or mentor
  look back at *why* the current mastery estimate is what it is. This is
  also what makes "track long-term mastery," a stated AI mentor
  responsibility in the brief, actually implementable rather than
  aspirational.
- **Artifact provenance and audit trail**: every submitted artifact
  (code commit, CAD revision, schematic, BOM, photo, scope capture,
  written reflection) needs a provenance record — what project attempt it
  belongs to, when it was created, what tool produced it, what prior
  artifact (if any) it revised. This matters for three reasons: it lets
  the mentor compare "this attempt" to "the last attempt" meaningfully; it
  protects portfolio integrity (an employer or collaborator looking at a
  graduate's portfolio should be able to trust the timeline); and it's the
  substrate the "simulation-vs-reality delta report" and similar
  cross-artifact reasoning depend on.
- **Curriculum content versioning**: projects and lessons change over
  time (better projects replace worse ones, rubrics get refined); a
  student's completed work should stay pinned to the version of the
  project they actually did, even as the live curriculum moves forward.
- **Cross-discipline schema from day one**: even though the MVP is EE-only,
  the learner model, knowledge graph, and artifact schema should be
  designed generically enough (concept nodes, artifact types, evaluation
  dimensions) that adding mechanical, civil, chemical, and robotics
  content later is a content and simulation-integration problem, not a
  data-model rewrite.

### Non-functional requirements

- **Low latency for interactive review**: the moments that build a
  student's trust in the mentor are the tight loops — "I tuned Kp, does
  this response look better," "I fixed this line, does it compile now."
  Those need to feel closer to sub-second/interactive than to a
  multi-second "AI is thinking" wait wherever possible. This pushes
  toward local/in-browser execution for anything on the hot path
  (simulation runs, linting, compilation) and reserves full LLM
  round-trips for the moments that actually need judgment, not for every
  keystroke-adjacent interaction.
- **Cost-to-serve per learner**: "unlimited feedback" and "unlimited
  office hours" (both explicit principles in the brief) are only
  sustainable if the average cost of a mentor interaction is low. This is
  the central economic constraint on the whole AI architecture, and it
  argues strongly for: deterministic checks before LLM calls wherever
  possible; model tiering (cheap models for routine review, expensive
  models reserved for genuinely hard judgment calls); aggressive caching
  of retrieval (knowledge graph and curriculum content don't need to be
  re-fetched and re-reasoned-over identically every time); and treating
  "cost per mentor interaction" as a first-class metric the team watches
  continuously, not something discovered after scale becomes a problem.
- **Safety guardrails around real hazards**: the primary audience is
  capable adults — undergraduate and graduate engineering students and
  career-changers, not a K-12 population — so moderation doesn't need to be
  built around child-safety regimes as a central design axis. What does
  need to be built from day one is physical-safety guardrails, since
  projects involve real electrical, mechanical, and (later) chemical
  hazards regardless of the learner's age: the mentor should be able to
  recognize and flag genuinely unsafe builds (mains-voltage mistakes,
  structurally unsound load-bearing designs, chemical mishandling) as a
  hard stop, not a suggestion. A smaller population of younger or
  under-18 learners will still show up organically (a motivated
  17-year-old is a plausible early user even if not the target segment),
  so basic age-appropriate data handling (COPPA-equivalent where
  applicable) is worth having as a baseline, not a core product axis.

### Offline and low-bandwidth as a first-class requirement

This is not a minor technical afterthought bolted on for edge cases — it's
a direct consequence of the Lagos-equals-Boston design constraint stated in
the brief. "Quality does not get diluted for accessibility" is a hard
requirement, and connectivity is one of the most common real-world barriers
between a capable learner and this platform, arguably a bigger day-to-day
obstacle than hardware cost for a large share of the target audience.
Reliable high-bandwidth, always-on internet is a Boston assumption, not a
global one, and an architecture that quietly requires it would recreate
exactly the geography-determines-outcome gap the platform is supposed to
eliminate — just moved from "can you afford a lab" to "can you afford
always-on broadband." So this has to be treated as load-bearing NFR, not a
line item to revisit later:

- **Simulation runs client-side by default**: in-browser WASM execution
  (the same architectural choice already motivated above for latency and
  cost) also means a student's core iteration loop — the SPICE run, the
  firmware simulation, the PID tuning sandbox — doesn't require a
  round-trip to a server at all, so it keeps working on a slow or
  intermittent connection the same way it works on a fast one. Fidelity
  shouldn't degrade based on the learner's bandwidth.
- **Curriculum content is cacheable and downloadable**: lessons, project
  briefs, and reference material should be structured for offline study —
  synced when a connection is available, usable when it isn't — rather than
  assuming a persistent connection to fetch content on demand.
- **The AI mentor degrades gracefully instead of failing hard**: when a
  live round-trip to the mentor isn't available, the platform should fall
  back to batched or asynchronous review (queue the question or submission,
  respond when connectivity returns) rather than becoming unusable. A
  learner without a live connection should lose immediacy, not access.

### Why this shape, not a simpler one

It would be simpler to build a single monolithic "AI tutor chatbot" bolted
onto a video course. That's explicitly not this platform, per the brief's
own framing — projects, portfolios, and real engineering judgment are the
product, not video completion. The architecture above is more work to build
than a chatbot because it has to be: groundable (the mentor's opinions have
to be backed by real simulation results and real review-pipeline output,
not just LLM assertion), auditable (mastery claims and portfolio artifacts
have to hold up to outside scrutiny, since the entire credentialing bet is
that this portfolio is more trustworthy than a transcript), and durable
(the same core services need to keep working as the curriculum expands from
one discipline to six). None of that is optional if the platform is
actually going to produce the outcome the brief measures success by — top
1% engineers, not a satisfied user of a well-reviewed app.
