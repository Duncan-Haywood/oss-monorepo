// Cross-module calls used by drafting, in one place (mocked in tests). Context enrichment that is
// not essential (profile, style examples) degrades to empty instead of failing the draft.
import type { AppContext } from "../../context";
import { formatFactsForPrompt } from "../knowledge";
import { getOrgPromptProfile } from "../orgs";
import { retrieveStyleExamples } from "../retrieval";
import type { StyleExample } from "./prompts";
import type { DraftingFact } from "./types";

export const draftingDeps = {
  async orgProfile(ctx: AppContext, orgId: string): Promise<string> {
    try {
      return await getOrgPromptProfile(ctx, orgId);
    } catch (e) {
      ctx.logger.warn("drafting.org_profile_unavailable", { orgId, error: String(e) });
      return "";
    }
  },

  formatFacts(facts: DraftingFact[]): string {
    return formatFactsForPrompt(facts);
  },

  async styleExamples(ctx: AppContext, orgId: string, query: string): Promise<StyleExample[]> {
    try {
      const chunks = await retrieveStyleExamples(ctx, orgId, { limit: 4, query });
      return chunks.map((c) => ({
        title: c.heading ? `${c.documentTitle} — ${c.heading}` : c.documentTitle,
        text: c.text,
      }));
    } catch (e) {
      ctx.logger.warn("drafting.style_examples_unavailable", { orgId, error: String(e) });
      return [];
    }
  },
};
