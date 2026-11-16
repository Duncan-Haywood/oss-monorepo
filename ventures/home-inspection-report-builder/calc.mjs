// Home inspection report builder: pure functions, no dependencies, nothing leaves the browser.
// The library holds neutral, generic observation wording a professional inspector edits and owns.
// It does not cite or apply any standard of practice, code, or licensing rule.

export const SEVERITIES = [
  { id: "safety", label: "Safety hazard", rank: 0 },
  { id: "major", label: "Major defect", rank: 1 },
  { id: "minor", label: "Minor / maintenance", rank: 2 },
  { id: "info", label: "For your information", rank: 3 },
];

export const SYSTEMS = ["Roof", "Exterior", "Structure", "Electrical", "Plumbing", "Heating", "Cooling", "Interior", "Attic and insulation", "Garage"];

const L = (id, system, title, severity, text, recommend) => ({ id, system, title, severity, text, recommend });
export const LIBRARY = [
  L("roof-worn", "Roof", "Shingles worn near end of life", "major", "Roof covering shows granule loss, curling or cracking consistent with advanced age.", "Have a qualified roofer evaluate and give a replacement estimate."),
  L("roof-flashing", "Roof", "Flashing damaged or missing", "major", "Flashing at a roof penetration or wall junction was loose, damaged or absent, which can allow water entry.", "Have a qualified roofer repair or replace the flashing."),
  L("roof-debris", "Roof", "Debris on roof", "minor", "Leaves or debris were present on the roof surface or in valleys and can hold moisture.", "Clear debris and keep valleys clean."),
  L("ext-gutter", "Exterior", "Gutters clogged or detached", "minor", "Gutters or downspouts were clogged, loose or discharging next to the foundation.", "Clean, secure and extend downspouts away from the foundation."),
  L("ext-grade", "Exterior", "Soil slopes toward the house", "major", "Grade near the foundation slopes toward the structure, which can direct water against it.", "Regrade so the soil slopes away from the foundation."),
  L("ext-caulk", "Exterior", "Failed caulk or sealant", "minor", "Sealant around windows, doors or siding joints was cracked or missing.", "Re-seal as part of routine maintenance."),
  L("ext-rot", "Exterior", "Wood rot at trim or siding", "major", "Soft or decayed wood was found at exterior trim, siding or decking.", "Have a qualified contractor repair and identify the moisture source."),
  L("str-crack", "Structure", "Foundation crack", "major", "A crack was observed in the foundation. Its width, direction and any displacement should be monitored.", "Have a structural engineer evaluate if the crack is wider than a hairline or growing."),
  L("str-moisture", "Structure", "Evidence of moisture in crawlspace or basement", "major", "Staining, efflorescence or damp materials were observed, indicating past or present moisture.", "Identify and correct the source; consider an evaluation by a waterproofing specialist."),
  L("elec-gfci", "Electrical", "No GFCI protection where expected", "safety", "Receptacles near water (kitchen, baths, exterior, garage) did not trip a GFCI test or lacked GFCI protection.", "Have a licensed electrician install or repair GFCI protection."),
  L("elec-panel", "Electrical", "Panel: double-tapped or loose conductors", "safety", "More than one conductor was connected to a breaker intended for one, or connections were loose.", "Have a licensed electrician correct and inspect the panel."),
  L("elec-open", "Electrical", "Open junction box or exposed wiring", "safety", "A junction box lacked a cover or wiring was exposed.", "Have a licensed electrician correct."),
  L("elec-smoke", "Electrical", "Smoke or CO alarms missing or untested", "safety", "Smoke or carbon monoxide alarms were missing in expected locations or did not respond to testing.", "Install or replace alarms and test them regularly."),
  L("plumb-leak", "Plumbing", "Active leak", "major", "Moisture was observed at a fixture, supply or drain connection.", "Have a licensed plumber repair."),
  L("plumb-pressure", "Plumbing", "Low water pressure at a fixture", "minor", "Flow at a fixture was weak, possibly from a clogged aerator, valve or supply line.", "Clean the aerator; if unresolved, have a plumber evaluate."),
  L("plumb-wh-age", "Plumbing", "Water heater at or beyond typical service life", "minor", "The data plate indicates the water heater is at or beyond its typical service life.", "Budget for replacement."),
  L("plumb-tpr", "Plumbing", "Water heater relief valve discharge pipe missing or improper", "safety", "The temperature/pressure relief valve discharge pipe was missing or terminated improperly.", "Have a licensed plumber correct."),
  L("heat-filter", "Heating", "Dirty filter", "minor", "The furnace or air handler filter was dirty and restricts airflow.", "Replace filter and keep to a regular schedule."),
  L("heat-service", "Heating", "No evidence of recent servicing", "info", "No label or record of recent servicing was found on the heating equipment.", "Ask the seller for service records; consider a service visit."),
  L("heat-flue", "Heating", "Flue or vent corrosion or improper slope", "safety", "A vent connector showed corrosion, separation or improper slope.", "Have a qualified HVAC contractor evaluate and repair."),
  L("cool-condensate", "Cooling", "Condensate drain clogged or discharging poorly", "minor", "The condensate drain was clogged or terminated where water can damage materials.", "Clear the line and direct discharge away from the structure."),
  L("cool-delta", "Cooling", "Temperature split outside the typical range", "major", "The temperature difference across the evaporator coil was outside the range typically expected.", "Have a qualified HVAC contractor evaluate."),
  L("int-stain", "Interior", "Ceiling or wall stain", "major", "Staining was observed on a ceiling or wall, which can indicate a past or present leak.", "Identify the source and repair; monitor the stain."),
  L("int-window", "Interior", "Window does not open, close or latch", "minor", "A window did not operate or latch properly.", "Repair or adjust."),
  L("int-door", "Interior", "Door rubs, sticks or does not latch", "minor", "A door did not close or latch properly.", "Adjust or repair hardware."),
  L("att-insul", "Attic and insulation", "Insulation depth appears low or uneven", "info", "Attic insulation appeared thin or uneven in places.", "Consider adding insulation to improve efficiency."),
  L("att-vent", "Attic and insulation", "Bath or kitchen fan vented into the attic", "major", "An exhaust duct terminated in the attic rather than outdoors, which can cause moisture damage.", "Route the duct to the exterior."),
  L("att-pest", "Attic and insulation", "Signs of pests", "major", "Droppings, nesting or chewed material consistent with pest activity were seen.", "Have a pest control professional evaluate and seal entry points."),
  L("gar-door", "Garage", "Garage door auto-reverse not responding", "safety", "The automatic reverse feature did not respond properly when the door met resistance or the sensor was blocked.", "Have a garage door technician adjust or repair."),
  L("gar-firedoor", "Garage", "Door to living space does not self-close or latch", "safety", "The door between the garage and living area did not close and latch on its own.", "Install or adjust a closer and latch."),
];

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function num(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  // Plain decimals only: Number() would also read "0x10" as 16 and "1e3" as 1000.
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function money(n) {
  const v = Math.round(Number.isFinite(n) ? n : 0);
  return ((t) => (v < 0 && /[1-9∞]/.test(t) ? "-$" : "$") + t)(Math.abs(v).toLocaleString("en-US"));
}

const sevRank = (id) => (SEVERITIES.find((s) => s.id === id) || { rank: 3 }).rank;
export const sevLabel = (id) => (SEVERITIES.find((s) => s.id === id) || SEVERITIES[3]).label;

let counter = 0;
export function newFinding(libId, overrides = {}) {
  const lib = LIBRARY.find((l) => l.id === libId);
  const base = lib
    ? { libId: lib.id, system: lib.system, title: lib.title, severity: lib.severity, text: lib.text, recommend: lib.recommend }
    : { libId: null, system: SYSTEMS[0], title: "", severity: "minor", text: "", recommend: "" };
  return { id: "f" + Date.now().toString(36) + (counter++).toString(36), note: "", costLow: 0, costHigh: 0, ...base, ...overrides };
}

// Clean one finding. A severity matching an id or label in any case is kept; an unknown one falls
// to "info" and, like a cost that is not a plain non-negative number, is reported in `issues`
// (when given) so a corrupt or hand-edited saved file never downgrades an item silently.
// Blank or zero costs mean "no figure" and are not reported. When only one cost is usable it is
// used for both ends, so a bad high figure never turns "$300" into "$0 to $300".
export function normalise(f, issues) {
  // Only a real list collects issues: findings.map(normalise) would pass the array index here.
  const note = (msg) => { if (Array.isArray(issues)) issues.push(`"${String(f.title || "untitled").trim() || "untitled"}": ${msg}`); };
  const raw = String(f.severity ?? "").trim().toLowerCase();
  const known = SEVERITIES.find((s) => s.id === raw || s.label.toLowerCase() === raw);
  const sev = known ? known.id : "info";
  if (!known) note(`severity "${String(f.severity ?? "")}" is not one of ${SEVERITIES.map((s) => s.id).join(", ")}; set to "info", please check it`);
  const cost = (v, label) => {
    if (v === undefined || v === null || String(v).trim() === "") return null;
    const n = num(v);
    if (Number.isFinite(n) && n >= 0) return n > 0 ? n : null;
    note(`${label} cost "${String(v)}" is not a non-negative number; ignored`);
    return null;
  };
  let lo = cost(f.costLow, "low"), hi = cost(f.costHigh, "high");
  if (lo === null && hi !== null) lo = hi;
  if (hi === null && lo !== null) hi = lo;
  lo ??= 0; hi ??= 0;
  if (hi < lo) [lo, hi] = [hi, lo];
  return { ...f, severity: sev, system: String(f.system || ""), title: String(f.title || "").trim(), text: String(f.text || ""), recommend: String(f.recommend || ""), note: String(f.note || ""), costLow: lo, costHigh: hi };
}

export function summarize(findings) {
  const list = findings.map((f) => normalise(f)).filter((f) => f.title);
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s.id, 0]));
  for (const f of list) counts[f.severity]++;
  const sorted = [...list].sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || SYSTEMS.indexOf(a.system) - SYSTEMS.indexOf(b.system));
  const bySystem = SYSTEMS.map((s) => ({ system: s, items: list.filter((f) => f.system === s).sort((a, b) => sevRank(a.severity) - sevRank(b.severity)) }))
    .concat([{ system: "Other", items: list.filter((f) => !SYSTEMS.includes(f.system)) }])
    .filter((g) => g.items.length);
  return {
    total: list.length,
    counts,
    sorted,
    bySystem,
    // Safety and major items across every system, safety first: the list the report opens with.
    priority: sorted.filter((f) => f.severity === "safety" || f.severity === "major"),
    priorityCount: sorted.filter((f) => f.severity === "safety" || f.severity === "major").length,
    costLow: list.reduce((a, f) => a + f.costLow, 0),
    costHigh: list.reduce((a, f) => a + f.costHigh, 0),
    hasCosts: list.some((f) => f.costHigh > 0),
  };
}

