# BR-FR-CDV (CDAR life-cycle statuses): plain route vs Saxon (2026-11-17)

What: `plain/cdar-fr.json` (FNFE-MPE BR-FR-CDV Schematron 1.4.0.04, "last fix04 2026 09 04",
github.com/fnfempe/France_RFE commit 97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d,
`FNFE_RFE_INVOICE/CDAR/schematron/BR-FR-CDV-Schematron-CDAR.sch`, 43 checks in 28 patterns,
compiled by `build-fr-rules.mjs` with the same compiler as the invoice sets, run by
fontoxpath) against Saxon-JS 2 running FNFE's own compiled XSLT
(`CDAR/2xslt/BR-FR-CDV-Schematron-CDAR.xslt`, exported to SEF with
`npx xslt3 -nogo -relocate:on`).

Corpus: all 59 CDAR messages in FNFE's `Z.example/TEST/CDAR` (use cases UC1 to UC5c:
200 Déposée, 202 Reçue, 203 Mise à disposition, 204 Prise en charge, 205 Approuvée,
207 En litige, 210 Refusée, 211 Paiement transmis, 212 Encaissée, 213 Rejetée,
220 Annulée; platform copies and the `_POUR_PPF` copies sent to the PPF). Each file is
run as published and with each of fourteen mutations that changes it.

Command:

    node eval/cdar-crosscheck.mjs <France_RFE checkout> cdar.sef.json

Result:

```
files: 59; runs (file x mutation): 780; Saxon reported at least one BR-FR-CDV rule on 544; distinct rule ids Saxon raised: 17; same rule ids on both engines: 780/780; plain rules skipped (engine limit): 0
  original               runs  59  fired   0  agree 59/59
  status-999             runs  59  fired  59  agree 59/59
  status-213-no-reason   runs  53  fired  53  agree 53/53
  sender-role-xx         runs  44  fired  44  agree 44/44
  profile-en16931        runs  59  fired  59  agree 59/59
  process-other          runs  44  fired  44  agree 44/44
  doc-id-space           runs  59  fired   0  agree 59/59
  issue-feb-30           runs  59  fired   0  agree 59/59
  object-type-999        runs  59  fired  59  agree 59/59
  ack-type-999           runs  59  fired  59  agree 59/59
  status-code-99         runs  58  fired  58  agree 58/58
  bt1-space              runs  59  fired   0  agree 59/59
  no-recipient-uri       runs  44  fired  44  agree 44/44
  no-issuer-siren        runs  59  fired  59  agree 59/59
  reason-bogus           runs   6  fired   6  agree 6/6
rule ids raised: BR-FR-04_MDT-91 BR-FR-CDV-02_MDT-3 BR-FR-CDV-08_MDT-73 BR-FR-CDV-09_MDT-77 BR-FR-CDV-13_MDT-129 BR-FR-CDV-13_MDT-129-2 BR-FR-CDV-15_MDT-113 BR-FR-CDV-CL-01_MDT-2 BR-FR-CDV-CL-02_MDT-21_23 BR-FR-CDV-CL-02_MDT-21_305 BR-FR-CDV-CL-05_MDT-88_23 BR-FR-CDV-CL-05_MDT-88_305 BR-FR-CDV-CL-06_MDT-105 BR-FR-CDV-CL-09_MDT-113 BR-FR-CDV-CL-09_MDT-113_207 BR-FR-CDV-CL-09_MDT-113_210 BR-FR-CDV-CL-09_MDT-113_213
```

The 59 published messages pass every rule on both engines. No compiler change was needed:
the fixes made for the BR-FR invoice sets (prefixed lets, pattern lets, predicate lets)
were enough.

Found on the way:

- Three mutations fire on neither engine: a space in the message id (MDT-4), 30 February
  in the creation time (MDT-8), and a space in the referenced invoice number (MDT-87). The
  CDAR Schematron declares `custom:is-valid-id-format` and `custom:is-valid-date-format`
  but no rule calls them on those fields, so a platform that relies on this set alone will
  accept such a message.
- FNFE's file names statuses 206 and 208 both ways round: BR-FR-CDV-15's message reads
  "206 (Suspendue) ... 208 (Approuvée Partiellement)", the BR-FR-CDV-CL-09 rules read
  "APPROUVÉE PARTIELLEMENT (206)" and "SUSPENDUE (208)". `cdar.mjs` gives no label for
  either and says why.

Limits: 17 of the 43 rule ids were raised; the other 26 (multi-reference messages, the
212 payment-amount blocks' variants, B2G refusal reasons, the 200/221/501 reason lists,
the action codes) were not reached by these mutations. The _WARNING copy was not run. No
real platform's message or rejection was compared.
