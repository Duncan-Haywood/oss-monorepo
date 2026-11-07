# Allergen Label Maker

A free browser tool for cafes, bakeries, delis, caterers and market stalls. Paste each dish's
ingredients and get an **allergen matrix** (the 14 UK/EU allergens, or the US 9) and a
**print-ready label** per dish with the allergens in bold, the way Natasha's Law (England,
pre-packed for direct sale, from 1 October 2021) asks for them. Entirely client-side.

**Live tool:** https://marisstella.app/allergen-label-maker/

After using this, you can **fill in an allergen folder and print a compliant-looking label from the
recipe you already have**, which used to mean reading every ingredient against the 14 allergens
by hand.

Not legal advice. It reads words; the seller is responsible for the label. Confirm every dish
against supplier information. MIT licence. Nothing is uploaded; usage counts stay in local
storage and can be turned off.

## Try it

Open [`index.html`](index.html) and click **Check allergens**.

## Input format

    # Chicken caesar wrap | may=peanuts, sesame
    Flour tortilla, grilled chicken breast, caesar dressing (egg yolk, anchovy, mustard), Brand X pesto [milk, tree nuts]

- Ingredients in descending order of weight, comma-separated, sub-ingredients in brackets.
- `[milk, soya]` after an ingredient states what its supplier label says; `[none]` clears guesses.
- `| may=peanuts` adds a precautionary line (a risk assessment only you can make).

## The model

[`calc.mjs`](calc.mjs), pure functions, no dependencies. Three tiers for each dish and allergen:

1. **Contains**: a named ingredient (milk, prawns, tahini, plain flour) or a supplier tag.
2. **Check**: a food that usually contains it without naming it (hummus, pasta, Worcestershire
   sauce, dried apricots). Shown in the matrix, never bolded or listed under "Contains" until the
   user confirms it with a tag.
3. **Advisory**: foods people ask about that are not on the legal list (pine nut, coconut, chestnut).

Look-alikes are excluded before matching (coconut milk, cocoa butter, butternut, rice flour,
aubergine, "egg-free", plant milks counted as the plant). In the US list, rye and barley are not
wheat, and molluscs, celery, mustard, lupin and sulphites are not US major allergens.

## Tests

`node --test '*.test.mjs'` (19 engine tests, 5 page tests, usage counter). The page was also
driven in headless Chromium on 2026-11-07: example run, UK/US switch, HTML in a dish name is
escaped.

## What is not verified

- The word list is from the law's allergen names and common sense, not from a food-safety
  authority's lookup tables, and has not been checked by a food-safety professional. Wanted: a
  real allergen folder to compare against.
- Label layout is not checked against FSA guidance wording beyond the ingredient list and the
  allergen emphasis; there is no QUID (percentage) or net quantity.
- Sulphites need the supplier's mg/kg figure; the tool can only flag wine, dried fruit and the like.

## Next

A recipe library kept in the browser, label sheets for common printers, a customer-facing
allergen page with a QR code, and (when rails exist) a paid branded pack. See `VENTURE.yaml`.
