// The ZIP writer behind the year-end package, read back with an independent reader (node:zlib's crc32 and
// the system `unzip` when it is installed) rather than with its own code.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32 as nodeCrc32 } from "node:zlib";
import { crc32, zip } from "@worker/lib/zip";
import { yearEndReadme } from "@worker/services/books/year-end";
import { describe, expect, it } from "vitest";

/** Reads a stored-only ZIP from its central directory. */
function readZip(buf: Uint8Array) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const eocd = buf.length - 22;
  expect(view.getUint32(eocd, true)).toBe(0x06054b50);
  const count = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  let p = view.getUint32(eocd + 16, true);
  expect(p + cdSize).toBe(eocd);
  const dec = new TextDecoder();
  const out: { name: string; data: Uint8Array; crc: number; flags: number }[] = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(p, true)).toBe(0x02014b50);
    const flags = view.getUint16(p + 8, true);
    const crc = view.getUint32(p + 16, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const localName = view.getUint16(local + 26, true);
    const start = local + 30 + localName + view.getUint16(local + 28, true);
    out.push({ name, data: buf.subarray(start, start + size), crc, flags });
    p += 46 + nameLen;
  }
  return out;
}

const hasUnzip = (() => {
  try {
    execFileSync("unzip", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe("zip", () => {
  it("computes the same CRC-32 as zlib", () => {
    for (const s of ["", "a", "123456789", "Café, naïve — 50 % off\r\n".repeat(40)]) {
      const b = new TextEncoder().encode(s);
      expect(crc32(b)).toBe(nodeCrc32(b));
    }
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("writes files that read back byte for byte, names in UTF-8", () => {
    const files = [
      { name: "README.txt", data: "hello\r\n" },
      { name: "café-2026.csv", data: "a,b\r\n1,2\r\n" },
      { name: "empty.csv", data: "" },
      { name: "bytes.bin", data: new Uint8Array([0, 255, 10, 13]) },
    ];
    const read = readZip(zip(files, new Date("2026-12-31T23:59:58Z")));
    expect(read.map((f) => f.name)).toEqual(files.map((f) => f.name));
    read.forEach((f, i) => {
      const src = files[i]?.data ?? "";
      const want = typeof src === "string" ? new TextEncoder().encode(src) : src;
      expect([...f.data]).toEqual([...want]);
      expect(f.crc).toBe(nodeCrc32(want));
      expect(f.flags & 0x0800).toBe(0x0800);
    });
  });

  it("an empty archive is just the end record", () => {
    const z = zip([]);
    expect(z.length).toBe(22);
    expect(readZip(z)).toEqual([]);
  });

  it("refuses unsafe and duplicate names", () => {
    for (const name of ["", "/etc/passwd", "../x.csv", "a/../../x", "a\\b.csv"]) {
      expect(() => zip([{ name, data: "x" }])).toThrow(/unsafe/);
    }
    expect(() =>
      zip([
        { name: "a.csv", data: "1" },
        { name: "a.csv", data: "2" },
      ]),
    ).toThrow(/duplicate/);
  });

  it.skipIf(!hasUnzip)("passes unzip's own integrity test", () => {
    const dir = mkdtempSync(join(tmpdir(), "zip-test-"));
    const path = join(dir, "t.zip");
    writeFileSync(
      path,
      zip([
        { name: "README.txt", data: "Year-end records\r\n" },
        { name: "sales-ledger-2026-01-01-to-2026-12-31.csv", data: "x,y\r\n".repeat(5000) },
      ]),
    );
    const test = execFileSync("unzip", ["-t", path], { encoding: "utf8" });
    expect(test).toMatch(/No errors detected/);
    const out = execFileSync("unzip", ["-p", path, "README.txt"], { encoding: "utf8" });
    expect(out).toBe("Year-end records\r\n");
    expect(readFileSync(path).length).toBeGreaterThan(25_000);
  });
});

describe("year-end README", () => {
  const base = {
    year: 2026,
    generatedAt: "2027-01-15T09:30:00.000Z",
    worksheet: {
      disclaimer: "Worksheet only: not a tax return and not tax advice.",
      lines: [
        { line: "1", label: "Gross receipts", amountCents: 1_234_567 },
        { line: "4", label: "Cost of goods sold", amountCents: 400_000 },
        { line: "28", label: "Total expenses", amountCents: 150_050 },
        { line: "31", label: "Net profit or (loss)", amountCents: -2_500 },
      ],
      partIII: [{ line: "41", label: "Inventory at end of year", amountCents: 98_765 }],
      warnings: ["3 orders have no item linked."],
      businessMiles: 412.5,
    },
    mileageRate: null,
    counts: {
      ledgerRows: 120,
      revenueCents: 1_234_567,
      inventoryItems: 40,
      inventoryCents: 98_765,
      trips: 22,
      miles: 412.5,
      line9Cents: 29_288,
      expenses: 31,
      expensesCents: 150_050,
    },
  };

  it("names every file, the headline figures and the warnings", () => {
    const t = yearEndReadme(base);
    expect(t).toContain("year-end records for 2026");
    expect(t).toContain("Built 2027-01-15 09:30 UTC");
    expect(t).toMatch(/Line 1 +Gross receipts +\$12,345\.67/);
    expect(t).toMatch(/Line 31 +Net profit or \(loss\) +\(\$25\.00\)/);
    expect(t).toMatch(/Line 41 +Inventory at end of year +\$987\.65/);
    expect(t).toMatch(/Line 44a +Business miles +412\.5/);
    for (const f of [
      "schedule-c-worksheet-2026.csv",
      "sales-ledger-2026-01-01-to-2026-12-31.csv",
      "closing-inventory-2026.csv",
      "mileage-log-2026.csv",
      "expenses-2026.csv",
      "quickbooks-journal-2026.csv",
    ]) {
      expect(t).toContain(f);
    }
    expect(t).toContain("line 9 $292.88");
    expect(t).toContain("in force on its date");
    expect(t).toContain("  - 3 orders have no item linked.");
    expect(t).toContain("not tax advice");
    expect(t.split("\r\n").length).toBeGreaterThan(20);
    expect(t.replace(/\r\n/g, "")).not.toMatch(/\n/);
  });

  it("says when one rate was typed in, and leaves out the warnings block when there are none", () => {
    const t = yearEndReadme({
      ...base,
      mileageRate: 70,
      worksheet: { ...base.worksheet, warnings: [] },
      counts: { ...base.counts, line9Cents: null },
    });
    expect(t).toContain("at 70 cents a mile");
    expect(t).toContain("no line 9 amount");
    expect(t).not.toContain("WARNINGS");
  });
});
