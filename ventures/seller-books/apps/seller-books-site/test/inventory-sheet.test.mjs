// The free inventory spreadsheet: its headers are the app importer's, the example adds up by hand, and
// (where LibreOffice is installed) the workbook recalculates to the same figures.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { inflateRawSync } from "node:zlib";
import {
  buildWorkbook,
  COLUMNS,
  EXAMPLE_FILE,
  EXAMPLE_ITEMS,
  EXAMPLE_SUMMARY,
  OUTPUTS,
  ROWS,
  STATUSES,
  TEMPLATE_FILE,
} from "../src/inventory-sheet.mjs";

const IMPORTER = new URL(
  "../../seller-books/src/worker/services/importers/inventory-sheet.ts",
  import.meta.url,
);
// The importer's normHeader (parse.ts): lower case, letters and digits only.
const norm = (h) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Every field's header names in the importer's SPEC, read from its source. */
function importerNames() {
  const src = readFileSync(IMPORTER, "utf8");
  const spec = src.slice(src.indexOf("const SPEC"), src.indexOf("const PERSONAL"));
  const fields = {};
  for (const m of spec.matchAll(/(\w+): \{\s*(?:required: true,\s*)?names: \[([^\]]*)\]/g)) {
    fields[m[1]] = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => norm(x[1]));
  }
  return fields;
}

/** Entries of a zip written by inventory-sheet.mjs (deflated, no data descriptors). */
function unzip(buf) {
  const out = {};
  let p = 0;
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const method = buf.readUInt16LE(p + 8);
    const size = buf.readUInt32LE(p + 18);
    const nameLen = buf.readUInt16LE(p + 26);
    const extra = buf.readUInt16LE(p + 28);
    const name = buf.subarray(p + 30, p + 30 + nameLen).toString();
    const data = buf.subarray(p + 30 + nameLen + extra, p + 30 + nameLen + extra + size);
    out[name] = (method === 8 ? inflateRawSync(data) : data).toString();
    p += 30 + nameLen + extra + size;
  }
  return out;
}

