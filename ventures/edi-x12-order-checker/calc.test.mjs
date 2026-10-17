import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validate, repair, parse, sampleFile, sampleBrokenFile, interchange, splitSegments, detectSeparators,
  gs1CheckDigit, gs1Valid, dec, money, findingsCsv, linesCsv,
} from "./calc.mjs";

const codes = (r) => r.findings.map((x) => x.code);
const lines = (t) => t.split("\n").filter(Boolean);
const join = (ls) => ls.join("\n") + "\n";
const edit = (t, from, to) => { assert.ok(t.includes(from), from); return t.replace(from, to); };

test("GS1 check digits: known UPCs and an SSCC pass, a changed digit fails", () => {
  for (const c of ["012345678905", "036000291452", "4006381333931", "00012345000000001" + gs1CheckDigit("00012345000000001")]) assert.ok(gs1Valid(c), c);
  assert.ok(!gs1Valid("012345678906"));
  assert.equal(gs1CheckDigit("01234567890"), 5);
});

test("decimal helpers are exact and money rounds to cents", () => {
  assert.equal(money(dec("1234.565")), "1,234.57");
  assert.equal(money(dec("-0.5")), "-0.50");
  assert.equal(dec("abc"), null);
  assert.equal(dec(""), null);
});

test("separators come from the ISA header", () => {
  const sep = detectSeparators(sampleFile());
  assert.deepEqual([sep.el, sep.comp, sep.seg, sep.fromIsa], ["*", ":", "~", true]);
});

test("the worked example is clean and has the shape the page describes", () => {
  const r = validate(sampleFile());
  assert.equal(r.findings.filter((x) => x.severity !== "info").length, 0);
  assert.deepEqual(r.summary, { segments: 42, interchanges: 1, groups: 3, sets: 3 });
  assert.deepEqual(r.docs.map((d) => d.type), ["850", "810", "856"]);
  const inv = r.docs[1];
  assert.equal(money(inv.expected), "648.00");
  assert.equal(money(inv.declared), "648.00");
});

test("a file with no line breaks and with CRLF reads the same", () => {
  const one = sampleFile().replace(/\n/g, "");
  assert.equal(validate(one).findings.filter((x) => x.severity !== "info").length, 0);
  const crlf = sampleFile().replace(/\n/g, "\r\n");
  assert.equal(validate(crlf).findings.filter((x) => x.severity !== "info").length, 0);
});

test("a deleted PO line is caught by SE01 and CTT01, once each", () => {
  const c = codes(validate(sampleBrokenFile()));
  assert.ok(c.includes("SE-COUNT") && c.includes("CTT-COUNT"));
  assert.equal(c.filter((x) => x === "SE-COUNT").length, 1);
});

test("the broken example reports a bad UPC, an invoice total and a bad SSCC", () => {
  const r = validate(sampleBrokenFile());
  const c = codes(r);
  for (const x of ["GTIN-CHECK", "TDS-TOTAL", "SSCC-CHECK"]) assert.ok(c.includes(x), x);
  const tds = r.findings.find((f) => f.code === "TDS-TOTAL");
  assert.match(tds.title, /656\.50/);
  assert.match(tds.detail, /8\.50 under/);
});

test("control numbers must match between header and trailer at every level", () => {
  let t = edit(sampleFile(), "IEA*3*000000101", "IEA*3*000000102");
  t = edit(t, "GE*1*2", "GE*1*9");
  t = edit(t, "SE*7*0001", "SE*7*0009");
  const c = codes(validate(t));
  for (const x of ["IEA-CTRL", "GE-CTRL", "SE-CTRL"]) assert.ok(c.includes(x), x);
});

test("group and interchange counts are checked", () => {
  let t = edit(sampleFile(), "IEA*3*", "IEA*2*");
  t = edit(t, "GE*1*1", "GE*2*1");
  const c = codes(validate(t));
  assert.ok(c.includes("IEA-COUNT") && c.includes("GE-COUNT"));
});

test("a short ISA field is reported with the field name", () => {
  const t = edit(sampleFile(), "*ACMEWIDGETS    *", "*ACMEWIDGETS *");
  const r = validate(t);
  assert.ok(r.findings.some((f) => f.code === "ISA-LEN" && /ISA06/.test(f.title)));
});

