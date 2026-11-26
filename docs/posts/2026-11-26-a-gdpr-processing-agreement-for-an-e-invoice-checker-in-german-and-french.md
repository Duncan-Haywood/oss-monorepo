---
title: "Before an accountant uploads client e-invoices: the processing agreement, now in German and French"
seo_title: "E-invoice checker DPA (Art. 28 GDPR) in German and French"
date: 2026-11-26
tags: [einvoice-preflight, for-customers, e-invoicing, gdpr, xrechnung, factur-x, accountants]
description: "An accountant checking clients' e-invoices passes on their personal data, so GDPR Art. 28 needs a processing agreement. Ours now reads in German and French."
---

A German Steuerberater or a French expert-comptable who uploads a client's
e-invoice to an online checker hands over that client's personal data: names,
addresses, VAT numbers, IBANs, sometimes a sole trader's home address. Under
Article 28 of the GDPR, the checker is then a processor (Auftragsverarbeiter,
sous-traitant). The accountant may only use it once a processing agreement is
in place. If the agreement is in English only, someone at the firm has to read
a legal text in a second language before they can try the service.

The hosted workspace for [E-invoice Preflight](https://marisstella.app/einvoice-preflight/)
now publishes its three legal pages in German and French as well as English:
the Terms, the Privacy Policy and the processing agreement (Data Processing
Agreement / Auftragsverarbeitungsvertrag / accord de sous-traitance). The
workspace is not open to the public yet. Its hosting provider is now chosen
and named (below), and the deploy is built but has not been run. This post says
what the agreement commits to, so a firm can judge it before it opens.

## What the agreement says, in short

- **It applies from sign-up, without a signature.** The Terms incorporate it.
  A copy signed by both parties is available on request, with the same terms.
- **All of Article 28(3), points (a) to (g):** staff bound by confidentiality,
  the technical and organisational measures listed in Annex II, sub-processors
  only with authorisation, help with data subject requests, help with breach
  notices and impact assessments, deletion at the end, and audits.
- **30 days' notice of a new sub-processor,** with a right to object, and to
  cancel with a pro-rata refund if the objection is not resolved.
- **Breach notice without undue delay,** in the workspace and by email.
- **The transfer to the United States** runs on the EU Standard Contractual
  Clauses of Implementing Decision (EU) 2021/914. It uses Module Two when the
  firm is a controller and Module Three when it acts as processor for its
  clients, which is the usual case for an accountant. The law of the firm's
  own Member State governs, or Ireland's where that law gives third parties no
  rights. The UK Addendum and the Swiss adaptations are included. It does not
  rely on the EU-US Data Privacy Framework.

## What the annexes describe is what the code does

The annexes describe the processing, and a test fails the build if they stop
matching the code:

- **Invoice contents are not stored.** Each invoice is read in memory. The
  corrected file and the diff go back to the user and are not kept. The
  history keeps file names, sizes, SHA-256 hashes and rule ids.
- **The AI model never sees the invoice.** Most findings have a built-in
  explanation, so nothing is sent. For the rest, Anthropic receives the rule
  id, the finding's message (which can quote one value, such as a date or an
  identifier), the proposed fix and the language. The explanation cache lives
  only in the server's memory and holds at most 5,000 entries.
- **What does not exist yet says so.** Anything the service does not do yet is
  marked "not in place yet" in the annexes rather than described as done.

## Where the data is held (added 2026-11-26)

The hosting provider is **Cloudflare, Inc.** The Privacy Policy and the
agreement's Annexes I, II and III name it in all three languages:

- **The database is stored in the EU.** It is a Cloudflare D1 database
  created in D1's EU jurisdiction. Under that setting the database runs and
  stores its data only inside the European Union
  ([Cloudflare's documentation](https://developers.cloudflare.com/d1/configuration/data-location/)).
  A jurisdiction can only be chosen when a database is created, so the deploy
  script creates it that way. It stops if it finds an existing database in
  another jurisdiction.
- **Requests are handled at the nearest Cloudflare data center,** which can
  be outside the EU. The annex says so instead of promising EU-only
  processing.
- **Encryption at rest:** D1 encrypts the live database and its history with
  AES-256 in GCM mode, using keys Cloudflare manages
  ([data security](https://developers.cloudflare.com/d1/reference/data-security/)).
- **Backups:** D1's Time Travel feature is always on and can restore the
  database to any minute of the last 30 days
  ([Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)).
  So deleted client records disappear from that history within 30 days, and
  the agreement's deletion clause now says exactly that.
- **Logs:** Cloudflare's per-request logs are switched off. Those logs record
  each request's details, including the IP address, and the Privacy Policy
  says IP addresses are never written down. Error logs (a short message, never
  an API key or an invoice) are kept for up to 7 days and may be stored outside
  the EU.

## The translations, and their limits

The translations are for convenience, and each one says so at the top: the
English text governs. The standard contractual clauses themselves apply in the
version published in the Official Journal. The GDPR vocabulary follows the
regulation's official German and French texts (Auftragsverarbeiter and
Unterauftragsverarbeiter; sous-traitant and sous-traitant ultérieur).

A translation must carry the same version date as its English text. If the
English text changes and a translation is not updated, the workspace stops
serving that translation and sends the reader to the English page. The test
suite also checks that each translation has the same headings, table rows and
numbers as the English: the 30 days, the 12 months, the 5,000 entries and the
clause numbers. A translation cannot quietly promise more or less than the
original.

No attorney or professional translator has reviewed these pages, and none of
this is legal advice. If your firm's data protection officer wants changes,
email hello@marisstella.app.
