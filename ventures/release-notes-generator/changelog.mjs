// Turns `git log` text into release notes. Pure functions, no I/O, no network.
// Input format (see FORMAT): one commit per record, fields separated by \x1f, records by \x1e.
export const FORMAT = '%H%x1f%an%x1f%s%x1f%b%x1e';

export const SECTIONS = [
  ['breaking', 'Breaking changes'],
  ['feat', 'Features'],
  ['fix', 'Fixes'],
  ['perf', 'Performance'],
  ['security', 'Security'],
  ['docs', 'Documentation'],
  ['refactor', 'Refactoring'],
  ['test', 'Tests'],
  ['build', 'Build'],
  ['ci', 'CI'],
  ['chore', 'Maintenance'],
  ['other', 'Other changes'],
];
const KNOWN = new Set(SECTIONS.map(([k]) => k));
const ALIASES = { feature: 'feat', features: 'feat', bugfix: 'fix', hotfix: 'fix', doc: 'docs', tests: 'test', style: 'chore', revert: 'chore', deps: 'build', dep: 'build' };
const CC = /^(\w+)(?:\(([^)]*)\))?(!)?:\s+(.+)$/;
// Fallback for commits that are not conventional: classify by leading verb.
const VERBS = [
  [/^(add|implement|introduce|support|create)\b/i, 'feat'],
  [/^(fix|resolve|correct|patch|repair)\b/i, 'fix'],
  [/^(bump|upgrade|update dep)/i, 'build'],
  [/^(doc|readme)/i, 'docs'],
  [/^(refactor|clean|rename|simplify)/i, 'refactor'],
  [/^(test)/i, 'test'],
  [/^(optimi[sz]e|speed)/i, 'perf'],
];

export function parseLog(text) {
  return String(text || '').split('\x1e').map((r) => r.replace(/^\n/, '')).filter((r) => r.trim()).map((rec) => {
    const [hash = '', author = '', subject = '', body = ''] = rec.split('\x1f');
    return parseCommit({ hash: hash.trim(), author: author.trim(), subject: subject.trim(), body });
  });
}

export function parseCommit({ hash = '', author = '', subject = '', body = '' }) {
  let type = null, scope = null, bang = false, desc = subject, conventional = false;
  const m = CC.exec(subject);
  if (m) {
    const t = m[1].toLowerCase();
    const mapped = ALIASES[t] || t;
    if (KNOWN.has(mapped) && mapped !== 'breaking' && mapped !== 'other') {
      type = mapped; scope = m[2] || null; bang = Boolean(m[3]); desc = m[4]; conventional = true;
    }
  }
  if (!type) {
    type = 'other';
    for (const [re, t] of VERBS) if (re.test(subject)) { type = t; break; }
  }
  const bc = /^BREAKING[ -]CHANGE:\s*([\s\S]+?)(?:\n\n|$)/m.exec(body || '');
  const breaking = bang || Boolean(bc);
  const pr = /\(#(\d+)\)\s*$/.exec(desc) || /^Merge pull request #(\d+)/.exec(subject);
  if (pr) desc = desc.replace(/\s*\(#\d+\)\s*$/, '');
  return { hash, short: hash.slice(0, 7), author, type, scope, desc: desc.trim(), conventional, breaking, breakingNote: bc ? bc[1].trim() : null, pr: pr ? pr[1] : null, subject };
}

export function suggestBump(commits, { major0 = false } = {}) {
  if (commits.some((c) => c.breaking)) return major0 ? 'minor' : 'major';
  if (commits.some((c) => c.type === 'feat')) return major0 ? 'patch' : 'minor';
  return commits.length ? 'patch' : 'none';
}

export function bumpVersion(version, bump) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(String(version || '').trim());
  if (!m || bump === 'none') return null;
  let [a, b, c] = m.slice(1).map(Number);
  if (bump === 'major') { a++; b = 0; c = 0; } else if (bump === 'minor') { b++; c = 0; } else c++;
  return `${/^v/.test(version.trim()) ? 'v' : ''}${a}.${b}.${c}`;
}

export function group(commits, { skip = [] } = {}) {
  const out = new Map();
  const skipSet = new Set(skip);
  for (const c of commits) {
    if (/^Merge (branch|remote-tracking)/.test(c.subject)) continue;
    if (skipSet.has(c.type)) continue;
    const key = c.breaking ? 'breaking' : c.type;
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(c);
  }
  return SECTIONS.filter(([k]) => out.has(k)).map(([k, title]) => ({ key: k, title, commits: out.get(k) }));
}

const link = (base, kind, id) => (base ? `[${kind === 'pr' ? '#' : ''}${id}](${base.replace(/\/$/, '')}/${kind === 'pr' ? 'pull' : 'commit'}/${id})` : kind === 'pr' ? `#${id}` : id);

function line(c, { repo, authors }) {
  const scope = c.scope ? `**${c.scope}:** ` : '';
  const ref = c.pr ? ` (${link(repo, 'pr', c.pr)})` : c.short ? ` (${link(repo, 'commit', c.short)})` : '';
  const who = authors && c.author ? ` — ${c.author}` : '';
  const note = c.breakingNote ? `\n  - ${c.breakingNote.replace(/\n/g, ' ')}` : '';
  return `- ${scope}${c.desc}${ref}${who}${note}`;
}

// style: 'keepachangelog' | 'github' | 'plain'
export function render(commits, { version = 'Unreleased', date = null, style = 'keepachangelog', repo = '', authors = false, skip = [] } = {}) {
  const sections = group(commits, { skip });
  const when = date ? ` - ${date}` : '';
  const lines = [];
  if (style === 'github') lines.push(`## What's changed`, '');
  else if (style === 'plain') lines.push(`${version}${when}`, '');
  else lines.push(`## [${version}]${when}`, '');
  if (!sections.length) lines.push('No user-facing changes.');
  for (const s of sections) {
    if (style === 'keepachangelog') lines.push(`### ${s.title}`);
    else if (style === 'github') lines.push(`### ${s.title}`);
    else lines.push(`${s.title}:`);
    for (const c of s.commits) lines.push(style === 'plain' ? line(c, { repo: '', authors }).replace(/ \([^()]*\)(?=( —|$|\n))/, '') : line(c, { repo, authors }));
    lines.push('');
  }
  return lines.join('\n').replace(/\n+$/, '\n');
}

export function summarize(commits) {
  const nonConv = commits.filter((c) => !c.conventional).length;
  const bump = suggestBump(commits);
  const warnings = [];
  if (commits.length && nonConv / commits.length > 0.5) warnings.push(`${nonConv} of ${commits.length} commits are not Conventional Commits; their sections were guessed from the first word, so review them.`);
  if (commits.some((c) => c.breaking)) warnings.push('Contains breaking changes: a major bump is suggested (minor while below 1.0.0).');
  return { count: commits.length, nonConventional: nonConv, bump, warnings, authors: [...new Set(commits.map((c) => c.author).filter(Boolean))] };
}
