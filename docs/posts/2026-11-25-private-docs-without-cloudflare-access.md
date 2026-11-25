---
title: "Private docs without Cloudflare Access, and a bug the move turned up"
seo_title: "Replacing Cloudflare Access for a private static site on AWS"
date: 2026-11-25
tags: [aws, hosting, real-estate-agent-photo-app, security]
description: "A sign-in gate for static sites on the AWS starter, with no outbound calls and no secret in state. The first site moved had every doc page built as not found."
---

Three of the products moving from Cloudflare to AWS are folders of built
files that only a few people should read: Listing Lens's internal docs,
Retail Pilot Intel's docs and the AI-First Markets notes. On Cloudflare the
private ones sat behind Cloudflare Access, which let one address in for 24
hours at a time.

The AWS starter now has a site app for this (`runtime/src/site.mjs`). It
serves the built files from the product's Lambda and, when the stack gives
it a list of addresses, puts a sign-in gate in front:

1. `/auth/login` sends the reader to the product's Cognito sign-in
   (authorization code with PKCE, no client secret in the page).
2. The page POSTs the ID token to `/api/session`. That route sits behind API
   Gateway's JWT authorizer, so AWS checks the signature, issuer, audience
   and expiry before the app sees the claims. The app then checks the
   address is verified and on the list.
3. The app sets a 12-hour session cookie (`__Host-`, HttpOnly, Secure,
   SameSite=Lax) signed with HMAC-SHA256. Every later request checks it.

Two constraints shaped this. The product Lambdas run in a private network
with no internet route, so checking a Cognito token in the app would mean
fetching signing keys from outside, through a NAT gateway (about $33 a
month) or an extra endpoint. API Gateway already checks tokens, so the app
asks it once per session and never makes an outbound call. And no stack may
keep a secret in its OpenTofu state, because the plan role reads state on
every pull request. So the HMAC key is 32 random bytes that the app writes
to its own database the first time it needs one. Deleting that row signs
everyone out.

The sign-in pool takes no self sign-ups and requires a TOTP code. An
address taken off the list is refused at its next request, even with a
valid cookie. A Chromium check runs the whole flow against a faked Cognito:
an address that is not on the list is refused and still redirected, and
the listed one lands back on the page it asked for.

## The bug the move found

The browser check's first run on the real Listing Lens build landed on a
page titled "Page not found". It was not the gate. Every page under
`/docs/<slug>/` had been built that way. Next.js 16 passes a page's
`params` as a Promise, and the page read `params.slug` directly, got
`undefined` and fell through to the not-found page. The site is static, so
the build baked that page into every document. Two `await`s fix it, and the
Cloudflare copy gets the fix on its next deploy too.

## The same gate in place of a Next.js server

AI-First Markets, the owner's notebook of market and business-idea reports,
ran as a Next.js server on a Worker through OpenNext. The server's one job
the files could not do alone was keeping everyone but one address out: a
middleware, a Google OAuth callback, a session token signed with a secret,
and two secrets in the deploy workflow.

Every page reads static data from `src/data`, so the AWS version does not
run Next.js at all. `aws/build.mjs` copies the app without the middleware,
the sign-in routes and the login pages, and runs `next build` with
`output: "export"`: 20 page folders of plain files, about 2.8 MB, served by
the same site app behind the same gate. The Google OAuth client secret and
`AUTH_SECRET` go away. One source line changed: the sitemap is marked
static, which export requires and the Worker build ignores. Checked here:
the export builds, the app's 60 tests and typecheck pass, and a Chromium run
refused an unlisted address and took the listed one to "Path to $100k ARR".

Nothing here is deployed yet: there is no AWS account. The stacks are
`platform/aws/stacks/listing-lens/`, `retail-pilot-intel/` and
`ai-first-markets/`; the Workers stay until the cutover.
