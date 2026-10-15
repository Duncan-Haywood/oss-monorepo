import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuestions, parseLibrary, parseCsv, fill, match, buildIndex, tierOf, categorize, answerKind, toCsv, toMarkdown, libraryToCsv, learn, tokens } from "./matcher.mjs";
import { SAMPLE_LIBRARY, SAMPLE_QUESTIONS } from "./sample.mjs";

const run = () => fill(parseQuestions(SAMPLE_QUESTIONS), parseLibrary(SAMPLE_LIBRARY));
const row = (r, id) => r.rows.find((x) => x.id === id);

test("spellings of one control fold together", () => {
  assert.deepEqual(tokens("two-factor authentication"), tokens("MFA authentication"));
  assert.ok(tokens("Pen test").includes("pentest") && tokens("penetration tests").includes("pentest"));
});

test("parseCsv handles quotes, commas and newlines inside cells", () => {
  const rows = parseCsv('a,b\n"x, y","line1\nline2"\n"he said ""hi""",z\n');
  assert.deepEqual(rows, [["a", "b"], ["x, y", "line1\nline2"], ['he said "hi"', "z"]]);
});

test("questions: numbered lines lose the prefix and keep the id", () => {
  const q = parseQuestions("1.1 Do you encrypt backups?\nQ12: Is there an incident response plan?\nshort");
  assert.deepEqual(q.map((x) => x.id), ["1.1", "12"]);
  assert.equal(q[0].question, "Do you encrypt backups?");
});

test("questions: a CSV with a Question column is read by header", () => {
  const q = parseQuestions("Ref,Question,Response\nA-1,Do you use MFA for admins?,\nA-2,Is data encrypted at rest?,\n");
  assert.deepEqual(q.map((x) => x.id), ["A-1", "A-2"]);
});

test("library: header optional, empty answers dropped", () => {
  assert.equal(parseLibrary("Do you use MFA?,Yes\nDo you encrypt?,\n").length, 1);
  assert.equal(parseLibrary(SAMPLE_LIBRARY).length, 10);
});

test("paraphrases match the right saved answer", () => {
  const r = run();
  assert.match(row(r, "1.1").answer, /MFA/);
  assert.match(row(r, "1.2").answer, /AES-256/);
  assert.match(row(r, "1.3").answer, /TLS/);
  assert.match(row(r, "2.1").answer, /once a year/);
  assert.match(row(r, "3.2").answer, /report is available/);
});

test("a question with no saved answer is a gap, not a guess", () => {
  const r = run();
  for (const id of ["3.1", "3.3"]) {
    assert.equal(row(r, id).tier, "none");
    assert.equal(row(r, id).answer, "");
    assert.equal(row(r, id).status, "Write answer");
  }
  assert.ok(r.counts.none >= 2);
});

test("a changed number downgrades a strong match and says why", () => {
  const r = run();
  const x = row(r, "2.2");
  assert.notEqual(x.tier, "strong");
  assert.ok(x.flags.some((f) => /24 hours/.test(f) && /72/.test(f) || /numbers differ/.test(f)));
});

test("a negated question is flagged even when the words match", () => {
  const lib = parseLibrary("Do you allow staff to access production data without approval?,No. Production access needs a ticket.\n");
  const r = fill(parseQuestions("5.1 Do you NOT allow staff to access production data without approval?"), lib);
  assert.ok(r.rows[0].flags.some((f) => /negated/.test(f)));
  assert.equal(r.rows[0].tier === "strong", false);
});

test("duplicate questions inside one questionnaire are flagged", () => {
  const r = fill(parseQuestions("1 Is customer data encrypted at rest?\n2 Is customer data encrypted at rest?"), parseLibrary(SAMPLE_LIBRARY));
  assert.ok(r.rows[1].flags.some((f) => /same question as 1/.test(f)));
});

test("empty library: every question needs an answer", () => {
  const r = fill(parseQuestions(SAMPLE_QUESTIONS), []);
  assert.equal(r.counts.none, r.counts.total);
});

test("tiers and categories", () => {
  assert.equal(tierOf(0.9), "strong");
  assert.equal(tierOf(0.4), "review");
  assert.equal(tierOf(0.1), "none");
  assert.equal(categorize("Do you encrypt data at rest?"), "Encryption");
  assert.equal(categorize("How are backups restored?"), "Business continuity");
  assert.equal(answerKind("Do you have a DPA?"), "yes/no");
  assert.equal(answerKind("List your regions"), "list");
});

test("CSV export neutralises formulas and round-trips quoting", () => {
  const lib = parseLibrary('Do you encrypt data at rest?,"=HYPERLINK(""http://x"")"\n');
  const out = toCsv(fill(parseQuestions("1 Do you encrypt data at rest?"), lib));
  assert.match(out, /'=HYPERLINK/);
  assert.equal(parseCsv(out)[0][0], "ID");
});

test("markdown export escapes pipes", () => {
  const lib = parseLibrary('Do you encrypt data at rest?,"yes | always"\n');
  assert.match(toMarkdown(fill(parseQuestions("1 Do you encrypt data at rest?"), lib)), /yes \\\| always/);
});

test("learn adds new answers once and the library round-trips", () => {
  const lib = parseLibrary(SAMPLE_LIBRARY);
  const grown = learn(lib, [{ question: "Do you carry cyber insurance?", answer: "Yes, limit on request." }, { question: "Do you carry cyber insurance?", answer: "dup" }, { question: "Is data encrypted in transit?", answer: "dup2" }]);
  assert.equal(grown.length, lib.length + 1);
  assert.equal(parseLibrary(libraryToCsv(grown)).length, grown.length);
});

test("match ranks the closest saved question first", () => {
  const idx = buildIndex(parseLibrary(SAMPLE_LIBRARY));
  const m = match("How often are penetration tests performed?", idx);
  assert.match(m[0].entry.answer, /once a year/);
});
