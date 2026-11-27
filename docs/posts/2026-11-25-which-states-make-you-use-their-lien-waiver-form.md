---
title: "Which states make you use their lien waiver form, read from the statutes"
seo_title: "Statutory lien waiver forms by state: 12 states read from the law"
date: 2026-11-25
tags: [for-customers, payapps, construction, lien-waivers, pay-app-guides]
description: "Nine states set lien waiver wording in statute. We read each one from the legislature's own published text: how many forms, how strict, and the trap in each."
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
| California | Civ. Code §§ 8132-8138 | 4 | "null, void, and unenforceable unless it is in substantially the following form" |
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

**California, the biggest market, read last (added the same day).** Its code site would not load
for us, but the Legislative Counsel also publishes the whole of California law as an official bulk
download. We read just the ten sections on waivers out of that 1.2 GB file. Two things in the forms
catch subs out:

- **Signed change orders are waived unless you list them.** Every California form waives rights
  for work done "pursuant to a written change order that has been fully executed by the parties
  prior to the date that this document is signed by the claimant ... unless listed as an Exception
  below". An approved change order you have not been paid for belongs in the exceptions.
- **The final forms have one exception line**, "Disputed claims for extras in the amount of",
  followed by an amount. Retainage is not on it. Sign the final unconditional form only once
  everything, retainage included, has been paid.

A conditional waiver releases the owner, lender or bond surety only once there is evidence of
payment: your endorsement on a check that has been paid, or your written acknowledgment
(Civ. Code § 8124).

**What we could not check.** Mississippi is often said to have statutory forms, but we could not open its
official text, so it is not listed rather than listed from memory. Massachusetts, Georgia and Mississippi
were read the next day (updates below).

