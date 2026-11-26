// Test data + a tiny fetch router for the application UI tests (not a test file itself).
import { makeOpportunity, NOW } from "@client/components/grants/test-fixtures";
import type { FactDto, FlagDto, SubmissionDto } from "@shared/api/types";
import type { ApplicationContent, GroundingReport } from "@shared/content";
import { vi } from "vitest";
import type { ApplicationDetail } from "./types";

const iso = NOW.toISOString();

export function makeFact(over: Partial<FactDto> = {}): FactDto {
  return {
    id: "fct_1",
    orgId: "org_1",
    category: "history",
    statement: "Southwest Indian Foundation was founded in 1968 in Gallup, New Mexico.",
    value: null,
    status: "confirmed",
    sensitivity: "public",
    confidence: 0.9,
    sourceType: "document",
    sourceDocumentId: "doc_1",
    sourceChunkId: "chk_1",
    sourceInterviewId: null,
    sourceTurnId: null,
    sourceQuote: "SWIF was founded in 1968 to serve the people of the Navajo Nation around Gallup.",
    asOf: "2025",
    projectId: null,
    supersededById: null,
    supersedesFactId: null,
    lastConfirmedAt: null,
    createdBy: null,
    confirmedBy: "usr_1",
    confirmedAt: iso,
    originalStatement: null,
    editedBy: null,
    editedAt: null,
    rejectionReason: null,
    projectField: null,
    dedupeHash: null,
    createdAt: iso,
    updatedAt: iso,
    ...over,
  };
}

export function makeFlag(over: Partial<FlagDto> = {}): FlagDto {
  return {
    id: "flg_1",
    orgId: "org_1",
    applicationId: "app_1",
    versionId: "ver_2",
    severity: "warning",
    kind: "numeric_mismatch",
    sectionKey: "need",
    claimId: "need.p1.c2",
    message: "“120” does not appear in the cited fact (it says 85).",
    suggestedQuestion: null,
    status: "open",
    resolution: null,
    resolvedBy: null,
    resolvedAt: null,
    createdAt: iso,
    ...over,
  };
}

export const CONTENT: ApplicationContent = {
  sections: [
    {
      key: "need",
      title: "Statement of need",
      paragraphs: [
        {
          id: "need.p1",
          claims: [
            {
              id: "need.p1.c1",
              text: "Southwest Indian Foundation has served Gallup since 1968.",
              kind: "factual",
              factIds: ["fct_1"],
            },
            {
              id: "need.p1.c2",
              text: "Our academy trained 120 young people last year.",
              kind: "factual",
              factIds: ["fct_2"],
            },
            {
              id: "need.p1.c3",
              text: "We welcome the opportunity to build on this work together.",
              kind: "framing",
              factIds: [],
            },
          ],
        },
      ],
      gaps: [
        {
          question: "How many participants will the project serve in year one?",
          why: "The funder asks for enrollment targets.",
        },
      ],
    },
  ],
};

export const REPORT: GroundingReport = {
  totalClaims: 3,
  factualClaims: 2,
  supported: 1,
  partiallySupported: 0,
  unsupported: 0,
  numericMismatches: 1,
  unconfirmedFactCitations: 1,
  gaps: 1,
  passed: false,
  verdicts: [
    {
      claimId: "need.p1.c1",
      verdict: "supported",
      reason: "",
      unmatchedNumbers: [],
      unconfirmedFactIds: [],
    },
    {
      claimId: "need.p1.c2",
      verdict: "supported",
      reason: "",
      unmatchedNumbers: ["120"],
      unconfirmedFactIds: ["fct_2"],
    },
  ],
  checkedAt: NOW.getTime(),
  model: "claude-opus-5-5",
};

