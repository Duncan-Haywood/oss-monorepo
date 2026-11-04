// Misspelt top-level plan keys. The engines read named keys and ignore the rest, so `studSpaceing: 24`
// was a silent 16-inch default and a wrong stud count. This lists keys the engines never read that are
// within two edits of one they do (the same check the budget runs on typed prices). Not a schema:
// an unknown key far from every known one is left alone, since plans carry notes and extra fields.
export const KNOWN_PLAN_KEYS = [
  "studSpacing", "studLength", "kerf", "topPlateLap", "cornerExtraStuds", "teeExtraStuds", "defaultHeaderHeight", "stock", "walls",
  "advanced", "allowances", "bids", "blocking", "deck", "dormer", "drilling", "drywall", "eaves", "electrical", "fasteners", "floor", "foundation", "gutters",
  "headerTable", "insulation", "plateLaps", "prices", "proposal", "roof", "schedule", "sheathing", "siding", "stairs", "trim", "ventilation",
];

/** @param {string} a @param {string} b */
function edit(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** @param {any} plan @returns {{name: string, didYouMean: string}[]} */
export function misspeltPlanKeys(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return [];
  const out = [];
  for (const k of Object.keys(plan)) {
    if (KNOWN_PLAN_KEYS.includes(k)) continue;
    const near = KNOWN_PLAN_KEYS.map((n) => ({ n, d: edit(k.toLowerCase(), n.toLowerCase()) })).sort((x, y) => x.d - y.d)[0];
    if (near.d <= 2 && near.d < Math.min(k.length, near.n.length)) out.push({ name: k, didYouMean: near.n });
  }
  return out;
}

/** @param {{name: string, didYouMean: string}[]} found */
export function misspeltPlanKeysNote(found) {
  if (!found.length) return "";
  return `Note: ${found.length === 1 ? "this plan key is" : "these plan keys are"} not read and look misspelt, so the default was used: ${found.map((x) => `${x.name} (did you mean ${x.didYouMean}?)`).join(", ")}.\n\n`;
}
