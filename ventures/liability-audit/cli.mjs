#!/usr/bin/env node
// liability-audit: scan an app's repository or built site for legal and
// financial exposure signals.
//
//   node cli.mjs scan [dir]                      text report
//   node cli.mjs scan . --format md|json|sarif   for a PR comment, a script, or GitHub code scanning
//   node cli.mjs scan . --fail-on high           CI gate: exit 1 on any high finding (or medium, low)
//   node cli.mjs scan . --skip no-license,copyleft-dependency
//   node cli.mjs sweep <dir> [--format md|json]  audit every immediate subdirectory (a monorepo's apps)
//   node cli.mjs rules                           list every rule and why it exists
//
// Reads local files only. No network, no dependencies.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { RULES, auditFiles, summarise } from './audit.mjs';

export const DISCLAIMER = 'No warranty. Liability Audit is free, as-is software and not legal, tax or financial advice. '
  + 'It pattern-matches files and can miss problems or flag non-problems; a clear report is not a finding that anything is lawful. '
  + 'You are responsible for verifying its output and for your own compliance; consult a qualified professional where it matters.';

const SKIP_DIRS = new Set(['node_modules', '.git', '.hg', '.svn', 'vendor', '.venv', 'venv', '__pycache__', '.next', '.nuxt', '.turbo', '.cache', 'coverage', 'target', '.terraform']);
const TEXT_EXT = /\.(?:m?[jt]sx?|cjs|py|rb|go|php|java|kt|swift|cs|rs|vue|svelte|astro|html?|md|mdx|txt|liquid|hbs|ejs|njk|erb|json|ya?ml|toml|tf|tofu|env|ini|cfg|conf|sh|xml)$|(?:^|\/)(?:LICEN[CS]E|COPYING)(?:\.[a-z]+)?$|(?:^|\/)\.env(?:\.[\w-]+)?$/i;
const MAX_FILE = 1_500_000;
const MAX_FILES = 20_000;

/** Read every text file under dir (skipping dependencies, builds caches and VCS). */
export function readTree(dir) {
  const files = [];
  const walk = (d) => {
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (files.length >= MAX_FILES) return;
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(p);
      } else if (e.isFile()) {
        const rel = relative(dir, p).split(sep).join('/');
        if (!TEXT_EXT.test(rel)) continue;
        try {
          if (statSync(p).size > MAX_FILE) continue;
          files.push({ path: rel, text: readFileSync(p, 'utf8') });
        } catch { /* unreadable: skip */ }
      }
    }
  };
  walk(dir);
  return files;
}

const SEV_RANK = { high: 3, medium: 2, low: 1 };

export function formatText(report, { root = '.' } = {}) {
  const s = summarise(report);
  const out = [`Liability Audit of ${root}: ${s.raised} of ${s.applicable} applicable checks raised findings (${s.high} high, ${s.medium} medium, ${s.low} low).`];
  const f = report.facts;
  out.push(`Read ${f.files} files. Seen: ${[
    f.pages && `${f.pages} pages`, f.callsLlm && 'LLM calls', f.takesPayments && 'payments', f.recurringBilling && 'recurring billing',
    f.collectsPersonalData && 'personal-data inputs', f.trackers.length && `trackers (${f.trackers.join(', ')})`, f.infrastructureAsCode && 'IaC',
  ].filter(Boolean).join(', ') || 'none of the signals the rules look for'}.`);
  for (const x of report.findings) {
    out.push('', `[${x.severity.toUpperCase()}] ${x.id}: ${x.title}`);
    for (const e of x.evidence.slice(0, 5)) out.push(`  ${e.file}${e.line ? `:${e.line}` : ''}  ${e.match}`);
    if (x.evidence.length > 5) out.push(`  … and ${x.evidence.length - 5} more`);
    out.push(`  Why: ${x.why}`, `  Fix: ${x.fix}`);
  }
  const na = report.checks.filter((c) => c.status === 'not-applicable').map((c) => c.id);
  if (na.length) out.push('', `Not applicable here: ${na.join(', ')}.`);
  out.push('', DISCLAIMER);
  return out.join('\n');
}

export function formatMarkdown(report, { root = '.' } = {}) {
  const s = summarise(report);
  const out = [`## Liability Audit: ${s.raised} of ${s.applicable} checks raised findings`, '', `${s.high} high · ${s.medium} medium · ${s.low} low · scanned \`${root}\``, ''];
  if (report.findings.length) {
    out.push('| Severity | Check | Where |', '|---|---|---|');
    for (const x of report.findings) {
      const where = x.evidence.slice(0, 3).map((e) => `\`${e.file}${e.line ? `:${e.line}` : ''}\``).join('<br>');
      out.push(`| ${x.severity} | **${x.id}**: ${x.title} | ${where}${x.evidence.length > 3 ? `<br>+${x.evidence.length - 3} more` : ''} |`);
    }
    out.push('');
    for (const x of report.findings) out.push(`<details><summary><b>${x.id}</b></summary>`, '', `**Why:** ${x.why}`, '', `**Fix:** ${x.fix}`, '', '</details>', '');
  }
  out.push(`<sub>${DISCLAIMER}</sub>`);
  return out.join('\n');
}

/** SARIF 2.1.0 for GitHub code scanning (upload with github/codeql-action/upload-sarif). */
export function formatSarif(report) {
  const level = { high: 'error', medium: 'warning', low: 'note' };
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'liability-audit',
          informationUri: 'https://duncan-haywood.github.io/monorepo-projects/liability-audit/',
          rules: RULES.map((r) => ({ id: r.id, shortDescription: { text: r.title }, fullDescription: { text: r.why }, help: { text: r.fix }, defaultConfiguration: { level: level[r.severity] }, properties: { category: r.category } })),
        },
      },
      results: report.findings.flatMap((x) => x.evidence.map((e) => ({
        ruleId: x.id,
        level: level[x.severity],
        message: { text: `${x.title}: ${e.match}` },
        locations: [{ physicalLocation: { artifactLocation: { uri: e.file === '.' ? 'LICENSE' : e.file }, region: { startLine: Math.max(1, e.line || 1) } } }],
      }))),
    }],
  };
}

