# card-bonus-planner

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/card-bonus-planner/>

After using this, you can now **plan credit card sign-up bonuses around your
real monthly spending** and know the date your 5/24 count drops and the
earliest day each new application fits, which used to be a hand-kept
spreadsheet.

`index.html` runs in the browser and uploads nothing; cards are kept in local
storage only (no account numbers needed). You get:

- minimum-spend deadline, remaining spend and per-month pace for each open bonus;
- 5/24 count and the date you are back under it;
- community-reported issuer velocity rules (Amex, Citi, Capital One, Bank of
  America 2/3/4) with the next clear date for each;
- net bonus value (points x your cents-per-point + cash - first-year fee);
- a schedule for a wishlist: each card goes on the earliest day that clears the
  issuer rules and leaves your monthly spend able to cover every active
  minimum-spend deadline (demand-bound feasibility), plus `.ics` export.

```
node --test
```

Files: `plan.mjs` (dates, rules, valuation, scheduler, ICS), `usage.mjs`
(opt-out local counters).

Limits: issuer rules are community-reported, not published by issuers, and are
editable only in `DEFAULT_RULES`; the scheduler is greedy (not provably
optimal) and treats spend as freely splittable across days; no lifetime-bonus
or product-family rules (Amex once-per-lifetime, Citi 48-month) yet. Free and
as-is, no warranty; not legal, tax, or financial advice; not affiliated with
any bank.
