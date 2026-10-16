# Wash and Fold Price Per Pound Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/wash-and-fold-price-calculator/>

Laundromat owners and laundry pickup-and-delivery operators can use this free,
browser-local calculator to find what a pound of wash-dry-fold actually costs
them — labour minutes, wash and dry cycles, supplies, delivery stops and an
overhead share — and then read the break-even price per pound and the margin at
what they charge today. **After using this, you can set a per-pound price and a
minimum charge you can defend from your own numbers, which used to mean copying
the price off a competitor's sign and hoping.**

Open `index.html` directly, or serve this directory with
`python3 -m http.server`. The calculation is deterministic and works with no
account, API key, upload, or paid dependency.

## Why a per-pound price is harder than it looks

A flat "$1.75 a pound" hides two things that decide whether the service makes
money, and both are modelled here:

- **Machine cost is stepwise, not per-pound.** A 22 lb order on 20 lb washers
  runs two washers, and the second one costs a full cycle whether it is full or
  a tenth full. Averaging a cycle across a pound smooths away exactly the loss
  that shows up on small orders.
- **Much of the cost is per *order*, not per pound.** Intake, tagging, staging,
  bagging and checkout take the same minutes on a 10 lb order as on a 30 lb
  one, and a pickup plus a delivery is two stops either way. Spread over ten
  pounds instead of thirty, those costs are three times as heavy per pound —
  which is the arithmetic a minimum charge exists to cover, and the calculator
  costs the smallest order you accept separately to check that it does.

The tool reports cost per order and per pound broken into labour, machine
cycles, supplies, delivery and overhead; the break-even price per pound; the
price that hits your target margin; the margin at your current price; and the
monthly volume a profit goal needs. Findings call out a price below cost, a
minimum charge that does not cover the smallest order, delivery that costs more
than the washing, and a typical order that runs a mostly empty second machine.

## What it does not do

It does not know your water, sewer, gas or electricity tariff, your local wage
rules, your machines' real consumption, or what customers in your town will
pay. Every rate is a number you read off your own bills, payroll and equipment
specifications. The output is the cost floor underneath your pricing decision,
not a recommended price and not a market study.

## Privacy and usage

Everything runs in your browser. Your wages, utility rates, volumes and prices
are never uploaded, and there are no accounts, cookies, or analytics vendors.
Pressing *Save my numbers on this device* writes them to this browser's own
local storage on this device only; *Forget my numbers* deletes them. *Copy
shareable link* puts the same numbers in the page's own URL fragment instead —
your browser never sends a fragment to a server, so a shared scenario stays
off every machine it passes through on the way to the recipient. We count
anonymous local feature events only (`estimate`, `example_loaded`,
`inputs_saved`, `link_copied`), with a visible opt-out that persists across
visits. Do Not Track and Global Privacy Control disable counting
automatically. No people, rates, or customer details are recorded, and the
counter is never transmitted to the maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not tax, financial, or business advice, and it
does not replace a qualified professional. **You are responsible for reviewing
and verifying its output before relying on it**, and for meeting any obligation
it helps you prepare for. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be
slow, broken, moved, or taken offline without notice. We do not promise uptime,
backups of anything you type, or that a URL will keep working. Do not use this
as a system of record. If a tool needs to survive, export your inputs and run it
yourself.

This calculator produces arithmetic observations from numbers you supply. It
does not determine what your service is worth in your market, does not read your
utility bills, and does not assess whether any wage, employment, or
environmental rule applies to your operation.

MIT licensed. See `LICENSE`. If it helped, [GitHub
Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and never
changes what the tool does.

## Tests

```
node --test ventures/wash-and-fold-price-calculator/*.test.mjs
```

`calculator.test.mjs` covers the cost arithmetic and every finding;
`page.test.mjs` covers the disclaimers, the privacy copy, the SEO markup, the
labelled inputs, the sibling link, and that the page's shipped defaults and its
example button agree with each other; `usage.test.mjs` covers the local counter,
its opt-out, and the Do Not Track / Global Privacy Control signals;
`share.test.mjs` covers the shareable-link encode/decode round trip, including
that its field list always matches `calculator.mjs`'s `INPUT_FIELDS`.
