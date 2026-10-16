# Cake Pricing Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/cake-pricing-calculator/>

A free browser tool for home bakers and cake decorators: **enter servings, ingredient and decoration costs, the hours each stage takes, your hourly wage, delivery,
overhead, fees and a target margin, and get the price that pays you, the price per serving, break-even / target / premium tiers and a deposit amount.** Enter a price
you already quoted to see what an hour of your time really earned. Nothing is uploaded.

After using this, you can now **quote a custom cake from its real cost instead of tripling the ingredients**, which used to leave a six-hour fondant cake paying less than minimum wage.

## Use

1. Open `index.html`, fill in the cake, click Price the cake.
2. Pure logic is in `calc.mjs` (`priceCake()`); tests: `node --test`.

Modelled: materials, labor, delivery, overhead, fee and margin taken from the price, tiers, deposit, quoted-price check. Not modelled: cottage-food law, licences,
insurance, sales tax, tasting costs, equipment wear. Not business or legal advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
