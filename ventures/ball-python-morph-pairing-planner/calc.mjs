// Ball python morph pairing planner: Mendelian odds for a clutch, priced.
//
// Each gene is its own locus, inherited independently. Four kinds:
//   R  recessive           2 copies show it, 1 copy is a hidden "het"
//   I  incomplete dominant 1 copy shows it, 2 copies is the "Super" form
//   D  dominant            1 or 2 copies look the same
//   L  dominant, lethal    2 copies do not hatch (the spider-type pattern)
// Genes that share a `group` are allelic (same locus): their odds are not
// independent, so a pairing that mixes them is refused instead of guessed.
// Pure functions, no I/O.

export const MAX_LOCI = 8;

export const SAMPLE_GENES = [
  "Albino | R",
  "Clown | R",
  "Piebald | R | Pied",
  "Ghost | R | Hypo, Hypomelanistic",
  "Genetic Stripe | R | Stripe",
  "Ultramel | R",
  "Pastel | I",
  "Yellow Belly | I | YB",
  "Enchi | I",
  "Fire | I",
  "Spider | L",
  "Pinstripe | D | Pin",
  "Mojave | I | | lesser",
  "Lesser | I | Lesser Platinum | lesser",
  "Butter | I | | lesser",
  "Cinnamon | I | | cinnamon",
  "Black Pastel | I | | cinnamon",
].join("\n");

export const SAMPLE_FEMALES = [
  "Luna | Pastel, het Albino, 50% het Clown",
  "Ruby | Enchi, Clown",
  "Mochi | Spider, het Piebald",
].join("\n");

export const SAMPLE_MALES = [
  "Atlas | Pastel, Albino",
  "Pixel | Clown, 66% het Piebald",
  "Ember | Fire, het Clown",
].join("\n");

export const SAMPLE_PRICES = [
  "Normal | 60",
  "Pastel | 90",
  "Super Pastel | 220",
  "Albino | 200",
  "Clown | 180",
  "Piebald | 300",
  "Enchi | 120",
  "Fire | 100",
  "Spider | 130",
  "Pastel Albino | 400",
  "Pastel Clown | 380",
  "Albino Clown | 700",
  "Pastel Albino Clown | 1400",
  "Clown Enchi | 420",
  "Enchi Clown Pastel | 800",
  "Fire Clown | 380",
  "Spider Piebald | 900",
].join("\n");

export const SAMPLE_ECON = { eggs: 6, hatch: 85, raise: 25, fee: 8, overhead: 60, rankBy: "profit" };

export const money2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money0 = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
export const pct = (p, d = 1) => (p * 100).toFixed(d).replace(/\.0+$/, "") + "%";
export function fmt(n, d = 0) {
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

const norm = (s) => String(s).trim().replace(/\s+/g, " ").toLowerCase();
const KINDS = { R: "recessive", I: "incomplete dominant", D: "dominant", L: "dominant, lethal when doubled" };

// ---- gene table ------------------------------------------------------

export function parseGenes(text) {
  const errors = [];
  const genes = [];
  const lookup = new Map();
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const parts = line.split("|").map((s) => s.trim());
    const at = `Gene line ${i + 1}`;
    const name = parts[0];
    const kind = (parts[1] || "").toUpperCase();
    if (!name) return errors.push(`${at}: missing a name.`);
    if (!KINDS[kind]) return errors.push(`${at} (${name}): type must be R, I, D or L.`);
    if (/^(super|het|poss|possible|normal)\b/i.test(name)) return errors.push(`${at} (${name}): do not start a gene name with Super, Het, Poss or Normal.`);
    if (/[,;%]/.test(name)) return errors.push(`${at} (${name}): a gene name cannot contain , ; or %.`);
    const aliases = (parts[2] || "").split(",").map((s) => s.trim()).filter(Boolean);
    const group = norm(parts[3] || "");
    const g = { name, kind, aliases, group };
    for (const key of [name, ...aliases]) {
      const k = norm(key);
      if (lookup.has(k)) return errors.push(`${at}: "${key}" is already used by ${lookup.get(k).name}.`);
    }
    for (const key of [name, ...aliases]) lookup.set(norm(key), g);
    genes.push(g);
  });
  return { genes, lookup, errors };
}

