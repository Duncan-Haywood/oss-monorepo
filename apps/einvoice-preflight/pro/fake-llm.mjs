// @ts-check
// Deterministic stand-in for the model, keyed by purpose. Proprietary (see ../LICENSE).
// Every purpose the paid layer uses has a handler here, so tests and the offline demo run
// without an API key.

/** @typedef {import("./llm.mjs").LlmRequest} LlmRequest */
/** @typedef {import("./llm.mjs").Llm} Llm */

/** @type {Record<string, (req: LlmRequest) => unknown>} */
export const FAKE_HANDLERS = {
  // explain.rule: the prompt is JSON { rule, message, fix, lang }.
  "explain.rule": (req) => {
    const input = JSON.parse(req.prompt);
    const prefix = { de: "Regel", fr: "Règle", en: "Rule" }[/** @type {"de"|"fr"|"en"} */ (input.lang)] ?? "Rule";
    return {
      title: `${prefix} ${input.rule}: ${input.message}`,
      action: input.fix || input.message,
    };
  },
};

/** @implements {Llm} */
export class FakeLlm {
  /** @param {Record<string, (req: LlmRequest) => unknown>} [handlers] */
  constructor(handlers = FAKE_HANDLERS) {
    this.handlers = handlers;
    /** @type {LlmRequest[]} */
    this.calls = [];
  }

  /** @param {LlmRequest} req */
  async complete(req) {
    this.calls.push(req);
    const handler = this.handlers[req.purpose];
    if (!handler) throw new Error(`FakeLlm: no handler for purpose ${req.purpose}`);
    return { data: handler(req), usage: { model: "fake", inputTokens: 0, outputTokens: 0 } };
  }
}
