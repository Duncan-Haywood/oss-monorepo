# Recipe Nutrition Facts Label Generator

**Ingredients in, Nutrition Facts panel out.** List a recipe by weight, enter the finished batch weight and a serving size, and get an FDA-style label: per-serving values with the rounding steps applied, percent Daily Values (2020), the ingredient list in weight order, and a *Contains* line for the nine major allergens. For bakers, cottage food sellers, caterers and small food makers who would otherwise pay per recipe or fight a spreadsheet.

Sister tools: [`recipe-costing-calculator`](../recipe-costing-calculator/) (what a batch costs) and [`cottage-food-pricing-calculator`](../cottage-food-pricing-calculator/) (what to charge).

## Run it

Browser: open `index.html` (or serve this directory with `python3 -m http.server`), press **Load a fictional example**, or add ingredients and press **Make the label**.

Command line, no dependencies, Node 18+:

```
node cli.mjs recipe.csv --serving 30 --yield 560 --serving-text "1 cookie"
node cli.mjs recipe.csv --serving 30 --yield 560 --format json   # or csv
cat recipe.csv | node cli.mjs - --serving 30 --yield 560
```

Input CSV, one ingredient per line: `name,grams` then nutrition **per 100 g** in this order: `calories,fat,satFat,transFat,cholesterol,sodium,carbs,fiber,sugars,addedSugars,protein,vitD,calcium,iron,potassium` (g, except cholesterol/sodium/calcium/iron/potassium in mg and vitD in mcg). Blank means unknown and is reported. Lines starting with `#` are comments. `label.mjs` exports the built-in pantry (approximate USDA FoodData Central values).

Tests: `node --test`.

## What it does

- Sums each nutrient over the ingredients, scales to the serving with `serving g / finished batch g`.
- Rounds as this tool reads 21 CFR 101.9(c): calories (0 / 5s / 10s), fats (0 / 0.5 g / 1 g), cholesterol (0 / "less than 5 mg" / 5s), sodium and potassium, carbohydrate, fiber, sugars, protein, vitamin D, calcium, iron. Percent DV uses the 2020 Daily Values; vitamins and minerals use 2/5/10 percent steps.
- Warns about: missing core values, missing finished weight, calories that disagree with 9/4/4 by more than 25%, saturated fat above total fat, sugars above carbohydrate, and similar impossible rows.
- Ingredients are listed heaviest first. Allergens are matched from ingredient names (with plant-milk, cocoa-butter, eggplant and buckwheat false positives handled); bare "flour" is treated as wheat, and vague names such as "natural flavor" or "mixed nuts" are flagged for you to check.

## What it does not do

It does not decide whether your product needs a label or qualifies for an exemption, pick the correct reference-amount serving size for your product, check nutrient or health claims, assess cross-contact, apply state cottage food rules, or verify the numbers you type. It is a calculation aid, not a regulatory determination: check the output against the regulation, your sources and, where it matters, a laboratory. Rounding steps and Daily Values reflect the author's reading and should be confirmed.

## Roadmap (not built)

A larger ingredient database with search, branded-product import, label formats for tabular/linear/small packages, FDA reference-amount lookup, shareable recipe links, per-batch cost beside the label, and a hosted version for teams. This repository ships the free, private core.

## Privacy and usage

Everything runs in your browser or on your machine. Recipes are never uploaded and there are no accounts, cookies or analytics vendors. The optional counter stores only aggregate feature counts in local storage, honors DNT/GPC, and is turned off with the footer button.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, regulatory, nutrition, tax, financial, medical, or engineering advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without notice. We do not promise uptime, backups of anything you type, or that a URL will keep working. Do not use this as a system of record. If a tool needs to survive, export your inputs and run it yourself.

MIT licensed. Optional support: [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
