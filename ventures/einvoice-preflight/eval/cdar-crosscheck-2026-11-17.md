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

## Second round (same day): 37 of 43 rules reached, six cannot fire

The first round reached 17 of the 43 rule ids. Thirty-three more mutations were added to
`eval/cdar-crosscheck.mjs`, each aimed at a rule not yet reached: a missing mandatory part
(profile, message id, creation date-time, sender, sender role, invoice number, invoice date,
status, status sequence number, issuer id), wrong party roles at each level, an unknown detail
status, action code and characteristic code, the 212 amount blocks without a percentage or
with MPA in place of MEN, a reason outside each status's list (200, 206, 208, 221, 501, and
the B2G 210 list with the sender set to the PPF, 0238 9999) with a reason inside the list as a
control, and a two-reference message. Same corpus, same commit, same command.

```
files: 59; runs (file x mutation): 2496; Saxon reported at least one BR-FR-CDV rule on 1836; distinct rule ids Saxon raised: 37; same rule ids on both engines: 2496/2496; plain rules skipped (engine limit): 0
  original               runs  59  fired   0  agree 59/59
  status-999             runs  59  fired  59  agree 59/59
  status-213-no-reason   runs  53  fired  53  agree 53/53
  sender-role-xx         runs  44  fired  44  agree 44/44
  profile-en16931        runs  59  fired  59  agree 59/59
  process-other          runs  44  fired  44  agree 44/44
  doc-id-space           runs  59  fired   0  agree 59/59
  issue-feb-30           runs  59  fired   0  agree 59/59  caught only by FR-CDV-105..107 59
  object-type-999        runs  59  fired  59  agree 59/59
  ack-type-999           runs  59  fired  59  agree 59/59
  status-code-99         runs  58  fired  58  agree 58/58
  bt1-space              runs  59  fired   0  agree 59/59
  no-recipient-uri       runs  44  fired  44  agree 44/44
  no-issuer-siren        runs  59  fired  59  agree 59/59
  no-guideline           runs  59  fired  59  agree 59/59
  no-doc-id              runs  59  fired  59  agree 59/59
  no-issue-datetime      runs  59  fired   0  agree 59/59  caught only by FR-CDV-105..107 59
  no-sender              runs  59  fired  59  agree 59/59
  no-sender-role         runs  44  fired  44  agree 44/44
  no-invoice-id          runs  59  fired   0  agree 59/59  caught only by FR-CDV-105..107 59
  no-invoice-date        runs  59  fired  59  agree 59/59
  no-status              runs  59  fired  59  agree 59/59
  no-issuer-global-id    runs  59  fired  50  agree 59/59
  issuer-role-xx         runs  59  fired  59  agree 59/59
  recipient-role-xx      runs  59  fired  59  agree 59/59
  ref-issuer-role-xx     runs  59  fired  59  agree 59/59
  ref-recipient-role-xx  runs  59  fired  59  agree 59/59
  ref-recipient-role-by  runs  59  fired   0  agree 59/59
  detail-status-999      runs  59  fired  59  agree 59/59
  action-code-xxx        runs  59  fired  59  agree 59/59
  action-code-noa        runs  59  fired   0  agree 59/59
  reason-200-bogus       runs  59  fired  59  agree 59/59
  reason-206-bogus       runs  59  fired  59  agree 59/59
  reason-208-bogus       runs  59  fired  59  agree 59/59
  reason-221-bogus       runs  59  fired  59  agree 59/59
  reason-501-bogus       runs  59  fired  59  agree 59/59
  reason-200-ok          runs  59  fired   0  agree 59/59
  reason-221-ok          runs  59  fired   0  agree 59/59
  reason-210-b2g-bogus   runs  59  fired  59  agree 59/59
  reason-210-b2g-ok      runs  59  fired   0  agree 59/59
  reason-210-b2b-b2g-code runs  59  fired  59  agree 59/59
  multi-ref-501-no-date  runs  59  fired  59  agree 59/59
  ack-type-305           runs  27  fired  27  agree 27/27
  no-status-seq          runs  18  fired  18  agree 18/18
  characteristic-xxx     runs  12  fired  12  agree 12/12
  212-no-percent         runs  12  fired  10  agree 12/12
  212-men-to-mpa         runs  10  fired  10  agree 10/10
  reason-bogus           runs   6  fired   6  agree 6/6
rule ids raised: BR-FR-04_MDT-91 BR-FR-CDV-02_MDT-3 BR-FR-CDV-03_MDT-4 BR-FR-CDV-07_MDT-38_yes BR-FR-CDV-08_MDT-73 BR-FR-CDV-09_MDT-77 BR-FR-CDV-11_MDG-35 BR-FR-CDV-12_MDT-105 BR-FR-CDV-13_MDT-129 BR-FR-CDV-13_MDT-129-2 BR-FR-CDV-14_MDT-207 BR-FR-CDV-15_MDT-113 BR-FR-CDV-16_MDT-124-2 BR-FR-CDV-CL-01_MDT-2 BR-FR-CDV-CL-02_MDT-21_23 BR-FR-CDV-CL-02_MDT-21_305 BR-FR-CDV-CL-03_MDT-40_23 BR-FR-CDV-CL-03_MDT-40_305 BR-FR-CDV-CL-04_MDT-59 BR-FR-CDV-CL-05_MDT-88_23 BR-FR-CDV-CL-05_MDT-88_305 BR-FR-CDV-CL-06_MDT-105 BR-FR-CDV-CL-06_MDT-115 BR-FR-CDV-CL-07_MDT-132 BR-FR-CDV-CL-08_MDT-158 BR-FR-CDV-CL-09_MDT-113 BR-FR-CDV-CL-09_MDT-113_200 BR-FR-CDV-CL-09_MDT-113_206 BR-FR-CDV-CL-09_MDT-113_207 BR-FR-CDV-CL-09_MDT-113_208 BR-FR-CDV-CL-09_MDT-113_210 BR-FR-CDV-CL-09_MDT-113_210B2G BR-FR-CDV-CL-09_MDT-113_213 BR-FR-CDV-CL-09_MDT-113_221 BR-FR-CDV-CL-09_MDT-113_501 BR-FR-CDV-CL-10_MDT-121 BR-FR-CDV-CL-11_MDT-207
```

