#!/usr/bin/env node
// Cross-checks docs/api/openapi.yaml against the Hono route registrations in src/worker.
//
//   node scripts/check-openapi.mjs            # from apps/grants; exit 1 on any mismatch
//   node scripts/check-openapi.mjs --verbose  # also list every matched endpoint
//
// Implementation side: mount points come from src/worker/app.ts (`x.route("/prefix", router)`,
// following nested routers such as the tenant `org` router), registrations from each mounted
// route file: `routes.get|post|put|patch|delete("path", ...)`, chained `.get("path", ...)` calls
// on a `new Hono()` builder (a line starting with `.method("`), and `routes.on([...], "path")`.
// Roles: requireRole("x") / requireOrg("x") / requireUser in the registration's middleware list,
// else the router's base role (requireOrg on the mount) — compared with the spec's x-required-role.
//
// No dependencies: the YAML parser below handles the block-style subset openapi.yaml is written
// in (mappings, sequences, `|`/`|-` block scalars, JSON-quoted or plain scalars, [] and {}).
// docs/api/openapi.json is used instead when it exists and the YAML does not.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKER = join(ROOT, "src/worker");
const APP_TS = join(WORKER, "app.ts");
const ROUTES_DIR = join(WORKER, "routes");
const SPEC_YAML = join(ROOT, "docs/api/openapi.yaml");
const SPEC_JSON = join(ROOT, "docs/api/openapi.json");
const METHODS = ["get", "post", "put", "patch", "delete"];
const verbose = process.argv.includes("--verbose");

// ---------------------------------------------------------------------------------------------
// Tiny YAML (subset) parser
// ---------------------------------------------------------------------------------------------

