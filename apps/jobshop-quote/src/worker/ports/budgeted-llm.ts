// LlmClient decorator that enforces the LLM spend caps (services/guards/llm-budget.ts) before every
// call and feeds each call's cost back into the guard's cached sums. Usage persistence stays with the
// inner client's onUsage hook (llm_calls), which is what the guard sums.
import type { LlmBudgetGuard } from "../services/guards/llm-budget";
import type { LlmClient, LlmRequestBase, LlmUsage, StructuredRequest } from "./llm";

export class BudgetedLlm implements LlmClient {
  constructor(
    private readonly inner: LlmClient,
    private readonly guard: LlmBudgetGuard,
  ) {}

  private async run<R extends { usage: LlmUsage }>(
    req: LlmRequestBase,
    call: () => Promise<R>,
  ): Promise<R> {
    await this.guard.assertWithinBudget(req.orgId, req.purpose);
    const result = await call();
    this.guard.recordSpend(req.orgId, result.usage.costMicros);
    return result;
  }

  generateStructured<T>(req: StructuredRequest<T>): Promise<{ data: T; usage: LlmUsage }> {
    return this.run(req, () => this.inner.generateStructured(req));
  }

  generateText(req: LlmRequestBase): Promise<{ text: string; usage: LlmUsage }> {
    return this.run(req, () => this.inner.generateText(req));
  }
}
