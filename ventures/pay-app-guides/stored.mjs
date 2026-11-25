// Stored materials rollforward: what is still stored at the end of a pay period, what moved into
// work completed, and the schedule-of-values columns that result. Pure functions, no I/O.
// Money is integer cents.
//
// Per line:
//   stored now          = stored on the last pay app + delivered this period - installed this period
//   this period (col E) = installed from stored + other work this period
//   previous   (col D)  = work completed on previous pay apps (stored materials are not in it)
//   stored     (col F)  = stored now
// Installed material leaves column F and enters column E in the same period, so it is billed once.

// csvCell (colog.mjs) is the formula-injection guard: a cell starting =, +, -, @, tab or CR gets an apostrophe.
import { parseCsv, parseMoney, dollars, csvCell } from "./colog.mjs";

const HEADERS = {
  item: /^(item|item no\.?|item #|no\.?|#|line|line item)$/,
  desc: /^(description|desc|description of work|scope|material)$/,
  scheduled: /^(scheduled value|scheduled|value|sov value|contract value|budget)$/,
  previous: /^(previous|previous work|from previous|from previous application|work previous|work completed previous|completed previous|previous applications)$/,
  storedLast: /^(stored last|stored last app|stored previous|previously stored|stored on last app|stored last period|stored)$/,
  delivered: /^(delivered|delivered this period|received|received this period|purchased|purchased this period|new stored)$/,
  installed: /^(installed|installed this period|installed from stored|used|used this period)$/,
  otherWork: /^(other work|other work this period|labor|labour|work this period|this period)$/,
  location: /^(location|where|stored at|site)$/,
  documented: /^(documented|docs|documentation|title|bill of sale|backup)$/,
};

const OFFSITE = /^(off[- ]?site|offsite|warehouse|bonded warehouse|yard|shop|fabricator|vendor|supplier)$/i;
const ONSITE = /^(on[- ]?site|onsite|site|job ?site|on site|)$/i;
const YES = /^(y|yes|true|1|x|done|ok|on file)$/i;

function mapHeaders(row) {
  const idx = {};
  row.forEach((h, i) => {
    const t = String(h).trim().toLowerCase().replace(/\s+/g, " ");
    for (const [k, re] of Object.entries(HEADERS)) if (idx[k] == null && re.test(t)) { idx[k] = i; break; }
  });
  return idx;
}

const pct = (s, fallback) => {
  const t = String(s ?? "").trim().replace(/%$/, "");
  if (t === "") return fallback;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) / 100 : null;
};

/**
 * @param {string} text CSV or tab-separated, one schedule-of-values line per row, with a header row
 * @param {{workRetainage?: string, storedRetainage?: string, offsiteAllowed?: boolean}} settings
 */
