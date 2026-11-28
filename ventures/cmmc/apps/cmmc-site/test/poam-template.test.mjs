// The free POA&M template: its worked-out columns agree with poam-rules.mjs (every one of the 110
// requirements, recalculated in LibreOffice where installed), the Summary sheet's points, score and
// verdict follow 32 CFR 170.21, and it is served with its page. The app-side test
// (apps/cmmc/test/unit/poam-template-import.test.ts) reads it with the workspace's own importer.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { build } from "../src/build.mjs";
import { launchState } from "../src/launch.mjs";
import { poamVerdict } from "../src/poam-rules.mjs";
import {
  buildPoamWorkbook,
  CHECK_TEXT,
  COLUMNS,
  excelDate,
  ITEM_ROWS,
  RULE_TEXT,
  ruleLines,
  TEMPLATE_FILE,
  TEMPLATE_PATH,
} from "../src/poam-template.mjs";
import { REQUIREMENTS } from "../src/sprs.mjs";

const BY_ID = new Map(REQUIREMENTS.map((r) => [r.nistId, r]));

test("headers: each imported field has exactly the one header the POA&M importer's hints pick", () => {
  // Mirrors apps/cmmc poam-import.ts HEADER_HINTS, tried in its order, each taking the first free
  // column; the app-side test checks the real thing.
  const hints = [
    ["status", /\bstatus\b/],
    ["milestones", /\bmilestones?\b/],
    [
      "due",
      /\b(scheduled completion|completion date|planned completion|estimated completion|target (completion )?date|due date|deadline|completion|due)\b/,
    ],
    [
      "remediation",
      /\b(remediation|corrective actions?|planned actions?|action plan|mitigation|resolution|recommendation|actions?)\b/,
    ],
    ["responsible", /\b(responsible|owner|poc|point of contact|assigned( to)?)\b/],
    [
      "weakness",
      /\b(weakness(es)?|deficienc(y|ies)|findings?|gaps?|vulnerabilit(y|ies)|issues?|description|observations?)\b/,
    ],
  ];
  const norm = (s) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  for (const [kind, re] of hints) {
    const hits = COLUMNS.filter((c) => re.test(norm(c.header))).map((c) => c.key);
    assert.deepEqual(hits, [kind], `${kind}: ${hits}`);
  }
});

test("the Rules sheet lists match poamVerdict and no cell there starts with a requirement id", () => {
  const lines = Object.fromEntries(ruleLines().map(([l, v]) => [l, v]));
  const list = (label) => String(lines[label]).split("|").filter(Boolean);
  assert.equal(list("All 110 NIST SP 800-171 Rev. 2 requirements").length, 110);
  const yes = REQUIREMENTS.filter((r) => poamVerdict(r).status === "yes").map((r) => r.nistId);
  assert.deepEqual(list("May go on a POA&M (1 point, not excluded)"), yes);
  assert.deepEqual(list("Only on partial credit, counting 3 points"), ["3.13.11"]);
  assert.equal(list("Never on a POA&M (32 CFR 170.21(a)(2)(iii))").length, 6);
  for (const [label, v] of ruleLines()) {
    assert.doesNotMatch(String(label), /^\s*(3\.\d|[A-Z]{2}\.L)/);
    assert.doesNotMatch(String(v), /^\s*(3\.\d|[A-Z]{2}\.L)/);
  }
});