// ---- animals -----------------------------------------------------------
// state: Map(geneName -> { t, label })   t = chance one egg gets the mutant allele

const SUPERLESS = new Set(["L"]);

function parseTrait(token, lookup) {
  const raw = token.trim();
  let rest = raw;
  let mode = "plain";
  let share = 1;
  let m = rest.match(/^(\d+(?:\.\d+)?)\s*%\s*(?:poss(?:ible)?\.?\s*)?het\s+(.+)$/i);
  if (m) { mode = "het"; share = Number(m[1]) / 100; rest = m[2]; }
  else if ((m = rest.match(/^(?:poss(?:ible)?\.?\s*)het\s+/i))) return { error: `"${raw}": give the chance, like 66% het Clown.` };
  else if ((m = rest.match(/^het\s+(.+)$/i))) { mode = "het"; rest = m[1]; }
  else if ((m = rest.match(/^super\s+(.+)$/i))) { mode = "super"; rest = m[1]; }
  const g = lookup.get(norm(rest));
  if (!g) return { error: `"${raw}": no gene called "${rest}" in your gene table.` };
  if (mode === "het") {
    if (g.kind !== "R") return { error: `"${raw}": only recessive genes can be het; ${g.name} is ${KINDS[g.kind]}.` };
    if (!(share > 0 && share <= 1)) return { error: `"${raw}": the het chance must be above 0% and at most 100%.` };
    return { gene: g, t: 0.5 * share, label: share === 1 ? `het ${g.name}` : `${Math.round(share * 1000) / 10}% het ${g.name}` };
  }
  if (mode === "super") {
    if (g.kind === "R") return { error: `"${raw}": ${g.name} is recessive; write ${g.name} for a visual animal.` };
    if (SUPERLESS.has(g.kind)) return { error: `"${raw}": a double ${g.name} does not hatch, so no adult can be Super ${g.name}.` };
    return { gene: g, t: 1, label: `Super ${g.name}` };
  }
  if (g.kind === "R") return { gene: g, t: 1, label: g.name };
  return { gene: g, t: 0.5, label: g.name };
}

export function parseAnimal(text, lookup) {
  const errors = [];
  const state = new Map();
  for (const tok of String(text || "").split(/[,;]/).map((s) => s.trim()).filter(Boolean)) {
    if (/^normal$/i.test(tok)) continue;
    const r = parseTrait(tok, lookup);
    if (r.error) { errors.push(r.error); continue; }
    if (state.has(r.gene.name)) { errors.push(`"${tok}": ${r.gene.name} is listed twice.`); continue; }
    state.set(r.gene.name, { t: r.t, label: r.label });
  }
  return { state, errors };
}

export function parseAnimals(text, lookup, role) {
  const errors = [];
  const animals = [];
  const seen = new Set();
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const bar = line.indexOf("|");
    const name = (bar < 0 ? line : line.slice(0, bar)).trim();
    const traits = bar < 0 ? "" : line.slice(bar + 1);
    const at = `${role} line ${i + 1}`;
    if (!name) return errors.push(`${at}: missing a name.`);
    if (seen.has(norm(name))) return errors.push(`${at}: "${name}" is listed twice.`);
    seen.add(norm(name));
    const a = parseAnimal(traits, lookup);
    for (const e of a.errors) errors.push(`${at} (${name}): ${e}`);
    animals.push({ name, state: a.state, traits: traits.trim() || "Normal" });
  });
  return { animals, errors };
}

// ---- price table --------------------------------------------------------

export function labelsKey(labels) {
  return [...labels].sort((a, b) => a.localeCompare(b)).join("+");
}

