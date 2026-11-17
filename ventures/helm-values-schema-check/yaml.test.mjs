// Tests for the values.yaml reader. Each case is YAML a real chart's
// values.yaml contains; the comments name what used to go wrong.
import test from "node:test";
import assert from "node:assert/strict";
import { parseYaml } from "./yaml.mjs";
import { checkValues } from "./engine.mjs";

test("a compact sequence at the key's own indent is read, and the keys after it survive", () => {
  // Before 2026-11-16 `args:` came back null and parsing stopped there, so
  // every later key was dropped without a word.
  assert.deepEqual(parseYaml("args:\n- --foo\n- --bar\nreplicas: 2\n"), {
    args: ["--foo", "--bar"],
    replicas: 2,
  });
  assert.deepEqual(
    parseYaml("service:\n  ports:\n  - name: http\n    port: 80\n  - name: https\n    port: 443\n  type: ClusterIP\nimage: nginx\n"),
    { service: { ports: [{ name: "http", port: 80 }, { name: "https", port: 443 }], type: "ClusterIP" }, image: "nginx" },
  );
});

test("checkValues on a compact sequence reports the real typo, not a phantom missing field", () => {
  const schema = JSON.stringify({
    type: "object",
    additionalProperties: false,
    required: ["replicas"],
    properties: { args: { type: "array", items: { type: "string" } }, replicas: { type: "integer" } },
  });
  const { findings } = checkValues("args:\n- --foo\nreplicas: 2\nreplcas: 3\n", schema);
  assert.deepEqual(findings.map((f) => f.path), ["replcas"]);
});

test("an apostrophe inside a bare value does not swallow the comment after it", () => {
  assert.deepEqual(parseYaml("note: it's fine # explained in the README\n"), { note: "it's fine" });
  assert.deepEqual(parseYaml("q: 'a # b' # c\n"), { q: "a # b" });
});

test("flow sequences and mappings split on top-level commas only", () => {
  assert.deepEqual(parseYaml("hosts: [a.example, b.example]\n"), { hosts: ["a.example", "b.example"] });
  assert.deepEqual(parseYaml("m: {a: [1, 2], b: 3}\nnext: x\n"), { m: { a: [1, 2], b: 3 }, next: "x" });
});

test("a flow collection wrapped across lines is joined, and one closed on its line is not", () => {
  assert.deepEqual(parseYaml("hosts: [a,\n  b]\nport: 80\n"), { hosts: ["a", "b"], port: 80 });
  assert.deepEqual(parseYaml("labels: {app: web}\nport: 80\n"), { labels: { app: "web" }, port: 80 });
  assert.deepEqual(parseYaml("- [a,\n   b]\n- c\n"), [["a", "b"], "c"]);
});

test("a bare `-` item takes the block beneath it; `- x` is a scalar item", () => {
  assert.deepEqual(parseYaml("items:\n  -\n    name: a\n  - b\n"), { items: [{ name: "a" }, "b"] });
});

test("`- - x` is a nested sequence, not the string '- x'", () => {
  assert.deepEqual(parseYaml("m:\n  - - x\n    - y\n  - z\n"), { m: [["x", "y"], "z"] });
});

test("plain scalars resolve the way Helm (sigs.k8s.io/yaml, YAML 1.1) resolves them", () => {
  assert.deepEqual(
    parseYaml("a: yes\nb: Off\nc: TRUE\nd: NULL\ne: 0x1F\nf: 1e3\ng: 0755\nh: 1_000\ni: +3\nj: 08\nk: 1.5.2\nl: '0755'\nm: \"on\"\n"),
    { a: true, b: false, c: true, d: null, e: 31, f: 1000, g: 493, h: 1000, i: 3, j: 8, k: "1.5.2", l: "0755", m: "on" },
  );
});

test("`enabled: yes` against a boolean schema is not a type mismatch", () => {
  const schema = JSON.stringify({ type: "object", properties: { enabled: { type: "boolean" } } });
  assert.deepEqual(checkValues("enabled: yes\n", schema).findings, []);
});