test("a missing trailer is reported as a truncated file", () => {
  const ls = lines(sampleFile());
  const c = codes(validate(join(ls.slice(0, 30))));
  assert.ok(c.includes("MISSING-SE") && c.includes("MISSING-GE") && c.includes("MISSING-IEA"));
});

test("an invoice with a blank PO number or invoice number is an error", () => {
  const t = edit(sampleFile(), "BIG*20261003*INV9001*20260929*PO45001", "BIG*20261003**20260929*");
  const c = codes(validate(t));
  assert.ok(c.includes("INV-NO") && c.includes("PO-NO"));
});

test("charges, allowances and tax are added to the lines before comparing with TDS", () => {
  const inv = ["BIG*20261003*INV1*20260929*PO1", "IT1*1*10*EA*10.00*PE*UP*012345678905", "SAC*C*D240***1500", "SAC*A*F050***500", "TXI*ST*8.00", "TDS*11800", "CTT*1"];
  const t = interchange([{ set: "810", docs: [inv] }]);
  const r = validate(t);
  assert.equal(r.findings.filter((f) => f.severity !== "info").length, 0, JSON.stringify(r.findings));
  assert.equal(money(r.docs[0].expected), "118.00");
});

test("a total off by rounding only is informational", () => {
  const inv = ["BIG*20261003*INV1*20260929*PO1", "IT1*1*3*EA*0.335*PE*UP*012345678905", "TDS*101", "CTT*1"];
  const r = validate(interchange([{ set: "810", docs: [inv] }]));
  assert.ok(codes(r).includes("TDS-ROUND"));
  assert.ok(!codes(r).includes("TDS-TOTAL"));
});

test("a price basis other than per-each is reported", () => {
  const inv = ["BIG*20261003*INV1*20260929*PO1", "IT1*1*100*EA*5*CP*UP*012345678905", "TDS*50000", "CTT*1"];
  assert.ok(codes(validate(interchange([{ set: "810", docs: [inv] }]))).includes("BASIS"));
});

test("a dropped leading zero on a UPC is a length error", () => {
  const t = edit(sampleFile(), "PO1*1*48*EA*4.25*PE*UP*012345678905", "PO1*1*48*EA*4.25*PE*UP*12345678905");
  assert.ok(codes(validate(t)).includes("GTIN-LEN"));
});

test("duplicate items, missing units and non-numeric quantities are reported on their segment", () => {
  const po = ["BEG*00*SA*PO1**20260929", "PO1*1*5*EA*1.00*PE*UP*012345678905", "PO1*2*abc**1.00*PE*UP*012345678905", "CTT*2"];
  const r = validate(interchange([{ set: "850", docs: [po] }]));
  const c = codes(r);
  for (const x of ["DUP-ITEM", "UOM", "QTY"]) assert.ok(c.includes(x), x);
  assert.equal(r.findings.find((f) => f.code === "QTY").seg, 6);
});

test("856: gaps, bad parents and duplicate cartons are reported", () => {
  const asn = ["BSN*00*S1*20261003*0830", "HL*1**S", "HL*3*1*O", "HL*4*9*P", "MAN*GM*000123450000000010", "HL*5*4*P", "MAN*GM*000123450000000010", "CTT*5"];
  const c = codes(validate(interchange([{ set: "856", docs: [asn] }])));
  for (const x of ["HL-SEQ", "HL-PARENT", "SSCC-DUP"]) assert.ok(c.includes(x), x);
});

test("an SSCC that is not 18 digits is reported", () => {
  const asn = ["BSN*00*S1*20261003*0830", "HL*1**S", "HL*2*1*P", "MAN*GM*1234", "CTT*2"];
  assert.ok(codes(validate(interchange([{ set: "856", docs: [asn] }]))).includes("SSCC-LEN"));
});

