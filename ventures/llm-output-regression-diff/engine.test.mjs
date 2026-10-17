import test from "node:test";
import assert from "node:assert/strict";
import { parseRecords, similarity, checkCase, diff, verdict, tryJson } from "./engine.mjs";

const rules = (a, b, o) => checkCase(a, b, o).map((f) => f.rule);

test("parseRecords reads JSONL, arrays, alternate output keys, and reports problems", () => {
  const j = parseRecords('{"id":"a","output":"x"}\n\n{"id":"b","response":"y"}\n');
  assert.deepEqual([...j.records], [["a", "x"], ["b", "y"]]);
  assert.equal(parseRecords('[{"id":1,"text":"z"}]').records.get("1"), "z");
  const bad = parseRecords('{"id":"a"}\nnope\n{"output":"q"}\n{"id":"d","output":"1"}\n{"id":"d","output":"2"}');
  assert.equal(bad.errors.length, 4);
  assert.equal(parseRecords("[oops").errors.length, 1);
});

test("identical outputs produce no findings", () => {
  assert.deepEqual(checkCase("Total is 42 dollars.", "Total is 42 dollars."), []);
});

test("empty and refusal are errors", () => {
  assert.deepEqual(rules("hello there", "  "), ["empty"]);
  assert.ok(rules("Here is the summary of the document.", "I'm sorry, but I can't help with that.").includes("new-refusal"));
  assert.ok(!rules("I'm sorry, but that failed.", "I'm sorry, but that failed again.").includes("new-refusal"));
});

test("JSON contract: broken, keys lost, type changed, keys added, fenced JSON tolerated", () => {
  const base = '{"name":"a","count":3}';
  assert.ok(rules(base, "Sure! {\"name\":\"a\",\"count\":3}").includes("json-broken"));
  assert.ok(rules(base, '{"name":"a"}').includes("json-keys-lost"));
  assert.ok(rules(base, '{"name":"a","count":"3"}').includes("json-type-changed"));
  const added = checkCase(base, '{"name":"a","count":3,"extra":1}');
  assert.equal(added[0].rule, "json-keys-added");
  assert.equal(added[0].severity, "warn");
  assert.ok(tryJson('```json\n{"a":1}\n```').ok);
  assert.deepEqual(checkCase(base, '```json\n{"name":"a","count":3}\n```'), []);
});

test("length drift respects the ratio option", () => {
  const a = "word ".repeat(20).trim() + ".";
  const b = "word ".repeat(80).trim() + ".";
  assert.ok(rules(a, b).includes("length-drift"));
  assert.ok(!rules(a, b, { maxLengthRatio: 5 }).includes("length-drift"));
});

test("numbers lost, format lost, truncation, unclosed fence", () => {
  assert.ok(rules("Revenue was 1,200 and cost 340.", "Revenue was high and cost was low.").includes("numbers-lost"));
  assert.ok(!rules("Revenue was 1,200.", "Revenue was 1200.").includes("numbers-lost"));
  assert.ok(rules("- one\n- two\n", "one and two").includes("format-lost"));
  assert.ok(rules("A full sentence here.", "A full sentence that stops mid").includes("possibly-truncated"));
  assert.equal(checkCase("ok.", "```js\nconsole.log(1)").find((f) => f.rule === "unclosed-code-fence").severity, "error");
});

test("similarity is word-set Jaccard", () => {
  assert.equal(similarity("a b c", "a b c"), 1);
  assert.equal(similarity("a b", "c d"), 0);
  assert.equal(similarity("", ""), 1);
});

test("diff flags missing ids, ignores candidate-only ids, and verdict gates", () => {
  const base = '{"id":"1","output":"Answer is 7."}\n{"id":"2","output":"Fine."}\n{"id":"3","output":"Ok."}';
  const cand = '{"id":"1","output":"Answer is 7."}\n{"id":"2","output":""}\n{"id":"9","output":"extra"}';
  const r = diff(base, cand);
  assert.deepEqual(r.extraIds, ["9"]);
  assert.equal(r.summary.errorCases, 2);
  assert.equal(r.summary.clean, 1);
  assert.equal(verdict(r).fail, true);
  assert.equal(verdict(r, { maxRegressions: 2 }).fail, false);
  const warnOnly = diff('{"id":"a","output":"Total 5 items."}', '{"id":"a","output":"Total some items."}');
  assert.equal(verdict(warnOnly).fail, false);
  assert.equal(verdict(warnOnly, { failOn: "warn" }).fail, true);
});
