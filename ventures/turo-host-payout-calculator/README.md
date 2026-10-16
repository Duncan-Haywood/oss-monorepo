# Turo Host Payout Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/turo-host-payout-calculator/>

A free calculator that turns one Turo trip's price into a host's actual
payout under Turo's 2026 earnings-plan structure — a **plan x booking-window
matrix**, not a single flat percentage. Compares the same trip across all
three earnings plans (Peace of Mind, Balanced, More Earnings) and all four
booking windows (0-2, 3-13, 14-27, 28+ days ahead), and projects a
monthly/annual estimate from a stated trip frequency. Entirely client-side;
nothing is uploaded.

After using this, you can now **see the exact dollar payout Turo's plan and
booking-window choice cost or earned you on a specific trip**, which used to
mean reading Turo's own host-share tables and doing the percentage math by
hand for every quote.

## Why this exists

"How much does Turo actually take?" no longer has a one-number answer. Turo
restructured US host earnings around March 2026 into three named earnings
plans, and within each plan the host share also depends on how far ahead of
the trip the guest booked — a trip booked last-minute pays a meaningfully
lower share than the identical trip booked a month out, under every plan,
and the share locks in at booking time. Every existing "Turo fee calculator"
this portfolio's screening pass could find assumes the old single-percentage
model. This tool models the actual matrix, so a host can see the real dollar
trade-off between plans (host share vs. damage-responsibility cap) and the
real dollar value of booking timing, instead of reasoning from a single
remembered percentage.

## Try it

Open [`index.html`](index.html), enter a trip price, pick your plan and
booking window, and click **Calculate my payout**.

## What it calculates

All in [`calc.mjs`](calc.mjs), pure functions with no dependencies:

- **`computeTripPayout`** — one trip's split-eligible amount (trip price plus
  any extra-mileage, late-return, and additional-usage fees — all three are
  split at the host share, not just the headline trip price), the host share
  for the chosen plan/booking-window cell, the host's payout, Turo's cut, and
  a per-day figure.
- **`comparePlans`** — the same trip and booking window, priced under all
  three earnings plans, with each plan's damage-responsibility cap alongside
  the payout so the trade-off is visible, not just the percentage.
- **`compareBookingWindows`** — the same trip and plan, priced across all
  four booking windows, so the dollar value of booking timing is explicit.
- **`estimateMonthly`** — a deliberately simple linear projection (this
  trip's payout times a stated trip count), not a booked-calendar forecast.

The host-share matrix:

| Plan (damage-responsibility cap) | 0-2 days | 3-13 days | 14-27 days | 28+ days |
|---|---|---|---|---|
| Peace of Mind ($250) | 65% | 70% | 75% | 80% |
| Balanced ($1,500) | 75% | 80% | 85% | 90% |
| More Earnings ($2,750) | 85% | 90% | 95% | 100% |

Every number is a commonly cited default exposed as an adjustable input, not
a fixed standard — Turo has changed this exact structure more than once
within 2026 alone, so the output is a starting point to check against your
own Turo Host Hub, **never a guarantee of what you will actually be paid.**

## Disclaimers

Not affiliated with, endorsed by, or sponsored by Turo. This is not
financial or business advice, and it is not a guarantee of your actual
payout — verify current rates in your own Turo Host Hub before relying on
this, the same as any free, best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy

Everything runs in your browser. The numbers you enter are **never
uploaded** — there is no server component at all. Anonymous feature events
(`payout-calculated`, `example-loaded`) are counted in `localStorage` only,
never transmitted, never tied to your identity. Do Not Track and Global
Privacy Control are honoured, and a button on the page turns counting off
entirely.

## Development

```sh
node --test calc.test.mjs usage.test.mjs page.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The payout, plan, and
booking-window logic and its test suite are done; no external user contact
has happened yet — see `kill_criteria` in `VENTURE.yaml`.
