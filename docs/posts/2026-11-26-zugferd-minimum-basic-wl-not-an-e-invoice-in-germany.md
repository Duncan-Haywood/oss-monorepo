---
title: "ZUGFeRD MINIMUM and BASIC WL are not e-invoices in Germany, and our checker now says so"
seo_title: "Is ZUGFeRD MINIMUM an e-invoice in Germany? No: BASIC WL neither"
date: 2026-11-26
tags: [for-customers, einvoice-preflight, e-invoicing, zugferd, factur-x, xrechnung, germany, france, accountants]
description: "The BMF counts XRechnung and ZUGFeRD from 2.0.1 as e-invoices except MINIMUM and BASIC WL. How to spot the profile, and what our checker reports."
---

Many German invoicing programs can export a ZUGFeRD PDF. Fewer of them say
which ZUGFeRD *profile* they export. In Germany the profile decides whether
the file counts as an e-invoice at all.

**The rule.** The Federal Ministry of Finance's e-invoice FAQ says that
XRechnung and ZUGFeRD from version 2.0.1 meet the requirements of an
e-invoice, *except the ZUGFeRD profiles MINIMUM and BASIC-WL*
([BMF, "Fragen und Antworten zur Einführung der obligatorischen E-Rechnung"](https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html)).
We read that page through a search restricted to the BMF's site on
2026-11-24, not by opening it directly, so check the current wording there.
MINIMUM and BASIC WL carry header totals and no invoice lines, which is why
they fall short of EN 16931.

**How to tell which profile a file uses.** Inside the XML (the
`factur-x.xml` or `zugferd-invoice.xml` attached to the PDF), the guideline
identifier, business term BT-24, names it:

| BT-24 ends in | Profile | An e-invoice in Germany? |
|---|---|---|
| `:minimum` | MINIMUM | no |
| `:basicwl` | BASIC WL | no |
| `urn:cen.eu:en16931:2017` | EN 16931 (COMFORT) | yes |
| `…#conformant#urn:factur-x.eu:1p0:extended` | EXTENDED | yes |
| `…#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0` | XRECHNUNG | yes |

A plain PDF with no XML attached is not an e-invoice either. During the
transition periods (to the end of 2026, and of 2027 for issuers with
prior-year turnover of at most €800,000) another kind of invoice is still
allowed, but from 2028 every domestic B2B invoice must be an e-invoice.

**What changed in our checker.** The paid e-invoice workspace for
accountants (early access, not yet open) now reports rule `PRO-DE-001` when a
MINIMUM or BASIC WL file comes from a seller whose address is in Germany. It
also reports it when you chose the XRechnung rules. It reads the profile from
the parsed invoice, so a Factur-X PDF gets the same check as bare XML. The
explanation comes in German, French or English. The fix it suggests is to
export the invoice in the EN 16931, EXTENDED or XRECHNUNG profile. It does
not rewrite the file: a MINIMUM file has no lines, so there is nothing to
convert from.

The free [e-invoice preflight](https://marisstella.app/einvoice-preflight/)
does not apply this German rule. It accepts the missing lines in MINIMUM and
BASIC WL as part of those profiles' design.

**Why we wrote this now.** The product site's list of "what is checked"
already promised this check, but the check did not exist yet. On 2026-11-26
we compared that list line by line with the code. We built three promised
checks: this one, a real "detect from the file" choice of national rules,
and the official EN 16931 Schematron in the workspace. Two claims could not
be backed, so we took them off the list: full XSD schema validation (now
listed as *not* checked) and fixes to totals, which the checker never makes.

**Update, later the same day: each profile's own schema.** Since then, the
schema checks have been built. A MINIMUM or BASIC WL file is now checked
against the XSD for its own profile, taken from the Factur-X 1.0.9 package.
It is not checked against the EN 16931 one. This matters even outside
Germany. Both profiles are cut-down versions of the full format. An element
or attribute that is fine in an EN 16931 file can be refused in a BASIC WL
file. Invoice lines are one example. Another is a `listID` attribute on the
currency code, which the BASIC WL schema does not have. A validator that
runs the schema refuses such a file before any business rule. The checker
now reports the element and the reason, under the same rule ids as the
EN 16931 schema check (CII-001 to CII-007). EXTENDED files get their own
schema too.

We compared it with libxml2's validator on the same schemas. We used 12
published sample files and 1,199 copies of them, each altered at random
(elements swapped, removed or duplicated, wrong namespaces, decimal commas,
stray attributes). The checker gave the same verdict on every one.

**Update, also 2026-11-26: France's EXTENDED-CTC-FR.** France's reform has its
own extended profile. Its BT-24 ends in
`#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr`. The checker now checks
those files against their own schema too. That schema is not a cut-down
Factur-X one. It is a full UN/CEFACT CrossIndustryInvoice D22B schema,
published with the profile and taken here from the same package. Until now
such a file got no schema check here at all, only the French business rules.
Now it gets the same CII-001 to CII-007 checks.

Two things the D22B schema allows may surprise you:

- The invoice number (BT-1) is optional in the schema itself. The profile's
  business rules require it, and those still run.
- Code elements may carry `listVersionID`.

Neither is reported as a schema error, which is how libxml2 treats them as well.

We tested it on the five EXTENDED-CTC-FR sample invoices that FNFE-MPE
publishes and on 1,499 randomly altered copies of them. The verdict matched
libxml2 on every file. Code lists are still left to the business rules, as
for the other profiles.

This is not tax advice. Whether a particular invoice must be an e-invoice
depends on the transaction and the dates above; your tax adviser decides.
