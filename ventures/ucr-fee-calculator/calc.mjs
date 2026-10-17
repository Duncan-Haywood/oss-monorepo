// Unified Carrier Registration (UCR) annual fee, 49 U.S.C. 14504a. Pure arithmetic over what the user types in.
// The fee depends on how many commercial motor vehicles a carrier operates, in six brackets. Brokers, freight
// forwarders and leasing companies pay the lowest bracket whatever their size. The default table below is the
// schedule this tool was last checked against; the fee table is an input so a visitor can correct it from ucr.gov.

export const DEFAULT_FEES_TEXT = ["0-2: 46", "3-5: 138", "6-20: 276", "21-100: 963", "101-1000: 4588", "1001+: 44797"].join("\n");
export const FEE_TABLE_LABEL = "2025 registration year schedule (verify against ucr.gov for the year you are filing)";
export const TYPES = ["motor-carrier", "private-carrier", "broker", "freight-forwarder", "leasing"];

const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

export function parseFees(text) {
  const brackets = [];
  const errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const m = /^(\d+)\s*(?:-\s*(\d+)|(\+))\s*:\s*\$?([\d,]+(?:\.\d+)?)$/.exec(line);
    if (!m) return errors.push(`Fee line ${i + 1}: use "min-max: fee" or "min+: fee".`);
    const min = Number(m[1]);
    const max = m[3] ? Infinity : Number(m[2]);
    if (max < min) return errors.push(`Fee line ${i + 1}: max is below min.`);
    brackets.push({ min, max, fee: Number(m[4].replace(/,/g, "")) });
  });
  brackets.sort((a, b) => a.min - b.min);
  for (let i = 1; i < brackets.length; i++) {
    if (brackets[i].min <= brackets[i - 1].max) errors.push(`Fee brackets ${brackets[i - 1].min}-${brackets[i - 1].max} and ${brackets[i].min}+ overlap.`);
  }
  return { brackets, errors };
}

export function bracketFor(brackets, n) {
  return brackets.find((b) => n >= b.min && n <= b.max) ?? null;
}

// Parse "name, vehicles, type" lines (one per registrant: a carrier, or a broker with no trucks).
export function parseEntities(text) {
  const out = [];
  const errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const p = line.split(",").map((s) => s.trim());
    const n = Number((p[1] ?? "").replace(/[ _]/g, ""));
    const type = (p[2] || "motor-carrier").toLowerCase().replace(/\s+/g, "-");
    if (!p[0] || !(p[1] ?? "") || !Number.isInteger(n) || n < 0) return errors.push(`Line ${i + 1}: need "name, number of vehicles, type".`);
    if (!TYPES.includes(type)) return errors.push(`Line ${i + 1}: type must be one of ${TYPES.join(", ")}.`);
    out.push({ name: p[0], n, type });
  });
  return { entities: out, errors };
}

export function plan(input) {
  const fees = parseFees(input.fees || DEFAULT_FEES_TEXT);
  if (fees.errors.length) return { error: fees.errors[0], errors: fees.errors };
  if (!fees.brackets.length) return { error: "The fee table is empty." };
  const { entities, errors } = parseEntities(input.entities);
  if (errors.length) return { error: errors[0], errors };
  if (!entities.length) return { error: "Add at least one registrant: name, number of vehicles, type." };

  const lowest = fees.brackets[0];
  const rows = entities.map((e) => {
    const lowestOnly = ["broker", "freight-forwarder", "leasing"].includes(e.type);
    const effectiveN = lowestOnly ? lowest.min : e.n;
    const b = bracketFor(fees.brackets, effectiveN);
    if (!b) return { ...e, error: `No bracket covers ${effectiveN} vehicles.`, fee: 0 };
    const idx = fees.brackets.indexOf(b);
    const next = fees.brackets[idx + 1] ?? null;
    return {
      ...e, bracket: b, lowestOnly, fee: b.fee,
      perVehicle: e.n > 0 ? round2(b.fee / e.n) : null,
      toNext: !lowestOnly && next ? { at: next.min, extra: round2(next.fee - b.fee), headroom: b.max - e.n } : null,
    };
  });
  const bad = rows.find((r) => r.error);
  if (bad) return { error: bad.error };

  const total = round2(rows.reduce((s, r) => s + r.fee, 0));
  const advice = [`Estimated UCR fee: $${total.toFixed(2)} across ${rows.length} registrant${rows.length === 1 ? "" : "s"}.`];
  for (const r of rows) {
    if (r.lowestOnly) advice.push(`${r.name}: ${r.type.replace("-", " ")} registrants pay the lowest bracket ($${r.fee.toFixed(2)}) regardless of how many vehicles they arrange or lease.`);
    else if (r.toNext && r.toNext.headroom === 0) advice.push(`${r.name}: at ${r.n} vehicles you are at the top of the ${r.bracket.min}-${r.bracket.max} bracket; adding one vehicle moves the fee up $${r.toNext.extra.toFixed(2)}.`);
    else if (r.toNext) advice.push(`${r.name}: ${r.toNext.headroom} more vehicle${r.toNext.headroom === 1 ? "" : "s"} fit in this bracket before the fee rises $${r.toNext.extra.toFixed(2)}.`);
    if (r.perVehicle !== null && !r.lowestOnly) advice.push(`${r.name}: that is $${r.perVehicle.toFixed(2)} per vehicle.`);
  }
  const miles = Number(input.annualMiles);
  if (miles > 0) advice.push(`Spread over ${miles.toLocaleString("en-US")} miles that is about ${(total / miles * 100).toFixed(3)} cents per mile.`);
  advice.push("Registration for a year opens in October and the fee is due by December 31 for operations from January 1. Check your base state's UCR office for its own deadline and processing fee.");
  return { rows, total, advice };
}

export function sampleInput() {
  return {
    annualMiles: 120000,
    fees: DEFAULT_FEES_TEXT,
    entities: ["Haywood Hauling, 5, motor-carrier", "Prairie Freight Brokerage, 0, broker", "Ridge Lease Co, 12, leasing"].join("\n"),
  };
}

export function toCsv(r) {
  const head = "registrant,type,vehicles,bracket,fee,per_vehicle";
  const lines = r.rows.map((x) => [x.name, x.type, x.n, `${x.bracket.min}-${x.bracket.max === Infinity ? "+" : x.bracket.max}`, x.fee.toFixed(2), x.perVehicle === null ? "" : x.perVehicle.toFixed(2)].map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(","));
  return [head, ...lines, `total,,,,${r.total.toFixed(2)},`].join("\n") + "\n";
}
