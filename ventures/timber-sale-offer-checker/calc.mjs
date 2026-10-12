// Timber-sale offer math. Pure functions, no I/O. Board feet (BF) by log rule, value by species price per MBF.

export const RULES = Object.freeze({
  doyle: "Doyle",
  scribner: "Scribner (formula approximation)",
  international: "International 1/4-inch",
});

// Board feet in one log. `d` is small-end diameter inside bark (inches), `len` is length in feet.
export function boardFeet(rule, d, len) {
  if (!(d > 0) || !(len > 0)) return 0;
  if (rule === "doyle") return d <= 4 ? 0 : ((d - 4) * (d - 4) * len) / 16;
  if (rule === "scribner") return Math.max(0, (0.79 * d * d - 2 * d - 4) * (len / 16));
  if (rule === "international") {
    // 4-foot sections, 1/2 inch of taper per section, 0.199 D^2 - 0.642 D per full section.
    let total = 0;
    for (let i = 0, left = len; left > 1e-9; i++, left -= 4) {
      const dia = d + 0.5 * i;
      total += (Math.min(4, left) / 4) * Math.max(0, 0.199 * dia * dia - 0.642 * dia);
    }
    return total;
  }
  throw new Error(`unknown log rule: ${rule}`);
}

const num = (s) => {
  const t = String(s ?? "").replace(/[$,\s]/g, "");
  if (t === "") return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};

// Rows: species, small-end diameter (in), length (ft), count (logs). Header row optional.
export function parseLogs(text) {
  const rows = [];
  const warnings = [];
  const lines = String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  lines.forEach((line, idx) => {
    const cells = line.split(/\t|,/).map((c) => c.trim());
    if (idx === 0 && /species/i.test(cells[0])) return;
    const [species, d, len, count] = [cells[0], num(cells[1]), num(cells[2]), num(cells[3] ?? "1")];
    if (!species || d === null || len === null || count === null) { warnings.push(`Line ${idx + 1} skipped: need species, diameter, length, count.`); return; }
    if (d <= 0 || len <= 0 || count <= 0 || !Number.isInteger(count)) { warnings.push(`Line ${idx + 1} skipped: diameter, length and count must be positive (count a whole number).`); return; }
    if (d > 60 || len > 40) warnings.push(`Line ${idx + 1}: ${d} in x ${len} ft is unusual for a sawlog; check units.`);
    rows.push({ species: species.toLowerCase(), d, len, count });
  });
  if (!rows.length) return { error: "No readable log rows. Use: species, small-end diameter (in), length (ft), count." };
  return { rows, warnings };
}

// prices: { species: dollars per MBF (thousand board feet) }. Missing species are reported, not guessed.
export function appraise(rows, prices, rule = "doyle") {
  const bySp = new Map();
  for (const r of rows) {
    const e = bySp.get(r.species) ?? { species: r.species, logs: 0, bf: 0 };
    e.logs += r.count;
    e.bf += boardFeet(rule, r.d, r.len) * r.count;
    bySp.set(r.species, e);
  }
  const species = [...bySp.values()].map((e) => {
    const price = prices[e.species];
    return { ...e, bf: Math.round(e.bf), mbf: Math.round(e.bf) / 1000, price: price ?? null, value: price == null ? null : Math.round((e.bf / 1000) * price) };
  });
  const missingPrice = species.filter((s) => s.price === null).map((s) => s.species);
  return {
    rule,
    species,
    totalBf: species.reduce((a, s) => a + s.bf, 0),
    totalValue: species.reduce((a, s) => a + (s.value ?? 0), 0),
    missingPrice,
  };
}

const r2 = (x) => Math.round(x * 100) / 100;

/**
 * check({rows, prices, offer, offerRule, foresterFeePct})
 * offer: { kind: "lump" | "perMbf", amount }
 */
