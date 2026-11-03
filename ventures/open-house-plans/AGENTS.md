# Designing houses from an agent

This is the guide for an AI agent (or a script) that turns a person's request into a house plan with Open House Plans. Everything is local, deterministic and free: no key, no network, no dependencies beyond Node 18.

## The loop

1. Turn the request into a **brief** (JSON, below). Prefer writing the JSON yourself from what the person said; `{"text": "..."}` works too and uses keyword rules.
2. Call `design(brief)` and read the summary: `design.title`, `design.rooms`, `design.cost`, `design.checks.failed`, `notes` (what was read or changed) and `alternatives` (other layouts).
3. Show the person the summary and the runners-up; adjust the brief (`variant`, `area`, `priority`, `style`, ...) and repeat.
4. When they are happy, write the plan set with the CLI (`--out DIR --zip`) and hand over the files. Tell them the plans are not for construction and need a licensed review, the local code and a permit.

```bash
# summary as JSON
node platform/agents/tools.mjs call open-house-plans design --input '{"beds":3,"baths":2,"area":1450,"style":"craftsman","priority":"beauty"}'
# from words
node platform/agents/tools.mjs call open-house-plans design --input '{"text":"4 bed ranch with a two-car garage on a 90 ft lot"}'
# how a sentence is read
node platform/agents/tools.mjs call open-house-plans parseBrief --args '["two bedroom cottage with a porch"]'
# the plan set (18 files, with every wall framed stud by stud) plus a zip
node platform/agents/tools.mjs run open-house-plans -- design --beds 3 --style modern --out house --zip --json
```

Over MCP (`node platform/agents/tools.mjs mcp`), use `call_tool` with `slug: "open-house-plans"`, `function: "design"` and `input: {brief}`, or `run_cli` with the CLI arguments. `designFiles` returns every file's text and is too large for an MCP reply; use the CLI with `--out` for files.

## The brief

Every field is optional. Unknown fields are ignored with a note; out-of-range values are clamped with a note.

| Field | Values | Default |
|---|---|---|
| `text` | plain English; fields you also pass override what it says | |
| `beds` | 0 (studio) to 5 | 3 |
| `baths` | 1, 1.5, 2, 2.5, 3, 3.5 | by bedrooms |
| `area` | target heated floor area, sq ft, 300 to 3,200; the design lands within -7% to +10% | by bedrooms |
| `style` | `farmhouse`, `craftsman`, `modern`, `ranch`, `cottage`, `minimal` | `farmhouse` |
| `priority` | `budget`, `balanced`, `beauty` | `balanced` |
| `garage` | 0, 1, 2 (cars, attached, at one end) | 0 |
| `porch` | `"auto"` (the style decides), `true`, `false` | `"auto"` |
| `foundation` | `slab`, `crawl` | `slab` |
| `frame` | `advanced` (2x6 at 24 in), `conventional` (2x4 at 16 in) | `advanced` |
| `accessible` | `true` for 36 in doors, a 42 in hall and a bath with a 5 ft turning circle | `false` |
| `split` | `"auto"`, `true` (primary suite across the great room), `false` | `"auto"` |
| `lot` | `{width, depth, front, side, rear}` in ft (setbacks default 25, 5, 20) | none |
| `maxWidth`, `maxDepth` | ft, the building (depth includes the porch) | none |
| `snow`, `wind` | roof snow load (psf), basic wind speed (mph) | 30, 115 |
| `finish` | `basic`, `standard`, `premium` (interior finishes cost) | `standard` |
| `region` | cost multiplier against the US average | 1 |
| `ceiling` | 8, 9 or 10 ft; `null` = the style's | `null` |
| `variant` | 0 = best design; 1, 2, ... = the runners-up | 0 |

## What to tell the person

- `designFiles` (and the CLI with `--out`) frames every wall stud by stud: `framing.svg`, `framing-cuts.csv`, `lumber-order.csv`, and `design.studFraming` (boards, pieces, offcut, notes). The order is wall framing only and in boards, not dollars.

- The cost is a model anchored on NAHB's 2024 survey and scaled by the design's geometry, in 2024 US-average dollars, not a quote.
- The checks paraphrase the IRC by section and run NDS member checks; passing them is not code compliance.
- The plans are public domain (CC0 1.0): they may use, change and build from them freely, with no warranty.
- If `error` comes back, it says what does not fit (usually a lot too narrow for a single-storey plan); suggest a smaller area, no garage, or a wider lot.