// Greedy longest-match over gene names and aliases, with an optional "Super".
export function parseMorphName(text, lookup) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const labels = [];
  const used = new Set();
  let i = 0;
  while (i < words.length) {
    let sup = false;
    let j = i;
    if (words[j].toLowerCase() === "super" && j + 1 < words.length) { sup = true; j++; }
    let hit = null;
    for (let end = Math.min(words.length, j + 4); end > j; end--) {
      const g = lookup.get(norm(words.slice(j, end).join(" ")));
      if (g) { hit = { g, end }; break; }
    }
    if (!hit) return { error: `no gene called "${words.slice(j).join(" ")}"` };
    const { g } = hit;
    if (sup && (g.kind === "R" || g.kind === "L")) return { error: `"Super ${g.name}" cannot exist for a ${KINDS[g.kind]} gene` };
    if (used.has(g.name)) return { error: `${g.name} appears twice` };
    used.add(g.name);
    labels.push(sup ? `Super ${g.name}` : g.name);
    i = hit.end;
  }
  return { labels };
}

export function parsePrices(text, lookup) {
  const errors = [];
  const prices = new Map();
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const parts = line.split("|").map((s) => s.trim());
    const at = `Price line ${i + 1}`;
    const price = Number(parts[1]);
    if (parts.length < 2 || parts[1] === "" || !Number.isFinite(price) || price < 0) return errors.push(`${at}: write "morph | price", like Pastel Clown | 250.`);
    let labels = [];
    if (!/^normal$/i.test(parts[0])) {
      const r = parseMorphName(parts[0], lookup);
      if (r.error) return errors.push(`${at}: ${r.error}.`);
      labels = r.labels;
    }
    const key = labelsKey(labels);
    if (prices.has(key)) return errors.push(`${at}: that morph is priced twice.`);
    prices.set(key, { price, name: labels.length ? labels.join(" ") : "Normal" });
  });
  return { prices, errors };
}

// ---- target -------------------------------------------------------------
// A target is "carries at least": Pastel needs 1+ copies, Super Pastel 2,
// Clown needs 2, het Clown needs 1+.

export function parseTarget(text, lookup) {
  const need = new Map();
  const errors = [];
  for (const tok of String(text || "").split(/[,;]/).map((s) => s.trim()).filter(Boolean)) {
    const r = parseTrait(tok, lookup);
    if (r.error) { errors.push(r.error); continue; }
    if (/\d\s*%/.test(tok)) { errors.push(`"${tok}": a target cannot be a percentage; write het ${r.gene.name}.`); continue; }
    const hetWord = /^het\s/i.test(tok);
    const copies = hetWord ? 1 : r.gene.kind === "R" ? 2 : r.t === 1 ? 2 : 1;
    need.set(r.gene.name, Math.max(need.get(r.gene.name) || 0, copies));
  }
  return { need, errors };
}

// ---- the cross -----------------------------------------------------------

function copiesDist(a, b) {
  return [(1 - a) * (1 - b), a * (1 - b) + b * (1 - a), a * b];
}

function describe(g, c) {
  if (c === 0) return { vis: null, het: null, dead: false };
  if (g.kind === "R") return c === 2 ? { vis: g.name, het: null, dead: false } : { vis: null, het: `het ${g.name}`, dead: false };
  if (g.kind === "I") return { vis: c === 2 ? `Super ${g.name}` : g.name, het: null, dead: false };
  if (g.kind === "D") return { vis: g.name, het: null, dead: false };
  return c === 2 ? { vis: null, het: null, dead: true } : { vis: g.name, het: null, dead: false };
}

export function involvedGenes(mom, dad, genes) {
  const set = new Set([...mom.state.keys(), ...dad.state.keys()]);
  return genes.filter((g) => set.has(g.name));
}

export function allelicConflict(involved) {
  const byGroup = new Map();
  for (const g of involved) {
    if (!g.group) continue;
    if (!byGroup.has(g.group)) byGroup.set(g.group, []);
    byGroup.get(g.group).push(g.name);
  }
  for (const names of byGroup.values()) if (names.length > 1) return names;
  return null;
}

