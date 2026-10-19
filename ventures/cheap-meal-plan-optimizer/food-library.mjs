// A pick-list of common foods, so a visitor does not have to type nutrition
// for every line. Same line format as `parseFoods` in calc.mjs:
// name | price | kcal | protein | carbs | fat | fibre | max | pack | sodium | calcium | iron | potassium
//
// Nutrition is rounded, approximate generic values per the serving named
// (USDA FoodData Central style, plain unsalted or unfortified unless the name
// says so). Prices are EXAMPLES, not quotes: the page tells the visitor to
// replace them with what they pay.
export const FOOD_LIBRARY = [
  {
    group: "Grains and starches",
    foods: [
      "Brown rice, dry (50 g) | 0.16 | 185 | 4 | 38.6 | 1.5 | 1.8 |  | 30 | 4 | 12 | 0.8 | 112",
      "Pasta, dry (56 g) | 0.14 | 208 | 7.3 | 42 | 1.1 | 2.4 |  | 8 | 3 | 11 | 1.3 | 125",
      "Quinoa, dry (50 g) | 0.40 | 184 | 7 | 32.1 | 3 | 3.5 |  |  | 3 | 24 | 2.3 | 282",
      "Cornmeal, dry (40 g) | 0.10 | 144 | 2.8 | 30.8 | 1.6 | 2.9 |  |  | 3 | 3 | 1.4 | 115",
      "Corn tortilla (1) | 0.08 | 57 | 1.5 | 12 | 0.7 | 1.7 | 8 | 30 | 11 | 46 | 0.4 | 40",
      "Sweet potato (130 g) | 0.30 | 112 | 2.1 | 26 | 0.2 | 3.9 |  |  | 70 | 39 | 0.9 | 410",
    ],
  },
  {
    group: "Beans, soy and nuts",
    foods: [
      "Chickpeas, dry (50 g) | 0.18 | 182 | 9.5 | 30.3 | 3 | 8.6 |  | 18 | 12 | 52 | 2.4 | 436",
      "Kidney beans, dry (50 g) | 0.20 | 167 | 11.8 | 30 | 0.4 | 12.5 |  | 18 | 12 | 72 | 4.1 | 703",
      "Split peas, dry (50 g) | 0.15 | 176 | 12.3 | 31.9 | 0.6 | 12.8 |  | 18 | 8 | 28 | 2.2 | 491",
      "Tofu, firm (100 g) | 0.60 | 144 | 17.3 | 2.8 | 8.7 | 2.3 | 3 | 4 | 14 | 683 | 2.7 | 237",
      "Soy milk, unsweetened, fortified (1 cup) | 0.25 | 80 | 7 | 4 | 4 | 1 | 4 | 4 | 90 | 300 | 1.1 | 300",
      "Peanuts, dry roasted, unsalted (28 g) | 0.15 | 164 | 6.6 | 6 | 13.9 | 2.2 | 3 |  | 2 | 15 | 0.4 | 178",
      "Almonds (28 g) | 0.45 | 164 | 6 | 6.1 | 14.2 | 3.5 | 3 |  | 0 | 76 | 1.1 | 208",
    ],
  },
  {
    group: "Vegetables and fruit",
    foods: [
      "Onion (100 g) | 0.12 | 40 | 1.1 | 9.3 | 0.1 | 1.7 |  |  | 4 | 23 | 0.2 | 146",
      "Spinach, raw (100 g) | 0.40 | 23 | 2.9 | 3.6 | 0.4 | 2.2 |  |  | 79 | 99 | 2.7 | 558",
      "Tomatoes, canned (100 g) | 0.15 | 32 | 1.6 | 7.3 | 0.3 | 1.9 |  |  | 132 | 33 | 0.9 | 217",
      "Orange (1) | 0.45 | 62 | 1.2 | 15.4 | 0.2 | 3.1 | 3 |  | 0 | 52 | 0.1 | 237",
    ],
  },
  {
    group: "Dairy",
    foods: [
      "Milk, nonfat (1 cup) | 0.28 | 83 | 8.3 | 12.2 | 0.2 | 0 | 4 |  | 103 | 299 | 0.1 | 382",
      "Cottage cheese, low-fat (113 g) | 0.55 | 81 | 14 | 3.1 | 1.2 | 0 | 2 |  | 459 | 69 | 0.1 | 156",
      "Butter (1 tbsp) | 0.15 | 102 | 0.1 | 0 | 11.5 | 0 | 4 |  | 82 | 3 | 0 | 3",
    ],
  },
  {
    group: "Meat and fish",
    foods: [
      "Chicken breast, raw (100 g) | 0.70 | 120 | 22.5 | 0 | 2.6 | 0 | 4 |  | 45 | 5 | 0.4 | 334",
      "Ground turkey 93%, raw (100 g) | 0.90 | 150 | 18.7 | 0 | 8.3 | 0 | 3 |  | 69 | 21 | 1.2 | 239",
      "Ground beef 80/20, raw (100 g) | 1.00 | 254 | 17.2 | 0 | 20 | 0 | 3 |  | 66 | 18 | 1.9 | 270",
      "Sardines in oil, canned (92 g) | 1.30 | 191 | 22.6 | 0 | 10.6 | 0 | 2 |  | 465 | 351 | 2.7 | 365",
    ],
  },
];

export const libraryLines = () => FOOD_LIBRARY.flatMap((g) => g.foods);
export const lineName = (line) => String(line).split("|")[0].trim();

/**
 * Appends the chosen library lines (by name) to the foods text. A name the
 * text already lists, in any case, is skipped so a second click never makes
 * parseFoods report a duplicate. Returns the new text and what happened.
 */
export function addLibraryFoods(text, names) {
  const have = new Set(
    String(text || "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => lineName(l).replace(/\s+/g, " ").toLowerCase()),
  );
  const wanted = new Set((names || []).map((n) => String(n).trim().toLowerCase()));
  const added = [];
  const skipped = [];
  for (const line of libraryLines()) {
    const name = lineName(line);
    if (!wanted.has(name.toLowerCase())) continue;
    if (have.has(name.toLowerCase())) { skipped.push(name); continue; }
    have.add(name.toLowerCase());
    added.push(line);
  }
  const base = String(text || "").replace(/\s+$/, "");
  const out = added.length ? (base ? base + "\n" : "") + added.join("\n") + "\n" : String(text || "");
  return { text: out, added: added.map(lineName), skipped };
}
