# Revenue scenarios: what the catalogue could earn at measured traffic

The companion to [`README.md`](README.md) and [`models.yaml`](models.yaml).
`models.yaml` holds one business model per product: competitor list prices,
the first paid offer, and its stage. This file and
[`evaluations.json`](evaluations.json) do the arithmetic across the whole
catalogue. They put every one of the 15 categories and 10 flagships into
three year-one scenarios driven by the measured traffic, so a run can see
what each mechanism is worth and which owner decision unlocks it. Both files
started on 2026-11-02 in parallel sessions (PR #12487 and PR #12488). Where
they disagree, the section "Where this file and models.yaml disagree" below
says so.


```bash
node portfolio/monetization/evaluate.mjs           # scenario table (markdown)
node portfolio/monetization/evaluate.mjs --check   # every category and flagship evaluated, every number has a basis
node portfolio/monetization/evaluate.mjs --queue   # what to evaluate next
node portfolio/monetization/evaluate.mjs --json
node --test portfolio/monetization/evaluate.test.mjs
```

Agents write the judgment: buyer, willingness to pay, mechanisms, price, GTM
steps and risks. It lives in [`evaluations.json`](evaluations.json), one
entry per catalogue category (all 15, from `categoryFor` in
`platform/pages/build.mjs`) and one per flagship (all 10, from
`portfolio/flagships.yaml`), plus `local-site-studio`. The script does the
routine part. It reads measured traffic from
`portfolio/usage/site-visits.json`, maps all 1,325 ventures to their
categories, applies the merchant-of-record fee and computes three year-one
scenarios:

| Scenario | Traffic | Mechanisms counted |
|---|---|---|
| **Now** | measured | only those that need no owner action (`gate: none`) |
| **Rail on** | measured | adds those gated on the payout rail or the Sponsors decision |
| **Target** | the entry's 12-month goal | all of them, including owner partnerships and flat-priced services |

The fee is 5% + 50¢ per sale, the free tier of Polar, Lemon Squeezy and
Paddle as read on 2026-10-31
([`docs/reports/2026-10-31-payout-rail-next-steps.md`](../../docs/reports/2026-10-31-payout-rail-next-steps.md)).
Donations are counted with no fee.

## What the numbers rest on, and what they don't

- **Measured:** traffic, and only traffic. The first-party counter covers
  2026-10-24 to 2026-11-02 at this writing, about **285 human page loads per
  30 days across the whole site** (the script rereads it on every run). Most of those are on `/about`, `/ask` and category hubs,
  so most ventures show zero. Cloudflare saw about a thousand times more
  requests on 2026-10-30, mostly crawlers (`portfolio/usage/README.md`).
  Page loads are not people, so this overstates visitors.
- **Assumed:** every conversion rate and every price. The prices are the
  portfolio's own proposals, not market readings. The conversions are 0.1% to
  0.6% of page loads. That is deliberately below the 2% that
  `free-listing-economics/` assumed and itself called its weakest input.
  `listing-monetization/` measured that only 7.5% of top-decile developer
  listings have any commercial mechanism at all. `--check` refuses a
  conversion above 20% and any mechanism without a stated `basis`.
- **Goals, not forecasts:** the traffic targets. Summed over the categories
  they come to about 23,600 loads a month, **about 80 times today**. Revenue
  is linear in traffic × conversion, so halve either and the target column
  halves.

## Findings (2026-11-02)

1. **Today's earning is $0, and that is structural.** No mechanism that needs
   no owner action brings in money. The Sponsors links on every page lead to
   a profile that nothing in the repo records as accepting money (decision
   `funding-sponsors-live`). The payout rail the owner chose on 2026-10-31
   still needs the owner's account and the `goals.md` amendment. This agrees
   with `portfolio/ledger/break-even.md`.
2. **Turning on the rail does almost nothing at today's traffic.** With the
   rail on and traffic as measured, the year comes to **about $80**.
   Distribution is the constraint, not the product count (1,325) or the
   payment code.
3. **If the 12-month traffic goals are hit, the model says about $30k a year
   from the categories** (with the conversion caveats above). Over half of it
   comes from four places:

   | Rank | Where | Target-scenario year one | Mechanism | Caveat |
   |---:|---|---:|---|---|
   | 1 | `ai-bookkeeper` | ~$10k | annual Pro licence, key checked offline ($59) | highest liability; no charge before real-book measurements (models.yaml parks it) |
   | 2 | `wall-framing-takeoff` | ~$7k | Pro licence (branded bid package) plus lumberyard quote referral | models.yaml's first paid product; referral needs an owner-signed partner |
   | 3 | `einvoice-preflight` | ~$7k | annual self-hosted licence for the CI/API validator ($290) | checks are a commodity (~$4 per 1,000 documents; free official validators), so conversion is set low |
   | 4 | `self-hosted` apps (34) | ~$7k | deploy pack plus paid setup | setup is owner time |

   The flagship rows overlap their categories, so the two are not added.
4. **About 1,100 of the 1,325 tools are funnels, not products.** The trades,
   services, back-office, solo-earner, marketplace and food-service
   calculators each make cents to low hundreds of dollars a year on their own.
   They are worth something only if each one links to the product that has
   the paid tier: ai-bookkeeper, shift-roster-builder or wall-framing-takeoff.
   The one shared feature worth building across the trades tools is a
   "turn this estimate into a branded proposal" step, priced annually.
5. **The CI checks (178) are distribution, not revenue.** Combine them into
   one GitHub Action and use it for developer reach and credibility. Free
   competitors from funded companies cap what can be charged.
6. **Every mechanism above the "rail on" line needs the owner.** The payout
   rail (account and amendment), the Sponsors decision, affiliate programmes,
   supplier partnerships, publishing on GitHub Marketplace, awesome-selfhosted
   or template galleries under the public name, and any grant applications.
   These are already the owner-only rows in `decision_queue.py`. This file
   ranks them by what they unlock: **payout rail > publication identity >
   one supplier partnership.**

## GTM plan, in order

What agents can do now, without the owner:

1. Link every funnel tool to its paid product. Back-office, solo-earner,
   services and marketplace go to ai-bookkeeper; food-service goes to
   shift-roster-builder; new-construction trades go to wall-framing-takeoff.
   Count the clicks.
2. Build the paid tiers as offline licence keys (billing plan Option A,
   `docs/reports/2026-10-30-billing-plan.md`), off by default. Start with
   ai-bookkeeper Pro and the einvoice-preflight commercial licence. Each needs
   a measured accuracy claim first: real books for ai-bookkeeper, real
   invoices' false-positive rate for einvoice-preflight.
3. Write fair comparison pages for the self-hosted apps ("open-source
   alternative to …", with the competitor's public price and the
   not-affiliated line), and one dated deadline page per mandate. Both match
   searches that already happen.
4. Combine the CI checks into one action with SARIF output.

What needs the owner, in order of value:

5. Payout rail: approve the amendment and open the Polar (or fallback)
   account.
6. Publication identity: GitHub Marketplace, awesome-selfhosted, template
   galleries.
7. One partnership: a lumberyard or panel shop for wall-framing-takeoff, or a
   bookkeeper willing to try ai-bookkeeper on a client file with permission.

## Where this file and models.yaml disagree

- **Affiliate links.** README.md option 6 recommends against them. This file
  keeps them as `owner-partner` mechanisms so the scenario shows what
  declining them costs: a few hundred dollars a year at target traffic across
  the back-office, services, marketplace, UK-tax and solo-earner categories.
  The recommendation stands.
- **einvoice-preflight.** This file first ranked it highest, at a 0.3%
  conversion. models.yaml's comparables show validation is a commodity, so
  the conversion is now 0.1% and the README treats it as an owner question
  (paid priority on the next country rule).
- **Self-hosted apps.** models.yaml has no row for them. They are the
  category with the best per-visitor value here (buyers already pay SaaS fees
  for the same jobs), so a row for the stack belongs there.

## Keeping it current

- A product's business model, competitor prices and stage go in
  `models.yaml`. This file's entries carry the traffic goal, conversion
  assumptions and GTM steps that turn those into numbers.
- When a run ships a paid tier, a funnel link or a GTM step, update that
  entry's `mechanisms` or `gtm` and its `evaluated` date in the same PR.
- When the counter has more days, rerun the script. The "now" and "rail on"
  columns update by themselves.
- When something is **measured** (a real conversion, a real price someone
  paid, a real partner's referral fee), replace the assumption and say
  "measured" in `basis`. That matters more than anything else in this file.
- `--queue` lists ventures without their own entry: flagships first, then
  any venture with measured visits, then the self-hosted apps. Evaluate a
  venture separately only when it differs from its category's entry.
