import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, confirm } from "./engine.mjs";
import { addProject, tagProject, projectReport, projectCsv } from "./projects.mjs";

const CSV = `Date,Description,Amount
2026-02-01,ACME DEPOSIT KITCHEN,5000.00
2026-02-03,LUMBER YARD KITCHEN,-1200.00
2026-02-04,TILE SHOP KITCHEN,-800.00
2026-02-05,BETA PAYMENT DECK,3000.00
2026-02-06,LUMBER YARD DECK,-2500.00
2026-02-07,SOFTWARE SUBSCRIPTION,-60.00
`;
function setup() {
  let { books } = importStatement(newBooks(), CSV, "1000");
  const id = (s) => books.transactions.find((t) => t.desc.includes(s)).id;
  books = confirm(books, { [id("ACME")]: "4000", [id("BETA")]: "4000", [id("LUMBER YARD KITCHEN")]: "6100", [id("TILE")]: "6100", [id("LUMBER YARD DECK")]: "6100", [id("SOFTWARE")]: "6060" });
  return addProject(addProject(books, { id: "kitchen", name: "Kitchen reno" }), { id: "deck", name: "Deck" });
}

test("each project gets its own revenue, cost and margin; overhead is unassigned", () => {
  let books = setup();
  books = tagProject(books, "kitchen", { match: "kitchen" }).books;
  books = tagProject(books, "deck", { match: "deck" }).books;
  const r = projectReport(books);
  const k = r.projects.find((p) => p.id === "kitchen"), d = r.projects.find((p) => p.id === "deck");
  assert.equal(k.revenue, 500000);
  assert.equal(k.cost, 200000);
  assert.equal(k.net, 300000);
  assert.equal(k.margin, 0.6);
  assert.equal(d.net, 300000 - 250000);
  const un = r.projects.find((p) => p.id === "(unassigned)");
  assert.equal(un.cost, 6000);
  assert.ok(r.warnings.some((w) => /not tagged/.test(w)));
  assert.equal(r.total.net, 344000);
});

test("project totals add up to the books' profit", () => {
  let books = setup();
  books = tagProject(books, "kitchen", { match: "kitchen" }).books;
  const r = projectReport(books);
  assert.equal(r.total.net, 500000 + 300000 - 120000 - 80000 - 250000 - 6000);
});

test("a date range limits the report; untag removes a tag; unknown project is refused", () => {
  let books = setup();
  books = tagProject(books, "kitchen", { match: "kitchen" }).books;
  const r = projectReport(books, { from: "2026-02-04", to: "2026-02-28" });
  assert.equal(r.projects.find((p) => p.id === "kitchen").revenue, 0);
  const u = tagProject(books, null, { match: "kitchen" });
  assert.equal(u.tagged, 3);
  assert.throws(() => tagProject(books, "nope", { match: "x" }), /No project/);
  assert.throws(() => addProject(books, { id: "bad id!" }), /project id/);
});

test("a split line carries per-part tags and a bank line's tag is the fallback", () => {
  let books = setup();
  const t = books.transactions.find((x) => x.desc.includes("LUMBER YARD DECK"));
  t.status = "split";
  t.split = [{ account: "6100", cents: -150000, project: "deck" }, { account: "6100", cents: -100000, project: "kitchen" }];
  const r = projectReport(books);
  assert.equal(r.projects.find((p) => p.id === "deck").cost, 150000);
  assert.equal(r.projects.find((p) => p.id === "kitchen").cost, 100000);
});

test("an invoice is tagged by number and its revenue lands on the project", () => {
  let books = setup();
  books.documents = [{ id: "D1", kind: "invoice", number: "INV-1", date: "2026-02-10", due: "2026-03-10", party: "Acme", total: 100000, lines: [{ account: "4000", cents: 100000 }], paid: 0, payments: [] }];
  const r0 = projectReport(books);
  assert.equal(r0.projects.find((p) => p.id === "(unassigned)").revenue, 800000 + 100000);
  books = tagProject(books, "deck", { docs: ["INV-1"] }).books;
  assert.equal(projectReport(books).projects.find((p) => p.id === "deck").revenue, 100000);
  assert.throws(() => tagProject(books, "deck", { docs: ["INV-9"] }), /No document/);
});

test("CSV has one row per project and account plus totals", () => {
  let books = setup();
  books = tagProject(books, "kitchen", { match: "kitchen" }).books;
  const csv = projectCsv(projectReport(books));
  assert.match(csv, /Kitchen reno,income,4000 Sales,5000.00/);
  assert.match(csv, /Kitchen reno,net,,3000.00/);
});
