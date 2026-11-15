# SdI receipts read and paired with their invoices (2026-11-15)

`sdi-receipt.mjs` reads what Italy's Sistema di Interscambio sends back for a
file, and `report.mjs` runs it whenever a receipt is dropped in. Until today the
FatturaPA rules (IT-nnn) had never been compared with a real SdI answer
(`eval/sdi-error-codes-2026-11-13.md`, last line). This run found public ones.

## Sources

Pinned by SHA-256 in `eval/sdi-receipts-corpus.json` and not copied here;
`node eval/sdi-receipts-corpus.mjs <cache>` downloads and refuses any file whose
hash moved.

- **The Agenzia delle Entrate's example messages** (RC, NS, MC, NE, DT, AT; the
  PA namespace `www.fatturapa.gov.it/sdi/messaggi/v1.0` and the B2B one
  `ivaservizi.agenziaentrate.gov.it/.../messaggi/v1.0`), as mirrored in
  link-it/govway. 16 files. Layout samples, not answers to a real file.
- **AgID's EeISI project** (deliverables D5_2 and D5_5, 2019): receipts SdI's
  test and production environments sent back to a real access point, and some
  of the invoices they answer. 17 receipts and 4 invoices. Among them: two real
  rejections (00300 on the transmitter's id, 00305 on the buyer's partita IVA),
  one signature rejection (00102), and a production EC02 refusal by a university
  (missing CUP code, split-payment VAT treatment).
- **Specification 1.9** (Allegato A, Italian, SHA-256 `549a68ac4ff75200...`, the
  same file the 2026-11-13 eval read) answered again from this session. Its
  Appendix 1 control list gave the text of all 64 codes in `SDI_CODES`; Appendix
  6 gave the receipt structures (Hash = SHA-256 of the file received).

## Results

`{"receipts":33,"byType":{"AT":2,"DT":3,"MC":5,"NE":5,"NS":7,"RC":10,"EC":1},"codes":9,"paired":5,"reproduced":2,"notReproduced":1}`

- **All 33 receipts and notices read**, both namespaces, 7 receipt types. Every
  code in them is in specification 1.9's list.
- **The real 00305 rejection is reproduced.** SdI rejected EeISI's UBL file
  `UB78432912341_00G41.xml` (buyer `IT00999999985`) with 00305 twice (Italian and
  English text). That partita IVA fails its check digit, and the EN 16931 rule
  INV-023 (customer VAT checksum) raises it on the rejected invoice. The receipt
  is in D5_2 as `B2G-C_01_1_STEP_H.2.2_IN.xml` and the invoice as
  `B2G-C_01_1_STEP_F_IN_RE_02.xml`; the eval renames both to SdI's file name so
  they pair by name, as they would in a user's folder. The PA-flow receipt
  carries no Hash, so this pair is by name only.
- **The real 00300 rejection is out of reach.** The transmitter id SdI refused
  (`00174410993`) passes its check digit, so only the register knows it is wrong.
  The new rule IT-034 checks the transmitter's id check digit (it was not checked
  at all before); it would not have caught this one, and the reader says so.
  The rejected file itself is not published.
- **00102 (signature) is out of reach by design**; the pair's hashes also differ
  (the receipt's Hash is not the SHA-256 of the published XML: SdI received a
  signed copy inside a ZIP), and the reader warns (SDI-HASH).
- **Delivered is not the same as correct.** SdI delivered EeISI's
  `UB12345678901_00001.xml`, which has a 5-digit Danish VAT number (DK12345) and
  an 18-character "IT" IBAN. This checker flags both (INV-022, INV-024, INV-027).
  SdI does not check foreign tax ids (specification 1.9, Appendix 1) and bank
  details are not in its control list, so both verdicts can be right. A
  delivery receipt paired with a file the checker flags now says so
  (SDI-PASSED, information).

## Still open

- A real FatturaPA rejection with its file, so an IT-nnn rule is confirmed end
  to end (the reproduced pair above is UBL). The B2B example NS receipts only
  carry 00002 (duplicate name); the PA ones 00100 (expired certificate).
- The PA-flow outcome codes in ScartoEsitoCommittente (EN00, EN01) are shown raw:
  their meaning was not read from a primary text.
- Resending after a rejection: the Agenzia's guidance on keeping the original
  number and date (Circolare 13/E of 2018, as commonly cited) was not read here,
  so the reader only says what specification 1.9 says (not issued; a new file
  name).
