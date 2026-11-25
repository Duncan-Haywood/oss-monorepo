// Node's package "exports" and "imports" resolution, written from the
// algorithm in Node's documentation (doc/api/esm.md, "Resolution Algorithm
// Specification": PACKAGE_EXPORTS_RESOLVE, PACKAGE_IMPORTS_RESOLVE,
// PACKAGE_IMPORTS_EXPORTS_RESOLVE, PATTERN_KEY_COMPARE and
// PACKAGE_TARGET_RESOLVE) and checked against Node 22 itself by
// resolve.diff.test.mjs, which asks a real `node` the same questions. Where
// Node's code and the prose differ (a trailing-slash pattern key still
// matches, with a deprecation warning; an empty path segment in a target is
// a warning, not an error), this follows the code, because that is what a
// user's `import` does.
//
// Pure: no file system and no network. It answers "which file inside the
// package does this specifier name?", not "does that file exist?"; the
// caller has the file list for that. Runs unchanged in the browser.

const INVALID_SEGMENT = /(^|\\|\/)((\.|%2e)(\.|%2e)?|(n|%6e|%4e)(o|%6f|%4f)(d|%64|%44)(e|%65|%45)(_|%5f)(m|%6d|%4d)(o|%6f|%4f)(d|%64|%44)(u|%75|%55)(l|%6c|%4c)(e|%65|%45)(s|%73|%53))?(\\|\/|$)/i;
// The same without the empty segment: "//" is only deprecated, ".", ".."
// and "node_modules" segments are errors.
const FATAL_SEGMENT = /(^|\\|\/)((\.|%2e)(\.|%2e)?|(n|%6e|%4e)(o|%6f|%4f)(d|%64|%44)(e|%65|%45)(_|%5f)(m|%6d|%4d)(o|%6f|%4f)(d|%64|%44)(u|%75|%55)(l|%6c|%4c)(e|%65|%45)(s|%73|%53))(\\|\/|$)/i;
const ENCODED_SEPARATOR = /%2f|%5c/i;

// A stand-in location for the package. Targets are resolved as URLs against
// it, exactly as Node resolves them against the real package.json URL, and
// the answer is reported relative to it.
const PKG_URL = "file:///__pkg__/package.json";
const PKG_DIR = "/__pkg__/";

/** The condition sets Node 22 uses when nothing is passed with --conditions. */
export const DEFAULT_CONDITIONS = {
  import: ["node", "import", "module-sync", "node-addons"],
  require: ["node", "require", "module-sync", "node-addons"],
};

class ResolveError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const invalidTarget = (key, target, internal) =>
  new ResolveError(
    "ERR_INVALID_PACKAGE_TARGET",
    `Invalid "${internal ? "imports" : "exports"}" target ${JSON.stringify(target)} defined for '${key}'` +
      (internal ? "" : `; targets must start with "./"`),
  );

function isArrayIndex(key) {
  const n = Number(key);
  return String(n >>> 0) === key && n >>> 0 !== 0xffffffff;
}

/** PATTERN_KEY_COMPARE as Node implements it: -1 when a is more specific. */
export function patternKeyCompare(a, b) {
  const ai = a.indexOf("*");
  const bi = b.indexOf("*");
  const baseA = ai === -1 ? a.length : ai + 1;
  const baseB = bi === -1 ? b.length : bi + 1;
  if (baseA > baseB) return -1;
  if (baseB > baseA) return 1;
  if (ai === -1) return 1;
  if (bi === -1) return -1;
  if (a.length > b.length) return -1;
  if (b.length > a.length) return 1;
  return 0;
}

