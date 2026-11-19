// TypeScript 7 readiness check for tsconfig.json.
//
// Every rule below was taken from the TypeScript 6.0.3 compiler source
// (checkDeprecations / computedOptions in lib/_tsc.js) and then confirmed by
// running tsc 5.9.3, 6.0.3 and 7.0.2 on a fixture for it: eval/matrix.json
// holds the diagnostics each compiler printed, and rules.test.mjs replays the
// fixtures' expectations. No rule here is from memory.
//
// Pure functions, no dependencies: the page (index.html) and the CLI (cli.mjs)
// both import this file.

// ---------------------------------------------------------------- JSONC ---

// tsconfig.json is JSON with comments and trailing commas (TypeScript's own
// parser accepts both). Returns { value } or { error, offset }.
export function parseJsonc(text) {
  let i = 0;
  const src = String(text).replace(/^\uFEFF/, '');
  const fail = (msg) => { const e = new Error(msg); e.offset = i; throw e; };
  const ws = () => {
    for (;;) {
      const c = src[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') {
        const end = src.indexOf('*/', i + 2);
        if (end < 0) fail('Unterminated /* comment');
        i = end + 2; continue;
      }
      return;
    }
  };
  const str = () => {
    const start = i++;
    let out = '';
    while (i < src.length && src[i] !== '"') {
      if (src[i] === '\\') {
        const n = src[i + 1];
        const map = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        if (n === 'u') { out += String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16)); i += 6; continue; }
        if (!(n in map)) fail(`Bad escape \\${n}`);
        out += map[n]; i += 2; continue;
      }
      if (src[i] === '\n') { i = start; fail('Unterminated string'); }
      out += src[i++];
    }
    if (src[i] !== '"') { i = start; fail('Unterminated string'); }
    i++;
    return out;
  };
  const val = () => {
    ws();
    const c = src[i];
    if (c === '{') {
      i++; const o = {};
      for (;;) {
        ws();
        if (src[i] === '}') { i++; return o; }
        if (src[i] !== '"') fail('Expected a "quoted" property name');
        const k = str(); ws();
        if (src[i] !== ':') fail(`Expected ':' after "${k}"`);
        i++; o[k] = val(); ws();
        if (src[i] === ',') { i++; continue; }
        if (src[i] === '}') { i++; return o; }
        fail("Expected ',' or '}'");
      }
    }
    if (c === '[') {
      i++; const a = [];
      for (;;) {
        ws();
        if (src[i] === ']') { i++; return a; }
        a.push(val()); ws();
        if (src[i] === ',') { i++; continue; }
        if (src[i] === ']') { i++; return a; }
        fail("Expected ',' or ']'");
      }
    }
    if (c === '"') return str();
    const m = /^(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(src.slice(i));
    if (!m) fail(i >= src.length ? 'Unexpected end of file' : `Unexpected character '${c}'`);
    i += m[0].length;
    return JSON.parse(m[0]);
  };
  try {
    const value = val(); ws();
    if (i < src.length) fail('Unexpected text after the JSON value');
    return { value };
  } catch (e) {
    return { error: e.message, offset: e.offset ?? i };
  }
}

export function lineCol(text, offset) {
  const before = String(text).slice(0, offset).split('\n');
  return { line: before.length, col: before[before.length - 1].length + 1 };
}

// ---------------------------------------------------------------- rules ---

const lc = (v) => (typeof v === 'string' ? v.toLowerCase() : v);

