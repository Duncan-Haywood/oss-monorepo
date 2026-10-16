# Substack Subscriber Export Analyzer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/substack-subscriber-export-analyzer/>

A free browser tool for Substack writers: **drop in your subscribers export CSV and see
how many readers pay, how long they stay and what is coming due.** The file is read in
the browser; nothing is uploaded and no Substack login is needed.

After using this, you can now **see paid, free, comp and former subscriber counts,
free-to-paid conversion, paid churn and retention at 1, 3, 6 and 12 months, monthly
revenue by plan, annual and founding renewals due in 30, 60 and 90 days, time from
signup to first payment, growth by month, the engaged free readers most likely to
upgrade, and an estimate of the fees and your net**, which used to mean building pivot
tables from the export by hand.

## Input

A subscribers export CSV with an `email` column and at least one of `created_at`,
`active_subscription` or `plan`. `first_payment_at`, `expiry`, `email_disabled` and
`activity_rating` are used when present. **Column names are matched by alias from memory
of Substack exports; no real export was available.** The export carries no prices, so
revenue uses the monthly, annual and founding prices typed on the page. Emails are read
only to drop empty rows and are not kept.

## Model

A subscriber who has paid and is still active is paid; one who paid and is no longer
active is former; comp and gift subscriptions are counted but never as revenue or in
conversion. Revenue is subscribers per plan times the typed price (yearly and founding
divided by 12). Retention counts only subscribers who first paid long enough ago to be
measured; groups under five are not used for suggestions. Fees are editable assumptions
(default 10% platform, 2.9% + $0.30 processing per charge). See the page for what is not
modelled.

## Run

Open `index.html` through any static server. Tests: `node --test`.