function resolveTargetString(target, subpath, key, pattern, internal, isPathMap, ctx) {
  if (subpath !== "" && !pattern && !target.endsWith("/")) throw invalidTarget(key, target, internal);
  if (!target.startsWith("./")) {
    if (internal && !target.startsWith("../") && !target.startsWith("/")) {
      let isURL = false;
      try {
        new URL(target);
        isURL = true;
      } catch {}
      if (!isURL) {
        const specifier = pattern ? target.replace(/\*/g, () => subpath) : target + subpath;
        ctx.trace.push(`"${specifier}" is another package: Node goes on to resolve it there`);
        return { external: specifier };
      }
    }
    throw invalidTarget(key, target, internal);
  }
  if (INVALID_SEGMENT.test(target.slice(2))) {
    if (FATAL_SEGMENT.test(target.slice(2))) throw invalidTarget(key, target, internal);
    if (!isPathMap) ctx.warnings.push(`target ${JSON.stringify(target)} has an empty path segment ("//"); Node prints a deprecation warning (DEP0166)`);
  }
  const resolved = new URL(target, PKG_URL);
  if (!resolved.pathname.startsWith(PKG_DIR)) throw invalidTarget(key, target, internal);
  if (subpath === "") return { url: resolved };
  if (INVALID_SEGMENT.test(subpath)) {
    const star = key.indexOf("*");
    const request = pattern && star !== -1 ? key.slice(0, star) + subpath + key.slice(star + 1) : pattern ? key : key + subpath;
    if (FATAL_SEGMENT.test(subpath)) {
      throw new ResolveError(
        "ERR_INVALID_MODULE_SPECIFIER",
        `Request '${request}' matched "${key}" but the part it fills in, "${subpath}", contains a ".", ".." or "node_modules" segment`,
      );
    }
    if (!isPathMap) ctx.warnings.push(`request '${request}' fills in an empty path segment ("//"); Node prints a deprecation warning (DEP0166)`);
  }
  if (pattern) return { url: new URL(resolved.href.replace(/\*/g, () => subpath)) };
  return { url: new URL(subpath, resolved) };
}

// Returns {url} or {external}, null (explicitly blocked), or undefined (no
// condition matched). Throws ResolveError.
function resolveTarget(target, subpath, key, pattern, internal, isPathMap, ctx, where) {
  if (typeof target === "string") {
    const r = resolveTargetString(target, subpath, key, pattern, internal, isPathMap, ctx);
    ctx.trace.push(`${where || "value"} ${JSON.stringify(target)}`);
    return r;
  }
  if (Array.isArray(target)) {
    if (target.length === 0) return null;
    let last;
    for (let i = 0; i < target.length; i++) {
      let r;
      try {
        r = resolveTarget(target[i], subpath, key, pattern, internal, isPathMap, ctx, `fallback array item ${i + 1}:`);
      } catch (e) {
        last = e;
        if (e.code === "ERR_INVALID_PACKAGE_TARGET") {
          ctx.trace.push(`fallback array item ${i + 1} is invalid (${e.message}); Node tries the next one`);
          continue;
        }
        throw e;
      }
      if (r === undefined) continue;
      if (r === null) {
        last = null;
        continue;
      }
      return r;
    }
    if (last === undefined || last === null) return last;
    throw last;
  }
  if (target !== null && typeof target === "object") {
    const keys = Object.getOwnPropertyNames(target);
    for (const k of keys) {
      if (isArrayIndex(k)) throw new ResolveError("ERR_INVALID_PACKAGE_CONFIG", `"${internal ? "imports" : "exports"}" cannot contain numeric property keys (found "${k}" under '${key}')`);
    }
    for (const k of keys) {
      if (k === "default" || ctx.conditions.has(k)) {
        const mark = ctx.trace.length;
        ctx.trace.push(`condition "${k}" applies`);
        const r = resolveTarget(target[k], subpath, key, pattern, internal, isPathMap, ctx, "value");
        if (r === undefined) {
          ctx.trace.splice(mark, ctx.trace.length - mark, `condition "${k}" applies but nothing under it matched; Node moves on`);
          continue;
        }
        return r;
      }
    }
    return undefined;
  }
  if (target === null) return null;
  throw invalidTarget(key, target, internal);
}

