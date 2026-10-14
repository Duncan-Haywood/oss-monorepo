// Reachability triage of `npm audit --json`. Pure functions, shared by the page and the CLI.
export const SEVERITIES = ['critical', 'high', 'moderate', 'low', 'info'];
export const BUCKETS = ['imported', 'via-imported', 'test-only', 'not-referenced'];

const SEV_WEIGHT = { critical: 100, high: 70, moderate: 40, low: 15, info: 5 };
const BUCKET_WEIGHT = { imported: 1, 'via-imported': 0.7, 'test-only': 0.25, 'not-referenced': 0.1 };

// A package name from a module specifier: "@scope/pkg/sub" -> "@scope/pkg", "lodash/fp" -> "lodash".
// Relative paths, absolute paths and node: builtins are not packages.
export function packageOfSpecifier(spec) {
  const s = String(spec).trim();
  if (!s || s.startsWith('.') || s.startsWith('/') || s.startsWith('node:') || /^[a-z]+:/i.test(s)) return null;
  const parts = s.split('/');
  if (s.startsWith('@')) return parts.length >= 2 && parts[1] ? `${parts[0]}/${parts[1]}` : null;
  return parts[0];
}

const IMPORT_RES = [
  /\bimport\s+(?:[\w$*{}\s,]+?\s+from\s+)?['"]([^'"\n]+)['"]/g, // import x from 'p' / import 'p'
  /\bexport\s+(?:\*|\{[^}]*\})\s+from\s+['"]([^'"\n]+)['"]/g,   // export * from 'p'
  /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,                   // require('p')
  /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,                    // import('p')
];

// Returns a Set of package names imported by one source text.
export function extractImports(text) {
  const found = new Set();
  // Drop comments so a commented-out require does not count as use.
  const src = String(text).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
  for (const re of IMPORT_RES) {
    re.lastIndex = 0;
    for (const m of src.matchAll(re)) {
      const p = packageOfSpecifier(m[1]);
      if (p) found.add(p);
    }
  }
  return found;
}

const TEST_PATH = /(^|[\\/])(test|tests|__tests__|__mocks__|spec|e2e|cypress|fixtures|stories)([\\/]|$)|\.(test|spec|stories)\.[cm]?[jt]sx?$|(^|[\\/])(jest|vitest|vite|webpack|rollup|eslint|babel|karma|playwright|cypress|gulpfile|Gruntfile)[\w.-]*\.[cm]?[jt]s$/i;
export function isTestPath(path) { return TEST_PATH.test(String(path)); }

// files: [{ path, text }] -> Map<package, { runtime: [paths], test: [paths] }>
export function buildUsage(files) {
  const usage = new Map();
  for (const f of files) {
    for (const p of extractImports(f.text)) {
      if (!usage.has(p)) usage.set(p, { runtime: [], test: [] });
      usage.get(p)[isTestPath(f.path) ? 'test' : 'runtime'].push(f.path);
    }
  }
  return usage;
}