export function compute(text, settings = {}) {
  const out = { lines: [], errors: [], findings: [], totals: null };
  const grid = parseCsv(text);
  if (grid.length < 2) { out.errors.push("Paste a header row and at least one line."); return out; }
  const idx = mapHeaders(grid[0]);
  for (const [k, name] of [["scheduled", "Scheduled value"], ["installed", "Installed"]]) {
    if (idx[k] == null) { out.errors.push(`No ${name.toLowerCase()} column. Name a column '${name}'.`); return out; }
  }
  if (idx.storedLast == null && idx.delivered == null) { out.errors.push("No stored materials columns. Name them 'Stored last app' and 'Delivered'."); return out; }
  const workRate = pct(settings.workRetainage, 0.1);
  const storedRate = pct(settings.storedRetainage, workRate);
  if (workRate == null || workRate > 1 || storedRate == null || storedRate > 1) { out.errors.push("Retainage rates must be percentages from 0 to 100."); return out; }

  for (let r = 1; r < grid.length; r++) {
    const row = grid[r], get = (k) => (idx[k] == null ? "" : String(row[idx[k]] ?? "").trim());
    const item = get("item"), desc = get("desc");
    const label = item ? `Item ${item}${desc ? ` (${desc})` : ""}` : desc || `Row ${r + 1}`;
    const m = {};
    let bad = false;
    for (const k of ["scheduled", "previous", "storedLast", "delivered", "installed", "otherWork"]) {
      m[k] = parseMoney(get(k));
      if (m[k] == null) { out.errors.push(`Row ${r + 1} (${label}): ${k === "storedLast" ? "stored last app" : k === "otherWork" ? "other work" : k} is not a dollar figure.`); bad = true; break; }
      if (k !== "scheduled" && k !== "otherWork" && m[k] < 0) { out.errors.push(`Row ${r + 1} (${label}): ${k === "storedLast" ? "stored last app" : k} cannot be negative.`); bad = true; break; }
    }
    if (bad) continue;
    const loc = get("location");
    const offsite = OFFSITE.test(loc);
    if (!offsite && !ONSITE.test(loc)) { out.errors.push(`Row ${r + 1} (${label}): location "${loc}" should be on site or off site.`); continue; }
    const documented = YES.test(get("documented"));
    const available = m.storedLast + m.delivered;
    const storedNow = available - m.installed;
    const E = m.installed + m.otherWork;
    const G = m.previous + E + Math.max(storedNow, 0);
    out.lines.push({ row: r + 1, item, desc, label, ...m, available, storedNow, E, G, offsite, documented, documentedGiven: idx.documented != null });
  }
  if (out.errors.length) return out;
  if (!out.lines.length) { out.errors.push("No lines found."); return out; }

  const sum = (k, f = () => true) => out.lines.filter(f).reduce((a, x) => a + x[k], 0);
  const t = {
    storedLast: sum("storedLast"), delivered: sum("delivered"), installed: sum("installed"),
    storedNow: sum("storedNow"), storedOnsite: sum("storedNow", (x) => !x.offsite), storedOffsite: sum("storedNow", (x) => x.offsite),
    otherWork: sum("otherWork"), thisPeriod: sum("E"), scheduled: sum("scheduled"), completedStored: sum("G"),
    workRate, storedRate,
  };
  // Change in what is billed for stored materials this period: the stored column goes up by deliveries and down by installs.
  t.storedChange = t.storedNow - t.storedLast;
  t.retainageOnStored = out.lines.reduce((a, x) => a + Math.round(Math.max(x.storedNow, 0) * storedRate), 0);
  out.totals = t;

  const F = (severity, title) => out.findings.push({ severity, title });
  for (const x of out.lines) {
    if (x.storedNow < 0) F("high", `${x.label}: ${dollars(x.installed)} installed from stock, but only ${dollars(x.available)} was stored or delivered. Material bought and installed in the same month goes in both "Delivered" and "Installed", or straight into "Other work"; otherwise it is billed twice or not at all.`);
    if (x.G > x.scheduled && x.scheduled >= 0) F("high", `${x.label}: work completed plus stored (${dollars(x.G)}) is more than the scheduled value (${dollars(x.scheduled)}). Stored material counts against the line's value; bill the excess under a change order, not as stored.`);
    if (x.offsite && x.storedNow > 0 && !settings.offsiteAllowed) F("high", `${x.label}: ${dollars(x.storedNow)} stored off site. Many contracts pay for off-site material only when the contract says so (the federal clause, FAR 52.232-5(b)(2), requires that it be "specifically authorized by this contract"). Tick "contract allows off-site" if yours does.`);
    if (x.offsite && x.storedNow > 0 && x.documentedGiven && !x.documented) F("high", `${x.label}: off-site material with no documentation marked. Expect to be asked for evidence of title (a paid invoice or bill of sale), insurance and where it is kept before it is paid.`);
    if (!x.offsite && x.storedNow > 0 && x.documentedGiven && !x.documented) F("info", `${x.label}: stored on site with no documentation marked. Keep the delivery ticket, invoice and a dated photo with the pay app backup.`);
    if (x.storedLast > 0 && x.installed === 0 && x.delivered === 0) F("info", `${x.label}: ${dollars(x.storedLast)} stored last period and none installed this period. Material that sits for months draws questions from the reviewer; note when it will be installed.`);
    if (x.storedNow > 0 && x.scheduled > 0 && x.previous + x.E === 0 && x.storedNow * 2 > x.scheduled) F("info", `${x.label}: stored material is ${((x.storedNow * 100) / x.scheduled).toFixed(0)}% of the line and no work is billed yet. Reviewers check that the line's value covers labour as well as material; split material and labour into separate lines if the SOV allows.`);
  }
  if (t.storedRate !== t.workRate) F("info", `Retainage on stored materials is ${(t.storedRate * 100).toFixed(1)}% and on work ${(t.workRate * 100).toFixed(1)}%. When stored material is installed it moves to the work rate; check that is what your contract says.`);
  out.findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
  return out;
}

