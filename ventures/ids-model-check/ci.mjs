// CI renderings of one or more checkIds() reports: JUnit XML (read by GitHub,
// GitLab, Jenkins, Azure DevOps and most test-report viewers), GitHub workflow
// annotations, and a Markdown job summary. No I/O here; ci-cli.mjs and
// action.yml do the reading and writing.
//
// A "run" is { model, ids, report } for a check that ran, or
// { model, ids, error } when a file could not be read.

const xmlEsc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c])
  // XML 1.0 forbids most control characters even escaped.
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

const failLine = (f) => `#${f.id} ${f.type}${f.name ? ` "${f.name}"` : ""}${f.globalId ? ` ${f.globalId}` : ""}: ${f.reasons.join("; ")}`;

// How many elements fail a spec. A prohibited spec lists at most 500 of its
// matches (ids.mjs), but every match fails it.
// A report checked with maxFailed (ci-cli.mjs) lists the first N and gives
// the full count in failedCount.
export const failCount = (s) => (s.optionality === "prohibited" && s.status === "fail" ? Math.max(s.applicable, s.failed.length) : s.failedCount ?? s.failed.length);

// What a spec's result means for CI. Optional specifications never fail a
// build in IDS terms (a failure there is advice), so they are warnings.
export function severity(spec) {
  if (spec.status === "invalid") return "error";
  if (spec.status !== "fail") return "pass";
  return spec.optionality === "optional" ? "warning" : "error";
}

// Elements a specification left unchecked because its entity facet names an
// ancestor of their class, not the class (IDS has no inheritance: IFCWALL does
// not take an IfcWallStandardCase; ids.mjs skippedSubclasses). The verdict
// stands; CI says so, and fails on it only when asked (--fail-on-unchecked).
export const notChecked = (s) => (s.skippedSubclasses || []).reduce((n, x) => n + x.count, 0);

// IDS audit warnings (audit.mjs, ids.mjs auditWarnings): the IDS is valid but a
// specification is probably not what its author meant (an abstract class that
// selects nothing, a value no enumeration member can equal, a non-standard
// Pset_ property). They belong to the IDS file, not the model, so a file
// checked against five models is told once: one entry per IDS file and
// specification, in IDS order. The verdict stands; CI fails on them only when
// asked (--fail-on-audit-warnings).
export function auditFindings(runs) {
  const seen = new Map();
  for (const r of runs) {
    if (r.error) continue;
    r.report.specs.forEach((s, index) => {
      const ws = s.auditWarnings || [];
      if (!ws.length) return;
      const k = `${r.ids}\u0000${index}`;
      const e = seen.get(k) || { ids: r.ids, index, name: s.name, warnings: [] };
      for (const w of ws) if (!e.warnings.includes(w)) e.warnings.push(w);
      seen.set(k, e);
    });
  }
  return [...seen.values()];
}

// The 1-based line of each <specification> start tag in an IDS file, in
// document order (the order of report.specs), so an annotation about a
// specification lands on it. Comments, CDATA and processing instructions are
// skipped; a namespace prefix (<ids:specification>) is allowed.
export function idsSpecLines(text) {
  const out = [];
  if (typeof text !== "string") return out;
  const re = /<!--[^]*?-->|<!\[CDATA\[[^]*?\]\]>|<\?[^]*?\?>|<(?:[A-Za-z_][\w.-]*:)?specification(?=[\s/>])/g;
  let line = 1, at = 0, m;
  while ((m = re.exec(text))) {
    for (let i = at; i < m.index; i++) if (text.charCodeAt(i) === 10) line++;
    at = m.index;
    if (m[0][1] !== "!" && m[0][1] !== "?") out.push(line);
  }
  return out;
}