// Normalise npm audit output (v7+ "vulnerabilities", or v6 "advisories") to
// [{ name, severity, direct, advisories: [{title,url,range}], effects: [names], fix }]
export function parseAudit(input) {
  let data = input;
  if (typeof input === 'string') {
    try { data = JSON.parse(input); } catch { return { error: 'That is not valid JSON. Paste the output of `npm audit --json`' }; }
  }
  if (!data || typeof data !== 'object') return { error: 'Expected the JSON object printed by `npm audit --json`' };
  if (data.error) return { error: `npm audit reported an error: ${data.error.summary || data.error.code || 'unknown'}` };
  const out = [];
  if (data.vulnerabilities && typeof data.vulnerabilities === 'object') {
    for (const [name, v] of Object.entries(data.vulnerabilities)) {
      const advisories = (v.via || []).filter((x) => x && typeof x === 'object')
        .map((x) => ({ title: x.title || 'advisory', url: x.url || '', range: x.range || '', severity: x.severity || v.severity }));
      const fix = v.fixAvailable;
      out.push({
        name, severity: SEVERITIES.includes(v.severity) ? v.severity : 'info', direct: Boolean(v.isDirect),
        advisories, effects: Array.isArray(v.effects) ? v.effects : [],
        fix: fix === true ? 'npm audit fix' : fix && typeof fix === 'object' ? `upgrade ${fix.name}@${fix.version}${fix.isSemVerMajor ? ' (major)' : ''}` : 'no fix available',
      });
    }
    return { entries: out, format: 'npm7+' };
  }
  if (data.advisories && typeof data.advisories === 'object') {
    const byName = new Map();
    for (const a of Object.values(data.advisories)) {
      const name = a.module_name; if (!name) continue;
      if (!byName.has(name)) byName.set(name, { name, severity: 'info', direct: false, advisories: [], effects: [], fix: a.patched_versions && a.patched_versions !== '<0.0.0' ? `patched in ${a.patched_versions}` : 'no fix available' });
      const e = byName.get(name);
      if (SEVERITIES.indexOf(a.severity) >= 0 && SEVERITIES.indexOf(a.severity) < SEVERITIES.indexOf(e.severity)) e.severity = a.severity;
      e.advisories.push({ title: a.title || 'advisory', url: a.url || '', range: a.vulnerable_versions || '', severity: a.severity });
    }
    return { entries: [...byName.values()], format: 'npm6' };
  }
  if (data.metadata && data.metadata.vulnerabilities) return { entries: [], format: 'npm7+' };
  return { error: 'No "vulnerabilities" or "advisories" key found. Is this `npm audit --json` output?' };
}

// Walk "effects" (packages that depend on the vulnerable one) looking for something the code imports.
function reachableParents(entry, byName, usage) {
  const seen = new Set([entry.name]);
  const queue = [...entry.effects];
  const hits = [];
  while (queue.length) {
    const n = queue.shift();
    if (seen.has(n)) continue;
    seen.add(n);
    const u = usage.get(n);
    if (u) hits.push({ name: n, ...u });
    const e = byName.get(n);
    if (e) queue.push(...e.effects);
  }
  return hits;
}

export function triage(auditInput, files, opts = {}) {
  const parsed = parseAudit(auditInput);
  if (parsed.error) return { error: parsed.error };
  const usage = buildUsage(files || []);
  const byName = new Map(parsed.entries.map((e) => [e.name, e]));
  const items = parsed.entries.map((e) => {
    const own = usage.get(e.name);
    let bucket; let evidence = [];
    if (own && own.runtime.length) { bucket = 'imported'; evidence = own.runtime; }
    else {
      const parents = reachableParents(e, byName, usage).filter((p) => p.runtime.length);
      if (parents.length) { bucket = 'via-imported'; evidence = parents.map((p) => `${p.name} (${p.runtime[0]})`); }
      else if (own && own.test.length) { bucket = 'test-only'; evidence = own.test; }
      else if (reachableParents(e, byName, usage).length) { bucket = 'test-only'; evidence = ['only via a package imported from test or tooling files']; }
      else bucket = 'not-referenced';
    }
    return { ...e, bucket, evidence: [...new Set(evidence)].slice(0, 5), score: Math.round(SEV_WEIGHT[e.severity] * BUCKET_WEIGHT[bucket]) };
  });
  items.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const counts = Object.fromEntries(BUCKETS.map((b) => [b, items.filter((i) => i.bucket === b).length]));
  const urgent = items.filter((i) => (i.bucket === 'imported' || i.bucket === 'via-imported') && SEV_WEIGHT[i.severity] >= SEV_WEIGHT.high);
  return { items, counts, urgent, total: items.length, filesScanned: (files || []).length };
}

export function summaryLine(r) {
  if (!r.total) return 'npm audit found no vulnerabilities.';
  return `${r.total} vulnerable package(s): ${r.counts.imported} imported by your code, ${r.counts['via-imported']} reached through a package you import, ${r.counts['test-only']} only in test/tooling files, ${r.counts['not-referenced']} not referenced in the ${r.filesScanned} file(s) scanned.`;
}
