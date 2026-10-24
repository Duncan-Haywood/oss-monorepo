# SEPA Payment File Validator

A free browser tool for anyone who pays suppliers or staff by SEPA bulk upload: **paste or
drop the pain.001 XML file and see every error with its line number before the bank
rejects it, then rebuild the counts and control sums after a hand edit.** The file is read
in the browser; nothing is uploaded and no login, bank account or API key is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/sepa-payment-file-validator/

After using this, you can now **find the IBAN that fails its check, the control sum that no
longer matches the payments, the execution date that lands on a TARGET2 holiday and the
accented name the bank will refuse, and download a corrected file**, which used to mean a
bank's rejection message and hunting through XML by hand.

## Input

One SEPA credit transfer initiation file (ISO 20022 pain.001.001.03 or .09). **The rules
are read from memory of the public EPC and ISO 20022 documents; no bank's own validator
was available when this was built.** IBANs are masked to their last four characters in the
report and the findings CSV.

## Checks

XML well-formedness; group header (MsgId, CreDtTm, NbOfTxs, CtrlSum, initiating party);
payment blocks (TRF, SEPA service level, execution date format, weekend and TARGET2 closing
days, debtor IBAN and BIC, debtor name); each transaction (EndToEndId, EUR amount format and
range, creditor name, creditor IBAN mod-97 and country length, remittance Ustrd/Strd,
SEPA character set, field lengths); repeated references and possible duplicate payments;
block and group transaction counts and control sums.

## Repair

`repair()` rewrites `NbOfTxs` and `CtrlSum` only. It never edits a payment: a wrong IBAN or
amount is a payment decision, not a typo.

## Run

Open `index.html` through any static server. Tests: `node --test`.
