// Infer types from JSON samples. Pure functions: no I/O, no network, no storage.
// parseSamples(text) -> values; infer(values) -> model; generate(model, opts) -> { code, warnings, stats }

const RESERVED = new Set(['Array', 'Object', 'Date', 'String', 'Number', 'Boolean', 'Record', 'Map', 'Set', 'Promise', 'Function', 'Symbol', 'Error', 'Partial', 'Required', 'Readonly', 'Pick', 'Omit', 'Exclude', 'Extract', 'NonNullable', 'Awaited', 'Uppercase', 'Lowercase', 'Capitalize']);
const GO_INITIALISMS = new Set(['id', 'url', 'uri', 'api', 'http', 'https', 'json', 'uuid', 'ip', 'html', 'xml', 'sql', 'ui', 'uid']);

// ---- parsing -------------------------------------------------------------

// Accepts one JSON value, NDJSON, or several JSON objects/arrays pasted back to back.
export function parseSamples(text) {
  const src = String(text).replace(/^﻿/, '').trim();
  if (!src) throw new Error('Paste some JSON first.');
  try { return [JSON.parse(src)]; } catch (first) {
    const chunks = splitTopLevel(src);
    if (chunks.length < 2) throw new Error(explain(first, src));
    return chunks.map((c, i) => {
      try { return JSON.parse(c); } catch (e) { throw new Error(`Sample ${i + 1}: ${explain(e, c)}`); }
    });
  }
}

function explain(e, src) {
  const m = /position (\d+)/.exec(e.message);
  if (!m) return `Invalid JSON: ${e.message}`;
  const pos = Number(m[1]);
  const line = src.slice(0, pos).split('\n').length;
  return `Invalid JSON near line ${line}: ${e.message.replace(/ in JSON at position \d+.*$/, '')}`;
}

function splitTopLevel(src) {
  const out = [];
  let depth = 0, inStr = false, esc = false, start = -1;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { if (depth === 0) return []; inStr = true; continue; }
    if (c === '{' || c === '[') { if (depth === 0) start = i; depth++; continue; }
    if (c === '}' || c === ']') { depth--; if (depth < 0) return []; if (depth === 0) out.push(src.slice(start, i + 1)); continue; }
    if (depth === 0 && !/\s/.test(c)) return [];
  }
  return depth === 0 ? out : [];
}

// ---- inference -----------------------------------------------------------

const fresh = () => ({ nulls: 0, bools: 0, ints: 0, floats: 0, strings: 0, formats: {}, arrays: null, objects: null });

