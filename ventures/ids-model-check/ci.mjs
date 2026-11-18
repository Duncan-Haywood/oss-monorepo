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

// Duplicate GlobalIds (ids.mjs duplicateGlobalIds, IfcRoot rule UR1) belong to
// the model, not to any IDS, so a model checked against three IDS files is told
// once: one entry per model, in run order. The IDS verdict stands; CI fails on
// them only when asked (--fail-on-duplicate-globalids).
export function modelFindings(runs) {
  const seen = new Map();
  for (const r of runs) {
    if (r.error || seen.has(r.model)) continue;
    const d = r.report.duplicateGlobalIds || [];
    if (d.length) seen.set(r.model, { model: r.model, duplicates: d });
  }
  return [...seen.values()];
}
export const dupLine = (d) => `${d.globalId} is held by ${d.elements.length} elements: ${d.elements.map((e) => `#${e.id} ${e.type}${e.name ? ` "${e.name}"` : ""}`).join(", ")}`;
const DUP_WHY = "IFC requires every GlobalId to be unique (IfcRoot rule UR1); BCF viewpoints, model diffs and this report's GitLab issues find elements by GlobalId, so a shared one points them at the wrong element or at both. Usually an authoring-tool copy or a merge of two exports.";

// GlobalIds shared between the models of one run: a federated coordination
// set, one export per discipline. UR1 holds inside one file, so a GlobalId
// held in two discipline files is a fault no single-model check sees, and the
// coordination tools that federate them (BCF topics select by IfcGuid, clash
// and diff tools match by it) then treat two files' elements as one.
// indexes is [{ model, index }], index from ids.mjs globalIdIndex. Three kinds:
// - frame: project, site, building, storeys, spaces or grids of the same
//   class in each file. Discipline files exported from one template or with a
//   copy-monitored grid share these on purpose (every pair of the HHS
//   architect, MEP and structural exports shares its 7), so they are counted,
//   not warned about.
// - revision pairs: two models sharing at least revisionShare of the smaller
//   one's GlobalIds (frame excluded from the shared count) are one model twice (a revision left beside the
//   current file, or a copy), so every element is in the set twice. One
//   finding per pair, not thousands.
// - conflicts: every other shared GlobalId. The same class in both is one
//   element modelled or exported into two disciplines' files (counted twice
//   in quantities); different classes are two elements a viewer cannot tell
//   apart.
// The IDS verdict stands; CI fails on them only when asked
// (--fail-on-shared-globalids).
// Two refinements on top (eval/federation-allow-2026-11-17.md):
// - dependents: a relationship whose holders name only shared GlobalIds
//   (IfcRelDefinesByType, IfcRelAssociatesMaterial of a shared element), and
//   a type such a relationship names, follow an element already reported. They
//   are listed under it (conflict.with), not as findings of their own.
// - allow: rules from parseSharedAllow (a team's list of GlobalIds or classes
//   shared on purpose, such as a survey point copied into every discipline's
//   file). A conflict every holder of which matches a rule moves, with its
//   dependents, to out.allowed; rules that matched nothing are out.allowUnused.
export function crossModelGlobalIds(indexes, { revisionShare = 0.5, minRevision = 10, allow = null } = {}) {
  const empty = { models: indexes.length, conflicts: [], revisions: [], frame: [], pairs: [], allowed: [], allowUnused: [] };
  if (indexes.length < 2) return empty;
  const holders = new Map(); // GlobalId -> [{ m, e }] for GlobalIds in 2+ models
  const firstAt = new Map();
  indexes.forEach(({ index }, m) => {
    for (const [g, e] of index) {
      const f = firstAt.get(g);
      if (f === undefined) { firstAt.set(g, { m, e }); continue; }
      let l = holders.get(g);
      if (!l) holders.set(g, (l = [f]));
      l.push({ m, e });
    }
  });
  const sizes = indexes.map(({ index }) => index.size);
  const pairKey = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  const pairs = new Map();
  const isFrame = (hs) => hs.every((h) => h.e.kind === "frame" && h.e.type === hs[0].e.type);
  for (const hs of holders.values()) {
    const frame = isFrame(hs);
    for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) {
      const k = pairKey(hs[i].m, hs[j].m);
      const p = pairs.get(k) || { a: Math.min(hs[i].m, hs[j].m), b: Math.max(hs[i].m, hs[j].m), shared: 0, frame: 0 };
      p.shared++;
      if (frame) p.frame++;
      pairs.set(k, p);
    }
  }
  const revision = new Set();
  for (const [k, p] of pairs) {
    const rest = p.shared - p.frame;
    p.revision = rest >= minRevision && rest >= revisionShare * Math.min(sizes[p.a], sizes[p.b]);
    if (p.revision) revision.add(k);
  }
  const out = { ...empty };
  const cell = (h) => ({ model: indexes[h.m].model, id: h.e.id, type: h.e.type, name: h.e.name ?? null, kind: h.e.kind ?? "other" });
  for (const [g, hs] of holders) {
    // Only holders in a pair that is not a revision pair count.
    const keep = new Set();
    for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) if (!revision.has(pairKey(hs[i].m, hs[j].m))) { keep.add(i); keep.add(j); }
    if (!keep.size) continue;
    const hk = hs.filter((_, i) => keep.has(i));
    const entry = { globalId: g, sameClass: hk.every((h) => h.e.type === hk[0].e.type), holders: hk.map(cell) };
    (isFrame(hk) ? out.frame : out.conflicts).push(entry);
  }
  const byG = (a, b) => (a.globalId < b.globalId ? -1 : a.globalId > b.globalId ? 1 : 0);
  groupDependents(out, holders);
  if (allow) applyAllow(out, allow);
  out.conflicts.sort(byG);
  out.allowed.sort(byG);
  out.frame.sort(byG);
  out.pairs = [...pairs.values()].sort((x, y) => x.a - y.a || x.b - y.b).map((p) => ({ a: indexes[p.a].model, b: indexes[p.b].model, shared: p.shared, frame: p.frame, sizeA: sizes[p.a], sizeB: sizes[p.b], revision: p.revision }));
  out.revisions = out.pairs.filter((p) => p.revision);
  return out;
}
// Moves conflicts that only follow other shared objects under them.
function groupDependents(out, holders) {
  const shared = new Map(); // GlobalId -> conflict entry, or "frame"
  for (const c of out.conflicts) shared.set(c.globalId, c);
  for (const c of out.frame) shared.set(c.globalId, "frame");
  const refsOf = (c) => {
    const hs = holders.get(c.globalId);
    if (!hs.every((h) => Array.isArray(h.e.refs) && h.e.refs.length)) return null;
    return [...new Set(hs.flatMap((h) => h.e.refs))];
  };
  const dep = new Map(); // dependent GlobalId -> the primary conflicts it follows
  // A relationship is dependent when, in every model holding it, everything it
  // names is shared, and at least one of those is a non-relationship conflict.
  for (const c of out.conflicts) {
    const refs = refsOf(c);
    if (!refs || !refs.every((g) => shared.has(g))) continue;
    if (!refs.some((g) => shared.get(g) !== "frame" && !holders.get(g)[0].e.refs)) continue;
    dep.set(c.globalId, refs);
  }
  // A type (or other non-element, non-relationship) is dependent when a
  // dependent relationship names it next to an element conflict.
  const elementRefs = (refs) => refs.filter((g) => shared.get(g) !== "frame" && shared.get(g)?.holders[0].kind === "element");
  for (const [, refs] of [...dep]) {
    const els = elementRefs(refs);
    if (!els.length) continue;
    for (const g of refs) {
      const c = shared.get(g);
      if (c && c !== "frame" && c.holders[0].kind === "other" && !holders.get(g)[0].e.refs && !dep.has(g)) dep.set(g, els);
    }
  }
  // Each dependent goes under its primaries: the element conflicts it reaches
  // (through a dependent type for a relationship that names only a type).
  const primariesOf = (g, seen = new Set()) => {
    if (seen.has(g)) return [];
    seen.add(g);
    const refs = dep.get(g);
    if (!refs) return shared.get(g) && shared.get(g) !== "frame" ? [g] : [];
    return [...new Set(refs.flatMap((r) => primariesOf(r, seen)))];
  };
  const keep = [];
  for (const c of out.conflicts) {
    if (!dep.has(c.globalId)) { keep.push(c); continue; }
    const ps = primariesOf(c.globalId).filter((p) => p !== c.globalId && !dep.has(p));
    if (!ps.length) { keep.push(c); continue; }
    const brief = { globalId: c.globalId, type: c.holders[0].type, name: c.holders[0].name, models: c.holders.length, follows: ps };
    for (const p of ps) (shared.get(p).with ||= []).push(brief);
  }
  // A relationship left as a finding whose holders name different objects:
  // one GlobalId for two different relationships. A viewer merging by
  // GlobalId keeps one and drops the other's links.
  for (const c of keep) {
    const hs = holders.get(c.globalId);
    if (!hs.every((h) => Array.isArray(h.e.refs))) continue;
    const key = (h) => [...new Set(h.e.refs)].sort().join(",");
    if (hs.some((h) => key(h) !== key(hs[0]))) c.contentsDiffer = true;
  }
  out.conflicts = keep;
}