Coverage per rule (mutations that raised it on Saxon):

```
plain rule ids: 43; raised by Saxon on some run: 37
  hit  BR-FR-04_MDT-91                  object-type-999
  MISS BR-FR-CDV-01_MDG-3               
  hit  BR-FR-CDV-02_MDT-3               profile-en16931 no-guideline recipient-role-xx
  hit  BR-FR-CDV-03_MDT-4               no-doc-id
  MISS BR-FR-CDV-04_MDG-4               
  MISS BR-FR-CDV-05_MDG-9               
  MISS BR-FR-CDV-06_MDT-21              
  hit  BR-FR-CDV-07_MDT-38_yes          no-issuer-global-id
  MISS BR-FR-CDV-07_MDT-38_no           
  hit  BR-FR-CDV-08_MDT-73              no-recipient-uri recipient-role-xx
  hit  BR-FR-CDV-09_MDT-77              ack-type-999
  MISS BR-FR-CDV-10_MDT-87              
  hit  BR-FR-CDV-11_MDG-35              no-invoice-date
  hit  BR-FR-CDV-12_MDT-105             no-status
  hit  BR-FR-CDV-13_MDT-129             no-issuer-siren no-issuer-global-id
  hit  BR-FR-CDV-13_MDT-129-2           no-issuer-siren no-issuer-global-id
  hit  BR-FR-CDV-14_MDT-207             characteristic-xxx 212-no-percent 212-men-to-mpa
  hit  BR-FR-CDV-15_MDT-113             status-213-no-reason multi-ref-501-no-date
  hit  BR-FR-CDV-16_MDT-124-2           no-status-seq
  hit  BR-FR-CDV-CL-01_MDT-2            process-other recipient-role-xx
  hit  BR-FR-CDV-CL-02_MDT-21_305       sender-role-xx no-sender no-sender-role
  hit  BR-FR-CDV-CL-02_MDT-21_23        sender-role-xx no-sender no-sender-role
  hit  BR-FR-CDV-CL-03_MDT-40_305       issuer-role-xx ack-type-305
  hit  BR-FR-CDV-CL-03_MDT-40_23        issuer-role-xx
  hit  BR-FR-CDV-CL-04_MDT-59           recipient-role-xx
  hit  BR-FR-CDV-CL-05_MDT-88_305       status-code-99 ack-type-305
  hit  BR-FR-CDV-CL-05_MDT-88_23        status-code-99
  hit  BR-FR-CDV-CL-06_MDT-105          status-999
  hit  BR-FR-CDV-CL-06_MDT-115          detail-status-999
  hit  BR-FR-CDV-CL-07_MDT-132          ref-issuer-role-xx
  hit  BR-FR-CDV-CL-08_MDT-158          ref-recipient-role-xx
  hit  BR-FR-CDV-CL-09_MDT-113          reason-200-bogus reason-206-bogus reason-208-bogus reason-221-bogus reason-501-bogus reason-210-b2g-bogus reason-bogus
  hit  BR-FR-CDV-CL-09_MDT-113_200      reason-200-bogus no-status
  hit  BR-FR-CDV-CL-09_MDT-113_213      reason-bogus no-status
  hit  BR-FR-CDV-CL-09_MDT-113_210      reason-210-b2b-b2g-code reason-bogus
  hit  BR-FR-CDV-CL-09_MDT-113_210B2G   reason-210-b2g-bogus
  hit  BR-FR-CDV-CL-09_MDT-113_207      reason-bogus
  hit  BR-FR-CDV-CL-09_MDT-113_206      reason-206-bogus no-status
  hit  BR-FR-CDV-CL-09_MDT-113_208      reason-208-bogus no-status
  hit  BR-FR-CDV-CL-09_MDT-113_221      reason-221-bogus no-status
  hit  BR-FR-CDV-CL-09_MDT-113_501      reason-501-bogus no-status multi-ref-501-no-date
  hit  BR-FR-CDV-CL-10_MDT-121          action-code-xxx
  hit  BR-FR-CDV-CL-11_MDT-207          characteristic-xxx
```

