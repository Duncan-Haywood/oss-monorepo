import test from "node:test";
import assert from "node:assert/strict";

import { parseXml, parseCoverage, compareCoverage, summarizeCompare } from "./compare.mjs";

function cobertura({ covered, valid, files }) {
  const classXml = files
    .map(({ filename, lines }) => {
      const body = lines
        .map(({ number, hits }) => `<line number="${number}" hits="${hits}"/>`)
        .join("");
      return `<class name="${filename}" filename="${filename}"><lines>${body}</lines></class>`;
    })
    .join("");
  return `<?xml version="1.0"?>
<coverage line-rate="${valid ? covered / valid : 0}" lines-covered="${covered}" lines-valid="${valid}">
  <packages><package name="p"><classes>${classXml}</classes></package></packages>
</coverage>`;
}

function jacoco({ covered, valid, files }) {
  const pkgs = new Map();
  for (const file of files) {
    const slash = file.filename.lastIndexOf("/");
    const pkg = slash === -1 ? "" : file.filename.slice(0, slash);
    const name = slash === -1 ? file.filename : file.filename.slice(slash + 1);
    if (!pkgs.has(pkg)) pkgs.set(pkg, []);
    const lines = (file.lines || [])
      .map(({ number, ci }) => `<line nr="${number}" mi="${ci ? 0 : 1}" ci="${ci}"/>`)
      .join("");
    const missed = file.valid - file.covered;
    pkgs.get(pkg).push(
      `<sourcefile name="${name}">${lines}<counter type="LINE" missed="${missed}" covered="${file.covered}"/></sourcefile>`,
    );
  }
  const packageXml = [...pkgs.entries()]
    .map(([name, srcs]) => `<package name="${name}">${srcs.join("")}</package>`)
    .join("");
  const missed = valid - covered;
  return `<?xml version="1.0"?>
<report name="suite">${packageXml}<counter type="LINE" missed="${missed}" covered="${covered}"/></report>`;
}

test("parseXml throws a plain error on non-XML input", () => {
  assert.throws(() => parseXml("not xml at all"), /Cobertura or JaCoCo/);
});

test("parseCoverage reads Cobertura overall and per-file rates", () => {
  const report = parseCoverage(
    cobertura({
      covered: 3,
      valid: 4,
      files: [
        { filename: "a.py", lines: [{ number: 1, hits: 1 }, { number: 2, hits: 1 }] },
        { filename: "b.py", lines: [{ number: 1, hits: 1 }, { number: 2, hits: 0 }] },
      ],
    }),
  );
  assert.equal(report.format, "cobertura");
  assert.equal(report.covered, 3);
  assert.equal(report.valid, 4);
  assert.equal(report.lineRate, 0.75);
  assert.equal(report.files["a.py"].lineRate, 1);
  assert.equal(report.files["b.py"].lineRate, 0.5);
});

test("parseCoverage reads JaCoCo LINE counters and package paths", () => {
  const report = parseCoverage(
    jacoco({
      covered: 5,
      valid: 10,
      files: [{ filename: "com/example/Foo.java", covered: 5, valid: 10, lines: [] }],
    }),
  );
  assert.equal(report.format, "jacoco");
  assert.equal(report.lineRate, 0.5);
  assert.equal(report.files["com/example/Foo.java"].covered, 5);
  assert.equal(report.files["com/example/Foo.java"].valid, 10);
});

test("a drop from 90% to 70% is flagged even though both are 'above 60'", () => {
  const baseline = cobertura({
    covered: 9,
    valid: 10,
    files: [{ filename: "app.py", lines: Array.from({ length: 10 }, (_, i) => ({ number: i + 1, hits: i === 9 ? 0 : 1 })) }],
  });
  const current = cobertura({
    covered: 7,
    valid: 10,
    files: [{ filename: "app.py", lines: Array.from({ length: 10 }, (_, i) => ({ number: i + 1, hits: i < 7 ? 1 : 0 })) }],
  });
  const result = compareCoverage(baseline, current);
  assert.equal(result.overallDropped, true);
  assert.ok(result.dropPct > 19 && result.dropPct < 21);
  assert.equal(result.droppedFiles[0].filename, "app.py");
  assert.equal(summarizeCompare(result).status, "dropped");
});

test("--max-drop allows a small drop and still fails a large one", () => {
  const baseline = cobertura({
    covered: 10,
    valid: 10,
    files: [{ filename: "app.py", lines: [{ number: 1, hits: 1 }] }],
  });
  const current = cobertura({
    covered: 9,
    valid: 10,
    files: [{ filename: "app.py", lines: [{ number: 1, hits: 1 }] }],
  });
  const within = compareCoverage(baseline, current, { maxDropPct: 15 });
  assert.equal(within.overallDropped, false);
  const past = compareCoverage(baseline, current, { maxDropPct: 0 });
  assert.equal(past.overallDropped, true);
});

test("an improvement is not a drop", () => {
  const baseline = cobertura({
    covered: 1,
    valid: 2,
    files: [{ filename: "a.py", lines: [{ number: 1, hits: 1 }, { number: 2, hits: 0 }] }],
  });
  const current = cobertura({
    covered: 2,
    valid: 2,
    files: [{ filename: "a.py", lines: [{ number: 1, hits: 1 }, { number: 2, hits: 1 }] }],
  });
  const result = compareCoverage(baseline, current);
  assert.equal(result.overallDropped, false);
  assert.ok(result.dropPct < 0);
  assert.equal(result.improvedFiles[0].filename, "a.py");
  assert.equal(summarizeCompare(result).status, "improved");
});

test("new and removed files are listed separately from drops", () => {
  const baseline = cobertura({
    covered: 1,
    valid: 1,
    files: [{ filename: "old.py", lines: [{ number: 1, hits: 1 }] }],
  });
  const current = cobertura({
    covered: 1,
    valid: 1,
    files: [{ filename: "new.py", lines: [{ number: 1, hits: 1 }] }],
  });
  const result = compareCoverage(baseline, current);
  assert.equal(result.newFiles[0].filename, "new.py");
  assert.equal(result.removedFiles[0].filename, "old.py");
  assert.equal(result.droppedFiles.length, 0);
});

test("invalid XML is labelled so the visitor knows which paste failed", () => {
  const good = cobertura({
    covered: 1,
    valid: 1,
    files: [{ filename: "a.py", lines: [{ number: 1, hits: 1 }] }],
  });
  assert.throws(() => compareCoverage("not xml", good), /XML tags|coverage root|not xml/i);
});

test("unchanged coverage summarises as ok", () => {
  const xml = cobertura({
    covered: 2,
    valid: 2,
    files: [{ filename: "a.py", lines: [{ number: 1, hits: 1 }, { number: 2, hits: 1 }] }],
  });
  const result = compareCoverage(xml, xml);
  assert.equal(result.overallDropped, false);
  assert.equal(summarizeCompare(result).status, "ok");
  assert.match(summarizeCompare(result).text, /unchanged/);
});
