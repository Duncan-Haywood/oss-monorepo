// Duplicate-package audit of an npm lockfile. Pure functions, shared by the page and the CLI.
// A package that resolves to several versions is installed several times: every extra copy is
// disk, install time and (in a browser bundle) bytes. Same-major copies are usually removable
// with `npm dedupe`; cross-major copies need the dependant upgraded or an `overrides` entry.

function nameOf(path) {
  const i = path.lastIndexOf('node_modules/');
  return i < 0 ? null : path.slice(i + 'node_modules/'.length);
}

function parentOf(path) {
  const i = path.lastIndexOf('node_modules/');
  if (i <= 0) return '(root)';
  const up = path.slice(0, i).replace(/\/$/, '');
  return nameOf(up) || '(root)';
}

const cmp = (a, b) => {
  const pa = String(a).split(/[.\-+]/), pb = String(b).split(/[.\-+]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? '0', y = pb[i] ?? '0';
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    const d = nx && ny ? Number(x) - Number(y) : x.localeCompare(y);
    if (d) return d;
  }
  return 0;
};
const major = (v) => String(v).split('.')[0].replace(/^v/, '');

// v1 lockfiles nest `dependencies`; flatten them to the v2/v3 path form.
function flattenV1(deps, prefix, out) {
  for (const [name, d] of Object.entries(deps || {})) {
    const p = `${prefix}node_modules/${name}`;
    out[p] = { version: d.version, dev: d.dev };
    if (d.dependencies) flattenV1(d.dependencies, `${p}/`, out);
  }
}

export function analyze(text, { includeDev = true, ignore = [] } = {}) {
  let data;
  try { data = JSON.parse(text); } catch { return { error: 'not valid JSON -- paste the whole package-lock.json' }; }
  if (!data || typeof data !== 'object') return { error: 'not a lockfile object' };
  let packages = data.packages;
  if (!packages && data.dependencies) { packages = {}; flattenV1(data.dependencies, '', packages); }
  if (!packages) return { error: 'no "packages" or "dependencies" map found -- is this an npm package-lock.json' };

  const byName = new Map();
  let total = 0;
  for (const [path, p] of Object.entries(packages)) {
    const name = path === '' ? null : nameOf(path);
    if (!name || !p || p.link || !p.version) continue;
    if (!includeDev && p.dev) continue;
    total++;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push({ version: p.version, path, parent: parentOf(path), dev: !!p.dev });
  }

  const ig = new Set(ignore);
  const duplicates = [];
  for (const [name, copies] of byName) {
    const versions = [...new Set(copies.map((c) => c.version))].sort(cmp);
    if (versions.length < 2 || ig.has(name)) continue;
    const majors = [...new Set(versions.map(major))];
    const kind = majors.length < versions.length ? 'same-major' : 'cross-major';
    duplicates.push({
      name, kind, versions, copies: copies.length, majors,
      parents: [...new Set(copies.map((c) => c.parent))].sort(),
      byVersion: Object.fromEntries(versions.map((v) => [v, copies.filter((c) => c.version === v).map((c) => c.parent)])),
    });
  }
  // Same-major first (cheapest to fix), then most copies, then name.
  duplicates.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'same-major' ? -1 : 1) || b.copies - a.copies || a.name.localeCompare(b.name));
  const extraCopies = duplicates.reduce((n, d) => n + d.copies - 1, 0);
  const counts = {
    'same-major': duplicates.filter((d) => d.kind === 'same-major').length,
    'cross-major': duplicates.filter((d) => d.kind === 'cross-major').length,
  };
  return { total, unique: byName.size, duplicates, extraCopies, counts, error: null };
}

export function summaryLine(r) {
  if (!r.duplicates.length) return `No duplicated packages in ${r.total} installed (${r.unique} unique).`;
  return `${r.duplicates.length} package${r.duplicates.length === 1 ? '' : 's'} installed more than once (${r.counts['same-major']} same-major, ${r.counts['cross-major']} cross-major), ${r.extraCopies} extra cop${r.extraCopies === 1 ? 'y' : 'ies'} in ${r.total} installed.`;
}

export function overridesHint(d) {
  const keep = d.versions[d.versions.length - 1];
  return `"overrides": { "${d.name}": "${keep}" }`;
}
