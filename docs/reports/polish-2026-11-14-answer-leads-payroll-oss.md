# Polish 2026-11-14: answer-first leads on mileage, nanny tax, employer payroll, EU OSS

Picked from `polish-2026-11-13-answer-leads-nexus-obbba.md`, "Still weakest" item 1, which named
these tools first. I searched open PRs (`polish in:title`) and found none touching them. PR #15686
(select spans on 84 tools) is a separate surface, so I left the select-clip items alone.

## What changed

- `data-answer-lead` paragraphs (class `answer-source`, which picks up the shared lead style) on:
  - **mileage-deduction-method-calculator** (63 words): 72.5 cents Jan to Jun, 76 cents from Jul 1;
    parking and tolls on top. The existing intro became the lead, and the how-to sentence follows it.
  - **nanny-tax-calculator** (76 words): $3,000 coverage threshold, 7.65% each side, $184,500 SS
    base, $1,000-a-quarter FUTA test, 6% on the first $7,000, 0.6% after the credit. The header note
    no longer says the federal figures are placeholders for "any year". They are 2026's, editable.
  - **employer-payroll-tax-cost-calculator** (74 words): 6.2% to $184,500, 1.45% on everything, FUTA
    6% on $7,000 less up to 5.4% = $42 per employee, more in a credit-reduction state.
  - **eu-vat-oss-calculator** (86 words): EUR 10,000 (net, EU-wide, current and preceding year),
    destination rates above it, quarterly return due by the end of the month after the quarter.
- Each lead also goes into the venture's `llms.txt` under "## What it answers".
- `platform/pages/answer-lead.test.mjs`: nanny and employer go into `PILOTS`. New tests check that the
  mileage cents rates equal `RATES_2026`, and that the EU lead's euro amount equals `THRESHOLD_EUR`
  and its due-date wording matches `periodDueDate`.

## Sources, read today (2026-11-14), not copied from module comments

irs.gov resolved through the proxy this session (HTTP 200). That is unlike the 2026-11-13 run,
where law.cornell.edu and uscode.house.gov gave no response.

- IRS "Standard mileage rates" (last reviewed 2026-07-28): 72.5 (IR-2025-128) and 76 (IR-2026-29).
- IRS Publication 926 (2026): $3,000, $1,000 in any quarter of 2025 or 2026, $7,000, 6.0% less up to
  5.4%, $184,500.
- IRS Publication 15 (2026): $184,500, 6.2% / 1.45%, $7,000 FUTA wage base.
- European Commission, vat-one-stop-shop.ec.europa.eu: EUR 10,000 "in the current and the preceding
  calendar year", and the return is due "by the end of the month following the end of the tax period".
  The ec.europa.eu taxation-customs URL gave a 404. eur-lex gave a 302 that I didn't follow.

IFTA was skipped. iftach.org's home page loads, but the Articles of Agreement were not reachable in
the time I had, and the lead would rest on them.

## Measured

Chromium on `dist/` before (a copy of the pre-change build) and after, reduced motion, 844 px tall:

| Page | lead 390 | first input 390 | lead 1280 | first input 1280 |
|---|---|---|---|---|
| mileage | 0 → 228 | 655 → 824 | 0 → 94 | 497 → 583 |
| nanny-tax | 0 → 275 | 678 → 989 | 0 → 119 | 523 → 659 |
| employer-payroll | 0 → 275 | 599 → 890 | 0 → 119 | 435 → 570 |
| eu-vat-oss | 0 → 299 | 834 → 1,148 | 0 → 119 | 538 → 673 |

None of the four scrolls sideways (scrollWidth equals the viewport at 390 and 1,280). Screenshots:
`img/polish-2026-11-14-lead-nanny-390-before.png` and `-after.png`.

The cost is the first input moving down 170 to 315 px on a phone. Mileage cost least because its
intro became the lead. The other three kept their how-to paragraph under the lead.

Tests: `node --test platform/pages/answer-lead.test.mjs` 62 pass, 0 fail. The four tools' own suites
pass (27, 26, 22, 80; 0 fail). Site build suite and `check.mjs`: see the run record's notes.

## Still weakest, and what I would do next

1. **Shorten the how-to paragraph under the new leads** on nanny-tax and eu-vat-oss. Each repeats
   part of what the form labels say. Folding it into one sentence would win back about 100 px of the
   first-input depth on a phone.
2. **More leads.** Same grep as before (slug matches fee/limit/threshold/tax/deduction/credit, no
   `data-answer-lead`): about 22 left. ifta-quarterly-fuel-tax-calculator still needs a session that
   can read the IFTA Articles of Agreement (R1220 quarterly due dates, R245 qualified vehicle).
3. **Re-date the OBBBA leads.** irs.gov resolves now, so the 2026-09 "As of" dates on the tips,
   overtime, auto-loan and charitable leads could be checked against IRS pages and moved forward.
4. Carried over: lower the lead cap to 90 words; the economic-nexus llms.txt line 9 still carries
   the older lead; `MAX_LINKS` 8 → 6.
