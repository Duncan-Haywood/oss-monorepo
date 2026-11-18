# BR-FR: plain route vs Saxon on FNFE-MPE's examples (2026-11-17)

What: `plain/cius-fr-ubl.json` and `plain/cius-fr-cii.json` (FNFE-MPE BR-FR Schematron
1.4.0.04, github.com/fnfempe/France_RFE commit 97ba0f3d4ef2abed5780e9490d5c3a2be832ab1d,
compiled by `build-fr-rules.mjs`, run by fontoxpath) against Saxon-JS 2 running FNFE's own
compiled XSLT (`FNFE_RFE_INVOICE/{UBL,CII}/EN16931/2xslt/BR-FR-Flux2-Schematron-*.xslt`,
exported to SEF with `npx xslt3 -nogo -relocate:on`).

Corpus: FNFE's `Z.example/TEST` UBL and CII invoices (26 files: EN 16931 and
Extended-CTC-FR, including the multi-vendor and sub-line cases). The FX folder repeats the
CII files and the CDAR folder holds life-cycle messages, so both are left out. Each file
is run as published and with each of ten mutations that changes it.

Command:

    node eval/br-fr-crosscheck.mjs <France_RFE checkout> ubl.sef.json cii.sef.json

Result:

```
files: 26; runs (file x mutation): 264; Saxon reported at least one BR-FR rule on 217; same rule ids on both engines: 264/264; plain rules skipped (engine limit): 0
  original           runs  26  fired   0  agree 26/26
  bt1-space          runs  26  fired  26  agree 26/26
  bt1-36-chars       runs  26  fired  26  agree 26/26
  bt23-peppol        runs  26  fired  26  agree 26/26
  bt2-feb-30         runs  26  fired  26  agree 26/26
  bt3-999            runs  26  fired  26  agree 26/26
  no-notes           runs  26  fired  26  agree 26/26
  vat-21             runs  26  fired  26  agree 26/26
  siren-scheme-0088  runs  26  fired  26  agree 26/26
  line-net-plus-10   runs  26  fired   6  agree 26/26
  no-status-code     runs   4  fired   3  agree 4/4
```

"fired" counts runs where Saxon reported at least one BR-FR rule; "agree" means the same
set of rule ids on both engines. `line-net-plus-10` fires only on the six files whose
lines are multi-vendor GROUP lines (BR-FR-MV-05/BD-05); elsewhere no BR-FR rule reads a
line net. `no-status-code` changes only the four files that carry line status codes.

Before this run's compiler fixes, the same compiled sets left most rules unevaluated: a
prefixed `let` inside FNFE's `xsl:function`s broke the XQuery prolog (every check calling
`custom:*` was skipped: 25 to 60 rule ids per file), `$invoiceID` was out of scope in the
BR-FR-MV-02..14 patterns (23 ids skipped on every file), and rule lets pasted into
predicates made BR-FR-MV-03 and -05 fail on 9 of FNFE's valid multi-vendor files.

Limits: mutations are made by text rewrite and cover the rule families listed; FNFE's
_WARNING files, the Extended-CTC-FR base sets, CDAR and Flux 10 were not run; no real
platform rejection was compared.