**2,496 of 2,496** runs give the same rule ids on both engines; 0 rules left unevaluated; every
control mutation (a valid reason, action code NOA, recipient role BY) raises nothing.

**The six rules no run reached cannot fire as written.** BR-FR-CDV-01 (MDG-3 profile),
-04 (MDG-4 creation date-time), -05 (MDG-9 sender), -06 (MDT-21 sender role) and -10 (MDT-87
invoice number) each put the mandatory element itself in the rule's context and test `.`: when
the element is missing there is no context node, so the rule never runs. BR-FR-CDV-07_MDT-38_no
tests `count(../ram:RecipientTradeParty/ram:RoleCode='DFH') ge 0`, which is always true. The
mutations show the consequence on both engines:

- no profile, no sender, no sender role: caught anyway by other rules (BR-FR-CDV-02, CL-02);
- **no creation date-time (MDT-8): 0 of 59 runs raise anything;**
- **no invoice number (MDT-87): 0 of 59 runs raise anything** — a status message that does not
  say which invoice it is about passes the whole set;
- 30 February in the creation date (first round): 0 of 59.

`cdar.mjs` now checks these itself (`cdarGapFindings`): `FR-CDV-105` no or impossible
creation date-time (MDT-8), impossible MDT-78 or MDT-100 dates; `FR-CDV-106` no invoice number;
`FR-CDV-107` a reference with no invoice date let through because *another* reference in the
same message is 501 (BR-FR-CDV-11 tests the 501 exemption with an absolute path over every
reference). The cross-check runs them on every mutated copy: they catch all 177 runs of
`issue-feb-30`, `no-issue-datetime` and `no-invoice-id` that neither engine flags, and raise
nothing on FNFE's 59 published messages.

Also seen: a message with no status (MDT-105) raises every per-status reason rule
(CL-09_MDT-113_200, _206, _208, _213, _221, _501) at once, on both engines, because each tests
`../../ram:ProcessConditionCode != 'NNN'`, false when the code is absent. A platform showing
FNFE's messages would list six reason errors for one missing status.

Limits: the _WARNING copy was still not run; the "multi-reference" case is one made-up
two-reference message per file, not a real platform's batch; no real platform's message or
rejection compared.