export function cross(mom, dad, genes) {
  const involved = involvedGenes(mom, dad, genes);
  const conflict = allelicConflict(involved);
  if (conflict) return { error: `${conflict.join(" and ")} are allelic (the same gene site), so independent odds would be wrong. This pairing is not modelled.` };
  if (involved.length > MAX_LOCI) return { error: `${involved.length} genes in one pairing is more than the ${MAX_LOCI} this tool will enumerate.` };
  let acc = [{ p: 1, vis: [], het: [], copies: new Map() }];
  let dead = 0;
  for (const g of involved) {
    const a = mom.state.get(g.name)?.t || 0;
    const b = dad.state.get(g.name)?.t || 0;
    const dist = copiesDist(a, b);
    const next = [];
    for (let c = 0; c <= 2; c++) {
      if (dist[c] <= 0) continue;
      const d = describe(g, c);
      for (const o of acc) {
        if (d.dead) { dead += o.p * dist[c]; continue; }
        const copies = new Map(o.copies);
        if (c > 0) copies.set(g.name, c);
        next.push({ p: o.p * dist[c], vis: d.vis ? [...o.vis, d.vis] : o.vis, het: d.het ? [...o.het, d.het] : o.het, copies });
      }
    }
    acc = next;
  }
  const merged = new Map();
  for (const o of acc) {
    const key = labelsKey(o.vis) + "|" + [...o.het].sort().join("+");
    const hit = merged.get(key);
    if (hit) hit.p += o.p;
    else merged.set(key, { ...o, vis: [...o.vis].sort((x, y) => x.localeCompare(y)), het: [...o.het].sort() });
  }
  const outcomes = [...merged.values()].sort((x, y) => y.p - x.p);
  return { outcomes, dead, involved };
}

const label = (o) => {
  const v = o.vis.length ? o.vis.join(" ") : "Normal";
  return o.het.length ? `${v} (${o.het.join(", ")})` : v;
};

// ---- validation and solving ----------------------------------------------

export function validateSpec(s) {
  const e = [];
  const num = (v, name, min, max) => {
    if (!Number.isFinite(v)) e.push(`${name} is not a number.`);
    else if (v < min || v > max) e.push(`${name} must be between ${min} and ${max}.`);
  };
  num(s.eggs, "Eggs per clutch", 1, 60);
  num(s.hatch, "Hatch rate", 0, 100);
  num(s.raise, "Cost to raise one hatchling", 0, 10000);
  num(s.fee, "Selling fee", 0, 60);
  num(s.overhead, "Overhead per clutch", 0, 100000);
  num(s.defaultPrice, "Price for an unlisted morph", 0, 1000000);
  if (Number.isFinite(s.eggs) && !Number.isInteger(s.eggs)) e.push("Eggs per clutch must be a whole number.");
  if (!s.females?.length) e.push("Add at least one female.");
  if (!s.males?.length) e.push("Add at least one male.");
  if (s.females?.length && s.males?.length && s.females.length * s.males.length > 400) e.push("That is more than 400 pairings; trim the lists.");
  return e;
}

export function priceOf(o, s) {
  const hit = s.prices.get(labelsKey(o.vis));
  return hit ? { price: hit.price, listed: true } : { price: s.defaultPrice, listed: false };
}

function matchesTarget(o, need) {
  if (!need || need.size === 0) return false;
  for (const [gene, c] of need) if ((o.copies.get(gene) || 0) < c) return false;
  return true;
}

export function evaluate(mom, dad, s) {
  const x = cross(mom, dad, s.genes);
  const base = { mom: mom.name, dad: dad.name };
  if (x.error) return { ...base, error: x.error };
  const h = s.hatch / 100;
  let revenue = 0, hatchlings = 0, unlisted = 0;
  const rows = x.outcomes.map((o) => {
    const { price, listed } = priceOf(o, s);
    const n = s.eggs * h * o.p;
    const net = price * (1 - s.fee / 100);
    const isTarget = matchesTarget(o, s.target);
    hatchlings += n;
    revenue += n * net;
    if (!listed) unlisted += o.p;
    return { label: label(o), p: o.p, n, price, listed, revenue: n * net, atLeastOne: 1 - Math.pow(1 - h * o.p, s.eggs), isTarget };
  });
  const cost = hatchlings * s.raise + s.overhead;
  const hasTarget = !!s.target && s.target.size > 0;
  // One egg is in the target class with probability sum(p over target rows);
  // eggs are independent, so a clutch misses only if every egg does.
  const pTarget = rows.filter((r) => r.isTarget).reduce((a, r) => a + r.p, 0);
  return {
    ...base,
    rows,
    dead: x.dead,
    genes: x.involved.map((g) => g.name),
    hatchlings,
    revenue,
    cost,
    profit: revenue - cost,
    unlisted,
    targetChance: hasTarget ? 1 - Math.pow(1 - h * pTarget, s.eggs) : null,
  };
}

