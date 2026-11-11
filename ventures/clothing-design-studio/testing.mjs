/**
 * Product-safety and lab-test checklist for a clothing or sunglasses line:
 * which tests to put in the quote request, by product, audience, market and
 * features of the design (raised or plastisol prints, metal parts, cords,
 * water-repellent finish, leather/fur/down).
 *
 * This is a to-ask list, not a legal opinion. Each row names the rule or
 * standard it comes from, why this design triggers it, and who acts (the
 * factory's lab, a third-party lab, or you). Rules, thresholds and dates are
 * typed from the author's memory of the public texts and are NOT checked
 * against the official sources; the page says so and links the regulators.
 * Label content is `labels.mjs`; duty and VAT are `duty.mjs` and `eutax.mjs`.
 *
 *  - testPlan(input): { rows, byMarket, requestText, notes }
 *  - testPlanCsv(plan): spreadsheet-safe CSV
 */

export const MARKETS = ["us", "eu", "uk"];
export const PRODUCTS = ["adult-apparel", "child-apparel", "child-sleepwear", "sunglasses"];
export const FEATURES = ["plastisol", "metal", "cords", "finish", "animal"];

const R = (id, markets, products, when, title, rule, ask, who, level = "required") =>
  ({ id, markets, products, when, title, rule, ask, who, level });

const ALL_APPAREL = ["adult-apparel", "child-apparel", "child-sleepwear"];
const KIDS = ["child-apparel", "child-sleepwear"];

