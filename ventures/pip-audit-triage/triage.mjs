// Reachability triage of `pip-audit -f json`. Pure functions, shared by the page and the CLI.
export const BUCKETS = ['imported', 'test-only', 'not-referenced'];

const BUCKET_WEIGHT = { imported: 100, 'test-only': 25, 'not-referenced': 10 };

// PEP 503 name normalisation: "Flask_Cors" -> "flask-cors".
export function normalizeName(name) {
  return String(name).trim().toLowerCase().replace(/[-_.]+/g, '-');
}

// Distributions whose import name differs from the name you pip install.
// Everything else is matched by normalised name (dashes, underscores, dots all equal).
export const IMPORT_ALIASES = {
  pyyaml: ['yaml'], pillow: ['pil'], 'beautifulsoup4': ['bs4'], 'scikit-learn': ['sklearn'],
  'scikit-image': ['skimage'], 'opencv-python': ['cv2'], 'opencv-python-headless': ['cv2'],
  'opencv-contrib-python': ['cv2'], 'python-dateutil': ['dateutil'], 'python-dotenv': ['dotenv'],
  pyjwt: ['jwt'], 'pycryptodome': ['crypto'], pycryptodomex: ['cryptodome'], pymysql: ['pymysql'],
  'mysqlclient': ['mysqldb'], 'psycopg2-binary': ['psycopg2'], 'protobuf': ['google'],
  'google-api-python-client': ['googleapiclient'], 'google-auth': ['google'], 'attrs': ['attr', 'attrs'],
  'msgpack-python': ['msgpack'], 'python-jose': ['jose'], 'python-multipart': ['multipart'],
  'pyopenssl': ['openssl'], 'pyserial': ['serial'], 'pyzmq': ['zmq'], 'ruamel-yaml': ['ruamel'],
  'setuptools': ['setuptools', 'pkg_resources'], 'markdown': ['markdown'], 'pygments': ['pygments'],
  'pytz': ['pytz'], 'django-rest-framework': ['rest_framework'], djangorestframework: ['rest_framework'],
  'tensorflow-cpu': ['tensorflow'], 'tensorflow-gpu': ['tensorflow'], 'ldap3': ['ldap3'], 'python-ldap': ['ldap'],
  'pycurl': ['pycurl'], 'lxml': ['lxml'], 'dj-database-url': ['dj_database_url'], 'slackclient': ['slack'],
  'discord-py': ['discord'], 'pyinstaller': ['pyinstaller'], 'gitpython': ['git'], 'pexpect': ['pexpect'],
  'python-magic': ['magic'], 'python-slugify': ['slugify'], 'faust-streaming': ['faust'], 'pymongo': ['pymongo', 'bson', 'gridfs'],
};

// Names a dist could be imported as (lowercased, with "_" for "-").
export function importNamesFor(dist) {
  const n = normalizeName(dist);
  const names = new Set([n.replace(/-/g, '_')]);
  for (const a of IMPORT_ALIASES[n] || []) names.add(a.toLowerCase());
  return names;
}

