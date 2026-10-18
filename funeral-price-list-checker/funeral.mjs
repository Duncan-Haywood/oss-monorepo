// Funeral price list checker engine. Pure functions, no I/O, no network.
//
// Takes the lines a family copies from a funeral home's General Price List (GPL)
// or an arrangement quote ("Embalming ..... $795"), sorts every priced line into
// what it is -- the one fee you cannot decline, something usually needed,
// something you choose, a third-party pass-through, a bundle -- adds up each
// group, flags wording the FTC Funeral Rule (16 CFR 453) speaks to, and compares
// two homes line group by line group. It is a reading aid, not legal advice.

export const STATUS = {
  fixed: "Fee you cannot decline",
  needed: "Usually needed",
  optional: "Your choice",
  third: "Paid to someone else",
  package: "Bundle",
  flag: "Question this",
  unknown: "Not recognised",
};
export const STATUS_KEYS = Object.keys(STATUS);

// Order matters: the first matching rule wins, so specific phrases (a casket
// *handling fee*, an *alternative* container, an *outer burial* container)
// come before the general words they contain.
const RULES = [
  [/(handling|inspection|delivery|acceptance)\b.*\b(fee|charge)\b.*\b(casket|urn|merchandise|outside|third)|\b(casket|urn)\b.*\b(handling|inspection)\b|outside (casket|merchandise|urn)|casket (purchased|bought) elsewhere|third[- ]party (casket|merchandise)/i,
    "outside-merchandise-fee", "flag",
    "The FTC Funeral Rule does not let a funeral home charge a fee because you bought the casket or urn somewhere else, and it must accept one you bought. Ask the home to point to the rule that allows this charge."],
  [/basic services|basic fee|non[- ]?declinable|professional services of (the )?funeral director|services of funeral director and staff/i,
    "basic-services", "fixed",
    "The one fee the Rule lets a home require. It covers planning, paperwork, overhead and permits it handles. What it includes differs by home, and it is often not refundable, so ask what is in it and compare it across homes."],
  [/direct cremation|immediate (burial|cremation)|direct burial|cremation without|simple cremation/i,
    "direct", "package",
    "A no-viewing, no-service arrangement and usually the lowest-priced option. Confirm what the price includes (transfer, container, crematory fee, permits, urn) so two quotes cover the same things."],
  [/package|all[- ]inclusive|bundle|traditional (funeral|service)|memorial package|complete (funeral|service)/i,
    "package", "package",
    "You may buy a package if it is what you want, but you have the right to itemize. Ask for the line-by-line prices of everything in it and compare them with what you would pick yourself."],
  [/embalm|sanitiz|preserv(ation|ing)\b/i,
    "embalming", "optional",
    "Federal law does not require embalming. A few states require it in narrow cases (for example some transport, or a long delay before burial or viewing). A home may not tell you it is required unless a law says so, and may not charge for it without your permission. Ask which law applies, and about refrigeration as an alternative."],
  [/refrigerat|cold storage|cooling/i,
    "refrigeration", "optional",
    "Often the alternative to embalming when there will be a delay. Ask the daily rate and whether it is charged on top of embalming."],
  [/dress|cosmet|hair|restor|casketing|grooming|other preparation|body prep/i,
    "preparation", "optional",
    "Preparation of the body beyond embalming is a choice. It is mainly needed for an open-casket viewing."],
  [/alternative container|cremation container|unfinished (wood|pine)|cardboard|combustible|minimum container|rental casket/i,
    "cremation-container", "optional",
    "A home that offers direct cremation must offer an alternative container. No casket is required for cremation, so a plain combustible container is enough."],
  [/outer burial|burial vault|grave liner|grave box|vault\b|outer container|liner\b/i,
    "vault", "optional",
    "No federal law requires a vault. Many cemeteries require some outer container to keep the ground level; ask the cemetery for its rule in writing, since a basic grave liner usually costs less than a vault."],
  [/casket|coffin|burial case/i,
    "casket", "optional",
    "The Rule lets you choose any casket and requires the home to show you a casket price list first. No casket is required for cremation, and you may buy one elsewhere."],
  [/\burn\b|keepsake|cremation jewel|ash(es)? (scatter|container)/i,
    "urn", "optional",
    "Urns are merchandise you may buy from any seller. Ask whether the cremation price already includes a temporary container."],
  [/transfer|removal|first call|pick[- ]?up|transport(ation)? of (the )?(remains|deceased|body)|receiving remains|forwarding remains|shipping remains/i,
    "transfer", "needed",
    "Moving the person from the place of death is nearly always needed. Ask about mileage, after-hours and second-person charges, which vary a lot."],
  [/death certificate|certified cop|permit|filing fee|burial transit|cremation authori[sz]ation|medical examiner/i,
    "paperwork", "third",
    "Government fees the home pays for you. The home must tell you if it adds a charge for paying on your behalf."],
  [/cash advance|clergy|officiant|honorari|organist|musician|soloist|obituar|newspaper|flower|florist|police escort|pallbearer|catering|reception|certificate fee/i,
    "cash-advance", "third",
    "Pass-through costs the home pays to others for you. Ask for the receipts, and whether the home adds a service charge on top, which it must disclose."],
  [/opening and closing|open(ing)?\/clos|interment|grave (space|site|plot|marker)|\bplot\b|crypt|niche|columbarium|monument|headstone|marker|memorial (stone|plaque)|endowment|perpetual care/i,
    "cemetery", "third",
    "Normally billed by the cemetery, not the funeral home. Confirm who invoices it so it is not counted twice or missed."],
  [/crematory|cremation (fee|charge|service)|cremation\b/i,
    "cremation", "needed",
    "The charge for the cremation itself. Check whether the crematory bills you directly or the home passes it through."],
  [/hearse|coach|limousine|limo|service car|flower car|family car|lead car|vehicle|motor|escort/i,
    "vehicles", "optional",
    "Vehicles are a choice. Ask whether you can drive yourselves, and whether the price is per vehicle or per mile."],
  [/visitation|viewing|wake|calling hours|reception room|family hour|use of (the )?(facility|chapel|parlor|home)/i,
    "viewing", "optional",
    "Charged per event or per hour. A viewing is only one of several ways to gather, and nothing requires it."],
  [/funeral (ceremony|service)|chapel|graveside|committal|memorial (service|ceremony)|celebration of life|service (at|in)|staff|equipment|officiat/i,
    "ceremony", "optional",
    "Ceremony and staff charges depend on where and how long you gather. A graveside or home service can cost less than a service in the funeral home."],
  [/guest book|register|prayer card|memorial (folder|card|program)|acknowledg|thank[- ]you card|video|tribute|webcast|stream|photo|keepsake|printed|program|stationery/i,
    "memorial-items", "optional",
    "Small items you may buy from the home or from anyone else, often for much less."],
  [/after[- ]hours|weekend|holiday|overtime|rush|extra staff|surcharge/i,
    "surcharge", "flag",
    "A surcharge is not on the Rule's list of required fees. Ask exactly when it applies, and whether the timing is your choice."],
  [/miscellaneous|other (charge|fee|service)|administrative|admin fee|processing|facility fee|overhead|environmental|equipment fee/i,
    "misc", "flag",
    "A vague line. Ask what it buys, and whether it is already part of the basic services fee, which should cover overhead."],
];