export function makeSubmission(over: Partial<SubmissionDto> = {}): SubmissionDto {
  return {
    id: "sub_1",
    orgId: "org_1",
    applicationId: "app_1",
    versionId: "ver_2",
    channel: "manual",
    status: "pending",
    packageR2Key: "orgs/org_1/submissions/sub_1/package.json",
    packageSha256: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    recipient: "https://www.grants.gov/",
    externalRef: null,
    submittedByType: "user",
    submittedBy: "usr_1",
    approvedBy: "usr_1",
    metadata: {
      method: "grants_gov",
      guide: {
        method: "grants_gov",
        title: "Submit via Grants.gov Workspace DOL-ETA-27-001",
        url: "https://www.grants.gov/search-results-detail/DOL-ETA-27-001",
        steps: [
          "Sign in to Grants.gov with an account that holds the AOR role.",
          "Find opportunity DOL-ETA-27-001 and create a Workspace.",
          "Run Check for Errors, then Sign and Submit.",
        ],
        notes: ["Grants.gov system-to-system submission is not supported."],
      },
    },
    error: null,
    sentAt: null,
    confirmedAt: null,
    createdAt: iso,
    updatedAt: iso,
    ...over,
  };
}

export function makeDetail(over: Partial<ApplicationDetail> = {}): ApplicationDetail {
  const opportunity = makeOpportunity({
    requirements: {
      sections: [
        {
          key: "need",
          title: "Statement of need",
          prompt: "Describe the need in your community.",
          kind: "narrative",
          required: true,
          wordLimit: 50,
          charLimit: null,
          guidance: "",
        },
      ],
      attachments: [],
      eligibilityCriteria: [],
      submissionInstructions: "",
      complete: true,
    },
  });
  const { match: _match, ...opp } = opportunity;
  return {
    id: "app_1",
    orgId: "org_1",
    opportunityId: opp.id,
    matchId: null,
    projectId: null,
    title: "YouthBuild Gallup 2027",
    status: "in_review",
    reviewTier: "one_click",
    reviewTierReason:
      "first submission to this funder; ask $50,000 is above the autopilot limit of $10,000",
    requestedAmountCents: 5_000_000,
    deadline: null,
    currentVersionId: "ver_2",
    workflowInstanceId: null,
    lastError: null,
    createdBy: "usr_1",
    submittedAt: null,
    outcomeAt: null,
    outcomeNotes: null,
    awardedAmountCents: null,
    createdAt: iso,
    updatedAt: iso,
    opportunity: opp,
    currentVersion: {
      id: "ver_2",
      orgId: "org_1",
      applicationId: "app_1",
      versionNumber: 2,
      content: CONTENT,
      executiveSummary: "SWIF requests $50,000 to train Navajo youth in construction trades.",
      keyPoints: ["Founded 1968", "Construction trades academy"],
      groundingReport: REPORT,
      authorType: "system",
      authorId: null,
      model: "claude-opus-5-5",
      promptVersion: "v1",
      changeNote: null,
      createdAt: iso,
    },
    versions: [
      { id: "ver_2", versionNumber: 2, createdAt: iso, authorType: "system" },
      { id: "ver_1", versionNumber: 1, createdAt: iso, authorType: "system" },
    ],
    flags: [makeFlag()],
    citedFacts: [
      makeFact(),
      makeFact({
        id: "fct_2",
        category: "metric",
        status: "proposed",
        statement: "The construction academy trained 85 young people in 2025.",
        sourceQuote: "In 2025 the academy trained 85 trainees in the construction trades.",
      }),
    ],
    submissions: [],
    ...over,
  };
}

export const ME = {
  user: { id: "usr_1", email: "ada@example.org", name: "Ada" },
  memberships: [{ orgId: "org_1", orgName: "SWIF", orgSlug: "swif", role: "owner" }],
};

export interface FetchCall {
  method: string;
  url: string;
  body: unknown;
}
type Handler = (call: FetchCall) => unknown;
export type Route = [method: string, url: string | RegExp, handler: Handler];

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

/** Stub global fetch with a route table; returns the recorded calls. Unmatched → 404. */
export function mockFetch(routes: Route[]) {
  const calls: FetchCall[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init.method ?? "GET").toUpperCase();
    const body = typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    const call = { method, url, body };
    calls.push(call);
    for (const [m, pattern, handler] of routes) {
      const hit = typeof pattern === "string" ? pattern === url : pattern.test(url);
      if (m === method && hit) {
        const result = await handler(call);
        return result instanceof Response ? result : json(result);
      }
    }
    return json({ error: { code: "not_found", message: `No mock for ${method} ${url}` } }, 404);
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}
