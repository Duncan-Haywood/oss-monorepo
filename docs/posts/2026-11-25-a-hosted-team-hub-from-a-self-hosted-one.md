---
title: "One hub per deploy to many hubs per deploy: hosting Shift Roster Builder's team page"
seo_title: "Hosting a self-hosted staff schedule hub for many teams"
date: 2026-11-25
tags: [shift-roster-builder, aws, hosting, saas]
description: "The team hub ran one team per deploy, on the user's own server or Cloudflare account. It now runs many teams on one AWS deployment, with the same handler and the same one-request-at-a-time guarantee. Not deployed yet."
---

Shift Roster Builder's team hub is the part that gets a roster to the staff:
the manager publishes the week, everyone opens one link to see their shifts,
clock in, call out or ask for time off. Until today it came in two
self-hosted forms, a Node server with a JSON file and a Cloudflare Worker
with one Durable Object, and both ran one team per deploy on the user's own
account.

The portfolio moved to hosted by default on 2026-11-24, and onto AWS. So the
hub now has a third form: many teams on one deployment of the AWS SaaS
starter (Lambda, Postgres, Cognito). It is built and tested. It is not
deployed: there is no AWS account yet.

## What had to change, and what did not

The request handler (`hub.mjs`, about 950 lines) did not change. It takes a
state object, a save function and an environment, and it already ran
unchanged under Node and under the Worker. The hosted version is a wrapper
of about 300 lines around it:

- **Which team?** The self-hosted hub knew its two secrets from the
  environment. The hosted one looks a team up by the SHA-256 of the key in
  the link (`?key=` for the manager, `?t=` for staff). The keys are 32
  random bytes and only their hashes are stored, so a copy of the database
  does not open anyone's hub. A lost link is replaced, not recovered.
- **One request at a time.** The reason the Worker used a Durable Object
  was that two staff posting in the same second could not overwrite each
  other. In Postgres every request that may write takes the team's row with
  `SELECT ... FOR UPDATE` and holds it until it commits. The test sends
  twenty replies at once to one team on Postgres 16, and all twenty are
  kept.
- **Settings per team.** The self-host environment variables (time zone,
  pay rules, leave accrual, fair-workweek city) became a per-team JSON
  column with an allowlist of the same names.
- **No webhooks.** The hosted app has no internet route, and fetching a URL
  a user typed from inside our network would be a server-side request
  forgery risk. So the Slack or Discord notifications stay a self-host
  feature for now.

A manager signs in at `/start` with the product's Cognito pool (hosted
sign-in, authorization code with PKCE, no client secret in the page),
creates a hub and gets its two links once. A browser check drives that
whole path in Chromium against a faked Cognito: sign in, create, build and
publish a week in the browser, open the staff link, delete.

## Moving a team in

There was nothing of ours to migrate: every existing hub runs on someone
else's machine. What a team needs is a way to bring its week, punches and
leave balances along. The hub gained a backup download,
`/admin/export.json` (admin key only, linked on the admin page), and
`aws/migrate-hub.mjs` reads it from the old hub and creates a hosted hub
with that state. The test runs it from a Worker hub into a hosted one.

## Not claimed

It is not live, no team has used it, and there is no price. One hub per
account is free; a second answers "subscription required" until the owner's
checkout exists. The code, the OpenTofu stack and the checks are in
`ventures/shift-roster-builder/aws/` and `platform/aws/stacks/shift-roster/`.
