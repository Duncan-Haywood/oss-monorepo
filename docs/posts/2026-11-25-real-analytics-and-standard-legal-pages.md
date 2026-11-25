---
title: "We replaced our 'we collect nothing' footer with real analytics and a real privacy policy"
seo_title: "Cookieless analytics and a standard privacy policy, replacing 'nothing'"
date: 2026-11-25
tags: [privacy, analytics, legal, cloudflare, marisstella]
description: "Every page now loads cookieless Cloudflare Web Analytics, and a Privacy Policy, Terms of Use and Cookie Policy replace a footer that said nothing was collected."
---

Until today every page on this site ended with the same promise: everything
runs in your browser, "no tracking cookie, no analytics vendor, and no server
that could receive it." About 50 tool pages repeated a version of it in their
own words.

It was a self-imposed rule, not a legal one, and it was already slightly off:
the site has had a first-party page-view counter since October, and every
request has always passed through our host, Cloudflare. It also cost us the
thing a business needs most from its website, knowing which pages people read
and where they came from.

## What changed

- **Cloudflare Web Analytics on every page.** It is cookieless, stores nothing
  on your device and builds no profile, so it needs no consent banner under
  the EU and UK cookie rules. It reports the page, the referrer, browser and
  device type, the country and page-load timings, as aggregate statistics. It
  runs on the Cloudflare account the site already uses, so there is no new
  vendor.
- **A standard [Privacy Policy](https://marisstella.app/privacy/)** that names
  the operator, everything collected (request data the host sees, the
  analytics, our own aggregate counter, feedback and email you send), the
  legal basis for each, who receives it, international transfers, retention,
  your rights under the GDPR and US state laws, and a contact address.
- **[Terms of Use](https://marisstella.app/terms/)** for the free site:
  licence, acceptable use, no warranty, a liability cap and governing law.
  The paid products keep their own terms.
- **A [Cookie Policy](https://marisstella.app/cookies/)** listing what is
  stored: tool inputs and settings in your own browser's storage, the offline
  cache, and the security cookies Cloudflare may set.

The footer now says, in four lines, that the tools run in your browser, that
we measure use with cookieless analytics and aggregate counts, and links the
three documents.

## Keeping the copy honest

A privacy page that claims more or less than the code does is a
consumer-protection problem either way. So the legal pages, the footer, the
About page and `llms.txt` read the same switch the build uses to add the
analytics script: if the deploy has no analytics token, the script is not
added and none of the pages mention it. The tool pages that used to say "no
analytics vendor" now say "only cookieless page analytics", which is true
whether or not the script is on.

One piece is waiting on an account setting: the deploy's Cloudflare token
needs permission to create the Web Analytics site. Until then the pages ship
exactly as before, without the script, and say so.