function bestPatternKey(name, map) {
  let best = "";
  let match;
  for (const key of Object.getOwnPropertyNames(map)) {
    const star = key.indexOf("*");
    if (star === -1 || !name.startsWith(key.slice(0, star))) continue;
    const trailer = key.slice(star + 1);
    if (name.length >= key.length && name.endsWith(trailer) && patternKeyCompare(best, key) === 1 && key.lastIndexOf("*") === star) {
      best = key;
      match = name.slice(star, name.length - trailer.length);
    }
  }
  return best ? { key: best, match } : null;
}

function isConditionalSugar(exp) {
  if (typeof exp === "string" || Array.isArray(exp)) return true;
  if (typeof exp !== "object" || exp === null) return false;
  let sugar;
  for (const key of Object.getOwnPropertyNames(exp)) {
    const cur = key === "" || key[0] !== ".";
    if (sugar === undefined) sugar = cur;
    else if (sugar !== cur) {
      throw new ResolveError(
        "ERR_INVALID_PACKAGE_CONFIG",
        `"exports" cannot contain some keys starting with "." and some not; Node rejects the whole map for every import`,
      );
    }
  }
  return sugar;
}

function finish(r, ctx) {
  if ("external" in r) return { ok: true, external: r.external, trace: ctx.trace, warnings: ctx.warnings };
  const encoded = r.url.pathname.slice(PKG_DIR.length);
  if (ENCODED_SEPARATOR.test(r.url.pathname)) {
    return fail(ctx, "ERR_INVALID_MODULE_SPECIFIER", `resolved path "./${encoded}" contains an encoded "/" or "\\" (%2F or %5C), which Node refuses`);
  }
  let file = encoded;
  try {
    file = decodeURIComponent(encoded);
  } catch {}
  return { ok: true, file: `./${file}`, encoded: `./${encoded}`, trace: ctx.trace, warnings: ctx.warnings };
}

function fail(ctx, code, message) {
  return { ok: false, code, message, trace: ctx.trace, warnings: ctx.warnings };
}

function makeCtx(conditions) {
  return { conditions: new Set(conditions), trace: [], warnings: [] };
}

/**
 * Resolves a subpath ("." or "./x") through a package's "exports" value.
 * Returns {ok:true, file, trace, warnings} with `file` relative to the
 * package ("./dist/x.js"), or {ok:false, code, message, trace, warnings}
 * with Node's error code.
 */
export function resolveExports(exportsField, subpath, { conditions = DEFAULT_CONDITIONS.import } = {}) {
  const ctx = makeCtx(conditions);
  try {
    let exp = exportsField;
    if (exp == null || (typeof exp !== "string" && typeof exp !== "object")) {
      // Node's package.json reader keeps "exports" only when it is a string,
      // an array or an object; anything else reads as no "exports" at all.
      return fail(ctx, "NO_EXPORTS", `the package has no usable "exports" field, so Node falls back to "main" and plain file paths`);
    }
    if (isConditionalSugar(exp)) exp = { ".": exp };
    const notExported = () =>
      fail(ctx, "ERR_PACKAGE_PATH_NOT_EXPORTED", subpath === "." ? `no "exports" main defined` : `Package subpath '${subpath}' is not defined by "exports"`);
    if (exp === null || typeof exp !== "object") return notExported();
    if (Object.prototype.hasOwnProperty.call(exp, subpath) && !subpath.includes("*") && !subpath.endsWith("/")) {
      ctx.trace.push(`key "${subpath}" matches exactly`);
      const r = resolveTarget(exp[subpath], "", subpath, false, false, false, ctx, "value");
      if (r == null) {
        if (r === null) ctx.trace.push(`the value is null (or every fallback is null): the subpath is deliberately blocked`);
        else ctx.trace.push(`no condition under it matches ${[...ctx.conditions].join(", ")} or "default"`);
        return notExported();
      }
      return finish(r, ctx);
    }
    const best = bestPatternKey(subpath, exp);
    if (best) {
      if (subpath.endsWith("/")) ctx.warnings.push(`'${subpath}' ends in "/"; matching it against a pattern is deprecated (DEP0155)`);
      ctx.trace.push(`pattern key "${best.key}" is the most specific match, with "*" = "${best.match}"`);
      const r = resolveTarget(exp[best.key], best.match, best.key, true, false, subpath.endsWith("/"), ctx, "value");
      if (r == null) {
        if (r === null) ctx.trace.push(`the value is null: the subpath is deliberately blocked`);
        else ctx.trace.push(`no condition under it matches ${[...ctx.conditions].join(", ")} or "default"`);
        return notExported();
      }
      return finish(r, ctx);
    }
    return notExported();
  } catch (e) {
    if (e instanceof ResolveError) return fail(ctx, e.code, e.message);
    throw e;
  }
}

