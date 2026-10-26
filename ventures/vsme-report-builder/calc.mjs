// VSME Basic Module report builder: engine. Pure functions, no network.
// Disclosure titles and the Basic Module's make-up (B1 to B11) follow EFRAG's
// VSME standard (December 2024) as described in secondary summaries; the
// standard's own text was not reachable when this was written, so datapoint
// wording is ours and the page tells the user to check it against the standard.

export const DISCLOSURES = {
  B1: "Basis for preparation",
  B2: "Practices, policies and future initiatives for transitioning towards a more sustainable economy",
  B3: "Energy and greenhouse gas emissions",
  B4: "Pollution of air, water and soil",
  B5: "Biodiversity",
  B6: "Water",
  B7: "Resource use, circular economy and waste management",
  B8: "Workforce: general characteristics",
  B9: "Workforce: health and safety",
  B10: "Workforce: remuneration, collective bargaining and training",
  B11: "Convictions and fines for corruption and bribery",
};

// Each field: id, disclosure, label, kind ("num" | "text" | "choice"), unit, and for choices the options.
export const FIELDS = [
  { id: "name", d: "B1", label: "Undertaking name", kind: "text" },
  { id: "year", d: "B1", label: "Reporting year", kind: "num", unit: "" },
  { id: "legalForm", d: "B1", label: "Legal form", kind: "text" },
  { id: "nace", d: "B1", label: "Sector (NACE code)", kind: "text" },
  { id: "country", d: "B1", label: "Country of main site", kind: "text" },
  { id: "turnover", d: "B1", label: "Turnover", kind: "num", unit: "EUR" },
  { id: "balanceSheet", d: "B1", label: "Balance sheet total", kind: "num", unit: "EUR" },
  { id: "scope", d: "B1", label: "Reported as", kind: "choice", options: ["individual", "consolidated"] },
  { id: "practices", d: "B2", label: "Sustainability practices, policies or targets you have (one line each)", kind: "text" },
  { id: "elecMWh", d: "B3", label: "Electricity purchased", kind: "num", unit: "MWh" },
  { id: "elecRenMWh", d: "B3", label: "of which renewable", kind: "num", unit: "MWh" },
  { id: "fuelMWh", d: "B3", label: "Fuels burned (gas, oil, vehicle fuel) in energy terms", kind: "num", unit: "MWh" },
  { id: "fuelRenMWh", d: "B3", label: "of which renewable", kind: "num", unit: "MWh" },
  { id: "scope1t", d: "B3", label: "Scope 1 emissions", kind: "num", unit: "tCO2e" },
  { id: "scope2t", d: "B3", label: "Scope 2 emissions (location-based)", kind: "num", unit: "tCO2e" },
  { id: "factorSource", d: "B3", label: "Where the emission factors came from", kind: "text" },
  { id: "pollution", d: "B4", label: "Pollutant releases to air, water or soil you report to an authority (or write 'none')", kind: "text" },
  { id: "bioSites", d: "B5", label: "Sites in or near biodiversity-sensitive areas", kind: "num", unit: "sites" },
  { id: "sealedHa", d: "B5", label: "Sealed (built or paved) land at your sites", kind: "num", unit: "ha" },
  { id: "waterM3", d: "B6", label: "Water withdrawn", kind: "num", unit: "m3" },
  { id: "wasteT", d: "B7", label: "Waste generated", kind: "num", unit: "t" },
  { id: "hazWasteT", d: "B7", label: "of which hazardous", kind: "num", unit: "t" },
  { id: "recycledT", d: "B7", label: "of which recycled or reused", kind: "num", unit: "t" },
  { id: "basis", d: "B8", label: "Count employees as", kind: "choice", options: ["headcount", "FTE"] },
  { id: "empTotal", d: "B8", label: "Employees, total", kind: "num", unit: "" },
  { id: "empPermanent", d: "B8", label: "Permanent", kind: "num", unit: "" },
  { id: "empTemporary", d: "B8", label: "Temporary", kind: "num", unit: "" },
  { id: "empMale", d: "B8", label: "Male", kind: "num", unit: "" },
  { id: "empFemale", d: "B8", label: "Female", kind: "num", unit: "" },
  { id: "empOther", d: "B8", label: "Other or not disclosed", kind: "num", unit: "" },
  { id: "accidents", d: "B9", label: "Recordable work-related accidents", kind: "num", unit: "" },
  { id: "fatalities", d: "B9", label: "Work-related fatalities", kind: "num", unit: "" },
  { id: "hoursWorked", d: "B9", label: "Hours worked by employees", kind: "num", unit: "h" },
  { id: "payMale", d: "B10", label: "Average gross hourly pay, men", kind: "num", unit: "EUR/h" },
  { id: "payFemale", d: "B10", label: "Average gross hourly pay, women", kind: "num", unit: "EUR/h" },
  { id: "bargainPct", d: "B10", label: "Employees covered by collective bargaining", kind: "num", unit: "%" },
  { id: "trainMaleH", d: "B10", label: "Training hours, men (total)", kind: "num", unit: "h" },
  { id: "trainFemaleH", d: "B10", label: "Training hours, women (total)", kind: "num", unit: "h" },
  { id: "convictions", d: "B11", label: "Convictions for corruption or bribery", kind: "num", unit: "" },
  { id: "fines", d: "B11", label: "Fines for corruption or bribery", kind: "num", unit: "EUR" },
];

