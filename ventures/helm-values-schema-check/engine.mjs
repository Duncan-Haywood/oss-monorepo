// Checks a Helm chart's `values.yaml` against its own `values.schema.json`
// (a JSON Schema, the format Helm itself has supported since 3.5) without
// running Helm at all.
//
// Why this is worth a dedicated check: Helm's Go-template engine treats an
// undefined map key as an empty value, not an error. Write `imgae:` instead
// of `image:` in values.yaml and `helm template` renders quietly -- usually
// with a blank or a chart default silently standing in for what you meant
// to set -- and `helm lint` does not catch it unless the chart ships a
// values.schema.json *and* that schema sets `additionalProperties: false`
// on the object the typo landed in. Most charts that ship a schema at all
// leave `additionalProperties` unset (permissive, the JSON Schema default),
// so even `helm install --dry-run --validate` -- which does apply the
// schema -- waves an unrecognized field through. This checker treats an
// undeclared field as worth flagging either way: a hard violation if the
// schema forbids it, an informational one (almost always a typo or a stale
// key) if the schema merely does not mention it.
//
// It reads only the two files it is given -- no Helm binary, no chart
// dependency resolution, no cluster, no network call.

import { parseYaml } from "./yaml.mjs";

export const SEVERITY = { HIGH: "high", MEDIUM: "medium", LOW: "low", INFO: "info" };

function typeOf(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  if (typeof value === "string") return "string";
  if (typeof value === "object") return "object";
  return "unknown";
}

/** JSON Schema's "integer" is a subset of "number" -- a whole-number value satisfies either. */
function typeMatches(value, expected) {
  const actual = typeOf(value);
  const wanted = Array.isArray(expected) ? expected : [expected];
  return wanted.some((t) => (t === "number" ? actual === "number" || actual === "integer" : actual === t));
}

function pathJoin(base, key) {
  return base ? `${base}.${key}` : String(key);
}

function describeType(t) {
  return Array.isArray(t) ? t.join(" or ") : String(t);
}

/**
 * Walks `value` against `schema`, appending findings for every mismatch.
 * Recursion stops at a node once its own type is wrong -- a value of the
 * wrong shape has nothing more specific to say about its children.
 *
 * @param {unknown} value
 * @param {object} schema a JSON Schema node (object/array/string/etc, or
 *   `{}`/undefined, which JSON Schema treats as "anything is valid")
 * @param {string} path dot/bracket path for the report, e.g. `image.tag`
 * @param {Array} findings appended to in place
 */