/** Resolves a "#name" specifier through a package's "imports" value. */
export function resolveImports(importsField, name, { conditions = DEFAULT_CONDITIONS.import } = {}) {
  const ctx = makeCtx(conditions);
  try {
    if (name === "#" || name.startsWith("#/") || name.endsWith("/")) {
      return fail(ctx, "ERR_INVALID_MODULE_SPECIFIER", `"${name}" is not a valid internal imports specifier name`);
    }
    const notDefined = () => fail(ctx, "ERR_PACKAGE_IMPORT_NOT_DEFINED", `Package import specifier "${name}" is not defined in package.json "imports"`);
    if (!importsField || typeof importsField !== "object") return notDefined();
    if (Object.prototype.hasOwnProperty.call(importsField, name) && !name.includes("*")) {
      ctx.trace.push(`key "${name}" matches exactly`);
      const r = resolveTarget(importsField[name], "", name, false, true, false, ctx, "value");
      return r != null ? finish(r, ctx) : notDefined();
    }
    const best = bestPatternKey(name, importsField);
    if (best) {
      ctx.trace.push(`pattern key "${best.key}" is the most specific match, with "*" = "${best.match}"`);
      const r = resolveTarget(importsField[best.key], best.match, best.key, true, true, false, ctx, "value");
      if (r != null) return finish(r, ctx);
    }
    return notDefined();
  } catch (e) {
    if (e instanceof ResolveError) return fail(ctx, e.code, e.message);
    throw e;
  }
}

/**
 * Resolves what a user would write: "#internal", the package's own name
 * ("my-lib", "my-lib/feature"), or a subpath ("./feature", "."). `mode` is
 * "import" or "require"; extra conditions (--conditions=development) are
 * added to that mode's defaults.
 */
export function resolveSpecifier(pkg, specifier, { mode = "import", extraConditions = [] } = {}) {
  const conditions = [...(DEFAULT_CONDITIONS[mode] || DEFAULT_CONDITIONS.import), ...extraConditions];
  const spec = String(specifier ?? "").trim();
  if (spec.startsWith("#") && mode === "require" && pkg?.imports == null) {
    return {
      kind: "imports", subpath: spec, conditions, ok: false, code: "NO_IMPORTS",
      message: `the package has no "imports" field, so require() looks "${spec}" up as an ordinary package name (and usually fails with "Cannot find module")`,
      trace: [], warnings: [],
    };
  }
  if (spec.startsWith("#")) return { kind: "imports", subpath: spec, conditions, ...resolveImports(pkg?.imports, spec, { conditions }) };
  let subpath;
  if (spec === "." || spec.startsWith("./")) subpath = spec;
  else if (pkg?.name && (spec === pkg.name || spec.startsWith(pkg.name + "/"))) subpath = "." + spec.slice(pkg.name.length);
  else {
    return {
      kind: "exports",
      subpath: null,
      conditions,
      ok: false,
      code: "NOT_THIS_PACKAGE",
      message: pkg?.name
        ? `"${spec}" does not start with this package's name "${pkg.name}", "#" or "./"`
        : `this package.json has no "name"; write the subpath as "./feature" or "."`,
      trace: [],
      warnings: [],
    };
  }
  return { kind: "exports", subpath, conditions, ...resolveExports(pkg?.exports, subpath, { conditions }) };
}
