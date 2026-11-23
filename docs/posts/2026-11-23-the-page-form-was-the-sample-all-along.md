---
title: "The page form was the sample all along: 107 more tools give agents a first call"
date: 2026-11-23
tags: [agents, mcp, open-source, tooling]
seo_title: "Reading a calculator's own form to give AI agents a working first call"
description: "The tools server now builds a first call from each tool's page form when the engine ships no sample: 107 more tools, 797 to 904 of 1,416, every one rerun."
---

The repository's MCP server (`platform/agents/tools.mjs`) lets an AI agent
find one of about 1,400 calculators, see how to call it and run its engine
without a browser. Since 2026-11-15, `describe_tool` also returns an
`example`, a call it has just run on what the tool ships: its `DEFAULTS`, a
`sample()` function, a `SAMPLE` string
([that post](2026-11-15-a-first-call-that-works-for-agents.md)). That covered
797 of 1,416 tools at the start of this run. The other 619 shipped nothing to
try, so an agent had to read the doc comments and guess at the inputs.

## The sample was on the page

Many of those 619 tools have a filled-in form on their page. The
seller net sheet has a sale price box that already reads 425000. The LTL
freight class estimator shows a 48 × 40 × 36 inch pallet at 500 lb. The
drone mapping calculator puts a 17.3 mm sensor and a 12.29 mm lens in its
boxes. Where a box is empty, its placeholder often holds the example: "e.g.
3400". Those are the tool's own example inputs. They sat in `index.html`,
where no step of the example search looked.

So there is now a fifth step, run only when the other four found nothing. It
reads the page's form:

- `value=` on a box, the `selected` option of a list, a checked or unchecked
  box, the checked radio button;
- a number placeholder, but only when the placeholder *is* an example value
  ("e.g. $85,000", "12%", "e.g. 40 hours").

It turns box ids into parameter names (`interest-paid` becomes
`interestPaid`) and matches them to what the entry function reads: the keys
of a destructured `({ price, qty = 1 })`, or the `o.price` properties a plain
`(o)` reads. A call counts only if at least two values matched, it ran, and
its answer has a non-zero number in it. Where two entry functions both run,
the one that took more of the form wins, and step-named helpers (`validate`,
`check`) go last.

## The bug the first draft had

The first draft took the first number in any placeholder. On the SaaS
efficiency calculator the net new ARR box says "blank = revenue change x 4",
and the draft read that as a net new ARR of $4, which gave a burn multiple of
225,000. The call ran and the answer was non-zero, so every check passed,
and the example would have taught an agent nonsense. Placeholders now have
to be the value itself, with an optional "e.g." in front and a short unit
after. That hint now gives no value, and a test pins it.

## How many

| Kind of example | Before | After |
| --- | ---: | ---: |
| shipped sample as `args` | 349 | 349 |
| `input: {}` (DEFAULTS, or the function's own defaults) | 307 | 307 |
| sample string as `text` | 107 | 107 |
| parse step, then the entry function | 34 | 34 |
| **from the page form** | 0 | **107** |
| none found | 619 | 512 |
| **with an example** | **797 (56.3%)** | **904 (63.8%)** |

No tool that had an example before got a different one: the form step only
runs when everything else came back empty. All 107 new examples were run a
second time through `call()`, the same path `call_tool` uses, and all 107
gave a usable result. About half are trade bid calculators (septic
pumping, gutter guards, sunroom framing), fee calculators for resale
marketplaces, and small-business pricing tools: the tools whose pages lead
with a form and whose engines take one flat object.

`node platform/agents/example_coverage.mjs` gives these counts on any clone,
and `--list form` names the 107.

## What it does not do

It does not invent values. A box with neither a value nor an example
placeholder is left out, and the function's own defaults apply. The example
it returns is marked `from: "page form"`, and its note tells the agent to
read the doc comments for inputs the form names differently. The auto loan
interest deduction calculator shows the limit: its page fills the income and
interest boxes, but its eight eligibility boxes start unchecked, so the
answer is a $0 deduction. That is correct for that input, but an agent learns
nothing from it, so the tool still gets no example.

## What next

The 512 left mostly take pasted text (a config file, a CSV export, a feed)
or a list of rows, which a form cannot describe. For those the cheapest gain
is still a `SAMPLE` constant in the engine, which the page's "load example"
button can use too.

Results from these tools are estimates from the inputs given, not legal, tax,
financial or professional advice.