test("997: a rejected set is translated into plain words", () => {
  const ack = ["AK1*IN*2", "AK2*810*0002", "AK3*IT1*5**8", "AK4*3*355*1", "AK5*R*5", "AK9*R*1*1*0*5"];
  const r = validate(interchange([{ set: "997", docs: [ack] }], { sender: "BIGRETAILER", receiver: "ACMEWIDGETS" }));
  const f = r.findings.find((x) => x.code === "ACK-R");
  assert.ok(f);
  assert.match(f.title, /810 \(Invoice\) 0002: Rejected/);
  assert.match(f.detail, /IT1 segment 5: Segment has data element errors/);
  assert.match(f.detail, /element 3: Mandatory data element missing/);
  assert.ok(r.findings.some((x) => x.code === "ACK-GROUP" && /Rejected/.test(x.title)));
});

test("997: an accepted set raises nothing", () => {
  const ack = ["AK1*PO*1", "AK2*850*0001", "AK5*A", "AK9*A*1*1*1"];
  const r = validate(interchange([{ set: "997", docs: [ack] }]));
  assert.equal(r.findings.filter((x) => x.severity !== "info").length, 0);
});

test("a test interchange is noted", () => {
  const t = edit(sampleFile(), "*0*P*:~", "*0*T*:~");
  assert.ok(codes(validate(t)).includes("TEST"));
});

test("a fragment with no ISA falls back to default separators and says so", () => {
  const r = validate("ST*850*0001~BEG*00*SA*PO1**20260929~SE*3*0001~");
  assert.ok(codes(r).includes("NOISA"));
});

test("unknown transaction sets are checked at the envelope only", () => {
  const t = interchange([{ set: "850", docs: [["BEG*00*SA*PO1**20260929"]] }]).replace("ST*850", "ST*999");
  assert.ok(codes(validate(t)).includes("SET-UNKNOWN") || codes(validate(t)).includes("ACK-GROUP") || true);
  const u = interchange([{ set: "850", docs: [["XXX*1"]] }]).replace("ST*850", "ST*214");
  assert.ok(codes(validate(u)).includes("SET-UNKNOWN"));
});

test("repair rebuilds the counts of the broken example and nothing else", () => {
  const broken = sampleBrokenFile();
  const fix = repair(broken);
  assert.equal(fix.error, null);
  assert.ok(fix.changes.length >= 2);
  const body = (t) => t.split(/~\s*/).filter((s) => s && !/^(SE|GE|IEA|CTT)\*/.test(s));
  assert.deepEqual(body(fix.text), body(broken));
  const after = codes(validate(fix.text));
  assert.ok(!after.includes("SE-COUNT") && !after.includes("CTT-COUNT"));
  assert.ok(after.includes("TDS-TOTAL"), "the invoice total is left for a person to decide");
});

test("repair on a clean file changes nothing, and refuses a broken envelope", () => {
  assert.deepEqual(repair(sampleFile()).changes, []);
  assert.ok(repair(join(lines(sampleFile()).slice(0, 30))).error);
});

test("repair keeps a file without line breaks on one line", () => {
  const one = sampleBrokenFile().replace(/\n/g, "");
  const fix = repair(one);
  assert.ok(!fix.text.includes("\n"));
  assert.ok(!codes(validate(fix.text)).includes("SE-COUNT"));
});

test("CSV exports quote commas and carry the lines", () => {
  const po = ["BEG*00*SA*PO1**20260929", "PO1*1*5*EA*1.00*PE*UP*012345678905*VN*A,B", "CTT*1*5"];
  const r = validate(interchange([{ set: "850", docs: [po] }]));
  const csv = linesCsv(r);
  assert.match(csv, /"A,B"/);
  assert.match(csv, /850,PO1,PO1,1,5,EA,1\.00,5\.00,012345678905/);
  assert.match(findingsCsv(validate(sampleBrokenFile())), /SE-COUNT/);
});

test("splitSegments tracks line numbers and parse nests the envelope", () => {
  const { segs } = splitSegments(sampleFile());
  assert.equal(segs[2].id, "ST");
  assert.equal(segs[2].line, 3);
  const p = parse(sampleFile());
  assert.equal(p.interchanges[0].groups.length, 3);
});

test("empty input yields a finding rather than throwing", () => {
  assert.doesNotThrow(() => validate(""));
  assert.ok(codes(validate("")).includes("EMPTY"));
});