function walk(value, schema, path, findings) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return;
  const here = path || "(root)";

  if (schema.type !== undefined && value !== undefined) {
    if (!typeMatches(value, schema.type)) {
      findings.push({
        id: "type-mismatch",
        severity: SEVERITY.HIGH,
        path: here,
        title: `${here}: expected ${describeType(schema.type)}, got ${typeOf(value)}`,
        detail: `values.yaml sets ${here} to ${JSON.stringify(value)}. The schema declares it as ${describeType(schema.type)}. \`helm install --dry-run --validate\` (or \`helm template --validate\`) would reject this chart on this field.`,
      });
      return;
    }
  }

  if (schema.enum !== undefined && value !== undefined) {
    const allowed = Array.isArray(schema.enum) ? schema.enum : [];
    if (!allowed.some((e) => JSON.stringify(e) === JSON.stringify(value))) {
      findings.push({
        id: "enum-violation",
        severity: SEVERITY.HIGH,
        path: here,
        title: `${here}: ${JSON.stringify(value)} is not one of the schema's allowed values`,
        detail: `Schema allows only: ${allowed.map((e) => JSON.stringify(e)).join(", ") || "(empty enum)"}.`,
      });
    }
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      findings.push({
        id: "below-minimum",
        severity: SEVERITY.HIGH,
        path: here,
        title: `${here}: ${value} is below the schema's minimum of ${schema.minimum}`,
        detail: `\`helm install --dry-run --validate\` would reject this value.`,
      });
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      findings.push({
        id: "above-maximum",
        severity: SEVERITY.HIGH,
        path: here,
        title: `${here}: ${value} is above the schema's maximum of ${schema.maximum}`,
        detail: `\`helm install --dry-run --validate\` would reject this value.`,
      });
    }
  }

  const valueIsPlainObject = value !== null && typeof value === "object" && !Array.isArray(value);
  if ((schema.type === "object" || schema.properties) && valueIsPlainObject) {
    const props = schema.properties && typeof schema.properties === "object" ? schema.properties : {};

    for (const req of Array.isArray(schema.required) ? schema.required : []) {
      if (!(req in value)) {
        findings.push({
          id: "missing-required",
          severity: SEVERITY.HIGH,
          path: pathJoin(path, req),
          title: `${pathJoin(path, req)}: required by the schema, missing from values.yaml`,
          detail: `\`helm install --dry-run --validate\` would reject this chart until values.yaml sets ${pathJoin(path, req)}.`,
        });
      }
    }

    const forbidUndeclared = schema.additionalProperties === false;
    for (const key of Object.keys(value)) {
      if (key in props) continue;
      findings.push({
        id: forbidUndeclared ? "undeclared-field-forbidden" : "undeclared-field",
        severity: forbidUndeclared ? SEVERITY.HIGH : SEVERITY.MEDIUM,
        path: pathJoin(path, key),
        title: forbidUndeclared
          ? `${pathJoin(path, key)}: not declared in the schema, and additionalProperties is false here`
          : `${pathJoin(path, key)}: not declared in the schema`,
        detail: forbidUndeclared
          ? `\`helm install --dry-run --validate\` would reject this field outright.`
          : `Helm's template engine does not error on an undeclared values.yaml field -- a chart template referencing the intended key silently gets an empty value instead. This is very often a typo (for example "imgae" instead of "image") or a leftover key after a rename. If it is intentional, add it to the schema's "properties" so this stops flagging it.`,
      });
    }

    for (const [key, subSchema] of Object.entries(props)) {
      if (key in value) walk(value[key], subSchema, pathJoin(path, key), findings);
    }
    return;
  }

  if (schema.type === "array" && schema.items && Array.isArray(value)) {
    value.forEach((item, i) => walk(item, schema.items, `${here === "(root)" ? "" : here}[${i}]`, findings));
  }
}

function countFields(value) {
  if (value === null || typeof value !== "object") return 1;
  if (Array.isArray(value)) return value.reduce((n, v) => n + countFields(v), 0);
  return Object.values(value).reduce((n, v) => n + countFields(v), 0);
}

/**
 * @param {object} values parsed values.yaml (a plain object)
 * @param {object} schema parsed values.schema.json (a plain object)
 * @returns {{findings: Array<{id:string, severity:string, path:string, title:string, detail:string}>, fieldsChecked: number}}
 */
export function validateValues(values, schema) {
  const findings = [];
  walk(values, schema, "", findings);
  return { findings, fieldsChecked: countFields(values) };
}

/**
 * Parses both inputs and validates. Throws a plain `Error` with a message
 * naming which file was the problem -- both the CLI and the browser page
 * surface `err.message` directly.
 *
 * @param {string} valuesText raw values.yaml text
 * @param {string} schemaText raw values.schema.json text
 */
export function checkValues(valuesText, schemaText) {
  let values;
  try {
    values = parseYaml(valuesText);
  } catch (err) {
    throw new Error(`values.yaml: ${err.message}`);
  }
  if (values === null || typeof values !== "object" || Array.isArray(values)) {
    throw new Error("values.yaml must parse to a mapping (key: value pairs) at the top level");
  }

  let schema;
  try {
    schema = JSON.parse(schemaText);
  } catch (err) {
    throw new Error(`values.schema.json: not valid JSON -- ${err.message}`);
  }
  if (schema === null || typeof schema !== "object" || Array.isArray(schema)) {
    throw new Error("values.schema.json must be a JSON object at the top level");
  }

  return validateValues(values, schema);
}
