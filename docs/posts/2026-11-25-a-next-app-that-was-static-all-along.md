---
title: "A Next.js app that was static all along: moving AI-First Markets off its Worker"
seo_title: "Next.js static export instead of a server, behind a sign-in gate"
date: 2026-11-25
tags: [aws, hosting, nextjs, ai-first-markets]
description: "AI-First Markets ran a Next.js server on a Worker to guard 20 pages of static data. On AWS it is a static export behind the starter's sign-in gate."
---

AI-First Markets is the owner's notebook of market and business-idea
reports. It ran as a Next.js server on a Cloudflare Worker through OpenNext.
The server did one job the files could not do alone: it kept everyone but
one address out. That took a middleware, a Google OAuth callback, a session
token signed with a secret, and two secrets in the deploy workflow.

Every page reads static data from `src/data`. So the AWS version does not
run Next.js at all. `aws/build.mjs` copies the app, leaves out the
middleware, the sign-in routes and the login pages, and runs `next build`
with `output: "export"`. That writes 20 page folders of plain files, about
2.8 MB. The AWS starter's site app serves them behind the same sign-in gate
the Listing Lens docs got today: Cognito with no self sign-up and a TOTP
code, the token checked by API Gateway, and a 12-hour signed cookie whose
key sits in the product's own database.

What went away: the Google OAuth client secret, `AUTH_SECRET`, and the
auth code for one reader. One source line changed. The sitemap had to be
marked static, which static export requires and the Worker build ignores.

Checked here: the export builds, the app's 60 tests and its typecheck pass,
the pages answer through the bundled Lambda handler, and a Chromium run
refused an address that was not on the list and took the listed one to
"Path to $100k ARR". Not deployed: there is no AWS account yet. The Worker
stays until the cutover.
