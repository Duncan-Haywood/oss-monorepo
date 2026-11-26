// Aggregates every module's FakeLlm handlers (used when FAKE_EXTERNALS=true and in tests).
// Each module owns its own file; only add an import line here.

import { fakeHandlers as attachments } from "../services/attachments/fake-llm";
import { fakeHandlers as awards } from "../services/awards/fake-llm";
import { fakeHandlers as budgets } from "../services/budgets/fake-llm";
import { fakeHandlers as discovery } from "../services/discovery/fake-llm";
import { fakeHandlers as drafting } from "../services/drafting/fake-llm";
import { fakeHandlers as eligibility } from "../services/eligibility/fake-llm";
import { fakeHandlers as grounding } from "../services/grounding/fake-llm";
import { fakeHandlers as imports } from "../services/imports/fake-llm";
import { fakeHandlers as interview } from "../services/interview/fake-llm";
import { fakeHandlers as knowledge } from "../services/knowledge/fake-llm";
import { fakeHandlers as matching } from "../services/matching/fake-llm";
import { fakeHandlers as prospecting } from "../services/prospecting/fake-llm";
import { fakeHandlers as quality } from "../services/quality/fake-llm";
import { fakeHandlers as watchlist } from "../services/watchlist/fake-llm";
import type { FakeHandler } from "./fake-llm";

export const allFakeHandlers: Record<string, FakeHandler> = {
  ...attachments,
  ...awards,
  ...budgets,
  ...knowledge,
  ...interview,
  ...discovery,
  ...imports,
  ...matching,
  ...drafting,
  ...grounding,
  ...eligibility,
  ...watchlist,
  ...prospecting,
  ...quality,
};
