# Polish, 2026-11-13: one shared style for answer-first leads

**What was weak.** 55 tool pages open with an answer-first lead
(`<p class="answer-source" data-answer-lead>`): one plain sentence with its primary
source and an as-of date, written for readers and answer engines. 54 of them had no
CSS, so the sourced answer looked exactly like the marketing paragraph under it. The
patent-maintenance-fee-planner had its own inline `border-left` style
(`polish-2026-11-13-answer-leads-nexus-obbba.md`, item 3).

**What changed.**

- `platform/pages/answer-lead-style.mjs` (`ANSWER_LEAD_CSS`) adds the rule to
  `pf-chrome.css`, which every tool page already links. That means no new request.
  The rule gives a 3px left rule at 40% of the text colour, a 5% tint of the text colour,
  10px 14px padding and a 0 6px 6px 0 radius. At 480px and below it uses
  8px 12px padding and 0.95em type.
- Colours come from `currentColor`, so a dark-mode page (patent planner) gets a light
  rule and tint without its own CSS. The text colour is never set. A page can override
  the colours with `--lead-line` and `--lead-bg`.
- The patent planner's inline style is removed.
- `answer-lead-style.test.mjs` checks four things: the rule is in the chrome stylesheet;
  it sets no text colour; the tint is at most 8%; every lead carries the class with no
  inline style and no page copy of the rule.

**Measured** with Playwright against `dist/` (built before the change, with
`ANSWER_LEAD_CSS` injected for "after"), reduced motion, header height and first-input
depth:

| page | lead height 390 px | first input 390 px | lead height 1,280 px |
|---|---|---|---|
| kickstarter-fee-calculator | 192 → 221 | 947 → 976 | 96 → 116 |
| 401k-loan-vs-withdrawal | 248 → 252 | 971 → 974 | 99 → 119 |
| social-security-earnings-test | 347 → 369 | 885 → 906 | 124 → 144 |
| facebook-marketplace-fee | 144 → 176 | 1027 → 1058 | 72 → 92 |
| etsy-profit-calculator | 288 → 290 | 949 → 950 | 144 → 188 |
| patent-maintenance-fee-planner | 190 → 206 | 1177 → 1193 | 95 → 115 |
| qbi-deduction-calculator | 322 → 322 | 1571 → 1570 | 124 → 144 |
| economic-nexus-threshold-tracker | 408 → 404 | 1709 → 1704 | 144 → 164 |

The cost is 0 to 32 px on a phone, because the smaller type offsets the padding. On a
desktop it is about 20 px; Etsy costs 44 px because its lead sits in a narrower column.
No page scrolls sideways at 390 px (`scrollWidth` 390). Contrast: the tint is 5% of the
text colour over the page background. For dark text on a light page that lowers
the background's luminance by at most about 5%, so the contrast ratio falls by at most
about 5%. The eight pages measured all use near-black text (rgb 19 to 37 per channel),
so they keep a wide margin above 4.5:1. I did not run `contrast.mjs` against a rebuilt
`dist/`.

Screenshots: [kickstarter 390 before](img/polish-2026-11-13-answer-lead-kickstarter-390-before.png) ·
[after](img/polish-2026-11-13-answer-lead-kickstarter-390-after.png) ·
[etsy 1,280 before](img/polish-2026-11-13-answer-lead-etsy-1280-before.png) ·
[after](img/polish-2026-11-13-answer-lead-etsy-1280-after.png)

## Still weakest, and what I would do next

1. **Leads on the other ~29 high-intent tools** (`polish-2026-11-13-uk-ltd-lead.md`, item 2).
   They now get the look for free. Pick ones whose answer is a stable statutory figure, and
   check the calculator's worked example against the source first.
2. **Long leads.** social-security-earnings-test (369 px on a phone) and
   economic-nexus-threshold-tracker (404 px) put a "how to use the tool" sentence or a
   per-state list inside the lead. Keep the lead to the fact and its source, and move the
   rest to the next paragraph. The box now makes that length visible.
3. **A visible label?** A small "Quick answer" label was left out on purpose: CSS
   generated text is read inconsistently by screen readers, and markup would need 55
   edits. If one is wanted, add `<span class="answer-label">` in the markup and style it here.
4. Carried over: `MAX_LINKS` 8 → 6 in `intro-links.test.mjs`; appointment-deposit-calculator
   and quarterly-estimated-tax-calendar first-input depth; `.pager` defined twice in the
   writing STYLE; the ticker's third line at 320 px.