const has = (v) => v !== undefined && v !== null && v !== "" && !(typeof v === "number" && Number.isNaN(v));
const n = (v) => (has(v) ? Number(v) : null);
const r = (x, d = 1) => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d);

/** Parse a form value: "1,234.5", "1 234,5" and "1.234,5" all read as numbers; blank stays null. */
export function parseNum(s) {
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  let t = String(s ?? "").trim().replace(/[\s ']/g, "");
  if (!t) return null;
  const lastC = t.lastIndexOf(","), lastD = t.lastIndexOf(".");
  if (lastC > -1 && lastD > -1) t = lastC > lastD ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (lastC > -1) t = /,\d{3}$/.test(t) && (t.match(/,/g) || []).length >= 1 && !/^0,/.test(t) ? t.replace(/,/g, "") : t.replace(",", ".");
  const x = Number(t);
  return Number.isFinite(x) ? x : null;
}

/** Which datapoints each disclosure needs before we call it complete. Optional ones never block. */
const REQUIRED = {
  B1: ["name", "year", "scope", "country"],
  B2: ["practices"],
  B3: ["elecMWh", "fuelMWh", "scope1t", "scope2t", "factorSource"],
  B4: ["pollution"],
  B5: ["bioSites"],
  B6: ["waterM3"],
  B7: ["wasteT"],
  B8: ["basis", "empTotal", "empPermanent", "empTemporary"],
  B9: ["accidents", "fatalities"],
  B10: ["bargainPct", "trainMaleH", "trainFemaleH"],
  B11: ["convictions", "fines"],
};

export function analyse(input) {
  const v = {};
  for (const f of FIELDS) v[f.id] = f.kind === "num" ? n(parseNum(input[f.id])) : has(input[f.id]) ? String(input[f.id]).trim() : null;
  const flags = [];
  const flag = (level, d, text) => flags.push({ level, d, text });

  // Completeness per disclosure.
  const status = {};
  for (const d of Object.keys(DISCLOSURES)) {
    const need = REQUIRED[d], miss = need.filter((id) => !has(v[id]));
    status[d] = { missing: miss, state: miss.length === 0 ? "complete" : miss.length === need.length ? "missing" : "partial" };
  }

  // B3
  const energy = v.elecMWh === null && v.fuelMWh === null ? null : (v.elecMWh ?? 0) + (v.fuelMWh ?? 0);
  const renew = v.elecRenMWh === null && v.fuelRenMWh === null ? null : (v.elecRenMWh ?? 0) + (v.fuelRenMWh ?? 0);
  if (v.elecRenMWh !== null && v.elecMWh !== null && v.elecRenMWh > v.elecMWh) flag("error", "B3", "Renewable electricity is larger than electricity purchased.");
  if (v.fuelRenMWh !== null && v.fuelMWh !== null && v.fuelRenMWh > v.fuelMWh) flag("error", "B3", "Renewable fuel energy is larger than fuel energy.");
  if (v.elecMWh > 0 && v.scope2t === null) flag("warn", "B3", "You buy electricity but entered no Scope 2 figure.");
  if (v.fuelMWh > 0 && v.scope1t === null) flag("warn", "B3", "You burn fuel but entered no Scope 1 figure.");
  if ((v.scope1t !== null || v.scope2t !== null) && v.factorSource === null) flag("warn", "B3", "Emissions entered without the source of the emission factors; a customer or bank will ask.");
  if (v.elecMWh > 0 && v.scope2t === 0) flag("warn", "B3", "Scope 2 of zero with purchased electricity: location-based Scope 2 is rarely zero.");
  const ghg = v.scope1t === null && v.scope2t === null ? null : (v.scope1t ?? 0) + (v.scope2t ?? 0);

  // B7
  if (v.hazWasteT !== null && v.wasteT !== null && v.hazWasteT > v.wasteT) flag("error", "B7", "Hazardous waste is larger than total waste.");
  if (v.recycledT !== null && v.wasteT !== null && v.recycledT > v.wasteT) flag("error", "B7", "Recycled waste is larger than total waste.");
  const recycledPct = v.recycledT !== null && v.wasteT > 0 ? (100 * v.recycledT) / v.wasteT : null;

  // B8
  const contract = v.empPermanent === null || v.empTemporary === null ? null : v.empPermanent + v.empTemporary;
  if (contract !== null && v.empTotal !== null && Math.abs(contract - v.empTotal) > 1e-9) flag("error", "B8", `Permanent plus temporary is ${contract}, not the total of ${v.empTotal}.`);
  const gender = v.empMale === null && v.empFemale === null && v.empOther === null ? null : (v.empMale ?? 0) + (v.empFemale ?? 0) + (v.empOther ?? 0);
  if (gender !== null && v.empTotal !== null && Math.abs(gender - v.empTotal) > 1e-9) flag("error", "B8", `Men, women and other add to ${gender}, not the total of ${v.empTotal}.`);
  if (v.empTotal !== null && v.basis === "headcount" && !Number.isInteger(v.empTotal)) flag("warn", "B8", "A headcount should be a whole number; did you mean FTE?");
  if (v.turnover !== null && v.balanceSheet !== null && v.empTotal !== null) {
    // Micro-undertaking = at most 2 of: 10 employees, EUR 450k balance sheet / turnover (EU Accounting Directive thresholds as amended 2023; check your national transposition).
    // Not computed here on purpose: the thresholds differ by member state, so we only show the inputs.
  }

  // B9
  if (v.accidents !== null && v.hoursWorked === null) flag("warn", "B9", "Hours worked are missing, so no accident rate can be shown.");
  if (v.hoursWorked !== null && v.empTotal !== null && v.empTotal > 0 && v.hoursWorked / v.empTotal > 3000) flag("warn", "B9", "More than 3,000 hours per employee: check the hours or the count basis.");
  const accidentRate = v.accidents !== null && v.hoursWorked > 0 ? (v.accidents * 1e6) / v.hoursWorked : null;

  // B10
  const payGap = v.payMale > 0 && v.payFemale !== null ? (100 * (v.payMale - v.payFemale)) / v.payMale : null;
  if ((v.payMale !== null) !== (v.payFemale !== null)) flag("warn", "B10", "Enter both average pay figures or neither.");
  if (v.bargainPct !== null && (v.bargainPct < 0 || v.bargainPct > 100)) flag("error", "B10", "Collective bargaining coverage must be between 0 and 100 %.");
  const trainPerM = v.trainMaleH !== null && v.empMale > 0 ? v.trainMaleH / v.empMale : null;
  const trainPerF = v.trainFemaleH !== null && v.empFemale > 0 ? v.trainFemaleH / v.empFemale : null;
  if ((v.trainMaleH !== null && !(v.empMale > 0)) || (v.trainFemaleH !== null && !(v.empFemale > 0))) flag("warn", "B10", "Training hours entered for a group with no employees in B8; the per-person average is not shown.");

  // B11
  if (v.fines > 0 && v.convictions === 0) flag("warn", "B11", "Fines entered with zero convictions; check both.");

  for (const [id, d] of Object.entries(v)) { void id; void d; }
  for (const f of FIELDS) if (f.kind === "num" && v[f.id] !== null && v[f.id] < 0) flag("error", f.d, `${f.label} is negative.`);

  const order = ["error", "warn"];
  flags.sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level) || a.d.localeCompare(b.d, "en", { numeric: true }));
  const counts = { complete: 0, partial: 0, missing: 0 };
  for (const s of Object.values(status)) counts[s.state]++;
  return {
    values: v, status, counts, flags,
    derived: {
      energyMWh: r(energy), renewableMWh: r(renew), renewableSharePct: energy > 0 && renew !== null ? r((100 * renew) / energy) : null,
      ghgT: r(ghg), recycledPct: r(recycledPct), accidentRatePerMillionH: r(accidentRate, 2),
      payGapPct: r(payGap), trainingHoursPerMan: r(trainPerM), trainingHoursPerWoman: r(trainPerF),
    },
  };
}

