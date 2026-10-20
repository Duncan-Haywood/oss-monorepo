import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validate, repair, sampleFile, sampleBrokenFile, buildFile, typeKind, typeName,
  splitRecords, transactionsCsv, maskedFindingsCsv,
} from "./calc.mjs";

const codes = (r) => r.findings.map((x) => x.code);
const lines = (t) => t.split("\n").filter(Boolean);
const join = (ls) => ls.join("\n") + "\n";

test("type codes fall into the BAI ranges", () => {
  assert.equal(typeKind(15), "status");
  assert.equal(typeKind(175), "credit");
  assert.equal(typeKind(475), "debit");
  assert.equal(typeKind(750), "loan");
  assert.equal(typeKind(900), "other");
  assert.equal(typeName(195), "Incoming money transfer");
  assert.match(typeName(333), /Credit \(code 333\)/);
});

test("the clean example has no findings beyond the all-clear and reads two accounts", () => {
  const r = validate(sampleFile());
  assert.deepEqual(codes(r), ["CLEAN"]);
  assert.equal(r.summary.accounts, 2);
  assert.equal(r.summary.groups, 1);
  assert.equal(r.summary.transactions, 8);
  assert.equal(r.summary.credit, 420000 + 235000 + 155000 + 20000);
  assert.equal(r.summary.debit, 190000 + 128300 + 200000 + 10500);
  assert.equal(r.summary.accountList[0].convention, "summaries and detail");
});

test("an edited amount fails the account total and breaks the balance roll-forward", () => {
  const ls = lines(sampleFile());
  const i = ls.findIndex((l) => l.startsWith("16,142,"));
  ls[i] = ls[i].replace("235000", "253000");
  const c = codes(validate(join(ls)));
  assert.ok(c.includes("49-SUM"));
  assert.ok(c.includes("ROLL"));
  assert.ok(!c.includes("49-RECORDS"));
});

test("a deleted transaction fails the record counts at every level", () => {
  const ls = lines(sampleFile());
  ls.splice(ls.findIndex((l) => l.startsWith("16,475,")), 1);
  const c = codes(validate(join(ls)));
  assert.ok(c.includes("49-RECORDS") && c.includes("98-RECORDS") && c.includes("99-RECORDS"));
});

test("the other control-total conventions are accepted", () => {
  const base = lines(sampleFile());
  // detail only
  const ls = base.map((l) => l);
  ls[ls.findIndex((l) => l.startsWith("49,2656600"))] = "49,1330300,8/".replace("1330300", String(420000 + 235000 + 155000 + 190000 + 128300 + 200000));
  const r = validate(join(ls));
  assert.ok(!codes(r).includes("49-SUM"));
  assert.equal(r.summary.accountList[0].convention, "detail only");
});

test("group and file totals are the sum of the totals below them", () => {
  const ls = lines(sampleFile());
  ls[ls.findIndex((l) => l.startsWith("98,"))] = "98,1,2,14/";
  const c = codes(validate(join(ls)));
  assert.ok(c.includes("98-SUM"));
});

test("a missing closing slash, a missing trailer and a bad amount are each reported", () => {
  let ls = lines(sampleFile());
  ls[3] = ls[3].replace(/\/$/, "");
  assert.ok(codes(validate(join(ls))).includes("SLASH"));
  ls = lines(sampleFile()).slice(0, -1);
  assert.ok(codes(validate(join(ls))).includes("NO-99"));
  ls = lines(sampleFile());
  ls[3] = ls[3].replace("420000", "4200.00");
  assert.ok(codes(validate(join(ls))).includes("16-AMT"));
});

test("88 continuation lines join onto the record before and count as records", () => {
  const ls = lines(sampleFile());
  const i = ls.findIndex((l) => l.startsWith("16,175,"));
  ls[i] = "16,175,420000,,DEP48211,CHK DEPOSIT 4 ITEMS,MOBILE DEP";
  ls.splice(i + 1, 0, "88,OSIT NORTH BRANCH/");
  // record counts now off by one: the file did not account for the new 88 line
  const r = validate(join(ls));
  assert.ok(codes(r).includes("49-RECORDS"));
  const tx = r.summary.transactionList.find((t) => t.type === 175);
  assert.match(tx.text, /MOBILE DEP,OSIT NORTH BRANCH/);
  // and the repair makes it consistent
  const fixed = repair(join(ls));
  assert.equal(fixed.error, null);
  assert.deepEqual(codes(validate(fixed.text)), ["CLEAN"]);
});

test("a one-line file is split into records", () => {
  const one = lines(sampleFile()).join("");
  assert.equal(splitRecords(one).lines.length, 16);
  assert.deepEqual(codes(validate(one)), ["CLEAN"]);
});

test("repair rebuilds trailers only and leaves every transaction as it was", () => {
  const broken = sampleBrokenFile();
  const fixed = repair(broken);
  assert.ok(fixed.changes.length >= 3);
  const keep = (t) => lines(t).filter((l) => /^(01|02|03|16)/.test(l));
  assert.deepEqual(keep(fixed.text), keep(broken));
  const c = codes(validate(fixed.text));
  assert.ok(!c.some((x) => /^(49|98|99)-/.test(x)));
});

test("repair of an already valid file changes nothing", () => {
  const r = repair(sampleFile());
  assert.equal(r.text, sampleFile());
  assert.equal(r.changes.length, 0);
});

test("a file that does not start with 01 is refused at the first line", () => {
  const c = codes(validate("16,175,100,,A,B,C/\n"));
  assert.ok(c.includes("FIRST"));
  assert.equal(repair("16,175,100,,A,B,C/\n").text, null);
  assert.ok(codes(validate("")).includes("EMPTY"));
});

test("duplicate bank references and balance codes used as transactions are flagged", () => {
  const ls = lines(sampleFile());
  const i = ls.findIndex((l) => l.startsWith("16,175,"));
  ls.splice(i + 1, 0, ls[i]);
  const c = codes(validate(join(ls)));
  assert.ok(c.includes("DUP"));
  const ls2 = lines(sampleFile());
  ls2[3] = ls2[3].replace("16,175,", "16,015,");
  assert.ok(codes(validate(join(ls2))).includes("16-STATUS"));
});

test("account numbers are masked in the transaction export and the findings export", () => {
  const r = validate(sampleBrokenFile());
  const csv = transactionsCsv(r);
  assert.match(csv, /…4567/);
  assert.doesNotMatch(csv, /0001234567/);
  assert.doesNotMatch(maskedFindingsCsv(r), /0001234567|0007654321/);
  assert.match(csv.split("\n")[0], /^account,date,type_code/);
  assert.match(transactionsCsv(validate(sampleFile())), /-1900\.00/); // debits are negative
});

test("buildFile makes a valid file for any group", () => {
  const f = buildFile({ groups: [{ date: "261001", accounts: [{ number: "55", statuses: [[10, 0], [15, 100]], summaries: [], txns: [[108, 100, "R1"]] }] }] });
  assert.deepEqual(codes(validate(f)), ["CLEAN"]);
});

test("a file with no transaction records counts zero transactions, not an empty list", () => {
  // The summary once declared `transactions` twice (0, then []), so the later
  // [] won and a file without 16 records rendered as ",  transactions" on the
  // page. Found by `tsc --checkJs` (TS1117, duplicate object key).
  const noDetail = sampleFile().split(/\r?\n/).filter((l) => !l.startsWith("16,") && !l.startsWith("88,")).join("\n");
  assert.equal(validate(noDetail).summary.transactions, 0);
});
