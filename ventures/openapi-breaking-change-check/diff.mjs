// Browser port of openapi_diff.py's comparison logic, kept in lock-step so
// the verdict a visitor sees on this page matches the CLI exactly.
// diff.test.mjs pins this port against the same fixtures
// test_openapi_diff.py uses, plus a parity test that shells out to
// `python3 openapi_diff.py` and asserts identical output on the same input.

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

/** "3.0" / "3.1" (major.minor only) for a supported OpenAPI 3.x document,
 * or null with a reason for anything else (missing, Swagger 2.0, unknown). */
export function detectFormat(doc) {
  if (!doc || typeof doc !== "object") return { supported: false, reason: "not a JSON object" };
  if (typeof doc.swagger === "string") {
    return { supported: false, reason: `Swagger ${doc.swagger} is not supported yet -- this tool reads OpenAPI 3.0/3.1 documents only` };
  }
  if (typeof doc.openapi === "string" && /^3\.[01]\b/.test(doc.openapi)) {
    return { supported: true, version: doc.openapi };
  }
  if (typeof doc.openapi === "string") {
    return { supported: false, reason: `unrecognized OpenAPI version "${doc.openapi}" -- this tool reads OpenAPI 3.0/3.1 documents only` };
  }
  return { supported: false, reason: 'no "openapi" field found -- expected a top-level "openapi": "3.0.x" or "3.1.x"' };
}

function unescapeJsonPointerSegment(segment) {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

/** Resolve a local "#/a/b/c" JSON Pointer $ref against the whole document.
 * Follows chained refs with a cycle guard; returns null for anything it
 * cannot resolve (an external ref, a dangling pointer, a cycle). */
function resolveRef(doc, ref, seen = new Set()) {
  if (typeof ref !== "string" || !ref.startsWith("#/")) return null;
  if (seen.has(ref)) return null;
  seen.add(ref);
  const parts = ref
    .slice(2)
    .split("/")
    .map(unescapeJsonPointerSegment);
  let node = doc;
  for (const part of parts) {
    if (node == null || typeof node !== "object") return null;
    node = node[part];
  }
  if (node && typeof node === "object" && typeof node.$ref === "string") {
    return resolveRef(doc, node.$ref, seen);
  }
  return node === undefined ? null : node;
}

function resolveMaybeRef(doc, value) {
  if (value && typeof value === "object" && typeof value.$ref === "string") {
    return resolveRef(doc, value.$ref) || {};
  }
  return value || {};
}

function paramSchemaShape(doc, param) {
  const schema = resolveMaybeRef(doc, param.schema);
  return { type: schema.type ?? null, enum: Array.isArray(schema.enum) ? schema.enum : null };
}

function mergeParams(pathParams, opParams) {
  const merged = new Map();
  for (const p of pathParams) merged.set(`${p.in}:${p.name}`, p);
  for (const p of opParams) merged.set(`${p.in}:${p.name}`, p); // operation params override path-level ones
  return [...merged.values()];
}

/** Walk a parsed OpenAPI 3.x document into a flat Map keyed by
 * "METHOD /path", each value {parameters: Map<"in:name", {required,type,enum}>,
 * requestBodyRequired: bool|null}. null means the operation declares no
 * request body at all. */
export function extractOperations(doc) {
  const operations = new Map();
  const paths = doc.paths || {};
  for (const [rawPath, rawItem] of Object.entries(paths)) {
    const pathItem = resolveMaybeRef(doc, rawItem);
    const pathLevelParams = (pathItem.parameters || []).map((p) => resolveMaybeRef(doc, p));
    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!op || typeof op !== "object") continue;
      const opParams = (op.parameters || []).map((p) => resolveMaybeRef(doc, p));
      const merged = mergeParams(pathLevelParams, opParams);
      const parameters = new Map();
      for (const p of merged) {
        if (!p.name || !p.in) continue;
        const { type, enum: enumValues } = paramSchemaShape(doc, p);
        parameters.set(`${p.in}:${p.name}`, { name: p.name, in: p.in, required: Boolean(p.required), type, enum: enumValues });
      }
      let requestBodyRequired = null;
      if (op.requestBody) {
        const rb = resolveMaybeRef(doc, op.requestBody);
        requestBodyRequired = Boolean(rb.required);
      }
      operations.set(`${method.toUpperCase()} ${rawPath}`, { parameters, requestBodyRequired });
    }
  }
  return operations;
}

/** Parse OpenAPI JSON text. Returns {version, operations}. Throws with a
 * message naming `label` if the text is not valid JSON or not a supported
 * OpenAPI 3.x document. */
export function parseOpenApi(text, label = "<spec>") {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (err) {
    throw new Error(`${label}: not valid JSON (${err.message})`);
  }
  const format = detectFormat(doc);
  if (!format.supported) throw new Error(`${label}: ${format.reason}`);
  return { version: format.version, operations: extractOperations(doc) };
}