const FORMATS = [
  ['datetime', /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/],
  ['date', /^\d{4}-\d{2}-\d{2}$/],
  ['uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i],
  ['email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/],
  ['url', /^https?:\/\/[^\s]+$/i],
];
export function detectFormat(s) {
  for (const [name, re] of FORMATS) if (re.test(s)) return name;
  return 'plain';
}

function add(node, v) {
  if (v === null) node.nulls++;
  else if (typeof v === 'boolean') node.bools++;
  else if (typeof v === 'number') { if (Number.isInteger(v)) node.ints++; else node.floats++; }
  else if (typeof v === 'string') { node.strings++; const f = detectFormat(v); node.formats[f] = (node.formats[f] || 0) + 1; }
  else if (Array.isArray(v)) {
    node.arrays ||= { count: 0, empty: 0, item: fresh() };
    node.arrays.count++;
    if (!v.length) node.arrays.empty++;
    for (const el of v) add(node.arrays.item, el);
  } else if (typeof v === 'object') {
    node.objects ||= { count: 0, props: new Map() };
    node.objects.count++;
    for (const [k, val] of Object.entries(v)) {
      let p = node.objects.props.get(k);
      if (!p) node.objects.props.set(k, p = { seen: 0, node: fresh() });
      p.seen++;
      add(p.node, val);
    }
  }
}

export function infer(samples) {
  const root = fresh();
  for (const s of samples) add(root, s);
  return { root, sampleCount: samples.length };
}

// ---- naming --------------------------------------------------------------

export function words(s) {
  return String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean);
}
export function pascal(s) {
  const w = words(s).map((x) => x[0].toUpperCase() + x.slice(1));
  return w.join('');
}
export function singular(s) {
  if (/ies$/i.test(s) && s.length > 4) return s.slice(0, -3) + 'y';
  if (/(ss|us|is)$/i.test(s)) return s;
  if (/(ch|sh|x|s|z)es$/i.test(s) && s.length > 4) return s.slice(0, -2);
  if (/s$/i.test(s) && s.length > 3) return s.slice(0, -1);
  return s;
}
const isIdent = (k) => /^[A-Za-z_$][\w$]*$/.test(k);
const q = (k) => JSON.stringify(k);
const key = (k) => (isIdent(k) ? k : q(k));

function looksLikeRecordKeys(keys) {
  if (keys.length < 5) return false;
  return keys.every((k) => /^\d+$/.test(k) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(k) || /^[0-9a-f]{16,}$/i.test(k));
}

// ---- type model ----------------------------------------------------------
// t = { k:'unknown'|'null'|'boolean'|'integer'|'number'|'string'|'array'|'object'|'record'|'union', ... }

function build(node, hint, ctx) {
  const members = [];
  if (node.strings) {
    const f = Object.keys(node.formats);
    members.push({ k: 'string', format: f.length === 1 && f[0] !== 'plain' ? f[0] : null });
  }
  if (node.ints || node.floats) members.push({ k: node.floats ? 'number' : 'integer' });
  if (node.bools) members.push({ k: 'boolean' });
  if (node.arrays) {
    const item = node.arrays.item;
    const empty = !(item.nulls || item.bools || item.ints || item.floats || item.strings || item.arrays || item.objects);
    members.push({ k: 'array', item: empty ? { k: 'unknown' } : build(item, singular(hint), ctx), emptyOnly: empty });
    if (empty) ctx.warnings.add(`"${hint}" was always an empty array, so its item type is unknown. Add a sample with items.`);
  }
  if (node.objects) members.push(buildObject(node.objects, hint, ctx));
  if (node.nulls) members.push({ k: 'null' });
  if (!members.length) return { k: 'unknown' };
  if (members.length === 1) return members[0];
  const kinds = members.filter((m) => m.k !== 'null').map((m) => m.k);
  if (kinds.length > 1) ctx.warnings.add(`"${hint}" holds more than one type (${kinds.join(', ')}). Check that is intended.`);
  return { k: 'union', members };
}

function buildObject(o, hint, ctx) {
  const keys = [...o.props.keys()];
  if (looksLikeRecordKeys(keys)) {
    const merged = fresh();
    for (const p of o.props.values()) mergeInto(merged, p.node);
    ctx.warnings.add(`"${hint}" has ${keys.length} keys that look like IDs, so it is typed as a map (Record<string, ...>) rather than one field per key.`);
    return { k: 'record', value: build(merged, singular(hint), ctx) };
  }
  const props = keys.map((name) => {
    const p = o.props.get(name);
    return { name, optional: p.seen < o.count, type: build(p.node, name, ctx) };
  });
  for (const p of props) if (p.optional) ctx.optional++;
  ctx.fields += props.length;
  const sig = JSON.stringify(props.map((p) => [p.name, p.optional, sigOf(p.type)]));
  let decl = ctx.bySig.get(sig);
  if (!decl) {
    let base = pascal(hint) || 'Item';
    if (/^\d/.test(base)) base = 'T' + base;
    if (RESERVED.has(base)) base += 'Type';
    let name = base, n = 2;
    while (ctx.names.has(name)) name = base + n++;
    ctx.names.add(name);
    decl = { name, props };
    ctx.bySig.set(sig, decl);
    ctx.decls.push(decl);
  }
  return { k: 'object', decl };
}

function sigOf(t) {
  switch (t.k) {
    case 'array': return ['a', sigOf(t.item)];
    case 'record': return ['r', sigOf(t.value)];
    case 'object': return ['o', t.decl.name];
    case 'union': return ['u', t.members.map(sigOf)];
    case 'string': return ['s', t.format];
    default: return t.k;
  }
}

function mergeInto(a, b) {
  a.nulls += b.nulls; a.bools += b.bools; a.ints += b.ints; a.floats += b.floats; a.strings += b.strings;
  for (const [f, n] of Object.entries(b.formats)) a.formats[f] = (a.formats[f] || 0) + n;
  if (b.arrays) { a.arrays ||= { count: 0, empty: 0, item: fresh() }; a.arrays.count += b.arrays.count; a.arrays.empty += b.arrays.empty; mergeInto(a.arrays.item, b.arrays.item); }
  if (b.objects) {
    a.objects ||= { count: 0, props: new Map() };
    a.objects.count += b.objects.count;
    for (const [k, p] of b.objects.props) {
      let t = a.objects.props.get(k);
      if (!t) a.objects.props.set(k, t = { seen: 0, node: fresh() });
      t.seen += p.seen; mergeInto(t.node, p.node);
    }
  }
}

const DESCRIPTIONS = { datetime: 'ISO 8601 date-time', date: 'ISO 8601 date', uuid: 'UUID', email: 'email address', url: 'URL' };

// ---- emitters ------------------------------------------------------------

function tsType(t) {
  switch (t.k) {
    case 'unknown': return 'unknown';
    case 'null': return 'null';
    case 'boolean': return 'boolean';
    case 'integer': case 'number': return 'number';
    case 'string': return 'string';
    case 'array': { const i = tsType(t.item); return /[|&]/.test(i) ? `Array<${i}>` : `${i}[]`; }
    case 'object': return t.decl.name;
    case 'record': return `Record<string, ${tsType(t.value)}>`;
    case 'union': return t.members.map(tsType).join(' | ');
  }
}
const fmtNote = (t) => {
  const s = t.k === 'union' ? t.members.find((m) => m.k === 'string') : t;
  return s && s.k === 'string' && s.format ? ` // ${DESCRIPTIONS[s.format]}` : '';
};

function emitTs(ctx, opts, rootT) {
  const ro = opts.readonly ? 'readonly ' : '';
  const out = [];
  for (const d of ctx.decls) {
    const body = d.props.map((p) => `  ${ro}${key(p.name)}${p.optional ? '?' : ''}: ${tsType(p.type)};${fmtNote(p.type)}`);
    out.push(`export interface ${d.name} {\n${body.join('\n')}\n}`);
  }
  if (rootT.k !== 'object' || rootT.decl.name !== opts.rootName) out.push(`export type ${opts.rootName} = ${tsType(rootT)};`);
  return out.join('\n\n') + '\n';
}

const zodName = (n) => n + 'Schema';
function zodType(t) {
  switch (t.k) {
    case 'unknown': return 'z.unknown()';
    case 'null': return 'z.null()';
    case 'boolean': return 'z.boolean()';
    case 'integer': return 'z.number().int()';
    case 'number': return 'z.number()';
    case 'string': return { datetime: 'z.string().datetime({ offset: true })', date: 'z.string().date()', uuid: 'z.string().uuid()', email: 'z.string().email()', url: 'z.string().url()' }[t.format] || 'z.string()';
    case 'array': return `z.array(${zodType(t.item)})`;
    case 'object': return zodName(t.decl.name);
    case 'record': return `z.record(z.string(), ${zodType(t.value)})`;
    case 'union': {
      const nonNull = t.members.filter((m) => m.k !== 'null');
      const nullable = nonNull.length !== t.members.length;
      const base = nonNull.length === 1 ? zodType(nonNull[0]) : `z.union([${nonNull.map(zodType).join(', ')}])`;
      return nullable ? `${base}.nullable()` : base;
    }
  }
}
function emitZod(ctx, opts, rootT) {
  const out = ["import { z } from 'zod';", ''];
  for (const d of ctx.decls) {
    const body = d.props.map((p) => `  ${key(p.name)}: ${zodType(p.type)}${p.optional ? '.optional()' : ''},`);
    out.push(`export const ${zodName(d.name)} = z.object({\n${body.join('\n')}\n});`, `export type ${d.name} = z.infer<typeof ${zodName(d.name)}>;`, '');
  }
  if (rootT.k !== 'object' || rootT.decl.name !== opts.rootName) out.push(`export const ${zodName(opts.rootName)} = ${zodType(rootT)};`, `export type ${opts.rootName} = z.infer<typeof ${zodName(opts.rootName)}>;`, '');
  return out.join('\n').replace(/\n+$/, '\n');
}

function schemaOf(t) {
  switch (t.k) {
    case 'unknown': return {};
    case 'null': return { type: 'null' };
    case 'boolean': return { type: 'boolean' };
    case 'integer': return { type: 'integer' };
    case 'number': return { type: 'number' };
    case 'string': return t.format ? { type: 'string', format: t.format === 'datetime' ? 'date-time' : t.format === 'url' ? 'uri' : t.format } : { type: 'string' };
    case 'array': return { type: 'array', items: schemaOf(t.item) };
    case 'record': return { type: 'object', additionalProperties: schemaOf(t.value) };
    case 'object': {
      const o = { type: 'object', properties: {} };
      for (const p of t.decl.props) o.properties[p.name] = schemaOf(p.type);
      const req = t.decl.props.filter((p) => !p.optional).map((p) => p.name);
      if (req.length) o.required = req;
      return o;
    }
    case 'union': {
      const subs = t.members.map(schemaOf);
      if (subs.every((s) => s.type && Object.keys(s).length === 1)) return { type: subs.map((s) => s.type) };
      return { anyOf: subs };
    }
  }
}
function emitJsonSchema(ctx, opts, rootT) {
  return JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', title: opts.rootName, ...schemaOf(rootT) }, null, 2) + '\n';
}

function goField(name, used) {
  let n = words(name).map((w) => (GO_INITIALISMS.has(w.toLowerCase()) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join('') || 'Field';
  if (/^\d/.test(n)) n = 'F' + n;
  let out = n, i = 2;
  while (used.has(out)) out = n + i++;
  used.add(out);
  return out;
}
function goType(t, ctx, optional) {
  const ptr = (s) => (optional && !/^(\[\]|map\[|interface)/.test(s) ? '*' + s : s);
  switch (t.k) {
    case 'unknown': case 'null': return 'interface{}';
    case 'boolean': return ptr('bool');
    case 'integer': return ptr('int64');
    case 'number': return ptr('float64');
    case 'string': if (t.format === 'datetime') { ctx.needTime = true; return ptr('time.Time'); } return ptr('string');
    case 'array': return `[]${goType(t.item, ctx, false)}`;
    case 'record': return `map[string]${goType(t.value, ctx, false)}`;
    case 'object': return ptr(t.decl.name);
    case 'union': {
      const nonNull = t.members.filter((m) => m.k !== 'null');
      if (nonNull.length === 1) return goType(nonNull[0], ctx, true);
      return 'interface{}';
    }
  }
}
function emitGo(ctx, opts, rootT) {
  const body = [];
  for (const d of ctx.decls) {
    const used = new Set();
    const lines = d.props.map((p) => {
      const nullish = p.type.k === 'union' && p.type.members.some((m) => m.k === 'null');
      const t = goType(p.type, ctx, p.optional || nullish);
      return { f: goField(p.name, used), t, tag: `\`json:"${p.name}${p.optional ? ',omitempty' : ''}"\`` };
    });
    const w = Math.max(...lines.map((l) => l.f.length), 0), w2 = Math.max(...lines.map((l) => l.t.length), 0);
    body.push(`type ${d.name} struct {\n${lines.map((l) => `\t${l.f.padEnd(w)} ${l.t.padEnd(w2)} ${l.tag}`).join('\n')}\n}`);
  }
  if (rootT.k !== 'object' || rootT.decl.name !== opts.rootName) body.push(`type ${opts.rootName} ${goType(rootT, ctx, false)}`);
  const head = ['package main', ''];
  if (ctx.needTime) head.push('import "time"', '');
  return head.concat(body.join('\n\n')).join('\n') + '\n';
}

export const STYLES = ['ts', 'zod', 'jsonschema', 'go'];

export function generate(model, opts = {}) {
  const style = opts.style || 'ts';
  if (!STYLES.includes(style)) throw new Error(`style must be one of ${STYLES.join(', ')}`);
  const rootName = pascal(opts.rootName || 'Root') || 'Root';
  const ctx = { warnings: new Set(), decls: [], bySig: new Map(), names: new Set(), fields: 0, optional: 0, needTime: false };
  // A non-object root is an alias, so its name must not be taken by an item type.
  if (!model.root.objects) ctx.names.add(rootName);
  const rootT = build(model.root, model.root.objects ? rootName : 'items', ctx);
  if (rootT.k === 'object' && rootT.decl.name !== rootName) {
    // A nested identical-shaped object was named first; rename it to the root name when free.
    if (!ctx.decls.some((d) => d !== rootT.decl && d.name === rootName)) rootT.decl.name = rootName;
  }
  const effective = model.sampleCount === 1 && model.root.arrays ? model.root.arrays.item.objects?.count ?? 1 : model.sampleCount;
  if (effective === 1 && ctx.fields) ctx.warnings.add('One sample: every field is marked required. Paste several samples (one after another, or one per line) to find optional fields and other types.');
  const o = { ...opts, rootName };
  const code = { ts: emitTs, zod: emitZod, jsonschema: emitJsonSchema, go: emitGo }[style](ctx, o, rootT);
  return { code, warnings: [...ctx.warnings], stats: { samples: model.sampleCount, types: ctx.decls.length, fields: ctx.fields, optional: ctx.optional } };
}

export function convert(text, opts = {}) {
  return generate(infer(parseSamples(text)), opts);
}
