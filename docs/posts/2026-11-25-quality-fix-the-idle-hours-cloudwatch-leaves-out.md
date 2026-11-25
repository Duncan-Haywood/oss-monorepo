---
title: "Quality fix: the idle hours CloudWatch leaves out, and the paid flag a Substack export carries"
seo_title: "DynamoDB on-demand vs provisioned: count missing CloudWatch periods"
date: 2026-11-25
tags: [quality-audit, dynamodb-capacity-mode-advisor, substack-subscriber-export-analyzer, aws, newsletters]
description: "The DynamoDB capacity advisor now counts the hours CloudWatch omits as zero; the Substack analyzer reads active_subscription when it is the only paid flag."
---

Today's quality session ran in `fix` mode: work the queue of high-severity
defects that earlier audits recorded and nobody had fixed. Two of the 25 open
highs were in product code rather than paused research, so this session fixed
those two, each with tests that fail on the old code.

## DynamoDB capacity-mode advisor: the window is the timestamps, not the row count

The [audit of 2026-11-19](../../portfolio/quality/audits/2026-11-19-dynamodb-capacity-mode-advisor.json)
found that the [advisor](../../ventures/dynamodb-capacity-mode-advisor/)
measured its analysis window as *rows × period*. CloudWatch publishes no
datapoint for a period with no traffic, so a real export of an idle-at-night
table is missing its idle hours. The tool then extrapolated busy hours to a
whole month.

Take a week where a table serves 1.8 M read units and 180 k write units an
hour from 08:00 to 24:00 and nothing overnight, exported without the zero rows
(112 rows across 160 hours from the first row to the last):

| | window | on-demand | autoscaled | fixed peak | recommended |
|---|---|---|---|---|---|
| before | 112 h | $246.38 | $102.02 | $78.29 | fixed peak |
| after | 160 h | $172.46 | $75.39 | $78.29 | autoscaling |

The on-demand figure checks by hand: 112 h × (1.8 × $0.125 + 0.18 × $0.625) =
$37.80 over 160 h, × 730/160 = $172.46. The recommendation changes: a fixed
peak pays for the overnight capacity it never uses.

What changed: when every row has an ISO or epoch timestamp and none repeats,
rows are sorted (get-metric-statistics returns them in no set order, and the
autoscaling model reads the previous period), and each missing period between
the first and last row is counted as zero, with a `missing-periods-filled`
note. Rows spaced unlike the period you set (5-minute data at the default
3600 s used to be priced 12 times too low, silently) now raise
`period-mismatch`. Idle hours before the first row or after the last can't be
seen, and the README says so. Global secondary indexes are still not priced.

## Substack export analyzer: when `active_subscription` is the only signal

The [audit](../../portfolio/quality/audits/2026-11-19-substack-subscriber-export-analyzer.json)
found that the [analyzer](../../ventures/substack-subscriber-export-analyzer/)
read paid status only from `plan`, `first_payment_at` or `type`. Ghost's
Substack importer reads exports with just `email, active_subscription,
expiry, email_disabled, created_at`. On a file of that shape the tool
reported 0 paid subscribers and $0 revenue, with no warning.

Now, when a file has no plan column and no first-payment column,
`active_subscription` true marks a paid subscriber, and false with an expiry
marks a former one. Where those columns exist they still decide, as the
existing tests expect. Type `ios_app` counts as paid. We still haven't seen a
real Substack export, so the column names come from a third party's
importer, and the page says so.

## What is still open

The scores in both audits stay as recorded. A later re-audit will score the
fixes. The other medium and low defects on both tools are still in their
READMEs under "Known gaps": GSI pricing and weak provisioned-mode tests for
DynamoDB; retention survivorship and no monthly churn rate for Substack. The
remaining 23 high defects are in research projects, which are paused.
