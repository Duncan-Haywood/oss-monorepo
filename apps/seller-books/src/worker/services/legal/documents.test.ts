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
      expect(doc.markdown).toContain("Seller Books");
      expect(doc.markdown).not.toContain("Have counsel review it before launch");
      expect(doc.updatedAt <= POLICY_VERSION).toBe(true);
      // Adapted from Job Shop Quote: none of its product wording may survive the port.
      expect(doc.markdown).not.toMatch(/Job Shop Quote|RFQ|rate card|estimator|ITAR|drawing/);
    },
  );

  it("terms say the worksheet is not a return, fees come from reports, and disclaim advice", () => {
    const t = LEGAL_DOCUMENTS.terms.markdown;
    for (const phrase of [
      "The Schedule C worksheet is not a tax return",
      "never estimates a fee from a published rate", // CLAUDE.md: fees only from report columns
      "Cost of goods is what you enter",
      "No tax, legal, accounting or financial advice",
      "not affiliated with",
      "merchant of record",
      "You own your content",
      "12 months",
      "New Mexico",
    ]) {
      expect(t).toContain(phrase);
    }
  });

  it("privacy matches what the app stores and who it sends data to", () => {
    const p = LEGAL_DOCUMENTS.privacy.markdown;
    expect(p).toContain("Cloudflare, Inc.");
    expect(p).toContain("Paddle");
    // No LLM port exists in src/worker/ports; if one is added, this policy must name the provider.
    expect(p).toContain("No AI model reads your books");
    expect(p).not.toContain("Anthropic");
    // import_batch keeps file_name + sha256 only, never the file.
    expect(p).toContain("The file itself is not kept");
    // Account email goes through Cloudflare Email Service (ports/email.ts, docs/EMAIL.md); nothing else.
    expect(p).toContain("sending account emails");
    expect(p).toContain("We do not send marketing email from the app");
  });
});
