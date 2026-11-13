// Allergen detection for ingredient lists: the 14 allergens that UK and EU food law
// requires food businesses to declare (Regulation (EU) No 1169/2011, Annex II; retained in
// the UK; Natasha's Law, in force in England 1 Oct 2021, requires the full ingredient list
// with allergens emphasised on food pre-packed for direct sale) and the 9 major allergens
// of US law (FALCPA plus the FASTER Act, sesame from 1 Jan 2023).
//
// This is a keyword reader, not a lab. It reads names the user typed. It cannot see inside
// a branded product, so a bracketed tag `[milk, soya]` lets the user state what the supplier
// label says, and "check" findings mark composites that normally contain an allergen.
// Nothing here is legal advice; the business is responsible for its labels.

export const EU14 = [
  ["celery", "Celery"],
  ["gluten", "Cereals containing gluten"],
  ["crustaceans", "Crustaceans"],
  ["eggs", "Eggs"],
  ["fish", "Fish"],
  ["lupin", "Lupin"],
  ["milk", "Milk"],
  ["molluscs", "Molluscs"],
  ["mustard", "Mustard"],
  ["peanuts", "Peanuts"],
  ["sesame", "Sesame"],
  ["soya", "Soya"],
  ["sulphites", "Sulphur dioxide and sulphites"],
  ["treenuts", "Tree nuts"],
];

// US major allergens, mapped from the keys above. Wheat is narrower than "gluten": a rye
// or barley ingredient is a gluten cereal in the EU but not a US major allergen.
export const US9 = [
  ["milk", "Milk"],
  ["eggs", "Egg"],
  ["fish", "Fish"],
  ["crustaceans", "Crustacean shellfish"],
  ["treenuts", "Tree nuts"],
  ["peanuts", "Peanuts"],
  ["wheat", "Wheat"],
  ["soya", "Soybeans"],
  ["sesame", "Sesame"],
];

export const labelsFor = (region) => Object.fromEntries(region === "us" ? US9 : EU14);
export const LABELS = Object.fromEntries([...EU14, ...US9]);

