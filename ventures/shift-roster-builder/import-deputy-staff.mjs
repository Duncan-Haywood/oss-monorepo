// The team from Deputy (2026-11-19): people, their locations and what they are paid, as staff lines with "sites:" and
// "wage at <location>:" cells, so a multi-site build prices each shift at the rate that person is paid there. It is the
// staff half of `import-deputy.mjs` (rosters) and mirrors `import7shiftsStaff` in `import-7shifts.mjs`.
//
// Deputy's own API reference was not reachable from the session that wrote this. Field names come from the model
// classes of communityds/deputy-api-wrapper (MIT; src/Model/Employee.php, EmployeeAgreement.php, EmployeeWorkplace.php,
// read 2026-11-19), whose camelCase properties are Deputy's PascalCase resource fields (its mock INFO answers spell them
// `Active`, `Company`, `OperationalUnitName`). See eval/deputy-staff-format-2026-11-19.md.
//   POST /api/v1/resource/Employee/QUERY          -> [ { Id, DisplayName, FirstName, LastName, OtherName, Active, Company,
//                                                       TerminationDate, ... } ]   Company = the person's main location
//   POST /api/v1/resource/EmployeeAgreement/QUERY -> [ { Id, EmployeeId, Active, BaseRate, PayPoint, StartDate, EndDate,
//                                                       SalaryPayRule, ... } ]     PayPoint = the location it pays at
//   POST /api/v1/resource/EmployeeWorkplace/QUERY -> [ { Id, EmployeeId, Company, Agreement1, Agreement2, Agreement3,
//                                                       SortOrder } ]              one row per location a person works at
//   POST /api/v1/resource/Company/QUERY           -> [ { Id, CompanyName, ... } ]
// A person's rate at a location: the agreement their workplace row there names first (Agreement1), else an agreement
// whose PayPoint is that location, else their own rate (the latest agreement in force). Areas a person may be rostered
// to are an association Deputy keeps on OperationalUnit, not a field of these rows, so no "role:" cell is written.
//
// No Deputy account, token or real response was used to build or test this.
import { deputyBase, deputyQuery } from "./import-deputy.mjs";

const isEmployee = (x) => ("FirstName" in x || "LastName" in x || "DisplayName" in x) && !("EmployeeId" in x) && !("StartTime" in x) && !("OperationalUnitName" in x) && !("CompanyName" in x && !("FirstName" in x)) && ("Company" in x || "Active" in x || "TerminationDate" in x || "UserId" in x);
const isAgreement = (x) => "EmployeeId" in x && ("BaseRate" in x || "PayPoint" in x || "Contract" in x);
const isWorkplace = (x) => "EmployeeId" in x && "Company" in x && !isAgreement(x);
const isCompany = (x) => "CompanyName" in x && !("OperationalUnitName" in x) && !("EmployeeId" in x) && !("FirstName" in x);

function collect(inputs) {
  const out = { employees: [], agreements: [], workplaces: [], companies: [], errors: [], unread: 0 };
  const visit = (v) => {
    if (typeof v === "string") {
      const s = v.trim().replace(/^﻿/, "");
      if (!s) return;
      let parsed;
      try { parsed = JSON.parse(s); } catch {
        const parts = s.split(/\n(?=\s*[{[])/);
        if (parts.length < 2) { out.unread++; return; }
        for (const p of parts) visit(p);
        return;
      }
      return visit(parsed);
    }
    if (Array.isArray(v)) { for (const x of v) visit(x); return; }
    if (!v || typeof v !== "object") { out.unread++; return; }
    if (isAgreement(v)) out.agreements.push(v);
    else if (isWorkplace(v)) out.workplaces.push(v);
    else if (isEmployee(v)) out.employees.push(v);
    else if (isCompany(v)) out.companies.push(v);
    else if (v.error) out.errors.push(String(v.error?.message || v.error).slice(0, 200));
    else out.unread++;
  };
  visit(inputs);
  return out;
}

// True when the JSON texts look like Deputy staff responses (an Employee or EmployeeAgreement list).
export function looksLikeDeputyStaff(texts) {
  const list = Array.isArray(texts) ? texts : [texts];
  return list.some((t) => /"EmployeeId"\s*:/.test(String(t)) || (/"FirstName"\s*:/.test(String(t)) && /"(DisplayName|TerminationDate|Company)"\s*:/.test(String(t))));
}

const cellName = (s) => String(s || "").replace(/[,;\t|/&+:]/g, " ").replace(/\s+/g, " ").trim();
const money2 = (x) => String(Math.round(x * 100) / 100);
const day = (v) => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v ?? "")); return m ? m[1] : ""; };
const id = (v) => (v == null || v === 0 || v === "0" || v === "" ? "" : String(v));

