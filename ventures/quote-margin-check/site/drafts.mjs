// Portable local drafts. The file contains only the quote inputs, never
// derived results, usage data, or browser metadata.

const MAX_DRAFT_BYTES = 32 * 1024;
const DRAFT_VERSION = 1;

export function serializeDraft(quote) {
  return JSON.stringify({ version: DRAFT_VERSION, quote }, null, 2) + "\n";
}

export function parseDraft(text, loadQuote) {
  if (typeof text !== "string" || new TextEncoder().encode(text).length > MAX_DRAFT_BYTES) {
    throw new Error("draft file is too large");
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("draft file is not valid JSON");
  }
  if (!data || data.version !== DRAFT_VERSION || !data.quote || typeof data.quote !== "object" || Array.isArray(data.quote)) {
    throw new Error("draft file is not a supported Quote Margin Check draft");
  }
  return loadQuote(data.quote);
}

export const draftFileName = "quote-margin-check-draft.json";
