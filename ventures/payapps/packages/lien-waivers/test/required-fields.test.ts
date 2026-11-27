import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import {
  allForms,
  type FieldSpec,
  noticeForms,
  renderNotice,
  US_STATES,
  validate,
} from "../src/index.ts";

/**
 * Which blanks each waiver and notice form requires is a legal choice: a required blank left
 * empty stops the form from rendering, an optional one prints a rule or drops out. Flipping one
 * `required: true` to `false` changes no wording, so the word-for-word tests pass, and a
 * claimant can send a Texas notice of claim with no amount or contact person on it. The red-team
 * run of 2026-11-27 seeded exactly that in tx-notice.ts and six of eight flips went uncaught.
 *
 * This pins every form's fields, in order, with `?` after an optional one, against
 * test/fixtures/form-fields.json. A deliberate change regenerates it:
 *   UPDATE_FORM_FIELDS=1 node --test test/required-fields.test.ts
 * and the diff of that file is what a reviewer reads.
 */
const SNAPSHOT = new URL("./fixtures/form-fields.json", import.meta.url);

const shape = (fields: readonly FieldSpec[]) =>
  fields.map((f) => `${f.key}${f.required ? "" : "?"}`).join(" ");

function current(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of US_STATES) {
    for (const n of noticeForms(s)) out[`notice ${n.id}`] = shape(n.fields);
    for (const f of allForms(s)) out[`waiver ${f.id}`] = shape(f.fields);
  }
  return out;
}

test("every form's required and optional fields match the reviewed snapshot", () => {
  const now = current();
  if (process.env.UPDATE_FORM_FIELDS === "1") {
    writeFileSync(SNAPSHOT, `${JSON.stringify(now, null, 2)}\n`);
  }
  const pinned = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as Record<string, string>;
  assert.deepEqual(Object.keys(now).sort(), Object.keys(pinned).sort(), "the set of forms");
  for (const [id, fields] of Object.entries(pinned)) {
    assert.equal(
      now[id],
      fields,
      `${id}: fields changed (key? = optional); see this file's header`,
    );
  }
});

test("a notice with nothing filled in names every required field, and only those", () => {
  for (const s of US_STATES) {
    for (const n of noticeForms(s)) {
      const r = renderNotice(n, {});
      assert.ok(!r.ok, n.id);
      const named = new Set(r.errors.map((e) => e.field));
      for (const f of n.fields) {
        assert.equal(named.has(f.key), f.required, `${n.id}: ${f.key}`);
      }
    }
  }
});

test("a waiver with nothing filled in names every required field", () => {
  for (const s of US_STATES) {
    for (const f of allForms(s)) {
      const r = validate(f, {});
      assert.ok(!r.ok, f.id);
      const named = new Set(r.errors.map((e) => e.field));
      for (const spec of f.fields.filter((x) => x.required)) {
        assert.ok(named.has(spec.key), `${f.id}: ${spec.key}`);
      }
    }
  }
});
