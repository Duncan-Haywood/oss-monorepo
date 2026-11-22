// UDF types from the original XER (p6xer.mjs typesFrom, cli.mjs --types-from):
// a P6 file sent through Microsoft Project and back keeps each UDF's P6 type.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer, xerText } from "./xer.mjs";
import { mspdiText } from "./msproject.mjs";
import { p6XerText, p6Problems, udfTyper, udfTitleKey } from "./p6xer.mjs";
import { EXAMPLE_XER } from "./example.mjs";

function withUdfs(types) {
  const x = parseXer(EXAMPLE_XER);
  const T = x.tables;
  T.UDFTYPE = []; T.UDFVALUE = [];
  types.forEach((ty, k) => {
    const id = String(100 + k);
    T.UDFTYPE.push({ udf_type_id: id, table_name: ty.table || "TASK", udf_type_name: `user_${k}`, udf_type_label: ty.label, logical_data_type: ty.type });
    const rows = ty.table === "RSRC" ? T.RSRC.map((r) => r.rsrc_id) : T.TASK.map((t) => t.task_id);
    rows.forEach((fk, i) => { const v = ty.pick(i); if (v !== null && v !== undefined) T.UDFVALUE.push({ udf_type_id: id, fk_id: fk, proj_id: ty.table === "RSRC" ? "" : T.PROJECT[0].proj_id, udf_date: ty.type.includes("DATE") ? v : "", udf_number: /INT|FLOAT|MONEY/.test(ty.type) ? String(v) : "", udf_text: ty.type === "FT_TEXT" ? v : "", udf_code_id: "" }); });
  });
  return x;
}
const typesOf = (text, table) => new Map(parseXer(text).tables.UDFTYPE.filter((u) => u.table_name === table).map((u) => [u.udf_type_label, u.logical_data_type]));

test("decimal UDFs holding whole numbers come back decimal with the original XER, integer without it", () => {
  const x = withUdfs([
    { label: "PERCENT COMPLETE", type: "FT_FLOAT_2_DECIMALS", pick: (i) => (i % 3) * 50 },
    { label: "Crew size", type: "FT_INT", pick: (i) => i + 2 },
    { label: "Optimistic", type: "FT_FLOAT", pick: (i) => 1.5 * (i + 1) },
    { label: "Rate [hr]", type: "FT_FLOAT_2_DECIMALS", pick: () => 40 },
    { label: "Crew rate", type: "FT_FLOAT_2_DECIMALS", table: "RSRC", pick: () => 75 },
  ]);
  const xml = mspdiText(x).xml;
  const plain = p6XerText(xml);
  const before = typesOf(plain.text, "TASK");
  assert.equal(before.get("PERCENT COMPLETE"), "FT_INT");
  assert.equal(before.get("Rate (hr)"), "FT_INT");
  assert.equal(typesOf(plain.text, "RSRC").get("Crew rate"), "FT_INT");
  assert.equal(plain.counts.typesFromXer, undefined);
  for (const from of [x, xerText(x)]) {
    const r = p6XerText(xml, { typesFrom: from });
    const after = typesOf(r.text, "TASK");
    assert.equal(after.get("PERCENT COMPLETE"), "FT_FLOAT_2_DECIMALS");
    assert.equal(after.get("Crew size"), "FT_INT");
    assert.equal(after.get("Optimistic"), "FT_FLOAT");
    assert.equal(after.get("Rate (hr)"), "FT_FLOAT_2_DECIMALS"); // brackets written as round ones still match
    assert.equal(typesOf(r.text, "RSRC").get("Crew rate"), "FT_FLOAT_2_DECIMALS");
    assert.deepEqual(p6Problems(parseXer(r.text).tables), []);
    assert.deepEqual({ ...r.counts.typesFromXer, values: r.counts.typesFromXer.values > 0 }, { fields: 5, changed: 4, values: true, notWhole: 0, unmatched: 0, textFields: 0 });
    assert.ok(r.warnings.some((w) => /types from the original XER: 5 field\(s\) matched by title, 4 given the original's type/.test(w)));
  }
});

test("a finish-date UDF spilled into a Date field comes back a finish date with the original XER", () => {
  const x = withUdfs(Array.from({ length: 11 }, (_, k) => ({ label: `Due ${k + 1}`, type: "FT_END_DATE", pick: (i) => (k === 10 && i > 0 ? null : `2026-06-1${i % 9} 17:00`) })));
  const xml = mspdiText(x).xml;
  assert.equal(typesOf(p6XerText(xml).text, "TASK").get("Due 11"), "FT_START_DATE");
  const t = typesOf(p6XerText(xml, { typesFrom: x }).text, "TASK");
  for (let k = 1; k <= 11; k++) assert.equal(t.get(`Due ${k}`), "FT_END_DATE");
});

test("an integer type is not taken when a value is no longer whole; other kinds and unknown titles keep Project's type", () => {
  const typer = udfTyper({ tables: { UDFTYPE: [
    { table_name: "TASK", udf_type_label: "Crew size", logical_data_type: "FT_INT" },
    { table_name: "TASK", udf_type_label: "Notes", logical_data_type: "FT_TEXT" },
    { table_name: "RSRC", udf_type_label: "Rate", logical_data_type: "FT_FLOAT" },
  ] } });
  assert.equal(typer.type("TASK", "Crew size", "FT_FLOAT_2_DECIMALS", [{ udf_number: "2.5" }]), "FT_FLOAT_2_DECIMALS");
  assert.equal(typer.type("TASK", "crew SIZE ", "FT_FLOAT_2_DECIMALS", [{ udf_number: "3" }]), "FT_INT");
  assert.equal(typer.type("TASK", "Notes", "FT_INT", [{ udf_number: "3" }]), "FT_INT"); // a text UDF's title on a number field
  assert.equal(typer.type("TASK", "Rate", "FT_INT", [{ udf_number: "3" }]), "FT_INT"); // Rate is a resource UDF
  assert.equal(typer.type("RSRC", "Rate", "FT_INT", [{ udf_number: "3" }]), "FT_FLOAT");
  assert.deepEqual([typer.matched, typer.changed, typer.notWhole, typer.unmatched], [3, 2, ["Crew size"], 2]);
  assert.match(typer.note(), /1 kept decimal though integer in the original, as a value is no longer whole: Crew size/);
  assert.equal(udfTitleKey("TASK", " Rate [hr] "), "TASK|rate (hr)");
  assert.equal(udfTyper(null).type("TASK", "x", "FT_INT", []), "FT_INT");
});
