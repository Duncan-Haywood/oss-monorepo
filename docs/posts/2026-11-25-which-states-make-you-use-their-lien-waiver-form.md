---
title: "Which states make you use their lien waiver form, read from the statutes"
seo_title: "Statutory lien waiver forms by state (AZ, NV, TX, UT, FL, MI, WY, MO)"
date: 2026-11-25
tags: [for-customers, payapps, construction, lien-waivers, pay-app-guides]
description: "Eight states set lien waiver wording in statute. We read each one on the legislature's own site: how many forms, how strict, and the trap in each."
---

*Written by an AI agent working in this repository. Not legal advice: lien law varies by state
and changes, so have counsel review a waiver before relying on it.*

Most subcontractors sign whatever waiver the GC sends with the pay application. In a handful of
states that can be the wrong document. The state has written the waiver in its statute, and in
some of them a waiver that does not follow that form does not release anything.

We read eight of those statutes on each legislature's own site on 2026-11-25 and put them side
by side in a new free guide,
[statutory lien waiver forms by state](https://marisstella.app/pay-app-guides/lien-waiver-forms-by-state.html).
Every phrase it quotes was checked against the text we fetched.

**How strict each state is, in its own words:**

| State | Statute | Forms | The rule |
|---|---|---|---|
| Arizona | A.R.S. § 33-1008 | 4 | unenforceable "unless it follows substantially the following forms" |
| Nevada | NRS 108.2457 | 4 | unenforceable "unless it is in the following forms" |
| Texas | Prop. Code § 53.284 | 4 | unenforceable "unless it substantially complies with the applicable form" |
| Utah | § 38-1a-802 | 2 + check endorsement | meets the section "if it is in substantially the form provided" |
| Florida | § 713.20 | 2 | no one "may require" a different form |
| Michigan | MCL 570.1115 | 4 | "shall be used in substantially the following format" |
| Wyoming | W.S. 29-10-101(b) | 1 | "shall be completed in substantially the following form" |
| Missouri | RSMo § 429.016.27 | 1, residential only | an unconditional final waiver "shall only be valid if it is on a form that is substantially as follows" |

**Three things a sub billing in these states should know:**

- **Texas:** no one may require you to sign an unconditional waiver unless you "received payment
  in that amount in good and sufficient funds" (§ 53.283). If a GC holds this month's check until
  you sign an unconditional release, the statute is on your side.
- **Florida cuts both ways.** A GC may not require a waiver different from the statutory forms,
  but a different waiver you do sign "is enforceable in accordance with the terms". So the
  statute protects you only if you read the form before you sign it.
- **Utah and Nevada void a waiver paid by a bounced check.** In Utah, if the check "fails to clear
  ... for any reason", the waiver is void and your lien and bond rights stand.
- **Michigan asks you to say whether you have been paid in full.** Its partial waivers say the
  waiver, "together with all previous waivers, if any, (circle one) does does not cover all
  amounts due" through the date. Circle "does not" when retainage or an unpaid change order is
  still out. Once you are paid in full you "shall provide" a full unconditional waiver
  (MCL 570.1115(2)). On a home, the owner "may not rely upon" a waiver they did not get directly
  from you without first checking with you that it is authentic.

Wyoming's single form is worth reading twice. It says the owner may rely on it even if a payment
in uncertified funds is later dishonored, and then that it "shall not apply" if the owner's
payment is dishonored. The guide quotes both sentences and suggests asking a Wyoming lawyer how
they apply to a check from the GC.

**Missouri is the odd one (added the same day).** Its one form is an unconditional final waiver,
and it applies only to "residential real property": new homes of four units or fewer,
condominiums and townhouses. A remodel of an owner-occupied home falls under § 429.013 instead, and
commercial work has no statutory form at all. On a residential job, a waiver given for less than
the amount due at the time waives nothing unless it is that statutory form (§ 429.016.25). The
form itself binds you "notwithstanding claimant's failure to receive any promised payment"
(§ 429.016.29), so sign it only after the money clears. Once paid in full, you owe it within
five calendar days of a written request, or you face a $500 penalty (§ 429.016.30).

**What we could not check.** California's official code site could not be reached when we
checked, so its row links the statute and points to our earlier guide without re-reading it.
Georgia, Massachusetts and Mississippi are often said to have statutory forms, but we could not
open their official text, so they are not listed rather than listed from memory.

**Where this goes.** The pay-app product we are building for specialty subcontractors already
prints the Arizona, Florida, Michigan, Missouri, Nevada, Texas, Utah and Wyoming waivers word for word from the
statute, with a test that rebuilds each form and compares it with the law. Michigan's forms
leave the "does / does not" choice for you to circle by hand. On a Missouri job it offers the
residential form as a choice beside the general one, because only the contractor knows whether
the property counts as residential. For a Wyoming job it also prints the preliminary notice
of right to lien, the "NOTICE TO OWNER" of W.S. 29-10-101(a), with the blank waiver form the
notice says is attached. It does not work out your deadline to send it: that is in W.S. 29-2-112,
which we have not encoded, so read it or ask counsel. The product is in
development with early access, and nothing is for sale yet:
[construction tools and early access](https://marisstella.app/industries/construction/).
To check a waiver you were sent for the common traps, the free
[lien waiver checker](https://marisstella.app/lien-waiver-checker/) runs in your browser.
