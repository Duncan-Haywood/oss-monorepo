# Experience Mod Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/experience-mod-calculator/>

A free browser tool for contractors and small employers: **type the values from your workers' comp experience rating worksheet and your claims, and see
your estimated experience mod, the premium it adds or saves, and what each claim costs you per year and over the three years it counts.** Nothing is
uploaded.

After using this, you can now **see which claim is driving your x-mod and what one more claim would do before you bid work that asks for a mod under
1.00**, which used to mean waiting for the bureau's worksheet or paying a broker to run it.

## Use

1. Open `index.html`, fill in E, D-ratio, W, B (from the worksheet) and list the claims, click Estimate my mod.
2. Pure logic is in `calc.mjs` (`plan()`, `modFor()`); tests: `node --test`.

Modelled: NCCI-style split-rating formula, split point, per-claim limit, medical-only discount, per-claim marginal cost, hypothetical new claims.
Not modelled: independent-bureau states' plans, W/B tables, expected loss rates, ownership changes, claim valuation dates. Not insurance, legal or
tax advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