// A team's allow list: one rule per line, "#" starts a comment. A GlobalId's
// first character carries 2 bits, so it is 0-3; that tells it from a class.
//   3Fit2Fad92zf2f6aWdJtF5            a GlobalId
//   IFCBUILDINGELEMENTPROXY "origin"  a class and a name ("*" in the name matches any run)
//   IFCGRID                           a class (any name)
//   * "geo-reference"                 a name, any class
export function parseSharedAllow(text) {
  const rules = [];
  const errors = [];
  String(text).split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/(^|\s)#.*$/, "").trim();
    if (!line) return;
    let m;
    if ((m = /^([0-3][0-9A-Za-z_$]{21})$/.exec(line))) rules.push({ line: i + 1, text: line, globalId: m[1] });
    else if ((m = /^(\*|IFC[A-Z0-9_]+)(?:\s+"([^"]*)")?$/i.exec(line))) {
      const cls = m[1] === "*" ? null : m[1].toUpperCase();
      if (!cls && m[2] === undefined) { errors.push(`line ${i + 1}: "*" needs a name ("*" "origin")`); return; }
      const name = m[2] === undefined ? null : new RegExp(`^${m[2].replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`, "i");
      rules.push({ line: i + 1, text: line, cls, name });
    } else errors.push(`line ${i + 1}: not a GlobalId, a class or a class with a quoted name: ${line}`);
  });
  return { rules, errors };
}
function applyAllow(out, allow) {
  const used = new Set();
  const matches = (c) => {
    const hit = new Set();
    for (const h of c.holders) {
      const r = allow.rules.find((r) => (r.globalId ? r.globalId === c.globalId : (!r.cls || r.cls === h.type) && (!r.name || (h.name != null && r.name.test(h.name)))));
      if (!r) return null;
      hit.add(r);
    }
    return hit;
  };
  const keep = [];
  for (const c of out.conflicts) {
    const hit = matches(c);
    if (!hit) { keep.push(c); continue; }
    for (const r of hit) used.add(r);
    c.allowedBy = [...hit].map((r) => r.line);
    out.allowed.push(c);
  }
  // A dependent under more than one element stays only while one is reported.
  const allowedIds = new Set(out.allowed.map((c) => c.globalId));
  for (const c of out.allowed) c.with = (c.with || []).filter((d) => d.follows.every((p) => allowedIds.has(p)));
  for (const c of keep) {
    if (!c.with) continue;
    for (const d of c.with) d.follows = d.follows.filter((p) => !allowedIds.has(p));
  }
  out.conflicts = keep;
  out.allowUnused = allow.rules.filter((r) => !used.has(r)).map((r) => ({ line: r.line, rule: r.text }));
}