// Wording that is a red flag whatever the line is priced at.
const CLAIMS = [
  [/(embalm\w*).{0,60}(required|mandatory|must|state law|by law)|(required|mandatory|must|by law).{0,60}embalm/i,
    "Embalming is described as required. Federal law does not require it; ask which state law applies."],
  [/casket.{0,40}(required|mandatory|must|by law).{0,40}(cremat)|cremat.{0,60}(casket).{0,30}(required|mandatory|must)/i,
    "A casket is described as required for cremation. It is not; an alternative container is enough."],
  [/(vault|outer burial|liner).{0,40}(required by law|state law|by law)/i,
    "A vault is described as required by law. Federal law does not require one; a cemetery may, so ask the cemetery."],
];

const NUM = String.raw`\$?\s*\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\$?\s*\d+(?:\.\d{1,2})?`;
const RANGE_RE = new RegExp(String.raw`(${NUM})\s*(?:-|–|—|to)\s*(${NUM})\s*[.:;)]?\s*$`, "i");
const AMOUNT_RE = new RegExp(String.raw`(${NUM})\s*[.:;)]?\s*$`);

function toCents(s) {
  const n = Number(String(s).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export function classify(label) {
  for (const [re, category, status, note] of RULES) {
    if (re.test(label)) return { category, status, note };
  }
  return { category: "unrecognised", status: "unknown", note: "Not recognised by the checker. Ask the home what this line covers and whether it is a choice." };
}

function cleanLabel(s) {
  return s.replace(/[.…_\-–—|:]{2,}/g, " ").replace(/[|\t]+/g, " ").replace(/\s{2,}/g, " ").replace(/^[\s\-*•·\d.)]+(?=[A-Za-z])/, "").replace(/[\s:.\-–—|$]+$/, "").trim();
}

// One priced item per line. Lines with no price (headings, notes) come back in
// `unpriced` so the family can see what was not counted.
export function parseQuote(text) {
  const items = [];
  const unpriced = [];
  const claims = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    for (const [re, msg] of CLAIMS) if (re.test(line) && !claims.includes(msg)) claims.push(msg);
    let low;
    let high;
    let rest;
    const range = RANGE_RE.exec(line);
    const single = AMOUNT_RE.exec(line);
    if (range && /\$|,/.test(range[0]) ) {
      low = toCents(range[1]);
      high = toCents(range[2]);
      rest = line.slice(0, range.index);
    } else if (single && (/\$/.test(single[1]) || /[.\s|:\t]\s*\d/.test(line.slice(Math.max(0, single.index - 1), single.index + 1)) || line.slice(0, single.index).trim().length > 2)) {
      low = high = toCents(single[1]);
      rest = line.slice(0, single.index);
    }
    const label = cleanLabel(rest || "");
    if (low === undefined || !Number.isFinite(low) || label.length < 2) {
      unpriced.push(line);
      continue;
    }
    if (high < low) [low, high] = [high, low];
    items.push({ line, label, low, high, ...classify(label) });
  }
  return { items, unpriced, claims };
}

