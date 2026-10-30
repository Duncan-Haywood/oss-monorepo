// Switching from a paid scheduler: turn a staff/employee CSV export into this tool's staff lines.
// Column names are matched by synonym (name or first + last, hourly rate, max/min weekly hours, position/role);
// the layouts of 7shifts, When I Work, Homebase, Deputy and Sling were written from memory, not from real
// exports, so unknown columns are listed and anything unreadable is skipped with a reason. Availability
// is not in most exports: people come in as "any" so you can edit them. Nothing leaves the browser.

const SYN = {
  name: ["name", "employee", "employee name", "full name", "staff", "team member", "display name"],
  first: ["first name", "first", "firstname", "given name"],
  last: ["last name", "last", "lastname", "surname", "family name"],
  wage: ["hourly rate", "hourly wage", "wage", "pay rate", "rate", "hourly", "base rate", "default hourly rate", "wage rate"],
  maxH: ["max hours", "max hours per week", "maximum hours", "weekly hours limit", "weekly max hours", "hours limit", "max weekly hours", "weekly hours max"],
  minH: ["min hours", "min hours per week", "minimum hours", "weekly min hours", "target hours", "desired hours"],
  role: ["role", "roles", "position", "positions", "job", "job title", "title", "department"],
  status: ["status", "active", "employment status"],
};

export function splitCsvRow(line, sep) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const clean = (s) => String(s || "").replace(/[,;\t]/g, " ").replace(/\s+/g, " ").trim();

export function importStaffCsv(text) {
  const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const notes = [], skipped = [];
  if (lines.length < 2) return { staffText: "", rows: 0, notes: ["Needs a header row and at least one person."], skipped, unknown: [] };
  const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const head = splitCsvRow(lines[0], sep).map(norm);
  const find = (key) => head.findIndex((h) => SYN[key].includes(h));
  const ix = Object.fromEntries(Object.keys(SYN).map((k) => [k, find(k)]));
  if (ix.name < 0 && ix.first < 0) return { staffText: "", rows: 0, notes: ["No name column found (looked for Name, Employee, First name + Last name)."], skipped, unknown: head };
  if (ix.wage < 0) notes.push("No hourly-rate column found: wages are set to 0. Fill them in before reading the payroll figures.");
  const used = new Set(Object.values(ix).filter((i) => i >= 0));
  const unknown = head.filter((h, i) => h && !used.has(i));
  const out = ["name, wage, max hours, min hours, availability"];
  const seen = new Set();
  lines.slice(1).forEach((line, n) => {
    const c = splitCsvRow(line, sep), at = (i) => (i >= 0 ? c[i] || "" : "");
    const name = clean(ix.name >= 0 ? at(ix.name) : `${at(ix.first)} ${at(ix.last)}`);
    const where = `Row ${n + 2}${name ? ` (${name})` : ""}`;
    if (!name) return skipped.push(`${where}: no name`);
    const st = norm(at(ix.status));
    if (st && /^(inactive|terminated|archived|deactivated|former|false|no|0)$/.test(st)) return skipped.push(`${where}: status "${at(ix.status)}"`);
    if (seen.has(name.toLowerCase())) return skipped.push(`${where}: listed twice`);
    const raw = at(ix.wage).replace(/[$£€\s]/g, "").replace(/\/h(r|our)?$/i, "");
    const wage = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(wage) || wage < 0) return skipped.push(`${where}: rate "${at(ix.wage)}" is not a number`);
    const num = (i, d) => { const v = at(i).replace(/[^0-9.]/g, ""); return v === "" ? d : Number(v); };
    const maxH = num(ix.maxH, 40), minH = Math.min(num(ix.minH, 0), maxH);
    seen.add(name.toLowerCase());
    const roles = clean(at(ix.role)).split(/\s*[|/]\s*/).filter(Boolean).slice(0, 4);
    out.push([name, wage, maxH, minH, "any", ...(roles.length ? [`role: ${roles.join("/")}`] : [])].join(", "));
  });
  if (unknown.length) notes.push(`Columns not used: ${unknown.join(", ")}.`);
  notes.push("Availability is set to any: edit each line, or send the availability link.");
  return { staffText: out.join("\n"), rows: out.length - 1, notes, skipped, unknown };
}