// Options TypeScript 6.0 deprecated (error TS5101/TS5107 unless
// "ignoreDeprecations": "6.0") and 7.0 removed (error TS5102/TS5108, which
// ignoreDeprecations cannot silence).
export const REMOVED_IN_7 = [
  {
    option: 'target', when: (v) => lc(v) === 'es5', shown: 'ES5',
    fix: 'Set "target" to "es2015" or later (ES2017+ if you can). TypeScript 7 no longer down-levels to ES5; if you must ship ES5, compile to ES2015 and run Babel or SWC afterwards for the old browsers.',
  },
  {
    option: 'downlevelIteration', when: (v) => v !== undefined,
    fix: 'Delete it. It only changed ES5 output, and ES5 output is gone.',
  },
  {
    option: 'moduleResolution', when: (v) => lc(v) === 'node' || lc(v) === 'node10', shown: 'node10', // tsc reports "node" as node10
    fix: 'Use "bundler" for code a bundler (Vite, webpack, esbuild) or a runtime like Bun consumes, or "nodenext" (with "module": "nodenext") for code Node runs directly. Both read package.json "exports", which node10 ignored, so some deep imports may now need the path a package actually exports.',
  },
  {
    option: 'moduleResolution', when: (v) => lc(v) === 'classic', shown: 'classic',
    fix: 'Use "bundler" or "nodenext". Classic resolution never looked in node_modules the way Node does.',
  },
  {
    option: 'baseUrl', when: (v) => v !== undefined,
    fix: 'Delete "baseUrl" and write each "paths" target relative to the tsconfig ("@/*": ["./src/*"] instead of "src/*" with baseUrl "."). Bare imports that only worked because of baseUrl (import "utils/x" meaning ./src/utils/x) need a "paths" entry such as "*": ["./src/*"], or a relative import.',
  },
  {
    option: 'outFile', when: (v) => v !== undefined && v !== null && v !== '',
    fix: 'Use a bundler (esbuild, Rollup, Vite) to produce one file. TypeScript 7 only emits one output file per input.',
  },
  {
    option: 'module', when: (v) => ['amd', 'umd', 'system'].includes(lc(v)), shown: (v) => v,
    fix: 'Emit ES modules ("module": "esnext" or "preserve") and let a bundler produce AMD, UMD or SystemJS if something still needs it; or "commonjs"/"nodenext" for Node.',
  },
  {
    // 6.0 deprecates it (TS5107); 7.0 no longer lists it as a value at all.
    option: 'module', when: (v) => lc(v) === 'none', shown: 'None', ts7: 'TS6046',
    fix: 'Pick a real module format: "esnext" or "preserve" for a bundler, "nodenext" for Node. Files without imports or exports are still treated as scripts.',
  },
  {
    option: 'esModuleInterop', when: (v) => v === false, shown: 'false',
    fix: 'Delete it (it is always on now). Namespace imports of CommonJS modules that you call or construct (import * as express from "express"; express()) must become default imports (import express from "express").',
  },
  {
    option: 'allowSyntheticDefaultImports', when: (v) => v === false, shown: 'false',
    fix: 'Delete it (it is always on now).',
  },
  {
    option: 'alwaysStrict', when: (v) => v === false, shown: 'false',
    fix: 'Delete it. Every file is now parsed and emitted in strict mode ("use strict"), so code that relies on sloppy mode (with statements, arguments.callee, octal literals, assigning to undeclared names) has to change.',
  },
];

// Options TypeScript 5.0 deprecated and 5.5 removed. TypeScript 6 still
// knows them and reports TS5102/TS5108 when they are switched on; TypeScript
// 7 no longer knows them at all, so any value, even false, is error TS5023
// ("Unknown compiler option"), and target ES3 is TS6046 (invalid value).
export const REMOVED_IN_55 = [
  { option: 'target', when: (v) => lc(v) === 'es3', ts6When: () => true, shown: 'ES3', ts7: 'TS6046', fix: 'Set "target" to "es2015" or later.' },
  { option: 'noImplicitUseStrict', fix: 'Delete it; strict-mode emit cannot be turned off.' },
  { option: 'keyofStringsOnly', fix: 'Delete it and write keyof T & string where only string keys are wanted.' },
  { option: 'suppressExcessPropertyErrors', fix: 'Delete it and fix the excess properties, or widen the target type.' },
  { option: 'suppressImplicitAnyIndexErrors', fix: 'Delete it and add index signatures or Record types where indexing is intended.' },
  { option: 'noStrictGenericChecks', fix: 'Delete it.' },
  { option: 'charset', ts6When: (v) => !!v, fix: 'Delete it; files are read as UTF-8.' },
  { option: 'out', ts6When: (v) => !!v, fix: 'Delete it; use a bundler for single-file output.' },
  { option: 'importsNotUsedAsValues', ts6When: (v) => lc(v) !== 'remove', fix: 'Replace it with "verbatimModuleSyntax": true (or just delete it if the value was "remove").' },
  { option: 'preserveValueImports', fix: 'Replace it with "verbatimModuleSyntax": true, or delete it if it was false.' },
].map((r) => ({ when: () => true, ts7: 'TS5023', ts6When: (v) => v === true, ...r }));

