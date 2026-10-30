---
title: "Start here: E-invoice preflight, catch the rejection before the portal does"
date: 2026-10-29
tags: [start-here, einvoice-preflight, e-invoicing, bookkeeping]
description: "Who the free e-invoice preflight is for, what it checks in XRechnung, Peppol, UBL, CII and Factur-X files, your first ten minutes, and its limits."
---

If an invoice you sent came back from a buyer's portal with a code like
`BR-CO-15` or `BR-DE-2`, or you are about to send your first structured
e-invoice and would rather not find out the hard way, this post is for you.
It explains what E-invoice preflight checks, who it helps, how to check a
file in a few minutes, and where its word stops counting.

## Who it is for

- A bookkeeper who sends invoices for clients to German public bodies
  (XRechnung) or across the Peppol network, and keeps getting files bounced.
- A small business in a country where structured e-invoices are becoming
  compulsory and a PDF no longer counts, wondering what the new file has to
  contain.
- An ERP or invoicing-software developer who wants a check that runs in a
  build pipeline before anything reaches a customer.
- Someone selling to French buyers who needs the SIREN or SIRET digits and
  the mentions French invoices must carry to be right.

## The problem, in your words

"The portal said 'rejected' and gave me a rule number." "The totals look
right to me, so why does it say the tax does not match?" "I don't want to
upload my customers' invoices to a website just to find out what's wrong."

The rules are written for software, the messages are terse, and most
validators either want your file on their server or a paid subscription.

## What you get

**The fault, the rule and the fix.** Drop in an invoice and it lists what a
receiving portal would reject: totals that do not add up, a tax breakdown
that does not match the lines, an IBAN or VAT number that fails its
checksum, a due date before the issue date, a missing buyer reference or
seller contact. Each finding names the rule and says in plain English what
to change, such as "Set gross total to 396.60".

**The official rules, in your browser.** Beside its own checks, it can run
the official EN 16931 rules and, when your file says it is XRechnung or
Peppol BIS Billing 3, the German KoSIT and OpenPEPPOL rules too. Those run
on the page itself; the invoice does not leave your computer. Some national
rule sets also run on UBL files that name them, among them the Dutch
NLCIUS, Romania's CIUS-RO, Portugal's CIUS-PT and Saudi Arabia's ZATCA rules.

**Formats it reads.** A simple JSON draft, UBL XML, UN/CEFACT CII
(XRechnung CII, Factur-X XML) and Factur-X or ZUGFeRD PDFs, which it unwraps
to find the XML inside. Italy's FatturaPA and Poland's KSeF FA(3) files are
read by their own rule sets.

**A list you can work through.** Copy a checklist, or download the results
as Markdown, JSON or a remediation CSV with one row per rule.

**Arithmetic repair, and a way to make the file.** It can recompute line
nets, tax and totals for you, and it never guesses tax rates, dates or
identities. A separate page builds an XRechnung or Peppol invoice from a
form, so you can produce the file without an invoicing subscription.

## Your first ten minutes

1. Open https://duncan-haywood.github.io/oss-monorepo/einvoice-preflight/.
   No account, no upload.
2. Under **Try a broken example**, press **Load a broken example** and then
   **Check invoices**. Read the findings: each has a rule id and a fix. This
   shows you what a bad result looks like before you try your own file.
3. Drop your own file into **Invoice to check**: an XML (UBL or CII), a
   Factur-X or ZUGFeRD PDF, or a JSON draft.
4. Tick the profile that matches your buyer: **Also apply the German
   XRechnung rules**, **Also apply the Peppol BIS Billing 3.0 rules** or
   **Also apply the French rules**.
5. Tick **Also run the official EN 16931 Schematron** to add the official
   rules, then press **Check invoices**.
6. Fix what the **Preflight result** lists in your invoicing software, and
   check again until it is clean. To hand the list to someone else, use
   **Copy checklist** or **Download remediation CSV**.
