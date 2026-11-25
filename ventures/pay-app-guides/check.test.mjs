import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSov, checkPayApp, checkText, SAMPLE_LAST, SAMPLE_DRAFT, SAMPLE_SETTINGS } from "./check.mjs";
import { compute, toCsv, SAMPLE } from "./calc.mjs";

const run = (lastText, draftText, ls = {}, ds = {}) =>
  checkPayApp({ lines: parseSov(lastText).lines, settings: ls }, { lines: parseSov(draftText).lines, settings: ds });
const H = "Item,Description,Scheduled value,From previous applications,This period,Materials presently stored\n";

test("reads the calculator's own CSV export, skipping its totals row", () => {
  const csv = toCsv(compute(SAMPLE.lines, SAMPLE.settings));
  const { lines, errors } = parseSov(csv);
  assert.deepEqual(errors, []);
  assert.equal(lines.length, SAMPLE.lines.length);
  assert.equal(lines[2].stored, "15000.00");
  assert.equal(lines[4].item, "CO-1");
});

test("reads tab-separated paste with other common headings, and says which column is missing", () => {
  const { lines } = parseSov("Line\tScope\tSOV\tPrevious\tCurrent\tStored\n1\tConduit\t1000\t100\t200\t0\n");
  assert.deepEqual(lines[0], { item: "1", description: "Conduit", scheduled: "1000", previous: "100", thisPeriod: "200", stored: "0" });
  assert.match(parseSov("Item,Scheduled value,This period\n1,2,3\n").errors.join(" "), /previous/);
});

test("a correct roll-forward has no findings", () => {
  const last = H + "1,A,10000,2000,3000,0\n2,B,5000,0,1000,500\n";
  const draft = H + "1,A,10000,5000,1000,0\n2,B,5000,1000,500,0\nCO-1,Added,800,0,400,0\n";
  // last: G = 5000 + 1500 = 6500, retainage 650, earned less retainage 5850.
  const r = run(last, draft, {}, { previousCertificates: "5850" });
  assert.equal(r.expected.previousCertificates, 585000);
  assert.deepEqual(r.findings.filter((f) => f.level !== "info").map((f) => f.msg), []);
  assert.ok(r.findings.some((f) => /CO-1 is new this month as a change order/.test(f.msg)));
});

test("the sample catches each planted mistake, and only those", () => {
  const r = checkPayApp({ lines: parseSov(SAMPLE_LAST).lines, settings: SAMPLE_SETTINGS.last }, { lines: parseSov(SAMPLE_DRAFT).lines, settings: SAMPLE_SETTINGS.draft });
  const msgs = r.findings.map((f) => `${f.level}: ${f.msg}`);
  assert.ok(msgs.some((m) => /^high: Item 2: scheduled value changed from \$40,000\.00 to \$42,000\.00/.test(m)), msgs.join("\n"));
  assert.ok(msgs.some((m) => /^high: Item 5 is new this month but is not numbered as a change order/.test(m)));
  assert.ok(msgs.some((m) => /^medium: Item 3: stored materials went down by \$12,000\.00 but only \$6,000\.00/.test(m)));
  // Last month: G = 6,000 + 20,000 + 29,000 = 55,000; 10% retainage 5,500; earned less retainage 49,500.
  assert.ok(msgs.some((m) => /^high: Previous certificates is \$31,500\.00; last month's total earned less retainage was \$49,500\.00/.test(m)));
  assert.equal(r.findings.filter((f) => f.level !== "info").length, 4, msgs.join("\n"));
  assert.equal(r.findings[0].level, "high");
});

test("previous column off, a dropped line, a duplicate and a rate change are flagged", () => {
  const last = H + "1,A,10000,2000,3000,0\n2,B,5000,0,1000,0\n";
  const draft = H + "1,A,10000,4000,1000,0\n1,A again,100,0,0,0\n";
  const r = run(last, draft, { workRetainage: "10" }, { workRetainage: "5", previousCertificates: "5400" });
  const msgs = r.findings.map((f) => f.msg).join("\n");
  assert.match(msgs, /Item 1: "from previous applications" is \$4,000\.00; last month's previous plus this period was \$5,000\.00\. Off by -\$1,000\.00/);
  assert.match(msgs, /Item 2 \("B"\) was on last month's application and is missing/);
  assert.match(msgs, /Item 1 appears twice/);
  assert.match(msgs, /Retainage on work changed from 10% to 5%/);
});

test("item numbers match regardless of case and spaces; a new line with a previous amount is flagged", () => {
  const r = run(H + "CO 1,X,1000,0,500,0\n", H + "co1,X,1000,500,500,0\nCO-2,Y,200,100,0,0\n", {}, { previousCertificates: "450" });
  const msgs = r.findings.map((f) => f.msg).join("\n");
  assert.doesNotMatch(msgs, /CO 1|co1/);
  assert.match(msgs, /Item CO-2 is new this month but shows \$100\.00 from previous applications/);
});

test("the text summary lists findings and the expected previous certificates", () => {
  const r = run(H + "1,A,100,0,50,0\n", H + "1,A,100,50,50,0\n", {}, { previousCertificates: "45" });
  const t = checkText(r, { project: "Elm St" });
  assert.match(t, /^PAY APPLICATION CHECK: Elm St/);
  assert.match(t, /Previous certificates should be: \$45\.00/);
  assert.match(t, /No mismatches found/);
});
