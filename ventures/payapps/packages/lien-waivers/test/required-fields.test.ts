import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import * as lib from "../src/index.ts";
import {
  allForms,
  type FieldSpec,
  type NoticeForm,
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
 *
 * Forms that no state's list returns (the federal Miller Act notice, Georgia's and Mississippi's
 * affidavits of nonpayment) are found by calling every zero-argument export of the package and
 * keeping what comes back shaped like a notice. The red-team run of 2026-11-28 flipped five of
 * the Miller notice's required blanks and none was caught, because only state lists were pinned.
 */
const SNAPSHOT = new URL("./fixtures/form-fields.json", import.meta.url);

const shape = (fields: readonly FieldSpec[]) =>
  fields.map((f) => `${f.key}${f.required ? "" : "?"}`).join(" ");

const isNotice = (x: unknown): x is NoticeForm =>
  typeof x === "object" &&
  x !== null &&
  typeof (x as NoticeForm).id === "string" &&
  Array.isArray((x as NoticeForm).fields) &&
  Array.isArray((x as NoticeForm).body);

/** Every notice the package encodes: each state's list plus the standalone factories. */
function allNotices(): NoticeForm[] {
  const byId = new Map<string, NoticeForm>();
  for (const s of US_STATES) for (const n of noticeForms(s)) byId.set(n.id, n);
  for (const v of Object.values(lib)) {
    if (typeof v !== "function" || v.length !== 0) continue;
    let made: unknown;
    try {
      made = (v as () => unknown)();
    } catch {
      continue;
    }
    for (const x of Array.isArray(made) ? made : [made]) {
      if (isNotice(x) && !byId.has(x.id)) byId.set(x.id, x);
    }
  }
  return [...byId.values()];
}

function current(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of US_STATES) {
    for (const n of noticeForms(s)) out[`notice ${n.id}`] = shape(n.fields);
    for (const f of allForms(s)) out[`waiver ${f.id}`] = shape(f.fields);
  }
  for (const n of allNotices()) out[`notice ${n.id}`] ??= shape(n.fields);
  return out;
}

test("the standalone notices are in the pinned set", () => {
  const ids = allNotices().map((n) => n.id);
  for (const id of [
    "US/miller-act/notice-of-claim",
    "GA/affidavit-of-nonpayment/statutory",
    "MS/affidavit-of-nonpayment/statutory",
  ]) {
    assert.ok(ids.includes(id), id);
  }
});

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
  for (const n of allNotices()) {
    const r = renderNotice(n, {});
    assert.ok(!r.ok, n.id);
    const named = new Set(r.errors.map((e) => e.field));
    for (const f of n.fields) {
      assert.equal(named.has(f.key), f.required, `${n.id}: ${f.key}`);
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