const RULES = [
  // ---- United States
  R("us-flam", ["us"], ALL_APPAREL, null, "Clothing flammability", "16 CFR 1610 (Flammability of Clothing Textiles)",
    "Please confirm the fabric is Class 1 (normal flammability) under 16 CFR 1610 and send the report.", "factory lab", "required"),
  R("us-cpsia-lead", ["us"], KIDS, null, "Lead in children's product (third-party tested)", "CPSIA section 101; 100 ppm lead limit; CPSC-accepted lab",
    "Test trims, snaps, zips, print and any non-textile part for lead by a CPSC-accepted lab; dyed textile fabric itself is generally exempt.", "third-party lab"),
  R("us-cpsia-cert", ["us"], KIDS, null, "Children's Product Certificate and tracking label", "CPSIA sections 102 and 103; 16 CFR 1107",
    "A Children's Product Certificate (CPC) from the importer, based on the lab report, and a permanent tracking mark on the garment and its packaging.", "you"),
  R("us-phthalate", ["us"], KIDS, "plastisol", "Phthalates in plastisol or rubbery prints", "CPSIA section 108; 16 CFR 1307 (eight phthalates, 0.1%)",
    "Test every plasticised print or patch for the eight restricted phthalates; use phthalate-free inks and ask the printer for the ink's report.", "third-party lab"),
  R("us-sleepwear", ["us"], ["child-sleepwear"], null, "Children's sleepwear flammability", "16 CFR 1615 and 1616 (sizes 0 to 14)",
    "Confirm the garment is tight-fitting or made of flame-resistant fabric to 16 CFR 1615/1616 and send the report.", "third-party lab"),
  R("us-cords", ["us"], KIDS, "cords", "Drawstrings and cords on children's wear", "16 CFR 1120 (drawstrings in upper outerwear); ASTM F1816",
    "No drawstrings at the neck or hood; waist and hem cords within the length limits, no toggles at the free ends.", "design check"),
  R("us-prop65", ["us"], ["adult-apparel", "child-apparel", "child-sleepwear", "sunglasses"], null, "California Proposition 65 chemicals", "California Health and Safety Code 25249.6",
    "Ask the factory for a Proposition 65 screen of the finished product (lead, phthalates, BPA, formaldehyde); a warning is needed when exposure exceeds the safe-harbour level.", "factory lab", "check"),
  R("us-pfas", ["us"], ALL_APPAREL, "finish", "PFAS in water-repellent finishes", "State laws (for example California AB 1817, New York S.6291, effective 2025)",
    "Ask for a written statement that no PFAS is added, with a total fluorine screen; several states restrict PFAS in apparel.", "factory lab", "check"),
  R("us-wool", ["us"], ALL_APPAREL, "animal", "Wool, fur and leather rules", "Wool Products Labeling Act; Fur Products Labeling Act; FTC Guides on leather",
    "Name the species and origin of any fur, wool or leather; fur and wool trims need their own labelling.", "you", "check"),
  R("us-fda-impact", ["us"], ["sunglasses"], null, "Impact resistance of sunglass lenses", "21 CFR 801.410 (drop-ball test)",
    "Lenses must pass the drop-ball impact test (or be shown exempt); get a report for the stock frame and lens combination.", "factory lab"),
  R("us-fda-reg", ["us"], ["sunglasses"], null, "FDA device registration and listing", "FDA: sunglasses are Class I medical devices",
    "Check whether the manufacturer or importer must register and list the device with the FDA before sale.", "you", "check"),
  R("us-ansi", ["us"], ["sunglasses"], null, "Sunglass optics and UV", "ANSI Z80.3 (voluntary); UV transmittance",
    "Ask for UV transmittance and optical-quality results to ANSI Z80.3; a 'UV400' claim needs the report behind it.", "factory lab", "check"),
  // ---- European Union
  R("eu-gpsr", ["eu"], ["adult-apparel", "child-apparel", "child-sleepwear", "sunglasses"], null, "General Product Safety Regulation file", "Regulation (EU) 2023/988",
    "Keep a risk analysis, technical documentation and an EU responsible person if the maker is outside the EU; put maker, address, batch and warnings on the product.", "you"),
  R("eu-reach-azo", ["eu", "uk"], ALL_APPAREL, null, "Azo dyes that release restricted amines", "REACH Annex XVII entry 43 (30 mg/kg per amine); EN ISO 14362-1",
    "Test dyed fabric and prints for restricted aromatic amines to EN ISO 14362-1 and send the report.", "factory lab"),
  R("eu-reach-cmr", ["eu", "uk"], ALL_APPAREL, null, "Restricted substances list for the whole garment", "REACH Annex XVII entries 28 to 30 (CMR substances) and the candidate list",
    "Ask the factory to confirm in writing that the garment meets a named restricted-substances list (for example the brand's own) and to send the last report.", "factory lab", "check"),
  R("eu-phthalate", ["eu", "uk"], ALL_APPAREL, "plastisol", "Phthalates in plasticised prints", "REACH Annex XVII entry 51 as amended by Regulation (EU) 2018/2005 (DEHP, DBP, BBP, DIBP; 0.1% of the plasticised material; articles in general, adult clothing included, since 7 July 2020)",
    "Test every plasticised print, patch or coating for DEHP, DBP, BBP and DIBP (together under 0.1% by weight of the plasticised material), and use phthalate-free ink.", "third-party lab"),
  R("eu-nickel", ["eu", "uk"], ["adult-apparel", "child-apparel", "child-sleepwear", "sunglasses"], "metal", "Nickel release from metal parts", "REACH Annex XVII entry 27; EN 1811 (and EN 16128 for eyewear)",
    "Metal zips, snaps, rivets and frame parts that touch skin: nickel release no more than 0.5 microgram per square cm per week.", "factory lab"),
  R("eu-cords", ["eu", "uk"], KIDS, "cords", "Cords and drawstrings on children's clothing", "EN 14682 (safety of children's clothing: cords and drawcords)",
    "No cords at the neck or hood; waist and hem cords to the lengths in EN 14682, no free-end toggles.", "design check"),
  R("eu-sleepwear", ["eu"], ["child-sleepwear"], null, "Children's nightwear burning behaviour", "EN 14878; national rules (for example the UK nightwear regulations)",
    "Ask which national flammability rule the destination country applies and get the matching report.", "third-party lab", "check"),
  R("eu-pfas", ["eu", "uk"], ALL_APPAREL, "finish", "PFAS in water-repellent finishes", "POPs Regulation (PFOA) and the REACH restriction on PFHxA-related substances in textiles (dated 2026; check the date)",
    "Written PFAS-free statement and a total fluorine screen for any water-, oil- or stain-repellent finish.", "factory lab"),
  R("eu-animal", ["eu", "uk"], ALL_APPAREL, "animal", "Leather, fur and down", "Textile Regulation 1007/2011 annexes (animal-origin parts); CITES for some species",
    "Say what animal parts are used and where they come from; textile labels list non-textile parts of animal origin.", "you", "check"),
  R("eu-ppe", ["eu"], ["sunglasses"], null, "CE marking for sunglasses", "PPE Regulation (EU) 2016/425, category I; EN ISO 12312-1",
    "Test the finished sunglasses to EN ISO 12312-1 (filter category, UV transmittance), write the EU declaration of conformity and put the CE mark and the filter category on the product.", "third-party lab"),
  // ---- United Kingdom
  R("uk-gpsr", ["uk"], ["adult-apparel", "child-apparel", "child-sleepwear", "sunglasses"], null, "General Product Safety Regulations 2005", "SI 2005/1803",
    "Producer or importer name and address and a product reference on the product; a UK responsible person if the maker is outside the UK.", "you"),
  R("uk-nightwear", ["uk"], ["child-sleepwear"], null, "Children's nightwear flammability", "Nightwear (Safety) Regulations 1985 (SI 1985/2043)",
    "Get a flammability test report for the nightwear fabric to the 1985 regulations' standard.", "third-party lab"),
  R("uk-ppe", ["uk"], ["sunglasses"], null, "UKCA or CE marking for sunglasses", "UK PPE Regulations 2018 (category I); BS EN ISO 12312-1",
    "Test to EN ISO 12312-1; mark UKCA, or CE where Great Britain still accepts it, and keep the declaration of conformity.", "third-party lab"),
];

