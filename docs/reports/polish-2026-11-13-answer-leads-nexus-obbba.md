# Polish 2026-11-13: answer leads on the nexus tracker and four OBBBA deduction tools

**Why.** Item 1 of "Still weakest" in `polish-2026-11-13-answer-leads-etsy-garnishment.md`, carried
in `polish-2026-11-13-last-intro-walls.md` and `polish-2026-11-13-shared-jump-row.md`: about 31
high-intent tools had no `data-answer-lead`. Economic-nexus-threshold-tracker was named first.

## What changed

- `data-answer-lead` paragraphs on five pages. On the four deduction pages, the existing intro
  paragraph already stated the figures. It became the lead, and a source and an as-of date were
  added, so the page gained no new paragraph. The nexus tracker got a new lead under the `h1`.
  - economic-nexus-threshold-tracker: 40 states + DC at $100,000, CA/NY/TX $500,000, AL/MS
    $250,000, 18 with a transaction test (CT and NY are AND tests), five with no sales tax. Source:
    *Wayfair* plus the module's secondary compilation (Numeral, TaxCloud). As of 2026-09-24.
  - no-tax-on-tips-overtime-calculator: 26 U.S.C. 224/225. As of 2026-09-24.
  - auto-loan-interest-deduction-calculator: 26 U.S.C. 163(h)(4) and the proposed regs of 2026-01-02.
    As of 2026-09-24.
  - charitable-deduction-calculator: 26 U.S.C. 170 incl. 170(p). As of 2026-09-25.
  - gambling-loss-deduction-calculator: 26 U.S.C. 165(d); worked example $10,000 / $9,000 / $1,000.
    As of 2026-09-25.
- Each lead's text is copied into the venture's `llms.txt` as a "## What it answers" section.
- `platform/pages/answer-lead.test.mjs`: five PILOTS entries, so every `$` figure must be exported
  by the calc module. One extra nexus test recounts the state counts, the named $500k/$250k states,
  the AND-test states and the no-tax states from `STATE_THRESHOLDS`.

**Dates are the modules' verification dates, not today's.** The proxy gave no response (HTTP 000)
from law.cornell.edu and uscode.house.gov, so I did not re-read the statutes. Every figure is one the
calc module already carried, with the sources listed in its header comment. The first draft said "41
states and DC". The table's 41 includes DC, and the new count test is the kind of check that catches
that.

## Measured

- `node --test platform/pages/answer-lead.test.mjs`: 56 pass, 0 fail.
- `run_venture_tests.py` on the five slugs: 5 suites, 0 failed.
- Full build, `check.mjs` and `node --test 'platform/pages/*.test.mjs'`: see the PR's run record
  notes.
- No ranking or citation change measured. Usage is unmeasured.

## Still weakest, and what I would do next

1. **About 26 high-intent tools still have no lead.** Same grep (slug matches
   fee/limit/threshold/tax/deduction/credit, no `data-answer-lead`). Next good ones, with
   statute-backed constants already in calc: mileage-deduction-method-calculator,
   nanny-tax-calculator (FICA/FUTA rates, $1,000 quarter test), employer-payroll-tax-cost-calculator,
   eu-vat-oss-calculator (EUR 10,000 OSS threshold), ifta-quarterly-fuel-tax-calculator. Skip any
   whose rates the code calls illustrative.
2. **Re-verify the OBBBA dates** from a session where law.cornell.edu or uscode.house.gov
   resolves, then move "As of" forward.
3. **A shared lead style.** 53 pages use `class="answer-source"` with no shared CSS: one page
   inlines a border-left style, the rest render as a plain paragraph. A one-rule addition to the
   chrome stylesheet (as `jump-row.mjs` did) would make the lead visibly a "quick answer" on every
   page at once. Check contrast and that it inherits the page's colours.
4. Carried over: appointment-deposit-calculator and quarterly-estimated-tax-calendar first-input
   depth; `MAX_LINKS` 8 → 6; `.pager` defined twice in the writing STYLE.
