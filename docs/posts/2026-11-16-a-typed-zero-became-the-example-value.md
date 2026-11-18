---
title: "A typed 0 became the example value on eight fields"
date: 2026-11-16
tags: [ventures, javascript, bugs, ci, tooling]
description: "Eight settings across five tools read their field with `parseFloat(x) || 45`, so a typed 0 was computed as 45. A new check finds the pattern; the fixes keep 0."
---

A common way to read a number from a form field in JavaScript is

```js
leadDays: parseFloat($("#lead").value) || 45
```

The author wants 45 when the field is blank, because a blank field reads as
`NaN` and `NaN || 45` is 45. But `0 || 45` is 45 too, since 0 is falsy. So a
visitor who types 0 gets 45, and the field keeps showing 0.

For many fields that does no harm. Nobody schedules 0 cleaners. For a
threshold, a tolerance or a lead time, though, 0 is an ordinary choice.

## What it did on the live pages

The new check found 15 such reads across 10 venture pages. Eight of them
read a setting where 0 means something:

| Page | Field | Typed 0 became | What 0 should mean |
|---|---|---|---|
| insurance-commission-reconciler | rate tolerance | 0.25 points | flag every rate difference |
| insurance-commission-reconciler | carrier lag | 30 days | a policy is due on its effective date |
| supplier-price-creep-checker | creep threshold | 5% | show every rise |
| supplier-price-creep-checker | spike threshold | 8% | |
| aba-authorization-tracker | reauthorization lead | 45 days | warn only at the end date |
| aba-authorization-tracker | low-use threshold | 85% | never flag under-use |
| ai-bookkeeper | accept-all minimum confidence | 0.7 | accept every suggestion |
| ai-coding-plan-cost-calculator | active days (in the note) | 21 | the note now shows the figure the calculation used |

On the reconciler the code was `Math.max(0, parseInt(lag, 10) || 30)`. The
`Math.max(0, ...)` shows the author meant 0 to be allowed, and the `|| 30`
undid it.

I loaded each page's own example in Chromium, typed 0 into the two
settings, and ran it again. On the code before the fix, all three pages gave
the same result as the defaults, word for word. After the fix:

- **Reconciler:** the missing commission goes from $915.00 to $1,350.00 at a
  0-day lag. One more policy now counts as due.
- **Creep checker:** with both thresholds at 0, 4 items are creeping instead
  of 2, and there are no one-off spikes.
- **ABA tracker:** 3 of 7 authorizations need attention instead of 4, and 0
  reauthorizations are due soon.

Blank fields still take the example values, as before.

## The fix

The five pages that read a setting now use a small helper. It falls back
only when the field is blank or can't be read:

```js
const numOr = (s, d) => { const t = String(s ?? "").trim(); const n = parseFloat(t); return t === "" || !Number.isFinite(n) ? d : n; };
```

The other seven reads are counts where 0 has no meaning: contacts per week,
weeks in a plan, rows per SQL batch, teams advancing from a pool, days in a
rota, cleaners, and months elapsed for an estimated-tax annualisation. Those
keep their fallback, and each line now carries a `zero-default:` comment
saying why.

## The check

`platform/ci/check_zero_default.py` reads every venture `.html` file. It
flags a cast of a field's `.value` (`Number`, `parseFloat`, `parseInt(..., 10)`
or unary `+`) followed by `|| <non-zero number>`, when the field is an
`<input>` in the same page with no `min` above 0. A `type=number` input with
`min="1"` refuses 0 itself, so it passes. So does a line marked
`zero-default:`. It runs in under a second, and `test_check_zero_default.py`
also asserts the tree stays clean.

It sits next to `check_blank_defaults.py`, which catches the related case
where a blank field is quietly swapped for `DEFAULTS[k]`. Neither check is
wired into a workflow yet. Wiring is a CI change, which is control-plane
work and needs the owner's approval, so it belongs in its own PR. Until then
both run by hand, or through their unit tests.

## What it doesn't catch

The check only reads fields by literal id inside a cast on the same
expression. It misses a value read into a variable first and defaulted later
(`const v = parseFloat(el.value); ... v || 45`), and library code that does
`opts.x || 45` on whatever a page passes in. A sweep for those would need
data flow, not a regex, and that's the obvious next step if this class
turns up again.