export function parseYaml(text) {
  const lines = text.split(/\r?\n/).map((raw, n) => ({ raw, n: n + 1 }));
  let pos = 0;
  const indentOf = (l) => l.raw.length - l.raw.trimStart().length;
  const isSkippable = (l) => l.raw.trim() === "" || l.raw.trimStart().startsWith("#");
  const fail = (l, msg) => {
    throw new Error(`openapi.yaml:${l?.n ?? "EOF"}: ${msg}${l ? ` -> ${l.raw.trim()}` : ""}`);
  };
  const skip = () => {
    while (pos < lines.length && isSkippable(lines[pos])) pos++;
  };

  function scalar(src, line) {
    const t = src.trim();
    if (t === "" || t === "~" || t === "null") return null;
    if (t === "true") return true;
    if (t === "false") return false;
    if (t === "[]") return [];
    if (t === "{}") return {};
    if (/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(t)) return Number(t);
    if (t.startsWith('"')) {
      try {
        return JSON.parse(t);
      } catch {
        fail(line, "bad double-quoted scalar");
      }
    }
    if (t.startsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
    if (/^[[{&*!|>%@`]/.test(t)) fail(line, "unsupported YAML construct");
    return t;
  }

  /** Splits `key: rest` (key plain or double-quoted); null when the text is not a mapping entry. */
  function splitKey(src) {
    if (src.startsWith('"')) {
      let i = 1;
      while (i < src.length && src[i] !== '"') i += src[i] === "\\" ? 2 : 1;
      const after = src.slice(i + 1);
      if (!/^:( |$)/.test(after)) return null;
      return { key: JSON.parse(src.slice(0, i + 1)), rest: after.slice(1).trim() };
    }
    const m = /^([^\s"'#][^:]*?):( |$)(.*)$/.exec(src);
    return m ? { key: m[1], rest: m[3].trim() } : null;
  }

  function blockScalar(indent, keep) {
    const out = [];
    while (pos < lines.length) {
      const l = lines[pos];
      if (l.raw.trim() !== "" && indentOf(l) <= indent) break;
      out.push(l.raw.trim() === "" ? "" : l.raw.slice(indent + 2));
      pos++;
    }
    while (out.length && out.at(-1) === "") out.pop();
    return out.join("\n") + (keep ? "\n" : "");
  }

  function value(rest, line, indent) {
    if (rest === "|" || rest === "|-") return blockScalar(indent, rest === "|");
    if (rest === "") {
      skip();
      const next = lines[pos];
      if (!next || indentOf(next) <= indent) return null;
      return block(indentOf(next));
    }
    return scalar(rest, line);
  }

  function mapping(indent, first) {
    const obj = {};
    let entry = first;
    while (true) {
      const { key, rest, line } = entry;
      if (Object.hasOwn(obj, key)) fail(line, `duplicate key "${key}"`);
      obj[key] = value(rest, line, indent);
      skip();
      const l = lines[pos];
      if (!l || indentOf(l) < indent) break;
      if (indentOf(l) > indent) fail(l, "unexpected indentation");
      const src = l.raw.trim();
      if (src.startsWith("- ") || src === "-") break;
      const kv = splitKey(src);
      if (!kv) fail(l, "expected `key: value`");
      pos++;
      entry = { ...kv, line: l };
    }
    return obj;
  }

  function sequence(indent) {
    const arr = [];
    while (true) {
      skip();
      const l = lines[pos];
      if (!l || indentOf(l) !== indent) break;
      const src = l.raw.trim();
      if (!(src.startsWith("- ") || src === "-")) break;
      pos++;
      const rest = src === "-" ? "" : src.slice(2).trim();
      const kv = rest.startsWith('"') || /^[^\s"'#][^:]*?:( |$)/.test(rest) ? splitKey(rest) : null;
      if (kv) arr.push(mapping(indent + 2, { ...kv, line: l }));
      else arr.push(value(rest, l, indent));
    }
    return arr;
  }

  function block(indent) {
    skip();
    const l = lines[pos];
    const src = l.raw.trim();
    if (src.startsWith("- ") || src === "-") return sequence(indent);
    const kv = splitKey(src);
    if (!kv) fail(l, "expected a mapping or sequence");
    pos++;
    return mapping(indent, { ...kv, line: l });
  }

  skip();
  if (pos >= lines.length) return null;
  const doc = block(indentOf(lines[pos]));
  skip();
  if (pos < lines.length) fail(lines[pos], "trailing content");
  return doc;
}

// ---------------------------------------------------------------------------------------------
// Implementation side
// ---------------------------------------------------------------------------------------------

/** Hono's mergePath for two segments. */
function mergePath(base, sub) {
  const b = base.startsWith("/") ? base : `/${base}`;
  if (sub === "/" || sub === "") return b;
  return `${b.endsWith("/") ? b.slice(0, -1) : b}/${sub.startsWith("/") ? sub.slice(1) : sub}`;
}

/** `:id` -> `{id}`, a trailing `*` -> `{*}`. */
const toOpenApiPath = (p) => p.replace(/:(\w+)/g, "{$1}").replace(/\/\*$/, "/{*}");
/** Shape key: parameter names (and wildcards) do not matter. */
const shapeOf = (p) => p.replace(/\{[^}]*\}/g, "{}");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory()
      ? walk(p)
      : p.endsWith(".ts") && !/\.test\.ts$/.test(p)
        ? [p]
        : [];
  });
}

/** Text of a call's arguments starting at `openIdx` (the `(`), up to the matching `)`. */
function callArgs(src, openIdx) {
  let depth = 0;
  let quote = null;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) return src.slice(openIdx + 1, i);
    }
  }
  return src.slice(openIdx + 1);
}

/** Middleware part of a registration (everything before the handler). */
function middlewareOf(args) {
  const h = args.search(/\basync\s*\(\s*c\b|\(\s*c\s*\)\s*=>|\bc\s*=>/);
  return h === -1 ? args : args.slice(0, h);
}

function roleFromMiddleware(mw) {
  const role =
    /requireRole\(\s*["'](\w+)["']\s*\)/.exec(mw) ?? /requireOrg\(\s*["'](\w+)["']\s*\)/.exec(mw);
  if (role) return role[1];
  if (/\brequireUser\b/.test(mw)) return "authenticated";
  return null;
}

function findRegistrations(file) {
  const src = readFileSync(file, "utf8");
  const regs = [];
  const direct = /\broutes\s*\.\s*(get|post|put|patch|delete)\s*\(\s*(["'`])(.*?)\2/g;
  const chained = /^\s*\.\s*(get|post|put|patch|delete)\s*\(\s*(["'`])(.*?)\2/gm;
  // `new Hono<AppEnv>().post("/", ...)` on one line (the next-line form is `chained`).
  const builder =
    /\bnew\s+Hono\s*(?:<[^>]*>)?\s*\(\s*\)[ \t]*\.\s*(get|post|put|patch|delete)\s*\(\s*(["'`])(.*?)\2/g;
  for (const re of [direct, chained, builder]) {
    for (const m of src.matchAll(re)) {
      const dot = m.index + m[0].search(/\.\s*(get|post|put|patch|delete)\s*\(/);
      const args = callArgs(src, src.indexOf("(", dot));
      regs.push({
        methods: [m[1]],
        path: m[3],
        role: roleFromMiddleware(middlewareOf(args)),
        line: src.slice(0, dot).split("\n").length,
      });
    }
  }
  for (const m of src.matchAll(/\broutes\s*\.\s*on\s*\(\s*\[([^\]]*)\]\s*,\s*(["'`])(.*?)\2/g)) {
    const methods = [...m[1].matchAll(/["'](\w+)["']/g)].map((x) => x[1].toLowerCase());
    const args = callArgs(src, m.index + m[0].indexOf("("));
    regs.push({
      methods,
      path: m[3],
      role: roleFromMiddleware(middlewareOf(args)),
      line: src.slice(0, m.index).split("\n").length,
    });
  }
  const nested = [...src.matchAll(/\.\s*route\s*\(\s*["'`]/g)].length;
  return { regs, nested };
}

function implementationEndpoints() {
  const app = readFileSync(APP_TS, "utf8");
  const imports = new Map();
  for (const m of app.matchAll(/import\s+(\w+)\s+from\s+["'](\.\/routes\/[^"']+)["']/g)) {
    imports.set(m[1], resolve(WORKER, `${m[2]}.ts`));
  }
  const mounts = [...app.matchAll(/\b(\w+)\.route\(\s*["'`]([^"'`]*)["'`]\s*,\s*(\w+)\s*\)/g)].map(
    (m) => ({ parent: m[1], prefix: m[2], child: m[3] }),
  );
  // Base role from `x.use("*", requireOrg("role"))` on a nested router.
  const baseRole = new Map();
  for (const m of app.matchAll(
    /\b(\w+)\.use\(\s*["'`]\*["'`]\s*,\s*requireOrg\(\s*["'](\w+)["']/g,
  )) {
    baseRole.set(m[1], m[2]);
  }
  const parentOf = new Map(mounts.filter((m) => !imports.has(m.child)).map((m) => [m.child, m]));
  const prefixOf = (v, seen = new Set()) => {
    const m = parentOf.get(v);
    if (!m || seen.has(v)) return { prefix: "", role: baseRole.get(v) ?? null };
    seen.add(v);
    const up = prefixOf(m.parent, seen);
    return { prefix: mergePath(up.prefix || "/", m.prefix), role: baseRole.get(v) ?? up.role };
  };

  const endpoints = [];
  const emptyRouters = [];
  const nestedWarnings = [];
  const mountedFiles = new Set();
  for (const m of mounts) {
    const file = imports.get(m.child);
    if (!file) continue;
    mountedFiles.add(file);
    const parent = m.parent === "app" ? { prefix: "", role: null } : prefixOf(m.parent);
    const prefix = parent.prefix ? mergePath(parent.prefix, m.prefix) : m.prefix;
    const { regs, nested } = findRegistrations(file);
    if (nested) nestedWarnings.push(relative(ROOT, file));
    if (regs.length === 0) emptyRouters.push(`${prefix} (${relative(ROOT, file)})`);
    for (const r of regs) {
      const full = toOpenApiPath(mergePath(prefix, r.path));
      for (const method of r.methods) {
        endpoints.push({
          method,
          path: full,
          role: r.role ?? parent.role,
          source: `${relative(ROOT, file)}:${r.line}`,
        });
      }
    }
  }
  const unmounted = walk(ROUTES_DIR)
    .filter((f) => !mountedFiles.has(f))
    .map((f) => relative(ROOT, f));
  return { endpoints, emptyRouters, unmounted, nestedWarnings };
}

// ---------------------------------------------------------------------------------------------
// Spec side
// ---------------------------------------------------------------------------------------------

function loadSpec() {
  if (existsSync(SPEC_YAML))
    return { spec: parseYaml(readFileSync(SPEC_YAML, "utf8")), file: SPEC_YAML };
  if (existsSync(SPEC_JSON))
    return { spec: JSON.parse(readFileSync(SPEC_JSON, "utf8")), file: SPEC_JSON };
  throw new Error("docs/api/openapi.yaml (or openapi.json) not found");
}

function specEndpoints(spec) {
  const out = [];
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const method of METHODS) {
      const op = item?.[method];
      if (op)
        out.push({
          method,
          path,
          role: op["x-required-role"] ?? null,
          operationId: op.operationId,
        });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------------------------

function main() {
  const { spec, file } = loadSpec();
  const specOps = specEndpoints(spec);
  const impl = implementationEndpoints();

  const key = (e) => `${e.method.toUpperCase()} ${shapeOf(e.path)}`;
  const specByKey = new Map();
  const problems = [];
  for (const e of specOps) {
    if (specByKey.has(key(e))) problems.push(`duplicate in spec: ${key(e)}`);
    specByKey.set(key(e), e);
  }
  const implByKey = new Map();
  for (const e of impl.endpoints) {
    if (implByKey.has(key(e))) problems.push(`registered twice: ${key(e)} (${e.source})`);
    implByKey.set(key(e), e);
  }

  const missing = [...implByKey.values()].filter((e) => !specByKey.has(key(e)));
  const extra = [...specByKey.values()].filter((e) => !implByKey.has(key(e)));
  const roleMismatches = [];
  const nameWarnings = [];
  const matched = [];
  const opIds = new Map();
  for (const s of specOps) {
    if (!s.operationId) problems.push(`no operationId: ${s.method.toUpperCase()} ${s.path}`);
    else if (opIds.has(s.operationId)) problems.push(`duplicate operationId ${s.operationId}`);
    else opIds.set(s.operationId, s);
    if (!s.role) problems.push(`no x-required-role: ${s.method.toUpperCase()} ${s.path}`);
  }
  for (const [k, i] of implByKey) {
    const s = specByKey.get(k);
    if (!s) continue;
    matched.push({ ...i, specRole: s.role });
    if (s.path !== i.path && !i.path.includes("{*}")) {
      nameWarnings.push(`${k}: spec ${s.path} vs code ${i.path}`);
    }
    if (i.role && s.role !== i.role) {
      roleMismatches.push(
        `${i.method.toUpperCase()} ${i.path}: spec x-required-role=${s.role}, code=${i.role} (${i.source})`,
      );
    }
  }

  const rel = relative(ROOT, file);
  console.log(`OpenAPI check: ${rel} vs src/worker/app.ts + routes/**`);
  console.log(
    `  implemented: ${impl.endpoints.length}  documented: ${specOps.length}  matched: ${matched.length}` +
      `  (roles checked: ${matched.filter((m) => m.role).length})`,
  );
  if (verbose)
    for (const m of matched.sort((a, b) => a.path.localeCompare(b.path))) {
      console.log(
        `  ok  ${m.method.toUpperCase().padEnd(6)} ${m.path}  [${m.specRole}]  ${m.source}`,
      );
    }
  const section = (title, items) => {
    if (!items.length) return;
    console.log(`\n${title} (${items.length}):`);
    for (const x of items) console.log(`  - ${x}`);
  };
  section(
    "MISSING from spec (implemented, not documented)",
    missing.map((e) => `${e.method.toUpperCase()} ${e.path}  (${e.source})`),
  );
  section(
    "EXTRA in spec (documented, not implemented)",
    extra.map((e) => `${e.method.toUpperCase()} ${e.path}  (${e.operationId ?? "no operationId"})`),
  );
  section("ROLE mismatches", roleMismatches);
  section("Spec problems", problems);
  section("Warnings: path parameter names differ", nameWarnings);
  section("Info: mounted routers with no routes", impl.emptyRouters);
  section("Warnings: route files not mounted in app.ts", impl.unmounted);
  section("Warnings: nested .route() inside route files (not followed)", impl.nestedWarnings);

  const failed = missing.length + extra.length + roleMismatches.length + problems.length;
  console.log(failed ? `\nFAIL: ${failed} issue(s).` : "\nOK: spec matches the registered routes.");
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
