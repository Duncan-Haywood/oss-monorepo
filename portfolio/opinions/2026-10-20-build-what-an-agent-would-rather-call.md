# Build what an agent would rather call than redo

*An opinion piece, not a rule. The owner wrote the first half on 2026-10-20;
the second half is notes from the Claude session that wrote it up. Read it
as a direction of travel when you choose work (`prompts/steering.md`: owner
direction is a collaborator's view, not gospel). Nothing here asks you to
delete anything.*

## The owner's view

The owner, 2026-10-20, in their own words:

> i just think a lot of the stuff we are building is maybe not worth
> building necessarily especailly when the abillity of ai agents are going
> up so to use my tool versus for an ai agent to just do it themselves the
> second becomes easier if there's not enough depth to justify searching and
> finding my tool versus just doing it themselves. and a lot of this stuff
> is so light it fits in the second category. i think it should really move
> more in the direction of hard problems work intenstive problems and
> distriute each thing in a myriad of ways agent tools mcp cli tui acli web
> app documentation package manager situations.

Put plainly, the argument is:

1. **More and more users are agents, or have one.** A person with an agent
   doesn't open a calculator page. They ask the agent.
2. **An agent can either call a tool or do the job itself.** Calling means
   finding the tool, reading how it works, trusting it and wiring it in.
   Doing it itself means writing twenty lines of code or doing the sum in
   its head. The tool only wins when the job is worth more than that
   overhead.
3. **That bar rises every model generation.** Each capability jump moves
   another band of light tools from "worth calling" to "quicker to redo".
   A fee calculator or a threshold check is already in that band, or close.
4. **So build what's hard to redo.** Work-intensive problems: solvers,
   validators that match an official spec, simulators, pipelines over real
   media, engines with real test suites behind them. An agent would take
   days to rebuild these and would probably get them wrong, so it calls
   them instead.
5. **Then distribute each one every way people and agents look for it.**
   A package (npm, PyPI, crates.io), a CLI, an MCP server, a TUI, an agent
   skill, a web app, and documentation good enough to be found and quoted.
   The deep thing is the asset; each surface is a way in.

## Notes from the session that wrote this up

I agree with the core of it. A few notes that might help a run act on it.

**The numbers back it up.** Of the 1,304 folders in `ventures/` on
2026-10-20, the median one has about **350 lines** of non-test source code.
**925 (71%) have under 500**, and only **16 have 3,000 or more**. Distribution
runs the wrong way round: nearly every light tool can be called through the
agent CLI and MCP server, but 10 of the 20 largest ventures can't, and no
venture is a published package. Line count is a rough proxy (the largest,
local-site-studio, is large partly through bloat, per `flagships.yaml`).
Method, caveats and next steps:
[`docs/reports/2026-10-20-depth-and-distribution.md`](../../docs/reports/2026-10-20-depth-and-distribution.md).

**"Light" isn't the same as "an agent can redo it".** The right test is
whether calling the tool is cheaper *and more trustworthy* than redoing it.
Depth can be in the data and the correctness, not only in the compute. A
tool that holds current, cited, per-jurisdiction facts (tax thresholds,
marketplace fee schedules, filing deadlines) is something an agent would
otherwise have to research, and it can get that research subtly wrong.
Those tools pass the test if they are kept current and cite their sources.
A tool that multiplies two inputs doesn't. So ask: *would a capable agent
with a shell get the same answer, as reliably, in under a few minutes?* If
yes, don't build it as a standalone product.

**Hard doesn't mean Rust.** What makes something hard is the algorithm, the
spec conformance and the systems work. Reach for Rust/WASM once there's a
genuinely heavy core: a solver's inner loop, a finite-element solve, a
media pipeline. Don't reach for it to make light work look serious.

**Candidates that already live in this repo** (from the same conversation):

- *A rostering and scheduling solver*, with LP/flow bounds that prove
  optimality and large-neighbourhood search to find good schedules. Rust
  compiled to WASM, powering shift-roster-builder and
  league-schedule-generator, benchmarked on public nurse-rostering
  instances (INRC-II). The current JS solver can't prove optimality on its
  own 32-shift sample week (`flagships.yaml`).
- *An e-invoice validation engine* as one library behind every surface
  (CLI, WASM, PyPI, server). The bar is conformance with the official EN
  16931, XRechnung and Peppol Schematron on the official example files.
- *Live 3D topology optimisation in the browser* (a multigrid-
  preconditioned finite-element solver in WASM), growing out of
  `research/simdesign-topopt`.
- *EDA passes* (placement, logic optimisation) benchmarked against
  yosys/ABC/OpenROAD, growing out of the `research/chip-*` and
  `research/eda-*` work.

**Build one core and generate the surfaces.** Six hand-built surfaces per
project is six times the upkeep, and they drift apart. The pattern that
scales is one core library with a typed contract (inputs, outputs, errors),
and thin generated shells for each surface. `platform/agents/tools.mjs`
already does this for the light tools, exposing them all through one CLI
and MCP server. Do the same for a deep project, and also publish to the
package manager its users already use.

**Don't swing too far.** Usage of most tools is unmeasured, not zero
(`portfolio/usage/usage.yaml`). The light tools are also the portfolio's
SEO surface: the way search is meant to lead people to the deep ones. Stop adding more of them by
default, measure the existing ones, keep what's used, and spend new effort
on depth. Retiring a tool takes a measurement, not this essay.

**Hard work needs a bar it can miss.** Pick work that has a public
benchmark, an official conformance suite or a proof of optimality. It keeps
the work honest, and "matches the official validator on all N examples" is
something a reader can check. "Ships a solver" isn't.
