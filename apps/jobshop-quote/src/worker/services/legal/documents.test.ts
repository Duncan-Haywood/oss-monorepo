import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LEGAL_DOC_KEYS, LEGAL_DOC_TITLES, POLICY_VERSION } from "@shared/legal";
import { describe, expect, it } from "vitest";
import { LEGAL_DOCUMENTS } from "./documents";

const docsDir = join(dirname(fileURLToPath(import.meta.url)), "../../../../docs/legal");

describe("bundled legal documents", () => {
  it.each(LEGAL_DOC_KEYS)(
    "%s matches docs/legal (run `node docs/legal/sync-documents.mjs`)",
    (key) => {
      const md = readFileSync(join(docsDir, `${key}.md`), "utf8");
      expect(LEGAL_DOCUMENTS[key].markdown).toBe(md);
    },
  );

  it.each(LEGAL_DOC_KEYS)(
    "%s has title and version line, and no 'draft until counsel' banner (owner, 2026-11-26)",
    (key) => {
      const doc = LEGAL_DOCUMENTS[key];
      expect(doc.title).toBe(LEGAL_DOC_TITLES[key]);
      expect(doc.markdown.startsWith(`# ${doc.title}\n`)).toBe(true);
      expect(doc.markdown).not.toContain("Have counsel review it before launch");
      expect(doc.updatedAt <= POLICY_VERSION).toBe(true);
      // Copied from PayApps: none of its product wording may survive the port.
      expect(doc.markdown).not.toMatch(/PayApps|pay application|lien waiver|AIA/);
    },
  );

  it("terms put the prices and the AI's reading on the shop, and disclaim advice", () => {
    const t = LEGAL_DOCUMENTS.terms.markdown;
    for (const phrase of [
      "You are the one quoting",
      "rate card **you enter**",
      "AI suggestions are suggestions",
      "only after one of your people confirms it",
      "No engineering, legal, tax or accounting advice",
      "ITAR",
      "merchant of record",
      "You own your content",
      "12 months",
      "New Mexico",
    ]) {
      expect(t).toContain(phrase);
    }
  });

  it("privacy names every subprocessor the app sends data to, and what the AI sees", () => {
    const p = LEGAL_DOCUMENTS.privacy.markdown;
    expect(p).toContain("Cloudflare, Inc.");
    expect(p).toContain("Workers AI"); // ports/converter.ts reads PDFs and images
    expect(p).toContain("Anthropic, PBC"); // ports/anthropic-llm.ts
    expect(p).toContain("Paddle");
    expect(p).toContain("never your rates, costs or markups"); // shared/cover-note.ts facts
    expect(p).toContain("not sent to the AI model until someone in your shop asks"); // services/inbound
    expect(p).toContain('"Extract with AI"'); // the button's label in routes/rfq-detail.tsx
  });
});
