import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractExportedFunctionSource,
  resolveSqliteFallbackSource,
  throwsBeforeWrite,
} from "./lead-write-not-found-parity";

const REPO_ROOT = path.resolve(__dirname, "../../..");

describe("extractExportedFunctionSource", () => {
  it("extracts a function body up to the next top-level export", () => {
    const source = `export async function foo(a: string) {\n  return a;\n}\n\nexport async function bar() {\n  return "bar";\n}\n`;
    const fooSource = extractExportedFunctionSource(source, "foo");
    expect(fooSource).toContain("return a;");
    expect(fooSource).not.toContain('return "bar"');
  });

  it("extracts the remainder when the function is the last export", () => {
    const source = `export async function onlyOne() {\n  return 1;\n}\n`;
    expect(extractExportedFunctionSource(source, "onlyOne")).toContain("return 1;");
  });

  it("throws when the function is not present", () => {
    expect(() =>
      extractExportedFunctionSource("export const x = 1;", "missingFn"),
    ).toThrow(/Could not find/);
  });
});

describe("resolveSqliteFallbackSource", () => {
  it("returns the source unchanged when the function has no delegation", () => {
    const fnSource = `
      const existing = db.prepare("SELECT slug FROM leads WHERE slug = ?").get(slug);
      if (!existing) {
        throw new Error(\`Lead with slug \${slug} not found\`);
      }
      db.prepare("UPDATE leads SET status = ? WHERE slug = ?").run(stage, slug);
    `;
    expect(resolveSqliteFallbackSource(fnSource, "export function sqliteUnused() {}")).toBe(
      fnSource,
    );
  });

  it("follows a one-line delegation to the target function's source in sqlite-queries.ts", () => {
    const dbFnSource = `
      export async function updateLeadStage(slug, stage) {
        return sqliteUpdateLeadStage(getSqliteDb(), slug, stage);
      }
    `;
    const sqliteQueriesSource = `
      export function sqliteUpdateLeadStage(db, slug, stage) {
        const existing = db.prepare("SELECT slug FROM leads WHERE slug = ?").get(slug);
        if (!existing) {
          throw new Error(\`Lead with slug \${slug} not found\`);
        }
        db.prepare("UPDATE leads SET status = ? WHERE slug = ?").run(stage, slug);
      }
    `;
    const resolved = resolveSqliteFallbackSource(dbFnSource, sqliteQueriesSource);
    expect(resolved).toContain("if (!existing)");
    expect(throwsBeforeWrite(resolved)).toBe(true);
  });
});

describe("throwsBeforeWrite", () => {
  it("detects the existence-check-then-throw pattern", () => {
    const fnSource = `
      const existing = db.prepare("SELECT slug FROM leads WHERE slug = ?").get(slug);
      if (!existing) {
        throw new Error(\`Lead with slug \${slug} not found\`);
      }
      db.prepare("UPDATE leads SET status = ? WHERE slug = ?").run(stage, slug);
    `;
    expect(throwsBeforeWrite(fnSource)).toBe(true);
  });

  it("returns false for a bare write with no existence check", () => {
    const fnSource = `
      const stmt = db.prepare("UPDATE leads SET status = ? WHERE slug = ?");
      stmt.run(stage, slug);
    `;
    expect(throwsBeforeWrite(fnSource)).toBe(false);
  });
});

describe("db.ts lead-mutation not-found parity with convex/leads.ts (repo)", () => {
  const dbSource = readFileSync(path.join(REPO_ROOT, "src/lib/db.ts"), "utf8");
  const sqliteQueriesSource = readFileSync(
    path.join(REPO_ROOT, "src/lib/db/sqlite-queries.ts"),
    "utf8",
  );

  it("updateLeadStage's SQLite fallback throws on an unknown slug, matching convex/leads.ts updateStage", () => {
    // convex/leads.ts's updateStage throws `Lead with slug ${slug} not
    // found` on a miss (see convex/leads.ts:88-90) — a bare
    // `UPDATE ... WHERE slug = ?` matches zero rows and returns normally, so
    // this would previously pass on Convex and silently no-op on SQLite.
    // db.ts's fallback now delegates to sqliteUpdateLeadStage (pure code
    // move, see db-race-guard-sqlite-query-extraction) — follow that
    // delegation so this guard checks the real behavior, not db.ts's own
    // now-trivial one-line pass-through.
    const fnSource = resolveSqliteFallbackSource(
      extractExportedFunctionSource(dbSource, "updateLeadStage"),
      sqliteQueriesSource,
    );
    expect(throwsBeforeWrite(fnSource)).toBe(true);
  });

  it("recordLeadOutreach's SQLite fallback throws on an unknown slug, matching convex/leads.ts recordOutreach", () => {
    // convex/leads.ts's recordOutreach throws the same message on a miss
    // (see convex/leads.ts:203-205). Follows the sqliteRecordLeadOutreach
    // delegation, same rationale as updateLeadStage above.
    const fnSource = resolveSqliteFallbackSource(
      extractExportedFunctionSource(dbSource, "recordLeadOutreach"),
      sqliteQueriesSource,
    );
    expect(throwsBeforeWrite(fnSource)).toBe(true);
  });

  it("recordLeadPreviewOpen deliberately stays a silent no-op on both backends (not a parity violation)", () => {
    // Contrast case: recordPreviewOpen's convex twin also silently no-ops
    // (see convex/leads.ts:214-234, "no lead" is a documented normal case
    // for slug-inferred preview opens) — throwsBeforeWrite should be false
    // here, proving this guard distinguishes "should throw" from
    // "should no-op" rather than just demanding every function throw.
    const fnSource = extractExportedFunctionSource(dbSource, "recordLeadPreviewOpen");
    expect(throwsBeforeWrite(fnSource)).toBe(false);
  });
});
