// Layer 6: a first-time payee gets a weak, reviewable guess from what kind of name it is
// and how big the line is, read against the first line of every other payee filed.
import test from "node:test";
import assert from "node:assert/strict";
import { payeeShape, trainNewPayee, guessNewPayee, suggest, buildMemory, trainClassifier, historyRecord, NEW_PAYEE } from "./categorize.mjs";
import { aiSuggest } from "./ai.mjs";

test("payee shapes: people, businesses, the rest", () => {
  assert.equal(payeeShape("Jane Q. Doe"), "person");
  assert.equal(payeeShape("Zelle payment to Maria Garcia Conf# a1b2c3"), "person");
  assert.equal(payeeShape("VENMO JOSÉ ÁLVAREZ"), "person");
  assert.equal(payeeShape("Acme Hosting LLC"), "business");
  assert.equal(payeeShape("example.io"), "business");
  assert.equal(payeeShape("Northwind Consulting"), "business");
  assert.equal(payeeShape("POS 0412 BLUE BOTTLE #22"), "other");
  assert.equal(payeeShape("Madonna"), "other");
  assert.equal(payeeShape(""), "other");
});

const file = (desc, cents, account) => historyRecord({ desc, cents }, account);
// Ten contractors (people, mid-size) to 6020, six businesses to 6060, then repeats of one payee.
const people = ["Ana Lima", "Ben Ode", "Cy Park", "Dee Ross", "Eli Moss", "Fay Quinn", "Gus Hart", "Hal Ivy", "Ida Fox", "Jo West"];
const firms = ["Alpha Hosting LLC", "Beta Software Inc", "Gamma Cloud Ltd", "Delta Labs", "Eps Systems", "Zeta Tech"];
const history = [
  ...people.map((p) => file(p, -120000, "6020")),
  ...firms.map((p) => file(p, -2900, "6060")),
  // One person filed again and again elsewhere: only a payee's first line counts.
  ...Array.from({ length: 20 }, () => file("Ana Lima", -120000, "6120")),
];

test("only each payee's first line is counted, by shape and size", () => {
  const np = trainNewPayee(history);
  assert.equal(np.payees, 16);
  assert.equal(np.tables.get("out|person|l").get("6020"), 10);
  assert.equal(np.tables.get("out|person|l").get("6120"), undefined);
  const g = guessNewPayee(np, { desc: "Kim Lowe", cents: -90000 });
  assert.deepEqual([g.account, g.n, g.of, g.level], ["6020", 10, 10, "shape and size"]);
});

test("too few payees or a split view says nothing", () => {
  const np = trainNewPayee(history);
  // Six businesses is under the eight-payee floor; the size-only view is all 6060 but only six too,
  // so it backs off to direction: 10 of 16 to 6020, which is 62% and offered.
  const g = guessNewPayee(np, { desc: "Omega Hosting LLC", cents: -3000 });
  assert.equal(g.level, "direction");
  // With the optional record gate on (minRecord 0.4), that direction view is withheld: filed in this order, it guessed
  // 6020 for the last eight payees and six of them (the businesses) went to 6060.
  assert.deepEqual(np.record.get("out"), { tries: 8, hits: 2 });
  assert.equal(guessNewPayee(np, { desc: "Omega Hosting LLC", cents: -3000 }, null, gate), null);
  const split = trainNewPayee([...people.slice(0, 5).map((p) => file(p, -50000, "6020")), ...people.slice(5).map((p) => file(p, -50000, "6050")), file("Xia Yun", -50000, "6130"), file("Quin Roe", -50000, "6170")]);
  // 5/5/1/1 of twelve: the top share is 42%, offered. 5/5/4 of fourteen is 36%, under the 40% floor: withheld.
  assert.equal(guessNewPayee(split, { desc: "New Person", cents: -50000 }).account, "6020");
  const split2 = trainNewPayee([...people.slice(0, 5).map((p) => file(p, -50000, "6020")), ...people.slice(5).map((p) => file(p, -50000, "6050")), ...["Kai Rye", "Lu Chen", "Mo Diaz", "Ned Holt"].map((p) => file(p, -50000, "6130"))]);
  assert.equal(guessNewPayee(split2, { desc: "New Person", cents: -50000 }), null);
});

