// Feature-flag engine: pure functions, no I/O, runs in the browser and in Node.
// Config: { version, salt?, flags: {key: Flag}, segments: {key: Segment} }
//   Flag    { key, description?, enabled, variants?: {name: value}, offVariant?, targets?: {variant: [keys]},
//             prerequisites?: [{flag, variant}], rules?: [{id, description?, if: [Condition], serve: Serve}],
//             fallthrough: Serve }
//   Serve   { variant } | { rollout: [{variant, weight}], bucketBy? }   (weights sum to 100)
//   Segment { description?, include?: [keys], exclude?: [keys], conditions?: [Condition] }
//   Condition { attr, op, value }
export const OPS = ["eq", "neq", "in", "notIn", "contains", "notContains", "startsWith", "endsWith", "gt", "gte", "lt", "lte", "exists", "notExists", "semverGte", "semverLt", "before", "after", "inSegment", "notInSegment"];
const DEFAULT_VARIANTS = { on: true, off: false };

// 32-bit murmur3 finalised hash of a string (UTF-16 code units). Stable forever: changing it reshuffles every rollout.
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
// 0..9999 (basis points of a percent): 0.01% resolution.
export const bucket = (salt, flagKey, value) => hash(`${salt || ""}.${flagKey}.${value}`) % 10000;

const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
const semver = (s) => { const m = String(s).trim().replace(/^v/i, "").match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/); return m ? [Number(m[1]), Number(m[2] || 0), Number(m[3] || 0), m[4] || ""] : null; };
function cmpSemver(a, b) {
  const x = semver(a), y = semver(b); if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  if (x[3] === y[3]) return 0; if (!x[3]) return 1; if (!y[3]) return -1; return x[3] < y[3] ? -1 : 1; // a prerelease sorts before the release
}
const num = (v) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
const time = (v) => (typeof v === "number" ? v : Date.parse(v));
export const attrOf = (ctx, attr) => (attr === "key" ? ctx.key : attr.split(".").reduce((o, k) => (isObj(o) || Array.isArray(o) ? o[k] : undefined), ctx));

export function matchCondition(c, ctx, config, seen = []) {
  if (c.op === "inSegment" || c.op === "notInSegment") {
    const names = Array.isArray(c.value) ? c.value : [c.value];
    const hit = names.some((n) => inSegment(config, n, ctx, seen));
    return c.op === "inSegment" ? hit : !hit;
  }
  const v = attrOf(ctx, c.attr), want = c.value, has = v !== undefined && v !== null;
  const list = Array.isArray(v) ? v : has ? [v] : [];
  const str = (x) => String(x);
  switch (c.op) {
    case "exists": return has;
    case "notExists": return !has;
    case "eq": return has && list.some((x) => str(x) === str(want));
    case "neq": return !list.some((x) => str(x) === str(want));
    case "in": return Array.isArray(want) && list.some((x) => want.some((w) => str(w) === str(x)));
    case "notIn": return !(Array.isArray(want) && list.some((x) => want.some((w) => str(w) === str(x))));
    case "contains": return list.some((x) => str(x).includes(str(want)));
    case "notContains": return !list.some((x) => str(x).includes(str(want)));
    case "startsWith": return list.some((x) => str(x).startsWith(str(want)));
    case "endsWith": return list.some((x) => str(x).endsWith(str(want)));
    case "gt": case "gte": case "lt": case "lte": {
      const a = num(v), b = num(want); if (Number.isNaN(a) || Number.isNaN(b)) return false;
      return c.op === "gt" ? a > b : c.op === "gte" ? a >= b : c.op === "lt" ? a < b : a <= b;
    }
    case "semverGte": case "semverLt": { const r = has ? cmpSemver(v, want) : null; if (r === null) return false; return c.op === "semverGte" ? r >= 0 : r < 0; }
    case "before": case "after": { const a = time(v), b = time(want); if (Number.isNaN(a) || Number.isNaN(b)) return false; return c.op === "before" ? a < b : a > b; }
    default: return false;
  }
}

export function inSegment(config, name, ctx, seen = []) {
  const s = config.segments && config.segments[name];
  if (!s || seen.includes(name)) return false; // unknown or cyclic segment matches nobody
  const key = ctx.key === undefined ? undefined : String(ctx.key);
  if (key !== undefined && (s.exclude || []).map(String).includes(key)) return false;
  if (key !== undefined && (s.include || []).map(String).includes(key)) return true;
  const cs = s.conditions || [];
  return cs.length > 0 && cs.every((c) => matchCondition(c, ctx, config, [...seen, name]));
}