7. If the faults are only arithmetic, try the **Repair the arithmetic**
   section, which recomputes the amounts and lists what only a person can fix.

To make a new invoice instead, open
[Create an XRechnung or Peppol e-invoice](https://duncan-haywood.github.io/oss-monorepo/einvoice-preflight/create.html),
press **Load example** to see the shape, fill in seller, buyer and lines
(**+ Add line**), then **Create e-invoice** and **Download XML**. Run the
file through the checker, and then through your network's own validator,
before you send it.

## How it was tested

The README lists where its own rules raised false alarms on files that are
known to be valid, and what was fixed: the 41 official EN 16931 example
invoices, the 72 valid documents in the German XRechnung test suite, the
Peppol BIS 3.0 examples and the community ZUGFeRD corpus, among others. Most
of what still fires on those files is their placeholder data, such as
sample VAT numbers and IBANs that fail their checksums. On the bundled
examples, the official examples and 353 randomly edited copies, the two
ways it runs the official rules agree rule for rule. That tells you the
checks are careful; it does not make a pass an acceptance.

## What it costs and where your data goes

It is free and MIT licensed (the official rule data keeps its own EUPL,
Apache and MPL licences). On the page everything runs in your browser and
the invoice is never uploaded. The command line works locally too and keeps
no invoice data; its usage count is off unless you switch it on, and even
then holds only event counts. There are no accounts, cookies or analytics
vendors.

If your team wants a shared endpoint, there is an API you run yourself
(`POST /v1/validate`, with Docker and Render files in the folder), protected
by your own `EINVOICE_API_KEY`. See
[the self-hosting post](2026-10-29-start-here-self-hosting.md).

## What it does not do

- It is not tax, legal or accounting advice, and it is not a certified
  validator or an access point.
- It does not sign, submit, archive or transmit invoices.
- A clean result is not an acceptance by any portal or tax authority. Run
  the official validator for your network before sending.
- It does not decide whether a VAT rate is legally right. It checks the
  arithmetic for the rate you used.
- It does not look anything up: no VIES VAT registration check, no bank
  lookup, no Leitweg-ID or Peppol participant lookup. Numbers are checked
  only against their published check digits.
- Some national profiles are not checked, including Spain's Verifactu
  records. ZUGFeRD 1.0 PDFs are refused. Each country page says what is and
  is not covered.
- Mandate dates on the country pages are summarised from public sources and
  change. For example, the README notes that Germany requires businesses to
  receive e-invoices and makes sending them compulsory from 2027 (2028 for
  small firms). Check the authority before you plan around a date.

## Where to go next

- The checker: https://duncan-haywood.github.io/oss-monorepo/einvoice-preflight/
- Looking up a code:
  [What does this e-invoice error code mean?](https://duncan-haywood.github.io/oss-monorepo/einvoice-preflight/what-does-this-e-invoice-error-code-mean.html)
- Which countries require what:
  [e-invoicing mandates by country](https://duncan-haywood.github.io/oss-monorepo/einvoice-preflight/e-invoicing-mandates-by-country.html),
  with pages such as [Germany](https://duncan-haywood.github.io/oss-monorepo/einvoice-preflight/germany-e-invoice-mandate.html)
  and [France](https://duncan-haywood.github.io/oss-monorepo/einvoice-preflight/france-e-invoice-mandate.html)
- A common rejection, explained:
  [how to calculate a mixed-VAT-rate tax breakdown](https://duncan-haywood.github.io/oss-monorepo/einvoice-preflight/how-do-you-calculate-a-mixed-vat-rate-tax-breakdown.html)
- The README, command line, API and every measurement:
  `ventures/einvoice-preflight/README.md`
- Keeping the books those invoices land in:
  [the AI Bookkeeper start-here post](2026-10-29-start-here-ai-bookkeeper.md).
  Calling the checker from an agent:
  [AI agents and MCP](2026-10-29-start-here-ai-agents-and-mcp.md).
- Back to [the start-here series](2026-10-29-start-here.md).
