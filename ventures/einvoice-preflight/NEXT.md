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

[`portfolio/quality/audits/2026-11-19-einvoice-preflight.json`](../../portfolio/quality/audits/2026-11-19-einvoice-preflight.json). The large-amount rounding defect is fixed (PR #17724); BR-CO-17's one-unit tolerance is matched on the built-in route as a warning (2026-11-25, eval/brco17-tolerance-2026-11-25.md); remainder-10 BG/CZ VAT numbers are tested and cross-checked, 0 of 9,000 off vs python-stdnum (2026-11-25, eval/vat-remainder10-2026-11-25.md); open:

- The page and the Python CLI do not run the same rules (Norway and Switzerland VAT, profiles, PDF checks are JS only; fix texts differ), though `checks.mjs` and the page say they do. Fourth audit to report it.
- CI runs `node --test` without slimdom and fontoxpath, so the 139 tests of the official route are skipped there.
- The cent-rounding idiom is copied in seven files; one integer-cents helper would remove the class of bug.

## The flagship row as it stood before the 2026-11-24 bet ranking

On 2026-11-24 `portfolio/flagships.yaml` was re-ranked to the paid bets in `portfolio/monetization/bets.md`, and this venture's row now points deepening work at its private app. These are the free edition's open items from the old row, kept so none is lost; the free edition gets lead-magnet maintenance, not new depth.

- **next:** History: README and git (latest: Peppol BIS 3.1.0 readiness for a folder of sent invoices, page + CLI, 147-row rule diff (eval/peppol-readiness-2026-11-24.md); Peppol BIS Self-Billing 3.0.2/3.1.0 rules in place of Billing's (eval/peppol-self-billing-2026-11-18.md); Peppol BIS 3.1.0 preview, new findings marked, 1,138/1,138 unit asserts; fontoxpath format-integer padding fixed, ZATCA BR-CO-17/BR-S-09 (eval/peppol-bis-3.1.0-2026-11-18.md); open: a real sender's files through eval/peppol-next-diff.mjs; the browser's official rules read whitespace as Saxon does, 161 of 528 to 0 vs SaxonC-HE, XML-VALUE-01 on 160 of 160 Saxon aborts (eval/xml-whitespace-crosscheck-2026-11-17.md); INV-041 endpoint ids as OpenPeppol's PEPPOL-COMMON rules check them, 0 of 21,264 off (eval/endpoint-peppol-differential-2026-11-17.md); Peppol's warning-level IT/NL id formats as INV-061 warnings, 0 of 23,999 off (eval/endpoint-peppol-warnings-2026-11-17.md); INV-062/063: the same rules on PartyIdentification/CompanyID, GlobalID/legal org ID (eval/party-id-peppol-differential-2026-11-17.md); France Flux 10 e-reporting, PPF Annexe 7 controls 147/147 vs Saxon (eval/flux10-crosscheck-2026-11-17.md); open: a real Flux 10 file, a PPF rejection; BR-FR 264/264 vs Saxon, all 384 BR-FR/CDV messages in English (br-fr-error-codes.html); CDAR (BR-FR-CDV) 780/780 vs Saxon (eval/cdar-crosscheck-*); Extended-CTC-FR and Factur-X EXTENDED bases 175/175 vs Saxon (eval/extended-base-crosscheck-2026-11-17.md); open: a real PA extended file, CDAR _WARNING set (37/43 rules hit, 6 dead: FR-CDV-105..107 cover them), a real PA rejection or status; VERI*FACTU (README): open: a production SIF's records and replies). Open: a real HU report with NAV's businessValidationMessages or SCHEMA_VIOLATION text; HU: open: a real chain with NAV's replies. A run that lands a slice replaces its item here. More open items: NEXT.md.
- **buildable:** Peppol BIS 3.1.0 (in force 2027-02-24) runs as an opt-in preview, from OpenPeppol's branch 2026-Q4-QA2 at 90f078a, 1,138/1,138 unit asserts (eval/peppol-bis-3.1.0-2026-11-18.md). Once tagged (none 2026-11-24), rebuild peppol-next-* from the 3.1.0 tag on master (EINVOICE_PEPPOL_NEXT_BRANCH, build-plain-rules.mjs) and diff; peppol-sb-next likewise (Self-Billing, branch selfbilling-2026-Q4-QA2; eval/peppol-self-billing-2026-11-18.md). Every plain-only set already matches SaxonC on whitespace and CASTABLE (eval/datetime-leaves-2026-11-18.md). No network beyond PyPI, Maven and GitHub.
