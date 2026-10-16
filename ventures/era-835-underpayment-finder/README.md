# 835 ERA Underpayment Finder

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/era-835-underpayment-finder/>

A free browser tool for medical and dental practices: **drop in an X12 835 remittance
file and see which service lines your payers paid below your contract rates, which
claims were denied and why, and what was taken back at provider level.** The file is read
in the browser; nothing is uploaded and no login, clearinghouse account or API key is
needed.

After using this, you can now **list every service line paid below your contract rate,
rank denials by billed dollars with the usual next step, see recoupments that sit outside
any claim, and download an appeal worksheet**, which used to mean reading remittances one
at a time in a payer portal and comparing each line to a fee schedule by hand.

## Input

One or more 835 files (or pasted text), and optionally a fee schedule, one line per code
(`99213,92.50`, `99213-25,80`). Separators are read from the ISA header. **The segment
layout is read by position from memory of the 005010X221A1 guide; no real remittance was
available when this was built.** Patient names and member IDs are never read into the
page's data.

## Model

Allowed amount per line is `AMT*B6` when present, otherwise payment plus patient
responsibility with sequestration added back. A line is underpaid when your rate times
units exceeds it by more than the tolerance; only lines with no adjustment other than the
contractual write-off, patient responsibility or sequestration are tested. With no
schedule, a payer is compared with its own usual per-unit amount for a code (three clean
lines minimum). Claim, line and deposit totals are checked for balance. See the page for
what is not modelled.

## Run

Open `index.html` through any static server. Tests: `node --test`.
