---
kind: polish
topics: [seo]
date: 2026-11-17
---
# Polish: a "free tools for retirees" audience page

Date: 2026-11-17. Track: polish/0. Picked item 2 of "Still weakest" in
`polish-2026-11-17-personal-tax-section.md` ("No audience page for retirees ... a `for-retirees`
page pulling RMD, QCD, IRMAA, Social Security and withdrawal order would match a real query").
Open PRs searched (`list_pull_requests`, open, 50): none touch `audiences.mjs`.

## What changed

- `platform/pages/audiences.mjs`: a `retirees` audience (title "Free retirement calculators for
  retirees and pre-retirees", 57 chars; description 154 chars). Slug rule claims 14 tools:
  aca-subsidy-cliff, fers-retirement-planner, medicare-irmaa-cliff, pension-lump-sum-vs-annuity,
  qcd, retirement-withdrawal-sequencer, rmd, roth-conversion-bracket-fill, four social-security-*,
  uk-pension-withdrawal-tax, uk-state-pension-ni-years-checker. No other audience claims any of them.
- Left out on purpose: saving-years tools (SEP-IRA, UK annual allowance, LISA), employer tools
  (retirement-plan-startup-credit), heirs (inherited-ira-10-year). `audiences.test.mjs` pins both
  sides.
- Headings that said "by trade and business" (hub `for-h`, the audience siblings list) now say
  "trade, business or stage of life" / "trade, business and who you are", since one audience is
  not a trade. Root `README.md` links the new page (a test requires every audience be linked).

## Verification

See the PR's run record `notes` for the build, `check.mjs` and test output.

## Still weakest, and what I would do next

1. **Other household audiences.** The same shape would fit "new parents" (dependent care FSA,
   child tax credit, nanny tax, 529), "people who just lost a job" (COBRA vs marketplace,
   severance, 401(k) loan vs withdrawal, unemployment) and "federal employees" (FERS, TSP). Check
   each clears `MIN_AUDIENCE_TOOLS` with real tools, not padding.
2. **The audience lead copy is business-flavoured** in places (`starting` is styled as a "starting a
   business?" note). It reads fine for retirees, but a household audience may want its own field.
3. Carried over: household health-bill tools still in business sections; a test that fails when a
   `roth|ira|rmd|social-security` slug lands outside `personal-tax`.
