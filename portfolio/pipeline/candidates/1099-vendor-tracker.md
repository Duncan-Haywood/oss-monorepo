# Candidate: 1099-NEC vendor tracker

**One line.** A local-first tracker that flags which vendors cross the 2026
$2,000 OBBBA reporting threshold (up from $600), applies the corporation
exemption and its attorney-fee exception, and tracks missing W-9s before the
January 31 deadline, for small-business bookkeepers who keep this on a
spreadsheet.

Scored 2026-09-17. Composite 6.375 · floor 1 (ai_leverage).

**Verdict: graduated 2026-09-17** as `ventures/1099-vendor-tracker`. The first
experiment is the same browser-local workflow as the rest of the tracker
family: enter a vendor's entity type, payment category, and year-to-date
total; get a sorted review queue; export CSV.

## Why this candidate won

- **A rule changed and nobody has shipped the boring tool for it yet.** The
  One Big Beautiful Bill Act raised the Form 1099-NEC / 1099-MISC
  nonemployee-compensation reporting threshold from $600 to $2,000 for
  payments made on or after 2026-01-01 — the first change to that number
  since 1954. The first filing season under the new rule is January 2027.
  Every bookkeeper who has "$600" memorized is the exact audience for a tool
  that states the new figure plainly. Corroborated independently across
  Patriot Software, Avalara, Withum, Jackson Hewitt, Landmark CPAs, and the
  IRS's own "Instructions for Forms 1099-MISC and 1099-NEC (12/2026)" page
  title.
- **Target user and pain:** a small-business owner or bookkeeper who pays a
  handful of contractors and re-derives the threshold and corporation-exemption
  rule by hand (or from memory) every January, with the exact January-31
  deadline pressure that makes a missed vendor costly.
- **Distribution evidence, read the way `DIRECTION.md` asks — a real channel,
  not just "searchable."** An established paid-tool category (Track1099,
  Tax1099, TaxBandits, Zoho Books 1099/W-9 management, 1099online.com) already
  exists for exactly this task, which is itself evidence of proven,
  demonstrable search and purchase volume for "1099 vendor tracker" / "W-9
  tracker" phrases — the same "competitor's own comparison-search traffic"
  evidence `DIRECTION.md` North star point 2 names as acceptable. Two adjacent
  niches were screened and rejected first for lacking exactly this: an
  "economic nexus sales-tax threshold checker" and a "state privacy law
  applicability checker" each turned up five-plus existing free competitor
  calculators with no distinguishing channel found; this niche's channel is
  sharper because the threshold **just changed**, which the existing paid
  tools' evergreen marketing pages have not yet fully absorbed into a
  free, no-signup tracker angle.
- **Alternatives and differentiation:** Track1099 and similar services collect
  W-9s and e-file for a per-form fee — the step *after* a business already
  knows its full 1099 list. This tool is the free, private, no-signup step
  *before* that: narrowing down who is even on the list. See
  `ventures/1099-vendor-tracker/vs-track1099.html`.
- **Archetype, not just niche:** this is a tracker (localStorage review queue,
  same shape as the already-graduated `grant-reporting-tracker` and
  `grant-deadline-tracker`), not a 143rd `<trade>-bid-calculator` or a 62nd
  `-check`/`-checker` dev-tool — both archetypes this pipeline has already
  flagged as saturated with zero measured traffic across 141 and 38+ tries
  respectively (`pipeline/README.md`, "archetype itself").
- **Build and cost:** one offline browser workflow, zero API, hosting,
  account, database, or per-user inference cost.
- **Automation:** deterministic threshold/date arithmetic needs no operator.
- **Risks:** the reporting rule has more categories than this tool computes
  (rent, royalties, state filing, backup withholding). The product
  deliberately declines to compute two adjacent categories it could not
  verify closely enough (gross proceeds paid to an attorney; medical/
  health-care payments) rather than print a number that might be wrong —
  those rows are flagged `Check separately (not calculated)` and point to the
  IRS instructions instead. It also states plainly that its TIN check is a
  format check only, never the IRS TIN Matching program (which needs its own
  e-Services account this tool cannot obtain on a visitor's behalf). It
  produces a planning queue, never a filing, and disclaims accordingly.
- **Portfolio fit:** joins the existing tax/reporting-evidence family
  (`1099k-reconciliation-worksheet`, `quarterly-estimated-tax-calendar`,
  `certified-payroll-calculator`, `grant-reporting-tracker`) without
  duplicating any of them — `duplicate_check.py` scored the closest existing
  match (`grant-reporting-tracker`) at 0.08, well under its "read this first"
  threshold.

## Scoring notes

- `ai_leverage` 1 — pure deterministic arithmetic, no model involved; the
  floor for this entire product family.
- `autonomous_ops` 10 — static page, no queue only a person can drain.
- `time_to_revenue` (read as time to first user, per this file's standing
  note) 7 — real but seasonal: seasonal search interest peaks near the
  January 2027 filing season, roughly four months from graduation, rather
  than an evergreen daily-search pattern.
- `gross_margin` 10 — zero marginal cost, static/local.
- `defensibility` 3 — several funded paid competitors exist and a free clone
  is not hard to build; scored low deliberately rather than assumed away.
- `distribution` 6 — real, named evidence (above) but unmeasured; scored in
  line with the rest of this table's unmeasured-but-evidenced rows.
- `liability_containment` 6 — above the gate. Being wrong costs a business a
  missed-1099 IRS penalty (a fixed per-form dollar amount that scales with
  lateness), not a lawsuit; the tool never files, never claims IRS
  verification, and explicitly declines to compute the two categories where
  it was not confident in the rule. Comparable to the already-shipped
  `quarterly-estimated-tax-calendar` and `1099k-reconciliation-worksheet` in
  this same risk envelope.
- `ethical_robustness` 8 — no adverse incentive either direction (free, no
  upsell that profits from over- or under-reporting), gets strictly more
  useful as more bookkeepers use it, symmetric risk between false positive
  and false negative.

## Evidence and limits

The OBBBA threshold change and the corporation/attorney-fee exemption rule
were corroborated across multiple independent sources (search snippets from
Patriot Software, Avalara, Withum, Jackson Hewitt, Landmark CPAs, Tax1099, and
the IRS's own instructions-page title) rather than a single source, because
`irs.gov` and every competitor site tried were blocked by this environment's
egress proxy for a direct fetch. The two categories the tool does not compute
were deliberately left uncalculated for the same reason: their exact
thresholds and deadlines could not be independently corroborated to the same
standard from this environment. Distribution and repeat-usage remain
unmeasured, as for every product in this portfolio's current traffic reading
(`usage/usage.yaml`).