const holderLine = (h) => `${h.model} #${h.id} ${h.type}${h.name ? ` "${h.name}"` : ""}`;
const withLine = (c) => (c.with?.length ? `; with it: ${c.with.map((d) => `${d.type}${d.name ? ` "${d.name}"` : ""} ${d.globalId}`).join(", ")}` : "");
export const sharedLine = (c) => `${c.globalId} is in ${c.holders.length} models: ${c.holders.map(holderLine).join(", ")}${withLine(c)} (${!c.sameClass ? "different objects: viewers and BCF topics cannot tell them apart" : c.contentsDiffer ? "one GlobalId for relationships that link different objects in each model: a viewer merging by GlobalId keeps one and drops the others' links" : c.holders[0].kind === "element" ? "the same element in more than one model's file: counted twice in quantities" : "the same object in more than one model's file"})`;
export const revisionLine = (p) => `${p.b} shares ${p.shared - p.frame} of ${Math.min(p.sizeA, p.sizeB)} GlobalIds with ${p.a}: one model twice (a revision or a copy), so every element is in the set twice`;
export const sharedCount = (f) => (f ? f.conflicts.length + f.revisions.length : 0);
const SHARED_WHY = "GlobalIds must be unique across a federated set as well as within a file: BCF topics, clash and diff tools find elements by GlobalId, so one held in two discipline models points them at both.";

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

