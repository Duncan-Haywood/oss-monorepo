// Deterministic drafts for tests and the offline demo. Uses only the facts it was given.
import type { FakeHandler } from "../../ports/fake-llm";
import { DRAFT_PURPOSE, type DraftOutput } from "./prompts";

const field = (context: string, label: string) =>
  context.match(new RegExp(`^${label}: (.*)$`, "m"))?.[1]?.trim() ?? "";

export const draftingFakeHandlers: Record<string, FakeHandler> = {
  [DRAFT_PURPOSE]: (req): DraftOutput => {
    const ctx = req.context ?? "";
    const org = field(ctx, "Organization");
    const notes = field(ctx, "Implementation notes from the organization");
    const reqLine = req.prompt.split("\n")[0] ?? "";
    const hasNotes = notes && notes !== "(none)";
    return {
      statement: hasNotes
        ? `${org} addresses ${reqLine.split(" (")[0]?.replace("Requirement ", "")} as follows: ${notes} [CONFIRM: the tools and frequency used]`
        : `[CONFIRM: describe how ${org} implements this requirement]`,
      questions: [
        "Which tools or procedures implement this requirement, and how often are they reviewed?",
      ],
    };
  },
};
