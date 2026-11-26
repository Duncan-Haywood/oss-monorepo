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

  it.each(LEGAL_DOC_KEYS)("%s has title, version line and counsel-review note", (key) => {
    const doc = LEGAL_DOCUMENTS[key];
    expect(doc.title).toBe(LEGAL_DOC_TITLES[key]);
    expect(doc.markdown.startsWith(`# ${doc.title}\n`)).toBe(true);
    expect(doc.markdown).toContain("Have counsel review it before launch");
    expect(doc.updatedAt <= POLICY_VERSION).toBe(true);
  });

  it("terms put the figures and the forms on the contractor, and disclaim AIA and legal advice", () => {
    const t = LEGAL_DOCUMENTS.terms.markdown;
    for (const phrase of [
      "You are the one billing",
      "Not an AIA document",
      "not endorsed by the American Institute of Architects",
      "Lien waivers are not legal advice",
      "No legal, tax or accounting advice",
      "merchant of record",
      "You own your content",
      "12 months",
      "New Mexico",
    ]) {
      expect(t).toContain(phrase);
    }
  });

  it("privacy names every subprocessor the app uses and says the SOV file stays in the browser", () => {
    const p = LEGAL_DOCUMENTS.privacy.markdown;
    expect(p).toContain("Cloudflare, Inc.");
    expect(p).toContain("Paddle");
    expect(p).toContain("never uploaded");
    // PayApps has no LLM port: the policy must not list an AI provider it does not use.
    expect(p).not.toMatch(/Anthropic|OpenAI/);
    expect(p).toContain("does not send your data to any AI model provider");
  });
});