// Defaults that changed between TypeScript 5.9 and 6.0 (and stay in 7.0).
// Each applies only when the option is absent from the effective config.
// Before: the 5.9 computedOptions; after: the 6.0 ones. Fixtures in
// eval/defaults.json show the behaviour change on each.

const TARGET_ORDER = ['es3', 'es5', 'es6', 'es2015', 'es2016', 'es2017', 'es2018', 'es2019', 'es2020', 'es2021', 'es2022', 'es2023', 'es2024', 'es2025', 'esnext'];
const rank = (t) => { const r = TARGET_ORDER.indexOf(lc(t)); return r <= 2 ? r : r - 1; }; // es6 === es2015

function old59Target(o) {
  if (o.target !== undefined && lc(o.target) !== 'es3') return lc(o.target);
  const m = lc(o.module);
  if (m === 'node16' || m === 'node18') return 'es2022';
  if (m === 'node20') return 'es2023';
  if (m === 'nodenext') return 'esnext';
  return 'es5';
}
function old59Module(o) {
  if (o.module !== undefined) return lc(o.module);
  return rank(old59Target(o)) >= rank('es2015') ? 'es2015' : 'commonjs';
}
function old59Resolution(o) {
  if (o.moduleResolution !== undefined) return lc(o.moduleResolution);
  const m = old59Module(o);
  if (m === 'commonjs') return 'node10';
  if (m === 'node16' || m === 'node18' || m === 'node20') return 'node16';
  if (m === 'nodenext') return 'nodenext';
  if (m === 'preserve') return 'bundler';
  return 'classic';
}
function new6Target(o) {
  return o.target !== undefined && lc(o.target) !== 'es3' ? lc(o.target) : 'es2025';
}
function new6Module(o) {
  if (o.module !== undefined) return lc(o.module);
  const t = new6Target(o);
  if (t === 'esnext') return 'esnext';
  if (rank(t) >= rank('es2022')) return 'es2022';
  if (rank(t) >= rank('es2020')) return 'es2020';
  if (rank(t) >= rank('es2015')) return 'es2015';
  return 'commonjs';
}
function new6Resolution(o) {
  if (o.moduleResolution !== undefined) return lc(o.moduleResolution);
  const m = new6Module(o);
  if (['none', 'amd', 'umd', 'system'].includes(m)) return 'classic';
  if (m === 'nodenext') return 'nodenext';
  if (m === 'node16' || m === 'node18' || m === 'node20') return 'node16';
  return 'bundler';
}
export const computed = { old59Target, old59Module, old59Resolution, new6Target, new6Module, new6Resolution };

const emits = (o) => o.noEmit !== true;