test("the build serves the workbook next to its page, in the sitemap and llms.txt", () => {
  const dir = mkdtempSync(join(tmpdir(), "cmmc-poam-build-"));
  try {
    const files = build({ outDir: dir, launch: launchState() });
    assert.ok(Buffer.isBuffer(files[TEMPLATE_FILE]));
    assert.equal(files[TEMPLATE_FILE].readUInt32LE(0), 0x04034b50);
    const page = files[`${TEMPLATE_PATH.slice(1)}.html`];
    assert.ok(page, "page built");
    const desc = page.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
    assert.ok(
      desc && desc.replaceAll("&amp;", "&").length <= 160,
      `description ${desc.length} chars`,
    );
    assert.ok(page.includes(`href="/cmmc/${TEMPLATE_FILE}"`), "download link");
    assert.ok(page.includes("Import spreadsheet"));
    assert.ok(files["sitemap.xml"].includes(TEMPLATE_PATH));
    assert.ok(files["llms.txt"].includes(TEMPLATE_PATH));
    assert.ok(
      files["cmmc-poam-eligible-requirements.html"].includes(TEMPLATE_PATH.slice(1)),
      "linked from the POA&M rules page",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const item = (id, extra = {}) => ({
  id,
  weakness: `Gap in ${id}`,
  remediation: "Fix it",
  responsible: "it@example.com",
  due: excelDate("2026-12-31"),
  status: "Open",
  ...extra,
});
const STATUS_DATE = excelDate("2026-08-01"); // close-out 2027-01-28

/** name -> { items, statusDate, want: Summary expectations (null to skip) } */
const CASES = {
  blank: { items: [], want: { items: 0, open: 0, points: 0, score: 110, notAllowed: 0 } },
  // Every requirement, by its CMMC id in one half and its bare NIST number in the other, so each
  // row's Points and On a POA&M? are checked against poamVerdict for all 110.
  "every-id-a": {
    items: REQUIREMENTS.slice(0, 55).map((r) => item(r.code)),
    want: null,
  },
  "every-id-b": {
    items: REQUIREMENTS.slice(55).map((r) => item(r.nistId)),
    want: null,
  },
  conditional: {
    statusDate: STATUS_DATE,
    items: [
      item("AC.L2-3.1.10"),
      item("3.13.11"),
      item("3.1.1", { status: "Closed" }), // closed: not counted
      item("3.4.9", { due: excelDate("2027-02-15") }), // after the close-out
    ],
    want: {
      items: 4,
      open: 3,
      points: 5,
      score: 105,
      notAllowed: 0,
      late: 1,
      verdict: "Conditional",
    },
  },
  "must-be-met": {
    items: [item("3.1.1"), item("3.10.3"), item("3.99.1"), item("3.1.10", { status: "" })],
    want: {
      items: 4,
      open: 4,
      points: 7,
      score: 103,
      notAllowed: 3,
      verdict: "Not a conditional status: close",
    },
  },
  "below-88": {
    items: REQUIREMENTS.filter((r) => poamVerdict(r).status === "yes")
      .slice(0, 23)
      .map((r) => item(r.code)),
    want: {
      open: 23,
      points: 23,
      score: 87,
      notAllowed: 0,
      verdict: "Not a conditional status: the open",
    },
  },
  "nothing-open": {
    items: [item("3.1.10", { status: "Closed" })],
    want: { items: 1, open: 0, points: 0, score: 110, verdict: "Nothing open" },
  },
};

const soffice = spawnSync("soffice", ["--version"], { encoding: "utf8" }).status === 0;
test("LibreOffice recalculates every row and the Summary to the rules", {
  skip: !soffice && "soffice not installed",
}, () => {
  for (const c of Object.values(CASES)) assert.ok(c.items.length <= ITEM_ROWS);
  const dir = mkdtempSync(join(tmpdir(), "cmmc-poam-"));
  try {
    const names = Object.entries(CASES).map(([k, c]) => {
      const p = join(dir, `${k}.xlsx`);
      writeFileSync(p, buildPoamWorkbook({ items: c.items, statusDate: c.statusDate ?? null }));
      return p;
    });
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
    const read = (k, sheet) => {
      const f = files.find((x) => x === `${k}-${sheet}.csv`);
      assert.ok(f, `${k}-${sheet}.csv in ${files.join(" ")}`);
      return readFileSync(join(dir, f), "utf8");
    };
    const col = (key) => COLUMNS.findIndex((c) => c.key === key);
    const parse = (line) => {
      const out = [];
      let cur = "";
      let q = false;
      for (const ch of line) {
        if (q) {
          if (ch === '"') q = false;
          else cur += ch;
        } else if (ch === '"') q = true;
        else if (ch === ",") {
          out.push(cur);
          cur = "";
        } else cur += ch;
      }
      out.push(cur);
      return out;
    };
    for (const [k, c] of Object.entries(CASES)) {
      const lines = read(k, "POA&M").split("\n").filter(Boolean).map(parse);
      assert.deepEqual(
        lines[0],
        COLUMNS.map((x) => x.header),
        `${k} header`,
      );
      c.items.forEach((it, i) => {
        const cells = lines[i + 1] ?? [];
        const nist = it.id.includes("-") ? it.id.split("-")[1] : it.id;
        const r = BY_ID.get(nist);
        const v = r ? poamVerdict(r).status : "unknown";
        assert.equal(cells[col("rule")], RULE_TEXT[v], `${k} ${it.id} rule`);
        if (r) {
          const pts = v === "partial" ? 3 : r.weight;
          assert.equal(Number(cells[col("points")]), pts, `${k} ${it.id} points`);
        }
        const check = cells[col("check")] ?? "";
        if (v !== "yes" && v !== "partial")
          assert.equal(check, CHECK_TEXT.notAllowed, `${k} ${it.id}`);
      });
      // blank rows stay blank in every worked-out column
      const blank = lines.slice(c.items.length + 1);
      for (const cells of blank)
        assert.ok(
          cells.every((x) => x === ""),
          `${k}: ${cells}`,
        );
      if (!c.want) continue;
      const sum = read(k, "Summary").split("\n").map(parse);
      const val = (label) => {
        const row = sum.find((r) => r[0] === label);
        assert.ok(row, `${k}: ${label}`);
        return row[1];
      };
      const w = c.want;
      if ("items" in w) assert.equal(Number(val("Items on the POA&M")), w.items, `${k} items`);
      assert.equal(Number(val("Open items")), w.open, `${k} open`);
      assert.equal(Number(val("Points the open items cost")), w.points, `${k} points`);
      assert.equal(
        Number(val("Score with these open and every other requirement met")),
        w.score,
        `${k} score`,
      );
      if ("notAllowed" in w)
        assert.equal(
          Number(val("Open items not allowed on a POA&M")),
          w.notAllowed,
          `${k} not allowed`,
        );
      if ("late" in w)
        assert.equal(
          Number(val("Open items due after the close-out deadline")),
          w.late,
          `${k} late`,
        );
      if (w.verdict) {
        const got = val("What the POA&M allows");
        assert.ok(got.startsWith(w.verdict), `${k}: ${got}`);
      }
      if (c.statusDate)
        assert.match(val("Close-out deadline (180 days later)"), /2027|01\/28\/27|1\/28/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