const cents = (c) => (c / 100).toFixed(2);

// The lines as the pay application calculator (calc.mjs compute) and the pay application generator read them.
export function sovLines(result) {
  return result.lines.map((x) => ({ item: x.item, description: x.desc, scheduled: cents(x.scheduled), previous: cents(x.previous), thisPeriod: cents(x.E), stored: cents(Math.max(x.storedNow, 0)) }));
}

export function sovCsv(result) {
  const head = "Item,Description,Scheduled value,Previous,This period,Stored";
  const rows = sovLines(result).map((l) => [l.item, l.description, l.scheduled, l.previous, l.thisPeriod, l.stored].map(csvCell).join(","));
  return [head, ...rows].join("\n");
}

// Next month's starting log: this month's "stored now" becomes "stored last app", work to date becomes "previous".
export function nextMonthCsv(result) {
  const head = "Item,Description,Scheduled value,Previous,Stored last app,Delivered,Installed,Other work,Location,Documented";
  const rows = result.lines.map((x) => [x.item, x.desc, cents(x.scheduled), cents(x.previous + x.E), cents(Math.max(x.storedNow, 0)), "0.00", "0.00", "0.00", x.offsite ? "off site" : "on site", x.documented ? "yes" : ""].map(csvCell).join(","));
  return [head, ...rows].join("\n");
}

export function summaryText(result) {
  const t = result.totals;
  if (!t) return "";
  const L = (k, v) => `${k.padEnd(38)}${String(v).padStart(16)}`;
  return [
    "Stored materials rollforward",
    "",
    L("Stored on last pay app", dollars(t.storedLast)),
    L("+ Delivered this period", dollars(t.delivered)),
    L("- Installed this period", dollars(t.installed)),
    L("= Stored now (column F)", dollars(t.storedNow)),
    L("    on site", dollars(t.storedOnsite)),
    L("    off site", dollars(t.storedOffsite)),
    L("Change in stored billed this period", dollars(t.storedChange)),
    L("Work this period (column E)", dollars(t.thisPeriod)),
    L("    of which installed from stored", dollars(t.installed)),
    L(`Retainage on stored now at ${(t.storedRate * 100).toFixed(1)}%`, dollars(t.retainageOnStored)),
  ].join("\n");
}

export const SAMPLE_SETTINGS = { workRetainage: "10", storedRetainage: "10", offsiteAllowed: false };
export function sampleLog() {
  return [
    "Item,Description,Scheduled value,Previous,Stored last app,Delivered,Installed,Other work,Location,Documented",
    "1,Underground conduit,40000,20000,0,0,0,10000,on site,yes",
    "2,Switchgear,60000,9000,15000,0,9000,1500,on site,yes",
    "3,Light fixtures,32000,0,0,18000,4000,2400,on site,yes",
    "4,Generator (at the supplier's yard),45000,0,0,30000,0,0,off site,",
    "5,Branch wiring and devices,38000,7600,2500,0,0,3800,on site,",
  ].join("\n");
}