export function check({ rows, prices = {}, offer, offerRule = "doyle", foresterFeePct = 8 }) {
  if (!rows?.length) return { error: "Add at least one log row." };
  if (!offer || !(offer.amount > 0)) return { error: "Enter the offer amount." };
  if (!RULES[offerRule]) return { error: "Choose a log rule." };
  if (foresterFeePct < 0 || foresterFeePct >= 50) return { error: "Forester fee must be between 0 and 49 percent." };

  const rules = Object.keys(RULES).map((k) => appraise(rows, prices, k));
  const atOfferRule = rules.find((a) => a.rule === offerRule);
  const offered = offer.kind === "perMbf" ? (atOfferRule.totalBf / 1000) * offer.amount : offer.amount;
  const impliedPerMbf = atOfferRule.totalBf > 0 ? offered / (atOfferRule.totalBf / 1000) : null;

  const intl = rules.find((a) => a.rule === "international");
  const doyle = rules.find((a) => a.rule === "doyle");
  const fairValue = intl.totalValue; // true-volume benchmark at the owner's own prices
  const ratio = fairValue > 0 ? offered / fairValue : null;
  const fee = foresterFeePct / 100;
  const breakEvenUpliftPct = fee > 0 ? r2((fee / (1 - fee)) * 100) : 0;

  const advice = [];
  if (atOfferRule.missingPrice.length) advice.push(`No price entered for: ${atOfferRule.missingPrice.join(", ")}. Those logs are valued at $0 until you add a price per MBF.`);
  advice.push(`Your logs scale to ${atOfferRule.totalBf.toLocaleString("en-US")} board feet under ${RULES[offerRule]}, and ${intl.totalBf.toLocaleString("en-US")} under International 1/4-inch.`);
  if (offerRule === "doyle" && doyle.totalBf > 0 && intl.totalBf > doyle.totalBf) {
    advice.push(`Doyle counts ${Math.round((1 - doyle.totalBf / intl.totalBf) * 100)}% fewer board feet than International on these logs (it undercounts small logs), so a per-MBF price is not comparable across rules.`);
  }
  if (ratio !== null) {
    if (ratio < 0.75) advice.push(`The offer is ${Math.round(ratio * 100)}% of the value these logs have at your prices. Ask what rule, prices and deductions it is based on before accepting.`);
    else advice.push(`The offer is ${Math.round(ratio * 100)}% of the value at your prices. Not an outlier on your own numbers; confirm the prices are current for your area.`);
  }
  if (fee > 0) advice.push(`A consulting forester at ${foresterFeePct}% of the sale pays for itself if competitive bids raise the price by more than ${breakEvenUpliftPct}% over this offer.`);

  return {
    offered: Math.round(offered),
    impliedPerMbf: impliedPerMbf === null ? null : r2(impliedPerMbf),
    fairValue: Math.round(fairValue),
    ratio: ratio === null ? null : r2(ratio),
    belowThreshold: ratio !== null && ratio < 0.75,
    breakEvenUpliftPct,
    rules: rules.map((a) => ({ rule: a.rule, label: RULES[a.rule], totalBf: a.totalBf, totalValue: a.totalValue })),
    species: atOfferRule.species,
    missingPrice: atOfferRule.missingPrice,
    advice,
  };
}

export function money(x) {
  const v = Math.round(x);
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US");
}

export function sampleLogs() {
  return "species,diameter,length,count\nred oak,16,16,40\nred oak,12,16,55\nwhite oak,18,16,22\nhickory,12,12,30\npoplar,14,16,35\n";
}

export function samplePrices() {
  return { "red oak": 420, "white oak": 650, hickory: 260, poplar: 240 };
}

export function toCsv(r) {
  const rows = [["species", "logs", "board_feet", "price_per_mbf", "value"], ...r.species.map((s) => [s.species, s.logs, s.bf, s.price ?? "", s.value ?? ""])];
  return rows.map((x) => x.join(",")).join("\n") + "\n";
}