test("suggest offers it only for a payee never filed, never above 0.5, and the switch turns it off", () => {
  const model = { rules: [], memory: buildMemory(history), classifier: trainClassifier(history), newPayee: trainNewPayee(history), codes: null };
  const s = suggest({ desc: "Kim Lowe", cents: -90000 }, model);
  assert.equal(s.source, "new-payee");
  assert.equal(s.account, "6020");
  assert.ok(s.confidence <= 0.5);
  assert.match(s.reason, /10 of the 10 named people you filed at this size went here first/);
  assert.equal(suggest({ desc: "Ana Lima", cents: -90000 }, model).source, "memory");
  assert.equal(suggest({ desc: "Kim Lowe", cents: -90000 }, { ...model, skip: new Set(["new-payee"]) }).source, "none");
  // Books with no new-payee table (older callers) behave as before.
  assert.equal(suggest({ desc: "Kim Lowe", cents: -90000 }, { ...model, newPayee: undefined }).source, "none");
});

// Since 2026-11-11 plain "fill" keeps the guess (a local 7B model over it did worse than
// the guess on real Toronto card lines, README); "fill-guess" still sends the line.
test("the AI layer in fill-guess mode still takes a line that only has a new-payee guess; fill keeps it", async () => {
  const books = { accounts: [{ code: "6020", name: "Contractors", type: "expense" }, { code: "6050", name: "Professional fees", type: "expense" }],
    transactions: [{ id: "t1", date: "2026-01-02", desc: "Kim Lowe", cents: -90000, status: "review", suggestion: { account: "6020", confidence: 0.5, source: "new-payee", reason: "x", alternatives: [] } }] };
  let asked = 0;
  const fetch = async (_u, init) => { asked++; const ids = [...String(JSON.parse(init.body).messages?.at(-1)?.content ?? init.body).matchAll(/"id"\s*:\s*"(t\d+)"/g)].map((m) => m[1]);
    return { ok: true, status: 200, json: async () => ({ message: { content: JSON.stringify({ lines: ids.map((id) => ({ id, account: "6050", confidence: 0.7, reason: "r" })) }) }, choices: [{ message: { content: JSON.stringify({ lines: ids.map((id) => ({ id, account: "6050", confidence: 0.7, reason: "r" })) }) } }], content: [{ type: "text", text: JSON.stringify({ lines: ids.map((id) => ({ id, account: "6050", confidence: 0.7, reason: "r" })) }) }] }), text: async () => "" }; };
  const r = await aiSuggest({ provider: "ollama", model: "m", baseUrl: "http://localhost:11434" }, books, { fetch, mode: "fill-guess" });
  assert.equal(asked, 1);
  assert.notEqual(r.error, "every review line already has a suggestion from the rules, memory, classifier or new-payee guess");
  const kept = await aiSuggest({ provider: "ollama", model: "m", baseUrl: "http://localhost:11434" }, books, { fetch });
  assert.equal(asked, 1, "plain fill sends nothing");
  assert.equal(kept.source, "fallback");
});

const gate = { ...NEW_PAYEE, minRecord: 0.4 };
test("with the gate on, a view that agrees but has not predicted new payees in these books says nothing", () => {
  // Eight people to 6020, then eight to 6050: the view ends 8/8 (50%, above the share floor),
  // but each of the last eight was guessed 6020 when it arrived, and each went to 6050.
  const names = [...people, "Kai Rye", "Lu Chen", "Mo Diaz", "Ned Holt", "Oz Park", "Pia Vos"];
  const drift = names.map((p, i) => file(p, -120000, i < 8 ? "6020" : "6050"));
  const np = trainNewPayee(drift);
  assert.deepEqual(np.record.get("out|person|l"), { tries: 8, hits: 0 });
  assert.equal(guessNewPayee(np, { desc: "Quin Roe", cents: -120000 }, null, gate), null);
  // By default the gate is off: the guess is offered, its confidence capped by the 0-of-8 record.
  assert.equal(guessNewPayee(np, { desc: "Quin Roe", cents: -120000 }).account, "6020");
  const model = { rules: [], memory: buildMemory(drift), classifier: trainClassifier(drift), newPayee: np, codes: null };
  const s = suggest({ desc: "Quin Roe", cents: -120000 }, model);
  assert.equal(s.confidence, 0);
  assert.match(s.reason, /right for 0 of 8 earlier new payees/);
});

test("a view with a good record offers its guess and says how it did", () => {
  const steady = [...people, "Kai Rye", "Lu Chen", "Mo Diaz", "Ned Holt", "Oz Park", "Pia Vos"].map((p, i) => file(p, -120000, i % 8 === 7 ? "6050" : "6020"));
  const np = trainNewPayee(steady);
  const rec = np.record.get("out|person|l");
  assert.deepEqual(rec, { tries: 8, hits: 7 });
  const model = { rules: [], memory: buildMemory(steady), classifier: trainClassifier(steady), newPayee: np, codes: null };
  const s = suggest({ desc: "Quin Roe", cents: -120000 }, model);
  assert.equal(s.account, "6020");
  assert.match(s.reason, /right for 7 of 8 earlier new payees/);
  assert.ok(s.confidence <= 0.5);
});
