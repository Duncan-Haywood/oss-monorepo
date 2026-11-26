# Red team 2026-11-26: VeriFactu reply pairing (einvoice-preflight)

Target: `ventures/einvoice-preflight/verifactu-response.mjs` (reads the AEAT's
reply to a VERI*FACTU submission and pairs each line with the record sent).
Record: `prompts/runs/2026-11-26-session_01AcxTtHQaogbYGuy2MAJBXM.json`.

- 8 mutants, 6 caught (75%); both escapes were gaps, now guarded (100% after fix).
- Real defect, patched: chain findings (VF-005 to VF-008) were attached to a
  paired record when the finding's message contained `(` + the record's
  number. That is a prefix match: F1 picked up F10's findings, and the
  AEAT-PASSED note told the user the checker flags F1 when it does not.
  Now it matches the full label `(number of date (issuer ...))`, built by
  `idText` exported from `verifactu.mjs`, so the two cannot drift apart.
- Gap: no test held an eight-digit run (a DNI or NIF's digits) in the AEAT's
  text, so loosening the withholding regex from `\d{8,}` to `\d{9,}` passed.

For the next run: chain findings still name their record only inside the
message text. Giving each chain finding a structured record reference
(file + index) would remove the text match entirely; it changes the finding
shape that `verifactuReport` and the page render, so check those first.
