---
title: "Texas and Utah lien waiver forms: what a subcontractor has to fill in"
seo_title: "Texas and Utah statutory lien waiver forms for subcontractors"
date: 2026-11-25
tags: [for-customers, contractor-billing, lien-waiver-checker, construction, lien-waivers, texas, utah]
description: "Texas sets four lien waiver forms (Prop. Code § 53.284); Utah sets two (§ 38-1a-802), none unconditional. What each asks for, and how PayApps fills them."
---

*Not legal advice. Lien law varies by state and changes, so have counsel review a waiver before
you rely on it. Written by an AI agent working in this repository. The statute text was read on
each legislature's own site on 25 November 2026.*

If you bill a general contractor every month, you probably send a lien waiver with each pay
application. In some states you can't write that waiver however you like, because the statute
sets the wording. Texas and Utah are two of those states, and their forms differ in ways that
affect how you fill them in.

## Texas: four forms, and the notice goes on top

Texas Property Code § 53.284 sets four forms: conditional and unconditional, each for a progress
payment and for a final payment. A waiver is "unenforceable unless it substantially complies with
the applicable form". The section has not changed since it took effect on 1 January 2012.

Every Texas form starts with the same two lines, **Project** and **Job No.** It then asks for:

- **the owner** of the property and its **location**;
- a **job description**, which is what the waiver covers ("to the following extent");
- the **person you contracted with**, usually the GC;
- on the two conditional forms, the **maker of the check**, the **amount** and the **payee**.

Unlike Arizona's forms, the Texas forms have no through date. A Texas progress waiver covers what
is "indicated in the attached statement(s) or progress payment request(s)", so **attach the pay
application**. It also carves out "unpaid retention, pending modifications and changes, or other
items furnished".

**The unconditional forms need a notice at the top.** The two unconditional forms (§ 53.284(c)
and (e)) have to open with a notice "printed in bold type at least as large as the largest type
used in the document, but not smaller than 10-point type". It reads: "It is prohibited for a
person to require you to sign this document if you have not been paid the payment amount set
forth below." A form with that notice moved to the bottom, or set in small print, no longer
matches the statute's.

## Utah: two forms, and neither is unconditional

Utah Code § 38-1a-802(4) sets **two** forms, not four:

- **Utah Conditional Waiver and Release upon Progress Payment** asks for Property Name, Property
  Location, Undersigned's Customer, Invoice/Payment Application Number, Payment Amount and
  **Payment Period**. It excludes retention, pending changes, disputed items, and anything
  "furnished or invoiced after the Payment Period".
- **Utah Waiver and Release upon Final Payment** has the same blanks except the payment period.

Neither form says "unconditional". Both take effect only "once (1) the undersigned endorses a
check in the above referenced Payment Amount payable to the undersigned; and (2) the check is
paid by the depository institution on which it is drawn." The statute also says a waiver binds
"only to the extent of the payment" received (§ 38-1a-802(2)), and if the check doesn't clear,
the waiver is void (§ 38-1a-802(3)).

So if a GC on a Utah job hands you an "unconditional waiver" form, it is not one of the
statute's forms. That is a question for your attorney, not something to sign on the spot.

## How PayApps handles it

PayApps is our pay-application product for specialty subcontractors. It is in early access, and
checkout stays off until it launches. It now prints Texas's four forms and Utah's two, word for
word from the statute, filled in from the job and the pay application: owner, location, GC, pay
application number, amount due after retainage, and billing period. Arizona and Nevada were
added earlier the same day. A test compares each printed form with the statute's text as a whole
and fails the build if a single clause goes missing.

For Utah it will not invent an unconditional form. Once a Utah pay app is marked paid, PayApps
offers the conditional form, which is what the statute provides. If you track an unconditional
Utah waiver anyway, PayApps records it and explains why it can't print one. In the seven listed
states whose text we haven't checked yet, California included, it tracks the waiver and links to
the official source instead of printing its own wording.

Lien waivers are on the Crew plan ($179 a month) and up.

**Check a waiver you were sent, free:** the [lien waiver checker](https://marisstella.app/lien-waiver-checker/)
reads a waiver for red flags, such as an unconditional waiver before the check clears or
retainage that isn't excepted. If you pick Arizona, Nevada, Texas or Utah, it now also names the
statute that sets the wording and quotes its rule.
