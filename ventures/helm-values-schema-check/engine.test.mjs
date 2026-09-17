import test from "node:test";
import assert from "node:assert/strict";
import { validateValues, checkValues, SEVERITY } from "./engine.mjs";
import { parseYaml, UnsupportedYamlError } from "./yaml.mjs";

test("validateValues finds nothing wrong with a fully-conforming values object", () => {
  const values = { image: { repository: "nginx", tag: "1.25" }, replicaCount: 3 };
  const schema = {
    type: "object",
    properties: {
      image: { type: "object", properties: { repository: { type: "string" }, tag: { type: "string" } }, required: ["repository"] },
      replicaCount: { type: "integer", minimum: 1 },
    },
  };
  const result = validateValues(values, schema);
  assert.deepEqual(result.findings, []);
});

test("flags a field present in values.yaml but not declared in the schema (the typo case)", () => {
  const values = { image: { repositry: "nginx" } };
  const schema = { type: "object", properties: { image: { type: "object", properties: { repository: { type: "string" } } } } };
  const { findings } = validateValues(values, schema);
  const f = findings.find((x) => x.id === "undeclared-field");
  assert.ok(f, "expected an undeclared-field finding");
  assert.equal(f.path, "image.repositry");
  assert.equal(f.severity, SEVERITY.MEDIUM);
});

test("an undeclared field under additionalProperties: false is a high-severity, forbidden finding", () => {
  const values = { service: { type: "ClusterIP", extra: true } };
  const schema = {
    type: "object",
    properties: { service: { type: "object", properties: { type: { type: "string" } }, additionalProperties: false } },
  };
  const { findings } = validateValues(values, schema);
  const f = findings.find((x) => x.id === "undeclared-field-forbidden");
  assert.ok(f);
  assert.equal(f.severity, SEVERITY.HIGH);
  assert.equal(f.path, "service.extra");
});

test("flags a required field missing from values.yaml", () => {
  const values = { image: {} };
  const schema = { type: "object", properties: { image: { type: "object", properties: { repository: { type: "string" } }, required: ["repository"] } } };
  const { findings } = validateValues(values, schema);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].id, "missing-required");
  assert.equal(findings[0].path, "image.repository");
  assert.equal(findings[0].severity, SEVERITY.HIGH);
});

test("flags a type mismatch and does not recurse into the mistyped value", () => {
  const values = { replicaCount: "three" };
  const schema = { type: "object", properties: { replicaCount: { type: "integer" } } };
  const { findings } = validateValues(values, schema);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].id, "type-mismatch");
  assert.match(findings[0].title, /expected integer, got string/);
});

test("an integer value satisfies a 'number' type declaration", () => {
  const { findings } = validateValues({ n: 3 }, { type: "object", properties: { n: { type: "number" } } });
  assert.deepEqual(findings, []);
});

test("a non-integer number fails an 'integer' type declaration", () => {
  const { findings } = validateValues({ n: 3.5 }, { type: "object", properties: { n: { type: "integer" } } });
  assert.equal(findings[0].id, "type-mismatch");
});

test("flags an enum violation", () => {
  const values = { service: { type: "Cluster-IP-Typo" } };
  const schema = { type: "object", properties: { service: { type: "object", properties: { type: { type: "string", enum: ["ClusterIP", "NodePort"] } } } } };
  const { findings } = validateValues(values, schema);
  assert.equal(findings[0].id, "enum-violation");
  assert.equal(findings[0].path, "service.type");
});

test("flags below-minimum and above-maximum separately", () => {
  const schema = { type: "object", properties: { n: { type: "integer", minimum: 1, maximum: 10 } } };
  assert.equal(validateValues({ n: 0 }, schema).findings[0].id, "below-minimum");
  assert.equal(validateValues({ n: 11 }, schema).findings[0].id, "above-maximum");
  assert.deepEqual(validateValues({ n: 5 }, schema).findings, []);
});

test("recurses into array items", () => {
  const values = { ports: [{ port: 80 }, { port: "bad" }] };
  const schema = { type: "object", properties: { ports: { type: "array", items: { type: "object", properties: { port: { type: "integer" } } } } } };
  const { findings } = validateValues(values, schema);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].path, "ports[1].port");
});

test("a schema node with no 'type' or 'properties' accepts anything (JSON Schema's open default)", () => {
  const { findings } = validateValues({ freeform: { anything: [1, 2, { nested: true }] } }, { type: "object", properties: { freeform: {} } });
  assert.deepEqual(findings, []);
});

test("fieldsChecked counts leaf-ish values, at least one for a non-empty object", () => {
  const { fieldsChecked } = validateValues({ a: 1, b: { c: 2, d: 3 } }, {});
  assert.equal(fieldsChecked, 3);
});

test("checkValues parses YAML and JSON and reports the same findings validateValues would", () => {
  const result = checkValues("replicaCount: 3\n", JSON.stringify({ type: "object", properties: { replicaCount: { type: "integer", minimum: 1 } } }));
  assert.deepEqual(result.findings, []);
  assert.equal(result.fieldsChecked, 1);
});

test("checkValues rejects invalid JSON in the schema with a file-named error", () => {
  assert.throws(() => checkValues("a: 1\n", "not json"), /values\.schema\.json: not valid JSON/);
});

test("checkValues rejects a values.yaml that does not parse to a mapping", () => {
  assert.throws(() => checkValues("- a\n- b\n", "{}"), /values\.yaml must parse to a mapping/);
});

test("checkValues rejects a values.schema.json that is not a JSON object", () => {
  assert.throws(() => checkValues("a: 1\n", "[1, 2]"), /values\.schema\.json must be a JSON object/);
});

test("checkValues surfaces an unsupported YAML feature as a values.yaml-prefixed error", () => {
  assert.throws(() => checkValues("a: &x 1\nb: *x\n", "{}"), /values\.yaml: YAML anchors/);
});

test("parseYaml (re-exported dependency) handles nested mappings the way a real values.yaml does", () => {
  const doc = parseYaml("image:\n  repository: nginx\n  tag: \"1.25\"\nreplicaCount: 3\n");
  assert.deepEqual(doc, { image: { repository: "nginx", tag: "1.25" }, replicaCount: 3 });
});

test("parseYaml refuses YAML merge keys", () => {
  assert.throws(() => parseYaml("<<: *base\n"), UnsupportedYamlError);
});
