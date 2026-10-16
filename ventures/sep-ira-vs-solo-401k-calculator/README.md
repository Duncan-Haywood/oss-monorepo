# SEP-IRA vs Solo 401(k) Calculator

A free browser calculator for a sole proprietor or single-member LLC choosing between a SEP-IRA and a Solo 401(k) for 2026. Entirely client-side; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/sep-ira-vs-solo-401k-calculator/

After using this, you can now **see how much more a Solo 401(k) lets you save than a SEP-IRA at your own profit, and what that is worth in tax**, which used to mean working two IRS worksheets by hand.

- SEP-IRA: employer contribution only, 20% of net self-employment earnings, up to $72,000, no catch-up.
- Solo 401(k): the same 20% plus an employee deferral ($24,500; $32,500 at 50; $35,750 at 60-63), capped at $72,000 plus catch-up.
- Net profit needed to max each plan out (about $376,000 for the SEP-IRA, $252,000 for a Solo 401(k) under 50), found by bisection.

Limits are the 2026 figures verified in `solo-401k-contribution-calculator`. Scope: no employees. Not tax advice.

Run the tests: `node --test ventures/sep-ira-vs-solo-401k-calculator/*.test.mjs`