/** Value-equality for a schema's `type`, which OpenAPI 3.1 (JSON Schema
 * 2020-12) allows to be either a string ("string") or an array of strings
 * (["string", "null"], the JSON Schema spelling of "nullable"). Comparing
 * two type arrays with `!==`, as a naive port of Python's `!=` might do,
 * compares object identity rather than contents: two freshly-parsed
 * documents never share array instances, so an unchanged
 * `type: ["string", "null"]` would falsely diff as "param-type-changed" on
 * every single comparison, whereas Python's list `!=` already compares by
 * value and gets this right. Order-sensitive, matching Python's list
 * equality exactly, so the two ports keep agreeing on order-preserving
 * documents (the overwhelmingly common case) rather than trading one
 * false positive for a different false negative. */
function typesEqual(before, after) {
  const key = (t) => (Array.isArray(t) ? JSON.stringify(t) : t);
  return key(before) === key(after);
}

function paramChanges(operationKey, oldParams, newParams) {
  const breaking = [];
  const nonBreaking = [];
  const allKeys = new Set([...oldParams.keys(), ...newParams.keys()]);
  for (const key of [...allKeys].sort()) {
    const before = oldParams.get(key);
    const after = newParams.get(key);
    if (!before && after) {
      const entry = { operation: operationKey, parameter: key, type: after.required ? "new-required-param" : "new-optional-param" };
      (after.required ? breaking : nonBreaking).push(entry);
      continue;
    }
    if (before && !after) {
      nonBreaking.push({ operation: operationKey, parameter: key, type: "removed-param" });
      continue;
    }
    if (!before.required && after.required) {
      breaking.push({ operation: operationKey, parameter: key, type: "param-now-required" });
    }
    if (before.type && after.type && !typesEqual(before.type, after.type)) {
      breaking.push({ operation: operationKey, parameter: key, type: "param-type-changed", from: before.type, to: after.type });
    }
    if (before.enum && after.enum) {
      const lost = before.enum.filter((v) => !after.enum.includes(v));
      const gained = after.enum.filter((v) => !before.enum.includes(v));
      if (lost.length) breaking.push({ operation: operationKey, parameter: key, type: "removed-enum-value", values: lost });
      if (gained.length) nonBreaking.push({ operation: operationKey, parameter: key, type: "added-enum-value", values: gained });
    } else if (!before.enum && after.enum) {
      // A parameter that previously accepted any value of its type now
      // accepts only the listed ones -- every value outside the new enum is
      // a value a client could have been sending that the API now rejects,
      // the same shape as removed-enum-value with an unbounded "before".
      breaking.push({ operation: operationKey, parameter: key, type: "enum-added", values: after.enum });
    } else if (before.enum && !after.enum) {
      // The reverse: the enum constraint is gone, so anything a client sent
      // before is still accepted, plus more. Widening, not narrowing.
      nonBreaking.push({ operation: operationKey, parameter: key, type: "enum-removed", values: before.enum });
    }
  }
  return { breaking, nonBreaking };
}

/** Compare two operation maps. Returns {breaking, nonBreaking}, each a list
 * of {operation, type, ...detail}, sorted by operation key. */
export function diffOperations(oldOps, newOps) {
  const breaking = [];
  const nonBreaking = [];
  const allKeys = new Set([...oldOps.keys(), ...newOps.keys()]);
  for (const key of [...allKeys].sort()) {
    const before = oldOps.get(key);
    const after = newOps.get(key);
    if (!before) {
      nonBreaking.push({ operation: key, type: "added-operation" });
      continue;
    }
    if (!after) {
      breaking.push({ operation: key, type: "removed-operation" });
      continue;
    }
    const params = paramChanges(key, before.parameters, after.parameters);
    breaking.push(...params.breaking);
    nonBreaking.push(...params.nonBreaking);

    if (before.requestBodyRequired !== after.requestBodyRequired) {
      if (!before.requestBodyRequired && after.requestBodyRequired) {
        breaking.push({ operation: key, type: "request-body-now-required" });
      } else {
        nonBreaking.push({ operation: key, type: "request-body-no-longer-required" });
      }
    }
  }
  return { breaking, nonBreaking };
}

export function hasBreakingChange(diff) {
  return diff.breaking.length > 0;
}

/** One-line headline for the page. */
export function summaryLine(diff) {
  if (diff.breaking.length === 0 && diff.nonBreaking.length === 0) {
    return "No differences found -- these two API versions describe the same operations, parameters, and request bodies.";
  }
  if (diff.breaking.length === 0) {
    return `No breaking changes. ${diff.nonBreaking.length} non-breaking change(s) found (new/removed optional things).`;
  }
  return `${diff.breaking.length} breaking change(s) found, plus ${diff.nonBreaking.length} non-breaking change(s).`;
}
