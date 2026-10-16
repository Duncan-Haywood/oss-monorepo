# Depreciation Recapture Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/depreciation-recapture-calculator/>

A free calculator for a landlord or real-estate investor selling a rental or
investment property. It splits the taxable gain into **unrecaptured Section
1250 gain** (depreciation recapture, taxed at your ordinary rate, capped at
25%) and the remainder (taxed at your regular long-term capital-gains rate),
optionally adds the 3.8% Net Investment Income Tax, and estimates the tax on
a partial or full 1031 like-kind exchange's "boot" — so the amount an
exchange would actually defer is not a guess. Entirely client-side; nothing
is uploaded.

After using this, you can now **see the real tax split before you sell**,
instead of budgeting only for capital-gains tax on price-minus-cost and
being surprised by a recapture bill that can run into five figures on a
property held for years.

## Why this exists

Depreciation is not free — it is a loan from the IRS. Every dollar of
depreciation claimed while renting the property lowers its cost basis,
which raises the taxable gain by the same amount at sale. IRC Section 1250
then taxes that portion of the gain at the seller's **ordinary** income tax
rate, capped at 25% — not at the usually-lower long-term capital-gains rate
a seller expects. A seller who only budgets for capital-gains tax on the
naive price-minus-cost difference is routinely surprised by a bill
thousands of dollars higher than expected.

A 1031 like-kind exchange can defer this, but only the part that stays
invested: any cash or net debt relief actually taken out of the exchange
("boot") is taxed immediately, in the same recapture-then-capital-gains
order as an outright sale. This tool computes both paths from numbers a
seller already has.

## Try it

Open [`index.html`](index.html), enter your purchase price, land value,
improvements, total depreciation claimed, and selling numbers, then click
**Calculate my tax**. Use **Copy a shareable link** to send the scenario to
a CPA or co-owner without uploading anything — the numbers travel inside
the link itself.

## What it calculates

All in [`calc.mjs`](calc.mjs), pure functions with no dependencies:

- **`analyzeSale`** — computes the adjusted basis, amount realized, and
  total gain, splits the gain into unrecaptured Section 1250 gain and the
  remainder via `splitGain`, applies the seller's chosen capital-gains rate
  and an optional simplified NIIT, and estimates the tax on a 1031
  exchange's boot using the same split. Returns dated, disclosed findings
  for every simplification the arithmetic makes (NIIT's full-inclusion
  approximation, the 25%-cap default, a sale at a loss, depreciation
  exceeding the gain, no state tax).
- **`splitGain`** — the recapture-then-remainder split shared by the
  outright-sale and 1031-boot paths: recapture is capped at the depreciation
  actually taken, and never exceeds the gain itself.
- **`recaptureRate`** — the lower of the 25% statutory cap and a seller's
  own supplied ordinary marginal rate, since Section 1250 recapture is never
  taxed above a seller's true ordinary rate.

Every output is a **planning estimate to verify with a CPA or qualified
intermediary, never a filed amount or a determination that a specific 1031
exchange qualifies** — the seller remains the filer and the
decision-maker.

## Disclaimers

This is not tax, legal, or financial advice, and it does not replace a
qualified tax professional or a qualified intermediary. State income tax is
not included. Verify its output before relying on it, the same as any free,
best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. The numbers you enter are **never
uploaded** — there is no server component at all. Anonymous feature events
(`sale_analyzed`, `example_loaded`, `link_copied`) are counted in
`localStorage` only, never transmitted, never tied to your identity. Do Not
Track and Global Privacy Control are honoured, and a button on the page
turns counting off entirely.

## Development

```sh
node --test
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The recapture/capital-
gains/NIIT arithmetic and the 1031-boot comparison are done and tested; no
external user contact has happened yet — see `kill_criteria` in
`VENTURE.yaml`.
