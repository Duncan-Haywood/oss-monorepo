# Candidate: Grant reporting tracker

**One line.** A local-first deadline and restricted-balance review queue for
small nonprofits managing several awards without a grant-management subscription.

Scored 2026-08-24. Composite 6.625 · floor 1 (ai_leverage).

**Verdict: graduated 2026-08-24 as a venture.** The first experiment is a
browser-local workflow: enter an award date, reporting interval, award amount,
and spend; sort the next reporting date; and export a reviewable CSV.

## Why this candidate won

- **Target user and pain:** a small nonprofit grant coordinator tracking 10-20
  awards in a spreadsheet, where a missed report can delay reimbursement or
  jeopardize a relationship with a funder.
- **Value and return use:** the queue answers "what needs attention next?" and
  exposes remaining restricted balance. Reporting cycles recur, so the workflow
  has a natural monthly return loop.
- **Alternatives and differentiation:** GrantHub and broader grant-management
  suites exist, but are priced and scoped for organizations that need a system
  of record. This is a private, no-account planning tool that exports into the
  team's existing process and never claims to interpret an award agreement.
- **Discovery:** "grant reporting deadline tracker", "nonprofit grant calendar",
  and "track grant reporting requirements" are direct search phrases. The
  README and page use those terms, with SoftwareApplication metadata and a
  crawlable sitemap.
- **Business model:** free usage can establish repeat demand; later options are
  a hosted history/team tier or a paid export/template pack. No payment is
  collected in the prototype.
- **Build and cost:** one offline browser workflow ships in one session, with
  zero API, hosting, account, database, or per-user inference cost.
- **Automation:** deterministic date arithmetic and CSV generation need no
  operator. Future reminders should be opt-in and user-controlled rather than
  silently emailing funders or filing reports.
- **Risks:** funder calendars vary, date intervals can be wrong, and restricted
  accounting is domain-sensitive. The product shows a planning observation,
  not a compliance result; users must check the award agreement and a qualified
  professional. No donor or grant content leaves the browser.
- **Portfolio fit:** unlike the e-commerce calculators, trade bid tools, and
  evidence monitors already in `ventures/`, this serves nonprofit grant
  coordinators and has recurring deadline work. It is not a product line of an
  existing venture.

## Evidence and limits

The opportunity scan found current market reporting that small nonprofits often
use spreadsheets for multiple grants and that dedicated grant-tracking products
start around $95/month. Those are external screening signals, not customer
validation. The venture's hypotheses remain untested until organic usage or
customer contact provides evidence.
