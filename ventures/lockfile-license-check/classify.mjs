// Licence audit of an npm lockfile. Pure functions, shared by the page and the CLI.
export const CATEGORIES = ['strong-copyleft', 'weak-copyleft', 'unlicensed', 'unknown', 'permissive'];

const STRONG = /^(A?GPL|SSPL|EUPL|OSL|CC-BY-(NC|SA)|Sleepycat|RPL|CPAL)/i;
const WEAK = /^(LGPL|MPL|EPL|CDDL|CPL|MS-RL|Artistic|APSL)/i;
const PERMISSIVE = /^(MIT|ISC|BSD|Apache|0BSD|Unlicense|CC0|WTFPL|Zlib|Python|BlueOak|PSF|CC-BY-[\d.]+$|X11|MIT-0|Unicode|BSL-1\.0|NCSA|AFL|Ruby|JSON|Public Domain)/i;

// Lower rank = safer. Used to pick the best choice of an OR and the worst of an AND.
const RANK = { permissive: 0, unknown: 1, 'weak-copyleft': 2, 'strong-copyleft': 3, unlicensed: 4 };

export function categorizeId(id) {
  const s = String(id).trim().replace(/\+$/, '').replace(/-(only|or-later)$/i, '');
  if (/^UNLICENSED$/i.test(s) || /^SEE LICENSE/i.test(s) || /proprietary/i.test(s)) return 'unlicensed';
  if (STRONG.test(s)) return 'strong-copyleft';
  if (WEAK.test(s)) return 'weak-copyleft';
  if (PERMISSIVE.test(s)) return 'permissive';
  return 'unknown';
}

// SPDX-ish expression: "(MIT OR GPL-3.0)" -> best OR branch; AND -> worst; parentheses honoured.
export function categorizeExpression(expr) {
  const tokens = String(expr).replace(/[()]/g, (c) => ` ${c} `).split(/\s+/).filter(Boolean);
  let pos = 0;
  const parseOr = () => {
    let best = parseAnd();
    while (tokens[pos] && /^OR$/i.test(tokens[pos])) { pos++; const r = parseAnd(); if (RANK[r] < RANK[best]) best = r; }
    return best;
  };
  const parseAnd = () => {
    let worst = parseAtom();
    while (tokens[pos] && /^AND$/i.test(tokens[pos])) { pos++; const r = parseAtom(); if (RANK[r] > RANK[worst]) worst = r; }
    return worst;
  };
  const parseAtom = () => {
    const t = tokens[pos++];
    if (t === undefined) return 'unknown';
    if (t === '(') { const r = parseOr(); if (tokens[pos] === ')') pos++; return r; }
    if (/^WITH$/i.test(t)) return 'unknown';
    let id = t;
    while (tokens[pos] && /^WITH$/i.test(tokens[pos])) { pos += 2; }
    return categorizeId(id);
  };
  if (!tokens.length) return 'unknown';
  return parseOr();
}

export function normalizeLicense(field) {
  if (field == null) return null;
  if (typeof field === 'string') return field.trim() || null;
  if (Array.isArray(field)) { const v = field.map(normalizeLicense).filter(Boolean); return v.length ? `(${v.join(' OR ')})` : null; }
  if (typeof field === 'object' && field.type) return String(field.type).trim() || null;
  return null;
}

export function packageName(path, entry) {
  if (entry && entry.name) return entry.name;
  const i = path.lastIndexOf('node_modules/');
  return i < 0 ? path : path.slice(i + 'node_modules/'.length);
}

export function analyze(lockText, opts = {}) {
  let lock;
  try { lock = typeof lockText === 'string' ? JSON.parse(lockText) : lockText; } catch { return { error: 'That is not valid JSON' }; }
  if (!lock || typeof lock !== 'object') return { error: 'That is not a package-lock.json' };
  if (!lock.packages) {
    return { error: lock.dependencies
      ? 'This is a lockfileVersion 1 file, which does not record licences. Run npm install with npm 7 or newer to regenerate it as version 2 or 3'
      : 'No "packages" map found. Paste the contents of package-lock.json' };
  }
  const includeDev = opts.includeDev !== false;
  const rows = [];
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (path === '' || !path.includes('node_modules/') || entry.link) continue;
    if (entry.dev && !includeDev) continue;
    const license = normalizeLicense(entry.license);
    const category = license ? categorizeExpression(license) : 'unknown';
    rows.push({ name: packageName(path, entry), version: entry.version || '', license: license || '(none declared)',
      category, dev: Boolean(entry.dev), optional: Boolean(entry.optional) });
  }
  if (!rows.length) return { error: 'No installed packages found in this lockfile' };
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  const byLicense = {};
  for (const r of rows) { counts[r.category]++; byLicense[r.license] = (byLicense[r.license] || 0) + 1; }
  rows.sort((a, b) => RANK[b.category] - RANK[a.category] || a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  const deny = (opts.deny || []).map((d) => d.toLowerCase());
  const denied = deny.length ? rows.filter((r) => String(r.license).toLowerCase().split(/[\s()]+/).some((t) => deny.includes(t))) : [];
  return {
    total: rows.length, counts,
    licenses: Object.entries(byLicense).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([license, count]) => ({ license, count })),
    flagged: rows.filter((r) => r.category !== 'permissive'),
    denied,
  };
}

export function summaryLine(r) {
  const c = r.counts;
  const bits = [];
  if (c['strong-copyleft']) bits.push(`${c['strong-copyleft']} strong-copyleft`);
  if (c.unlicensed) bits.push(`${c.unlicensed} unlicensed`);
  if (c['weak-copyleft']) bits.push(`${c['weak-copyleft']} weak-copyleft`);
  if (c.unknown) bits.push(`${c.unknown} unknown`);
  return `${r.total} packages: ${bits.length ? bits.join(', ') + ' to review' : 'all permissive'}`;
}