const WHEN_TEXT = {
  plastisol: "your design has raised, puff or plastisol prints",
  metal: "your design has metal zips, snaps, rivets or frame parts",
  cords: "your design has drawstrings or cords",
  finish: "your design has a water-, oil- or stain-repellent finish",
  animal: "your design uses leather, fur, wool or down",
};

function oneOf(name, v, list) {
  if (!list.includes(v)) throw new Error(`${name} must be one of: ${list.join(", ")}.`);
}

export function testPlan(input) {
  if (!input || typeof input !== "object") throw new Error("Give the product, the markets and the features.");
  oneOf("product", input.product, PRODUCTS);
  const markets = Array.isArray(input.markets) ? [...new Set(input.markets)] : [];
  if (!markets.length) throw new Error("Pick at least one market.");
  markets.forEach(m => oneOf("market", m, MARKETS));
  const features = Array.isArray(input.features) ? [...new Set(input.features)] : [];
  features.forEach(f => oneOf("feature", f, FEATURES));

  const seen = new Set();
  const rows = [];
  for (const r of RULES) {
    if (!r.products.includes(input.product)) continue;
    const hit = r.markets.filter(m => markets.includes(m));
    if (!hit.length) continue;
    if (r.when && !features.includes(r.when)) continue;
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    rows.push({
      id: r.id, markets: hit, title: r.title, rule: r.rule, ask: r.ask, who: r.who, level: r.level,
      trigger: r.when ? WHEN_TEXT[r.when] : "every " + (input.product === "sunglasses" ? "pair" : "garment") + " of this kind",
    });
  }
  const rank = { required: 0, check: 1 };
  rows.sort((a, b) => rank[a.level] - rank[b.level] || a.title.localeCompare(b.title));

  const byMarket = {};
  for (const m of markets) byMarket[m] = rows.filter(r => r.markets.includes(m)).length;

  const notes = [];
  if (markets.includes("us") && KIDS.includes(input.product)) notes.push("A children's product (age 12 and under) sold in the US needs third-party testing at a CPSC-accepted lab and a Children's Product Certificate before sale; adult clothing does not.");
  if (features.includes("plastisol") && KIDS.includes(input.product)) notes.push("Raised or puff prints are the usual reason a children's design fails a phthalate test; ask the printer for the ink's report before the first print.");
  if (input.product === "sunglasses" && markets.includes("us") && markets.includes("eu")) notes.push("The US wants an impact test; the EU wants a filter-category and UV test. One lab can run both, so ask for a combined quote.");
  if (!features.length) notes.push("No design features ticked: ticking the ones that apply (prints, metal, cords, finishes) adds the tests they trigger.");
  notes.push("Rules and dates are typed from memory of the public texts and are not checked against the official sources. Confirm each row with the regulator, a test lab or a compliance adviser before relying on it.");

  const lines = rows.map((r, i) => `${i + 1}. ${r.title} (${r.rule}): ${r.ask}`);
  const requestText = `Please include these tests and documents in the quote, with the lab name, the standard and the price for each, and send the reports with the shipment:\n${lines.join("\n")}`;
  return { rows, byMarket, requestText, notes, product: input.product, markets, features };
}

const csvCell = s => {
  let v = String(s ?? "");
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

export function testPlanCsv(plan) {
  const head = ["Test", "Markets", "Rule or standard", "Why", "What to ask", "Who", "Level"];
  const body = plan.rows.map(r => [r.title, r.markets.join("+"), r.rule, r.trigger, r.ask, r.who, r.level].map(csvCell).join(","));
  return [head.join(","), ...body].join("\n") + "\n";
}
