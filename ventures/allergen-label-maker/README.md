# Allergen Label Maker

A free browser tool for cafes, bakeries, delis, caterers and market stalls. Paste each dish's
ingredients and get an **allergen matrix** (the 14 UK/EU allergens, or the US 9) and a
**draft label** per dish (check it, then print) with the allergens in bold, the way Natasha's Law (England,
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
- `[milk, soya]` after an ingredient states what its supplier label says; `[none]` clears "check" guesses, never an allergen the ingredient names (`butter [none]` is still milk). Every tag in an ingredient counts.
- `| may=peanuts` adds a precautionary line (a risk assessment only you can make).

## The model

[`calc.mjs`](calc.mjs), pure functions, no dependencies. Three tiers for each dish and allergen:

1. **Contains**: a named ingredient (milk, prawns, tahini, plain flour) or a supplier tag.
2. **Check**: a food that usually contains it without naming it (hummus, pasta, Worcestershire
   sauce, dried apricots). Shown in the matrix, never bolded or listed under "Contains" until the
   user confirms it with a tag.
3. **Advisory**: foods people ask about that are not on the legal list (pine nut, coconut, chestnut). In the US list, pine nut and chestnut are declared tree nuts (FDA, *Questions and Answers Regarding Food Allergens*, Edition 5, 2025).

On the label, exactly the words the reader declared are emphasised, so the label and the matrix agree, and a supplier tag is printed in the list: `pesto [milk, tree nuts]` prints as pesto (**milk**, **tree nuts**).

Look-alikes are excluded before matching (coconut milk, cocoa butter, butternut, rice flour,
aubergine, "egg-free", plant milks counted as the plant). In the US list, rye and barley are not
wheat, and molluscs, celery, mustard, lupin and sulphites are not US major allergens.

## Tests

`node --test '*.test.mjs'` (28 engine tests, 6 page tests, 7 customer-page tests, 6 usage-counter tests). The page was also
driven in headless Chromium on 2026-11-07: example run, UK/US switch, HTML in a dish name is
escaped.

## What is not verified

- The word list is from the law's allergen names and common sense, not from a food-safety
  authority's lookup tables, and has not been checked by a food-safety professional. Wanted: a
  real allergen folder to compare against.
- Label layout is not checked against FSA guidance wording beyond the ingredient list and the
  allergen emphasis; there is no QUID (percentage) or net quantity.
- Sulphites need the supplier's mg/kg figure; the tool can only flag wine, dried fruit and the like.

## Known gaps (quality audit round 59, 2026-11-13)

From [`portfolio/quality/audits/2026-11-13-allergen-label-maker.json`](../../portfolio/quality/audits/2026-11-13-allergen-label-maker.json) and a second, blind audit of the same round ([`portfolio/quality/blind-pairs/2026-11-13-e/`](../../portfolio/quality/blind-pairs/2026-11-13-e/)).
Fixed the same day: oatmeal, farina, cous cous, curds, lactalbumin, roe, caviar, eel, carp, pike,
perch, grouper, mahi mahi, taramasalata, sea bream, turbot, skate, john dory, lox and filbert are now
named; "shellfish" and "nuts" are flagged to check; `[none]` no longer clears a named allergen; every
supplier tag in an ingredient is read, not only the first; pine nut and chestnut are declared tree nuts
in US mode (FDA allergen Q&A, Edition 5, 2025); and the label's bold is built from what the detector
declared (no more bold "coconut milk", no more plain "brie"), with supplier tags printed in the list.
Still open:

- **The US Contains line names the class, not the species**: "Tree nuts", "Fish" and "Crustacean
  shellfish", where FALCPA (21 USC 343(w)(2)) needs the specific nut, fish or shellfish.
- **UK labels add a "Contains:" line** of category names, which FSA guidance advises against repeating
  for prepacked and PPDS food when allergens are already emphasised in the list.
- "Plain flour" is emphasised as written; a label should say *wheat* flour. In US mode a bare "flour"
  is a check, though 21 CFR 137.105 makes flour wheat flour.
- Tofu written as "bean curd" is not recognised as soya; tag names accept plurals only ("tree nuts").

## Customer allergen page (2026-11-07)

`menupage.mjs` builds one self-contained HTML file from the analysis (button "Download customer
allergen page"): customers tick the allergens they avoid and each dish is sorted into contains,
ask staff (a "check" or "may contain" allergen) and not listed. It never says "safe" or "free
from"; every state ends with "tell staff". Tested by `menupage.test.mjs` (classification, page
script equals module rule, no safe/free-from wording, hostile names, no network) and opened in
headless Chromium (tick eggs: 2 of 5 listed none, contains shown last). Host the file anywhere or
put its URL behind a QR code. Not verified: how real customers read it.

## Next

A recipe library kept in the browser, label sheets for common printers, a QR code generator for the page, and (when rails exist) a paid branded pack. See `VENTURE.yaml`.