/** Audit each immediate subdirectory of root: one row per app, plus per-rule totals. */
export function sweep(root, opts = {}) {
  // Apps in a monorepo inherit the licence at its root (or any parent).
  let inherited = false;
  for (let d = resolve(root), i = 0; i < 6 && !inherited; i++, d = dirname(d)) {
    try { inherited = readdirSync(d).some((n) => /^(?:LICEN[CS]E|COPYING)(?:\.[a-z]+)?$/i.test(n)); } catch { break; }
  }
  if (inherited) opts = { ...opts, skip: [...(opts.skip ?? []), 'no-license'] };
  const rows = [];
  const byRule = {};
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory() || SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
    const report = auditFiles(readTree(join(root, e.name)), opts);
    const s = summarise(report);
    rows.push({ app: e.name, ...s, findings: report.findings.map((f) => ({ id: f.id, severity: f.severity, where: f.evidence.slice(0, 3).map((x) => `${x.file}${x.line ? `:${x.line}` : ''}`), evidence: f.evidence.slice(0, 3).map((x) => x.match) })) });
    for (const c of report.checks) {
      byRule[c.id] ??= { raised: 0, clear: 0, 'not-applicable': 0 };
      byRule[c.id][c.status]++;
    }
  }
  rows.sort((a, b) => b.high - a.high || b.medium - a.medium || b.low - a.low || a.app.localeCompare(b.app));
  return { root, apps: rows.length, appsWithFindings: rows.filter((r) => r.raised).length, byRule, rows };
}

export function formatSweepMarkdown(r) {
  const out = [`## Liability Audit sweep of \`${r.root}\``, '', `${r.apps} apps scanned; ${r.appsWithFindings} raised at least one finding.`, '', '| Rule | Raised | Clear | Not applicable |', '|---|---:|---:|---:|'];
  for (const rule of RULES) {
    const b = r.byRule[rule.id];
    if (b) out.push(`| \`${rule.id}\` (${rule.severity}) | ${b.raised} | ${b.clear} | ${b['not-applicable']} |`);
  }
  const hits = r.rows.filter((x) => x.raised);
  if (hits.length) {
    out.push('', '| App | High | Medium | Low | Findings |', '|---|---:|---:|---:|---|');
    for (const x of hits) out.push(`| ${x.app} | ${x.high} | ${x.medium} | ${x.low} | ${x.findings.map((f) => `\`${f.id}\` ${f.where[0] ?? ''}`).join('<br>')} |`);
  }
  out.push('', `<sub>${DISCLAIMER}</sub>`);
  return out.join('\n');
}

function opt(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

export async function main(argv, { stdout = (s) => process.stdout.write(`${s}\n`), stderr = (s) => process.stderr.write(`${s}\n`) } = {}) {
  const [cmd, ...args] = argv;
  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    stdout(`liability-audit: legal and financial exposure signals in an app's files\n\nusage:\n  node cli.mjs scan [dir] [--format text|md|json|sarif] [--fail-on high|medium|low] [--only a,b] [--skip a,b]\n  node cli.mjs sweep <dir> [--format md|json]\n  node cli.mjs rules\n\n${DISCLAIMER}`);
    return 0;
  }
  if (cmd === 'rules') {
    for (const r of RULES) stdout(`${r.id} [${r.severity}, ${r.category}]\n  ${r.title}\n  Why: ${r.why}\n`);
    return 0;
  }
  if (cmd === 'sweep') {
    const root = args.find((a) => !a.startsWith('--'));
    try { if (!root || !statSync(root).isDirectory()) throw new Error(); } catch { stderr(`not a directory: ${root ?? '(none given)'}`); return 2; }
    const r = sweep(root);
    stdout(opt(args, '--format') === 'json' ? JSON.stringify(r, null, 2) : formatSweepMarkdown(r));
    return 0;
  }
  if (cmd !== 'scan') { stderr(`unknown command "${cmd}"`); return 2; }

  const dir = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))) ?? '.';
  try { if (!statSync(dir).isDirectory()) throw new Error(); } catch { stderr(`not a directory: ${dir}`); return 2; }
  const format = opt(args, '--format') ?? 'text';
  const failOn = opt(args, '--fail-on');
  if (failOn && !SEV_RANK[failOn]) { stderr('--fail-on takes high, medium or low'); return 2; }
  const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : null);
  const known = new Set(RULES.map((r) => r.id));
  for (const id of [...(list(opt(args, '--only')) ?? []), ...(list(opt(args, '--skip')) ?? [])]) {
    if (!known.has(id)) { stderr(`unknown rule "${id}"; see \`node cli.mjs rules\``); return 2; }
  }

  const report = auditFiles(readTree(dir), { only: list(opt(args, '--only')), skip: list(opt(args, '--skip')) ?? [] });
  if (format === 'json') stdout(JSON.stringify({ ...report, summary: summarise(report), disclaimer: DISCLAIMER }, null, 2));
  else if (format === 'sarif') stdout(JSON.stringify(formatSarif(report), null, 2));
  else if (format === 'md') stdout(formatMarkdown(report, { root: dir }));
  else if (format === 'text') stdout(formatText(report, { root: dir }));
  else { stderr(`unknown format "${format}"`); return 2; }

  if (failOn && report.findings.some((f) => SEV_RANK[f.severity] >= SEV_RANK[failOn])) return 1;
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
