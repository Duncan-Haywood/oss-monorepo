// The free Level 2 self-assessment workbook: its rows match the requirement data, its formulas agree
// with the SPRS calculator's score() (recalculated in LibreOffice where installed), and it is served
// with the page. The app-side test (apps/cmmc/test/unit/assessment-sheet-import.test.ts) reads it with
// the workspace's own importer.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { inflateRawSync } from "node:zlib";
import {
  buildWorkbook,
  COLUMNS,
  LAST,
  SHEET_FILE,
  SHEET_PATH,
  STATUSES,
  sheetRows,
} from "../src/assessment-sheet.mjs";
import { build } from "../src/build.mjs";
import { launchState } from "../src/launch.mjs";
import { FAMILIES, PARTIAL, REQUIREMENTS, SSP_ID, score } from "../src/sprs.mjs";

/** Entry name -> text, from the minimal zip the module writes (deflate, no data descriptors). */
function unzip(buf) {
  const out = {};
  let p = 0;
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const size = buf.readUInt32LE(p + 18);
    const nameLen = buf.readUInt16LE(p + 26);
    const extra = buf.readUInt16LE(p + 28);
    const name = buf.subarray(p + 30, p + 30 + nameLen).toString("utf8");
    const start = p + 30 + nameLen + extra;
    out[name] = inflateRawSync(buf.subarray(start, start + size)).toString("utf8");
    p = start + size;
  }
  return out;
}

test("one row per requirement, in the calculator's order, with its points", () => {
  const rows = sheetRows();
  assert.equal(rows.length, 110);
  assert.equal(LAST, 111);
  assert.deepEqual(
    rows.map((r) => [r.code, r.weight]),
    REQUIREMENTS.map((r) => [r.code, r.weight]),
  );
  const sheet = unzip(buildWorkbook())["xl/worksheets/sheet1.xml"];
  for (const r of rows) assert.ok(sheet.includes(`>${r.code}<`), r.code);
  // The status list offers exactly the phrases the Read me and the importer test name.
  assert.ok(sheet.includes(`<formula1>"${STATUSES.join(",")}"</formula1>`));
  // Partial credit is offered on the two requirements that have one, and nowhere else.
  const partialRows = rows.filter((r) => Object.hasOwn(PARTIAL, r.nistId));
  assert.equal(partialRows.length, 2);
  const col = String.fromCharCode(65 + COLUMNS.findIndex((c) => c.key === "partial"));
  assert.ok(sheet.includes(`sqref="${partialRows.map((r) => `${col}${r.row}`).join(" ")}"`));
});

test("headers: each imported field has the one header the importer's hints pick", () => {
  // Mirrors apps/cmmc csv-import.ts HEADER_HINTS; the app-side test checks the real thing.
  const hints = {
    status: /\b(status|met|implemented|compliance|result|assessment)\b/,
    owner: /\b(owner|responsible|assigned|poc)\b/,
    notes: /\b(notes?|comments?|remarks?|gaps?|findings?)\b/,
    statement:
      /\b(implementation (statement|description|details?|narrative)|how (it is )?(implemented|met)|statement|narrative|implementation)\b/,
  };
  const norm = (s) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  for (const [kind, re] of Object.entries(hints)) {
    const hits = COLUMNS.filter((c) => re.test(norm(c.header))).map((c) => c.key);
    assert.deepEqual(hits, [kind], `${kind}: ${hits}`);
  }
});