export const DEFAULT_CHANGES = [
  {
    id: 'strict', severity: 'warning',
    applies: (o) => o.strict === undefined,
    message: () => '"strict" is not set. TypeScript 6 and 7 turn strict on by default (5.9 had it off), so noImplicitAny, strictNullChecks and the other strict checks start reporting errors.',
    fix: 'Add "strict": true and fix what it finds (recommended), or "strict": false to keep 5.9\'s behaviour while you migrate.',
  },
  {
    id: 'types', severity: 'warning',
    applies: (o) => o.types === undefined,
    // ctx.typesPackages: the @types packages the CLI found next to the
    // config, or null when unknown (the page cannot see node_modules).
    severityFor: (ctx) => (Array.isArray(ctx.typesPackages) && ctx.typesPackages.length === 0 ? 'info' : 'warning'),
    message: (o, ctx) => '"types" is not set. TypeScript 6 and 7 default it to [] (5.9 loaded every package in node_modules/@types), so globals such as process, Buffer, describe, it and expect are no longer declared unless a file imports them.'
      + (Array.isArray(ctx.typesPackages) ? (ctx.typesPackages.length ? ` Installed and no longer loaded: ${ctx.typesPackages.map((t) => `@types/${t}`).join(', ')}.` : ' No node_modules/@types packages were found next to this config, so this may not affect you.') : ''),
    fix: (o, ctx) => `List the global type packages you rely on, for example "types": ${JSON.stringify(Array.isArray(ctx.typesPackages) && ctx.typesPackages.length ? ctx.typesPackages.slice(0, 6) : ['node'])}; or "types": ["*"] for 5.9's load-everything behaviour.`,
  },
  {
    id: 'target', severity: 'warning',
    applies: (o) => (o.target === undefined || lc(o.target) === 'es3') && emits(o) && old59Target(o) !== new6Target(o),
    message: (o) => `"target" is not set. It used to default to ${old59Target(o).toUpperCase()} and now defaults to ES2025, so the JavaScript emitted keeps async/await, optional chaining, class fields and other modern syntax instead of rewriting it, and class fields follow standard [[Define]] semantics.`,
    fix: 'Set "target" to the oldest JavaScript your runtime supports (for example "es2022" for Node 18+ and current browsers).',
  },
  {
    id: 'module', severity: 'warning',
    applies: (o) => o.module === undefined && emits(o) && old59Module(o) !== new6Module(o),
    message: (o) => `"module" is not set. It used to default to ${old59Module(o)} and now follows the target (${new6Module(o)} here), so emitted files use import/export${old59Module(o) === 'commonjs' ? ' instead of require() and exports' : ''}.`,
    fix: 'Set it explicitly: "nodenext" for code Node runs, "commonjs" to keep require() output, "esnext" or "preserve" for a bundler.',
  },
  {
    id: 'moduleResolution', severity: 'info',
    applies: (o) => o.moduleResolution === undefined && old59Resolution(o) !== new6Resolution(o),
    message: (o) => `"moduleResolution" is not set. It used to resolve as ${old59Resolution(o)} and now resolves as ${new6Resolution(o)}${new6Resolution(o) === 'bundler' ? ', which reads package.json "exports" and allows extensionless relative imports' : ''}. Imports may now find different files, or stop finding ones a package does not export.`,
    fix: 'Set "moduleResolution" explicitly ("bundler" or "nodenext") so the choice is visible.',
  },
  {
    id: 'esModuleInterop', severity: 'info',
    applies: (o) => o.esModuleInterop === undefined && ['commonjs', 'node16', 'node18', 'node20', 'nodenext'].includes(new6Module(o)),
    message: () => '"esModuleInterop" is not set and is now always on (5.9 had it off). CommonJS output gains __importDefault/__importStar helpers, default imports of CommonJS packages start to type-check, and calling a namespace import (import * as x; x()) becomes an error.',
    fix: 'Nothing to set; rewrite namespace imports that are called or constructed as default imports.',
  },
  {
    id: 'rootDir', severity: 'warning',
    applies: (o) => o.rootDir === undefined && emits(o) && (o.outDir !== undefined || o.declarationDir !== undefined || !!o.outFile),
    message: (o) => `"rootDir" is not set while "${o.outDir !== undefined ? 'outDir' : o.declarationDir !== undefined ? 'declarationDir' : 'outFile'}" is.`
      + ' TypeScript 6 and 7 default rootDir to the folder holding tsconfig.json instead of the common folder of your sources. If your sources sit in a subfolder such as src/, the compiler reports error TS5011 asking you to set rootDir, and src/index.ts would be emitted as src/index.js under the output folder instead of index.js.',
    fix: 'Set "rootDir" to your source folder, usually "./src".',
  },
  {
    id: 'noUncheckedSideEffectImports', severity: 'info',
    applies: (o) => o.noUncheckedSideEffectImports === undefined,
    message: () => '"noUncheckedSideEffectImports" is not set and now defaults to true: a side-effect import (import "./polyfill"; import "./styles.css") that resolves to no file or declaration is error TS2882.',
    fix: 'Add a declaration for asset imports (declare module "*.css";), or set "noUncheckedSideEffectImports": false.',
  },
  {
    id: 'alwaysStrictWithStrictOff', severity: 'info',
    applies: (o) => o.strict === false && o.alwaysStrict === undefined,
    message: () => '"strict" is false and "alwaysStrict" is not set. In 5.9 that meant no "use strict" in the output; in 6 and 7 every file is emitted and checked in strict mode regardless of "strict".',
    fix: 'Nothing to set; check that no file depends on sloppy-mode JavaScript.',
  },
  {
    id: 'libReplacement', severity: 'info',
    applies: (o) => o.libReplacement === undefined,
    onlyIf: (ctx) => ctx.hasLibReplacementPackages,
    message: () => '"libReplacement" is not set and now defaults to false, so @typescript/lib-* packages (such as @typescript/lib-dom) no longer replace the built-in lib files.',
    fix: 'Set "libReplacement": true if you install @typescript/lib-* packages on purpose.',
  },
];

