---
title: "Moving off Vercel and Resend: what Cloudflare can and cannot replace"
seo_title: "Vercel and Resend to Cloudflare: what moved and what could not"
date: 2026-11-24
tags: [cloudflare, hosting, email, infrastructure]
description: "The Vercel deploy had never run, so it moved free. Cloudflare's email service covers transactional mail at no extra cost but refuses marketing mail, so Resend keeps that."
---

The owner asked for fewer providers: move to Cloudflare wherever it costs little
more and works as well. Two services were in scope.

**Vercel.** One workflow could deploy
[Retail Pilot Intel](../../ventures/retail-pilot-intel/)'s internal docs to
Vercel, but only once a repository variable was set. Nobody ever set it. The
last five runs all show the Vercel job as `skipped`, so no Vercel address
existed to keep or redirect. The docs now get their own free-plan Cloudflare
Worker, which only serves static files. Because no code runs, its requests are
never metered. A `_headers` file sends the same headers Vercel's config sent,
including `noindex`. The site's two Workers are already near the free plan's
20,000-file limit, so the docs stay out of them.

**Resend.** Cloudflare's email service checks most of the boxes:

- SPF, DKIM and DMARC are set up when a domain is added;
- bounced and complaining addresses go on a suppression list;
- one-click unsubscribe headers are allowed;
- 3,000 emails a month are included in the Workers Paid plan the app already
  pays for, so it adds nothing at today's volume.

Two things count against it. It is still in beta. And its FAQ says plainly:
"Email Service supports transactional email only." Sign-up, reset, invitation and submission emails
can move. A newsletter welcome series cannot. So the app routes by kind: each
message says whether it is marketing, transactional mail goes through
Cloudflare, and marketing mail goes only to a provider that allows it. With no
such provider, a marketing send fails and retries; it is never quietly marked
as sent.

One more difference: Resend lets the sender attach a key so a resend
is never delivered twice, and Cloudflare has no such field. Every send in this
app already claims a database row before it goes out, so that key was a second
guard, not the first.

The sources were Cloudflare's own docs, read from their public source
repository, and its published API schema.