describe("inventory spreadsheet", () => {
  test("imported columns use the importer's own header names; the others match none", () => {
    const fields = importerNames();
    for (const f of [
      "bought",
      "title",
      "sku",
      "quantity",
      "unitCost",
      "totalCost",
      "status",
      "removed",
      "sold",
    ]) {
      assert.ok(fields[f]?.length, `importer field ${f} read from the source`);
    }
    const all = new Set(Object.values(fields).flat());
    const want = {
      item: "title",
      sku: "sku",
      qty: "quantity",
      unit: "unitCost",
      total: "totalCost",
      bought: "bought",
      status: "status",
      removed: "removed",
    };
    for (const c of COLUMNS) {
      if (c.imported)
        assert.ok(
          fields[want[c.key]].includes(norm(c.header)),
          `${c.header} is a ${want[c.key]} name`,
        );
      else if (c.key === "sold")
        assert.ok(
          fields.sold.includes(norm(c.header)),
          "Date Sold is the importer's (ignored) sold column",
        );
      else
        assert.ok(!all.has(norm(c.header)), `${c.header} must not be read as an importer column`);
    }
  });

  test("the statuses the importer acts on are offered, and mean what the page says", () => {
    const src = readFileSync(IMPORTER, "utf8");
    const personal = new RegExp(/const PERSONAL = \/(.+)\/i;/.exec(src)[1], "i");
    const writtenOff = new RegExp(/const WRITTEN_OFF =\s*\/(.+)\/i;/.exec(src)[1], "i");
    assert.ok(personal.test("Kept"));
    assert.ok(writtenOff.test("Donated") && writtenOff.test("Lost"));
    for (const s of ["In stock", "Listed", "Sold"])
      assert.ok(!personal.test(s) && !writtenOff.test(s), s);
    assert.deepEqual(STATUSES.slice(3), ["Kept", "Donated", "Lost"]);
  });

  test("a valid workbook: three sheets, the header row, the status list, same bytes each build", () => {
    for (const [name, make] of Object.entries(OUTPUTS)) {
      const bytes = make();
      assert.ok(bytes.equals(make()), `${name} is reproducible`);
      const files = unzip(bytes);
      for (const f of [
        "[Content_Types].xml",
        "xl/workbook.xml",
        "xl/styles.xml",
        "xl/worksheets/sheet1.xml",
        "xl/worksheets/sheet2.xml",
        "xl/worksheets/sheet3.xml",
      ]) {
        assert.ok(files[f], `${name}: ${f}`);
      }
      assert.match(files["xl/workbook.xml"], /<sheet name="Inventory" sheetId="1"/);
      const inv = files["xl/worksheets/sheet1.xml"];
      for (const c of COLUMNS)
        assert.ok(inv.includes(`<t xml:space="preserve">${c.header}</t>`), c.header);
      assert.ok(inv.includes(`<formula1>"${STATUSES.join(",")}"</formula1>`));
      assert.equal((inv.match(/<row /g) ?? []).length, ROWS + 1);
    }
    assert.deepEqual(Object.keys(OUTPUTS), [TEMPLATE_FILE, EXAMPLE_FILE]);
    assert.ok(OUTPUTS[TEMPLATE_FILE]().length < 120_000, "template stays small");
  });

  test("the invented example's year summary, worked out independently of the sheet", () => {
    const y0 = "2026-01-01";
    const y1 = "2026-12-31";
    const cost = (i) => Number(i.total ?? 0) || Number(i.unit) * Number(i.qty ?? 1);
    const sum = (rows, f) => Math.round(rows.reduce((a, i) => a + f(i), 0) * 100) / 100;
    const inY = (d) => d && d >= y0 && d <= y1;
    const onHand = (day) => (i) =>
      i.bought <= day && !(i.sold && i.sold <= day) && !(i.removed && i.removed <= day);
    const ex = EXAMPLE_SUMMARY;
    assert.equal(sum(EXAMPLE_ITEMS.filter(onHand("2025-12-31")), cost), ex.onHandJan1);
    assert.equal(
      sum(
        EXAMPLE_ITEMS.filter((i) => inY(i.bought)),
        cost,
      ),
      ex.bought,
    );
    assert.equal(
      sum(
        EXAMPLE_ITEMS.filter((i) => i.status === "Kept" && inY(i.removed)),
        cost,
      ),
      ex.kept,
    );
    assert.equal(ex.line36, ex.bought - ex.kept);
    assert.equal(
      sum(
        EXAMPLE_ITEMS.filter((i) => inY(i.sold)),
        cost,
      ),
      ex.soldAtCost,
    );
    assert.equal(
      sum(
        EXAMPLE_ITEMS.filter((i) => ["Donated", "Lost"].includes(i.status) && inY(i.removed)),
        cost,
      ),
      ex.writtenOff,
    );
    assert.equal(sum(EXAMPLE_ITEMS.filter(onHand(y1)), cost), ex.onHandDec31);
    assert.equal(
      Math.round(
        (ex.onHandJan1 + ex.bought - ex.kept - ex.soldAtCost - ex.writtenOff - ex.onHandDec31) *
          100,
      ),
      0,
    );
    const sold = EXAMPLE_ITEMS.filter((i) => inY(i.sold));
    assert.equal(sold.length, ex.itemsSold);
    assert.equal(
      sum(sold, (i) => Number(i.price)),
      ex.soldFor,
    );
    assert.equal(
      sum(sold, (i) => Number(i.fees ?? 0)),
      ex.fees,
    );
    assert.equal(
      sum(sold, (i) => Number(i.ship ?? 0)),
      ex.shipping,
    );
    assert.equal(
      Math.round((ex.soldFor - ex.fees - ex.shipping - ex.soldAtCost) * 100) / 100,
      ex.profit,
    );
    assert.throws(() => buildWorkbook({ items: [{ item: "x", bought: "11/2/2026" }] }), /ISO date/);
  });

  const soffice = spawnSync("soffice", ["--version"], { encoding: "utf8" }).status === 0;
  test("LibreOffice recalculates the example to the same figures, and its CSV is what the importer reads", {
    skip: !soffice && "soffice not installed",
  }, () => {
    const dir = mkdtempSync(join(tmpdir(), "inventory-sheet-"));
    try {
      writeFileSync(join(dir, EXAMPLE_FILE), OUTPUTS[EXAMPLE_FILE]());
      // Filter options: comma, double quote, UTF-8, from row 1, ..., -1 = every sheet to its own CSV.
      execFileSync(
        "soffice",
        [
          "--headless",
          `-env:UserInstallation=file://${dir}/profile`,
          "--convert-to",
          "csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,false,-1",
          "--outdir",
          dir,
          join(dir, EXAMPLE_FILE),
        ],
        { stdio: "ignore", timeout: 120_000 },
      );
      const csv = (sheet) =>
        readFileSync(
          join(
            dir,
            readdirSync(dir).find((f) => f.endsWith(`-${sheet}.csv`)),
          ),
          "utf8",
        );
      const value = (text, label) => {
        const line = text.split("\n").find((l) => l.replace(/^"/, "").startsWith(label));
        assert.ok(line, label);
        return Number(line.replace(/^"[^"]*"|^[^,]*/, "").split(",")[1]);
      };
      const ys = csv("Year summary");
      const ex = EXAMPLE_SUMMARY;
      assert.equal(value(ys, "On hand January 1"), ex.onHandJan1);
      assert.equal(value(ys, "Bought during the year"), ex.bought);
      assert.equal(value(ys, "Kept for yourself"), ex.kept);
      assert.equal(value(ys, "Purchases less items kept"), ex.line36);
      assert.equal(value(ys, "Sold during the year"), ex.soldAtCost);
      assert.equal(value(ys, "Donated, lost"), ex.writtenOff);
      assert.equal(value(ys, "Still in stock December 31"), ex.onHandDec31);
      assert.equal(value(ys, "Check: should be zero"), 0);
      assert.equal(value(ys, "Items sold"), ex.itemsSold);
      assert.equal(value(ys, "Profit on those sales"), ex.profit);
      const inv = csv("Inventory").split("\n");
      assert.equal(inv[0], COLUMNS.map((c) => c.header).join(","));
      // Dates come out as ISO text and empty rows as bare commas, which the importer reads or skips.
      assert.ok(inv[1].includes(",2025-11-08,"), inv[1]);
      assert.equal(inv[EXAMPLE_ITEMS.length + 1].replace(/,/g, ""), "");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