// An agreement is in force on `asOf` (YYYY-MM-DD, default today in UTC) when it is not inactive, has started, and has
// not ended. Undated ends count as open.
function inForce(a, asOf) {
  if (a.Active === false || a.Active === 0 || a.Active === "0") return false;
  const s = day(a.StartDate), e = day(a.EndDate);
  if (s && s > asOf) return false;
  if (e && e < asOf) return false;
  return true;
}

const rateOf = (a) => { const r = Number(a?.BaseRate); return Number.isFinite(r) && r > 0 ? r : null; };
const salaried = (a) => a && rateOf(a) === null && id(a.SalaryPayRule) !== "";

// inputs: JSON text or parsed responses (any order, several files). opts.asOf: the week you are planning (agreements in
// force then; default today). opts.location: keep only people who work at this location (name or id), at their rate
// there. Returns { staffText, rows, notes, skipped, counts }.
export function importDeputyStaff(inputs, opts = {}) {
  const got = collect(inputs);
  const notes = [], skipped = [];
  const counts = { employees: got.employees.length, inactive: 0, ended: 0, salaried: 0, noAgreement: 0, ownRates: 0, multiSite: 0, splitRates: 0, laterAgreements: 0 };
  const fail = (msg) => ({ staffText: "", rows: 0, notes: [msg], skipped, counts });
  if (opts.asOf && !/^\d{4}-\d{2}-\d{2}$/.test(opts.asOf)) return fail(`"${opts.asOf}" is not a date like 2026-11-16.`);
  const asOf = opts.asOf || new Date().toISOString().slice(0, 10);
  if (!got.employees.length) {
    if (got.errors.length) return fail(`Deputy answered with an error: ${got.errors[0]}`);
    return fail(got.agreements.length || got.workplaces.length
      ? "No Deputy employees found: add the response of POST /api/v1/resource/Employee/QUERY."
      : "No Deputy employees found in that JSON. Save the response of POST /api/v1/resource/Employee/QUERY (its rows have FirstName, LastName and Company).");
  }
  const locById = new Map(got.companies.filter((c) => c.Id != null).map((c) => [String(c.Id), cellName(c.CompanyName)]));
  const locName = (k) => locById.get(String(k)) || `location ${k}`;
  let keepLoc = null;
  if (opts.location != null && opts.location !== "") {
    const want = String(opts.location).toLowerCase();
    keepLoc = [...locById].find(([k, n]) => k === want || n.toLowerCase() === want)?.[0] ?? null;
    if (keepLoc === null && /^\d+$/.test(want)) keepLoc = want;
    if (keepLoc === null) return fail(`No location "${opts.location}": the responses name ${[...new Set(locById.values())].join(", ") || "none (add the Company response for names)"}.`);
  }
  const agById = new Map(), agByEmp = new Map(), wpByEmp = new Map();
  const seenAg = new Set();
  for (const a of got.agreements) {
    if (a.Id != null) { if (seenAg.has(String(a.Id))) continue; seenAg.add(String(a.Id)); agById.set(String(a.Id), a); }
    const k = String(a.EmployeeId);
    if (!agByEmp.has(k)) agByEmp.set(k, []);
    agByEmp.get(k).push(a);
  }
  const seenWp = new Set();
  for (const w of got.workplaces) {
    if (w.Id != null) { if (seenWp.has(String(w.Id))) continue; seenWp.add(String(w.Id)); }
    const k = String(w.EmployeeId);
    if (!wpByEmp.has(k)) wpByEmp.set(k, []);
    wpByEmp.get(k).push(w);
  }
  const people = [];
  const names = new Map();
  const seenEmp = new Set();
  const sitesUsed = new Set();
  for (const e of got.employees) {
    if (e.Id != null) { if (seenEmp.has(String(e.Id))) continue; seenEmp.add(String(e.Id)); }
    const name0 = cellName(e.DisplayName || `${e.OtherName || e.FirstName || ""} ${e.LastName || ""}`);
    const where = `Employee ${e.Id ?? "?"}${name0 ? ` (${name0})` : ""}`;
    if (!name0) { skipped.push(`${where}: no name`); continue; }
    if (e.Active === false || e.Active === 0 || e.Active === "0") { counts.inactive++; continue; }
    const term = day(e.TerminationDate);
    if (term && term < asOf) { counts.ended++; continue; }
    const k = String(e.Id);
    const all = agByEmp.get(k) || [];
    const live = all.filter((a) => inForce(a, asOf));
    counts.laterAgreements += all.filter((a) => !live.includes(a) && day(a.StartDate) > asOf && a.Active !== false).length;
    // The person's own rate: the latest-starting agreement in force that names an hourly rate.
    const byStart = [...live].sort((a, b) => day(b.StartDate).localeCompare(day(a.StartDate)));
    const own = byStart.find((a) => rateOf(a) !== null) || null;
    const isSalaried = !own && live.some(salaried);
    if (!all.length) counts.noAgreement++;
    if (isSalaried) counts.salaried++;
    const base = own ? rateOf(own) : 0;
    // Locations: the main one, then each workplace row's, in Deputy's sort order.
    const wps = [...(wpByEmp.get(k) || [])].sort((a, b) => (Number(a.SortOrder) || 0) - (Number(b.SortOrder) || 0));
    const locIds = [];
    const addLoc = (x) => { if (x && !locIds.includes(x)) locIds.push(x); };
    addLoc(id(e.Company));
    for (const w of wps) addLoc(id(w.Company));
    for (const a of live) addLoc(id(a.PayPoint));
    if (keepLoc !== null && !locIds.includes(keepLoc)) continue;
    // Rate at each location: the workplace's first named agreement in force, else agreements paying at that location.
    const rateAt = new Map();
    for (const loc of locIds) {
      const w = wps.find((x) => id(x.Company) === loc);
      const named = w ? [w.Agreement1, w.Agreement2, w.Agreement3].map((x) => agById.get(id(x))).filter((a) => a && inForce(a, asOf) && rateOf(a) !== null) : [];
      const paid = named.length ? [named[0]] : live.filter((a) => id(a.PayPoint) === loc && rateOf(a) !== null);
      if (!paid.length) continue;
      const rates = paid.map(rateOf);
      if (new Set(rates).size > 1) counts.splitRates++;
      rateAt.set(loc, Math.max(...rates));
    }
    const cells = [];
    for (const [loc, r] of rateAt) if (keepLoc === null && Math.abs(r - base) > 1e-9) cells.push(`wage at ${locName(loc)}: ${money2(r)}`);
    counts.ownRates += cells.length;
    let name = name0;
    if (names.has(name.toLowerCase())) { name = cellName(`${name0} ${e.Id}`); skipped.push(`${where}: a second person with this name is listed as "${name}"`); }
    names.set(name.toLowerCase(), true);
    if (locIds.length > 1) counts.multiSite++;
    for (const l of locIds) sitesUsed.add(l);
    const here = keepLoc !== null && rateAt.has(keepLoc) ? rateAt.get(keepLoc) : null;
    people.push({ name, base: here ?? base, locIds: keepLoc !== null ? [keepLoc] : locIds, cells });
  }
  const many = keepLoc === null && sitesUsed.size > 1;
  const out = ["name, wage, max hours, min hours, availability"];
  for (const p of people) {
    const tail = [];
    if (many && p.locIds.length) tail.push(`sites: ${p.locIds.map(locName).join(" | ")}`);
    out.push([p.name, money2(p.base), 40, 0, "any", ...tail, ...p.cells].join(", "));
  }
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  notes.push(`Read ${people.length} ${people.length === 1 ? "person" : "people"} from Deputy${keepLoc !== null ? ` at ${locName(keepLoc)}` : ""} (agreements in force on ${asOf}).`);
  if (counts.inactive) notes.push(`${plural(counts.inactive, "inactive employee")} left out.`);
  if (counts.ended) notes.push(`${plural(counts.ended, "employee")} terminated before ${asOf} left out.`);
  if (many) notes.push(`${counts.multiSite} of ${people.length} work at more than one location; each sites: cell lists their main location first, then their other workplaces.`);
  if (counts.ownRates) notes.push(`${plural(counts.ownRates, '"wage at" cell')} written where a location's agreement pays someone other than their own rate. A site's floor (--site-wage "City min 21.30") still applies on top.`);
  if (keepLoc !== null) notes.push(`Only ${locName(keepLoc)} is planned, so each wage is the person's rate there, and no sites: or "wage at" cells are written.`);
  if (counts.splitRates) notes.push(`${counts.splitRates} person-location${counts.splitRates === 1 ? "" : "s"} with agreements at different rates: the highest is used there, because this tool keeps one rate per person per site.`);
  if (counts.salaried) notes.push(`${plural(counts.salaried, "salaried person")} (an agreement with a salary pay rule and no base rate) at wage 0: their hours add nothing to the plan's payroll. Set a wage if overtime or a cost per hour applies.`);
  if (counts.noAgreement) notes.push(`${counts.noAgreement} of ${people.length} have no agreement in the responses, so their wage is 0: add the EmployeeAgreement response.`);
  if (counts.laterAgreements) notes.push(`${plural(counts.laterAgreements, "agreement")} starting after ${asOf} not applied (--wages-as-of a later date applies them).`);
  if (!got.companies.length && sitesUsed.size) notes.push("Locations are shown as numbers: add the Company response (resource/Company/QUERY) for their names.");
  if (got.unread) notes.push(`${got.unread} JSON value(s) were not Deputy employees, agreements, workplaces or locations and were ignored.`);
  notes.push("Max hours is set to 40 and availability to any: edit each line, or send the availability link. Deputy areas are not read as roles: add role: cells where it matters.");
  return { staffText: out.join("\n"), rows: people.length, notes, skipped, counts };
}

// Fetch the team with the deployer's own token: employees, their agreements and workplaces, and the locations for names.
// Four paged queries, not one per person. The token goes only to the install's own host and is never printed.
export async function fetchDeputyStaff({ token, install, base, fetchImpl = globalThis.fetch, pageSize = 500 }) {
  if (!token) throw new Error("Set DEPUTY_TOKEN to a permanent token or OAuth access token from your own Deputy install.");
  const root = base || deputyBase(install);
  if (!root) throw new Error('Set DEPUTY_INSTALL to your Deputy address, like "yourco.na.deputy.com".');
  const query = deputyQuery({ token, root, fetchImpl, pageSize });
  const all = { s1: { field: "Id", type: "ne", data: 0 } };
  const employees = await query("Employee", { s1: { field: "Active", type: "eq", data: true } });
  const agreements = await query("EmployeeAgreement", { s1: { field: "Active", type: "eq", data: true } });
  const workplaces = await query("EmployeeWorkplace", all);
  const companies = await query("Company", all);
  return { responses: [employees, agreements, workplaces, companies] };
}
