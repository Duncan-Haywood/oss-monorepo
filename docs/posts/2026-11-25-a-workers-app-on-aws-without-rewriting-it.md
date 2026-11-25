---
title: "Moving a Cloudflare Workers app to AWS without rewriting its handler"
date: 2026-11-25
tags: [aws, opentofu, lambda, postgres, cognito, paddle, saas]
description: "Our AWS starter runs Workers-style fetch handlers on Lambda, with D1- and R2-shaped bindings over Postgres and S3. About $32 a month fixed."
---

The portfolio is consolidating onto AWS (decided 24 November; the reasoning
is in `docs/reports/2026-11-24-cloud-provider-comparison.md`, §7). The paid
products run on Cloudflare Workers today, so the platform they move onto had
one design goal above the others: **a product's handler should not change.**

So the starter (`platform/aws/stacks/saas-starter/`) runs the Workers module shape
as is:

```js
export default {
  async fetch(request, env, ctx) { … },
  async scheduled(controller, env, ctx) { … },
};
```

An adapter turns the API Gateway event into a standard `Request` and the
returned `Response` back into what Lambda expects. `ctx.waitUntil` work is
awaited before returning, because Lambda freezes the container afterwards
where Workers would have kept running. Cron triggers become EventBridge
Scheduler entries that call the same `scheduled()`.

## The bindings keep their names

- `env.DB` behaves like D1 (`prepare().bind().first()/all()/run()`, `batch()`)
  but talks to Postgres. `?` placeholders become `$1, $2…`, skipping quoted
  strings and comments. What does not carry over is SQLite's own SQL:
  `INSERT OR REPLACE`, `datetime('now')`, `AUTOINCREMENT`. The README lists
  the rewrite for each.
- `env.BUCKET` behaves like R2 (`get/put/head/delete/list`) over a private S3
  bucket.
- New ones: `env.user` (verified Cognito claims), `env.entitlement()` (is
  this user paying for this product?), `env.push` (SNS mobile push) and
  `env.secret(name)`.

## Payments stay at Paddle, and the webhook gets its own account

Paddle remains the merchant of record. Only its webhook moves, and it runs
in a separate `payments` AWS account that this public repository's CI
cannot deploy to. It checks the `Paddle-Signature` HMAC against a secret
held in that account and forwards a normalised event to a queue in the
`apps` account. Only that one role can write to the queue. A consumer then
writes the entitlement into the product's database.

The end-to-end test runs this whole path against a real Postgres 16, set up
the way RDS is (a master user that is not superuser, an `rds_iam` role):

- a forged event never reaches the queue;
- Paddle redelivering an event stores it once;
- a cancellation is not undone by an older "active" event that arrives
  after it;
- the app's own database role cannot grant itself a subscription;
- the paid route returns 402 until the subscription event lands, then 201.

## What it costs to have it running

About **$32 a month before any traffic**: a `db.t4g.micro` Postgres
(~$11.70), its storage (~$2.30), two VPC interface endpoints instead of a
NAT gateway (~$14.60), KMS keys and two secrets. Everything else is per
request, and Cognito is free up to 10,000 monthly active users. Measured
against the portfolio's 40% margin floor, the platform pays for itself at
about $53 a month of revenue: three $19 subscriptions. RDS Proxy and
Multi-AZ are one variable away, each with its price written beside it. So is
outbound internet: a product that calls Claude through Claude Platform on AWS
turns on one NAT gateway, which roughly doubles the fixed cost to ~$65.

## Status

None of this is applied yet, because there is no AWS account. It is
written to be applied by CI once the owner has done the steps AWS requires
a person for. The OpenTofu passes `validate`, 29 `tofu test` runs with the
providers mocked (no public buckets, no wildcard IAM, encryption on, the
database not reachable from the internet) and Checkov (271 passed, 0
failed, 25 baselined with a written reason each). Grant Autopilot is the
first product to move.