export function tally(runs) {
  const t = { pairs: runs.length, unreadable: 0, specs: 0, passed: 0, failed: 0, warnings: 0, invalid: 0, elementsFailed: 0, uncheckedSpecs: 0, elementsNotChecked: 0, auditSpecs: 0, auditWarnings: 0 };
  for (const r of runs) {
    if (r.error) { t.unreadable++; continue; }
    for (const s of r.report.specs) {
      t.specs++;
      const sev = severity(s);
      if (s.status === "invalid") t.invalid++;
      else if (sev === "error") t.failed++;
      else if (sev === "warning") t.warnings++;
      else t.passed++;
      t.elementsFailed += failCount(s);
      const nc = notChecked(s);
      if (nc) { t.uncheckedSpecs++; t.elementsNotChecked += nc; }
    }
  }
  for (const a of auditFindings(runs)) { t.auditSpecs++; t.auditWarnings += a.warnings.length; }
  t.ok = t.unreadable === 0 && t.failed === 0 && t.invalid === 0;
  return t;
}

export function junitXml(runs, { maxFailures = 50 } = {}) {
  const suites = [];
  let all = { tests: 0, failures: 0, errors: 0, skipped: 0, time: 0 };
  for (const r of runs) {
    const name = `${r.model} vs ${r.ids}`;
    if (r.error) {
      suites.push(`  <testsuite name="${xmlEsc(name)}" tests="1" failures="0" errors="1" skipped="0" time="0">\n    <testcase classname="${xmlEsc(r.ids)}" name="read files"><error message="${xmlEsc(r.error)}"/></testcase>\n  </testsuite>`);
      all.tests++; all.errors++;
      continue;
    }
    const rep = r.report;
    const cases = [];
    let failures = 0, errors = 0, skipped = 0;
    for (const s of rep.specs) {
      const warn = [...(s.hint && notChecked(s) ? [`warning: ${s.hint}`] : []), ...(s.auditWarnings || []).map((w) => `IDS audit warning: ${w}`)].join("\n");
      const out = warn ? `<system-out>${xmlEsc(warn)}</system-out>` : "";
      const head = `    <testcase classname="${xmlEsc(rep.title || r.ids)}" name="${xmlEsc(s.name)}" file="${xmlEsc(r.model)}">`;
      const props = `applies to ${s.applicable} element(s); ${s.applicable - failCount(s)} pass, ${failCount(s)} fail`;
      if (s.status === "invalid") {
        errors++;
        cases.push(`${head}<error message="${xmlEsc(`invalid specification: ${s.note || "the IDS needs fixing"}`)}"/></testcase>`);
      } else if (s.status === "fail" && severity(s) === "error") {
        failures++;
        const lines = s.failed.slice(0, maxFailures).map(failLine);
        if (warn) lines.unshift(warn);
        if (failCount(s) > maxFailures) lines.push(`... and ${failCount(s) - Math.min(maxFailures, s.failed.length)} more`);
        if (!s.failed.length && s.note) lines.push(s.note);
        const msg = s.failed.length ? `${failCount(s)} of ${s.applicable} element(s) fail` : (s.note || "specification fails");
        cases.push(`${head}<failure message="${xmlEsc(msg)}" type="${xmlEsc(s.optionality)}">${xmlEsc([props, ...lines].join("\n"))}</failure>${out}</testcase>`);
      } else if (s.status === "fail") {
        // optional: report but do not fail the suite
        cases.push(`${head}<system-out>${xmlEsc([`optional specification, ${props}`, ...(warn ? [warn] : []), ...s.failed.slice(0, maxFailures).map(failLine)].join("\n"))}</system-out></testcase>`);
      } else if (s.status === "skipped") {
        skipped++;
        cases.push(`${head}<skipped message="${xmlEsc(s.note || s.warning || "not checked for this model's schema")}"/></testcase>`);
      } else if (s.applicable === 0 && s.optionality !== "prohibited") {
        skipped++;
        cases.push(`${head}<skipped message="${xmlEsc(warn ? `no element of the named class(es) matches the applicability; ${s.hint}` : "no element in the model matches the applicability")}"/>${out}</testcase>`);
      } else {
        cases.push(`${head}${out}</testcase>`);
      }
    }
    const time = Number(rep.seconds || 0);
    suites.push(`  <testsuite name="${xmlEsc(name)}" tests="${rep.specs.length}" failures="${failures}" errors="${errors}" skipped="${skipped}" time="${time.toFixed(3)}">\n${cases.join("\n")}\n  </testsuite>`);
    all.tests += rep.specs.length; all.failures += failures; all.errors += errors; all.skipped += skipped; all.time += time;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="ids-model-check" tests="${all.tests}" failures="${all.failures}" errors="${all.errors}" skipped="${all.skipped}" time="${all.time.toFixed(3)}">\n${suites.join("\n")}\n</testsuites>\n`;
}

// GitHub workflow commands: properties escape %, CR, LF, ':' and ','; the
// message escapes %, CR and LF.
const escData = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const escProp = (s) => escData(s).replace(/[:,]/g, (c) => (c === ":" ? "%3A" : "%2C"));

// The 1-based line of "#id=" in a STEP file, so an annotation lands on the
// failing element. Returns a Map id -> line for the ids asked for.
export function stepLines(text, ids) {
  const want = new Set(ids);
  const out = new Map();
  if (!want.size || typeof text !== "string" || !/^\s*ISO-10303-21/.test(text)) return out;
  let line = 1, start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text.charCodeAt(i) === 10) {
      const m = /^\s*#(\d+)\s*=/.exec(text.slice(start, Math.min(i, start + 40)));
      if (m && want.has(Number(m[1]))) {
        out.set(Number(m[1]), line);
        if (out.size === want.size) break;
      }
      line++; start = i + 1;
    }
  }
  return out;
}

// One annotation per failing or invalid specification (GitHub shows ten
// errors and ten warnings per step, so per element would drown the rest),
// placed on the first failing element's line when the model is STEP text.
// lines: optional Map model -> Map id -> line.
// What the IDS author fixes goes on the IDS file, on the specification's line
// when idsLines (Map ids -> idsSpecLines()) has it: an invalid specification
// (once per IDS file, however many models), an IDS audit warning (once, all of
// a specification's warnings in one annotation; an error under failOnAudit),
// and a specification that left subclass elements unchecked (per model, its
// counts are the model's; an error under failOnUnchecked).
// GitHub drops a step's warnings past the tenth without saying so, and one
// real IDS (Rotterdam's) has 19 specifications with audit warnings, so past
// maxAudit the rest become one annotation pointing at the job summary, which
// lists them all.
export function annotations(runs, { lines = new Map(), idsLines = new Map(), failOnUnchecked = false, failOnAudit = false, maxAudit = 9 } = {}) {
  const out = [];
  const at = (ids, index) => { const l = idsLines.get(ids)?.[index]; return `file=${escProp(ids)}${l ? `,line=${l}` : ""}`; };
  const once = new Set();
  const audits = auditFindings(runs);
  for (const a of audits.slice(0, maxAudit)) {
    const n = a.warnings.length;
    out.push(`::${failOnAudit ? "error" : "warning"} ${at(a.ids, a.index)},title=${escProp(`IDS audit: ${a.name}${n > 1 ? ` (${n} warnings)` : ""}`)}::${escData(a.warnings.join("\n"))}`);
  }
  if (audits.length > maxAudit) {
    const rest = audits.slice(maxAudit);
    const files = [...new Set(rest.map((a) => a.ids))];
    out.push(`::${failOnAudit ? "error" : "warning"} file=${escProp(rest[0].ids)},title=${escProp(`IDS audit: ${rest.length} more specification(s) with warnings`)}::${escData(`Not annotated here (GitHub shows ten warnings per step): ${rest.length} more specification(s) in ${files.join(", ")}. The job summary lists every IDS audit warning.`)}`);
  }
  for (const r of runs) {
    if (r.error) { out.push(`::error file=${escProp(r.model)},title=${escProp("IDS check could not run")}::${escData(r.error)}`); continue; }
    r.report.specs.forEach((s, index) => {
      const nc = notChecked(s);
      if (nc && s.hint) out.push(`::${failOnUnchecked ? "error" : "warning"} ${at(r.ids, index)},title=${escProp(`IDS: ${s.name}: ${nc.toLocaleString("en-US")} element(s) not checked`)}::${escData(`"${s.name}" vs ${r.model}: ${s.hint}`)}`);
      const sev = severity(s);
      if (sev === "pass") return;
      if (s.status === "invalid") {
        const msg = s.note || "The IDS needs fixing before this specification can be checked.";
        const k = `${r.ids}\u0000${index}\u0000${msg}`;
        if (!once.has(k)) { once.add(k); out.push(`::error ${at(r.ids, index)},title=${escProp(`Invalid IDS specification: ${s.name}`)}::${escData(msg)}`); }
        return;
      }
      const first = s.failed[0];
      const line = first && lines.get(r.model)?.get(first.id);
      const where = `file=${escProp(r.model)}${line ? `,line=${line}` : ""}`;
      const msg = s.failed.length
        ? `${failCount(s)} of ${s.applicable} element(s) fail "${s.name}" (${r.ids}). First: ${failLine(first)}`
        : `"${s.name}" (${r.ids}): ${s.note || "fails"}`;
      out.push(`::${sev} ${where},title=${escProp(`IDS: ${s.name}`)}::${escData(msg)}`);
    });
  }
  return out;
}

const mdCell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

export function stepSummary(runs, { maxFailures = 5, failOnUnchecked = false, failOnAudit = false } = {}) {
  const t = tally(runs);
  const ok = t.ok && !(failOnUnchecked && t.elementsNotChecked) && !(failOnAudit && t.auditWarnings);
  const audits = auditFindings(runs);
  const out = [`## IDS model check: ${ok ? "PASS" : "FAIL"}`, ""];
  out.push(`${t.pairs} model/IDS pair(s), ${t.specs} specification check(s): ${t.passed} pass, ${t.failed} fail, ${t.warnings} optional warning(s), ${t.invalid} invalid${t.unreadable ? `, ${t.unreadable} could not be read` : ""}.`, "");
  if (t.elementsNotChecked) out.push(`**Not checked:** ${t.elementsNotChecked.toLocaleString("en-US")} element(s) in ${t.uncheckedSpecs} specification check(s) belong to a subclass of a class the entity facet names (e.g. IFCWALLSTANDARDCASE under IFCWALL). IDS entity names do not include subclasses, so these elements were not checked${failOnUnchecked ? " and the build fails on them (--fail-on-unchecked)" : ""}. Add the class names to the entity facet to check them.`, "");
  if (t.auditWarnings) out.push(`**IDS audit:** ${t.auditWarnings} warning(s) on ${t.auditSpecs} specification(s): the IDS is valid, but these specifications probably do not check what their author meant (details below)${failOnAudit ? "; the build fails on them (--fail-on-audit-warnings)" : ""}. The fix is in the IDS file.`, "");
  out.push("| Model | IDS | Result | Specifications passing | Failing elements | Not checked |", "|---|---|---|---|---|---|");
  for (const r of runs) {
    if (r.error) { out.push(`| ${mdCell(r.model)} | ${mdCell(r.ids)} | ERROR | - | ${mdCell(r.error)} | - |`); continue; }
    const s = r.report.specs;
    const pass = s.filter((x) => x.status === "pass").length;
    const bad = s.reduce((n, x) => n + failCount(x), 0);
    const nc = s.reduce((n, x) => n + notChecked(x), 0);
    const aw = s.some((x) => x.auditWarnings?.length);
    const res = tally([r]).ok && !(failOnUnchecked && nc) && !(failOnAudit && aw) ? "PASS" : "FAIL";
    out.push(`| ${mdCell(r.model)} | ${mdCell(r.report.title || r.ids)} | ${res} | ${pass} of ${s.length} | ${bad} | ${nc} |`);
  }
  for (const r of runs) {
    if (r.error) continue;
    const bad = r.report.specs.filter((s) => severity(s) !== "pass");
    if (!bad.length) continue;
    out.push("", `<details><summary>${mdCell(r.model)} vs ${mdCell(r.ids)}: ${bad.length} specification(s) to fix</summary>`, "");
    for (const s of bad) {
      const label = s.status === "invalid" ? "INVALID" : severity(s) === "warning" ? "OPTIONAL" : "FAIL";
      out.push(`- **[${label}] ${mdCell(s.name)}**: ${s.failed.length ? `${failCount(s)} of ${s.applicable} element(s) fail` : mdCell(s.note || "")}`);
      for (const f of s.failed.slice(0, maxFailures)) out.push(`  - ${mdCell(failLine(f))}`);
      if (failCount(s) > maxFailures) out.push(`  - ... and ${failCount(s) - Math.min(maxFailures, s.failed.length)} more (see the JUnit, JSON or BCF report)`);
    }
    out.push("", "</details>");
  }
  for (const r of runs) {
    if (r.error) continue;
    const un = r.report.specs.filter((s) => notChecked(s) && s.hint);
    if (!un.length) continue;
    out.push("", `<details><summary>${mdCell(r.model)} vs ${mdCell(r.ids)}: ${un.length} specification(s) with elements not checked</summary>`, "");
    for (const s of un) out.push(`- **${mdCell(s.name)}**: ${s.skippedSubclasses.map((x) => `${x.count} ${x.type} (a subclass of ${x.via})`).join(", ")}`);
    out.push("", "</details>");
  }
  const byIds = new Map();
  for (const a of audits) byIds.set(a.ids, [...(byIds.get(a.ids) || []), a]);
  for (const [ids, list] of byIds) {
    out.push("", `<details><summary>${mdCell(ids)}: IDS audit warnings on ${list.length} specification(s)</summary>`, "");
    for (const a of list) for (const w of a.warnings) out.push(`- **${mdCell(a.name)}**: ${mdCell(w)}`);
    out.push("", "</details>");
  }
  out.push("", "Checked by [ids-model-check](https://marisstella.app/ids-model-check/) (MIT). Results are a check against the IDS as written, not a sign-off of the model.");
  return out.join("\n") + "\n";
}

// Minimal glob for the Action's inputs: **, *, ? and {a,b}; '/' separators.
export function globToRegex(glob) {
  let re = "", i = 0;
  const g = glob.replace(/\\/g, "/").replace(/^\.\//, "");
  while (i < g.length) {
    const c = g[i];
    if (c === "*") {
      if (g[i + 1] === "*") {
        const slash = g[i + 2] === "/";
        re += slash ? "(?:.*/)?" : ".*";
        i += slash ? 3 : 2;
        continue;
      }
      re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "{") {
      const end = g.indexOf("}", i);
      if (end < 0) { re += "\\{"; }
      else { re += "(?:" + g.slice(i + 1, end).split(/,/).map((p) => p.replace(/[.+^$()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]")).join("|") + ")"; i = end; }
    } else re += c.replace(/[.+^$()|[\]\\]/g, "\\$&");
    i++;
  }
  return new RegExp("^" + re + "$", "i");
}

// Splits an Action input (newline, comma or space separated) into patterns.
export function patterns(input) {
  // commas inside {a,b} belong to the pattern
  const out = [];
  let cur = "", depth = 0;
  for (const c of String(input || "")) {
    if (c === "{") depth++;
    else if (c === "}" && depth) depth--;
    if (c === "\n" || (c === "," && !depth)) { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

// Which IDS files a model is checked against: every one by default, or with
// pairing "name", only IDS files whose name starts with the model's base name
// (wall.ifc -> wall.ids, wall.structure.ids), falling back to all when none do.
export function pairUp(models, idsFiles, pairing = "all") {
  const base = (p) => p.split("/").pop().replace(/\.(ifc|ifcxml|ifczip|ids|xml)$/i, "").replace(/\.ids$/i, "").toLowerCase();
  const pairs = [];
  for (const m of models) {
    let mine = idsFiles;
    if (pairing === "name") {
      const b = base(m);
      const named = idsFiles.filter((i) => { const ib = base(i); return ib === b || ib.startsWith(b + "."); });
      if (named.length) mine = named;
    }
    for (const i of mine) pairs.push({ model: m, ids: i });
  }
  return pairs;
}