// ---------------------------------------------------------------- check ---

function label(option, v, shown) {
  return shown === null ? `"${option}"` : `"${option}": ${JSON.stringify(v)}`;
}

function shownValue(rule, v) {
  if (typeof rule.shown === 'function') return String(rule.shown(v));
  return rule.shown ?? null;
}

// Merge extends chain: `bases` are already-parsed compilerOptions objects,
// nearest first. Later (nearer) wins, like tsc.
export function mergeOptions(chain) {
  const out = {};
  for (const o of [...chain].reverse()) Object.assign(out, o || {});
  return out;
}

// config: a parsed tsconfig object. opts.bases: array of {name, config}
// for resolved `extends` (nearest first); opts.unresolvedExtends: names the
// caller could not read. Returns { findings, effective, summary }.
export function checkConfig(config, opts = {}) {
  const findings = [];
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return { findings: [{ severity: 'error', id: 'not-object', message: 'tsconfig.json must be a JSON object.' }], effective: {}, summary: summarize([{ severity: 'error' }]) };
  }
  const own = config.compilerOptions && typeof config.compilerOptions === 'object' ? config.compilerOptions : {};
  const bases = opts.bases || [];
  const effective = mergeOptions([own, ...bases.map((b) => b.config?.compilerOptions)]);
  const unresolved = opts.unresolvedExtends || [];
  const where = (key) => {
    if (key in own) return null;
    const b = bases.find((x) => x.config?.compilerOptions && key in x.config.compilerOptions);
    return b ? b.name : null;
  };

  const ignore = effective.ignoreDeprecations;
  for (const rule of REMOVED_IN_7) {
    const v = effective[rule.option];
    if (v === undefined || !rule.when(v)) continue;
    const shown = shownValue(rule, v);
    const from = where(rule.option);
    const ts7 = rule.ts7 || (shown === null ? 'TS5102' : 'TS5108');
    const ts7Text = ts7 === 'TS6046'
      ? `error TS6046, because "${shown}" is no longer an accepted value for "${rule.option}"`
      : `error ${ts7}: "Option '${rule.option}${shown === null ? '' : `=${shown}`}' has been removed. Please remove it from your configuration."`;
    findings.push({
      severity: 'error', id: `removed:${rule.option}${shown ? `=${lc(String(shown))}` : ''}`, option: rule.option, ts7Code: ts7,
      message: `${label(rule.option, v, shown)} was deprecated in TypeScript 6.0 and removed in 7.0. TypeScript 7 stops with ${ts7Text}${from ? ` (set in ${from})` : ''}`,
      fix: rule.fix, from,
      ts6: ignore === '6.0' ? 'silenced by "ignoreDeprecations": "6.0"' : `error ${shown === null ? 'TS5101' : 'TS5107'} (deprecated)`,
      ts7: `error ${ts7}`,
    });
  }
  for (const rule of REMOVED_IN_55) {
    const v = effective[rule.option];
    if (v === undefined || !rule.when(v)) continue;
    const shown = shownValue(rule, v);
    const from = where(rule.option);
    const ts6err = rule.ts6When(v);
    findings.push({
      severity: 'error', id: `removed:${rule.option}${shown ? `=${lc(String(shown))}` : ''}`, option: rule.option, ts7Code: rule.ts7,
      message: `${label(rule.option, v, shown)} was removed in TypeScript 5.5. ${rule.ts7 === 'TS6046' ? 'TypeScript 7 rejects the value with error TS6046' : `TypeScript 7 no longer knows the option at all and stops with error TS5023 "Unknown compiler option '${rule.option}'"${ts6err ? '' : ', even for this value, which TypeScript 6 still accepted'}`}.${from ? ` (set in ${from})` : ''}`,
      fix: rule.fix, from,
      ts6: ts6err ? `error ${shown === null ? 'TS5102' : 'TS5108'} (removed)` : 'accepted',
      ts7: `error ${rule.ts7}`,
    });
  }
  for (const [i, ref] of (Array.isArray(config.references) ? config.references : []).entries()) {
    if (ref && ref.prepend) {
      findings.push({ severity: 'warning', id: 'removed:references.prepend', option: `references[${i}].prepend`, message: `"prepend" on the project reference to ${JSON.stringify(ref.path)} was removed in TypeScript 5.5. TypeScript 6 reports error TS5102; TypeScript 7 accepts it silently and does nothing, so the referenced project's output is no longer concatenated into yours.`, fix: 'Delete "prepend" and concatenate the outputs with a bundler.', ts6: 'error TS5102 (removed)', ts7: 'ignored' });
    }
  }
  if (ignore !== undefined) {
    const has7 = findings.some((f) => f.ts6?.startsWith('silenced'));
    findings.push({
      severity: has7 ? 'warning' : 'info', id: 'ignoreDeprecations', option: 'ignoreDeprecations',
      message: has7
        ? `"ignoreDeprecations": ${JSON.stringify(ignore)} hides the deprecations above from TypeScript 6, but TypeScript 7 ignores it for options it has removed: they are errors there regardless.`
        : `"ignoreDeprecations": ${JSON.stringify(ignore)} is set but nothing in this config is deprecated any more, so it can be deleted.`,
      fix: has7 ? 'Fix the options above, then delete "ignoreDeprecations".' : 'Delete it.',
    });
  }

  const ctx = { hasLibReplacementPackages: !!opts.hasLibReplacementPackages, typesPackages: opts.typesPackages ?? null };
  for (const rule of DEFAULT_CHANGES) {
    if (!rule.applies(effective)) continue;
    if (rule.onlyIf && !rule.onlyIf(ctx)) continue;
    const maybe = unresolved.length > 0;
    const sev = rule.severityFor ? rule.severityFor(ctx) : rule.severity;
    findings.push({
      severity: maybe && sev === 'warning' ? 'info' : sev, id: `default:${rule.id}`, option: rule.id,
      message: rule.message(effective, ctx) + (maybe ? ` (Unless ${unresolved.map((u) => JSON.stringify(u)).join(', ')}, which this check could not read, sets it.)` : ''),
      fix: typeof rule.fix === 'function' ? rule.fix(effective, ctx) : rule.fix,
    });
  }
  if (unresolved.length) {
    findings.push({ severity: 'info', id: 'extends-unresolved', option: 'extends', message: `This config extends ${unresolved.map((u) => JSON.stringify(u)).join(', ')}, which was not read here. Options set there were not checked.`, fix: 'Check the base config too (paste it, drop it with this file, or run the CLI, which follows relative and node_modules extends).' });
  }
  return { findings, effective, summary: summarize(findings) };
}

