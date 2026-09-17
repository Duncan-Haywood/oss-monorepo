import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { detectFormat, parseOpenApi, diffOperations, hasBreakingChange, summaryLine } from "./diff.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OLD_SPEC = {
  openapi: "3.0.3",
  info: { title: "Pets", version: "1.0.0" },
  paths: {
    "/pets": {
      get: {
        parameters: [{ name: "limit", in: "query", required: false, schema: { type: "integer" } }],
        responses: { 200: { description: "ok" } },
      },
      post: {
        requestBody: { required: false, content: {} },
        responses: { 201: { description: "created" } },
      },
    },
    "/pets/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      get: { responses: { 200: { description: "ok" } } },
      delete: { responses: { 204: { description: "gone" } } },
    },
    "/pets/{id}/status": {
      get: {
        parameters: [{ name: "state", in: "query", required: false, schema: { type: "string", enum: ["active", "sold"] } }],
        responses: { 200: { description: "ok" } },
      },
    },
  },
};

const NEW_SPEC = {
  openapi: "3.0.3",
  info: { title: "Pets", version: "2.0.0" },
  paths: {
    "/pets": {
      get: {
        parameters: [
          { name: "limit", in: "query", required: false, schema: { type: "integer" } },
          { name: "sort", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: { 200: { description: "ok" } },
      },
      post: {
        requestBody: { required: true, content: {} },
        responses: { 201: { description: "created" } },
      },
    },
    "/pets/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
      get: { responses: { 200: { description: "ok" } } },
    },
    "/pets/{id}/status": {
      get: {
        parameters: [{ name: "state", in: "query", required: false, schema: { type: "string", enum: ["active", "sold", "pending"] } }],
        responses: { 200: { description: "ok" } },
      },
    },
    "/pets/{id}/photos": {
      get: { responses: { 200: { description: "ok" } } },
    },
  },
};

const REF_SPEC = {
  openapi: "3.1.0",
  info: { title: "Refs", version: "1.0.0" },
  paths: {
    "/widgets": {
      get: {
        parameters: [{ $ref: "#/components/parameters/PageSize" }],
        responses: { 200: { $ref: "#/components/responses/Ok" } },
      },
    },
  },
  components: {
    parameters: { PageSize: { name: "pageSize", in: "query", required: false, schema: { type: "integer" } } },
    responses: { Ok: { description: "ok" } },
  },
};

test("detectFormat accepts OpenAPI 3.0 and 3.1", () => {
  assert.equal(detectFormat({ openapi: "3.0.3" }).supported, true);
  assert.equal(detectFormat({ openapi: "3.1.0" }).supported, true);
});

test("detectFormat rejects Swagger 2.0 by name", () => {
  const result = detectFormat({ swagger: "2.0" });
  assert.equal(result.supported, false);
  assert.match(result.reason, /Swagger 2\.0/);
});

test("detectFormat rejects a missing version field and an unknown one", () => {
  assert.match(detectFormat({ paths: {} }).reason, /no "openapi" field/);
  assert.match(detectFormat({ openapi: "4.0.0" }).reason, /unrecognized/);
});

test("parseOpenApi throws a labelled error on invalid JSON", () => {
  assert.throws(() => parseOpenApi("{not json", "broken.json"), /broken\.json: not valid JSON/);
});

test("parseOpenApi throws a labelled error on an unsupported document", () => {
  assert.throws(
    () => parseOpenApi(JSON.stringify({ swagger: "2.0", paths: {} }), "old.json"),
    /old\.json: Swagger 2\.0/,
  );
});

test("parseOpenApi merges path-level and operation-level parameters", () => {
  const { operations } = parseOpenApi(JSON.stringify(OLD_SPEC));
  assert.ok(operations.has("GET /pets"));
  assert.ok(operations.has("DELETE /pets/{id}"));
  assert.ok(operations.get("GET /pets/{id}").parameters.has("path:id"));
});

test("parseOpenApi resolves local $refs for parameters", () => {
  const { operations } = parseOpenApi(JSON.stringify(REF_SPEC));
  const param = operations.get("GET /widgets").parameters.get("query:pageSize");
  assert.deepEqual(param, { name: "pageSize", in: "query", required: false, type: "integer", enum: null });
});

function diffFixtures() {
  const { operations: oldOps } = parseOpenApi(JSON.stringify(OLD_SPEC));
  const { operations: newOps } = parseOpenApi(JSON.stringify(NEW_SPEC));
  return diffOperations(oldOps, newOps);
}

test("removed operation is breaking", () => {
  const diff = diffFixtures();
  assert.ok(diff.breaking.some((c) => c.operation === "DELETE /pets/{id}" && c.type === "removed-operation"));
});

test("added operation is non-breaking", () => {
  const diff = diffFixtures();
  assert.ok(diff.nonBreaking.some((c) => c.operation === "GET /pets/{id}/photos" && c.type === "added-operation"));
});

test("new required parameter is breaking", () => {
  const diff = diffFixtures();
  const match = diff.breaking.filter((c) => c.type === "new-required-param" && c.operation === "GET /pets");
  assert.equal(match.length, 1);
  assert.equal(match[0].parameter, "query:sort");
});

test("parameter type change is breaking", () => {
  const diff = diffFixtures();
  const match = diff.breaking.filter((c) => c.type === "param-type-changed");
  assert.equal(match.length, 1);
  assert.equal(match[0].from, "string");
  assert.equal(match[0].to, "integer");
});

test("added enum value is non-breaking", () => {
  const diff = diffFixtures();
  const match = diff.nonBreaking.filter((c) => c.type === "added-enum-value");
  assert.equal(match.length, 1);
  assert.deepEqual(match[0].values, ["pending"]);
});

test("a removed enum value is reported as breaking", () => {
  const oldOps = new Map([["GET /x", { parameters: new Map([["query:s", { name: "s", in: "query", required: false, type: "string", enum: ["a", "b"] }]]), requestBodyRequired: null }]]);
  const newOps = new Map([["GET /x", { parameters: new Map([["query:s", { name: "s", in: "query", required: false, type: "string", enum: ["a"] }]]), requestBodyRequired: null }]]);
  const diff = diffOperations(oldOps, newOps);
  assert.equal(diff.breaking.length, 1);
  assert.equal(diff.breaking[0].type, "removed-enum-value");
  assert.deepEqual(diff.breaking[0].values, ["b"]);
});

// Regression: a parameter with no enum at all previously accepted any value
// of its type. Restricting it to a short list is at least as breaking as
// removing one value from an existing enum, and was previously invisible
// entirely -- neither breaking nor non-breaking -- because the old check
// required both sides to already carry an enum.
test("a parameter newly restricted to an enum is reported as breaking", () => {
  const oldOps = new Map([["GET /x", { parameters: new Map([["query:s", { name: "s", in: "query", required: false, type: "string", enum: null }]]), requestBodyRequired: null }]]);
  const newOps = new Map([["GET /x", { parameters: new Map([["query:s", { name: "s", in: "query", required: false, type: "string", enum: ["a", "b"] }]]), requestBodyRequired: null }]]);
  const diff = diffOperations(oldOps, newOps);
  assert.equal(diff.breaking.length, 1);
  assert.equal(diff.breaking[0].type, "enum-added");
  assert.deepEqual(diff.breaking[0].values, ["a", "b"]);
  assert.equal(diff.nonBreaking.length, 0);
});

test("an enum constraint removed entirely is non-breaking", () => {
  const oldOps = new Map([["GET /x", { parameters: new Map([["query:s", { name: "s", in: "query", required: false, type: "string", enum: ["a", "b"] }]]), requestBodyRequired: null }]]);
  const newOps = new Map([["GET /x", { parameters: new Map([["query:s", { name: "s", in: "query", required: false, type: "string", enum: null }]]), requestBodyRequired: null }]]);
  const diff = diffOperations(oldOps, newOps);
  assert.equal(diff.breaking.length, 0);
  assert.equal(diff.nonBreaking.length, 1);
  assert.equal(diff.nonBreaking[0].type, "enum-removed");
  assert.deepEqual(diff.nonBreaking[0].values, ["a", "b"]);
});

test("request body becoming required is breaking", () => {
  const diff = diffFixtures();
  const match = diff.breaking.filter((c) => c.type === "request-body-now-required");
  assert.equal(match.length, 1);
  assert.equal(match[0].operation, "POST /pets");
});

test("hasBreakingChange and summaryLine reflect the fixtures", () => {
  const diff = diffFixtures();
  assert.equal(hasBreakingChange(diff), true);
  assert.match(summaryLine(diff), /breaking change\(s\) found/);
});

test("identical documents produce no changes", () => {
  const { operations } = parseOpenApi(JSON.stringify(OLD_SPEC));
  const diff = diffOperations(operations, operations);
  assert.equal(hasBreakingChange(diff), false);
  assert.deepEqual(diff, { breaking: [], nonBreaking: [] });
  assert.match(summaryLine(diff), /No differences found/);
});

test("parity: the browser port agrees with openapi_diff.py on the same input", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "openapi-diff-parity-"));
  const oldPath = path.join(dir, "old.json");
  const newPath = path.join(dir, "new.json");
  writeFileSync(oldPath, JSON.stringify(OLD_SPEC));
  writeFileSync(newPath, JSON.stringify(NEW_SPEC));

  const cliOutput = execFileSync("python3", [path.join(__dirname, "openapi_diff.py"), oldPath, newPath, "--format", "json"], {
    encoding: "utf8",
  });
  const cliDiff = JSON.parse(cliOutput);
  const jsDiff = diffFixtures();

  const normalize = (list) => list.map((c) => JSON.stringify(c)).sort();
  assert.deepEqual(normalize(jsDiff.breaking), normalize(cliDiff.breaking));
  assert.deepEqual(
    normalize(jsDiff.nonBreaking),
    normalize(cliDiff.non_breaking),
  );
});
