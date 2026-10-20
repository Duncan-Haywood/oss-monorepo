import { test } from "node:test";
import assert from "node:assert/strict";
import { hash, bucket, evaluate, evaluateAll, validateConfig, simulate, impact, matchCondition } from "./engine.mjs";

const on = { variant: "on" }, off = { variant: "off" };
const cfg = (flag, extra = {}) => ({ salt: "s", flags: { f: { key: "f", enabled: true, fallthrough: off, ...flag } }, segments: {}, ...extra });

test("hash is pinned: changing it would reshuffle every customer's rollout", () => {
  // Frozen vectors. If these fail the hash changed, and so did who sees every partial rollout.
  assert.deepEqual([hash(""), hash("a"), hash("user-1"), hash("h\u00e9llo")], [2872998923, 444641715, 2005895916, 1472820488]);
  assert.equal(bucket("s", "f", "user-1"), 1843);
  for (const s of ["x", "user-42", ""]) assert.ok(bucket("s", "f", s) >= 0 && bucket("s", "f", s) < 10000);
});

test("a disabled flag serves the off variant; an enabled one falls through", () => {
  assert.deepEqual(evaluate(cfg({ enabled: false, fallthrough: on }), "f", { key: "u" }), { flag: "f", variant: "off", value: false, reason: "off" });
  assert.deepEqual(evaluate(cfg({ fallthrough: on }), "f", { key: "u" }), { flag: "f", variant: "on", value: true, reason: "fallthrough" });
  assert.equal(evaluate(cfg({}), "nope").reason, "not_found");
});

test("individual targets beat rules, rules run in order, first match wins", () => {
  const c = cfg({
    targets: { on: ["vip"] },
    rules: [
      { id: "blocked", if: [{ attr: "country", op: "eq", value: "XX" }], serve: off },
      { id: "pro", if: [{ attr: "plan", op: "in", value: ["pro", "team"] }, { attr: "country", op: "neq", value: "XX" }], serve: on },
    ],
  });
  assert.equal(evaluate(c, "f", { key: "vip", country: "XX" }).reason, "target");
  assert.deepEqual(evaluate(c, "f", { key: "a", country: "XX", plan: "pro" }), { flag: "f", variant: "off", value: false, reason: "rule", ruleId: "blocked" });
  assert.equal(evaluate(c, "f", { key: "a", country: "US", plan: "pro" }).ruleId, "pro");
  assert.equal(evaluate(c, "f", { key: "a", country: "US", plan: "free" }).reason, "fallthrough");
});

test("operators: lists, numbers, semver with prerelease, dates, nested attributes, missing values", () => {
  const m = (c, ctx) => matchCondition(c, ctx, { segments: {} });
  assert.ok(m({ attr: "tags", op: "eq", value: "beta" }, { tags: ["alpha", "beta"] }));
  assert.ok(m({ attr: "age", op: "gte", value: 18 }, { age: "21" }));
  assert.ok(!m({ attr: "age", op: "gt", value: 18 }, { age: "abc" }));
  assert.ok(m({ attr: "app", op: "semverGte", value: "2.10.0" }, { app: "v2.10.1" }));
  assert.ok(!m({ attr: "app", op: "semverGte", value: "2.10.0" }, { app: "2.9.9" })); // 2.9 < 2.10, not a string compare
  assert.ok(m({ attr: "app", op: "semverLt", value: "2.0.0" }, { app: "2.0.0-rc.1" })); // prerelease sorts below release
  assert.ok(m({ attr: "org.tier", op: "eq", value: "gold" }, { org: { tier: "gold" } }));
  assert.ok(m({ attr: "signup", op: "before", value: "2026-01-01" }, { signup: "2025-12-31T23:00:00Z" }));
  assert.ok(m({ attr: "email", op: "endsWith", value: "@acme.com" }, { email: "a@acme.com" }));
  assert.ok(!m({ attr: "x", op: "eq", value: "1" }, {}));
  assert.ok(m({ attr: "x", op: "neq", value: "1" }, {})); // absent is "not equal"
  assert.ok(m({ attr: "x", op: "notExists" }, { x: null }));
  assert.ok(!m({ attr: "x", op: "mystery", value: 1 }, { x: 1 }));
});