// Each rule: allergen key, `re` (a named ingredient) and optional `not` phrases that are
// removed from the text before this rule is tried (coconut milk is not milk).
// `check: true` means "usually contains it, confirm on the supplier label".
const RULES = [
  { a: "celery", re: /\b(celery|celeriac)\b/ },
  { a: "gluten", w: "wheat", re: /\b(wheat|spelt|kamut|khorasan|semolina|durum|couscous|bulgur|bulghur|farro|farina|cous cous|einkorn|emmer|triticale|seitan)\b/ },
  { a: "gluten", re: /\b(rye|barley|oats?|oatmeal|malt|malted|bran)\b/ },
  { a: "gluten", w: "wheat", re: /\b(breadcrumbs?|rusk|pasta|noodles?|spaghetti|macaroni|lasagn[ae]|bread|baguette|ciabatta|focaccia|brioche|croissant|pastry|pie crust|biscuits?|crackers?|cake|sponge|pizza base|pizza|batter|tempura|beer|ale|stout|lager|tortillas?|pitta|pita|wraps?|buns?|rolls?|flatbread|chapati|naan|crumpets?|muffins?|scones?|pancakes?|waffles?|dumplings?|gnocchi|stuffing|sausages?|pies?|tarts?|cookies?|brownies?|doughnuts?|donuts?)\b/, check: true,
    not: [/gluten[- ]free [a-z ]+/, /rice (noodles?|pasta)/, /corn pasta/, /gluten[- ]free/] },
  { a: "gluten", w: "wheat", re: /\b(plain|self[- ]raising|strong|bread|white|wholemeal|whole ?wheat|all[- ]purpose|00|pastry|cake) flour\b/ },
  { a: "gluten", w: "wheat", re: /\bflour\b/, check: true,
    not: [/\b(plain|self[- ]raising|strong|bread|white|wholemeal|whole ?wheat|all[- ]purpose|00|pastry|cake) flour\b/, /\b(rice|corn|maize|almond|coconut|chickpea|gram|besan|potato|tapioca|cassava|buckwheat|sorghum|millet|teff|quinoa|lupin|soya|soy|hazelnut|pea|lentil|oat|rye|barley|spelt|tigernut|arrowroot)\s+flour\b/] },
  { a: "gluten", w: "wheat", re: /\b(soy sauce|shoyu|worcestershire( sauce)?)\b/, check: true },
  { a: "crustaceans", re: /\b(prawns?|shrimps?|crabs?|crab ?meat|lobsters?|langoustines?|crayfish|crawfish|scampi|krill|crevettes?)\b/ },
  { a: "eggs", re: /\b(eggs?|egg ?yolks?|egg ?whites?|mayonnaise|mayo|meringue|albumen|albumin|ovalbumin|lysozyme|hollandaise|bearnaise|aioli)\b/,
    not: [/\beggplants?\b/, /\begg[- ]free( (mayonnaise|mayo))?\b/, /\bvegan (mayonnaise|mayo)\b/] },
  { a: "eggs", re: /\b(custard|fresh pasta|brioche|mousse)\b/, check: true },
  { a: "fish", re: /\b(fish|cod|haddock|salmon|tuna|anchov(y|ies)|sardines?|mackerel|trout|sea ?bass|herrings?|plaice|pollock|pollack|hake|sole|tilapia|kippers?|surimi|isinglass|halibut|monkfish|swordfish|snapper|catfish|pilchards?|whitebait|sprats?|bonito|dashi|eels?|carp|pike|perch|grouper|mahi[- ]?mahi|roe|caviar|taramasalata)\b/ },
  { a: "fish", re: /\b(caesar dressing|worcestershire( sauce)?|nam pla|oyster sauce|fish sauce|paella)\b/, check: true },
  { a: "crustaceans", re: /\bshellfish\b/, check: true },
  { a: "molluscs", re: /\bshellfish\b/, check: true },
  { a: "lupin", re: /\b(lupins?|lupine|lupini)\b/ },
  { a: "milk", re: /\b(milk|butter|cheeses?|cream|creme fraiche|yoghurts?|yogurts?|whey|casein|caseinates?|lactose|lactalbumin|lactoglobulin|curds|cheese curds?|ghee|buttermilk|custard|ice ?cream|paneer|mozzarella|cheddar|parmesan|parmigiano|pecorino|feta|ricotta|mascarpone|halloumi|brie|camembert|gouda|emmental|gruy[eè]re|stilton|cottage cheese|kefir|skyr|quark|b[eé]chamel|milk chocolate|white chocolate)\b/,
    not: [/\b(coconut|almond|oat|soy|soya|rice|hazelnut|cashew|pea|hemp) (milk|cream|yoghurt|yogurt|butter|cheese)\b/, /\b(cocoa|shea|cacao|nut|peanut|apple|seed) butter\b/, /\bbutternut\b/, /\bbutter ?beans?\b/, /\bcream of tartar\b/, /\bvegan (butter|cheese|cream)\b/, /\bdairy[- ]free [a-z ]+/, /\bcoconut (milk|cream)\b/, /\bsunflower butter\b/, /\bbean ?curds?\b/] },
  { a: "milk", re: /\b(chocolate|biscuit|brioche|croissant|naan|korma|tikka masala|pesto|risotto)\b/, check: true, not: [/\bdark chocolate\b/, /\bvegan [a-z ]+/, /\bdairy[- ]free [a-z ]+/] },
  { a: "molluscs", re: /\b(mussels?|oysters?|clams?|cockles?|whelks?|winkles?|scallops?|squid|calamari|octopus|cuttlefish|snails?|escargots?|abalone|periwinkles?)\b/ },
  { a: "mustard", re: /\b(mustard|dijon|mustard seeds?)\b/ },
  { a: "mustard", re: /\b(piccalilli|curry powder|vinaigrette)\b/, check: true },
  { a: "peanuts", re: /\b(peanuts?|groundnuts?|monkey nuts?|arachis|peanut butter)\b/ },
  { a: "peanuts", re: /\b(satay|pad thai|gado[- ]gado)\b/, check: true },
  { a: "sesame", re: /\b(sesame|tahini|tahina|halva|halvah|gomashio|benne)\b/ },
  { a: "sesame", re: /\b(hummus|houmous|baba ghan(ou|o)sh|falafel|bagel|burger bun|hot dog bun|za'?atar|dukkah)\b/, check: true },
  { a: "soya", re: /\b(soya|soy|soybeans?|edamame|tofu|tempeh|miso|tamari|soy sauce|shoyu|natto|tvp|textured vegetable protein)\b/,
    not: [/\bsoy[a]?[- ]free\b/] },
  { a: "soya", re: /\b(lecithin|e322|teriyaki|hoisin|vegetarian mince|veggie burger|plant[- ]based burger)\b/, check: true },
  { a: "sulphites", re: /\b(sulphites?|sulfites?|sulphur dioxide|sulfur dioxide|metabisulphite|metabisulfite|e22[0-8]|e224|e225)\b/ },
  { a: "sulphites", re: /\b(wine|wine vinegar|cider|dried apricots?|dried fruit|sultanas?|raisins?|dried mango|desiccated coconut|balsamic|sherry|port|prosecco|champagne|sauerkraut|pickled onions?|gherkins?)\b/, check: true },
  { a: "treenuts", re: /\b(almonds?|hazelnuts?|walnuts?|cashews?|pecans?|brazil nuts?|pistachios?|macadamias?|queensland nuts?|filberts?|marzipan|praline|nougat|frangipane|gianduja|nutella|amaretto|amaretti|mixed nuts?|tree nuts?|almond (milk|butter|flour))\b/ },
  { a: "treenuts", re: /\bnuts?\b/, check: true, not: [/\bpine ?nuts?\b/, /\bmonkey nuts?\b/, /\bground ?nuts?\b/, /\bnut[- ]free\b/, /\bno nuts?\b/] },
  { a: "treenuts", re: /\b(pesto|baklava|florentines?|granola|muesli|nut butter)\b/, check: true, not: [/\bnut[- ]free [a-z ]+/] },
];

// Foods that are not on the legal list but that people with a nut allergy are often told
// to avoid. Reported as advisories, never as declared allergens.
const ADVISORY = [
  { re: /\bpine ?nuts?\b/, text: "Pine nuts are not among the tree nuts named in UK and EU law, but some people with nut allergies react to them. Say so on your menu if you use them." },
  { re: /\b(coconut)\b/, not: [/\bcoconut (milk|cream|oil)\b/], text: "Coconut is not one of the tree nuts named in UK and EU law, and US guidance on it has changed; check the rule that applies to you." },
  { re: /\bchestnuts?\b/, not: [/\bwater chestnuts?\b/], text: "Chestnut is not among the tree nuts named in UK and EU law, though US guidance lists it. Check the rule that applies to you." },
  { re: /\bnutmeg\b/, text: "Nutmeg is a seed, not a nut; it is not a declared allergen." },
];

export const DEFAULT_REGION = "uk";

export function normalise(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export { esc };

// Split "a, b (c, d), e [milk]" at top-level commas.
export function splitTopLevel(text) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of String(text)) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if ((ch === "," || ch === ";" || ch === "\n") && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const KEYS = new Set([...EU14.map((x) => x[0]), "wheat"]);
const ALIASES = {
  gluten: "gluten", cereals: "gluten", wheat: "wheat", nuts: "treenuts", "tree nuts": "treenuts", treenuts: "treenuts",
  soy: "soya", soya: "soya", soybeans: "soya", egg: "eggs", eggs: "eggs", milk: "milk", dairy: "milk", fish: "fish",
  crustaceans: "crustaceans", shellfish: "crustaceans", molluscs: "molluscs", mollusks: "molluscs", mustard: "mustard", celery: "celery",
  lupin: "lupin", peanuts: "peanuts", peanut: "peanuts", sesame: "sesame", sulphites: "sulphites", sulfites: "sulphites", "sulphur dioxide": "sulphites",
};
const alias = (w) => ALIASES[normalise(w)] || (KEYS.has(normalise(w)) ? normalise(w) : null);

// One ingredient (with optional parenthesised sub-ingredients and a [tag]) -> findings.
export function readIngredient(raw) {
  const tag = raw.match(/\[([^\]]*)\]/);
  const bare = raw.replace(/\[[^\]]*\]/g, " ");
  const found = new Map(); // key -> {via, check, tagged}
  const unknownTags = [];
  if (tag) {
    for (const t of tag[1].split(/[,;|]/)) {
      const w = normalise(t);
      if (!w) continue;
      if (w === "none" || w === "no allergens") continue;
      const k = alias(w);
      if (!k) { unknownTags.push(t.trim()); continue; }
      found.set(k, { via: "stated on the supplier label", check: false, tagged: true });
      if (k === "wheat") found.set("gluten", { via: "stated on the supplier label", check: false, tagged: true });
    }
  }
  const noneTag = tag && /^\s*(none|no allergens)\s*$/i.test(tag[1]);
  const text = normalise(bare);
  {
    for (const rule of RULES) {
      // A [none] tag clears the "usually contains" guesses, never an allergen named outright.
      if (noneTag && rule.check) continue;
      let t = text;
      for (const n of rule.not || []) t = t.replace(new RegExp(n.source, "g"), " ");
      const m = t.match(rule.re);
      if (!m) continue;
      const keys = rule.a === "gluten" ? (rule.w === "wheat" ? ["gluten", "wheat"] : ["gluten"]) : [rule.a];
      for (const k of keys) {
        const prev = found.get(k);
        const entry = { via: m[0], check: Boolean(rule.check), tagged: false };
        // A named ingredient beats a "usually contains" guess; a supplier tag beats both.
        if (!prev || (prev.check && !entry.check && !prev.tagged)) found.set(k, entry);
      }
    }
  }
  const advisories = [];
  for (const adv of ADVISORY) {
    let t = text;
    for (const n of adv.not || []) t = t.replace(new RegExp(n.source, "g"), " ");
    if (adv.re.test(t)) advisories.push(adv.text);
  }
  return { raw: raw.trim(), found, advisories, unknownTags, noneTag: Boolean(noneTag) };
}

// Parse "# Name | may=milk, nuts" blocks followed by an ingredient list.
export function parseDishes(text) {
  const dishes = [];
  const errors = [];
  let cur = null;
  const lines = String(text ?? "").split(/\r?\n/);
  const flush = () => { if (cur) dishes.push(cur); cur = null; };
  lines.forEach((line, i) => {
    const l = line.trim();
    if (!l || l.startsWith("//")) return;
    if (l.startsWith("#")) {
      flush();
      const parts = l.slice(1).split("|").map((s) => s.trim());
      cur = { name: parts[0], may: [], body: "", line: i + 1 };
      if (!cur.name) { errors.push(`Line ${i + 1}: a dish heading needs a name after #.`); cur.name = `Dish ${dishes.length + 1}`; }
      for (const p of parts.slice(1)) {
        const m = p.match(/^may\s*=\s*(.*)$/i);
        if (m) {
          for (const w of m[1].split(/[,;/]/)) {
            const k = alias(w);
            if (k) cur.may.push(k); else if (w.trim()) errors.push(`Line ${i + 1}: "${w.trim()}" is not a recognised allergen name in may=.`);
          }
        } else if (p) errors.push(`Line ${i + 1}: unknown option "${p}" (only may= is read).`);
      }
    } else if (cur) {
      cur.body += (cur.body ? ", " : "") + l.replace(/^[-*]\s+/, "");
    } else errors.push(`Line ${i + 1}: ingredient text before any "# Dish name" heading was ignored.`);
  });
  flush();
  return { dishes, errors };
}

function sortKeys(keys, region) {
  const order = (region === "us" ? US9 : EU14).map((x) => x[0]);
  return [...keys].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

export function analyseDish(dish, region = DEFAULT_REGION) {
  const items = splitTopLevel(dish.body);
  const ingredients = items.map((raw) => {
    const r = readIngredient(raw);
    // Sub-ingredients in brackets are read as part of the same text, so "dressing (egg, mustard)" works.
    return r;
  });
  const declared = new Map();
  const check = new Map();
  const advisories = new Set();
  const errors = [];
  for (const ing of ingredients) {
    for (const [k, v] of ing.found) {
      const bucket = v.check ? check : declared;
      if (!bucket.has(k)) bucket.set(k, []);
      bucket.get(k).push({ ingredient: ing.raw.replace(/\[[^\]]*\]/g, "").trim(), via: v.via });
    }
    for (const a of ing.advisories) advisories.add(a);
    for (const u of ing.unknownTags) errors.push(`${dish.name}: "[${u}]" is not a recognised allergen name.`);
  }
  for (const k of declared.keys()) check.delete(k);
  const universe = new Set((region === "us" ? US9 : EU14).map((x) => x[0]));
  const inRegion = (k) => universe.has(k);
  const declaredKeys = sortKeys([...declared.keys()].filter(inRegion), region);
  const checkKeys = sortKeys([...check.keys()].filter(inRegion), region);
  const mayKeys = sortKeys([...new Set(dish.may)].filter((k) => inRegion(k) && !declared.has(k)), region);
  if (!items.length) errors.push(`${dish.name}: no ingredients were typed.`);
  return { name: dish.name, items, ingredients, declared, check, declaredKeys, checkKeys, mayKeys, advisories: [...advisories], errors, region };
}

export function analyse(text, region = DEFAULT_REGION) {
  const { dishes, errors } = parseDishes(text);
  const results = dishes.map((d) => analyseDish(d, region));
  for (const r of results) errors.push(...r.errors);
  return { region, columns: region === "us" ? US9 : EU14, results, errors };
}

// Wrap each allergen word in the ingredient text in <strong>, as Natasha's Law asks for
// the allergen to be emphasised in the ingredients list (bold, italics, colour or capitals).
export function emphasise(ingredientText, region = DEFAULT_REGION) {
  const words = new Set();
  const names = {
    gluten: ["wheat", "rye", "barley", "oats", "oat", "spelt", "kamut", "khorasan", "semolina", "durum", "couscous", "bulgur", "farro", "malt", "seitan"],
    crustaceans: ["prawns", "prawn", "shrimp", "shrimps", "crab", "lobster", "langoustine", "crayfish", "scampi", "krill"],
    eggs: ["eggs", "egg", "egg yolk", "egg white", "albumen", "mayonnaise", "meringue"],
    fish: ["fish", "cod", "haddock", "salmon", "tuna", "anchovies", "anchovy", "sardines", "sardine", "mackerel", "trout", "herring", "plaice", "pollock", "hake", "surimi"],
    lupin: ["lupin"],
    milk: ["milk", "butter", "cheese", "cream", "yoghurt", "yogurt", "whey", "casein", "lactose", "ghee", "buttermilk", "mozzarella", "cheddar", "parmesan", "feta", "ricotta", "mascarpone"],
    molluscs: ["mussels", "mussel", "oysters", "oyster", "clams", "clam", "scallops", "scallop", "squid", "calamari", "octopus", "cuttlefish", "snails"],
    mustard: ["mustard"],
    peanuts: ["peanuts", "peanut", "groundnuts"],
    sesame: ["sesame", "tahini"],
    soya: ["soya", "soy", "soybeans", "tofu", "tempeh", "miso", "tamari", "edamame"],
    sulphites: ["sulphites", "sulphur dioxide", "sulfites"],
    treenuts: ["almonds", "almond", "hazelnuts", "hazelnut", "walnuts", "walnut", "cashews", "cashew", "pecans", "pecan", "brazil nuts", "pistachios", "pistachio", "macadamia", "marzipan"],
    celery: ["celery", "celeriac"],
    wheat: ["wheat"],
  };
  for (const [k, ws] of Object.entries(names)) {
    if (region === "us" && !US9.some((x) => x[0] === k)) continue;
    if (region !== "us" && k === "wheat") continue;
    ws.forEach((w) => words.add(w));
  }
  const alt = [...words].sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const re = new RegExp(`\\b(${alt})\\b`, "gi");
  return esc(ingredientText).replace(re, "<strong>$1</strong>");
}

export function labelFor(result, region = DEFAULT_REGION) {
  const text = result.items.map((i) => i.replace(/\[[^\]]*\]/g, "").trim()).filter(Boolean).join(", ");
  const html = emphasise(text, region);
  const L = labelsFor(region);
  const contains = result.declaredKeys.map((k) => L[k]);
  return {
    name: result.name,
    ingredientsHtml: html,
    ingredientsText: text,
    contains,
    may: result.mayKeys.map((k) => L[k]),
  };
}