export function solve(s) {
  const pairs = [];
  for (const f of s.females) for (const m of s.males) pairs.push(evaluate(f, m, s));
  const ok = pairs.filter((p) => !p.error);
  const key = s.rankBy === "target" && s.target && s.target.size ? (p) => p.targetChance : (p) => p.profit;
  ok.sort((a, b) => key(b) - key(a) || b.profit - a.profit);
  return { ranked: ok, refused: pairs.filter((p) => p.error), eggs: s.eggs };
}

// Independent checks on a result: probabilities, money and the clutch math.
export function verifyPlan(s, res) {
  const out = [];
  const h = s.hatch / 100;
  for (const p of res.ranked) {
    const at = `${p.mom} x ${p.dad}`;
    const sum = p.rows.reduce((a, r) => a + r.p, 0) + p.dead;
    if (Math.abs(sum - 1) > 1e-9) out.push(`${at}: probabilities add to ${sum}, not 1.`);
    const rev = p.rows.reduce((a, r) => a + r.n * r.price * (1 - s.fee / 100), 0);
    if (Math.abs(rev - p.revenue) > 1e-6) out.push(`${at}: revenue does not match its rows.`);
    const hatched = p.rows.reduce((a, r) => a + r.n, 0);
    if (Math.abs(hatched - s.eggs * h * (1 - p.dead)) > 1e-9) out.push(`${at}: hatchlings do not match eggs x hatch rate x viable share.`);
    if (Math.abs(p.profit - (p.revenue - hatched * s.raise - s.overhead)) > 1e-6) out.push(`${at}: profit does not match revenue less costs.`);
    if (p.targetChance !== null) {
      // Target outcomes are disjoint per egg, so an egg misses with 1 - h * (sum of their chances).
      const perEgg = p.rows.filter((r) => r.isTarget).reduce((a, r) => a + h * r.p, 0);
      if (Math.abs(p.targetChance - (1 - Math.pow(1 - perEgg, s.eggs))) > 1e-9) out.push(`${at}: target chance does not match the per-egg miss chance.`);
    }
  }
  return out;
}

export function planCsv(s, res) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [["Female", "Male", "Offspring", "Chance per egg", "Expected hatchlings", "Price", "Price listed", "Expected net revenue", "Chance of at least one in the clutch"].join(",")];
  for (const p of res.ranked) {
    for (const r of p.rows) {
      rows.push([q(p.mom), q(p.dad), q(r.label), r.p.toFixed(5), r.n.toFixed(3), r.price.toFixed(2), r.listed ? "yes" : "no", r.revenue.toFixed(2), r.atLeastOne.toFixed(4)].join(","));
    }
    rows.push([q(p.mom), q(p.dad), q("CLUTCH TOTAL (profit after raising cost and overhead)"), "", p.hatchlings.toFixed(3), "", "", p.profit.toFixed(2), ""].join(","));
  }
  return rows.join("\n") + "\n";
}

// Convenience for tests and the page: build a spec from the sample text.
export function buildSpec(inp) {
  const g = parseGenes(inp.genes);
  const errors = [...g.errors];
  const f = parseAnimals(inp.females, g.lookup, "Female");
  const m = parseAnimals(inp.males, g.lookup, "Male");
  const p = parsePrices(inp.prices, g.lookup);
  const t = parseTarget(inp.target || "", g.lookup);
  errors.push(...f.errors, ...m.errors, ...p.errors, ...t.errors);
  const spec = {
    genes: g.genes, females: f.animals, males: m.animals, prices: p.prices, target: t.need,
    eggs: Number(inp.eggs), hatch: Number(inp.hatch), raise: Number(inp.raise), fee: Number(inp.fee), overhead: Number(inp.overhead),
    defaultPrice: Number(inp.defaultPrice), rankBy: inp.rankBy || "profit",
  };
  return { spec, errors };
}