export function tally(runs, federation = null) {
  const t = { pairs: runs.length, unreadable: 0, specs: 0, passed: 0, failed: 0, warnings: 0, invalid: 0, elementsFailed: 0, uncheckedSpecs: 0, elementsNotChecked: 0, auditSpecs: 0, auditWarnings: 0, duplicateModels: 0, duplicateGlobalIds: 0 };
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
  for (const m of modelFindings(runs)) { t.duplicateModels++; t.duplicateGlobalIds += m.duplicates.length; }
  t.sharedGlobalIds = federation ? federation.conflicts.length : 0;
  t.revisionPairs = federation ? federation.revisions.length : 0;
  t.sharedFrame = federation ? federation.frame.length : 0;
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
  if (want.size && text instanceof Uint8Array) return stepLinesBytes(text, want, out);
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

// stepLines on a file's bytes (readModel's `bytes`), so the CI runner need
// not hold the model as a string beside its parsed copy: a line starting
// with whitespace, #, digits, whitespace, "=" within its first 40 bytes.
function stepLinesBytes(b, want, out) {
  if (!/^\s*ISO-10303-21/.test(new TextDecoder().decode(b.subarray(0, 64)))) return out;
  const ws = (c) => c === 32 || (c >= 9 && c <= 13);
  let line = 1, start = 0;
  for (let i = 0; i <= b.length; i++) {
    if (i === b.length || b[i] === 10) {
      const end = Math.min(i, start + 40);
      let j = start;
      while (j < end && ws(b[j])) j++;
      if (b[j] === 35 && j < end) {
        let k = j + 1, id = 0;
        while (k < end && b[k] >= 48 && b[k] <= 57) { id = id * 10 + (b[k] - 48); k++; }
        let q = k;
        while (q < end && ws(b[q])) q++;
        if (k > j + 1 && q < end && b[q] === 61 && want.has(id)) {
          out.set(id, line);
          if (out.size === want.size) break;
        }
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
export function annotations(runs, { lines = new Map(), idsLines = new Map(), failOnUnchecked = false, failOnAudit = false, failOnDuplicates = false, maxAudit = 9, federation = null, failOnShared = false } = {}) {
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
  // Duplicate GlobalIds: one annotation per model, on the line of the first
  // element that repeats an earlier one's GlobalId.
  for (const m of modelFindings(runs)) {
    const d = m.duplicates;
    const line = lines.get(m.model)?.get(d[0].elements[1].id);
    const shown = d.slice(0, 5).map(dupLine).join("\n");
    out.push(`::${failOnDuplicates ? "error" : "warning"} file=${escProp(m.model)}${line ? `,line=${line}` : ""},title=${escProp(`IFC: ${d.length} duplicate GlobalId(s)`)}::${escData(`${shown}${d.length > 5 ? `\n... and ${d.length - 5} more (the job summary lists them)` : ""}\n${DUP_WHY}`)}`);
  }
  // GlobalIds shared between models: one annotation per later model, on the
  // line of its first shared element; one per revision pair.
  if (federation) {
    const lvl = failOnShared ? "error" : "warning";
    const byModel = new Map();
    for (const c of federation.conflicts) { const m = c.holders[c.holders.length - 1].model; byModel.set(m, [...(byModel.get(m) || []), c]); }
    for (const [m, cs] of byModel) {
      const h = cs[0].holders[cs[0].holders.length - 1];
      const line = lines.get(m)?.get(h.id);
      out.push(`::${lvl} file=${escProp(m)}${line ? `,line=${line}` : ""},title=${escProp(`IFC: ${cs.length} GlobalId(s) also in another model`)}::${escData(`${cs.slice(0, 5).map(sharedLine).join("\n")}${cs.length > 5 ? `\n... and ${cs.length - 5} more (the job summary lists them)` : ""}\n${SHARED_WHY}`)}`);
    }
    for (const p of federation.revisions) out.push(`::${lvl} file=${escProp(p.b)},title=${escProp("IFC: the same model twice in the set")}::${escData(`${revisionLine(p)}. Drop one from the models glob, or check whether a revision was left beside the current file.`)}`);
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

// GitLab Code Quality report (artifacts:reports:codequality): a JSON array of
// issues, each { description, check_name, fingerprint, severity, location:
// { path, lines: { begin } } }. GitLab shows them in the merge request widget
// as new or resolved by comparing fingerprints with the target branch's report,
// and inline on changed lines of the diff. So, unlike the GitHub annotations
// (ten per step), there is one issue per failing element, keyed on its
// GlobalId and class, not its #id or line: a re-export renumbers #ids and
// moves lines, but the widget then still says which walls this merge request
// broke or fixed. The class is in the key because real exports repeat
// GlobalIds (HHS construction2.ifc gives a column the GlobalId of a slab), and
// a shared key would shift a fingerprint suffix onto the wrong element.
// The rest are the same findings the annotations make: audit warnings and
// invalid specifications once per IDS file on the specification's line, not-
// checked subclasses per model, an unreadable file. Past maxPerSpec failing
// elements of one specification, one issue says how many more (its fingerprint
// is the specification's, so a count that changes stays one issue).
// Which elements get their own issue is chosen by GlobalId order, not model
// order: a re-export can reorder the file (BIMserver's copy of the HHS MEP
// model does), and taking the first N in file order would then report up to N
// different elements as new and N as resolved. The default, 1,000, is every
// element a report lists (--max-failures): a cap hides the elements past it,
// and on the HHS revisions a cap of 50 hid every real change
// (eval/gitlab-codequality-2026-11-17.md).
// pathPrefix is prepended to every path: GitLab needs paths from the
// repository root, and ci-cli.mjs may have read the files under --root.
export function codeQuality(runs, { lines = new Map(), idsLines = new Map(), failOnUnchecked = false, failOnAudit = false, failOnDuplicates = false, maxPerSpec = 1000, pathPrefix = "", federation = null, failOnShared = false } = {}) {
  const out = [];
  const seen = new Set();
  const p = (path) => (pathPrefix ? `${pathPrefix.replace(/\/+$/, "")}/${path}` : path);
  const push = (check_name, severity, description, path, line, key) => {
    let fingerprint = cqHash([check_name, ...key].join("\u0000"));
    // Two distinct findings must not share a fingerprint (GitLab would show one).
    for (let n = 1; seen.has(fingerprint); n++) fingerprint = cqHash([check_name, ...key, n].join("\u0000"));
    seen.add(fingerprint);
    out.push({ type: "issue", check_name, description, categories: ["Bug Risk"], severity, fingerprint, location: { path: p(path), lines: { begin: line || 1 } } });
  };
  const specLine = (ids, index) => idsLines.get(ids)?.[index];
  for (const a of auditFindings(runs)) {
    for (const w of a.warnings) push("ids-audit", failOnAudit ? "major" : "minor", `IDS audit: "${a.name}": ${w}`, a.ids, specLine(a.ids, a.index), [a.ids, a.name, w]);
  }
  // One issue per duplicated GlobalId, keyed on the model and the GlobalId, so
  // a merge request that introduces one shows it as new and one that fixes it
  // as resolved.
  for (const m of modelFindings(runs)) {
    for (const d of m.duplicates) push("ifc-duplicate-globalid", failOnDuplicates ? "major" : "minor", `Duplicate GlobalId: ${dupLine(d)}. ${DUP_WHY}`, m.model, lines.get(m.model)?.get(d.elements[1].id), [m.model, d.globalId]);
  }
  // One issue per GlobalId shared between models, keyed on the GlobalId and
  // the models holding it (not #ids or lines, which a re-export moves).
  if (federation) {
    for (const c of federation.conflicts) {
      const h = c.holders[c.holders.length - 1];
      push("ifc-shared-globalid", failOnShared ? "major" : "minor", `GlobalId shared between models: ${sharedLine(c)}. ${SHARED_WHY}`, h.model, lines.get(h.model)?.get(h.id), [c.globalId, ...c.holders.map((x) => x.model).sort()]);
    }
    for (const p of federation.revisions) push("ifc-model-twice", failOnShared ? "major" : "minor", `${revisionLine(p)}.`, p.b, 1, [p.a, p.b]);
  }
  const once = new Set();
  for (const r of runs) {
    if (r.error) { push("ids-unreadable", "blocker", `IDS check could not run (${r.model} vs ${r.ids}): ${r.error}`, r.model, 1, [r.model, r.ids]); continue; }
    r.report.specs.forEach((s, index) => {
      const nc = notChecked(s);
      if (nc && s.hint) push("ids-not-checked", failOnUnchecked ? "major" : "minor", `"${s.name}" vs ${r.model}: ${nc.toLocaleString("en-US")} element(s) not checked. ${s.hint}`, r.ids, specLine(r.ids, index), [r.ids, s.name, r.model]);
      const sev = severity(s);
      if (sev === "pass") return;
      if (s.status === "invalid") {
        const msg = s.note || "The IDS needs fixing before this specification can be checked.";
        const k = `${r.ids}\u0000${index}\u0000${msg}`;
        if (!once.has(k)) { once.add(k); push("ids-invalid-specification", "blocker", `Invalid IDS specification "${s.name}": ${msg}`, r.ids, specLine(r.ids, index), [r.ids, s.name, msg]); }
        return;
      }
      const level = sev === "error" ? "critical" : "minor";
      const name = sev === "error" ? (s.optionality === "prohibited" ? "ids-prohibited" : "ids-required") : "ids-optional";
      const ln = lines.get(r.model);
      if (!s.failed.length) { push(name, level, `"${s.name}" (${r.ids}): ${s.note || "fails"}`, r.model, 1, [r.model, r.ids, s.name]); return; }
      for (const f of cqElements(s, maxPerSpec)) push(name, level, `"${s.name}" (${r.ids}): ${failLine(f)}`, r.model, ln?.get(f.id), [r.model, r.ids, s.name, f.globalId ? `${f.globalId} ${f.type}` : `#${f.id}`]);
      const more = failCount(s) - Math.min(maxPerSpec, s.failed.length);
      if (more > 0) push(name, level, `"${s.name}" (${r.ids}): ${more.toLocaleString("en-US")} more element(s) fail (${failCount(s).toLocaleString("en-US")} of ${s.applicable.toLocaleString("en-US")} in all; the JUnit, JSON or BCF report lists them).`, r.model, ln?.get(s.failed[0].id), [r.model, r.ids, s.name, "more"]);
    });
  }
  return out;
}

// The failing elements of a specification that get their own GitLab issue:
// the first max by GlobalId (then #id), so the pick does not depend on file
// order. ci-cli.mjs asks stepLines() for the lines of exactly these.
export function cqElements(s, max = 1000) {
  const key = (f) => f.globalId || "";
  return [...s.failed].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : a.id - b.id)).slice(0, max);
}

// A 128-bit hex fingerprint with no dependencies (ci.mjs does no I/O and
// imports nothing): four 32-bit FNV-1a-style lanes with different seeds over
// the UTF-16 code units, then mixed. Stable across runs and platforms, which is
// all GitLab needs of it; not a security hash.
export function cqHash(s) {
  const h = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    for (let k = 0; k < 4; k++) h[k] = Math.imul(h[k] ^ c ^ (k << 8), 0x01000193 + 2 * k);
  }
  return h.map((x, k) => {
    x ^= h[(k + 1) & 3] >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12; x = Math.imul(x, 0x297a2d39); x ^= x >>> 15;
    return (x >>> 0).toString(16).padStart(8, "0");
  }).join("");
}

const mdCell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

export function stepSummary(runs, { maxFailures = 5, failOnUnchecked = false, failOnAudit = false, failOnDuplicates = false, maxDuplicates = 50, federation = null, failOnShared = false } = {}) {
  const t = tally(runs, federation);
  const ok = t.ok && !(failOnUnchecked && t.elementsNotChecked) && !(failOnAudit && t.auditWarnings) && !(failOnDuplicates && t.duplicateGlobalIds) && !(failOnShared && sharedCount(federation));
  const audits = auditFindings(runs);
  const out = [`## IDS model check: ${ok ? "PASS" : "FAIL"}`, ""];
  out.push(`${t.pairs} model/IDS pair(s), ${t.specs} specification check(s): ${t.passed} pass, ${t.failed} fail, ${t.warnings} optional warning(s), ${t.invalid} invalid${t.unreadable ? `, ${t.unreadable} could not be read` : ""}.`, "");
  if (t.elementsNotChecked) out.push(`**Not checked:** ${t.elementsNotChecked.toLocaleString("en-US")} element(s) in ${t.uncheckedSpecs} specification check(s) belong to a subclass of a class the entity facet names (e.g. IFCWALLSTANDARDCASE under IFCWALL). IDS entity names do not include subclasses, so these elements were not checked${failOnUnchecked ? " and the build fails on them (--fail-on-unchecked)" : ""}. Add the class names to the entity facet to check them.`, "");
  if (t.auditWarnings) out.push(`**IDS audit:** ${t.auditWarnings} warning(s) on ${t.auditSpecs} specification(s): the IDS is valid, but these specifications probably do not check what their author meant (details below)${failOnAudit ? "; the build fails on them (--fail-on-audit-warnings)" : ""}. The fix is in the IDS file.`, "");
  if (t.duplicateGlobalIds) out.push(`**Duplicate GlobalIds:** ${t.duplicateGlobalIds.toLocaleString("en-US")} GlobalId(s) shared by more than one element in ${t.duplicateModels} model(s) (details below). ${DUP_WHY}${failOnDuplicates ? " The build fails on them (--fail-on-duplicate-globalids)." : ""}`, "");
  if (sharedCount(federation)) out.push(`**GlobalIds shared between models:** ${[t.sharedGlobalIds ? `${t.sharedGlobalIds.toLocaleString("en-US")} GlobalId(s) held in more than one of the ${federation.models} models` : "", t.revisionPairs ? `${t.revisionPairs} pair(s) of models that are one model twice` : ""].filter(Boolean).join("; ")} (details below). ${SHARED_WHY}${failOnShared ? " The build fails on them (--fail-on-shared-globalids)." : ""}`, "");
  if (federation?.allowed?.length) out.push(`**Shared on purpose:** ${federation.allowed.length} shared GlobalId(s) matched the team's allow list (${federation.allowed.map((c) => `${c.holders[0].type}${c.holders[0].name ? ` "${c.holders[0].name}"` : ""}`).filter((x, i, a) => a.indexOf(x) === i).slice(0, 5).join(", ")}${federation.allowed.length > 5 ? ", ..." : ""}), with ${federation.allowed.reduce((n, c) => n + (c.with?.length || 0), 0)} type(s) and relationship(s) that follow them. Not counted.`, "");
  if (federation?.allowUnused?.length) out.push(`**Allow list:** ${federation.allowUnused.map((u) => `line ${u.line} (\`${u.rule}\`)`).join(", ")} matched nothing shared in this run. A rule left from an earlier model set can hide a new mistake later; drop it if it is stale.`, "");
  if (t.sharedFrame) out.push(`**Shared frame:** ${t.sharedFrame} project, site, building, storey, space or grid GlobalId(s) are the same in more than one model. Discipline files exported from one template usually share these on purpose, so they are not a warning.`, "");
  out.push("| Model | IDS | Result | Specifications passing | Failing elements | Not checked |", "|---|---|---|---|---|---|");
  for (const r of runs) {
    if (r.error) { out.push(`| ${mdCell(r.model)} | ${mdCell(r.ids)} | ERROR | - | ${mdCell(r.error)} | - |`); continue; }
    const s = r.report.specs;
    const pass = s.filter((x) => x.status === "pass").length;
    const bad = s.reduce((n, x) => n + failCount(x), 0);
    const nc = s.reduce((n, x) => n + notChecked(x), 0);
    const aw = s.some((x) => x.auditWarnings?.length);
    const dup = (r.report.duplicateGlobalIds || []).length;
    const res = tally([r]).ok && !(failOnUnchecked && nc) && !(failOnAudit && aw) && !(failOnDuplicates && dup) ? "PASS" : "FAIL";
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
  for (const m of modelFindings(runs)) {
    out.push("", `<details><summary>${mdCell(m.model)}: ${m.duplicates.length} duplicate GlobalId(s)</summary>`, "");
    for (const d of m.duplicates.slice(0, maxDuplicates)) out.push(`- ${mdCell(dupLine(d))}`);
    if (m.duplicates.length > maxDuplicates) out.push(`- ... and ${m.duplicates.length - maxDuplicates} more (see the JSON report)`);
    out.push("", "</details>");
  }
  if (sharedCount(federation)) {
    out.push("", `<details><summary>GlobalIds shared between models: ${sharedCount(federation)} finding(s)</summary>`, "");
    for (const p of federation.revisions) out.push(`- ${mdCell(revisionLine(p))}`);
    for (const c of federation.conflicts.slice(0, maxDuplicates)) out.push(`- ${mdCell(sharedLine(c))}`);
    if (federation.conflicts.length > maxDuplicates) out.push(`- ... and ${federation.conflicts.length - maxDuplicates} more (see the JSON report)`);
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