test("the build serves the workbook next to its page, in the sitemap and llms.txt", () => {
  const dir = mkdtempSync(join(tmpdir(), "cmmc-sheet-build-"));
  try {
    const files = build({ outDir: dir, launch: launchState() });
    assert.ok(Buffer.isBuffer(files[SHEET_FILE]));
    assert.equal(files[SHEET_FILE].readUInt32LE(0), 0x04034b50);
    const page = files[`${SHEET_PATH.slice(1)}.html`];
    assert.ok(page, "page built");
    const desc = page.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
    assert.ok(
      desc && desc.replaceAll("&amp;", "&").length <= 160,
      `description ${desc.length} chars`,
    );
    assert.ok(page.includes(`href="/cmmc/${SHEET_FILE}"`), "download link");
    assert.ok(page.includes("Import from a spreadsheet"));
    assert.ok(files["sitemap.xml"].includes(SHEET_PATH));
    assert.ok(files["llms.txt"].includes(SHEET_PATH));
    assert.ok(
      files["sprs-score-calculator.html"].includes(SHEET_PATH.slice(1)),
      "linked from the calculator",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Cases: NIST id -> { status, partial }; everything not listed is Met. */
const CASES = {
  "all-met": {},
  blank: null, // the published template: nothing filled in
  conditional: {
    "3.1.3": { status: "Not met" },
    "3.13.11": { status: "Partially met", partial: "Yes" },
    "3.4.9": { status: "Not applicable" },
  },
  "mfa-partial": {
    "3.5.3": { status: "Partially met", partial: "Yes" },
    "3.1.1": { status: "Not met" },
  },
  "no-ssp": { [SSP_ID]: { status: "Not met" }, "3.1.3": { status: "Not met" } },
  "below-88": Object.fromEntries(
    REQUIREMENTS.filter((r) => r.weight === 1)
      .slice(0, 25)
      .map((r) => [r.nistId, { status: "Not assessed" }]),
  ),
  "partial-without-credit": {
    "3.13.11": { status: "Partially met" },
    "3.3.1": { status: "Partially met", partial: "Yes" },
  },
};

function filledFor(spec) {
  if (spec === null) return {};
  return Object.fromEntries(
    REQUIREMENTS.map((r) => [
      r.nistId,
      Object.hasOwn(spec, r.nistId) ? spec[r.nistId] : { status: "Met" },
    ]),
  );
}

function expected(filled) {
  const open = REQUIREMENTS.filter((r) => {
    const s = filled[r.nistId]?.status;
    return s !== "Met" && s !== "Not applicable";
  }).map((r) => r.nistId);
  const partial = open.filter(
    (id) =>
      Object.hasOwn(PARTIAL, id) &&
      filled[id]?.status === "Partially met" &&
      filled[id]?.partial === "Yes",
  );
  const r = score({ notMet: new Set(open), partial: new Set(partial) });
  const status = !r.ssp
    ? "None yet"
    : r.allMet
      ? "Final Level 2 (Self)"
      : r.conditional.meets
        ? "Conditional Level 2 (Self)"
        : "Neither yet";
  return { r, status };
}

const soffice = spawnSync("soffice", ["--version"], { encoding: "utf8" }).status === 0;
test("LibreOffice recalculates every case to the calculator's score and status", {
  skip: !soffice && "soffice not installed",
}, () => {
  const dir = mkdtempSync(join(tmpdir(), "cmmc-sheet-"));
  try {
    const names = Object.keys(CASES).map((k) => {
      writeFileSync(join(dir, `${k}.xlsx`), buildWorkbook({ filled: filledFor(CASES[k]) }));
      return join(dir, `${k}.xlsx`);
    });
    // comma, double quote, UTF-8, from row 1, ..., -1 = every sheet to its own CSV.
    execFileSync(
      "soffice",
      [
        "--headless",
        `-env:UserInstallation=file://${dir}/profile`,
        "--convert-to",
        "csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,false,-1",
        "--outdir",
        dir,
        ...names,
      ],
      { stdio: "ignore", timeout: 180_000 },
    );
    const files = readdirSync(dir);
    for (const k of Object.keys(CASES)) {
      const text = readFileSync(
        join(
          dir,
          files.find((f) => f === `${k}-Score.csv`),
        ),
        "utf8",
      );
      const value = (label) => {
        const line = text.split("\n").find((l) => l.replace(/^"/, "").startsWith(label));
        assert.ok(line, `${k}: ${label}`);
        return line
          .slice(line.indexOf(label) + label.length)
          .replace(/^"?,"?/, "")
          .replace(/"?\s*$/, "");
      };
      const { r, status } = expected(filledFor(CASES[k]));
      const got = value("SPRS score (out of 110)");
      if (r.score === null) assert.match(got, /^No score/, k);
      else assert.equal(Number(got), r.score, k);
      assert.ok(
        value("Status this would support").startsWith(status),
        `${k}: ${value("Status this would support")} vs ${status}`,
      );
      for (const [, code, name] of FAMILIES) {
        const fam = r.byFamily.find((f) => f.code === code);
        assert.equal(Number(value(`${name} (${code})`)), fam ? fam.points : 0, `${k} ${code}`);
      }
      const header = readFileSync(join(dir, `${k}-Assessment.csv`), "utf8").split("\n")[0];
      assert.equal(header, COLUMNS.map((c) => c.header).join(","));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
