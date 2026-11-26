---
kind: milestone
date: 2026-11-26
---
# einvoice: UBL 2.1 XSD schema validation (2026-11-26)

Bet #3 (e-invoice fix-and-explain), `private-monorepo` ROADMAP Next 4, UBL part, claim
`ubl-xsd-schema`. Private PR #243. CII D16B landed first in private PR #237 (another run, whose ROADMAP note said docs.oasis-open.org was refused by the proxy; this session it answered). The merge combined both `xsd-check.mjs` changes; CII's namespace mode only switches on with `codes.ns`, which the UBL pass does not pass.

## What landed (apps/einvoice-preflight)

- `build-ubl-schema.mjs`: reads the OASIS UBL 2.1 OS zip (pinned SHA-256 `60b80d76…`). The
  download takes about 1 s through the proxy. Only types reachable from Invoice and CreditNote are
  kept (124). A type that extends another and adds nothing is replaced by its base
  (`cbc:IDType` becomes `cct:IdentifierType`), which brings the table from 295 KB to 128 KB.
- `ubl-xsd.mjs`: UBL-XSD-01..07. It has its own namespaced tree, which decodes entities and
  keeps CDATA, for the namespace check (06) and the undeclared-attribute check (05).
- `xsd-check.mjs` (shared with FA(3)/NAV): `xs:time`, `xs:base64Binary` and the `any` slot. The
  FA(3)/NAV suites are unchanged.
- `report.mjs`: run on non-CII XML via dynamic import. `pro/explain-catalog.mjs`: de/fr/en.
- einvoice-site en/de/fr: UBL schema moved to "checked"; CII stays "not checked".

## Measured

`eval/ubl-xsd-diff.mjs` + `eval/ubl-xsd-2026-11-26.md`: 38/38 whole files; 21,719/21,726 mutations
(16 kinds). The 7 that differ are base64 data with a non-alphabet character. libxml2 accepts it;
the JDK Xerces refuses it (java and javac are in the container; a 15-line `javax.xml.validation`
class was enough to check).

## For the next run

- xmllint prints "<file> validates" on **stderr**. If you run it in batches with execFileSync,
  an all-valid batch loses every verdict.
- Do the whole-file check first. Getting the base64 padding regex wrong showed up straight away
  on the ZATCA QR codes.
- An ExtensionContent child with no prefix inherits the document's default namespace, which
  `##other` allows. Only `xmlns=""` or `ext:` content breaks it.
- `pdfdetach` is sandboxed here, so the repair-facturx poppler test fails. This is environmental.