// Strip comments and triple-quoted strings so a docstring that shows `import x` does not count.
function stripNoise(text) {
  return String(text)
    .replace(/("""|''')[\s\S]*?\1/g, '')
    .replace(/(^|[^\\])#[^\n]*/g, '$1');
}

// Top-level module names imported by one Python source text (lowercased). Relative imports are skipped.
export function extractImports(text) {
  const found = new Set();
  const src = stripNoise(text);
  const top = (mod) => mod.split('.')[0].toLowerCase();
  for (const m of src.matchAll(/^[ \t]*import[ \t]+([^\n;]+)/gm)) {
    for (const part of m[1].split(',')) {
      const mod = part.trim().split(/\s+as\s+/)[0].trim();
      if (/^[A-Za-z_][\w.]*$/.test(mod)) found.add(top(mod));
    }
  }
  for (const m of src.matchAll(/^[ \t]*from[ \t]+([A-Za-z_][\w.]*)[ \t]+import\b/gm)) found.add(top(m[1]));
  for (const m of src.matchAll(/\b(?:importlib\.)?import_module\s*\(\s*['"]([A-Za-z_][\w.]*)['"]/g)) found.add(top(m[1]));
  for (const m of src.matchAll(/\b__import__\s*\(\s*['"]([A-Za-z_][\w.]*)['"]/g)) found.add(top(m[1]));
  return found;
}

const TEST_PATH = /(^|[\\/])(tests?|testing|docs?|examples?|benchmarks?|scripts|tools|\.?venv|tox|ci)([\\/]|$)|(^|[\\/])(test_[^\\/]*|[^\\/]*_tests?|conftest|noxfile|tasks|fabfile|setup|docs?[\\/]conf)\.py$/i;
export function isTestPath(path) { return TEST_PATH.test(String(path)); }

// files: [{ path, text }] -> Map<importName, { runtime: [paths], test: [paths] }>
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

// Normalise pip-audit JSON (current {"dependencies":[...]} or the older bare list) to
// [{ name, version, vulns: [{id, aliases, fixVersions, description}], fixVersions }].
export function parseAudit(input) {
  let data = input;
  if (typeof input === 'string') {
    try { data = JSON.parse(input); } catch { return { error: 'That is not valid JSON. Paste the output of `pip-audit -f json`' }; }
  }
  const deps = Array.isArray(data) ? data : data && Array.isArray(data.dependencies) ? data.dependencies : null;
  if (!deps) return { error: 'No "dependencies" list found. Is this `pip-audit -f json` output?' };
  const entries = [];
  for (const d of deps) {
    if (!d || !d.name || !Array.isArray(d.vulns) || !d.vulns.length) continue;
    const vulns = d.vulns.map((v) => ({
      id: String(v.id || 'advisory'), aliases: Array.isArray(v.aliases) ? v.aliases.map(String) : [],
      fixVersions: Array.isArray(v.fix_versions) ? v.fix_versions.map(String) : [], description: String(v.description || ''),
    }));
    const fixes = [...new Set(vulns.flatMap((v) => v.fixVersions))];
    entries.push({ name: String(d.name), version: String(d.version || ''), vulns, fixVersions: fixes });
  }
  return { entries };
}

export function fixText(e) {
  if (!e.fixVersions.length) return 'no fix version listed';
  // Every advisory must be fixed: the highest per-advisory minimum fix is what clears all of them.
  const perVuln = e.vulns.map((v) => v.fixVersions);
  if (perVuln.some((f) => !f.length)) return `upgrade to ${e.fixVersions.join(' or ')} (clears some; at least one advisory has no fix)`;
  return `upgrade to ${e.fixVersions.join(' or ')}`;
}

export function triage(auditInput, files, opts = {}) {
  const parsed = parseAudit(auditInput);
  if (parsed.error) return { error: parsed.error };
  const usage = buildUsage(files || []);
  const items = parsed.entries.map((e) => {
    let own = null;
    for (const n of importNamesFor(e.name)) {
      const u = usage.get(n);
      if (u) own = own ? { runtime: [...own.runtime, ...u.runtime], test: [...own.test, ...u.test] } : u;
    }
    let bucket; let evidence = [];
    if (own && own.runtime.length) { bucket = 'imported'; evidence = own.runtime; }
    else if (own && own.test.length) { bucket = 'test-only'; evidence = own.test; }
    else bucket = 'not-referenced';
    // pip-audit reports no severity, so rank by reachability, then by how many advisories pile up, then fixability.
    const score = BUCKET_WEIGHT[bucket] + Math.min(e.vulns.length - 1, 4) * 3 + (e.fixVersions.length ? 2 : 0);
    return { ...e, bucket, evidence: [...new Set(evidence)].slice(0, 5), score, fix: fixText(e) };
  });
  items.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const counts = Object.fromEntries(BUCKETS.map((b) => [b, items.filter((i) => i.bucket === b).length]));
  const urgent = items.filter((i) => i.bucket === 'imported');
  return { items, counts, urgent, total: items.length, filesScanned: (files || []).length };
}

export function summaryLine(r) {
  if (!r.total) return 'pip-audit found no vulnerable packages.';
  return `${r.total} vulnerable package(s): ${r.counts.imported} imported by your runtime code, ${r.counts['test-only']} only in test/tooling files, ${r.counts['not-referenced']} not referenced in the ${r.filesScanned} file(s) scanned.`;
}
