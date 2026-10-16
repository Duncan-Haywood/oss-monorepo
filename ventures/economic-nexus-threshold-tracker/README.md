# Economic Nexus Threshold Tracker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/economic-nexus-threshold-tracker/>

A free browser tracker for online and multi-channel sellers: enter
trailing-12-month gross sales (and, for the states that need it, a
transaction count) into each US state, and see which states' economic-nexus
sales-tax-registration thresholds you've crossed, per state, against each
state's own published figure.

Open `index.html` in a browser. The calculation is local and works without
an account, network request, or API key. It is arithmetic against the
published threshold table below, not a live lookup — enter what you've
sold into a state and verify the result against that state's own
department-of-revenue guidance.

After using this, you can now see exactly which states you've crossed a
sales-tax registration threshold in and which you haven't, per state,
which used to mean cross-referencing fifty-one separate sets of figures by
hand.

## Why this exists

Since *South Dakota v. Wayfair* (2018), every state that levies a general
sales tax can require an out-of-state seller to register and collect its
tax once sales into that state cross a threshold the state sets for
itself — no physical presence required. There is no single national
figure:

- **41 states + DC** use $100,000 in gross sales.
- **California, New York, and Texas** set $500,000.
- **Alabama and Mississippi** set $250,000.
- About a third of taxing states still pair the revenue figure with a
  **200-transaction test** (New York uses 100); most of those apply it as
  an OR (either figure alone is enough) — Connecticut and New York
  currently require both together (AND).
- **Alaska, Delaware, Montana, New Hampshire, and Oregon** levy no general
  statewide sales tax, so no threshold applies there.

Existing paid platforms (Avalara, TaxJar, and others) monitor this
continuously by connecting to your sales channels and charge an ongoing
subscription for it — useful once you're registered in several states and
filing returns on a recurring schedule. This tool answers the narrower,
free, one-time-or-periodic question: *where do I stand today?*

## What this does not cover

- It is not an independent fifty-state statute review. Figures are
  compiled from secondary sources (state department-of-revenue guidance as
  aggregated by third-party nexus-tracking publishers), current as of
  2026-09-24 — verify the exact figure and its exact wording with the
  state's own department of revenue, especially if you are close to a
  line.
- It does not model each state's exact measurement-period rule (current
  vs. previous calendar year, or a rolling 12-month window) — it asks for
  a trailing-12-month figure as the safest common input.
- It does not know whether your sales were marketplace-facilitated, or
  what a state's marketplace-facilitator rule does with that distinction.
- It does not calculate what you would owe, register you anywhere, or file
  anything on your behalf. Crossing a threshold is the start of a
  registration and filing question, not the end of one.

See the [state-by-state explainer](why-does-economic-nexus-differ-by-state.html)
for why the figures vary so much, or the
[comparison with paid nexus-monitoring software](vs-paid-nexus-monitoring-software.html)
for when an ongoing paid platform is worth it instead.

## No warranty

This tool is free and as-is. It is not legal, tax, or financial advice and
does not replace a qualified tax preparer or the state's own guidance. You
are responsible for reviewing and verifying its output before relying on
it. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.
