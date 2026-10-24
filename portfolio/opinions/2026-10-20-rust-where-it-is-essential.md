# Rust where it is essential

*An opinion piece, not a rule. The owner wrote the first part on 2026-10-20;
the rest is notes from the Claude session that wrote it up. Read it as a
direction of travel when you choose work (`prompts/steering.md`: owner
direction is a collaborator's view, not gospel). Nothing here asks you to
rewrite anything.*

## The owner's view

The owner, 2026-10-20, in their own words:

> I want to do more projects in rust go java or similar more heavy duty
> languages. things that require it. not just because of arbitrary reasons,
> but for projects where it's actually essential.

And, narrowing it a moment later: **"specifically rust."**

So the ask has two halves, and both matter:

1. **More Rust.** The portfolio should take on projects whose natural
   implementation language is Rust.
2. **Only where Rust is essential.** Not Rust for its own sake, not a
   rewrite to make light work look serious, and not a language picked
   before the problem.

## Notes from the session that wrote this up

**Where the repository stands.** On 2026-10-20 the tree holds no Rust at
all: 0 `.rs` files and no `Cargo.toml`, beside about 5,300 Python files,
9,100 `.mjs` files and 1,150 TypeScript files. The only Rust the
portfolio touches is the Tauri desktop shell
([`docs/posts/2026-10-20-offline-desktop-apps-from-static-pages-with-tauri.md`](../../docs/posts/2026-10-20-offline-desktop-apps-from-static-pages-with-tauri.md)):
`platform/distribution/desktop.mjs` writes its `main.rs` from a template,
and the manual, owner-gated `distribute-desktop.yml` is the one workflow
that installs a Rust toolchain. Nothing runs `cargo test` on a crate of
ours. The cloud container has `cargo 1.97.0`, but only the host target, so
a WASM build needs `rustup target add wasm32-unknown-unknown` first.

That is not a mistake on its own. Almost everything built so far is light:
calculators, validators and research scripts where the time goes into I/O,
a native library or the reader. The owner's point is that the work should
now include problems where that stops being true.

**What "essential" means here.** Rust is essential when at least one of
these holds, and a measurement or a hard constraint shows it:

- **Our own inner loop is the bottleneck.** A profiler shows the time going
  into code we wrote (a search, a solver, a simulation step), not into a
  native library we call. If the hot path is already C, Rust buys nothing:
  [`docs/posts/2026-10-20-we-almost-rewrote-it-in-rust.md`](../../docs/posts/2026-10-20-we-almost-rewrote-it-in-rust.md)
  found 62% of a site build in zlib, and the fix was one setting.
- **No garbage collector, no runtime.** Microcontroller firmware and
  real-time control loops have fixed memory and hard deadlines. Here the
  alternative is C, and Rust's case is memory safety at the same cost.
- **One core, every surface.** The same engine has to run in the browser
  (WASM), as a native CLI, from Python (PyO3) and as a published crate.
  Rust is the most practical language that does all four from one source.
  This is the "build one core and generate the surfaces" pattern from
  [`2026-10-20-build-what-an-agent-would-rather-call.md`](2026-10-20-build-what-an-agent-would-rather-call.md).
- **Untrusted input in a parser that must not fall over.** Decoders for
  file formats people upload, where a crash or an overflow is a security
  bug.

Rust is not essential for pages, forms, glue scripts, CI checks, or anything
whose run time is dominated by a network call, a database or an existing
native library. Those stay in Python or JavaScript.

**Candidates already in the repository.** Each has a bar it can miss, so the
Rust version is judged by the result, not by the language.

1. **The shift-roster-builder optimality proof** (flagship 3 in
   [`portfolio/flagships.yaml`](../flagships.yaml)). Its branch and bound
   runs in JavaScript at about 11k nodes a second and still times out
   proving the cheapest roster for its own 32-shift sample week in the
   8-second budget. This is the clearest case: a search over our own data
   structures, where node rate is the constraint. The bar is proving that
   week. Measure first, though: the `next` entry also lists algorithmic
   gains (an incremental flow reused down the tree, dominance between
   people), and those may matter more than a constant factor. A Rust core
   compiled to WASM keeps the web page working, and the same crate gives
   league-schedule-generator a solver too.
2. **3D topology optimisation in the browser**, growing out of
   `research/simdesign-topopt`. That project is a Python and scipy
   reproduction of Sigmund's 99-line code in 2D. 3D finite elements with a
   multigrid-preconditioned solver is real numerical work, and the browser
   has no scipy. (Correction, 2026-10-21: through Pyodide it does. The 2D
   code runs unchanged in WebAssembly at about 1.5x CPython's time, so the
   case rests on 3D at interactive speed;
   `docs/reports/2026-10-21-wasm-on-the-site.md`.) The bar is matching the Python reference on the 2D cases,
   then a 3D cantilever at interactive speed.
3. **EDA passes** (placement, logic optimisation), growing out of the
   `research/chip-*` work, benchmarked against yosys, ABC and OpenROAD on
   their own example designs. Most serious open EDA work is in C++ or Rust
   for exactly the inner-loop reason.
4. **Firmware.** `research/ambient-gatesimd` and its siblings are C for a
   Cortex-M4, and open-tennis-robots plans ESP32 firmware. Embedded Rust
   targets both (`thumbv7em-none-eabi`, `esp-hal`). The honest test is a
   port of the existing C gate measured in the same Unicorn harness:
   instruction count, code size and RAM against the C numbers already
   published. If Rust costs more there, say so and keep C.

**What to avoid.**

- Rewriting a working Python or JavaScript tool in Rust without a
  measurement that says the language is the constraint.
- Rust as a wrapper around a C library that already does the work.
- A crate nobody builds. The first Rust project has to bring its own CI
  job (`cargo test`, `cargo clippy`, `cargo fmt --check`) and, if it
  targets WASM, the build step that puts the output on the site.

**A first step that fits one run.** Profile the roster proof on the sample
week, port only the bound and the node loop to a small Rust crate, and
compare nodes per second and time to proof against the JavaScript on the
same instance. Either result is worth writing up: a faster proof, or a
measured reason the language was not the constraint.