**Where this goes.** The pay-app product we are building for specialty subcontractors already
prints the Arizona, California, Florida, Michigan, Missouri, Nevada, Texas, Utah and Wyoming waivers word for
word from the statute, with a test that rebuilds each form and compares it with the law. On a California job it fills the
names, the through date and the check from the pay application. The conditional progress form also
excepts earlier progress payments "for which the claimant has previously given a conditional
waiver and release but has not received payment", with their dates and amounts. On a job that pays
slowly, that list is easy to get wrong by hand. PayApps fills it in for you from the waivers you marked as given on earlier pay
applications that are still unpaid: the date each was signed and what is still owed on it today, so
a partial check shrinks the amount and a paid application drops off the list. You can still edit
both lines before you print. Michigan's
forms leave the "does / does not" choice for you to circle by hand. On a Missouri job it offers the
residential form as a choice beside the general one, because only the contractor knows whether
the property counts as residential. On a Wyoming job it fills the retainage blank from the pay
application's retainage held to date, leaves "has not been paid the sum of" for you to enter, and
prints the notary acknowledgment blank for the notary. Because Wyoming's one form acknowledges
that payment was received, PayApps prints it only as an unconditional waiver and tracks a
conditional Wyoming waiver without printing wording the statute does not give. For a Wyoming
job it also prints the preliminary notice of right to lien, the "NOTICE TO OWNER" of
W.S. 29-10-101(a), with the blank waiver form the notice says is attached. It does not work out
your deadline to send it: that is in W.S. 29-2-112, which we have not encoded, so read it or ask
counsel. The product is in
development with early access, and nothing is for sale yet:
[construction tools and early access](https://marisstella.app/industries/construction/).
To check a waiver you were sent for the common traps, the free
[lien waiver checker](https://marisstella.app/lien-waiver-checker/) runs in your browser.

## Update, 2026-11-25: the waiver checker now knows Wyoming and Missouri

The free [lien waiver checker](https://marisstella.app/lien-waiver-checker/) gives an info note
when you pick a state whose statute sets the waiver wording. Its list predated this guide and left
out Wyoming and Missouri, two of the eight states read above. Both are now in it, and the Missouri
note says what the statute says: its form covers unconditional final waivers on residential
property only (RSMo § 429.016.27). The note's advice points at this guide for the statute itself.
The checker also links the guides a reader needs before and after signing (which of the four
waivers to sign, this state table, the waiver log, joint checks and short payments), which it did
not before. It still does not decide whether a waiver is valid in your state.

## Update, 2026-11-25: California's preliminary notice, read from the same download

Before a California sub or supplier can record a lien, give a stop payment notice or claim on a
payment bond, it must have given a preliminary notice (Civ. Code § 8200). We read the ten sections
on that notice (§§ 8102-8118 and 8200-8216) from the same Legislative Counsel bulk download as the
waivers. Unlike Wyoming, California does not print a form. It lists what the notice must say, and
gives one statement, "NOTICE TO PROPERTY OWNER", to copy word for word "in boldface type"
(§ 8202(a)(3)). What a subcontractor should know:

- **Three people get it**: the owner or reputed owner, the direct contractor (the GC with the
  contract with the owner), and the construction lender, if any (§ 8200(a)). A laborer need not
  give one. A contractor whose contract is with the owner gives it only to the lender (§ 8200(e)).
- **Twenty days.** "A preliminary notice shall be given not later than 20 days after the claimant
  has first furnished work on the work of improvement" (§ 8204(a)). A late notice is not worthless:
  it still covers work "performed within 20 days prior to the service of the preliminary notice, and
  at any time thereafter". Work done more than 20 days before you served it is not covered.
- **What it must contain**: the owner's, direct contractor's and lender's names and addresses; a
  description of the site with its street address; your name, address and relationship to the
  parties; who you work for; a general description of the work; and an estimate of the total price
  (§§ 8102(a), 8202(a)). A general description also covers later work outside it (§ 8206(c)).
- **One per contract, not one per job, when you work for more than one subcontractor** on the same
  job (§ 8206(b)).
- **How to serve it**: personal delivery, or registered or certified mail, express mail or
  overnight delivery (§§ 8106, 8110). Proof is a declaration with the postal or carrier record
  (§ 8118), so keep the receipt.
- **Licensed subs, take note**: on a subcontract over $400, failing to give the notice is grounds
  for discipline under the Contractors' State License Law (§ 8216).

These rules are for private jobs. Public works have their own notice (§ 9300 ff.), which we have
not read yet. PayApps, the pay-app product we are building, now prints the California notice from a
job's page. Each item sits under the statute's own words, followed by the bold statement. It fills
in the owner, the GC and its address, the site, your company and an estimate (the contract sum plus
approved change orders), and leaves the "if any" items off when they are blank. Not legal advice.

## Update, 2026-11-25: keeping track of the notices you gave

Giving the notice is half the job. If you ever record a lien, you have to prove you gave it. California
says how in § 8118: a "proof of notice declaration" that states three things:

1. "The type or description of the notice given."
2. "The date, place, and manner of notice, and facts showing that notice was given in the manner
   required by statute."
3. "The name and address of the person to which notice was given."

If you mailed it, the declaration must come with the postal or carrier record: the receipt showing
you paid for certified, registered or express mail or overnight delivery, or the return receipt or
tracking record (§ 8118(b)). So keep the green card or the tracking printout with the job file.

Two dates trip people up:

- **When the 20 days start and end.** They run from the day you *first furnished work* on the job,
  not from the contract date or your first pay application (§ 8204(a)). Write that day down. A notice
  mailed on day 20 is on time: mailed notice is complete "when deposited in the mail" (§ 8116(b)).
- **Leaving it and mailing a copy is slower.** If you leave the notice and mail a copy the way a
  summons is served (Code Civ. Proc. § 415.20), notice is complete "five days after mailing"
  (§ 8116(c)). Mailed on day 18, it is complete on day 23: late. Certified mail on day 18 would have
  been on time.

PayApps now keeps this record. On a California job you enter the day you first furnished work and it
shows the last day to give the notice (20 calendar days later; it does not move the date for a weekend
or holiday, so treat that day as the latest). You record each notice: to whom, how, the day, where, and the
tracking number. It tells you whether each one was on time. For a late one, it shows the first day of
work the notice still covers. It prints the § 8118 declaration for each, with § 8118(b)'s list of
documents to attach. Until the owner and the GC each have a notice recorded, the cash page and the weekly
email remind you. One gap: a California declaration is signed "under penalty of perjury" (Code Civ.
Proc. § 2015.5). We could not check that section's official text this time, so PayApps does not print
the sentence. Add it, or use your attorney's form. Not legal advice.

**Added 2026-11-26: the receipt goes with the record.** A lien can come months after the notice,
and by then the green card is in a truck or a drawer. Each notice you record in PayApps now holds its
own files: take a photo of the certified mail receipt at the counter, and add the return receipt or
the tracking printout when it comes back, next to the signed declaration. These are the documents
§ 8118(b) lists. The job's history now also shows when each notice was recorded or deleted, when the
first-furnished date was set, and each file added or removed, with who did it. It exports as a CSV
for the file you hand your attorney.

## Update, 2026-11-26: Massachusetts, where the waiver is your pay application

Massachusetts was on our "could not check" list. Its legislature's site answered this time, so we
read Mass. Gen. Laws c. 254, § 32 from the
[General Court's published text](https://malegislature.gov/Laws/GeneralLaws/PartIII/TitleIV/Chapter254/Section32).
It works differently from the other states:

- **The rule comes before the form.** An agreement connected with a construction contract
  "purporting to bar the filing of a notice of contract or the taking of any steps to enforce a
  lien", or to subordinate those rights, "is against public policy and is void and unenforceable".
  The section then lists four exceptions.
- **The one form is a partial waiver**, for "persons who have filed or recorded notices of contract
  under section two", and it must be "substantially in the following form with no material
  deviation therefrom". The statute gives no final or unconditional form.
- **Its header is your G702.** Lines 1 to 10 are original contract amount, approved change orders,
  adjusted contract amount, completed to date, less retainage, total payable to date, less previous
  payments, current amount due, pending change orders and disputed claims. Retyping those numbers
  by hand is where a mistake gets in.
- **What it keeps back:** "retainage, unpaid agreed or pending change orders, and disputed claims as
  stated above". An amount you leave off lines 5, 9 and 10 is not kept back.
- **It is more than a waiver.** Part (b) also subordinates your lien for work done through "the
  twenty-fifth day after the end of the above payment period", to the extent the lender actually
  advances funds by then. And it is "Signed under the penalties of perjury".

PayApps, the pay-app product we are building, now offers this form on a Massachusetts job, next to
the general conditional progress waiver. It does not choose between them for you, because it
cannot know whether you recorded a notice of contract. It fills lines 1 to 8 from the pay
application's own summary, line 9 from your pending change orders, and the application number and
date and the job. The payment goes in words and figures. If you change the figures, the words
change with them, unless you typed your own. You fill in the county, the town, any disputed claims
and the lender. The day, month and year on the perjury line are left blank for you to write when
you sign. The free guide,
[statutory lien waiver forms by state](https://marisstella.app/pay-app-guides/lien-waiver-forms-by-state.html),
now has a Massachusetts row and section. Whether a general-form waiver is enforceable on a
Massachusetts job is a question for a Massachusetts lawyer. Not legal advice.

## Update, 2026-11-26: Georgia, and the 90 days that run whether or not you are paid

Georgia was the other state on our "could not check" list. Its official Code is published only
through LexisNexis, which we could not open. The State does publish the laws that wrote the
section, so we read those: [SB 315](https://gov.georgia.gov/document/2020-signed-legislation/sb-315/download),
which rewrote all of O.C.G.A. § 44-14-366 from 1 January 2021, and
[SB 143](https://gov.georgia.gov/document/2021-signed-legislation/sb-143/download), which rewrote
the affidavit of nonpayment in 2021. A bill shows what it changes by striking old words and
underlining new ones, so we kept the underlined words and dropped the struck ones. We read each
change against the bill. Check the current Code before relying on it. What a sub should know:

- **Two forms, not four.** One is a "Waiver and Release of Lien and Payment Bond Rights Upon
  Interim Payment" and the other is the same "Upon Final Payment". Neither is called conditional
  or unconditional. Each waives "upon the receipt of the sum of $____". The interim form covers
  work through a date you fill in and excepts "any retained amounts". The final form has no
  exception.
- **The 90 days.** Once signed, the waiver is conclusively effective at the earliest of three
  things: the money actually arriving, a separate written acknowledgment that you were paid in
  full, or "ninety days after the date of the execution of the waiver and release". Only one thing
  stops the clock: filing an affidavit of nonpayment "in the county in which the property is
  located" before the 90 days are up (§ 44-14-366(g)(2)). The form's own notice says so: you are
  deemed to have waived "EVEN IF YOU HAVE NOT ACTUALLY RECEIVED SUCH PAYMENT, 90 DAYS AFTER THE
  DATE STATED ABOVE UNLESS YOU FILE AN AFFIDAVIT OF NONPAYMENT". Before 2021 the period was 60
  days, and a claim of lien stopped it too. The 2020 Act struck both. So if you sign a Georgia
  waiver with the pay application and the check never comes, put the 90th day on your calendar.
- **The affidavit** has its own statutory form, sworn before a notary. Within seven days of filing
  it, send a copy to the owner by registered or certified mail or statutory overnight delivery.
  In some cases a copy also goes to the contractor at the address on the notice of commencement.
- **Twelve point, under seal.** Both waiver forms must "be in at least 12 point font" and "need
  not be in boldface capital letters". They are signed under seal, with lines for a witness and
  an address. A waiver covers only your lien and payment bond rights and "shall not be deemed to
  affect any other rights or remedies" (§ 44-14-366(a)), which is what the 2020 Act was passed to
  say.

PayApps, the pay-app product we are building, now prints both Georgia forms word for word. The
interim form is offered for a progress waiver and the final form for a final one. It prints every
line at 12 point, as the statute requires. From the job and the pay application it fills in the
contractor, the project, the owner, the property, the amount and the through date. You fill in
the county, the city and what you furnished. Day and month go on by hand when you sign under
seal.

Later the same day it gained the clock and the affidavit. When a Georgia waiver is marked sent and
the payments recorded on its pay application do not cover it, the waiver list shows the day the 90
days end and how much is still unpaid, and the cash page and the weekly email name it from 30 days
before the end. One click opens the affidavit of nonpayment in the statute's wording, filled from
the waiver: the county, the contractor, the work, the project, the owner and the property, the
waiver's date and amount, and the amount still unpaid. You check it, print it at 12 point and swear
it before a notary. It counts 90 calendar days from the day you marked the waiver sent and does not
move the date for a weekend or holiday, so do not wait for the last day. Recording that you filed it
is next. The free guide,
[statutory lien waiver forms by state](https://marisstella.app/pay-app-guides/lien-waiver-forms-by-state.html),
now has a Georgia row and section. Not legal advice: ask a Georgia lawyer before relying on a
waiver.

## Update, 2026-11-26: Mississippi, and 60 days instead of 90

Mississippi was the last state on our "could not check" list. Its official Code is published only
through LexisNexis, which we could not open. Both sections that matter were created new by one Act,
[SB 2622](https://billstatus.ls.state.ms.us/documents/2014/html/SB/2600-2699/SB2622SG.htm) (2014),
which the Legislature still publishes as sent to the Governor (approved 11 April 2014). We read
that, compared it with the PDF of the same bill, and searched the Legislature's lists of measures
for 2015 to 2026 for a later amendment. We found none. Check the current Code before relying on it.
What a sub should know:

- **Two forms, like Georgia's.** One is an "Interim Waiver and Release upon Payment", used for any
  payment other than the final one (Miss. Code Ann. § 85-7-419(2)). The other is a "Waiver and
  Release upon Final Payment" (§ 85-7-419(3)). A waiver "shall substantially follow" the right
  form. A blank filled in wrongly does not invalidate it "if the subject matter of the release
  reasonably may be determined". The interim form excepts retained amounts. Both are sworn before
  a notary.
- **The 60 days.** Once you sign, the amount in the waiver is conclusively "deemed paid in full" at
  the earliest of three things: the money actually arriving, a separate written acknowledgment of
  payment in full, or "Sixty (60) days after the date of the execution of the waiver and release".
  The only way to stop the clock is to file an affidavit of nonpayment in the county where the
  property is before the 60 days run out, and send the owner a true copy (§ 85-7-419(5)(b)). The
  form's notice says you are deemed paid "EVEN IF YOU HAVE NOT ACTUALLY RECEIVED THE PAYMENT".
  That notice also names "A CLAIM OF LIEN" as a way to stop the clock, but the statute's list
  names only the affidavit, so ask counsel before relying on a claim of lien alone. Georgia also
  gave 60 days before its 2021 rewrite. Mississippi still does.
- **Two days for the owner's copy.** The affidavit of nonpayment has its own statutory form
  (§ 85-7-433(3)). Its last paragraph says "WITHIN TWO (2) DAYS OF FILING THIS AFFIDAVIT OF
  NONPAYMENT" a copy goes to the owner by registered or certified mail or statutory overnight
  delivery. Georgia gives seven days. Filing suspends the waiver "until payment in full has been
  received" (§ 85-7-419(5)(e)). If you are then paid in full, you must sign an affidavit that
  payment was received if asked, and once it is recorded the affidavit of nonpayment "shall be
  deemed void" ((5)(c)).

PayApps, the pay-app product we are building, prints both Mississippi waivers word for word. It now
tracks the 60 days in the same way it tracks Georgia's 90. When a Mississippi waiver is marked sent
and the payments recorded on its pay application do not cover it, the waiver list shows the day the
60 days end. The cash page names it from 30 days before the end. One click prints the affidavit of
nonpayment in the statute's wording, filled from the waiver. Once you record it as filed, PayApps
counts the two days for the owner's copy, and then marks the waiver as suspended until you are paid.
Mississippi's affidavit names no copy to a contractor, so PayApps never asks about one. It counts
calendar days from the day you marked the waiver sent and does not move the date for a weekend or
holiday, so do not wait for the last day. The free guide,
[statutory lien waiver forms by state](https://marisstella.app/pay-app-guides/lien-waiver-forms-by-state.html),
now has a Mississippi row and section. PayApps is in development, and nothing is for sale yet. Not
legal advice: ask a Mississippi lawyer before relying on a waiver.

## Update, 2026-11-26: the waivers you collect from your own suppliers

Everything above is about the waiver you give. Many GCs also want waivers from the people *you*
pay: the supply house that delivered the wire, the rental yard, the insulation sub you brought in.
These are often called lower-tier waivers. A subcontract or the GC's pay-app checklist may ask for
them with each application, and a payment can sit until the last one arrives. Whether yours does,
and which kind it wants (conditional for this period, unconditional for money you already paid
out), is in your subcontract, not in this post.

The work is not the form. The supplier signs its own state's form, or the GC's. The hard part is
the list: who owes you one this month, whether you have asked, and who is still out on the day you
want to submit. PayApps, the pay-app product we are building, now keeps that list on each pay
application:

- **Who to ask** comes from the job's purchase orders and subcontracts, one row per vendor. Vendors
  that have invoiced something to date are ticked, and those with nothing invoiced yet are not,
  because they may have furnished nothing this period. Last month's list is offered too. You tick
  who owes one, pick the waiver kind, and add them all through the period end in one go.
- **Each waiver** is shown as not asked, asked (with the days it has been waiting) or received,
  with the amount and a note. The pay app says "3 of 5 in; still out: Rio Rentals, Valley
  Insulation".
- **The request** is a short email in plain words that you copy or open in your mail app: the job,
  the GC, the kind of waiver, the through date and the amount. PayApps sends nothing itself.

The signed copies go in the pay app's attachments, so they land in the backup packet next to your
own waiver. A later part will attach each file to its row and list the waivers still out across
jobs in the weekly email. This is on the Crew plan and up, alongside lien waivers. PayApps is in
development, and nothing is for sale yet. Not legal advice.

### Later the same day: the signed copy filed on its row

When a supplier sends its signed waiver back, "Attach signed" on that supplier's row now files the
PDF or photo there. Three things follow. The row is marked received today, unless you had already
typed the date it came in. The file is one of the pay application's attachments, so it goes in the
backup packet with the rest of your backup. And the packet's index names it "Lower-tier waiver: ABC
Supply" instead of a bare file name, so the GC's reviewer can match each waiver to a supplier without
opening it.

Only PDFs and JPEG or PNG photos are accepted on a row, because those are what the packet can
merge; a Word file would be left out of it and look like a missing waiver. If you remove a supplier
from the list, its file stays on the pay app as ordinary backup rather than disappearing. The list
of waivers still out across all your jobs, in the weekly email, is the next part (done the same
day: below).

### Later still: every waiver still out, across all your jobs

A list per pay application works when you are sitting in that pay application. It does not help on
a Monday morning with six jobs open and the question "who am I still waiting on?". So the waivers
still out now show in two more places.

- **The projects page** lists every pay application on an
  open job that has a supplier's or sub's waiver not yet in. One line each: "Clinic TI (#2207), pay
  app 4 to Harbor Builders: 3 lower-tier waivers still out (ABC Supply, Ferguson and Valley Rebar),
  the oldest asked for 12 days ago, 1 not asked for yet." The longest wait comes first, and each
  line opens that pay application's list, where the request email is drafted.
- **The weekly "money to chase" email**, for everyone who turned it on, carries the same lines
  under "Lower-tier waivers still out", each linked to its pay application. A waiver still out is
  enough on its own to send that week's email, because a GC that wants lower-tier waivers can hold
  the whole payment for the last one.

"Still out" means only what you entered: no received date and no signed copy attached on its row.
PayApps does not decide whether your GC needs a waiver from that supplier; you put the supplier on
the list. A waiver drops off the moment you attach the signed copy, and a job you close drops off
with all its lists. The sample job never shows up in the email. As before, PayApps sends nothing to
your suppliers itself, it is still in development with nothing for sale yet, and this is not legal
advice.

### And then: the request opens already addressed

The request email was a draft with an empty "To" line, so every month someone dug through their
inbox for the supply house's accounts-receivable address. Now each supplier on the list can carry
an email address. Type it once, when you add the supplier or later with "Email address" on its row,
and "Email" opens the draft addressed to it.

PayApps remembers the address for that supplier across all your jobs. A supply house's AR address is
usually the same on every job, so next month's list, or a list on another job, has the address
filled in when you add the same supplier. The suggestions show which address each supplier will be
added with. Names match the way the list already matches them, so "ABC Supply, Inc." and "abc
supply inc" are the same supplier. If you correct an address, the newest one is used from then on.
Clearing it on a row stops that row from being addressed. Your company's addresses are never shown
to another company.

The draft still opens in your own mail app, and you press send. PayApps sends nothing to your
suppliers itself. It is still in development, with nothing for sale yet, and this is not legal
advice.

## Update, 2026-11-27: every statutory form, blank and ready to print

The guide said which states write the waiver for you, but it never showed you the waiver. Each
state now has its own page with every statutory form printed in full, word for word, a blank line
wherever the statute leaves one (with a small grey caption under it saying what goes there), and a
"Print this form" button that prints that form alone:

[Arizona](https://marisstella.app/pay-app-guides/arizona-lien-waiver-forms.html) (4 forms),
[California](https://marisstella.app/pay-app-guides/california-lien-waiver-forms.html) (4),
[Florida](https://marisstella.app/pay-app-guides/florida-lien-waiver-forms.html) (2),
[Georgia](https://marisstella.app/pay-app-guides/georgia-lien-waiver-forms.html) (2, printed at
the 12 point minimum its statute sets),
[Massachusetts](https://marisstella.app/pay-app-guides/massachusetts-lien-waiver-forms.html) (1),
[Michigan](https://marisstella.app/pay-app-guides/michigan-lien-waiver-forms.html) (4),
[Mississippi](https://marisstella.app/pay-app-guides/mississippi-lien-waiver-forms.html) (2),
[Missouri](https://marisstella.app/pay-app-guides/missouri-lien-waiver-forms.html) (1, residential),
[Nevada](https://marisstella.app/pay-app-guides/nevada-lien-waiver-forms.html) (4),
[Texas](https://marisstella.app/pay-app-guides/texas-lien-waiver-forms.html) (4),
[Utah](https://marisstella.app/pay-app-guides/utah-lien-waiver-forms.html) (2) and
[Wyoming](https://marisstella.app/pay-app-guides/wyoming-lien-waiver-forms.html) (1).

Each page also says, in a table at the top, which kinds of waiver the state prints **no** form for.
Utah has no unconditional form, Florida and Wyoming no conditional one, Massachusetts no final or
unconditional one. A GC's form that fills one of those gaps is not the statute's wording, so read
it before you sign it.

**How we kept the text honest.** The forms are not retyped. The pages are generated from the
same encoded statute text that PayApps' waiver printer uses, which has tests comparing every form
with the statute as a whole, sentence by sentence. A second test checks that every sentence of
every form appears on its state's page, so the page cannot drift from the statute's text as we
read it (2026-11-25 for most states, 2026-11-26 for Georgia, Mississippi and Massachusetts).
Statutes change, so each form links the official section to check before relying on it.
