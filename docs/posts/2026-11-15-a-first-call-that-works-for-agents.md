---
title: "Agents guessed compute. Now the tools server hands them a call that ran"
date: 2026-11-15
tags: [agents, mcp, open-source, tooling]
seo_title: "An MCP tools server that hands agents a first call that ran"
description: "describe_tool now returns a call it has just run on each tool's own sample inputs, so an agent's first call works: 769 of 1,350 tools get one."
---

This repository ships a small MCP server, `platform/agents/tools.mjs`, that lets
an AI agent search the 1,350 calculators and checkers under `ventures/`, see
how to call one, and run its engine without a browser. This run used it the
way an agent would, and the first call failed.

The tool was the dog grooming profit calculator. `describe_tool` showed a
`DEFAULTS` object of ten numbers (card fee, booth rent, commission) and a list
of eight exported functions. The obvious first call, `compute` with those
defaults, came back with `no exported function "compute"; try: describe`. The
real entry point is `analyze(services, opts)`, and the `DEFAULTS` are its
*options*: the services come from pasted text through `parseServices`, and the
module ships a sample of that text in `sampleServices()`. All of that was in
the description. None of it said which call to make.

## What changed

`describe_tool` now returns an `example`: a call, or a parse step and then a
call, that the server has just run on what the tool itself ships and that gave
a result. It tries, in order:

1. the module's `DEFAULTS` as the input of an entry-shaped function
   (`compute`, `analyze`, `calculateBid`, `contributionLimitOutcome`, ...);
2. a shipped sample (`sample*()`, `example*()`, a `SAMPLE*` constant) as the
   first argument, with `DEFAULTS` after it as options when needed;
3. sample text through a `parse*` function, then the entry function on the
   parsed rows (or on the array inside a `{ rows, warnings }` wrapper);
4. with no `DEFAULTS` and no sample, an empty object, but only when the answer
   has a non-zero number in it; an all-zero result shows the shape and
   teaches nothing.

A call counts only if it does not throw, returns something, holds no `NaN`
anywhere in the result and does not say `ok: false`. `Infinity` is allowed: the
grape grower calculator answers "never breaks even at these figures" that way
on purpose. The search runs in a child process with an eight-second timeout,
so an engine that loops cannot hang the server, and it runs on every
`describe`, so the example cannot go stale.

Two smaller fixes rode along. A wrong function name now lists the real ones
(`it exports analyze, money, money2, parseServices, ...`), which saves the round
trip. And every URL the server handed out pointed at the old GitHub Pages
address, which since 2026-10-29 serves only redirect stubs; an agent that
fetched it got a stub. The server now reads the origin from the site build
(`https://marisstella.app/`), and a test pins the two together.

## How many tools get one

`node platform/agents/example_coverage.mjs` asks every tool. On this run:

| Kind of example | Tools |
| --- | ---: |
| shipped sample as `args` | 336 |
| `input: {}` (DEFAULTS, or the function's own defaults) | 294 |
| sample string as `text` | 107 |
| parse step, then the entry function | 32 |
| none found | 581 |
| **with an example** | **769 of 1,350 (57.0%)** |

The first version, with only steps 1 and 2 and a narrower list of entry
names, found 355 (26.3%). An earlier draft of step 4 accepted any answer on an
empty object and reached 876; requiring a non-zero number dropped 155 of
those, which is the honest number.

The 581 without one are not broken. Most need a real input with no sample in
the module (an nginx config, a podcast feed, a set of league teams), or name
their entry point in a way no pattern should guess. For those an agent still
reads the doc comments, as before.

## What next

The cheapest gain is in the tools themselves: a `SAMPLE` constant or a
`sample()` function next to an engine that takes pasted text makes the tool
callable by an agent on its first try, and the page can use the same sample
for its "load example" button. `example_coverage.mjs --list null` names the
candidates.

Results from these tools are estimates from the inputs given, not legal, tax,
financial or professional advice.
