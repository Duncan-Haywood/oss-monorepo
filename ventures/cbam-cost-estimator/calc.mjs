// EU CBAM (Regulation (EU) 2023/956) annual cost estimate for importers.
// Pure functions, no I/O. Emission intensities and benchmarks below are
// ILLUSTRATIVE round numbers for orientation only: the user is told to
// replace them with verified supplier data or the Commission default values.

// Share of free allocation phased out (the "CBAM factor"), Art 31 of
// Regulation 2023/956, as adopted. 2034 is the first year at 100%.
export const CBAM_FACTOR = {
  2026: 0.025, 2027: 0.05, 2028: 0.10, 2029: 0.225, 2030: 0.485,
  2031: 0.61, 2032: 0.735, 2033: 0.86, 2034: 1,
};

// Mark-up applied when Commission default values stand in for verified
// supplier data (implementing act as adopted; verify before relying on it).
export const DEFAULT_MARKUP = { 2026: 0.10, 2027: 0.20 };
export const defaultMarkup = (year) => DEFAULT_MARKUP[year] ?? 0.30;

// Annual net-mass threshold under which an importer is outside CBAM
// (Regulation (EU) 2025/2083). Electricity and hydrogen are not counted.
export const DE_MINIMIS_TONNES = 50;

// intensity: tCO2e embedded per tonne of goods (direct + indirect where the
// sector counts indirect). benchmark: free-allocation benchmark, tCO2e/t.
export const GOODS = {
  "steel-bf": { label: "Iron and steel: blast furnace route (rolled or finished)", sector: "iron-steel", intensity: 2.1, benchmark: 1.328 },
  "steel-eaf": { label: "Iron and steel: electric arc furnace route", sector: "iron-steel", intensity: 0.6, benchmark: 0.283 },
  "alu-primary": { label: "Aluminium: primary unwrought (smelter)", sector: "aluminium", intensity: 9.7, benchmark: 1.514 },
  "alu-secondary": { label: "Aluminium: recycled / secondary", sector: "aluminium", intensity: 0.7, benchmark: 0.3 },
  "cement-clinker": { label: "Cement: grey clinker", sector: "cement", intensity: 0.87, benchmark: 0.766 },
  "ammonia": { label: "Fertilisers: ammonia", sector: "fertilisers", intensity: 2.1, benchmark: 1.619 },
  "nitric": { label: "Fertilisers: nitric acid", sector: "fertilisers", intensity: 0.5, benchmark: 0.302 },
  "hydrogen": { label: "Hydrogen", sector: "hydrogen", intensity: 10, benchmark: 6.84 },
};

export const YEARS = Object.keys(CBAM_FACTOR).map(Number);

export const SAMPLE = {
  year: "2027", eua: "75", originPrice: "0", defaults: "no",
  lines: [
    { good: "steel-bf", tonnes: "400", intensity: "2.1", benchmark: "1.328", value: "280000" },
    { good: "alu-primary", tonnes: "60", intensity: "", benchmark: "", value: "180000" },
    { good: "ammonia", tonnes: "", intensity: "", benchmark: "", value: "" },
  ],
};

