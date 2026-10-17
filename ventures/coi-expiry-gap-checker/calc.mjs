// Certificate-of-insurance tracker: reads a list of vendor/subcontractor policies
// (one row per policy, as copied off the ACORD 25 certificates) and checks it against
// the insurance requirements of a contract.
//
// What it decides, per vendor: is each required coverage on file, in force today, in
// force for the lead time you want before it lapses, at or above the required limit
// (counting umbrella/excess toward a primary shortfall if you allow it), and carrying
// the endorsements the contract asks for (additional insured, waiver of subrogation,
// primary and non-contributory). It also finds renewal gaps: a policy that ended before
// its replacement began.
//
// It checks what is written on the list. It does not read certificates, confirm with a
// carrier or agent that a policy exists, or decide whether an endorsement actually
// attaches; a certificate is not itself coverage. The limits and wording of a contract
// are the contract's. Nothing in this module touches the network or the DOM.

export const COVERAGES = {
  GL: "Commercial general liability",
  AUTO: "Business auto liability",
  UMB: "Umbrella / excess liability",
  WC: "Workers' compensation / employers' liability",
  PRO: "Professional liability",
};

const DAY = 86400000;

const ALIASES = {
  vendor: ["vendor", "subcontractor", "sub", "company", "insured", "name", "contractor"],
  coverage: ["coverage", "policy type", "type", "line", "policy"],
  carrier: ["carrier", "insurer", "company name", "insurer name"],
  policy: ["policy number", "policy no", "policy #", "policy_number", "number"],
  limit: ["each occurrence", "limit", "each_occurrence", "per occurrence", "occurrence", "each accident", "csl", "combined single limit", "each claim"],
  aggregate: ["aggregate", "general aggregate", "agg"],
  effective: ["effective", "effective date", "eff", "start", "policy effective"],
  expiry: ["expiration", "expiry", "expiration date", "exp", "end", "policy expiration", "expires"],
  ai: ["additional insured", "ai", "additional_insured"],
  waiver: ["waiver of subrogation", "waiver", "wos", "subrogation waived"],
  pnc: ["primary non-contributory", "primary and non-contributory", "pnc", "primary noncontributory", "primary & non-contributory"],
};

export function parseCsv(text) {
  const rows = [];
  let row = [], cur = "", q = false, line = 1, rowLine = 1;
  const src = String(text).replace(/^\uFEFF/, "");
  const push = () => { row.push(cur); cur = ""; };
  const endRow = () => { push(); if (row.some((c) => c.trim() !== "")) rows.push({ line: rowLine, cells: row }); row = []; };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else { if (c === "\n") line++; cur += c; }
    } else if (c === '"' && cur === "") q = true;
    else if (c === "," || c === "\t") push();
    else if (c === "\n") { endRow(); line++; rowLine = line; }
    else if (c !== "\r") cur += c;
  }
  if (cur !== "" || row.length) endRow();
  return rows;
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9#&]+/g, " ").trim();

export function normalizeCoverage(s) {
  const t = norm(s);
  if (!t) return null;
  if (/umbrella|excess|\bxs\b/.test(t)) return "UMB";
  if (/work|comp|\bwc\b|employers/.test(t)) return "WC";
  if (/auto|vehicle|\bba\b/.test(t)) return "AUTO";
  if (/profession|e&o|errors|omissions|\bpl\b/.test(t)) return "PRO";
  if (/general|\bgl\b|\bcgl\b|\bclg\b|liability/.test(t)) return "GL";
  return null;
}

export function parseMoney(s) {
  const t = String(s ?? "").trim().toLowerCase().replace(/[$,\s]/g, "");
  if (!t) return null;
  const m = /^(\d+(?:\.\d+)?)(k|m|mm)?$/.exec(t);
  if (!m) return NaN;
  const mult = m[2] === "k" ? 1e3 : m[2] ? 1e6 : 1;
  return Math.round(Number(m[1]) * mult);
}

