// Row-crop insurance coverage-level comparison (US federal crop insurance: Revenue Protection,
// RP with Harvest Price Exclusion, Yield Protection). Pure functions, no dependencies, nothing
// leaves the browser. The farmer-paid premium for each coverage level comes from the user's
// agent quote (it already has the federal subsidy taken off), so no rate table or county data is
// modelled here: this tool compares the levels the agent quoted.
//
// Rules modelled, per acre:
//   RP      guarantee = APH x coverage x max(projected price, harvest price), the harvest price
//           counted up to 200% of the projected price; revenue to count = yield x harvest price.
//   RP-HPE  guarantee = APH x coverage x projected price; revenue to count = yield x harvest price.
//   YP      guarantee = APH x coverage x projected price; paid on the missing bushels at the
//           projected price, whatever the harvest price did.
// Indemnity = max(0, guarantee - revenue to count).

export const PLANS = { RP: "Revenue Protection (RP)", RPHPE: "RP with Harvest Price Exclusion", YP: "Yield Protection (YP)" };

export const DEFAULTS = {
  plan: "RP",
  acres: 640,
  aph: 180,
  projectedPrice: 4.6,
  coverage: "70, 6.10\n75, 9.40\n80, 14.80\n85, 26.50",
  scenarios:
    "Normal year, 185, 4.60, 55\nShort crop, prices up, 120, 5.80, 10\nBumper crop, prices down, 205, 3.90, 25\nMildly short, 160, 4.80, 10",
};

export function num(v) {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[$,%\s]/g, ""));
  return String(v ?? "").trim() === "" ? NaN : n;
}
const nz = (x) => (Number.isFinite(x) && x > 0 ? x : 0);

export function money(x) {
  const n = Math.round(x);
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US");
}
export function money2(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "coverage %, farmer-paid premium $/acre" per line. Unreadable lines go to `skipped`.
export function parseCoverage(text) {
  const rows = [], skipped = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const [c, p] = line.split(/[,\t;]/).map((s) => s.trim());
    const level = num(c), premium = num(p);
    if (!Number.isFinite(level) || !Number.isFinite(premium) || level <= 0 || level > 100 || premium < 0) { skipped.push(line); continue; }
    rows.push({ level, premium });
  }
  rows.sort((a, b) => a.level - b.level);
  return { rows, skipped };
}

// "label, yield per acre, harvest price, probability %" per line. The label may contain commas,
// so the last three fields are the numbers.
export function parseScenarios(text) {
  const rows = [], skipped = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/[,\t;]/).map((s) => s.trim());
    if (parts.length < 4) { skipped.push(line); continue; }
    const [y, h, p] = parts.slice(-3).map(num);
    const label = parts.slice(0, -3).join(", ") || `Scenario ${rows.length + 1}`;
    if (![y, h, p].every(Number.isFinite) || y < 0 || h < 0 || p < 0) { skipped.push(line); continue; }
    rows.push({ label, yield: y, harvestPrice: h, probability: p });
  }
  return { rows, skipped };
}

export function guaranteeFor(plan, aph, level, projectedPrice, harvestPrice) {
  const bushels = aph * (level / 100);
  if (plan === "RP") return bushels * Math.max(projectedPrice, Math.min(harvestPrice, projectedPrice * 2));
  return bushels * projectedPrice;
}

export function indemnityFor(plan, aph, level, projectedPrice, yieldPerAcre, harvestPrice) {
  if (plan === "YP") return Math.max(0, aph * (level / 100) - yieldPerAcre) * projectedPrice;
  const guarantee = guaranteeFor(plan, aph, level, projectedPrice, harvestPrice);
  const counted = plan === "RP" ? Math.min(harvestPrice, projectedPrice * 2) : harvestPrice;
  // Revenue to count uses the capped harvest price under RP; HPE has no uplift to cap.
  return Math.max(0, guarantee - yieldPerAcre * (plan === "RP" ? counted : harvestPrice));
}

export function analyze(o) {
  const plan = Object.hasOwn(PLANS, o.plan) ? o.plan : "RP";
  const aph = nz(o.aph), price = nz(o.projectedPrice), acres = nz(o.acres);
  const cov = parseCoverage(o.coverage);
  const sc = parseScenarios(o.scenarios);
  const probSum = sc.rows.reduce((a, r) => a + r.probability, 0);
  const levels = cov.rows.map((c, i) => {
    const baseBushels = aph * (c.level / 100);
    const baseGuarantee = baseBushels * price;
    const prev = cov.rows[i - 1];
    const prevGuarantee = prev ? aph * (prev.level / 100) * price : 0;
    const outcomes = sc.rows.map((s) => {
      const indemnity = indemnityFor(plan, aph, c.level, price, s.yield, s.harvestPrice);
      return { ...s, indemnity, net: indemnity - c.premium };
    });
    const expectedNet = probSum > 0 ? outcomes.reduce((a, r) => a + r.net * r.probability, 0) / probSum : NaN;
    const expectedIndemnity = probSum > 0 ? outcomes.reduce((a, r) => a + r.indemnity * r.probability, 0) / probSum : NaN;
    return {
      ...c,
      baseBushels,
      baseGuarantee,
      // Yield at which an indemnity first covers the premium, if price sits at the projected price.
      breakEvenYield: price > 0 ? baseBushels - c.premium / price : NaN,
      floorAfterPremium: baseGuarantee - c.premium,
      stepPremium: prev ? c.premium - prev.premium : null,
      stepGuarantee: prev ? baseGuarantee - prevGuarantee : null,
      stepCostPerDollar: prev && baseGuarantee - prevGuarantee > 0 ? (c.premium - prev.premium) / (baseGuarantee - prevGuarantee) : null,
      outcomes,
      expectedIndemnity,
      expectedNet,
      worstNet: outcomes.length ? Math.min(...outcomes.map((r) => r.net)) : NaN,
      totalPremium: c.premium * acres,
    };
  });
  const best = levels.length && probSum > 0 ? [...levels].sort((a, b) => b.expectedNet - a.expectedNet)[0] : null;
  return { plan, levels, scenarios: sc.rows, skippedCoverage: cov.skipped, skippedScenarios: sc.skipped, probSum, best, acres };
}