export function num(v) {
  if (v === "" || v == null) return null;
  const n = Number(String(v).trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;

export function compute(input) {
  const errors = [];
  const year = Number(input.year);
  if (!CBAM_FACTOR[year]) errors.push("Choose an import year from 2026 to 2034.");
  const eua = num(input.eua);
  if (eua == null || Number.isNaN(eua) || eua < 0) errors.push("Enter the carbon price in EUR per tonne CO2, for example 75.");
  const originPrice = num(input.originPrice) ?? 0;
  if (Number.isNaN(originPrice) || originPrice < 0) errors.push("Carbon price already paid abroad must be a number of 0 or more.");
  const useDefaults = input.defaults === "yes" || input.defaults === true;

  const lines = [];
  (input.lines || []).forEach((raw, i) => {
    const tonnes = num(raw.tonnes);
    if (tonnes == null && !raw.good) return;
    if (tonnes == null) return;
    if (!raw.good || !GOODS[raw.good]) { errors.push(`Line ${i + 1}: choose the goods.`); return; }
    if (Number.isNaN(tonnes) || tonnes < 0) { errors.push(`Line ${i + 1}: tonnes must be a number of 0 or more.`); return; }
    const g = GOODS[raw.good];
    const intensity = num(raw.intensity) ?? g.intensity;
    const benchmark = num(raw.benchmark) ?? g.benchmark;
    if (Number.isNaN(intensity) || intensity < 0 || Number.isNaN(benchmark) || benchmark < 0) { errors.push(`Line ${i + 1}: intensity and benchmark must be numbers of 0 or more.`); return; }
    const value = num(raw.value);
    lines.push({ good: raw.good, label: g.label, sector: g.sector, tonnes, intensity, benchmark, usedPreset: num(raw.intensity) == null, value: Number.isNaN(value) ? null : value });
  });
  if (!errors.length && lines.length === 0) errors.push("Add at least one line with goods and tonnes imported in the year.");
  if (errors.length) return { errors };

  const factor = CBAM_FACTOR[year];
  const markup = useDefaults ? defaultMarkup(year) : 0;
  const massCounted = lines.filter((l) => l.sector !== "hydrogen").reduce((s, l) => s + l.tonnes, 0);
  const underThreshold = massCounted < DE_MINIMIS_TONNES;

  let embedded = 0, freeAdj = 0, certs = 0, tonnesTotal = 0, valueTotal = 0, valueKnown = true;
  for (const l of lines) {
    l.embedded = r3(l.tonnes * l.intensity * (1 + markup));
    l.freeAllocationDeduction = r3(l.tonnes * l.benchmark * (1 - factor));
    l.certificates = r3(Math.max(0, l.embedded - l.freeAllocationDeduction));
    l.grossCost = r2(l.certificates * eua);
    l.originDeduction = r2(Math.min(l.grossCost, l.certificates * originPrice));
    l.cost = r2(l.grossCost - l.originDeduction);
    l.costPerTonne = l.tonnes ? r2(l.cost / l.tonnes) : 0;
    l.costPct = l.value ? r2((l.cost / l.value) * 100) : null;
    embedded += l.embedded; freeAdj += l.freeAllocationDeduction; certs += l.certificates; tonnesTotal += l.tonnes;
    if (l.value == null) valueKnown = false; else valueTotal += l.value;
  }
  const totalCost = r2(lines.reduce((s, l) => s + l.cost, 0));
  const totalCertificates = r3(certs);

  // Sensitivity: what the same imports cost at the same price in later years.
  const ladder = YEARS.map((y) => {
    const f = CBAM_FACTOR[y];
    const m = useDefaults ? defaultMarkup(y) : 0;
    const c = lines.reduce((s, l) => {
      const e = l.tonnes * l.intensity * (1 + m);
      const free = l.tonnes * l.benchmark * (1 - f);
      const certsY = Math.max(0, e - free);
      return s + Math.max(0, certsY * eua - certsY * originPrice);
    }, 0);
    return { year: y, factor: f, cost: r2(c), perTonne: tonnesTotal ? r2(c / tonnesTotal) : 0 };
  });

  const priceLadder = [0.5, 0.75, 1, 1.25, 1.5].map((m) => {
    const p = r2(eua * m);
    const c = lines.reduce((s, l) => s + Math.max(0, l.certificates * p - l.certificates * originPrice), 0);
    return { price: p, cost: r2(c) };
  });

  const findings = [];
  if (underThreshold) findings.push({ severity: "info", title: `Total mass ${r2(massCounted)} t is under the ${DE_MINIMIS_TONNES} t annual threshold, so you are likely outside CBAM obligations for the year. Keep records: the threshold is on net mass across all your CBAM goods (not hydrogen or electricity), and crossing it mid-year means applying for authorised declarant status first.` });
  else findings.push({ severity: "high", title: `Total mass ${r2(massCounted)} t is over the ${DE_MINIMIS_TONNES} t annual threshold: you need authorised CBAM declarant status before importing past it, and an annual declaration surrendering certificates.` });
  if (lines.some((l) => l.usedPreset)) findings.push({ severity: "medium", title: "Some lines use illustrative emission intensities and benchmarks from this page. Real figures come from your supplier's verified emissions data or the Commission's default values, and can differ by a large factor." });
  if (useDefaults) findings.push({ severity: "medium", title: `Default values carry a ${Math.round(markup * 100)}% mark-up in ${year}, applied here. Verified supplier data avoids it.` });
  if (originPrice > 0) findings.push({ severity: "info", title: "Carbon price paid in the country of origin is deducted only if it is documented and verified; the deduction here is a simple price-times-certificates approximation." });
  const top = [...lines].sort((a, b) => b.cost - a.cost)[0];
  if (top && lines.length > 1 && totalCost > 0) findings.push({ severity: "info", title: `${top.label} drives ${Math.round((top.cost / totalCost) * 100)}% of the estimated cost.` });

  return {
    errors: [], year, factor, eua, originPrice, useDefaults, markup, lines,
    massCounted: r2(massCounted), tonnesTotal: r2(tonnesTotal), underThreshold,
    embedded: r3(embedded), freeAllocationDeduction: r3(freeAdj), certificates: totalCertificates,
    totalCost, costPerTonne: tonnesTotal ? r2(totalCost / tonnesTotal) : 0,
    costPct: valueKnown && valueTotal ? r2((totalCost / valueTotal) * 100) : null,
    ladder, priceLadder, findings,
    dates: { quarterlyHolding: year >= 2026 ? "From 2027, certificates covering at least 50% of embedded emissions so far must be held at each quarter end." : "", certificateSales: "Certificate sales start 1 February 2027 for 2026 imports.", declaration: `Annual declaration and surrender for ${year} imports are due by 30 September ${year + 1}.` },
  };
}

const eur = (x) => `EUR ${x.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function summaryText(r) {
  const out = [];
  out.push(`CBAM estimate for ${r.year} imports at EUR ${r.eua}/tCO2${r.originPrice ? ` (EUR ${r.originPrice}/t already paid abroad)` : ""}`);
  out.push(`Free allocation phase-out in ${r.year}: ${Math.round(r.factor * 1000) / 10}% (CBAM factor)`);
  out.push(`Estimated CBAM cost: ${eur(r.totalCost)} for ${r.certificates} certificates (${eur(r.costPerTonne)} per tonne imported${r.costPct != null ? `, ${r.costPct}% of goods value` : ""})`);
  out.push(`Embedded emissions ${r.embedded} tCO2e, less free-allocation deduction ${r.freeAllocationDeduction} tCO2e`);
  out.push("");
  for (const l of r.lines) out.push(`- ${l.label}: ${l.tonnes} t x ${l.intensity} tCO2e/t -> ${l.certificates} certificates, ${eur(l.cost)}`);
  out.push("");
  out.push(r.dates.certificateSales);
  out.push(r.dates.declaration);
  out.push("Estimate from illustrative or user-supplied figures. Not legal or customs advice.");
  return out.join("\n");
}

export function ladderCsv(r) {
  const rows = ["year,cbam_factor,estimated_cost_eur,cost_per_tonne_eur"];
  for (const l of r.ladder) rows.push(`${l.year},${l.factor},${l.cost},${l.perTonne}`);
  return rows.join("\n") + "\n";
}