const show = (x, unit = "") => (x === null || x === undefined ? "not reported" : `${Number(x).toLocaleString("en-GB", { maximumFractionDigits: 2 })}${unit ? " " + unit : ""}`);

/** A draft Basic Module report as Markdown. Missing datapoints print as "not reported", never as zero. */
export function reportMarkdown(input) {
  const a = analyse(input), v = a.values, d = a.derived;
  const L = [];
  L.push(`# Sustainability report (VSME Basic Module, draft): ${v.name ?? "[undertaking]"}, ${v.year ?? "year not set"}`, "");
  L.push("Draft prepared with the VSME Report Builder. Check every figure and the wording against the EFRAG VSME standard before sending it to a customer, bank or investor. Not assurance, not advice.", "");
  const sec = (k, lines) => { L.push(`## ${k} ${DISCLOSURES[k]}`, ...lines.map((x) => `- ${x}`), ""); };
  sec("B1", [`Reporting year: ${v.year ?? "not reported"}`, `Basis: ${v.scope ?? "not reported"} (Basic Module)`, `Legal form: ${show(v.legalForm)}; sector (NACE): ${show(v.nace)}; country: ${show(v.country)}`, `Turnover: ${show(v.turnover, "EUR")}; balance sheet total: ${show(v.balanceSheet, "EUR")}; employees: ${show(v.empTotal)}`]);
  sec("B2", [v.practices ? v.practices.split(/\n|;/).map((s) => s.trim()).filter(Boolean).join("; ") : "not reported"]);
  sec("B3", [`Electricity: ${show(v.elecMWh, "MWh")} (renewable ${show(v.elecRenMWh, "MWh")})`, `Fuels: ${show(v.fuelMWh, "MWh")} (renewable ${show(v.fuelRenMWh, "MWh")})`, `Total energy: ${show(d.energyMWh, "MWh")}; renewable share: ${show(d.renewableSharePct, "%")}`, `Scope 1: ${show(v.scope1t, "tCO2e")}; Scope 2 (location-based): ${show(v.scope2t, "tCO2e")}; total: ${show(d.ghgT, "tCO2e")}`, `Emission factor source: ${show(v.factorSource)}`]);
  sec("B4", [`Releases reported to authorities: ${show(v.pollution)}`]);
  sec("B5", [`Sites in or near biodiversity-sensitive areas: ${show(v.bioSites)}`, `Sealed land: ${show(v.sealedHa, "ha")}`]);
  sec("B6", [`Water withdrawn: ${show(v.waterM3, "m3")}`]);
  sec("B7", [`Waste generated: ${show(v.wasteT, "t")}; hazardous: ${show(v.hazWasteT, "t")}; recycled or reused: ${show(v.recycledT, "t")} (${show(d.recycledPct, "%")})`]);
  sec("B8", [`Counted as ${v.basis ?? "not reported"}: total ${show(v.empTotal)}; permanent ${show(v.empPermanent)}, temporary ${show(v.empTemporary)}`, `Men ${show(v.empMale)}, women ${show(v.empFemale)}, other or not disclosed ${show(v.empOther)}`]);
  sec("B9", [`Recordable accidents: ${show(v.accidents)}; fatalities: ${show(v.fatalities)}`, `Hours worked: ${show(v.hoursWorked, "h")}; accidents per million hours: ${show(d.accidentRatePerMillionH)} (our convention; confirm the standard's rate definition)`]);
  sec("B10", [`Gender pay gap: ${show(d.payGapPct, "%")} (average gross hourly pay, men minus women, as a share of men)`, `Collective bargaining coverage: ${show(v.bargainPct, "%")}`, `Training hours per person: men ${show(d.trainingHoursPerMan, "h")}, women ${show(d.trainingHoursPerWoman, "h")}`]);
  sec("B11", [`Convictions: ${show(v.convictions)}; fines: ${show(v.fines, "EUR")}`]);
  if (a.flags.length) { L.push("## Open points", ...a.flags.map((f) => `- [${f.level}] ${f.d}: ${f.text}`), ""); }
  const miss = Object.entries(a.status).filter(([, s]) => s.missing.length);
  if (miss.length) { L.push("## Not yet reported", ...miss.map(([k, s]) => `- ${k}: ${s.missing.map((id) => FIELDS.find((f) => f.id === id).label).join("; ")}`), ""); }
  return L.join("\n");
}

export const EXAMPLE = {
  name: "Example Metalworks GmbH", year: 2025, legalForm: "GmbH", nace: "C25.62", country: "Germany", turnover: 4200000, balanceSheet: 1900000, scope: "individual",
  practices: "Waste separation at both sites; supplier code of conduct; LED retrofit planned 2026",
  elecMWh: 180, elecRenMWh: 45, fuelMWh: 310, fuelRenMWh: 0, scope1t: 62, scope2t: 70, factorSource: "Example figures: replace with your own factors and say where they are from",
  pollution: "none", bioSites: 0, sealedHa: 0.8, waterM3: 950, wasteT: 38, hazWasteT: 4, recycledT: 27,
  basis: "headcount", empTotal: 34, empPermanent: 31, empTemporary: 3, empMale: 26, empFemale: 8, empOther: 0,
  accidents: 2, fatalities: 0, hoursWorked: 54000, payMale: 24.5, payFemale: 22.1, bargainPct: 0, trainMaleH: 130, trainFemaleH: 60, convictions: 0, fines: 0,
};
