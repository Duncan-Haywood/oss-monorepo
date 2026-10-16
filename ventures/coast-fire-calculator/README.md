# Coast FIRE Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/coast-fire-calculator/>

A free browser tool: **enter your age, savings and the retirement you want, and see your Coast FIRE number today, whether
you have reached it, the age you will if you keep saving, and the part-time income needed while you coast (Barista FIRE).**
Nothing is uploaded.

After using this, you can now **tell whether you can stop contributing and let your savings grow to your retirement number,
and what a lower-paid job would have to cover**, which used to be a forum spreadsheet.

## Use

1. Open `index.html`, enter your numbers, click Calculate.
2. Pure logic is in `calc.mjs` (`plan()`); tests: `node --test`.

All amounts are in today's dollars with real (after-inflation) returns, compounded monthly. Not modelled: taxes, Social
Security timing, healthcare before Medicare, sequence-of-returns risk, fees. Illustration only, not financial advice. No
warranty; see the page footer. MIT licensed (`LICENSE`).
