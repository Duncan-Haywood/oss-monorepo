# Privacy baseline: the law is the bar

The owner's direction (2026-11-01): "update the privacy policies to not be so
restrictive on myself. use gdpr and other privacy laws as the guideline, not an
overly strict self-imposed one." It restates the 2026-10-20 one ("follow laws
but going beyond them is too much"), recorded in
[`prompts/goals.md`](../../prompts/goals.md). Restated 2026-11-24: "keep the
privacy policies to be legally compliant but not overly restrict normal
analytics practices."

So this file sets the line for every product, page and counter in the
repository. It replaces the house rules that went further than the law. Three
things stay fixed because they are liability, not taste:

1. **Do what the law requires** where the visitor is (GDPR, UK GDPR, ePrivacy
   and PECR, CCPA/CPRA and the other US state laws, COPPA, CAN-SPAM, CASL).
2. **The privacy copy is accurate.** A page says what it collects, why, who
   receives it and how long it is kept, and the code does exactly that. A
   false privacy claim is a consumer-protection problem (FTC Act s.5, the UK
   CPRs, EU UCPD) as well as a GDPR one, whichever way it errs.
3. **Nothing personal is committed to this repository.** That is not a legal
   rule; it is the practical consequence of the repository being public. What
   is committed is aggregate (counts per day, page, channel, country or device
   class).

Everything else in this file is the legal floor, written as what you may do.
It is a working summary, not legal advice. When a product does something new
with personal data, read the cited article rather than this paraphrase.

## What you may do, and what the law asks for it

