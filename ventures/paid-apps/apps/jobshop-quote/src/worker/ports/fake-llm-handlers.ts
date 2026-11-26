// Every module's FakeLlm handlers, merged. Used when FAKE_EXTERNALS=true (tests, offline demo).
import { quoteFakeHandlers } from "../services/quotes/fake-llm";
import { rfqFakeHandlers } from "../services/rfq/fake-llm";
import type { FakeHandler } from "./fake-llm";

export const allFakeHandlers: Record<string, FakeHandler> = {
  ...rfqFakeHandlers,
  ...quoteFakeHandlers,
};
