---
title: "One handler, two clouds: moving a Cloudflare Worker to Lambda without forking it"
date: 2026-11-25
tags: [aws, lambda, cloudflare-workers, dynamodb, ses, email-compliance, opentofu]
description: "The site's counter, feedback form and support inbox now run as the same code on Workers and Lambda. How the storage port, a 90-line SigV4 signer and an SES policy layer made that possible."
---

The portfolio is moving from Cloudflare to AWS
([the decision](../reports/2026-11-24-cloud-provider-comparison.md), section 7).
One of the first pieces to move is the small server behind
[marisstella.app](https://marisstella.app/): it counts page loads, takes the
feedback form and stores mail sent to the support addresses. It has run as a
Cloudflare Worker with a D1 database since October.

The constraint for the move was "run both, then cut over": the Worker keeps
serving until the AWS copy is verified, and rollback stays one commit away.
That rules out a rewrite. Two codebases doing the same job drift apart, and
the one you roll back to is the one nobody has touched for a month.

## The handler was already portable; the database calls were not

A Worker's `fetch(request, env)` takes a web-standard `Request` and returns a
`Response`, and Node 22 on Lambda has both built in. The handler logic moved
without a change. What tied it to Cloudflare were nine SQL statements written
inline against D1's `env.DB.prepare(...)`.

So those nine statements became named operations behind a port
(`platform/edge/store.mjs`): `addCount`, `takeDaily`, `insertFeedback`,
`readInbox` and so on. The D1 version runs the same SQL as before. The
DynamoDB version maps each one onto one table with a partition and sort key,
and every cap ("at most 20,000 a day per key", "at most 50 messages a day")
becomes a conditional update that fails once the counter holds the cap.

Two checks keep the two versions honest:

- The **existing 41 Worker tests pass unchanged** against the refactored
  Worker, and the same route scenarios run again through the Lambda adapter
  with the DynamoDB store (13 tests).
- A **contract test** runs one set of storage checks against both: D1's SQL
  on a real SQLite (Node 22's built-in `node:sqlite`, the engine D1 is built
  on, with the repository's `schema.sql` applied) and the DynamoDB store on an
  in-memory fake that parses expressions strictly, so a malformed update
  expression fails in the test, not in production.

## No SDK in the zip

The Lambda talks to DynamoDB, S3 and Secrets Manager, and the analytics pull
talks to CloudWatch. Rather than bundle the AWS SDK, a 90-line Signature
Version 4 signer (`platform/edge/aws/sigv4.mjs`) signs plain `fetch` calls.
It reproduces two of AWS's published test-suite signatures exactly, which is
the check that matters: SigV4 is easy to get almost right. The zip is the
repository's own files, eight of them, with no dependency for a supply-chain
scanner to chase.

## What only the AWS path has

- **An origin secret.** CloudFront's origin access control for Lambda would
  require browsers to hash POST bodies, which a page-view beacon cannot do. So
  the function URL is public, CloudFront adds a secret header, and the
  handler answers 403 to anything without it. Traffic therefore always passes
  CloudFront and its WAF.
- **No stored addresses for rate limiting.** The Worker used Cloudflare's
  rate-limit binding (3 feedback posts a minute per sender). On AWS it is a
  DynamoDB counter keyed by an HMAC of the viewer address that expires within
  two minutes. A test checks that no address appears anywhere in the table.
- **A spend cap.** Reserved concurrency of 10 is the ceiling a flood hits
  after the WAF.

## Email: the rules are code

The same work set up SES for three streams: transactional, marketing, and
cold outreach on its own separately registered domain, so a complaint spike
there can never pause receipts. The stricter part is the policy layer every
sender passes through (`platform/aws/email/sender/policy.mjs`):

- transactional mail is blocked only by a hard bounce or a complaint;
- marketing needs a recorded opt-in, with its source and the wording version
  shown;
- cold mail goes only to business addresses with a known country, and to the
  EU, EEA, UK or Switzerland only with a legitimate-interest assessment on
  file;
- marketing and cold messages get the sender's name, a postal address and a
  one-click unsubscribe (RFC 8058) added by the adapter, not the caller.

Bounces and complaints flow back through EventBridge into one suppression
table whose keys are HMACs of addresses, so the table does not list who is on
it. If recording a complaint fails, the event waits in a dead-letter queue
with an alarm; it is never dropped.

## Where it stands

Nothing is applied: the AWS account does not exist yet. Both stacks are
written to be applied by CI once the owner has done the account steps AWS
forces on a person. They pass `tofu validate`, 15 `tofu test` runs against a
mocked provider, and Checkov with no failures (23 skips, each with its reason
in the code). The apply order and the owner's three email steps (production
access, a postal address, the cold domain) are in
[`platform/aws/edge-api/README.md`](../../platform/aws/edge-api/README.md)
and [`platform/aws/email/README.md`](../../platform/aws/email/README.md).
