---
title: "74 e-invoice validation errors explained in English, German and French, checked against the rules themselves"
seo_title: "74 e-invoice errors explained in EN, DE and FR"
date: 2026-11-24
tags: [einvoice-preflight, e-invoicing, xrechnung, peppol, ventures]
description: "One page per XRechnung, EN 16931 and Peppol rule in three languages. Each is built from the official rule text and the code that runs it, not the message."
---

When a portal or a Peppol access point rejects an e-invoice, the reply is a
rule id and one line of jargon: `[BR-DE-15] Das Element "Buyer reference"
(BT-10) muss übermittelt werden`, or `PEPPOL-EN16931-R003`. People then paste
that line into a search engine. [E-invoice Preflight](https://marisstella.app/einvoice-preflight/)
now has a page for each of 74 such rules, in
[English](https://marisstella.app/einvoice-preflight/rules/en/),
[German](https://marisstella.app/einvoice-preflight/rules/de/) and
[French](https://marisstella.app/einvoice-preflight/rules/fr/).

Each page covers:

- what the rule checks, in plain words;
- the usual causes and how to fix the file;
- a minimal corrected UBL snippet, plus a CII one where the syntax differs;
- a link to the free checker, which runs the same official rules in the browser.

The 74 rules are all 39 BR-DE rules in KoSIT's XRechnung Schematron v2.6.0,
22 EN 16931 rules (validation-1.3.17) and 13 Peppol BIS Billing 3.0.22 rules.
We chose the EN 16931 and Peppol rules ourselves, from the ones our checker's
examples and fixes hit most. We have no measured search volume behind that
choice.

## The message is not the rule

Every explanation was written from the rule's XPath test, not its message.
The two disagree more often than you would expect:

- **BR-DE-18 (Skonto)** accepts `#SKONTO#TAGE=14#PROZENT=2.00#` only when a
  line break follows it. The same line at the end of the note fails, and so
  does `2,00` with a comma. We put the page's snippet and both mistakes into
  an XRechnung invoice and ran the official rules: the snippet passes and
  both mistakes fire BR-DE-18.
- **BR-DE-28** says the e-mail address needs at least two characters on each
  side of the `@`, but its pattern accepts one before it.
- **BR-DE-24-a and BR-DE-25-a** say "exactly" one card or direct-debit group;
  the test only checks that one is there.
- **BR-S-09 and BR-CO-17** tolerate a difference of up to one currency unit,
  not one cent, so they catch only sums that are clearly wrong.
- **BR-61 in CII** fires only when an account block already exists. A CII
  file with code 58 and no account at all passes that rule.
- **BR-AE-10** wants a reverse-charge reason, but the test only checks that
  some reason code or text is present.

Each page states its quirk rather than repeating the message.

## Tied to the release it cites

The official message and severity on each page are read at build time from
the compiled official Schematron the checker runs. A test fails when a rule id
is not in that set. A second test fails when the compiled sets are rebuilt from
an upstream commit other than the one each page cites. So a page cannot cite
XRechnung v2.6.0 while the checker runs a newer release. The tag-to-commit
mapping was read from the upstream repositories:

| Rule set | Release | Commit |
|---|---|---|
| EN 16931 | validation-1.3.17 | 6e35e0a |
| Peppol BIS Billing 3 | 3.0.22 | 38d693d |
| XRechnung (KoSIT) | v2.6.0 | 7e3ddbe, one commit after the tag, changing only the changelog and build file |

## What it is not

The pages are not tax advice. They say what a file must contain for the VAT
category you already chose, never which category applies to your sale. A
paid service that explains every failed rule in your file and proposes a
corrected one is in development (early access only, not on sale), and each
rule page links to it.

## Update, 25 November: our checker now agrees with its own BR-CO-17 page

The BR-CO-17 page above says the official test accepts a VAT amount less than
one currency unit away from taxable amount × rate. Our own built-in check did
not: it blocked a breakdown row a single cent off, and then the tax total
that added those rows up. That is exactly what happens when accounting
software rounds VAT on each line and adds the lines (3 × 10.07 at 19 % gives
3 × 1.91 = 5.73; the rate applied to the total, 30.21, gives 5.74). The
official rules accept that invoice, so we were telling bookkeepers to "fix"
a valid file.

Now a row within the official tolerance shows as a **warning** with the exact
figure, in case you want to match it, and the file passes. A full unit off,
an amount with the wrong sign, or a tax total that disagrees with its own
rows still fails. We tested it on 600 generated UBL and CII invoices with
every VAT row moved by between 0.01 and 1.00 and compared the result with the
official CEN rules the tool bundles: before the change 477 valid files were
blocked, after it none, and every file the official rules reject is still
rejected. The files were generated, not taken from real ERPs, and Peppol PINT
(Singapore, Australia, Oman and others) and Saudi ZATCA invoices keep the
exact check because their own rule sets apply.
[Method and numbers](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/einvoice-preflight/eval/brco17-tolerance-2026-11-25.md).