test("segments: include and exclude lists beat conditions, unknown and cyclic segments match nobody", () => {
  const c = cfg({ rules: [{ id: "s", if: [{ op: "inSegment", value: "beta" }], serve: on }] }, {
    segments: { beta: { include: ["alice"], exclude: ["mallory"], conditions: [{ attr: "email", op: "endsWith", value: "@acme.com" }] }, loop: { conditions: [{ op: "inSegment", value: "loop" }] } },
  });
  assert.equal(evaluate(c, "f", { key: "alice" }).variant, "on");
  assert.equal(evaluate(c, "f", { key: "bob", email: "bob@acme.com" }).variant, "on");
  assert.equal(evaluate(c, "f", { key: "mallory", email: "m@acme.com" }).variant, "off");
  assert.equal(evaluate(c, "f", { key: "bob", email: "bob@other.com" }).variant, "off");
  const c2 = cfg({ rules: [{ id: "s", if: [{ op: "inSegment", value: ["loop", "ghost"] }], serve: on }] }, { segments: c.segments });
  assert.equal(evaluate(c2, "f", { key: "x" }).variant, "off");
});

test("percentage rollout is sticky and widening it never takes the feature away from anyone", () => {
  const at = (pct) => cfg({ fallthrough: { rollout: [{ variant: "on", weight: pct }, { variant: "off", weight: 100 - pct }] } });
  const users = Array.from({ length: 5000 }, (_, i) => ({ key: `u${i}` }));
  const set = (pct) => new Set(users.filter((u) => evaluate(at(pct), "f", u).variant === "on").map((u) => u.key));
  const s10 = set(10), s30 = set(30), s100 = set(100);
  assert.deepEqual([...set(10)], [...s10]); // same answer twice
  for (const k of s10) assert.ok(s30.has(k), `${k} lost the feature when 10% became 30%`);
  assert.equal(s100.size, 5000);
  assert.equal(set(0).size, 0);
  assert.ok(Math.abs(s10.size / 5000 - 0.1) < 0.02, `10% rollout hit ${s10.size / 5000}`);
  assert.ok(Math.abs(s30.size / 5000 - 0.3) < 0.03);
});

test("different flags bucket the same user independently; a different salt reshuffles", () => {
  const roll = { rollout: [{ variant: "on", weight: 50 }, { variant: "off", weight: 50 }] };
  const c = { salt: "s", flags: { a: { key: "a", enabled: true, fallthrough: roll }, b: { key: "b", enabled: true, fallthrough: roll } } };
  let both = 0, a = 0;
  for (let i = 0; i < 4000; i++) { const x = evaluate(c, "a", { key: `u${i}` }).variant === "on", y = evaluate(c, "b", { key: `u${i}` }).variant === "on"; if (x) a++; if (x && y) both++; }
  assert.ok(Math.abs(both / a - 0.5) < 0.05, `flags look correlated: ${both}/${a}`);
  const c2 = { ...c, salt: "other" }; let diff = 0;
  for (let i = 0; i < 1000; i++) if (evaluate(c, "a", { key: `u${i}` }).variant !== evaluate(c2, "a", { key: `u${i}` }).variant) diff++;
  assert.ok(diff > 300);
});

test("multivariate rollout and bucketBy another attribute (everyone in an org gets the same answer)", () => {
  const c = cfg({ variants: { control: "a", blue: "b", green: "c", off: null }, fallthrough: { bucketBy: "org", rollout: [{ variant: "control", weight: 34 }, { variant: "blue", weight: 33 }, { variant: "green", weight: 33 }] } });
  const seen = new Set();
  for (let i = 0; i < 300; i++) seen.add(evaluate(c, "f", { key: `u${i}`, org: `o${i % 3}` }).variant);
  assert.ok(seen.size >= 1 && [...seen].every((v) => ["control", "blue", "green"].includes(v)));
  for (const org of ["o1", "o2"]) assert.equal(new Set(Array.from({ length: 20 }, (_, i) => evaluate(c, "f", { key: `m${i}`, org }).variant)).size, 1);
  const sim = simulate(c, "f", { users: 3000 }); // org absent: cannot bucket
  assert.equal(sim.byReason.error, 3000);
  assert.equal(evaluate(c, "f", { key: "x" }).variant, "off");
  const c3 = cfg({ variants: { a: 1, b: 2, off: 0 }, fallthrough: { rollout: [{ variant: "a", weight: 25 }, { variant: "b", weight: 75 }] } });
  const s = simulate(c3, "f", { users: 8000 });
  assert.ok(Math.abs(s.byVariant.a / 8000 - 0.25) < 0.03 && s.byVariant.a + s.byVariant.b === 8000);
});

