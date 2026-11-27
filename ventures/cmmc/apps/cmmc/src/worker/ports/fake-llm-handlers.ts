// Every FakeLlm handler in the app, keyed by purpose. Add each service's handlers here.
import { draftingFakeHandlers } from "../services/drafting/fake-llm";
import type { FakeHandler } from "./fake-llm";

export const allFakeHandlers: Record<string, FakeHandler> = {
  ...draftingFakeHandlers,
};
