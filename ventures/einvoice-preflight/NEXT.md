# einvoice-preflight: open items beyond flagships.yaml

`portfolio/flagships.yaml` caps a flagship's `next:` at 2000 characters, so it holds the items most worth starting. Open items moved out to make room are kept here by `portfolio/router/flagship_field.py --park`. Take one back into `next:` when it becomes the most useful thing to do, and delete it here when it lands.

## Parked from flagships.yaml `next:`

- (2026-11-16) a real Ginfes, Betha or DSF reply
- (2026-11-16) refresh the Bulgaria page when its draft passes
- (2026-11-17) ABRASF NFS-e 2.00-2.04 landed (README): open: ISS retained on a real file, city provider schemas, 1.0x sets, DSF, 12 single-file 1.0x (Rio, BH, Curitiba,...) landed (README): open: a DSF 1.00/Abaco file
- (2026-11-17) ISS: SP, Rio, Curitiba rates, Rio codes (ABR-026) landed: open: BH (hosts 403), a Rio rejection
- (2026-11-17) national NFS-e landed: open: a national rejection compared
- (2026-11-17) a real reform NF-e from a SEFAZ test environment, a real SEFAZ rejection for a cClassTrib
- (2026-11-17) cCredPres rules and cClassTrib at IT 1.71 landed (README): RTC events (211110, 12 others incl. 112120, 110001) landed, 211120 (removed in v1.40) flagged (README): open: a real event
- (2026-11-17) Mexico CFDI 4.0 landed: open: SAT's CP error matrix to map MX-070..080 to CP codes (omawww blocked), a real payroll or export file, a PAC rejection compared
- (2026-11-17) SK landed (README): open: a real SK file
- (2026-11-17) mandate texts: IL, ES, NRS, SRO 1852, Jordan open
- (2026-11-17) India's INV-01 check on a real IRP payload
- (2026-11-17) NLCIUS on a real Dutch file
- (2026-11-17) open: RO_CIUS on a real ANAF file
- (2026-11-18) open: a real business's PINT file
- (2026-11-18) repair keeps PDF/A (veraPDF 155/155), PDF/A-3b writer passes Mustang
- (2026-11-18) FA(3) KOR/ZAL/ROZ totals landed (README): open: a real KSeF rejection, a business's real KOR/ZAL file
- (2026-11-18) CIUS-PT: which validator does AT run (AA/RED codes)?
- (2026-11-18) HR: a real HR invoice, cash accounting
- (2026-11-18) SdI: open: a real FatturaPA rejection with its file
- (2026-11-18) ZATCA: a real KSA note
- (2026-11-18) a real business's signed Facturae or FACe rejection (eval/facturae-gob-*)

## From the quality audit of 2026-11-19

[`portfolio/quality/audits/2026-11-19-einvoice-preflight.json`](../../portfolio/quality/audits/2026-11-19-einvoice-preflight.json). The large-amount rounding defect is fixed (PR #17724); open:

- BR-CO-17: a VAT subtotal 0.01 off taxable x rate is a blocking INV-038/INV-018 here, while CEN's Schematron accepts it within one unit (151 of 600 random invoices). Downgrade to a warning or match CEN, and say so on the page.
- The page and the Python CLI do not run the same rules (Norway and Switzerland VAT, profiles, PDF checks are JS only; fix texts differ), though `checks.mjs` and the page say they do. Fourth audit to report it.
- CI runs `node --test` without slimdom and fontoxpath, so the 139 tests of the official route are skipped there.
- No test has a remainder-10 Bulgarian or Czech VAT number.
- The cent-rounding idiom is copied in seven files; one integer-cents helper would remove the class of bug.
