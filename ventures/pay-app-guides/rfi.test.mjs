import { test } from "node:test";
import assert from "node:assert/strict";
import { rfiNumber, questionCount, checkRfi, emailSubject, rfiText, EXAMPLE, IMPACTS } from "./rfi.mjs";

const fields = (w) => w.map((x) => x.field);

test("numbers pad to RFI-004 and keep a GC's own scheme", () => {
  assert.equal(rfiNumber("4"), "RFI-004");
  assert.equal(rfiNumber(" 112 "), "RFI-112");
  assert.equal(rfiNumber("E-12"), "E-12");
  assert.equal(rfiNumber(""), "");
});

test("question count: question marks and numbered items, at least one", () => {
  assert.equal(questionCount(""), 0);
  assert.equal(questionCount("Which height applies."), 1);
  assert.equal(questionCount("Which height? And which fixture?"), 2);
  assert.equal(questionCount("Please confirm:\n1. the height\n2. the fixture"), 2);
});

test("the example passes every check", () => {
  assert.deepEqual(checkRfi(EXAMPLE), []);
});

test("an empty RFI names each missing part", () => {
  const f = fields(checkRfi({}));
  for (const k of ["question", "subject", "drawings", "proposal", "impact", "due", "to"]) assert.ok(f.includes(k), k);
});

test("two questions in one RFI are flagged", () => {
  const w = checkRfi({ ...EXAMPLE, question: EXAMPLE.question + " Also, who supplies the B2 fixtures?" });
  assert.ok(w.some((x) => /More than one question/.test(x.text)));
});

test("answer dates: before sent is an error; under 3 days needs a reason", () => {
  assert.ok(checkRfi({ ...EXAMPLE, due: "2026-03-01" }).some((x) => /before the date sent/.test(x.text)));
  assert.ok(checkRfi({ ...EXAMPLE, due: "2026-03-03", reason: "" }).some((x) => /Answer needed in 1 day\./.test(x.text)));
  assert.deepEqual(checkRfi({ ...EXAMPLE, due: "2026-03-03" }), []);
});

test("drawing or spec reference: either one is enough", () => {
  assert.deepEqual(checkRfi({ ...EXAMPLE, drawings: "" }), []);
  assert.ok(fields(checkRfi({ ...EXAMPLE, drawings: "", spec: "" })).includes("drawings"));
});

test("text carries every field, a response block, and the no-authorization line only when impact is possible or yes", () => {
  const t = rfiText(EXAMPLE);
  assert.match(t, /^REQUEST FOR INFORMATION RFI-004\n/);
  for (const v of [EXAMPLE.project, EXAMPLE.to, EXAMPLE.subject, EXAMPLE.drawings, EXAMPLE.spec, EXAMPLE.proposal, EXAMPLE.attachments]) assert.ok(t.includes(v), v);
  assert.match(t, /Answer needed by: 2026-03-09 \(rough-in for corridor 104 starts 2026-03-11\)/);
  assert.match(t, new RegExp(`Cost or time impact: ${IMPACTS.possible.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(t, /does not authorize extra work/);
  assert.match(t, /RESPONSE \(by the GC or design team\)/);
  assert.doesNotMatch(rfiText({ ...EXAMPLE, impact: "none" }), /does not authorize/);
});

test("blank fields leave no empty labels", () => {
  const t = rfiText({ number: "1", question: "What is the finish at the lobby wall?" });
  assert.doesNotMatch(t, /Project:|Spec section:|PROPOSED ANSWER|Cost or time impact/);
});

test("email subject: project | number | subject, skipping blanks", () => {
  assert.equal(emailSubject(EXAMPLE), "Riverside Clinic TI | RFI-004 | Ceiling height conflict at corridor 104");
  assert.equal(emailSubject({ subject: "Door hardware" }), "Door hardware");
});

test("an inherited key is not an impact", () => {
  assert.ok(fields(checkRfi({ ...EXAMPLE, impact: "constructor" })).includes("impact"));
  assert.doesNotMatch(rfiText({ ...EXAMPLE, impact: "toString" }), /Cost or time impact/);
});