function summarize(findings) {
  const n = (s) => findings.filter((f) => f.severity === s).length;
  return { errors: n('error'), warnings: n('warning'), infos: n('info') };
}

export function extendsList(config) {
  const e = config?.extends;
  if (e === undefined) return [];
  return (Array.isArray(e) ? e : [e]).filter((x) => typeof x === 'string');
}

// A suggested tsconfig with the removed options taken out and the defaults
// that changed pinned to what 6/7 now uses, so the file states its choices.
// Returns the new compilerOptions object; the caller decides how to print it.
export function suggestOptions(config, effective) {
  const own = { ...(config?.compilerOptions || {}) };
  const notes = [];
  const del = (k, why) => { if (k in own) { delete own[k]; notes.push(`removed "${k}": ${why}`); } };
  if (lc(own.target) === 'es5' || lc(own.target) === 'es3') { own.target = 'es2015'; notes.push('"target" raised to es2015 (the oldest TypeScript 7 emits)'); }
  del('downlevelIteration', 'only affected ES5 output');
  if (['node', 'node10', 'classic'].includes(lc(own.moduleResolution))) {
    const m = lc(own.module);
    if (m === 'commonjs' || m === 'node16' || m === 'nodenext') { own.module = 'nodenext'; own.moduleResolution = 'nodenext'; notes.push('"module"/"moduleResolution" set to nodenext (the file targeted Node with CommonJS); use "bundler" if a bundler consumes the output'); }
    else { own.moduleResolution = 'bundler'; notes.push('"moduleResolution" set to bundler'); }
  }
  if ('baseUrl' in own) {
    const base = String(own.baseUrl).replace(/\/+$/, '') || '.';
    if (own.paths && typeof own.paths === 'object') {
      const p = {};
      for (const [k, targets] of Object.entries(own.paths)) {
        p[k] = (Array.isArray(targets) ? targets : []).map((t) => (/^\.{0,2}\//.test(t) && base === '.' ? t : `./${[base, t].filter((x) => x && x !== '.').join('/').replace(/^\.\//, '')}`));
      }
      own.paths = p;
      notes.push(`"paths" rewritten relative to the tsconfig (baseUrl "${own.baseUrl}" folded in)`);
    }
    del('baseUrl', 'removed in 7.0');
  }
  if (['none', 'amd', 'umd', 'system'].includes(lc(own.module))) { own.module = 'esnext'; notes.push('"module" set to esnext (bundle to AMD/UMD/System afterwards if needed)'); }
  del('outFile', 'removed in 7.0; bundle instead');
  if (own.esModuleInterop === false) del('esModuleInterop', 'always on now');
  if (own.allowSyntheticDefaultImports === false) del('allowSyntheticDefaultImports', 'always on now');
  if (own.alwaysStrict === false) del('alwaysStrict', 'always on now');
  if (own.importsNotUsedAsValues !== undefined && lc(own.importsNotUsedAsValues) !== 'remove') own.verbatimModuleSyntax = true;
  if (own.preserveValueImports === true) own.verbatimModuleSyntax = true;
  for (const r of REMOVED_IN_55) if (r.option !== 'target' && own[r.option] !== undefined) del(r.option, 'removed in 5.5; TypeScript 7 does not know it');
  if ('ignoreDeprecations' in own) del('ignoreDeprecations', 'nothing left to silence');
  // Pin defaults that changed, keeping 5.9's behaviour where it is safe to
  // keep, so the migration does not change output silently.
  const e = effective || {};
  if (e.strict === undefined) { own.strict = false; notes.push('"strict": false pinned to keep 5.9 behaviour; switch it to true when you are ready'); }
  if (e.types === undefined) { own.types = ['*']; notes.push('"types": ["*"] pinned to keep loading every @types package; narrow it to the ones you use (for example ["node"])'); }
  if (e.noEmit !== true && e.target === undefined && old59Target(e) !== new6Target(e)) { own.target = old59Target(e) === 'es5' ? 'es2015' : old59Target(e); notes.push(`"target" pinned to ${own.target}`); }
  const res = lc(own.moduleResolution ?? e.moduleResolution);
  if (e.module === undefined && (res === 'node16' || res === 'nodenext')) { own.module = res; notes.push(`"module" set to ${res} to match "moduleResolution" (TS5110 otherwise)`); }
  else if (e.noEmit !== true && e.module === undefined && old59Module(e) !== new6Module(e)) { own.module = old59Module(e); notes.push(`"module" pinned to ${own.module} (the old default)`); }
  if (e.noEmit !== true && e.rootDir === undefined && (e.outDir !== undefined || e.declarationDir !== undefined)) { own.rootDir = './src'; notes.push('"rootDir": "./src" added: change it if your sources live elsewhere'); }
  return { compilerOptions: own, notes };
}
