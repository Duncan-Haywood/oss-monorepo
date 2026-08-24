# Candidate: E-invoice preflight

**One line.** A validator that catches structured-invoice errors before
submission — Factur-X, XRechnung, Peppol BIS — sold to bookkeepers and small
ERP integrators facing phased EU e-invoicing mandates.

**Verdict: reject the broad version; the narrow version graduated on 2026-08-24.**
Becoming any part of the transmission or filing path is out of bounds for an
unattended business. A pure validation tool that never touches submission is
acceptable but scores too low on its own merits to fund now.

Scored 2026-08-18. Composite 6.125 · floor 4 (defensibility).

| Dimension | Score | Why |
|---|---|---|
| AI leverage | 5 | Mostly schema and rule validation. Models help explain failures, which is a real product feature but a thin one |
| Autonomous ops | 8 | Stateless validation runs unattended |
| Time to revenue | 5 | Mandates are phased by company size through 2028, so urgency is staggered and mostly not yet |
| Gross margin | 9 | Compute only |
| Defensibility | 4 | Open-source validators exist for most of these formats |
| Distribution | 5 | Bookkeeper and integrator channels are reachable but unexcited |
| Liability containment | 5 | Right at the gate. Fiscal adjacency is only survivable in the narrow scope |
| Ethical robustness | 8 | Reduces a genuine compliance burden on small firms |

## Why it was considered

The mandates are real and dated. Germany has required all businesses to *receive*
e-invoices since January 2025, with sending obligations phased by revenue in 2027
and 2028; France is rolling out by company size from 2026 through 2028; ViDA
pushes VAT reporting into the transaction itself across the bloc. A large number
of small firms will hit a hard format requirement they cannot debug.

## Why the broad version is rejected

Transmission is a regulated position. In France the accredited-platform regime
means the transmitting party carries obligations and an accreditation burden;
elsewhere, being in the path of a VAT-relevant submission means a bug produces a
tax consequence for the customer rather than a support ticket. That is
professional-liability territory, and this portfolio's standing constraint is
that we do not take advice-of-record or filing-of-record positions with no staff
to hold them.

Failing the liability gate at 5 means the broad version does not graduate
regardless of what the margin looks like.

## The conditional narrow version

The shipped narrow version is strictly:

- **Validate and explain, never transmit.** Input is a file, output is a list of
  failures with the rule cited and a plain explanation of the fix. No
  credentials, no portal integration, no submission on anyone's behalf.
- **Never state tax positions.** "Field BT-31 is missing" is a format fact.
  "You should charge VAT at X" is advice we do not give.
- **Priced as a developer tool**, sold to integrators building the plumbing —
  not to the small business itself, which wants the problem gone rather than
  diagnosed.

Even then it is a €20–50/month utility against free open-source validators, which
is why it sits last in this pipeline. Recorded here so the reasoning does not get
re-derived next time e-invoicing appears on a deadline list — the mandate is
real, the business under it is thin, and the tempting version is the one that
carries the liability.

The first implementation is a free local JSON checker for structural fields and
arithmetic. It is not format-complete: Factur-X, XRechnung, and Peppol profiles
still require a dedicated validator and professional review. Its rule IDs and
JSON output make that limitation visible rather than implying coverage it does
not have.

## Sources

- [Invoice Navigator — EU e-invoicing deadlines 2026–2030 by country](https://www.invoicenavigator.eu/deadlines)
- [Nortal — EU compliance 2026–2027 for software companies](https://nortal.com/insights/eu-compliance-2026-2027-what-software-companies-need-to-know)