// Pick a variant from a Serve spec for this context.
function serve(spec, flag, ctx, config) {
  if (!spec) return null;
  if (spec.variant !== undefined) return spec.variant;
  const roll = spec.rollout; if (!Array.isArray(roll) || !roll.length) return null;
  const by = attrOf(ctx, spec.bucketBy || "key");
  if (by === undefined || by === null || by === "") return { error: `no ${spec.bucketBy || "key"} in the context to bucket by` };
  const b = bucket(config.salt, flag.key, by); let edge = 0;
  for (const r of roll) { edge += Math.round(Number(r.weight) * 100); if (b < edge) return r.variant; }
  return roll[roll.length - 1].variant;
}

const variantsOf = (flag) => flag.variants || DEFAULT_VARIANTS;
const result = (flag, variant, reason, extra = {}) => {
  const vs = variantsOf(flag);
  return { flag: flag.key, variant, value: Object.prototype.hasOwnProperty.call(vs, variant) ? vs[variant] : null, reason, ...extra };
};

// ctx: { key, ...attributes }. Always returns a result; never throws on bad config.
export function evaluate(config, flagKey, ctx = {}, _stack = []) {
  const flag = config && config.flags && config.flags[flagKey];
  if (!flag) return { flag: flagKey, variant: null, value: null, reason: "not_found" };
  const off = flag.offVariant || "off";
  if (!flag.enabled) return result(flag, off, "off");
  if (_stack.includes(flagKey)) return result(flag, off, "prerequisite_cycle");
  for (const p of flag.prerequisites || []) {
    const r = evaluate(config, p.flag, ctx, [..._stack, flagKey]);
    if (r.variant !== p.variant) return result(flag, off, "prerequisite_failed", { prerequisite: p.flag });
  }
  const key = ctx.key === undefined ? undefined : String(ctx.key);
  if (key !== undefined) for (const [variant, keys] of Object.entries(flag.targets || {})) if (keys.map(String).includes(key)) return result(flag, variant, "target");
  for (const rule of flag.rules || []) {
    if ((rule.if || []).every((c) => matchCondition(c, ctx, config))) {
      const v = serve(rule.serve, flag, ctx, config);
      if (v && v.error) return result(flag, off, "error", { error: v.error, ruleId: rule.id });
      if (v) return result(flag, v, "rule", { ruleId: rule.id });
    }
  }
  const v = serve(flag.fallthrough, flag, ctx, config);
  if (v && v.error) return result(flag, off, "error", { error: v.error });
  return result(flag, v || off, "fallthrough");
}

export function evaluateAll(config, ctx = {}) {
  const out = {};
  for (const k of Object.keys(config.flags || {})) { const r = evaluate(config, k, ctx); out[k] = { variant: r.variant, value: r.value, reason: r.reason }; }
  return out;
}

const KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
function validateServe(spec, where, variants, errs) {
  if (!isObj(spec)) { errs.push(`${where}: serve must be {variant} or {rollout}`); return; }
  if (spec.variant !== undefined) { if (!(spec.variant in variants)) errs.push(`${where}: variant "${spec.variant}" is not defined in variants`); return; }
  if (!Array.isArray(spec.rollout) || !spec.rollout.length) { errs.push(`${where}: serve needs a variant or a non-empty rollout`); return; }
  let sum = 0;
  for (const r of spec.rollout) {
    if (!(r.variant in variants)) errs.push(`${where}: rollout variant "${r.variant}" is not defined in variants`);
    if (typeof r.weight !== "number" || r.weight < 0 || r.weight > 100) errs.push(`${where}: rollout weights are numbers from 0 to 100`);
    else sum += r.weight;
  }
  if (Math.abs(sum - 100) > 1e-9) errs.push(`${where}: rollout weights sum to ${sum}, not 100`);
}
export function validateConfig(config) {
  const errs = [];
  if (!isObj(config)) return ["config must be an object with flags and segments"];
  const flags = config.flags || {}, segments = config.segments || {};
  if (!isObj(flags)) return ["flags must be an object keyed by flag key"];
  if (!isObj(segments)) errs.push("segments must be an object keyed by segment key");
  for (const [sk, s] of Object.entries(isObj(segments) ? segments : {})) {
    if (!KEY_RE.test(sk)) errs.push(`segment "${sk}": key must be letters, digits, . _ - (max 64)`);
    for (const [i, c] of (s.conditions || []).entries()) validateCondition(c, `segment ${sk} condition ${i + 1}`, segments, errs);
  }
  for (const [k, f] of Object.entries(flags)) {
    const w = `flag ${k}`;
    if (!KEY_RE.test(k)) errs.push(`${w}: key must be letters, digits, . _ - (max 64)`);
    if (!isObj(f)) { errs.push(`${w}: must be an object`); continue; }
    if (f.key !== undefined && f.key !== k) errs.push(`${w}: key field "${f.key}" does not match its name`);
    if (typeof f.enabled !== "boolean") errs.push(`${w}: enabled must be true or false`);
    const vs = variantsOf(f);
    if (!isObj(vs) || !Object.keys(vs).length) { errs.push(`${w}: variants must be a non-empty object`); continue; }
    if (!((f.offVariant || "off") in vs)) errs.push(`${w}: offVariant "${f.offVariant || "off"}" is not in variants`);
    validateServe(f.fallthrough, `${w} fallthrough`, vs, errs);
    const ids = new Set();
    for (const [i, r] of (f.rules || []).entries()) {
      const rw = `${w} rule ${r.id || i + 1}`;
      if (r.id !== undefined) { if (ids.has(r.id)) errs.push(`${rw}: duplicate rule id`); ids.add(r.id); }
      for (const [j, c] of (r.if || []).entries()) validateCondition(c, `${rw} condition ${j + 1}`, segments, errs);
      validateServe(r.serve, rw, vs, errs);
    }
    for (const [variant, keys] of Object.entries(f.targets || {})) {
      if (!(variant in vs)) errs.push(`${w}: target variant "${variant}" is not defined in variants`);
      if (!Array.isArray(keys)) errs.push(`${w}: targets.${variant} must be a list of keys`);
    }
    for (const p of f.prerequisites || []) {
      if (!flags[p.flag]) errs.push(`${w}: prerequisite flag "${p.flag}" does not exist`);
      else if (!(p.variant in variantsOf(flags[p.flag]))) errs.push(`${w}: prerequisite variant "${p.variant}" is not a variant of ${p.flag}`);
    }
  }
  for (const k of Object.keys(flags)) if (hasCycle(flags, k)) errs.push(`flag ${k}: prerequisites form a cycle`);
  return errs;
}
function validateCondition(c, where, segments, errs) {
  if (!isObj(c)) { errs.push(`${where}: must be an object`); return; }
  if (!OPS.includes(c.op)) { errs.push(`${where}: unknown op "${c.op}" (use ${OPS.join(", ")})`); return; }
  if (c.op === "inSegment" || c.op === "notInSegment") { for (const n of [].concat(c.value)) if (!segments[n]) errs.push(`${where}: segment "${n}" does not exist`); return; }
  if (typeof c.attr !== "string" || !c.attr) errs.push(`${where}: attr is required`);
  if ((c.op === "in" || c.op === "notIn") && !Array.isArray(c.value)) errs.push(`${where}: ${c.op} needs a list value`);
  if (!["exists", "notExists", "in", "notIn"].includes(c.op) && c.value === undefined) errs.push(`${where}: ${c.op} needs a value`);
}
function hasCycle(flags, start) {
  const walk = (k, path) => { if (path.includes(k)) return true; const f = flags[k]; return Boolean(f) && (f.prerequisites || []).some((p) => walk(p.flag, [...path, k])); };
  return (flags[start].prerequisites || []).some((p) => walk(p.flag, [start]));
}

// Evaluate one flag over a synthetic population: user-1..user-N sharing the given attributes.
export function simulate(config, flagKey, { users = 10000, attrs = {} } = {}) {
  const n = Math.min(Math.max(1, Math.floor(users)), 200000), byVariant = {}, byReason = {};
  for (let i = 1; i <= n; i++) {
    const r = evaluate(config, flagKey, { ...attrs, key: `user-${i}` });
    byVariant[r.variant] = (byVariant[r.variant] || 0) + 1;
    const why = r.reason + (r.ruleId ? `:${r.ruleId}` : ""); byReason[why] = (byReason[why] || 0) + 1;
  }
  return { users: n, byVariant, byReason };
}
// Who would change variant if `before` were replaced by `after`? The question to ask before every rollout edit.
export function impact(before, after, flagKey, { users = 10000, attrs = {} } = {}) {
  const n = Math.min(Math.max(1, Math.floor(users)), 200000), moves = {}; let changed = 0;
  for (let i = 1; i <= n; i++) {
    const ctx = { ...attrs, key: `user-${i}` };
    const a = evaluate(before, flagKey, ctx).variant, b = evaluate(after, flagKey, ctx).variant;
    if (a !== b) { changed++; const m = `${a} -> ${b}`; moves[m] = (moves[m] || 0) + 1; }
  }
  return { users: n, changed, moves };
}