test("prerequisites: a flag is off unless the flag it depends on serves the required variant; cycles are safe", () => {
  const c = { flags: {
    base: { key: "base", enabled: true, fallthrough: { variant: "off" }, targets: { on: ["u1"] } },
    child: { key: "child", enabled: true, prerequisites: [{ flag: "base", variant: "on" }], fallthrough: on },
    a: { key: "a", enabled: true, prerequisites: [{ flag: "b", variant: "on" }], fallthrough: on },
    b: { key: "b", enabled: true, prerequisites: [{ flag: "a", variant: "on" }], fallthrough: on },
  } };
  assert.equal(evaluate(c, "child", { key: "u1" }).variant, "on");
  assert.deepEqual(evaluate(c, "child", { key: "u2" }), { flag: "child", variant: "off", value: false, reason: "prerequisite_failed", prerequisite: "base" });
  assert.equal(evaluate(c, "a", { key: "u1" }).variant, "off"); // does not recurse forever
  assert.ok(validateConfig(c).some((e) => /cycle/.test(e)));
});

test("evaluateAll returns every flag for one user", () => {
  const out = evaluateAll({ flags: { x: { key: "x", enabled: true, fallthrough: on }, y: { key: "y", enabled: false, fallthrough: on } } }, { key: "u" });
  assert.deepEqual(out, { x: { variant: "on", value: true, reason: "fallthrough" }, y: { variant: "off", value: false, reason: "off" } });
});

test("validateConfig names the mistake in words and accepts a good config", () => {
  assert.deepEqual(validateConfig(cfg({ rules: [{ id: "r", if: [{ attr: "plan", op: "in", value: ["pro"] }], serve: on }] })), []);
  const bad = validateConfig(cfg({
    enabled: "yes",
    fallthrough: { rollout: [{ variant: "on", weight: 60 }, { variant: "off", weight: 30 }] },
    rules: [{ id: "r", if: [{ attr: "plan", op: "contains" }, { attr: "p", op: "in", value: "pro" }, { attr: "z", op: "like", value: 1 }, { op: "inSegment", value: "ghost" }], serve: { variant: "maybe" } }, { id: "r", serve: on }],
    targets: { nope: ["a"] },
    prerequisites: [{ flag: "ghost", variant: "on" }],
  }));
  for (const re of [/enabled must be true or false/, /sum to 90, not 100/, /contains needs a value/, /in needs a list value/, /unknown op "like"/, /segment "ghost" does not exist/, /variant "maybe" is not defined/, /duplicate rule id/, /target variant "nope"/, /prerequisite flag "ghost"/]) assert.ok(bad.some((e) => re.test(e)), String(re));
  assert.ok(validateConfig({ flags: { "bad key!": { enabled: true, fallthrough: on } } }).some((e) => /key must be/.test(e)));
  assert.ok(validateConfig(null).length);
});

test("impact lists exactly who flips when a rollout changes", () => {
  const at = (pct) => cfg({ fallthrough: { rollout: [{ variant: "on", weight: pct }, { variant: "off", weight: 100 - pct }] } });
  const r = impact(at(10), at(25), "f", { users: 4000 });
  assert.deepEqual(Object.keys(r.moves), ["off -> on"]); // widening only turns people on
  assert.equal(r.changed, r.moves["off -> on"]);
  assert.ok(Math.abs(r.changed / 4000 - 0.15) < 0.03);
  const back = impact(at(25), at(10), "f", { users: 4000 });
  assert.deepEqual(Object.keys(back.moves), ["on -> off"]);
  assert.equal(impact(at(10), at(10), "f", { users: 500 }).changed, 0);
});
