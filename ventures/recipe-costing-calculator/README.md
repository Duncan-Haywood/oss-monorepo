# Recipe Costing Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/recipe-costing-calculator/>

A free browser tool for bakers, cafes, caterers, food trucks and cottage-food sellers. Paste
your pantry (pack size, pack price, usable yield) and your recipes. It shows cost per portion
and per batch, food cost percentage, and the menu price that hits your target. Entirely
client-side; both inputs are plain text so they paste straight from a spreadsheet.

After using this, you can **price a dish from what its ingredients really cost, trim and
labor included**, which used to take a spreadsheet and a unit-conversion chart.

## Try it

Open [`index.html`](index.html) and click **Cost my recipes**.

## Input format

Pantry, one ingredient per line: `name, pack size, pack price, yield %, density`

    All-purpose flour, 25 lb, 14.50, 100, 0.53
    Walnuts, 5 lb, 31.50, 92

Yield is the usable share after trim (default 100). Density (grams per ml) is only needed to
use a weight-priced item by volume or the reverse.

Recipes: a heading, then `ingredient, quantity` lines. `@` uses another recipe.

    # Fudge brownie | portions=24 | price=3.50 | labor=40 | pack=0.12
    Butter, 12 oz
    All-purpose flour, 1 cup
    @Vanilla frosting, 12 portion

## The model

[`calc.mjs`](calc.mjs), pure functions, no dependencies. A line's cost is the fraction of a
pack it uses (after converting units, through density when mixing weight and volume) times the
pack price, divided by the yield. Sub-recipes roll up per portion or per batch with loop
detection. Labor is minutes times your hourly rate; packaging is per portion. Suggested price
is food cost (ingredients plus packaging) divided by the target percentage. Problems are
reported by name and never silently costed as zero.

## Limits

Prices, yields and densities in the example are placeholders. Overhead, tax, spoilage beyond
the yield you enter, labeling and food-safety rules are not modelled. It is not accounting or
pricing advice.

## Tests

`node --test`
