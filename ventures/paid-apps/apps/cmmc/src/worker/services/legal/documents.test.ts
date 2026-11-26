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
    // Ported from Job Shop Quote and PayApps: none of their product wording may survive.
    expect(doc.markdown).not.toMatch(
      /PayApps|Job Shop Quote|pay application|lien waiver|RFQ|rate card/,
    );
  });

  it("terms say plainly it is not a certification and not a CUI enclave, and disclaim advice", () => {
    const t = LEGAL_DOCUMENTS.terms.markdown;
    for (const phrase of [
      "Not a certification",
      "not a CMMC Third-Party Assessment Organization (C3PAO)",
      "not affiliated with or endorsed by the Department of Defense",
      "You make the self-assessment",
      "never submits anything to SPRS",
      "AI drafts are drafts",
      "only accepted statements reach the SSP",
      "No legal, compliance or security advice",
      "not a CUI enclave",
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
    expect(p).toContain("Anthropic, PBC"); // ports/anthropic-llm.ts
    expect(p).toContain("Paddle");
    expect(p).toContain('"Draft with AI"'); // the button's label in client/views/Controls.tsx
    // services/drafting/prompts.ts buildDraftContext sends evidence titles only.
    expect(p).toContain("We never send the contents of your evidence files");
    // ports/email.ts sends account mail (services/auth/emails.ts) and the affirmation reminder
    // (services/affirmations/reminders.ts, docs/EMAIL.md), which has a one-click stop link.
    expect(p).toContain("The Service sends account email:");
    expect(p).toContain("a reminder 60 and 7 days before an affirmation");
    expect(p).toContain("one-click link to stop it");
    expect(p).toContain("sending account email");
    expect(p).not.toContain("does not send email today");
  });

  it("the acceptable use policy forbids presenting output as a certification", () => {
    const a = LEGAL_DOCUMENTS["acceptable-use"].markdown;
    expect(a).toContain("Controlled Unclassified Information (CUI)");
    expect(a).toContain("as a certification, an assessment by a C3PAO, or a government approval");
  });
});
