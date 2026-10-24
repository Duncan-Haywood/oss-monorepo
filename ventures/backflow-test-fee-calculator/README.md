# Backflow Test Fee Calculator

A free browser calculator for licensed backflow-preventer testers quoting a
property visit with one or more devices (RPZ, double-check, PVB): a
per-device test fee, a multi-device discount applied to every device after
the first on the same visit, a per-device municipal report-filing fee, a
one-time travel fee, and a retest fee for devices that fail. Entirely
client-side; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/backflow-test-fee-calculator/

After using this, you can now **turn a list of devices on one property
visit into a correct, itemized job quote in seconds — with the multi-device
discount, the per-device filing fee, and any retest fee applied correctly —
which used to take a spreadsheet formula rebuilt (and re-checked) for every
job.**

## Why this exists

Annual (or biennial, by water utility) backflow-preventer testing is legally
required almost everywhere in the US for commercial, multi-unit, and
irrigation water services, and it is rarely one device per visit — a strip
mall or apartment complex can easily have half a dozen assemblies on one
trip. Pricing that job correctly means: full price for the first device
(it carries the trip's travel and setup cost), a reduced fee for every
device after it, a report-filing fee *per device* regardless of the
discount (because most water utilities require a separate submitted report
for each assembly, passed or failed), and a retest fee for whatever failed.
Getting the discount or the filing fee wrong on one row is easy to miss
under a truck-bed clipboard and easy to catch with a calculator that shows
every line.

## Try it

Open [`index.html`](index.html). Add a row for each device on the property
visit with its test fee and device type, set your discount/travel/filing/
retest fee schedule, and click **Calculate quote**.

## What it calculates

In [`calc.mjs`](calc.mjs), as pure functions with no dependencies:

- **`computeJobQuote`** — per-device breakdown: the first device at full
  price, every device after it discounted by the configured percentage, a
  report-filing fee added to every device regardless of the discount, a
  retest fee for devices marked failed, a one-time travel fee, and the
  grand total plus the average fee per device.
- **`formatQuoteBreakdown`** — renders a quote result as the plain-text
  breakdown a tester can paste into an invoice or a work order: every
  device, its fees, the subtotals, and the total.

## Copy the breakdown

Next to the job quote, **Copy breakdown** puts the full itemized total on
the clipboard as plain text. Three deliberate choices, the same ones
`overtime-pay-calculator`'s breakdown copy and
`security-deposit-return-calculator`'s statement copy make:

- **The jurisdiction caveat travels with the text**, because the breakdown's
  whole purpose is to leave the tool.
- **It is served from the last calculated result**, never recomputed from
  the live inputs on click — editing a row without pressing Calculate must
  not hand out a total the screen is no longer showing.
- **A blocked clipboard is not a dead end** — a failure reveals a read-only
  textarea with the breakdown selected.

## Disclaimers

This calculator only totals the fee schedule you enter against the devices
you list. It does not test anything and does not determine whether a device
passed or failed, and it does not know your water utility's required report
form, filing deadline, or device-type requirements — those vary by state and
by utility. This is not legal, engineering, or regulatory advice; confirm
your utility's own cross-connection control requirements before invoicing or
filing.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. The numbers you enter are **never
uploaded** — there is no server component at all. Anonymous feature events
(`quote_calculated`, `breakdown_copied`, `example_loaded`) are counted in
`localStorage` only, never transmitted. Do Not Track and Global Privacy
Control are honoured, and a button on the page turns counting off entirely.

## Development

```sh
node --test calc.test.mjs usage.test.mjs page.test.mjs content-pages.test.mjs how-to-price-a-multi-device-backflow-test-visit.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The calculator and its
test suites are done; no external user contact has happened yet — see
`kill_criteria` in `VENTURE.yaml`.
