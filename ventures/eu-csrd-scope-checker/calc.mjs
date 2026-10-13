// EU CSRD scope check (Directive (EU) 2022/2464 as amended by the 2025-26 "Omnibus" changes):
// is a company in scope of mandatory sustainability reporting, from which financial year,
// and does it land in the voluntary-standard (VSME) / value-chain squeeze instead.
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. The Omnibus thresholds
// below were agreed in late 2025 but transposition into national law varies by Member State
// and dates moved more than once: every result names a source to verify and shows the
// ORIGINAL-CSRD reading beside the OMNIBUS reading so a change in the law is visible.

export const VERIFY = "Directive (EU) 2022/2464 (CSRD), the 'stop-the-clock' Directive (EU) 2025/794, the Omnibus amending Directive and your Member State's transposition law; ESRS and the Commission's VSME recommendation";

export const OMNIBUS = { employees: 1000, turnover: 450_000_000, nonEuTurnover: 450_000_000, nonEuSubTurnover: 200_000_000 };
export const ORIGINAL = { employees: 250, turnover: 50_000_000, assets: 25_000_000, listedSmeEmployees: 10 };

export const ENTITY_TYPES = [
  { id: "eu-company", label: "EU company (limited liability)" },
  { id: "eu-listed", label: "EU company listed on an EU regulated market" },
  { id: "non-eu-group", label: "Non-EU group with EU activity" },
];

const NUM = ["employees", "turnover", "assets", "euTurnover", "euSubTurnover"];

export function parse(input) {
  const i = input || {};
  const errors = [];
  const type = ENTITY_TYPES.find((t) => t.id === i.type);
  if (!type) errors.push("Choose the type of company.");
  const n = {};
  for (const k of NUM) {
    const raw = i[k] === undefined || i[k] === "" || i[k] === null ? 0 : Number(i[k]);
    if (!Number.isFinite(raw) || raw < 0) { errors.push(`Enter a number of zero or more for ${k}.`); n[k] = 0; } else n[k] = raw;
  }
  const yn = (v) => v === true || v === "yes";
  return { errors, type: type ? type.id : "", n, reportedNfrd: yn(i.reportedNfrd), financial: yn(i.financial) };
}

// FY in which the first report is due under each regime (reported in the year after).
export function originalWave(p) {
  const { employees, turnover, assets } = p.n;
  const large = [employees > ORIGINAL.employees, turnover > ORIGINAL.turnover, assets > ORIGINAL.assets].filter(Boolean).length >= 2;
  if (p.type === "eu-listed" && employees > 500 && p.reportedNfrd) return { wave: 1, fy: 2024, note: "already reporting under the old NFRD" };
  if (large) return { wave: 2, fy: 2025, note: "large undertaking (two of: >250 staff, >EUR 50M turnover, >EUR 25M assets)" };
  if (p.type === "eu-listed" && employees >= ORIGINAL.listedSmeEmployees) return { wave: 3, fy: 2026, note: "listed small or medium-sized company" };
  return null;
}

export function omnibusWave(p) {
  const { employees, turnover, euTurnover, euSubTurnover } = p.n;
  if (p.type === "non-eu-group") {
    return euTurnover > OMNIBUS.nonEuTurnover && euSubTurnover > OMNIBUS.nonEuSubTurnover ? { fy: 2028, note: "non-EU group: more than EUR 450M EU turnover and an EU subsidiary or branch above EUR 200M" } : null;
  }
  if (employees > OMNIBUS.employees && turnover > OMNIBUS.turnover) {
    return p.reportedNfrd ? { fy: 2024, note: "already reporting: stays in, delayed for those whose first report moves to FY2027 under the stop-the-clock" } : { fy: 2027, note: "more than 1,000 employees and more than EUR 450M net turnover" };
  }
  return null;
}

export const fmt = (v) => `EUR ${Math.round(v).toLocaleString("en-GB")}`;

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const findings = [];
  const orig = p.type === "non-eu-group" ? null : originalWave(p);
  const omni = omnibusWave(p);

  if (omni) {
    findings.push({ severity: "high", title: `Likely in scope under the Omnibus thresholds: ${omni.note}. First report for the financial year starting in ${omni.fy} (reported in ${omni.fy + 1}), if the Omnibus is transposed as agreed.` });
    findings.push({ severity: "medium", title: "Start now: double-materiality assessment, data-point gap analysis against the simplified ESRS, and an assurance plan (limited assurance first). These take longer than the reporting window." });
  } else if (orig) {
    findings.push({ severity: "medium", title: `Probably out of mandatory scope under the Omnibus thresholds, but you would have been in scope under the original CSRD (${orig.note}). Check your Member State: some transposed the original text early, and national law applies until it is amended.` });
  } else {
    findings.push({ severity: "info", title: "Not in mandatory scope under either the original CSRD or the Omnibus thresholds on these figures." });
  }

  if (!omni) {
    findings.push({ severity: "medium", title: "Trickle-down: large customers, banks and investors in scope will still ask for sustainability data. The Commission's voluntary standard for non-listed SMEs (VSME) is the format Omnibus makes the ceiling on what they may request from you. Prepare a VSME-style data set instead of answering each questionnaire from scratch." });
  }
  if (p.financial) {
    findings.push({ severity: "medium", title: "Banks and insurers: the CSRD feeds your Pillar 3 ESG disclosures, SFDR and green asset ratio. Scope thresholds are the same, but your clients' reporting drives data requests to you." });
  }
  if (p.type === "non-eu-group") {
    findings.push({ severity: "info", title: "Non-EU groups report on group level through the EU subsidiary or branch, using the EU-specific standards, and the thresholds look at EU turnover. Check both the group and the EU entity." });
  }
  findings.push({ severity: "info", title: `Original CSRD reading: ${orig ? `FY${orig.fy} (wave ${orig.wave}: ${orig.note})` : "not in scope"}. Omnibus reading: ${omni ? `FY${omni.fy}` : "not in scope"}. The difference is the part still moving: confirm the current text and your country's law.` });

  return { errors: [], input: p, original: orig, omnibus: omni, findings };
}

export const SAMPLE = { type: "eu-company", employees: 620, turnover: 180_000_000, assets: 90_000_000, euTurnover: 0, euSubTurnover: 0, reportedNfrd: "no", financial: "no" };

export function summaryText(r) {
  return [
    "EU CSRD scope check (first read, not legal advice)",
    `Omnibus thresholds: ${r.omnibus ? `likely in scope, first FY${r.omnibus.fy}` : "not in scope"}`,
    `Original CSRD thresholds: ${r.original ? `would be in scope, FY${r.original.fy}` : "not in scope"}`,
    ...r.findings.map((f) => `- ${f.title}`),
    `Verify against: ${VERIFY}`,
    "",
    "Confirm with your auditor or a sustainability-reporting adviser.",
  ].join("\n");
}