export function matrixCsv(analysis) {
  const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
  const head = ["dish", ...analysis.columns.map((c) => c[1])];
  const rows = [head];
  for (const r of analysis.results) {
    rows.push([r.name, ...analysis.columns.map(([k]) => (r.declared.has(k) ? "contains" : r.check.has(k) ? "check" : r.mayKeys.includes(k) ? "may contain" : ""))]);
  }
  return rows.map((r) => r.map(q).join(",")).join("\n");
}

export const EXAMPLE = `# Chicken caesar wrap | may=peanuts, sesame
Flour tortilla, grilled chicken breast, romaine lettuce, parmesan, caesar dressing (egg yolk, anchovy, mustard, olive oil), lemon juice

# Vegan chickpea curry | may=celery
Chickpeas, coconut milk, tomato, onion, garlic, curry powder, rice, coriander

# Carrot cake slice | may=milk
Carrots, sugar, rapeseed oil, eggs, plain flour, walnuts, cinnamon, baking powder, cream cheese frosting (cream cheese, icing sugar, butter)

# Prawn pad thai | may=sesame
Rice noodles, king prawns, egg, bean sprouts, spring onion, crushed peanuts, tamarind, fish sauce, lime

# Hummus and falafel box
Hummus, falafel, pitta bread, tomato, cucumber, pickled onions
`;
