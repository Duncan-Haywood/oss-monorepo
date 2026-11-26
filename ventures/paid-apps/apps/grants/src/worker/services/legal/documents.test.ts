import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LEGAL_DOC_KEYS, LEGAL_DOC_TITLES, POLICY_VERSION } from "@shared/legal";
import { describe, expect, it } from "vitest";
import { LEGAL_DOCUMENTS } from "./documents";
import { getLegalDoc, listLegalDocs } from "./index";

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
    expect(doc.markdown).toContain("Mary Stella Labs, LLC");
    expect(doc.updatedAt <= POLICY_VERSION).toBe(true);
  });

  it("terms cover the required commercial points", () => {
    const t = LEGAL_DOCUMENTS.terms.markdown;
    for (const phrase of [
      "merchant of record",
      "30-day money-back guarantee",
      "No permanent free tier",
      "Promo codes",
      "you are the applicant",
      "Autopilot is opt-in",
      "Anthropic's Claude",
      "You own your content",
      "12 months",
      "State of New Mexico",
    ]) {
      expect(t.toLowerCase()).toContain(phrase.toLowerCase());
    }
  });

  it("privacy + data-use state no training and no cross-org sharing", () => {
    expect(LEGAL_DOCUMENTS.privacy.markdown).toContain("not used to train");
    expect(LEGAL_DOCUMENTS.privacy.markdown).toContain("Cloudflare");
    expect(LEGAL_DOCUMENTS.privacy.markdown).toContain("Anthropic");
    expect(LEGAL_DOCUMENTS["data-use"].markdown).toContain("Never shared across organizations");
    expect(LEGAL_DOCUMENTS["data-use"].markdown).toContain("Never used to train AI models");
    expect(LEGAL_DOCUMENTS["data-use"].markdown).toContain("excluded from drafting");
  });

  it("service returns every document with the current policy version", () => {
    const list = listLegalDocs();
    expect(list.map((d) => d.key)).toEqual([...LEGAL_DOC_KEYS]);
    expect(list.every((d) => d.version === POLICY_VERSION)).toBe(true);
    expect(getLegalDoc("refunds").markdown).toContain("30 days");
  });
});