const sum = (items, f) => items.reduce((a, i) => a + f(i), 0);

export function summarise(parsed) {
  const { items, unpriced, claims } = parsed;
  const total = { low: sum(items, (i) => i.low), high: sum(items, (i) => i.high) };
  const byStatus = {};
  for (const k of STATUS_KEYS) {
    const group = items.filter((i) => i.status === k);
    byStatus[k] = { count: group.length, low: sum(group, (i) => i.low), high: sum(group, (i) => i.high) };
  }
  const byCategory = {};
  for (const i of items) {
    const c = (byCategory[i.category] ||= { count: 0, low: 0, high: 0, status: i.status });
    c.count += 1;
    c.low += i.low;
    c.high += i.high;
  }
  const flags = items.filter((i) => i.status === "flag");
  const hasCategory = (c) => items.some((i) => i.category === c);
  const questions = [
    "Please send me your General Price List, and tell me the total for exactly these choices.",
    "Which of these lines are my choice, and which are required by a law you can name?",
  ];
  if (hasCategory("basic-services")) questions.push("What is included in the basic services fee, and is any of it refundable if I use another home?");
  if (hasCategory("embalming")) questions.push("Is embalming required by law for what I am planning? Which law? Can refrigeration replace it?");
  if (hasCategory("casket") || hasCategory("direct")) questions.push("Can I use a casket or container I bought elsewhere, with no handling fee?");
  if (hasCategory("cash-advance") || hasCategory("paperwork")) questions.push("Do you add a charge to the cash-advance items? Can I see the receipts?");
  if (hasCategory("package")) questions.push("What would each item in the package cost on its own, and what if I drop the ones I do not want?");
  if (hasCategory("surcharge") || hasCategory("misc")) questions.push("What does each surcharge or miscellaneous line cover, and can I avoid it?");
  if (!hasCategory("cemetery")) questions.push("Does this quote include cemetery or crematory charges, or will those be billed separately?");
  return { total, byStatus, byCategory, flags, claims, unpriced, questions, count: items.length };
}

// Two quotes grouped by category. A category only one home lists is shown as
// missing from the other, which is the usual reason two totals differ.
export function compareQuotes(a, b) {
  const sa = summarise(a);
  const sb = summarise(b);
  const cats = [...new Set([...Object.keys(sa.byCategory), ...Object.keys(sb.byCategory)])];
  const rows = cats.map((category) => {
    const x = sa.byCategory[category];
    const y = sb.byCategory[category];
    return {
      category,
      status: (x || y).status,
      a: x ? { low: x.low, high: x.high } : null,
      b: y ? { low: y.low, high: y.high } : null,
      diffLow: (x ? x.low : 0) - (y ? y.low : 0),
    };
  }).sort((p, q) => Math.abs(q.diffLow) - Math.abs(p.diffLow));
  return {
    totalA: sa.total,
    totalB: sb.total,
    diffLow: sa.total.low - sb.total.low,
    rows,
    onlyA: rows.filter((r) => r.a && !r.b).map((r) => r.category),
    onlyB: rows.filter((r) => r.b && !r.a).map((r) => r.category),
  };
}

export function money(cents) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const d = Math.floor(abs / 100);
  const c = abs % 100;
  return `${sign}$${String(d).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${c ? "." + String(c).padStart(2, "0") : ""}`;
}
export const range = (r) => (r.low === r.high ? money(r.low) : `${money(r.low)}–${money(r.high)}`);

export function renderText(parsed) {
  const s = summarise(parsed);
  const out = [];
  out.push(`${s.count} priced line(s), total ${range(s.total)}`);
  for (const k of STATUS_KEYS) if (s.byStatus[k].count) out.push(`  ${STATUS[k].padEnd(24)} ${String(s.byStatus[k].count).padStart(2)} line(s)  ${range(s.byStatus[k])}`);
  out.push("");
  for (const i of parsed.items) out.push(`[${STATUS[i.status]}] ${i.label}  ${range(i)}\n    ${i.note}`);
  if (s.claims.length) out.push("", "Wording to question:", ...s.claims.map((c) => `  - ${c}`));
  if (s.unpriced.length) out.push("", `Not counted (no price found): ${s.unpriced.length} line(s)`);
  out.push("", "Questions to ask:", ...s.questions.map((q) => `  - ${q}`));
  return out.join("\n");
}

export const EXAMPLE = `Basic services of funeral director and staff   $2,195
Transfer of remains to funeral home   $495
Embalming   $895
Dressing and cosmetology   $225
Visitation / viewing at funeral home (per day)   $595
Funeral ceremony at funeral home   $625
Hearse (local)   $395
Family limousine   $325
Casket - 18 gauge steel   $2,890
Outer burial container (vault)   $1,450
Casket handling fee (outside purchase)   $495
Certified death certificates (5)   $100
Obituary notice (newspaper)   $280
Printed memorial folders and guest book   $175`;