// ISO, M/D/YYYY (US order, as on an ACORD form) or M/D/YY. Returns a UTC day number or null/NaN.
export function parseDate(s) {
  const t = String(s ?? "").trim();
  if (!t) return null;
  let y, m, d, x;
  if ((x = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) [y, m, d] = [+x[1], +x[2], +x[3]];
  else if ((x = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(t))) [m, d, y] = [+x[1], +x[2], x[3].length === 2 ? 2000 + +x[3] : +x[3]];
  else return NaN;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return NaN;
  return Math.round(dt.getTime() / DAY);
}
export const isoDay = (n) => new Date(n * DAY).toISOString().slice(0, 10);
export const money = (n) => (n == null ? "—" : "$" + Number(n).toLocaleString("en-US"));

function yn(s) {
  const t = norm(s);
  if (!t) return null;
  if (/^(y|yes|true|x|1|included|on file)/.test(t)) return true;
  if (/^(n|no|false|0|none|not)/.test(t)) return false;
  return null;
}

function mapHeader(cells) {
  const idx = {};
  const heads = cells.map(norm);
  for (const [field, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const i = heads.indexOf(norm(n));
      if (i >= 0 && !(field in idx)) { idx[field] = i; break; }
    }
  }
  return idx;
}

export const DEFAULT_REQUIREMENTS = {
  GL: { limit: 1000000, aggregate: 2000000 },
  AUTO: { limit: 1000000 },
  UMB: { limit: 0 },
  WC: { limit: 500000 },
  PRO: { limit: 0 },
  umbrellaCounts: true,
  leadDays: 30,
  additionalInsured: true,
  waiver: true,
  pnc: false,
};

// parse(): rows from the list, plus findings about the list itself.
export function readList(text) {
  const findings = [];
  const raw = parseCsv(text);
  if (!raw.length) return { policies: [], findings: [{ severity: "error", line: 0, title: "Nothing to read", detail: "Paste or choose a list with a header row, then one row per policy." }] };
  const idx = mapHeader(raw[0].cells);
  for (const need of ["vendor", "coverage", "expiry"]) {
    if (!(need in idx)) findings.push({ severity: "error", line: raw[0].line, title: `No "${need === "expiry" ? "expiration" : need}" column`, detail: `The header row needs a column named ${ALIASES[need].slice(0, 4).join(", ")} (or similar). Found: ${raw[0].cells.map((c) => c.trim()).filter(Boolean).join(", ") || "nothing"}.` });
  }
  if (findings.length) return { policies: [], findings };
  const policies = [];
  for (const { line, cells } of raw.slice(1)) {
    const get = (f) => (f in idx ? (cells[idx[f]] ?? "").trim() : "");
    const vendor = get("vendor");
    if (!vendor) { findings.push({ severity: "warning", line, title: "Row has no vendor name", detail: "The row was skipped." }); continue; }
    const cov = normalizeCoverage(get("coverage"));
    if (!cov) { findings.push({ severity: "warning", line, vendor, title: `Coverage "${get("coverage")}" not recognised`, detail: "Use general liability, auto, umbrella/excess, workers comp or professional. The row was skipped." }); continue; }
    const limit = parseMoney(get("limit")), aggregate = parseMoney(get("aggregate"));
    const effective = parseDate(get("effective")), expiry = parseDate(get("expiry"));
    for (const [label, v, raw2] of [["limit", limit, get("limit")], ["aggregate", aggregate, get("aggregate")]]) {
      if (Number.isNaN(v)) findings.push({ severity: "warning", line, vendor, coverage: cov, title: `Cannot read the ${label} "${raw2}"`, detail: "Write it as a dollar amount such as 1,000,000 or 1M. It is treated as not given." });
    }
    for (const [label, v, raw2] of [["effective", effective, get("effective")], ["expiration", expiry, get("expiry")]]) {
      if (Number.isNaN(v)) findings.push({ severity: "error", line, vendor, coverage: cov, title: `Cannot read the ${label} date "${raw2}"`, detail: "Use YYYY-MM-DD or M/D/YYYY (US order, as on the certificate)." });
    }
    if (expiry === null) findings.push({ severity: "error", line, vendor, coverage: cov, title: "No expiration date", detail: "Without an expiration date the policy cannot be tracked." });
    if (Number.isFinite(effective) && Number.isFinite(expiry) && expiry < effective) findings.push({ severity: "error", line, vendor, coverage: cov, title: "Expires before it takes effect", detail: `Effective ${isoDay(effective)}, expiration ${isoDay(expiry)}: the two dates look swapped.` });
    policies.push({
      line, vendor, coverage: cov, carrier: get("carrier"), policy: get("policy"),
      limit: Number.isNaN(limit) ? null : limit, aggregate: Number.isNaN(aggregate) ? null : aggregate,
      effective: Number.isFinite(effective) ? effective : null, expiry: Number.isFinite(expiry) ? expiry : null,
      ai: yn(get("ai")), waiver: yn(get("waiver")), pnc: yn(get("pnc")),
    });
  }
  return { policies, findings };
}

const vkey = (v) => norm(v);

// asOf: UTC day number. req: see DEFAULT_REQUIREMENTS.
export function check(text, req = {}, asOf) {
  const r = { ...DEFAULT_REQUIREMENTS, ...req };
  for (const k of ["GL", "AUTO", "UMB", "WC", "PRO"]) r[k] = { ...DEFAULT_REQUIREMENTS[k], ...(req[k] || {}) };
  const { policies, findings } = readList(text);
  const vendors = new Map();
  for (const p of policies) {
    const k = vkey(p.vendor);
    if (!vendors.has(k)) vendors.set(k, { vendor: p.vendor, policies: [] });
    vendors.get(k).policies.push(p);
  }
  const results = [];
  const add = (v, f) => { const full = { vendor: v.vendor, ...f }; findings.push(full); v.items.push(full); };
  for (const v of [...vendors.values()].sort((a, b) => a.vendor.localeCompare(b.vendor))) {
    v.items = [];
    const required = ["GL", "AUTO", "WC", "UMB", "PRO"].filter((c) => r[c].required ?? (c === "UMB" || c === "PRO" ? r[c].limit > 0 : true));
    // The policy in force today for a coverage, else the one that ended most recently, else the next to start.
    const pick = (c) => {
      const ps = v.policies.filter((p) => p.coverage === c && p.expiry != null);
      if (!ps.length) return null;
      const inForce = ps.filter((p) => (p.effective == null || p.effective <= asOf) && p.expiry >= asOf).sort((a, b) => b.expiry - a.expiry);
      if (inForce.length) return { p: inForce[0], state: "inforce" };
      const past = ps.filter((p) => p.expiry < asOf).sort((a, b) => b.expiry - a.expiry);
      if (past.length) return { p: past[0], state: "expired" };
      return { p: ps.sort((a, b) => a.effective - b.effective)[0], state: "future" };
    };
    const umb = pick("UMB");
    const umbOk = umb && umb.state === "inforce";
    for (const c of required) {
      const need = r[c];
      const got = pick(c);
      const label = COVERAGES[c];
      if (!got) { add(v, { severity: "error", coverage: c, title: `${label}: nothing on file`, detail: `The contract requires ${label.toLowerCase()}${need.limit ? ` at ${money(need.limit)}` : ""} and the list has no policy for it.` }); continue; }
      const { p, state } = got;
      const where = p.line ? ` (line ${p.line})` : "";
      if (state === "expired") { add(v, { severity: "error", coverage: c, line: p.line, title: `${label}: expired ${isoDay(p.expiry)}`, detail: `Expired ${asOf - p.expiry} day${asOf - p.expiry === 1 ? "" : "s"} ago${where}. Ask for a current certificate before the vendor works.` }); continue; }
      if (state === "future") { add(v, { severity: "error", coverage: c, line: p.line, title: `${label}: not in force until ${isoDay(p.effective)}`, detail: `The only policy listed starts ${isoDay(p.effective)}${where}.` }); continue; }
      const left = p.expiry - asOf;
      if (left <= r.leadDays) add(v, { severity: left <= 7 ? "error" : "warning", coverage: c, line: p.line, title: `${label}: expires ${isoDay(p.expiry)} (${left} day${left === 1 ? "" : "s"})`, detail: `Inside your ${r.leadDays}-day lead time${where}. Ask for the renewal certificate now.`, expiry: p.expiry });
      // Limits.
      const checkLimit = (field, needed, name) => {
        if (!needed) return;
        if (p[field] == null) { add(v, { severity: "warning", coverage: c, line: p.line, title: `${label}: ${name} not on the list`, detail: `Required ${money(needed)}; the row has no figure to compare${where}.` }); return; }
        if (p[field] >= needed) return;
        const short = needed - p[field];
        if (r.umbrellaCounts && c !== "WC" && c !== "UMB" && umbOk && umb.p.limit != null && umb.p.limit >= short) {
          add(v, { severity: "info", coverage: c, line: p.line, title: `${label}: ${name} ${money(p[field])} is ${money(short)} short, made up by the umbrella`, detail: `Required ${money(needed)}. Primary plus the umbrella's ${money(umb.p.limit)} reaches it; check the contract allows that and that the umbrella schedules this policy.` });
        } else {
          add(v, { severity: "error", coverage: c, line: p.line, title: `${label}: ${name} ${money(p[field])} is below the ${money(needed)} required`, detail: `Short by ${money(short)}${where}.` });
        }
      };
      checkLimit("limit", need.limit, c === "WC" ? "employers' liability each accident" : c === "AUTO" ? "combined single limit" : "each occurrence");
      if (need.aggregate) checkLimit("aggregate", need.aggregate, "aggregate");
      // Endorsements apply to liability policies; workers' comp gets a waiver, not AI.
      const endorse = (field, wanted, name, applies) => {
        if (!wanted || !applies.includes(c)) return;
        if (p[field] === true) return;
        add(v, { severity: p[field] === false ? "error" : "warning", coverage: c, line: p.line, title: `${label}: ${name} ${p[field] === false ? "marked no" : "not stated"}`, detail: `The contract asks for ${name}${where}. ${p[field] == null ? "The certificate must say so; a blank is not a yes." : "Ask for the endorsement."}` });
      };
      endorse("ai", r.additionalInsured, "additional insured", ["GL", "AUTO", "UMB"]);
      endorse("waiver", r.waiver, "waiver of subrogation", ["GL", "AUTO", "WC", "UMB"]);
      endorse("pnc", r.pnc, "primary and non-contributory", ["GL", "AUTO", "UMB"]);
    }
    // Renewal gaps: two policies of one coverage where the earlier ended before the next began.
    for (const c of Object.keys(COVERAGES)) {
      const ps = v.policies.filter((p) => p.coverage === c && p.effective != null && p.expiry != null).sort((a, b) => a.effective - b.effective);
      for (let i = 1; i < ps.length; i++) {
        const gap = ps[i].effective - ps[i - 1].expiry - 1;
        if (gap > 0) add(v, { severity: "warning", coverage: c, line: ps[i].line, title: `${COVERAGES[c]}: ${gap}-day gap between policies`, detail: `The earlier policy ended ${isoDay(ps[i - 1].expiry)} and the next began ${isoDay(ps[i].effective)}. Work done in the gap was not covered by anything on this list.` });
      }
    }
    const sev = v.items.some((f) => f.severity === "error") ? "fail" : v.items.some((f) => f.severity === "warning") ? "watch" : "ok";
    results.push({ vendor: v.vendor, status: sev, policies: v.policies.length, items: v.items });
  }
  const order = { fail: 0, watch: 1, ok: 2 };
  results.sort((a, b) => order[a.status] - order[b.status] || a.vendor.localeCompare(b.vendor));
  return {
    asOf, requirements: r, policies, findings, vendors: results,
    summary: { vendors: results.length, policies: policies.length, fail: results.filter((x) => x.status === "fail").length, watch: results.filter((x) => x.status === "watch").length, ok: results.filter((x) => x.status === "ok").length },
  };
}

const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // spreadsheet formula injection
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

export function findingsCsv(result) {
  return csv([["severity", "vendor", "coverage", "line", "finding", "detail"], ...result.findings.map((f) => [f.severity, f.vendor || "", f.coverage || "", f.line || "", f.title, f.detail])]);
}

// A chase list: one row per vendor with something to ask for, ready to paste into a mail merge.
export function chaseListCsv(result) {
  const rows = [["vendor", "status", "ask_for"]];
  for (const v of result.vendors) {
    const asks = v.items.filter((f) => f.severity !== "info").map((f) => f.title);
    if (asks.length) rows.push([v.vendor, v.status === "fail" ? "blocking" : "renewal soon", asks.join("; ")]);
  }
  return csv(rows);
}

// All-day calendar events on the day each policy enters its lead time, so the chase happens before the lapse.
export function expiryCalendar(result, now = "2026-01-01T00:00:00Z") {
  const stamp = new Date(now).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//coi-expiry-gap-checker//EN", "CALSCALE:GREGORIAN"];
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  for (const p of result.policies) {
    if (p.expiry == null || p.expiry < result.asOf) continue;
    const day = Math.max(p.expiry - result.requirements.leadDays, result.asOf);
    const d = (n) => isoDay(n).replace(/-/g, "");
    const uid = `${vkey(p.vendor).replace(/ /g, "-")}-${p.coverage}-${d(p.expiry)}@coi-expiry-gap-checker`;
    lines.push("BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d(day)}`, `DTEND;VALUE=DATE:${d(day + 1)}`,
      `SUMMARY:${esc(`Renew COI: ${p.vendor}, ${COVERAGES[p.coverage]} expires ${isoDay(p.expiry)}`)}`,
      `DESCRIPTION:${esc(`${p.carrier ? p.carrier + ". " : ""}${p.policy ? "Policy " + p.policy + ". " : ""}Ask for the renewal certificate and endorsements.`)}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export function sampleList() {
  return [
    "Vendor,Coverage,Carrier,Policy number,Each occurrence,Aggregate,Effective,Expiration,Additional insured,Waiver of subrogation",
    "Apex Roofing LLC,General liability,Hartford,GL-88120,1000000,2000000,2026-03-01,2027-03-01,Yes,Yes",
    "Apex Roofing LLC,Business auto,Hartford,BA-44102,1000000,,2026-03-01,2027-03-01,Yes,Yes",
    "Apex Roofing LLC,Workers comp,Zenith,WC-7731,500000,,2026-03-01,2027-03-01,,Yes",
    "Blue Line Electric,General liability,Travelers,GL-2290,1000000,2000000,2025-10-20,2026-10-20,Yes,Yes",
    "Blue Line Electric,Business auto,Travelers,BA-5521,1000000,,2025-10-20,2026-10-20,Yes,Yes",
    "Blue Line Electric,Workers comp,Travelers,WC-9902,500000,,2025-10-20,2026-10-20,,Yes",
    "Carter Concrete,General liability,Acuity,GL-1177,500000,1000000,2026-01-15,2027-01-15,No,No",
    "Carter Concrete,Umbrella,Acuity,UM-310,2000000,,2026-01-15,2027-01-15,Yes,Yes",
    "Carter Concrete,Business auto,Acuity,BA-1802,1000000,,2026-01-15,2027-01-15,Yes,Yes",
    "Carter Concrete,Workers comp,Acuity,WC-444,500000,,2026-01-15,2027-01-15,,Yes",
    "",
  ].join("\n");
}
export const SAMPLE_AS_OF = "2026-10-05";

export function sampleBrokenList() {
  return [
    "Vendor,Coverage,Carrier,Policy number,Each occurrence,Aggregate,Effective,Expiration,Additional insured,Waiver of subrogation",
    "Delta Drywall,General liability,State Auto,GL-61,1000000,2000000,2025-06-01,2026-06-01,Yes,Yes",
    "Delta Drywall,General liability,State Auto,GL-77,1000000,2000000,2026-06-20,2027-06-20,Yes,Yes",
    "Delta Drywall,Business auto,State Auto,BA-9,750000,,2026-06-20,2027-06-20,Yes,Yes",
    "Echo Excavating,General liability,,,1M,2M,10/01/2026,10/01/2025,,",
    "Echo Excavating,Workers comp,Liberty,WC-2,250000,,2026-01-01,2026-12-31,,No",
    "",
  ].join("\n");
}
