# Commissary Kitchen Cost Split Calculator

Free browser-local calculator for commissary/shared-kitchen operators, or a
lead tenant coordinating with others, to split pooled monthly kitchen costs
(rent, utilities, trash, cleaning, pest control, insurance, etc.) fairly
among several food-truck/mobile-vendor tenants — by hours booked, storage
units used, a weighted blend of the two, or an equal split — instead of
splitting evenly regardless of usage or negotiating it by eye every month.
Each tenant can also carry a flat monthly base/access fee, charged before the
proportional split. Produces a clean, itemized per-tenant bill.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/commissary-kitchen-cost-split-calculator/

Open `index.html` directly, or serve this directory with
`python3 -m http.server`. See
[`vs-splitting-evenly.html`](vs-splitting-evenly.html) for the comparison
against an even split, or
[`how-to-split-shared-kitchen-costs-fairly.html`](how-to-split-shared-kitchen-costs-fairly.html)
for the worked numbers on why an even split overcharges a light tenant and
undercharges a heavy one. Run the tests with:

```
node --test ventures/commissary-kitchen-cost-split-calculator/*.test.mjs
```

## Why usage-based, not an even split

A commissary kitchen bills one pooled total every month, but the tenants
booking it rarely use it evenly — one truck books 40 hours and fills a
walk-in shelf, another stops in for 5 hours to prep. An even split charges
the light user for the heavy user's share every month; splitting by hours
booked and/or storage units used charges each tenant closer to what their
own footprint actually costs. All money is tracked in integer cents
internally (see `calc.mjs`'s largest-remainder allocation), so the per-tenant
totals always sum exactly to the pool total — no fraction of a cent is ever
left unaccounted for.

## Privacy and usage

Everything runs in your browser. Your costs, tenant names, hours, storage
counts, and fees are never uploaded, there is no account, and nothing leaves
the page. We count anonymous local feature events only (`split_calculated`,
`breakdown_copied`, `reset`, `sponsor_link_clicked`), with a visible opt-out.
Do Not Track and Global Privacy Control disable counting automatically. No
costs, tenant names, or amounts are ever recorded, and the counter is not
sent to the maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, or financial advice, and
it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for any
agreement between the commissary operator and its tenants. To the maximum
extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.

This tool performs arithmetic on the costs, hours, and storage figures you
enter. It does not draft, review, or enforce a shared-kitchen or tenant
agreement.

MIT licensed. See `LICENSE`.