| You want to | Allowed? | What the law asks |
|---|---|---|
| Store a setting, saved inputs, a cart, a login session, a referral code in a cookie or `localStorage` | Yes, no banner | Strictly necessary for a service the visitor asked for (ePrivacy art. 5(3), PECR reg. 6 exemption). Name it in the privacy copy. |
| Count page loads, events, referring-site class, country, device class, server side, with nothing stored on the device | Yes, on by default, no banner | Truly anonymous aggregates are not personal data (GDPR recital 26). The request itself carries an IP, so process it under legitimate interests and don't keep it. |
| Use a cookieless analytics vendor (Cloudflare Web Analytics, Plausible, similar) | Yes, no banner | Legitimate interests (GDPR art. 6(1)(f)), a processing agreement (art. 28; the vendor's standard DPA), name the vendor in the copy. |
| Use analytics that puts an identifier on the device (returning visitors, A/B buckets, funnels, GA-style cookies) | Yes, with consent in the EU/UK | Prior opt-in consent from EU visitors (ePrivacy 5(3)), a reject as easy as accept, no pre-ticked boxes. UK: the Data (Use and Access) Act 2025 added a statistical-purposes exemption to PECR (new Schedule A1), reported in force from 5 February 2026: first-party analytics may run without consent if the visitor is told clearly and given a simple, free way to object; advertising and cross-site tracking still need consent. Read Schedule A1 before relying on it (see "Changes in the law since 2026-11-01"). |
| Keep server logs with IP addresses and user agents | Yes | Legitimate interests (security, abuse, debugging), a stated retention (30 days is a common, defensible default), disclosed in the copy. Never committed to the repository. |
| Accounts, email sign-ups, a waitlist | Yes | A lawful basis (contract for the account, consent for marketing email), a privacy notice at collection (GDPR art. 13), a way to delete the account. Marketing email: consent or the soft opt-in (PECR reg. 22), an unsubscribe link and a postal address (CAN-SPAM), CASL consent for Canada. |
| Process what a user types or uploads on a server (an AI feature, a file conversion) | Yes, when the feature needs it | Contract or legitimate interests, say so plainly on the page, name the processor (an LLM provider, say), state retention. The zero-per-user-cost rule in `PRODUCT_PLAYBOOK.md` is a separate, financial rule and still applies. |
| Send data to a processor or host outside the EU/UK | Yes | A transfer mechanism: the EU-US Data Privacy Framework if the vendor is certified, or the vendor's standard contractual clauses (GDPR ch. V). |
| Ignore Do Not Track for anonymous aggregate counts | Yes | DNT has no legal force. CalOPPA only asks a site to *say* how it responds. |
| Ignore Global Privacy Control for anonymous first-party counts | Yes | GPC is a legally binding opt-out of *selling or sharing* personal data for cross-context advertising (CCPA/CPRA, Colorado, Connecticut and others). First-party aggregate counting is neither. If a product ever sells or shares data or runs targeted ads, it must honour GPC. |
| Session replay, heatmaps that record keystrokes or mouse paths, or a third-party pixel (Meta, TikTok, LinkedIn, Google Ads) | Legal with the right consent, but the riskiest row in this table | EU/UK: prior consent (they set or read identifiers). US: no consent law requires a banner, but plaintiffs sue site owners under wiretap and pen-register laws (California's CIPA ss. 631 and 638.51 and similar state laws) for letting a third party see what visitors do. Not worth it for this portfolio: prefer first-party or cookieless analytics. If a product ever needs one, put it behind consent everywhere and name it in the copy. |
| Analytics on a health-related page (a symptom, medication, fertility or therapy tool) | Anonymous aggregate counts, yes | Washington's My Health My Data Act (and Nevada's and Connecticut's equivalents) treat data linkable to a person that reveals a health condition, including one inferred from which page they used, as consumer health data: collecting it needs consent, and Washington's law has a private right of action. A page-load tally with no identifier is not linkable; an identifier, pixel or replay script on such a page is. |
| Ads, affiliate links, selling data | Ads and affiliate links yes; selling data only if a product truly needs it, which none does today | Targeted ads need consent in the EU/UK and a "Do Not Sell or Share" path plus GPC in California and similar states. Affiliate links need the FTC disclosure (`goals.md`). |

## What a privacy notice must say (GDPR arts. 13 and 14)

A product that collects personal data on a server needs a privacy page (or a
section) that says, in plain words:

- who is responsible and how to reach them (a contact address);
- what is collected, for what purpose, and the lawful basis for each;
- who receives it (hosts, processors) and whether it leaves the EU/UK;
- how long each kind is kept;
- the visitor's rights (access, correction, deletion, objection, portability,
  withdrawing consent) and the right to complain to a supervisory authority;
- for California residents of a covered business: the categories collected and
  whether any is sold or shared.

A product that collects nothing on a server (most of the catalogue: the tool
runs in the browser) needs only an accurate short line saying so, plus what it
keeps in the visitor's own browser.

## Obligations that come with collecting more

These are owner-level and only start when a product actually collects personal
data on a server:

- **Answer rights requests** within one month (GDPR art. 12).
- **Report a breach** to the supervisory authority within 72 hours when it is
  a risk to people (art. 33).
- **An EU/UK representative** (art. 27) is needed by a non-EU controller that
  regularly processes EU residents' data; occasional, low-risk processing is
  exempt. Accounts or a mailing list aimed at EU users would cross it. That is
  an owner decision (it costs money): put it in the decision queue rather than
  ship around it.
- **CCPA/CPRA applies** only above its thresholds (about $26.6M revenue,
  100,000 California consumers or households, or half of revenue from selling
  or sharing data). The portfolio is far below them today; re-check when that
  changes.
- **Children:** the products are general-audience. Do not knowingly collect
  personal data from children under 13 (COPPA) or below the GDPR age of digital
  consent in the visitor's country (13 to 16).

## What changed on 2026-11-01

The house rules this replaces, each now an option rather than a requirement:

- "Honour `DNT`/`Sec-GPC` and offer an off switch for counting" was a must in
  `portfolio/usage/README.md`. It is now optional for anonymous aggregates.
  Honouring them stays **required** for anything that sells or shares data, and
  the copy must describe whichever the code does. Existing products keep their
  switches; nobody has to strip them out, and a page that promises them must
  keep the promise (`platform/privacy/` checks that).
- "Don't retain IPs or user agents" is now "keep them only as long as a stated
  purpose needs, disclose it, never commit them".
- "No content" for counters stays for counters (a count needs none) but no
  longer reads as a ban on server-side features that process what a user
  submits.
- An analytics vendor no longer has to sit behind consent by default: a
  cookieless one needs none; one that sets an identifier needs EU/UK consent.

When this file was written the public site's counter still skipped DNT and GPC
browsers. That changed on 2026-11-24 (below).

## What changed on 2026-11-24

The owner, restating the direction: "keep the privacy policies to be legally
compliant but not overly restrict normal analytics practices." The one place the
live site still went past the law was its page-load counter, which dropped every
browser sending Do Not Track or Global Privacy Control. Brave and DuckDuckGo send
GPC by default and Firefox offers it as a setting, so the totals systematically
under-read the audience distribution work most needs to see.

- **The first-party counter now counts DNT and GPC browsers.** The tally holds
  one number per page, day, channel, referring-site kind, country and device
  class, with no identifier, so it is neither a sale nor a share (GPC) and DNT
  has no legal force. The site's own "Don't count my visit" opt-out still stops
  the beacon, which also satisfies the UK statistical exemption's "simple way
  to object" if it were ever needed. Days before 2026-11-24 read lower; the
  `unit` text in `portfolio/usage/site-visits.json` says so.
- **The local-only tallies are unchanged:** they never leave the browser, and
  DNT/GPC still switch them off, so every per-venture promise checked by
  `platform/privacy/` stays true.
- **The copy says exactly this** (`disclaimerHtml` and the About page in
  `platform/pages/build.mjs`, `platform/edge/README.md`,
  `platform/counter/README.md`). CalOPPA asks only that a site say how it
  responds to DNT, and it now does.
- **The business template's guardrail** no longer demands a consent banner for
  every third-party analytics tool, only for ones that store an identifier.

## Changes in the law since 2026-11-01

Checked 2026-11-24. legislation.gov.uk and ico.org.uk were not reachable from
the session that wrote this, so the UK and EU items rest on secondary sources
and say so; read the primary text before a product relies on either exemption.
Nothing the portfolio does today depends on them, because it stores no
analytics identifier on any device.

- **UK, in force (reported):** the Data (Use and Access) Act 2025's PECR
  changes (s. 112 and Sch. 12, inserting Schedule A1) are reported to have
  commenced on 5 February 2026 under SI 2026/82, along with PECR fines raised to
  the UK GDPR level (up to GBP 17.5m or 4% of turnover). The new exemptions
  include analytics for improving a service, on condition of clear information
  and an easy, free way to object. Secondary sources disagree on how many
  exemptions there are; the ICO's final storage and access technologies guidance
  is reported as published on 29 April 2026.
- **EU, not law yet:** the Commission's Digital Omnibus (November 2025) proposed
  a consent exemption for aggregated first-party audience measurement in a new
  GDPR article 88a. The Council's mandate (reported 21 October 2026) moved it
  into a rewritten ePrivacy article 5(3) instead, limited to anonymous aggregate
  measurement. Until a final text is adopted and in force, ePrivacy 5(3) as it
  stands applies: an analytics identifier on the device needs EU consent.
- **California, confirmed:** the CCPA "business" threshold is USD 26,625,000 in
  worldwide revenue, CPI-adjusted from 2025 (cppa.ca.gov, "Updated Monetary
  Thresholds"); the next adjustment falls in 2027.
