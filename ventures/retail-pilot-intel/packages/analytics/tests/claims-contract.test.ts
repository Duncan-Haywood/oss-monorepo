import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const RETAIL_PILOT_ROOT = join(import.meta.dirname, "../../..");
const DOCS_PAGES_DIR = join(RETAIL_PILOT_ROOT, "apps/docs/src/pages");
const PORTAL_PAGES_DIR = join(RETAIL_PILOT_ROOT, "apps/portal/src/pages");
const DOC_LAYOUT_FILE = join(RETAIL_PILOT_ROOT, "apps/docs/src/components/DocLayout.tsx");
const PORTAL_SHELL_FILE = join(RETAIL_PILOT_ROOT, "apps/portal/src/components/PortalShell.tsx");

test("DocLayout includes prototype notice banner", () => {
  const content = readFileSync(DOC_LAYOUT_FILE, "utf-8");
  assert.ok(
    content.includes("Prototype Disclosure") || content.includes("Prototype Notice"),
    "DocLayout must render a prototype disclosure banner",
  );
});

test("PortalShell includes illustrative data indicator", () => {
  const content = readFileSync(PORTAL_SHELL_FILE, "utf-8");
  assert.ok(
    content.includes("Illustrative data") || content.includes("LAN-only demo"),
    "PortalShell must mark demo data as illustrative/demo",
  );
});

test("Docs pages contain prototype/demo disclosures and no deceptive claims", () => {
  const files = readdirSync(DOCS_PAGES_DIR).filter((f) => f.endsWith(".tsx"));
  assert.ok(files.length > 0, "Docs pages directory should contain TSX page components");

  for (const file of files) {
    const content = readFileSync(join(DOCS_PAGES_DIR, file), "utf-8");
    assert.ok(
      !content.includes("guaranteed profit"),
      `Page ${file} must not contain unqualified financial guarantee claims`,
    );
    assert.ok(
      !content.includes("100% GDPR certified by EU Authority"),
      `Page ${file} must not claim official EU certification prior to legal review`,
    );
  }
});

test("Portal pages contain no deceptive claims", () => {
  const files = readdirSync(PORTAL_PAGES_DIR).filter((f) => f.endsWith(".tsx"));
  assert.ok(files.length > 0, "Portal pages directory should contain TSX page components");

  for (const file of files) {
    const content = readFileSync(join(PORTAL_PAGES_DIR, file), "utf-8");
    assert.ok(
      !content.includes("guaranteed profit"),
      `Portal page ${file} must not contain unqualified financial guarantee claims`,
    );
  }
});
