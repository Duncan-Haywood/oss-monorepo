#!/usr/bin/env node
// ICU MessageFormat checker, command line. Node.js 20+, no dependencies.
//
//   node cli.mjs en.json fr.json pl.json          # the first file is the source
//   node cli.mjs --source en.json locales/*.json
//   node cli.mjs app_en.arb app_pl.arb --json
//   node cli.mjs locales/app.json:pt-BR ...       # set a locale the name can't show
//   node cli.mjs --message "{n, plural, one {# file} other {# files}}" --locale pl
//
// Exit codes: 0 no errors (warnings allowed unless --strict), 1 errors (or
// warnings with --strict), 2 bad arguments or an unreadable file.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { checkCatalogs, checkMessage, canonicalLocale, lineCol, previewRows } from './icu.mjs';

const HELP = `Usage:
  node cli.mjs [--source FILE] FILE[:locale]... [--json] [--strict] [--quiet]
  node cli.mjs --message "MESSAGE" [--locale TAG] [--json]

Checks ICU MessageFormat strings in JSON or ARB translation files: syntax,
apostrophes that swallow placeholders, plural categories each locale needs
(from CLDR, via the runtime's Intl.PluralRules), and placeholders and select
options that differ from the source file.

  --source FILE  the source-language file (default: the first file)
  --strict       exit 1 on warnings as well as errors
  --quiet        print errors and warnings only, not info
  --json         machine-readable output`;

export function parseArgs(argv) {
  const o = { files: [], source: null, json: false, strict: false, quiet: false, message: null, locale: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const need = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--json') o.json = true;
    else if (a === '--strict') o.strict = true;
    else if (a === '--quiet') o.quiet = true;
    else if (a === '--source') o.source = need();
    else if (a === '--message') o.message = need();
    else if (a === '--locale') o.locale = need();
    else if (a.startsWith('--')) throw new Error(`Unknown option ${a}`);
    else o.files.push(a);
  }
  if (!o.help && o.message === null && !o.files.length) throw new Error('Give one or more translation files, or --message.');
  if (o.locale && !canonicalLocale(o.locale)) throw new Error(`Unknown locale "${o.locale}"`);
  return o;
}

/** "path/app.json:pt-BR" -> { path, locale }; a Windows drive letter is left alone. */
export function splitLocale(arg) {
  const m = /^(.+):([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*)$/.exec(arg);
  if (m && canonicalLocale(m[2])) return { path: m[1], locale: canonicalLocale(m[2]) };
  return { path: arg, locale: null };
}

const SEV = { error: 'error', warning: 'warn ', info: 'info ' };
const sev = (k) => (Object.hasOwn(SEV, k) ? SEV[k] : String(k));

export function run(argv, { read = (p) => readFileSync(p, 'utf8'), out = (s) => process.stdout.write(`${s}\n`) } = {}) {
  let o;
  try { o = parseArgs(argv); } catch (e) { out(`${e.message}\n\n${HELP}`); return 2; }
  if (o.help) { out(HELP); return 0; }

  if (o.message !== null) {
    const r = checkMessage(o.message, o.locale);
    const preview = r.ast ? previewRows(r.ast, o.locale || 'en') : null;
    if (o.json) out(JSON.stringify({ ...r, ast: undefined, preview }, null, 2));
    else {
      for (const d of r.diagnostics) {
        if (o.quiet && d.severity === 'info') continue;
        const at = d.offset !== undefined ? ` (column ${lineCol(o.message, d.offset).col})` : '';
        out(`${sev(d.severity)} ${d.message}${at}${d.fix ? `\n       fix: ${d.fix}` : ''}`);
      }
      if (!r.diagnostics.length) out(`ok: no problems found${o.locale ? ` for ${o.locale}` : ' (add --locale to check plural categories)'}.`);
      if (preview) for (const row of preview.rows) out(`  ${row.value === null ? '' : `${row.argument}=${row.value} ${row.category}: `}${row.text ?? `(${row.error})`}`);
    }
    const errs = r.diagnostics.filter((d) => d.severity === 'error').length;
    const warns = r.diagnostics.filter((d) => d.severity === 'warning').length;
    return errs || (o.strict && warns) ? 1 : 0;
  }

  const files = [];
  for (const f of o.files) {
    const { path, locale } = splitLocale(f);
    try { files.push({ name: path, locale, text: read(path) }); } catch (e) { out(`Cannot read ${path}: ${e.message}`); return 2; }
  }
  const src = o.source ? splitLocale(o.source) : null;
  if (src && !files.some((f) => f.name === src.path)) {
    try { files.unshift({ name: src.path, locale: src.locale, text: read(src.path) }); } catch (e) { out(`Cannot read ${src.path}: ${e.message}`); return 2; }
  }
  const r = checkCatalogs(files, src?.path ?? null);
  if (o.json) out(JSON.stringify(r, null, 2));
  else {
    for (const f of r.files) {
      out(`${f.name} (${f.locale || 'locale unknown'}${f.isSource ? ', source' : ''}): ${f.total} message${f.total === 1 ? '' : 's'}`);
      if (f.error) out(`  error ${f.error}`);
      if (f.localeWarning) out(`  warn  ${f.localeWarning}`);
      for (const m of f.messages) {
        const ds = m.diagnostics.filter((d) => !(o.quiet && d.severity === 'info'));
        if (!ds.length) continue;
        out(`  ${m.key}`);
        for (const d of ds) out(`    ${sev(d.severity)} ${d.message}${d.fix ? `\n           fix: ${d.fix}` : ''}`);
      }
      if (f.missingKeys?.length) out(`  ${o.quiet ? '' : 'info  '}${f.missingKeys.length} key${f.missingKeys.length === 1 ? '' : 's'} from the source not translated: ${f.missingKeys.slice(0, 8).join(', ')}${f.missingKeys.length > 8 ? '…' : ''}`);
    }
    out(`\n${r.errors} error${r.errors === 1 ? '' : 's'}, ${r.warnings} warning${r.warnings === 1 ? '' : 's'}, ${r.infos} note${r.infos === 1 ? '' : 's'}.`);
  }
  return r.errors || (o.strict && r.warnings) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = run(process.argv.slice(2));
}
