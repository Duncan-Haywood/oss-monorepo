// Audit of a Python requirements.txt for reproducibility and supply-chain risk.
// Pure functions, shared by the page and the CLI. A line scanner, not pip's parser.
export const CATEGORIES = [
  'index-override', 'insecure-source', 'vcs-unpinned', 'url-dependency', 'no-version',
  'range-version', 'no-hashes', 'editable', 'duplicate', 'pinned',
];
export const SEVERITY = {
  'index-override': 'high', 'insecure-source': 'high', 'vcs-unpinned': 'high',
  'url-dependency': 'medium', 'no-version': 'medium', 'range-version': 'medium',
  'no-hashes': 'low', editable: 'low', duplicate: 'low', pinned: 'ok',
};
const RANK = Object.fromEntries(CATEGORIES.map((c, i) => [c, i]));

const NAME = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(\[[^\]]*\])?\s*(.*)$/;
const normName = (n) => n.toLowerCase().replace(/[-_.]+/g, '-');

// Join backslash continuations, drop comments and blanks, keep line numbers.
export function logicalLines(text) {
  const out = [];
  const raw = String(text).replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < raw.length; i++) {
    let line = raw[i];
    const start = i + 1;
    while (/\\\s*$/.test(line) && i + 1 < raw.length) { line = line.replace(/\\\s*$/, ' ') + raw[++i]; }
    line = line.replace(/(^|\s)#.*$/, '').trim();
    if (line) out.push({ n: start, text: line });
  }
  return out;
}

function classifyLine({ n, text }) {
  const hashes = [...text.matchAll(/--hash=\S+/g)].length;
  const body = text.replace(/\s--hash=\S+/g, '').replace(/\s*;\s*.*$/, '').trim();
  const row = (category, name, detail) => ({ line: n, name, category, severity: SEVERITY[category], detail, hashes });

  const opt = body.match(/^(--index-url|-i|--extra-index-url|--find-links|-f|--trusted-host)(?:[=\s]+(\S+))?/);
  if (opt) {
    const [, flag, val = ''] = opt;
    if (flag === '--trusted-host') return row('insecure-source', val, 'trusted-host disables TLS verification for that host');
    if (/^http:\/\//i.test(val)) return row('insecure-source', val, 'plain-http package source can be tampered with in transit');
    if (flag === '--extra-index-url') return row('index-override', val, 'a second index lets a same-named public package win (dependency confusion); prefer one index');
    return null;
  }
  if (/^-r\s|^-c\s|^--(?:require-hashes|no-binary|only-binary|pre|prefer-binary|use-feature)/.test(body)) return null;
  if (/^(-e|--editable)\s/.test(body)) return row('editable', body.replace(/^(-e|--editable)\s+/, ''), 'editable installs are not reproducible from a registry');

  const vcs = body.match(/^(?:([A-Za-z0-9][A-Za-z0-9._-]*)\s*@\s*)?((?:git|hg|svn|bzr)\+\S+)/);
  if (vcs) {
    const name = vcs[1] || vcs[2].replace(/.*\//, '').replace(/\.git.*/, '');
    const pinned = /@[0-9a-f]{40}(?:[#&]|$)/i.test(vcs[2]);
    return pinned ? row('pinned', name, 'VCS dependency pinned to a full commit')
      : row('vcs-unpinned', name, 'VCS dependency follows a branch or tag, so the code can change under you');
  }
  const url = body.match(/^(?:([A-Za-z0-9][A-Za-z0-9._-]*)\s*@\s*)?(https?:\/\/\S+|file:\S+)/i);
  if (url) {
    const name = url[1] || url[2].split('/').pop();
    if (/^http:\/\//i.test(url[2])) return row('insecure-source', name, 'plain-http direct URL');
    return /#sha256=/i.test(url[2]) || hashes ? row('pinned', name, 'direct URL with a hash')
      : row('url-dependency', name, 'direct URL with no hash: contents can change without the URL changing');
  }
  const m = body.match(NAME);
  if (!m) return null;
  const [, name, , spec] = m;
  if (!spec) return row('no-version', name, 'no version constraint: every install can resolve to something different');
  if (/^===?\s*[^,\s*]+$/.test(spec) && !/\*/.test(spec)) {
    return hashes ? row('pinned', name, 'exact version with hashes') : row('no-hashes', name, 'exact version but no --hash: a re-uploaded file would be installed silently');
  }
  return row('range-version', name, `range "${spec}" lets the resolved version drift`);
}

export function analyze(text, opts = {}) {
  const lines = logicalLines(text);
  if (!lines.length) return { error: 'No requirements found. Paste the contents of requirements.txt' };
  const requireHashes = opts.requireHashes === true;
  let rows = lines.map(classifyLine).filter(Boolean);
  if (!rows.some((r) => r.name)) return { error: 'No package requirements found in that text' };
  const seen = new Map();
  for (const r of rows.filter((x) => x.name && !/^\w+:|\//.test(x.name) && !['index-override', 'insecure-source'].includes(x.category))) {
    const k = normName(r.name);
    if (seen.has(k)) rows.push({ line: r.line, name: r.name, category: 'duplicate', severity: SEVERITY.duplicate, detail: `already listed on line ${seen.get(k)}; pip applies both constraints`, hashes: 0 });
    else seen.set(k, r.line);
  }
  if (!requireHashes) rows = rows.filter((r) => r.category !== 'no-hashes');
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  for (const r of rows) counts[r.category]++;
  rows.sort((a, b) => RANK[a.category] - RANK[b.category] || a.line - b.line);
  const packages = rows.filter((r) => ['pinned', 'no-hashes', 'range-version', 'no-version', 'vcs-unpinned', 'url-dependency', 'editable'].includes(r.category)).length;
  return { total: packages, counts, findings: rows.filter((r) => r.category !== 'pinned'), requireHashes };
}

export function summaryLine(r) {
  const c = r.counts;
  const bad = r.findings.filter((f) => f.severity === 'high').length;
  const med = r.findings.filter((f) => f.severity === 'medium').length;
  const low = r.findings.filter((f) => f.severity === 'low').length;
  if (!r.findings.length) return `${r.total} requirements: all pinned${r.requireHashes ? ' with hashes' : ''}`;
  const bits = [];
  if (bad) bits.push(`${bad} high`);
  if (med) bits.push(`${med} medium`);
  if (low) bits.push(`${low} low`);
  return `${r.total} requirements: ${bits.join(', ')} to review (${c['no-version'] + c['range-version']} not pinned to an exact version)`;
}
