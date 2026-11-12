// cli.mjs's flag() removes what it reads. Before 2026-11-12 a few commands read the same flag twice, and the
// second read always came back empty: `salestax return --state` only reached the discount (due days, NY periods and
// notes fell back to defaults), `receipts --min 50` used $0, `schedulec --meals 100` used 0%, `estimate` without
// --eitc-children added an unrequested earned income credit and with it counted 0 children. These run the CLI.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("./cli.mjs", import.meta.url));
const run = (args) => execFileSync("node", [cli, ...args], { encoding: "utf8" });
function books(docs) {
  const dir = mkdtempSync(join(tmpdir(), "flags-"));
  const b = join(dir, "b.json");
  writeFileSync(join(dir, "s.csv"), "Date,Description,Amount\n2026-03-01,X,1.00\n");
  run(["--books", b, "import", join(dir, "s.csv"), "--account", "1000"]);
  if (docs) { writeFileSync(join(dir, "d.csv"), docs); run(["--books", b, "documents", join(dir, "d.csv")]); }
  return b;
}

test("salestax return --state sets the due day, periods, discount and notes together", () => {
  const head = "type,number,date,due,party,amount,account,description\n";
  const wy = books(head + "invoice,1,2026-03-10,,A Co,10000.00,4000,Goods\ninvoice,1,2026-03-10,,A Co,500.00,2100,WY state\n");
  const t = JSON.parse(run(["--books", wy, "salestax", "return", "--state", "WY", "--freq", "monthly", "--json"]));
  const row = t.periods[0].rows[0];
  assert.equal(row.due, "2026-04-30");          // Wyoming: last day of the next month (was the default 20th)
  assert.equal(row.discount, 975);               // 1.95% of $500
  assert.ok(t.warnings.some((w) => /postmarked by the 15th/.test(w)));
  const ny = books(head + "invoice,1,2026-03-10,,A Co,1000.00,4000,Goods\ninvoice,1,2026-03-10,,A Co,80.00,2100,NY state\n");
  const n = JSON.parse(run(["--books", ny, "salestax", "return", "--state", "NY", "--json"]));
  assert.equal(n.periods[0].rows[0].due, "2026-06-22"); // Mar-May quarter, due June 20 (a Saturday in 2026)
  const ok = books(head + "invoice,1,2026-03-10,,A Co,1000.00,4000,Goods\ninvoice,1,2026-03-10,,A Co,45.00,2100,OK state\n");
  const o = JSON.parse(run(["--books", ok, "salestax", "return", "--state", "OK", "--freq", "quarterly", "--json"]));
  assert.ok(o.warnings.some((w) => /not quarterly/.test(w)));
  assert.ok(o.warnings.some((w) => /no vendor discount line/.test(w)));
});

test("estimate reads --eitc-children once: absent adds no credit, 2 means two children", () => {
  const b = books();
  const est = (extra) => JSON.parse(run(["--books", b, "estimate", "--year", "2025", "--wages", "10000", "--json", ...extra]));
  const none = est([]), two = est(["--eitc-children", "2"]), zero = est(["--eitc-children", "0"]);
  assert.equal(none.eitcCredit, 0);                // no --eitc-children: no credit (was the 0-child credit)
  assert.ok(zero.eitcCredit > 0);                  // $10,000 of earned income earns the no-child credit
  assert.ok(two.eitcCredit > zero.eitcCredit);     // was read as 0 children
});

test("schedulec --meals 100 deducts all of the meals line (was read as 0%)", () => {
  const dir = mkdtempSync(join(tmpdir(), "flags-"));
  const b = join(dir, "b.json");
  writeFileSync(join(dir, "m.csv"), "Date,Description,Amount\n2026-03-01,Client lunch,-100.00\n");
  run(["--books", b, "import", join(dir, "m.csv"), "--account", "1000"]);
  const id = JSON.parse(run(["--books", b, "review", "--json"]))[0].id;
  run(["--books", b, "confirm", `${id}=6130`]);
  const meals = (extra) => JSON.parse(run(["--books", b, "schedulec", "--json", ...extra])).lines.find((l) => l.line === "24b").cents;
  assert.equal(meals([]), 5000);
  assert.equal(meals(["--meals", "100"]), 10000);
});
