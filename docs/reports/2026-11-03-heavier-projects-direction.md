---
kind: analysis
date: 2026-11-03
tagged: auto
---
# Heavier projects: the owner's 2026-11-03 direction, and the first run on it

The owner, 2026-11-03, starting a session: "again I think it makes sense to
move to more ambitious and heavy duty projects."

"Again" because this restates the 2026-10-20, 10-21 and 10-29 directions in
`prompts/goals.md` ("Direction: depth over calculators", "Lean towards
projects of about three hundred hours"). The direction has been written
down three times and runs still drift small. That is the problem to solve.

## What the numbers said that morning

- `python3 prompts/runcost.py report`, "by project": 1,027 of 4,748 run
  records carry a human-hours estimate. Six projects are over 20 h and
  **none over 200 h**. The largest is `platform/pages` at 93.5 h.
- `research/` holds 1,064 folders (`accel-*`, `twin-*`,
  `garment-*`, `osrobot-*`, ...), most of them one milestone each.
  `ventures/` holds 1,332.
- The fifteen commits on `main` before this run included four sales-agent
  tools: an SPF/DKIM/DMARC checker, two cold-email sequence checkers and a
  warm-up ramp planner. Each is a flagship slice, and each is a small tool.

So effort is spread across thousands of small surfaces, and what each run
adds is small even inside a flagship.

## What this run did instead

It took one flagship gap that needs real engineering and real data: "a real
architect's IFC with doors" for `wall-framing-takeoff`. It found two real
CC BY 4.0 models (buildingSMART community samples, Revit and ArchiCAD). It
measured the existing JavaScript reader on them and found two silent
failures: no exterior loop, and 2 of 10 openings placed. It then wrote
[`ventures/wall-framing-takeoff/ifc-engine`](../../ventures/wall-framing-takeoff/ifc-engine/README.md),
a dependency-free Rust IFC reader, and checked it against IfcOpenShell to
0.0000 m on every wall base and height and every related opening. The
README holds a 340-hour plan with 11 milestones, each checkable on a real
model. Milestone 1 (about 40 h) landed here.

Notes for the next run on it:

- The models are not in the tree. `scripts/fetch-models.sh` fetches them
  and pins them by sha256 (media.githubusercontent.com is reachable
  through the proxy; raw.githubusercontent.com returns only the LFS
  pointer). `pip install ifcopenshell numpy` works in a venv for
  `scripts/agree.py`.
- No WASM target is installed (`rustup target list --installed` shows
  only x86_64). Milestone 2 (the page) starts with
  `rustup target add wasm32-unknown-unknown`. `ventures/dupehound/web` is
  the pattern for loading the module from a page.
- No CI job builds the crate yet. A workflow lives in `.github/`, which is
  owner-gated (`.github/CODEOWNERS`), so add one in its own small PR.
  Until then, run `cargo test` locally.

## A suggestion, not a rule

When a run has a free choice, pick the flagship milestone that needs
something only a long project has: real input files, an independent
reference to check against, or a core worth writing in a heavier
language. Leave a written plan sized in hours in the project. Don't add
another small checker to the same flagship. A run that cannot finish a
heavy milestone should land a working slice of it and the plan, not a
small finished tool next to it.

The owner's quote belongs in `prompts/goals.md` under "Lean towards
projects of about three hundred hours". That file is owner-gated, so this
run did not edit it. The proposed text is in the run record's
`doc_friction`.