// Header fields every saved file and report carries. scope and notInspected are free text the
// inspector writes: what the inspection covered and what was not inspected or was restricted, and why.
export const HEADER_FIELDS = ["property", "client", "date", "inspector", "license", "scope", "notInspected"];
const LIMITS_NOTE = "Limitations are set by the inspector's agreement and standards of practice. This document was drafted with a free template tool and the inspector is responsible for every statement in it.";
const NOT_INSPECTED_BLANK = "None recorded by the inspector.";

export function toText(header, findings) {
  const s = summarize(findings);
  const out = [];
  out.push(`HOME INSPECTION REPORT`);
  for (const [k, l] of [["property", "Property"], ["client", "Client"], ["date", "Inspection date"], ["inspector", "Inspector"], ["license", "License / ID"]]) if (header[k]) out.push(`${l}: ${header[k]}`);
  out.push("", `SUMMARY: ${s.total} finding(s) - ` + SEVERITIES.map((v) => `${s.counts[v.id]} ${v.label.toLowerCase()}`).join(", "));
  if (s.hasCosts) out.push(`Inspector's repair cost range, as entered: ${money(s.costLow)} to ${money(s.costHigh)}`);
  out.push("", "NOT INSPECTED OR RESTRICTED", String(header.notInspected || "").trim() || NOT_INSPECTED_BLANK);
  if (String(header.scope || "").trim()) out.push("", "SCOPE AND LIMITATIONS", String(header.scope).trim());
  if (s.priority.length) {
    out.push("", "SAFETY AND MAJOR ITEMS (details under each system below)");
    for (const f of s.priority) out.push(`- [${sevLabel(f.severity)}] ${f.title} (${f.system || "Other"})`);
  }
  for (const g of s.bySystem) {
    out.push("", g.system.toUpperCase());
    for (const f of g.items) {
      out.push(`- [${sevLabel(f.severity)}] ${f.title}`);
      if (f.text) out.push(`  ${f.text}`);
      if (f.note) out.push(`  Notes: ${f.note}`);
      if (f.recommend) out.push(`  Recommendation: ${f.recommend}`);
      if (f.costHigh > 0) out.push(`  Estimated cost (inspector's figure): ${money(f.costLow)} to ${money(f.costHigh)}`);
    }
  }
  out.push("", LIMITS_NOTE);
  return out.join("\n");
}

