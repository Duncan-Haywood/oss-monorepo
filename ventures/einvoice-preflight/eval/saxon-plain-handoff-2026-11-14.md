# Saxon route vs plain route on plain-only files (2026-11-14)

Command: `node build-schematron.mjs && node eval/saxon-plain-handoff.mjs` (EN 16931, XRechnung and Peppol BIS SEF built from the default branches cloned on 2026-11-14; saxon-js, slimdom, fontoxpath from npm). "before" is what the Saxon route returned for these files until 2026-11-14 (the current EU base alone); "after" is the plain route the file now goes to.

```
nlcius-cii-invoice-with-defects.xml	nlcius	before (EU base): 0 fatal [-]	after (en16931+nlcius): 3 fatal [BR-NL-12 BR-NL-2 BR-NL-3]
nlcius-cii-invoice.xml	nlcius	before (EU base): 0 fatal [-]	after (en16931+nlcius): 0 fatal [-]
nlcius-invoice-with-defects.xml	nlcius	before (EU base): 0 fatal [-]	after (en16931+nlcius): 3 fatal [BR-NL-12 BR-NL-2 BR-NL-3]
nlcius-invoice.xml	nlcius	before (EU base): 0 fatal [-]	after (en16931+nlcius): 0 fatal [-]
pint-aunz-invoice.xml	pint-aunz	before (EU base): 5 fatal [BR-47 BR-48 BR-CO-04 BR-CO-17 BR-S-02]	after (pint-aunz): 0 fatal [-]
pint-current-aunz-invoice.xml	pint-aunz-1	before (EU base): 5 fatal [BR-47 BR-48 BR-CO-04 BR-CO-17 BR-S-02]	after (pint-aunz-1): 0 fatal [-]
pint-current-jp-invoice.xml	pint-jp-1	before (EU base): 2 fatal [BR-CO-09 BR-E-10]	after (pint-jp-1): 0 fatal [-]
pint-current-sg-invoice.xml	pint-sg-1	before (EU base): 6 fatal [BR-47 BR-48 BR-CL-17 BR-CL-18 BR-CO-04 BR-CO-17]	after (pint-sg-1): 0 fatal [-]
pint-my-tourism-tax-invoice.xml	pint-my-1	before (EU base): 16 fatal [BR-47 BR-48 BR-CL-17 BR-CL-18 BR-CO-09 BR-CO-17 UBL-SR-48]	after (pint-my-1): 0 fatal [-]
pint-sg-invoice-with-defects.xml	pint-sg	before (EU base): 6 fatal [BR-47 BR-48 BR-CL-17 BR-CL-18 BR-CO-04 BR-CO-17]	after (pint-sg): 5 fatal [BR-109-GST-SG BR-CO-17-GST-SG BR-NG-08-GST-SG BR-NG-09-GST-SG BR-NG-12-GST-SG]
pint-sg-invoice.xml	pint-sg	before (EU base): 6 fatal [BR-47 BR-48 BR-CL-17 BR-CL-18 BR-CO-04 BR-CO-17]	after (pint-sg): 0 fatal [-]
pt-invoice.xml	cius-pt	before (EU base): 0 fatal [-]	after (en16931+cius-pt): 0 fatal [-]
ro-invoice-with-defects.xml	cius-ro	before (EU base): 1 fatal [BR-CO-15]	after (en16931-1.3.8+cius-ro): 6 fatal [BR-CO-15 BR-RO-001 BR-RO-010 BR-RO-030 BR-RO-110 BR-RO-DT001]
ro-invoice.xml	cius-ro	before (EU base): 0 fatal [-]	after (en16931-1.3.8+cius-ro): 0 fatal [-]
zatca-prepayment-rate-change.xml	zatca	before (EU base): 10 fatal [BR-01 BR-CL-10 BR-CL-23 BR-CL-24 BR-CO-09 BR-CO-15 UBL-DT-07]	after (zatca): 0 fatal [-]
zatca-simplified-credit-note.xml	zatca	before (EU base): 10 fatal [BR-01 BR-CL-01 BR-CL-10 BR-CL-23 BR-CL-24 BR-CO-09 BR-CO-15 UBL-DT-07]	after (zatca): 0 fatal [-]
zatca-simplified-debit-note.xml	zatca	before (EU base): 9 fatal [BR-01 BR-CL-10 BR-CL-23 BR-CL-24 BR-CO-09 BR-CO-15 UBL-DT-07]	after (zatca): 0 fatal [-]
zatca-simplified-invoice-with-defects.xml	zatca	before (EU base): 10 fatal [BR-01 BR-CL-10 BR-CL-23 BR-CL-24 BR-CO-09 BR-CO-14 BR-CO-15 BR-CO-17 BR-S-09 UBL-DT-07]	after (zatca): 3 fatal [BR-CO-14 BR-CO-15 BR-KSA-40]
zatca-simplified-invoice.xml	zatca	before (EU base): 9 fatal [BR-01 BR-CL-10 BR-CL-23 BR-CL-24 BR-CO-09 BR-CO-15 UBL-DT-07]	after (zatca): 0 fatal [-]

19 plain-only example files; EU base alone: 95 fatal findings on 13 files; their own sets: 20 fatal findings.
```
