// Reachability triage of `cargo audit --json`. Pure functions, shared by the page and the CLI.
export const BUCKETS = ['imported', 'test-only', 'not-referenced'];

const BUCKET_WEIGHT = { imported: 100, 'test-only': 25, 'not-referenced': 10 };

// Crate names are imported with "-" written as "_": `serde-json` -> `serde_json`.
export function crateIdent(name) {
  return String(name).trim().toLowerCase().replace(/-/g, '_');
}

// Strip comments and string literals so `// use foo::bar;` or a doc example does not count.
function stripNoise(text) {
  return String(text)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/r(#*)"[\s\S]*?"\1/g, '""')
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/\/\/[^\n]*/g, '');
}

// Root crate identifiers named by one Rust source text (lowercased).
// Reads `use a::b`, `use {a, b::c}`, `extern crate a`, `pub use`, and path expressions `a::f()`.
export function extractCrates(text) {
  const found = new Set();
  const src = stripNoise(text);
  for (const m of src.matchAll(/\bextern\s+crate\s+([A-Za-z_]\w*)/g)) found.add(m[1].toLowerCase());
  for (const m of src.matchAll(/\buse\s+(::)?([A-Za-z_]\w*)\s*(::|;|\bas\b)/g)) found.add(m[2].toLowerCase());
  for (const m of src.matchAll(/\buse\s+(?:::)?\{([^;]*)\}\s*;/g)) {
    // top-level braces: `use {serde::Serialize, tokio};` -> split on commas outside nested braces.
    let depth = 0; let cur = ''; const parts = [];
    for (const ch of m[1]) {
      if (ch === '{') depth++; if (ch === '}') depth--;
      if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
    }
    parts.push(cur);
    for (const p of parts) { const id = p.trim().match(/^(?:::)?([A-Za-z_]\w*)/); if (id) found.add(id[1].toLowerCase()); }
  }
  // Fully-qualified path use: `reqwest::get(...)`, `::tokio::spawn`.
  for (const m of src.matchAll(/(?:^|[^\w:.])(?:::)?([A-Za-z_]\w*)::[A-Za-z_]/g)) found.add(m[1].toLowerCase());
  return found;
}

const TEST_PATH = /(^|[\\/])(tests?|benches|examples|fuzz|xtask|target)([\\/]|$)|(^|[\\/])(build\.rs|[^\\/]*_tests?\.rs)$/i;
export function isTestPath(path) { return TEST_PATH.test(String(path)); }

// files: [{ path, text }] -> Map<crateIdent, { runtime: [paths], test: [paths] }>
export function buildUsage(files) {
  const usage = new Map();
  for (const f of files) {
    for (const c of extractCrates(f.text)) {
      if (!usage.has(c)) usage.set(c, { runtime: [], test: [] });
      usage.get(c)[isTestPath(f.path) ? 'test' : 'runtime'].push(f.path);
    }
  }
  return usage;
}

// Normalise `cargo audit --json` into one entry per crate:
// [{ name, version, vulns: [{id, aliases, title, patched, kind}], kind, fixVersions }].
// `kind` is "vulnerability" for advisories and the warning kind (unmaintained, unsound, yanked)
// otherwise; informational warnings rank below real vulnerabilities.
export function parseAudit(input) {
  let data = input;
  if (typeof input === 'string') {
    try { data = JSON.parse(input); } catch { return { error: 'That is not valid JSON. Paste the output of `cargo audit --json`' }; }
  }
  if (!data || typeof data !== 'object' || (!data.vulnerabilities && !data.warnings)) {
    return { error: 'No "vulnerabilities" object found. Is this `cargo audit --json` output?' };
  }
  const byCrate = new Map();
  const add = (pkg, advisory, versions, kind) => {
    if (!pkg || !pkg.name) return;
    const key = `${pkg.name}@${pkg.version || ''}`;
    if (!byCrate.has(key)) byCrate.set(key, { name: String(pkg.name), version: String(pkg.version || ''), vulns: [] });
    const patched = versions && Array.isArray(versions.patched) ? versions.patched.map(String) : [];
    const a = advisory || {};
    byCrate.get(key).vulns.push({
      id: String(a.id || 'advisory'), aliases: Array.isArray(a.aliases) ? a.aliases.map(String) : [],
      title: String(a.title || a.description || ''), patched, kind,
    });
  };
  const list = data.vulnerabilities && Array.isArray(data.vulnerabilities.list) ? data.vulnerabilities.list : [];
  for (const v of list) add(v.package || (v.advisory && { name: v.advisory.package }), v.advisory, v.versions, 'vulnerability');
  const warnings = data.warnings && typeof data.warnings === 'object' ? data.warnings : {};
  for (const [kind, arr] of Object.entries(warnings)) {
    if (!Array.isArray(arr)) continue;
    for (const w of arr) add(w.package, w.advisory, w.versions, w.kind || kind);
  }
  const entries = [...byCrate.values()].map((e) => ({
    ...e,
    kind: e.vulns.some((v) => v.kind === 'vulnerability') ? 'vulnerability' : e.vulns[0].kind,
    fixVersions: [...new Set(e.vulns.flatMap((v) => v.patched))],
  }));
  return { entries };
}

export function fixText(e) {
  if (e.kind !== 'vulnerability' && !e.fixVersions.length) return `${e.kind} warning: no patched version; look for a maintained replacement`;
  if (!e.fixVersions.length) return 'no patched version listed';
  const perVuln = e.vulns.filter((v) => v.kind === 'vulnerability').map((v) => v.patched);
  if (perVuln.some((f) => !f.length)) return `patched in ${e.fixVersions.join(' or ')} (clears some; at least one advisory has no patch)`;
  return `upgrade to ${e.fixVersions.join(' or ')}`;
}

export function triage(auditInput, files, opts = {}) {
  const parsed = parseAudit(auditInput);
  if (parsed.error) return { error: parsed.error };
  const usage = buildUsage(files || []);
  const items = parsed.entries.map((e) => {
    const own = usage.get(crateIdent(e.name)) || null;
    let bucket; let evidence = [];
    if (own && own.runtime.length) { bucket = 'imported'; evidence = own.runtime; }
    else if (own && own.test.length) { bucket = 'test-only'; evidence = own.test; }
    else bucket = 'not-referenced';
    // cargo-audit reports no severity here, so rank: real vulnerability before warning, then reachability,
    // then how many advisories pile up, then fixability.
    const vulnCount = e.vulns.filter((v) => v.kind === 'vulnerability').length;
    const score = BUCKET_WEIGHT[bucket] + (e.kind === 'vulnerability' ? 20 : 0) + Math.min(Math.max(vulnCount, 1) - 1, 4) * 3 + (e.fixVersions.length ? 2 : 0);
    return { ...e, bucket, evidence: [...new Set(evidence)].slice(0, 5), score, fix: fixText(e) };
  });
  items.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const counts = Object.fromEntries(BUCKETS.map((b) => [b, items.filter((i) => i.bucket === b).length]));
  const urgent = items.filter((i) => i.bucket === 'imported' && i.kind === 'vulnerability');
  return { items, counts, urgent, total: items.length, filesScanned: (files || []).length };
}

export function summaryLine(r) {
  if (!r.total) return 'cargo audit found no vulnerable or flagged crates.';
  return `${r.total} flagged crate(s): ${r.counts.imported} used by your runtime code, ${r.counts['test-only']} only in tests/benches/build scripts, ${r.counts['not-referenced']} not referenced in the ${r.filesScanned} file(s) scanned.`;
}