export function toHtml(header, findings) {
  const s = summarize(findings);
  const meta = [["property", "Property"], ["client", "Client"], ["date", "Inspection date"], ["inspector", "Inspector"], ["license", "License / ID"]]
    .filter(([k]) => header[k]).map(([k, l]) => `<tr><th>${l}</th><td>${esc(header[k])}</td></tr>`).join("");
  let h = `<h2>Home inspection report</h2><table class="meta">${meta}</table>`;
  h += `<p><strong>${s.total}</strong> finding(s): ` + SEVERITIES.map((v) => `${s.counts[v.id]} ${esc(v.label.toLowerCase())}`).join(", ") + ".</p>";
  if (s.hasCosts) h += `<p>Inspector's repair cost range, as entered: <strong>${money(s.costLow)} to ${money(s.costHigh)}</strong></p>`;
  const multi = (t) => esc(String(t).trim()).replace(/\n/g, "<br>");
  h += `<h3>Not inspected or restricted</h3><p>${multi(header.notInspected || "") || NOT_INSPECTED_BLANK}</p>`;
  if (String(header.scope || "").trim()) h += `<h3>Scope and limitations</h3><p>${multi(header.scope)}</p>`;
  if (s.priority.length) {
    h += `<h3>Safety and major items</h3><p>Details under each system below.</p><ul class="priority">` +
      s.priority.map((f) => `<li><span class="pill">${esc(sevLabel(f.severity))}</span> ${esc(f.title)} (${esc(f.system || "Other")})</li>`).join("") + `</ul>`;
  }
  for (const g of s.bySystem) {
    h += `<h3>${esc(g.system)}</h3>`;
    for (const f of g.items) {
      h += `<div class="item sev-${f.severity}"><p><span class="pill">${esc(sevLabel(f.severity))}</span> <strong>${esc(f.title)}</strong></p>`;
      if (f.text) h += `<p>${esc(f.text)}</p>`;
      if (f.note) h += `<p><em>Notes:</em> ${esc(f.note)}</p>`;
      if (f.recommend) h += `<p><em>Recommendation:</em> ${esc(f.recommend)}</p>`;
      if (f.costHigh > 0) h += `<p><em>Estimated cost (inspector's figure):</em> ${money(f.costLow)} to ${money(f.costHigh)}</p>`;
      h += `</div>`;
    }
  }
  h += `<p class="note">${esc(LIMITS_NOTE)}</p>`;
  return h;
}

// Save/load as a plain JSON file the user keeps; nothing is stored by the page itself.
export function exportJson(header, findings) {
  return JSON.stringify({ app: "home-inspection-report-builder", version: 1, header, findings }, null, 2);
}

export function parseImport(text) {
  let d;
  try { d = JSON.parse(text); } catch { return { error: "That file is not valid JSON." }; }
  if (!d || d.app !== "home-inspection-report-builder" || !Array.isArray(d.findings)) return { error: "That file was not saved by this tool." };
  const header = {};
  for (const k of HEADER_FIELDS) header[k] = typeof d.header?.[k] === "string" ? d.header[k] : "";
  const warnings = [];
  const objs = d.findings.filter((f) => f && typeof f === "object");
  if (objs.length > 500) warnings.push(`The file holds ${objs.length} findings; only the first 500 were loaded.`);
  const findings = objs.slice(0, 500).map((f) => normalise({ id: "f" + Date.now().toString(36) + (counter++).toString(36), ...f }, warnings));
  return { header, findings, warnings };
}
