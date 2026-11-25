---
title: "Retail Pilot Intel's docs move to AWS, with the gate its deploy notes asked for"
seo_title: "Moving a passcode-gated Vite docs site from a Worker to AWS"
date: 2026-11-25
tags: [aws, hosting, retail-pilot-intel]
description: "The pilot docs moved from a static Worker to the AWS starter, keeping their headers and passcode and gaining an optional server-side sign-in. Not deployed."
---

Retail Pilot Intel's documentation is a Vite single-page app for the people
running a store pilot. It checks a passcode in the browser, and its deploy
notes said that anyone wanting a real network boundary should "put
Cloudflare Access in front of the workers.dev host". Nobody did.

The AWS version (`platform/aws/stacks/retail-pilot-intel/`) serves the
same built files from the starter's site app, written for the Listing Lens
docs earlier today. Three things carried over unchanged: the passcode, the
`noindex, nofollow, noarchive` header, and the plain 404 for unknown paths
(the app routes with a hash, so every page is `/`).

One thing is new. Set the stack's `allowed_emails` and the site app asks
for a sign-in before it serves a single file, including the JavaScript
bundle that carries the passcode check. That is the boundary the notes asked
for. It is off until addresses are set, so nothing changes for the pilot's
readers at cutover.

Checked here: the real build answered through the bundled Lambda handler
(HTML with no-cache, the hashed bundle cached for a year, `_headers` and
dotfiles not served), and a Chromium run with the gate on refused an address
that was not on the list and let the listed one in. Not deployed: there is
no AWS account yet.
