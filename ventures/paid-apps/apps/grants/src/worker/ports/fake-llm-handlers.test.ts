// Every LLM `purpose` used by the services must have a FakeLlm handler, so tests and the offline demo
// (FAKE_EXTERNALS=true) never hit "no handler".
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { allFakeHandlers } from "./fake-llm-handlers";

const ROOT = join(import.meta.dirname, "..");
const SCAN = ["services", "workflows"].map((d) => join(ROOT, d));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return e.name.endsWith(".ts") && !e.name.endsWith(".test.ts") ? [p] : [];
  });
}

/** `purpose: "a.b"` literals and `const X_PURPOSE = "a.b"` / `const PURPOSE_X = "a.b"` constants. */
const PATTERNS = [
  /\bpurpose:\s*["']([a-z0-9_]+\.[a-z0-9_.]+)["']/g,
  /\bconst\s+\w*PURPOSE\w*\s*=\s*["']([a-z0-9_]+\.[a-z0-9_.]+)["']/g,
];

function usedPurposes(): Map<string, string> {
  const out = new Map<string, string>();
  for (const file of SCAN.flatMap(sourceFiles)) {
    const text = readFileSync(file, "utf8");
    for (const re of PATTERNS) {
      for (const m of text.matchAll(re)) if (m[1]) out.set(m[1], relative(ROOT, file));
    }
  }
  return out;
}

describe("fake LLM handler coverage", () => {
  it("registers a FakeLlm handler for every purpose used in the services", () => {
    const used = usedPurposes();
    expect(used.size).toBeGreaterThanOrEqual(11);
    const missing = [...used]
      .filter(([p]) => !(p in allFakeHandlers))
      .map(([p, f]) => `${p} (${f})`);
    expect(missing).toEqual([]);
  });
});
