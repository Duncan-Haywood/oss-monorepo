# Ghost Members Export Analyzer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/ghost-members-export-analyzer/>

A free browser tool for Ghost publishers: **drop in your members export CSV and see who
pays, who never opens your email and what a cleaner list saves.** The file is read in the
browser; nothing is uploaded and no Ghost login or API key is needed.

After using this, you can now **see paid, free and complimentary counts, free-to-paid
conversion, engagement bands from open counts, the free members who look safe to remove
after a re-engagement email, an estimate of the sending and member-pricing cost that
saves, conversion and never-opened share by label, paid members by tier, growth and
removals by month, and the highly engaged free members most likely to upgrade**, which
used to mean building pivot tables from the export by hand.

## Input

A members export CSV with an `email` column and at least one of `created_at`,
`stripe_customer_id`, `email_count` or `subscribed_to_emails`. `complimentary_plan`,
`tiers`, `labels`, `email_opened_count`, `email_open_rate` and `deleted_at` are used when
present. **Column names are matched by alias from memory of Ghost exports; no real export
was available.** The export carries no prices, so money figures use the price and costs
typed on the page. Emails and names are read only to drop empty rows and are not kept.

## Model

Paid is a Stripe customer id or a named tier on a non-complimentary member; comp members
are counted but never as revenue or in conversion. Engagement is opened over sent, judged
only for members sent at least the minimum. Quiet members are free, subscribed, unopened
and old enough; paid and comp members are never listed. Savings multiply flagged members
by typed sending and plan costs. See the page for what is not modelled.

## Run

Open `index.html` through any static server. Tests: `node --test`.
