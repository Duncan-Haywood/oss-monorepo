---
title: "Start here: run your own copy, embed a tool, or build a business on one"
date: 2026-10-29
tags: [start-here, self-hosted, mit-license, open-source]
description: "Every tool here is MIT licensed, so you may run it for profit. Which self-hosted apps exist, how to deploy one, and what you take on as the operator."
---

# Start here: run your own copy, embed a tool, or build a business on one

This guide is for three kinds of reader. You might run a small software business and pay monthly for a status page, failed-payment recovery or a feedback board that you would rather own. You might have a website for your trade and want a working calculator on it. Or you might want to take one of these tools, put your own name on a copy, and sell it as a service.

All three are allowed. That is the headline.

## You may run it for profit

Every tool in this repository is MIT licensed, at the root and again in each tool's own `LICENSE` file. The MIT licence lets anyone use, copy, modify, merge, publish, distribute, sublicense and sell the software. The one condition is that you keep the copyright and licence notice in copies of it.

So you can deploy a copy for yourself, build it into your own product, or host it for paying customers. There is no fee, no revenue share, and no sign-up. That includes ideas you suggested: when an [idea you bring](2026-10-29-start-here-bring-an-idea.md) is built here, it lands as public MIT code, and you may run it as a business the same as anyone else.

The repository's own direction says this outright: each app is meant to be an open-source business that anyone can host in their own account, with nothing of the maintainer's running in between.

## What you take on

Permission is not protection, so be clear about the other side.

- **No warranty.** The licence provides the software as-is, and the authors are not liable for what happens when you use it. Each tool's README and page repeat that, and the self-hosted apps add that hosting is best effort with no uptime guarantee.
- **You are the operator.** Whoever deploys a copy is responsible for its domain, terms, privacy policy, users and any changes they make. The disclaimers ship with your copy, but keeping them accurate becomes your job.
- **Your compliance is yours.** Tax, consumer-protection rules, email law, and licensing in regulated fields depend on where you operate and what you sell. The dunning app's README, for example, notes that rules for payment-failure notices differ by country and that the operator is responsible for them.
- **Use your own name.** Do not present your copy as the portfolio, use its name for your service, or imply that the maintainer endorses or supports your business.

## What there is to run

The catalogue's "Self-hosted business apps" section lists 31 apps, browsable at [the self-hosted section](https://duncan-haywood.github.io/oss-monorepo/c/self-hosted/). They are open-source alternatives to paid software, run on your server with your keys. A sample:

- **Payments and revenue:** Dunning Engine (failed Stripe payment recovery), Cancel Flow (save offers at cancellation), Trial Converter, MRR Pulse, Rev Rec (deferred revenue), Meter Keeper (usage metering), License Keeper and Referral Keeper.
- **Running a product:** status-keeper (status page and uptime monitor), Error Keeper, Cron Heartbeat, Flag Keeper (feature flags), webhook-relay and Changelog Keeper.
- **Customers:** Support Desk, Help Keeper, Feedback Board, Survey Keeper, Testimonial Keeper, Form Inbox, Slot Keeper (booking page), Drip Keeper (lifecycle email), Waitlist Keeper and Sign Keeper (e-signature).
- **Analytics:** visit-keeper, cookie-free web analytics you own.

The other 1,200-plus tools are browser pages with no server at all, which makes them the easiest thing here to host.

## Your first ten minutes: run status-keeper

status-keeper is a good first app because it is one Node 22 process with zero dependencies, keeping its state in one JSON file. From a sparse clone:

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/duncan-haywood/oss-monorepo.git
cd oss-monorepo && git sparse-checkout set ventures/status-keeper
cd ventures/status-keeper
node --test                     # its tests

ADMIN_KEY=$(openssl rand -hex 16) TITLE="Acme" \
MONITORS_JSON='[{"id":"site","name":"Website","url":"https://example.com"}]' \
node server.mjs
```

It listens on port 8080 by default. Open `http://localhost:8080/` for the public status page; `/api/status.json`, `/feed.xml` and `/badge.svg` are there too. Incidents and maintenance windows are posted through an admin API that takes your `ADMIN_KEY` as a bearer token. Email subscribers and chat alerts are optional and stay off until you supply your own Resend key or webhook URL.

Its README is frank about limits: it checks from one location, so host it somewhere other than what it watches, and it has no multi-region probes or SMS.

## Deploying a copy for real

Most server apps ship the same set of deploy files, and every path runs in your own account:

- **Docker anywhere:** `docker build` and `docker run` with the environment variables in the README, or the `docker-compose.yml`, which has its command at the top.
- **Render:** a `render.yaml` blueprint. For Dunning Engine you fork the repository and open `https://render.com/deploy?repo=<your fork URL>`; it builds in your Render account and generates the secret keys. That app needs a persistent disk for its state, so its README says it uses a paid instance rather than the free tier. The hosting bill is yours.
- **Fly.io:** the steps are at the top of each `fly.toml`.

Read the app's README before you go live. Some carry their own safety steps. Dunning Engine, for example, starts in dry-run mode, logging what it would do without touching Stripe or your customers, has a `node doctor.mjs` preflight that checks your configuration and Stripe setup, and says plainly that it has been tested against a fake Stripe, not run against live Stripe by the author.

A one-click flow where you pick an app and a cloud, paste credentials and press Deploy is described in `PRODUCT_PLAYBOOK.md` as the direction for future work. It does not exist yet. Today the paths above are the way.

## Embed a calculator on your own site

If you want a tool on your page rather than a server of your own, each tool's main page has an "Embed this tool on your page" box in its footer. It gives you a copyable `<iframe>` snippet and an optional one-line script that sizes the frame. The calculator still runs in your visitor's browser, keeps its arithmetic and disclaimer, and links back to the full tool. The embed code adds no cookies and no tracking to your page.

To build a tool into your own product instead, copy its engine module (often `calc.mjs` or `engine.mjs`, plain functions with no DOM or network), keep the licence notice, and call it from your code. The [AI agents guide](2026-10-29-start-here-ai-agents-and-mcp.md) shows how to find and call those engines.

## Cost and where data goes

The software costs nothing. You pay whatever your host charges. The data stays wherever you run it: the server apps keep state in a file on your disk, and they talk to outside services such as Stripe or an email provider only with keys you supply. Payment features stay off unless you add your own keys.

## Where to go next

- [The self-hosted section of the catalogue](https://duncan-haywood.github.io/oss-monorepo/c/self-hosted/)
- Every tool, with source links: `ventures/README.md`
- The licence: `LICENSE`
- Two app READMEs worth reading first: `ventures/status-keeper/README.md`, `ventures/dunning-engine/README.md`
- Want something that does not exist yet: [bring an idea](2026-10-29-start-here-bring-an-idea.md)
- Want to fix something in an app you run: [Start here: contributing](2026-10-29-start-here-contributing.md)

The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).
