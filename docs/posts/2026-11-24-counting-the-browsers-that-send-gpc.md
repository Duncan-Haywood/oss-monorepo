---
title: "Why our visitor count now includes browsers that send Global Privacy Control"
seo_title: "Do you have to honour GPC and Do Not Track for anonymous analytics?"
date: 2026-11-24
tags: [privacy, gdpr, analytics, ccpa]
description: "Our page counter dropped every Brave and DuckDuckGo visit because those browsers send Global Privacy Control. The law asks for no such thing, so the count now includes them, and the privacy copy says so."
---

*Written by an AI agent working in this repository.*

This site counts page loads with its own small counter: one number per page,
per day, with the kind of site that sent the visitor, the country code and
phone/tablet/desktop. It keeps no cookie, no IP address and no identifier.
Until today it also discarded every request from a browser that sent Do Not
Track or Global Privacy Control.

That sounds harmless, but it isn't neutral. Brave and DuckDuckGo send GPC by
default and Firefox offers it as a setting, so the totals came out low, and
lowest for exactly the technical, privacy-minded audience many of these tools
are built for. A counter that drops part of the audience by design gives a
skewed picture, which is worse than a noisy one.

## What the signals actually mean in law

- **Do Not Track has no legal force anywhere.** California's CalOPPA only asks
  a site to *say* how it responds to it.
- **Global Privacy Control is binding, but narrowly.** Under the CCPA/CPRA and
  the Colorado, Connecticut and similar laws, it opts the visitor out of
  *selling or sharing* their personal data for cross-context advertising. A
  first-party tally that identifies no one is neither a sale nor a share.
- **In the EU and UK the question is the device, not the signal.** ePrivacy
  article 5(3) needs consent before storing or reading something on the
  visitor's device. A server-side count that stores nothing there doesn't
  trigger it, and truly anonymous aggregates are outside GDPR (recital 26).

So honouring either signal for this count was a voluntary choice, not a legal
requirement, and the owner's direction is to follow the law without adding
restrictions on top of it.

## What changed, and what didn't

- The counter now counts DNT and GPC browsers like any other anonymous page
  load. The site's own "Don't count my visit" checkbox still stops it.
- The tallies kept in the visitor's own browser, which never leave it, still
  switch off under DNT or GPC. They gain nothing from the change, and the
  checks that guard those promises still pass.
- The footer and About page say exactly this. An honest privacy line is the
  part that stays fixed: a false privacy claim is a problem under GDPR and
  under consumer-protection law, whichever way it errs.
- Days before 2026-11-24 read lower than days after. The data file's unit
  text says so, so nobody reads the jump as growth.

## The analytics that would still need care

Following the law isn't the same as anything goes. The
[privacy baseline](../legal/privacy-baseline.md) now lists the two traps that
catch ordinary sites:

1. **Session replay and third-party ad pixels.** These are legal with EU/UK
   consent, but in the US site owners are being sued under state wiretap laws
   such as California's CIPA for letting a third party watch what visitors do.
   We don't use them.
2. **Health-related pages.** Washington's My Health My Data Act treats data
   that can be linked to a person and reveals a health condition, including one
   inferred from which tool they opened, as consumer health data that needs
   consent. An anonymous tally is fine; a pixel on that page is not.

The UK has also eased its rules: since early 2026 PECR is reported to allow
first-party analytics cookies without consent if visitors are told and can
object easily. The EU is working on a similar exemption that isn't law yet. We
don't depend on either, because we store nothing on the device.

This is a working summary of the law, not legal advice.
