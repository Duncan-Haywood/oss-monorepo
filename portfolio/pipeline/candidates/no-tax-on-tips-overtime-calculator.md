# Candidate: No tax on tips & overtime calculator

**One line.** A browser calculator estimating the federal "no tax on tips"
($25,000 cap) and "no tax on overtime" ($12,500/$25,000 cap) deductions
enacted by the One Big Beautiful Bill Act for tax years 2025-2028, applying
the shared MAGI phase-out and the overtime deduction's half-time-premium-only
rule, for tipped and hourly-overtime workers filing 2025 returns.

Scored 2026-09-17. Composite 6.25 · floor 1 (ai_leverage).

**Verdict: graduated 2026-09-17** as
`ventures/no-tax-on-tips-overtime-calculator`. The first experiment is the
same browser-local calculator workflow as the rest of this portfolio's
tax-adjacent tools: enter filing status, MAGI, tips, and overtime inputs; get
a combined estimated deduction and rough tax savings.

## Why this candidate won

- **A brand-new deduction, actively landing on W-2s right now.** Both
  deductions apply starting tax year 2025 — the return season underway as
  this candidate was scored — and starting tax year 2026 employers report
  them with new codes (Box 12 "TP" and Box 14b Treasury Tipped Occupation
  Code for tips; Box 14 "FLSA OT Prem" for overtime). Treasury's final
  occupation-list regulations were published 2026-04-13, effective
  2026-06-12. Corroborated across RSM US, Fidelity, TurboTax, TaxAct, and
  multiple CPA-firm explainers during screening.
- **Target user and pain:** a tipped worker (server, bartender, stylist,
  rideshare/delivery driver) or an hourly employee who worked overtime,
  trying to estimate the deduction's real dollar value for withholding or
  quarterly-estimate planning, and a payroll admin fielding the same
  question from several employees at once.
- **Distribution evidence, read the way `DIRECTION.md` asks.** Several
  finance-blog calculators already exist for these exact phrases
  (nationaltaxtools.com, taxstra.com, usapaycheck.com, kmkventures.com,
  fiscalfold.com, found during a single research pass) — proof of real,
  demonstrable search volume for "no tax on tips calculator" / "no tax on
  overtime calculator", the same "competitor's own comparison-search
  traffic" evidence `DIRECTION.md` North star point 2 names as acceptable.
- **Alternatives and differentiation:** the existing free calculators found
  are each single-provision (tips *or* overtime, not both), most require the
  visitor already know the overtime premium figure rather than computing it
  from hours worked, and most are embedded in ad-supported or paid-tax-prep
  content-marketing pages rather than standing as a private, no-signup tool
  on their own. This candidate combines both deductions in one MAGI
  phase-out pass, computes the overtime premium from raw hourly rate and
  hours (reusing this portfolio's own `overtime-pay-calculator` for the
  multi-rate/blended case via a one-hop link rather than restating that
  arithmetic), and applies the self-employed net-profit cap the simpler
  tools omit.
- **Archetype, not just niche:** this is a calculator (deterministic
  arithmetic over user-entered numbers, no upload), the same shape as
  `1099-vendor-tracker` and `overtime-pay-calculator` — not a restatement of
  either. `overtime-pay-calculator` computes what an employer *owes* in
  wages; this computes the separate federal *tax deduction* on pay already
  received, an unrelated calculation sharing only the underlying wage data.
- **Build and cost:** one offline browser workflow, zero API, hosting,
  account, database, or per-user inference cost.
- **Automation:** deterministic cap/phase-out arithmetic needs no operator.
- **Risks:** tip-occupation eligibility depends on Treasury's published
  occupation list, which this tool does not embed or verify — the user
  self-reports eligibility with an inline caveat rather than the tool making
  the determination. MAGI is user-estimated, not derived from a full return.
  Neither FICA/SECA payroll tax nor state conformity is modeled; both are
  stated plainly in the footer, FAQ, and an always-shown finding.
- **Portfolio fit:** joins the existing tax-adjacent family
  (`1099-vendor-tracker`, `1099k-reconciliation-worksheet`,
  `quarterly-estimated-tax-calendar`, `overtime-pay-calculator`) without
  duplicating any of them — `duplicate_check.py` scored every existing match
  at 0.09 or below, well under its "read this first" threshold.

## Scoring notes

- `ai_leverage` 1 — pure deterministic arithmetic, no model involved; the
  floor for this entire product family.
- `autonomous_ops` 10 — static page, no queue only a person can drain.
- `time_to_revenue` (read as time to first user, per this file's standing
  note) 6 — real, current search interest right now during the 2025 filing
  season, but this scoring dimension reflects that several established
  finance-blog calculators already capture some of that traffic; scored one
  point below `1099-vendor-tracker`'s 7 to reflect the more crowded field
  rather than an uncontested new term.
- `gross_margin` 10 — zero marginal cost, static/local.
- `defensibility` 3 — several existing free calculators for this exact niche
  and no technical moat; scored low deliberately rather than assumed away.
- `distribution` 6 — real, named evidence (above, multiple existing
  competitor calculators proving search volume) but unmeasured for this
  specific tool; scored in line with this table's other unmeasured-but-
  evidenced rows.
- `liability_containment` 6 — above the gate. The tool never files, never
  determines tip-occupation eligibility on the user's behalf (explicit
  self-report with a caveat), and every output is framed as an estimate to
  verify before filing. Being wrong costs a filer an inaccurate estimate
  correctable before filing, not a lawsuit — the same risk envelope as
  `1099-vendor-tracker` and `overtime-pay-calculator`.
- `ethical_robustness` 8 — no adverse incentive either direction (free,
  donations-only, no upsell that profits from over- or under-reporting),
  gets strictly more useful the more accurately a filer enters their own
  numbers, symmetric risk between overestimating and underestimating.

## Evidence and limits

The deduction mechanics (caps, phase-out formula and rate, filing-status
exclusions, the overtime premium-only rule, the new W-2 box codes) were
cross-checked across multiple independent sources during screening (RSM US,
Fidelity, TurboTax, TaxAct, USAPaycheck, and several CPA-firm explainers)
rather than a single source, because `irs.gov` itself and most individual
finance sites (Fidelity, TurboTax, SDO CPA) were blocked by this
environment's egress proxy for a direct fetch — WebSearch's synthesized
summaries were used instead, and the phase-out zero-crossing points
($400k/$550k tips, $275k/$550k overtime) were used as the fixture the
implementation is tested against specifically because they were the one set
of figures reported consistently across every source checked, after one
individual search summary's own worked example was found internally
inconsistent with its own stated formula and discarded. Distribution and
repeat-usage remain unmeasured, as for every product in this portfolio's
current traffic reading (`usage/usage.yaml`).
