// Customer journey through the HTTP API only (QA): sign-up -> org -> knowledge -> interview ->
// discovery -> matches -> application -> review -> submission -> dashboard/billing -> privacy
// export -> tenant isolation -> org deletion. Real Better Auth cookies are used throughout; the
// database / R2 are only read directly to verify deletion at the very end.
import { env } from "cloudflare:workers";
import type {
  ApplicationDto,
  ApplicationVersionDto,
  DataExportDto,
  DocumentDto,
  FactDto,
  FeedbackDto,
  FlagDto,
  FollowupDto,
  InterviewDto,
  InterviewTurnDto,
  MatchDto,
  OpportunityDto,
  ProjectDto,
  SubmissionDto,
} from "@shared/api/types";
import type { ApplicationContent, GroundingReport } from "@shared/content";
import { POLICY_VERSION } from "@shared/legal";
import type { Env } from "@worker/env";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { api, BASE, signIn, signUp } from "./helpers";

const FILES = (env as unknown as Env).FILES;
const DB = (env as unknown as Env).DB;
const INTERNAL_TOKEN = "test-internal-token";
const STEP_TIMEOUT = 120_000;

// ------------------------------------------------------------------------------- tiny client

interface CallInit {
  method?: string;
  json?: unknown;
  body?: BodyInit;
  headers?: Record<string, string>;
}

/** A browser-like client: sends the session cookie, and Origin on state-changing requests. */
function clientFor(cookie: string) {
  return (path: string, init: CallInit = {}) => {
    const method = init.method ?? (init.json !== undefined || init.body ? "POST" : "GET");
    const headers: Record<string, string> = { Cookie: cookie, ...(init.headers ?? {}) };
    if (method !== "GET" && method !== "HEAD") headers.Origin = BASE;
    return api(path, { method, headers, json: init.json, body: init.body });
  };
}
type Client = ReturnType<typeof clientFor>;

async function ok<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  const text = await r.text();
  expect(r.status, `${r.url} -> ${r.status}: ${text.slice(0, 500)}`).toBe(status);
  return (text ? JSON.parse(text) : null) as T;
}

const sha256Hex = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

// ------------------------------------------------------------------------------- test content

const ORG_NAME = "Red Mesa Trades Collective";
const RUN = crypto.randomUUID().slice(0, 8); // keeps document hashes unique per run

const MISSION_TEXT = `# Mission Statement

Our mission is to prepare rural adults in McKinley County, New Mexico for living-wage careers in the construction trades.

Red Mesa Trades Collective was founded in 2011 in Gallup, New Mexico.

We serve Navajo and Zuni families living on and near the Navajo Nation.

We believe hands-on apprenticeship training builds stable families and stronger communities.

Ref ${RUN}-mission`;

const PROGRAM_TEXT = `# Rural Trades Apprenticeship Program

The Rural Trades Apprenticeship Program trained 48 adults in carpentry, electrical and plumbing in 2025.

In 2025, 39 participants completed the program and earned OSHA 10 credentials.

Of those graduates, 31 were placed in construction jobs within 90 days.

The program operates on an annual budget of $640,000.

We partner with 12 local employers who hire our graduates into registered apprenticeships.

Our staff includes 4 certified instructors and a full-time job placement director.

Ref ${RUN}-program`;

const PAST_APP_TEXT = `# 2024 Application to the Sample Community Foundation

Red Mesa Trades Collective requested $75,000 to expand carpentry training in Gallup.

The training program served 40 adults from McKinley County in 2023.

Our partners include Gallup-area contractors and the local workforce board.

The grant was awarded in full and funded tools and instructor salaries.

Ref ${RUN}-past`;

const INTERVIEW_ANSWERS = [
  "Red Mesa Trades Collective runs a 16-week construction trades training program in Gallup for adults aged 18 to 55.",
  "Most of our participants are Navajo adults who live in rural chapters more than 30 miles from Gallup.",
  "Our board of directors has 7 members, and 4 of them are enrolled members of the Navajo Nation.",
];

/** What a staff member would say about a section the drafter could not fill. */
const gapAnswer = (topic: string) =>
  `For ${topic.toLowerCase()}: our team includes 4 full-time staff members and 2 certified trades instructors. ` +
  `For ${topic.toLowerCase()}: we have operated our own training shop in Gallup since 2011.`;

// ------------------------------------------------------------------------------- shared state

interface Detail extends ApplicationDto {
  opportunity: OpportunityDto;
  currentVersion: ApplicationVersionDto | null;
  versions: { id: string; versionNumber: number; authorType: string }[];
  flags: FlagDto[];
  citedFacts: FactDto[];
  submissions: SubmissionDto[];
}
type MatchItem = MatchDto & { opportunity: OpportunityDto };
type Interview = InterviewDto & { turns: InterviewTurnDto[] };

const s: {
  owner?: { cookie: string; userId: string; email: string; password: string };
  call?: Client;
  orgId?: string;
  docs: Record<"mission" | "program" | "past", DocumentDto | undefined>;
  factIds: Set<string>;
  userFactId?: string;
  interviewId?: string;
  projectId?: string;
  topMatch?: MatchItem;
  appId?: string;
  reviewer?: { cookie: string; userId: string };
  submissionId?: string;
  exportId?: string;
  other?: { cookie: string; userId: string; orgId: string };
  matchId?: string;
  matches?: MatchItem[];
  autoDraftIds?: string[];
} = { docs: { mission: undefined, program: undefined, past: undefined }, factIds: new Set() };

const base = () => `/api/orgs/${s.orgId}`;
const call = () => {
  if (!s.call) throw new Error("not signed in (earlier step failed)");
  return s.call;
};

async function allOrgFacts(): Promise<FactDto[]> {
  const { items } = await ok<{ items: FactDto[] }>(call()(`${base()}/facts?limit=2000`));
  for (const f of items) s.factIds.add(f.id);
  return items;
}

async function detail(appId = s.appId): Promise<Detail> {
  return ok<Detail>(call()(`${base()}/applications/${appId}`));
}

function factualClaims(content: ApplicationContent) {
  return content.sections.flatMap((sec) =>
    sec.paragraphs.flatMap((p) => p.claims.filter((c) => c.kind === "factual")),
  );
}

/** Anti-fabrication invariants on the current version of an application. */
async function assertGrounded(d: Detail) {
  const version = d.currentVersion;
  expect(version, "application has a current version").toBeTruthy();
  if (!version) return;
  const content = version.content as ApplicationContent;
  const orgFactIds = new Set((await allOrgFacts()).map((f) => f.id));
  const claims = factualClaims(content);
  expect(claims.length, "draft has factual claims").toBeGreaterThan(0);
  for (const c of claims) {
    expect(c.factIds.length, `claim ${c.id} cites >= 1 fact`).toBeGreaterThanOrEqual(1);
    for (const id of c.factIds) expect(orgFactIds.has(id), `claim ${c.id} cites ${id}`).toBe(true);
  }
  // citedFacts all belong to this org
  for (const f of d.citedFacts) expect(f.orgId).toBe(s.orgId);

  const report = version.groundingReport as GroundingReport | null;
  expect(report, "grounding report stored").toBeTruthy();
  if (!report) return;
  const judged = new Set(report.verdicts.map((v) => v.claimId));
  for (const c of claims) expect(judged.has(c.id), `verdict for claim ${c.id}`).toBe(true);
  expect(report.factualClaims).toBe(claims.length);
}

/** No submission exists while blockers are open on the current version. */
function assertNoAutoSubmitWithBlockers(d: Detail) {
  const openBlockers = d.flags.filter((f) => f.severity === "blocker" && f.status === "open");
  if (openBlockers.length > 0) {
    expect(d.submissions, "no submission while blockers are open").toHaveLength(0);
    expect(["submitting", "submitted", "approved"]).not.toContain(d.status);
  }
  for (const sub of d.submissions) expect(sub.submittedByType).not.toBe("autopilot");
}

// ------------------------------------------------------------------------------- the journey

describe("customer journey (HTTP API only)", () => {
  it("1. signs up, signs in and creates an org with terms accepted", async () => {
    const reg = await signUp({ name: "Lena Yazzie", email: `lena-${RUN}@example.test` });
    expect(reg.cookie).toContain("session_token=");
    // A fresh sign-in (like a returning user) gets its own working session cookie.
    const login = await signIn(reg.email, reg.password);
    expect(login.res.status).toBe(200);
    s.owner = {
      cookie: login.cookie,
      userId: reg.userId,
      email: reg.email,
      password: reg.password,
    };
    s.call = clientFor(login.cookie);

    // Without accepting terms the org is not created.
    const refused = await call()("/api/orgs", {
      json: { name: ORG_NAME, legalName: `${ORG_NAME}, Inc.`, orgType: "nonprofit_501c3" },
    });
    expect(refused.status).toBe(400);

    const { orgId } = await ok<{ orgId: string }>(
      call()("/api/orgs", {
        json: {
          name: ORG_NAME,
          legalName: `${ORG_NAME}, Inc.`,
          orgType: "nonprofit_501c3",
          city: "Gallup",
          state: "NM",
          websiteUrl: "redmesa.example.org",
          focusAreas: ["construction trades", "workforce development"],
          serviceAreas: ["McKinley County, NM", "Navajo Nation"],
          acceptTerms: true,
          policyVersion: POLICY_VERSION,
        },
      }),
      201,
    );
    expect(orgId).toMatch(/^org_/);
    s.orgId = orgId;

    const me = await ok<{ memberships: { orgId: string; role: string }[] }>(call()("/api/me"));
    expect(me.memberships).toContainEqual(expect.objectContaining({ orgId, role: "owner" }));
    const overview = await ok<{ org: { name: string }; role: string }>(call()(base()));
    expect(overview.org.name).toBe(ORG_NAME);
    expect(overview.role).toBe("owner");
  });

  it(
    "2. uploads 3 text documents that become ready with verbatim-quoted proposed facts",
    async () => {
      const upload = async (
        key: "mission" | "program" | "past",
        text: string,
        filename: string,
        fields: Record<string, string>,
      ) => {
        const fd = new FormData();
        fd.set("file", new File([text], filename, { type: "text/plain" }));
        for (const [k, v] of Object.entries(fields)) fd.set(k, v);
        fd.set("consent", "true");
        const doc = await ok<DocumentDto>(
          call()(`${base()}/documents`, { method: "POST", body: fd }),
          201,
        );
        s.docs[key] = doc;
        return doc;
      };
      await upload("mission", MISSION_TEXT, "mission-statement.txt", {
        kind: "mission_statement",
      });
      await upload("program", PROGRAM_TEXT, "apprenticeship-program.txt", {
        kind: "program_description",
      });
      await upload("past", PAST_APP_TEXT, "2024-community-foundation-application.txt", {
        kind: "past_application",
        pastOutcome: "awarded",
        pastFunder: "Sample Community Foundation",
        pastAmountCents: "7500000",
        pastYear: "2024",
      });

      const texts = { mission: MISSION_TEXT, program: PROGRAM_TEXT, past: PAST_APP_TEXT };
      for (const key of ["mission", "program", "past"] as const) {
        const doc = s.docs[key];
        if (!doc) throw new Error(`upload ${key} failed`);
        const d = await ok<
          DocumentDto & { chunks: { id: string; text: string }[]; facts: FactDto[] }
        >(call()(`${base()}/documents/${doc.id}`));
        expect(d.status, `${key} ready`).toBe("ready");
        expect(d.chunks.length).toBeGreaterThan(0);
        if (key === "past") {
          expect(d.pastOutcome).toBe("awarded");
          expect(d.pastYear).toBe(2024);
        }
        const { items } = await ok<{ items: FactDto[] }>(
          call()(`${base()}/facts?documentId=${doc.id}`),
        );
        expect(items.length, `${key} produced facts`).toBeGreaterThan(0);
        for (const f of items) {
          expect(f.status).toBe("proposed");
          expect(f.sourceType).toBe("document");
          expect(f.sourceDocumentId).toBe(doc.id);
          expect(f.sourceQuote.length).toBeGreaterThan(0);
          // Verbatim: the quote appears in the uploaded text (and in its cited chunk).
          expect(norm(texts[key]), `quote of ${f.id}`).toContain(norm(f.sourceQuote));
          const chunk = d.chunks.find((c) => c.id === f.sourceChunkId);
          expect(chunk, `chunk of ${f.id}`).toBeTruthy();
          expect(norm(chunk?.text ?? "")).toContain(norm(f.sourceQuote));
        }
      }
      // A number from the program description is captured with its quote.
      const facts = await allOrgFacts();
      expect(facts.some((f) => f.sourceQuote.includes("48 adults"))).toBe(true);
    },
    STEP_TIMEOUT,
  );

  it("3. confirms facts and adds a user-entered fact", async () => {
    const mission = s.docs.mission;
    const program = s.docs.program;
    if (!mission || !program) throw new Error("documents missing");
    const missionFacts = (
      await ok<{ items: FactDto[] }>(call()(`${base()}/facts?documentId=${mission.id}`))
    ).items;
    const programFacts = (
      await ok<{ items: FactDto[] }>(call()(`${base()}/facts?documentId=${program.id}`))
    ).items;
    const [first, ...rest] = [...missionFacts, ...programFacts];
    if (!first) throw new Error("no facts to confirm");

    const confirmed = await ok<FactDto>(
      call()(`${base()}/facts/${first.id}/confirm`, { method: "POST" }),
    );
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.confirmedBy).toBe(s.owner?.userId);
    if (rest.length > 0) {
      await ok(call()(`${base()}/facts/bulk-confirm`, { json: { ids: rest.map((f) => f.id) } }));
    }
    const nowConfirmed = await ok<{ items: FactDto[] }>(call()(`${base()}/facts?status=confirmed`));
    for (const f of [first, ...rest]) {
      expect(nowConfirmed.items.map((x) => x.id)).toContain(f.id);
    }

    const userFact = await ok<FactDto>(
      call()(`${base()}/facts`, {
        json: {
          category: "financial",
          statement: "Red Mesa Trades Collective has an annual operating budget of $1,200,000.",
          value: { number: 1_200_000, unit: "USD", year: 2025 },
          asOf: "2025",
        },
      }),
      201,
    );
    expect(userFact.sourceType).toBe("user_entered");
    expect(userFact.status).toBe("confirmed");
    s.userFactId = userFact.id;

    const summary = await ok<{ byStatus: Record<string, number> }>(
      call()(`${base()}/facts/summary`),
    );
    expect(summary.byStatus.confirmed ?? 0).toBeGreaterThanOrEqual(rest.length + 2);
  });

  it(
    "4. runs an onboarding interview (start, answer x3, complete) and extracts facts",
    async () => {
      const iv = await ok<Interview>(
        call()(`${base()}/interviews`, { json: { kind: "onboarding" } }),
        201,
      );
      s.interviewId = iv.id;
      expect(iv.status).toBe("active");
      expect(iv.turns.length).toBeGreaterThanOrEqual(1);
      expect(iv.turns[0]?.role).toBe("interviewer");

      for (const content of INTERVIEW_ANSWERS) {
        const r = await ok<{ turns: InterviewTurnDto[]; done: boolean }>(
          call()(`${base()}/interviews/${iv.id}/answer`, {
            json: { content, inputMode: "text" },
          }),
        );
        expect(r.turns[0]?.role).toBe("respondent");
        expect(r.turns[0]?.content).toBe(content);
      }
      const done = await ok<Interview>(
        call()(`${base()}/interviews/${iv.id}/complete`, { method: "POST" }),
      );
      expect(done.status).toBe("completed");
      expect(done.turns.filter((t) => t.role === "respondent")).toHaveLength(3);

      const { items } = await ok<{ items: FactDto[] }>(
        call()(`${base()}/facts?interviewId=${iv.id}`),
      );
      expect(items.length, "interview facts extracted").toBeGreaterThan(0);
      for (const f of items) {
        expect(f.sourceType).toBe("interview");
        expect(INTERVIEW_ANSWERS.some((a) => norm(a).includes(norm(f.sourceQuote)))).toBe(true);
      }
    },
    STEP_TIMEOUT,
  );

  it("5. creates a project", async () => {
    const p = await ok<ProjectDto>(
      call()(`${base()}/projects`, {
        json: {
          title: "Rural Trades Apprenticeship Expansion",
          summary:
            "Expand construction trades pre-apprenticeship training for rural Navajo adults in McKinley County.",
          problem: "Rural adults lack access to construction trades training and apprenticeships.",
          approach: "Hands-on carpentry, electrical and plumbing training with employer partners.",
          populationServed: "Navajo and Zuni adults in rural McKinley County",
          location: "Gallup, New Mexico",
          budgetNeededCents: 12_000_000,
          status: "active",
          priority: 1,
        },
      }),
      201,
    );
    s.projectId = p.id;

    // The owner turns autopilot on with permissive gates, so the anti-fabrication gates
    // (grounding passed, zero blockers, all cited facts confirmed) are what decide.
    const settings = await ok<{ autopilotEnabled: boolean }>(
      call()(`${base()}/settings`, {
        method: "PATCH",
        json: {
          autopilotEnabled: true,
          autoSubmitMaxCents: 100_000_000,
          fullReviewAboveCents: 100_000_000,
          minFitScoreForAuto: 0,
          highLikelihoodThreshold: 1,
          reviewFirstSubmissionPerFunder: false,
        },
      }),
    );
    expect(settings.autopilotEnabled).toBe(true);
    const d = await ok<ProjectDto & { facts: FactDto[] }>(call()(`${base()}/projects/${p.id}`));
    expect(d.title).toBe("Rural Trades Apprenticeship Expansion");
    expect(Array.isArray(d.facts)).toBe(true);
  });

  it(
    "6. runs discovery via the internal route (bearer token) and seeds sample opportunities",
    async () => {
      const denied = await api("/api/internal/discovery/run", {
        method: "POST",
        headers: { Authorization: "Bearer wrong-token" },
        json: {},
      });
      expect(denied.status).toBe(401);
      const noAuth = await api("/api/internal/discovery/run", { method: "POST", json: {} });
      expect(noAuth.status).toBe(401);
      // A user's session cookie is not a substitute for the internal token.
      const withCookie = await call()("/api/internal/discovery/run", { json: {} });
      expect(withCookie.status).toBe(401);

      const run = await ok<{ queued: boolean; sources: string[] }>(
        api("/api/internal/discovery/run", {
          method: "POST",
          headers: { Authorization: `Bearer ${INTERNAL_TOKEN}` },
          json: {},
        }),
        202,
      );
      expect(run.queued).toBe(true);
      const runs = await ok<{ items: { status: string; source: string }[] }>(
        api("/api/internal/discovery/runs", {
          headers: { Authorization: `Bearer ${INTERNAL_TOKEN}` },
        }),
      );
      expect(runs.items[0]?.status).toBe("succeeded");

      const opps = await ok<{ items: (OpportunityDto & { match: MatchDto | null })[] }>(
        call()(`${base()}/opportunities`),
      );
      expect(opps.items.length).toBeGreaterThan(0);
      expect(opps.items.some((o) => o.title.startsWith("[Sample] "))).toBe(true);
    },
    STEP_TIMEOUT,
  );

  it("7. has ranked matches whose reasons cite only this org's facts", async () => {
    const { items } = await ok<{ items: MatchItem[] }>(call()(`${base()}/matches`));
    expect(items.length).toBeGreaterThan(0);
    const orgFactIds = new Set((await allOrgFacts()).map((f) => f.id));
    let cited = 0;
    for (const m of items) {
      expect(m.orgId).toBe(s.orgId);
      expect(m.opportunity.id).toBe(m.opportunityId);
      for (const r of m.reasons) {
        for (const id of r.factIds) {
          cited++;
          expect(orgFactIds.has(id), `match ${m.id} reason cites foreign/unknown ${id}`).toBe(true);
        }
      }
    }
    expect(cited, "at least one reason cites a fact").toBeGreaterThan(0);
    // sorted by expected value (desc)
    const evs = items.map((m) => m.expectedValueCents);
    expect([...evs].sort((a, b) => b - a)).toEqual(evs);
    s.matches = items;
    s.topMatch = items[0];
    expect(s.topMatch?.fitScore ?? 0).toBeGreaterThan(0);
  });

  it(
    "8. creates an application from the top match: in_review/needs_info with version, report, flags",
    async () => {
      const top = s.topMatch;
      if (!top) throw new Error("no top match");
      // Discovery's rescore ran autopilot drafting (org default autoDraftTopN = 3): the best
      // matches already have system-started drafts. Those must never be auto-submitted
      // (autopilot submission is off by default) and must satisfy the grounding invariants.
      const listed = await ok<{ items: (ApplicationDto & { opportunity: { id: string } })[] }>(
        call()(`${base()}/applications`),
      );
      const autoDrafts = listed.items.filter((a) => a.createdBy === null);
      expect(autoDrafts.length).toBeLessThanOrEqual(3);
      s.autoDraftIds = autoDrafts.map((a) => a.id);
      for (const a of autoDrafts) {
        expect(a.lastError, `autodraft ${a.id} error`).toBeNull();
        const d = await detail(a.id);
        await assertGrounded(d);
        assertNoAutoSubmitWithBlockers(d);
        if (d.submissions.length === 0) {
          expect(["in_review", "needs_info"]).toContain(a.status);
          continue;
        }
        // Autopilot submitted it: every gate must have held for the submitted version.
        expect(a.reviewTier).toBe("auto");
        const report = d.currentVersion?.groundingReport as GroundingReport | null;
        expect(report?.passed).toBe(true);
        expect(d.flags.filter((f) => f.severity === "blocker")).toHaveLength(0);
        for (const f of d.citedFacts) expect(f.status).toBe("confirmed");
        for (const sub of d.submissions) expect(sub.versionId).toBe(d.currentVersionId);
      }
      // The customer prefers to review every application by hand from here on.
      await ok(
        call()(`${base()}/settings`, { method: "PATCH", json: { autopilotEnabled: false } }),
      );
      const drafted = new Set(listed.items.map((a) => a.opportunityId));

      // The customer starts an application from the top match. If autopilot already drafted it,
      // a second one is refused (409) and the customer picks the best match not yet drafted.
      let pick = top;
      if (drafted.has(top.opportunityId)) {
        const dup = await call()(`${base()}/applications`, {
          json: { opportunityId: top.opportunityId, projectId: s.projectId },
        });
        expect(dup.status).toBe(409);
        const next = (s.matches ?? []).find((m) => !drafted.has(m.opportunityId));
        if (!next) throw new Error("every match was auto-drafted");
        pick = next;
      }
      s.matchId = pick.id;
      const app = await ok<ApplicationDto>(
        call()(`${base()}/applications`, {
          json: { opportunityId: pick.opportunityId, projectId: s.projectId },
        }),
        201,
      );
      s.appId = app.id;
      expect(app.createdBy).toBe(s.owner?.userId);
      expect(app.lastError).toBeNull();
      expect(["in_review", "needs_info"]).toContain(app.status);
      expect(app.currentVersionId).toBeTruthy();
      expect(app.projectId).toBe(s.projectId);

      const d = await detail();
      expect(d.versions.length).toBeGreaterThanOrEqual(1);
      expect(d.currentVersion?.id).toBe(app.currentVersionId);
      expect(d.flags.length, "verifier produced flags").toBeGreaterThan(0);
      await assertGrounded(d);
      assertNoAutoSubmitWithBlockers(d);
      expect(d.submissions).toHaveLength(0);

      // Duplicate application for the same opportunity is refused.
      const dup = await call()(`${base()}/applications`, {
        json: { opportunityId: pick.opportunityId },
      });
      expect(dup.status).toBe(409);
    },
    STEP_TIMEOUT,
  );

  it(
    "9. fills gaps (gap-fill interview) and resolves flags until the application is in review",
    async () => {
      let d = await detail();
      if (d.status === "needs_info") {
        const versionsBefore = d.versions.length;
        const gapsBefore = d.flags.filter((f) => f.kind === "missing_info" && f.status === "open");
        expect(gapsBefore.length, "needs_info has open missing_info flags").toBeGreaterThan(0);
        const list = await ok<{ items: InterviewDto[] }>(
          call()(`${base()}/interviews?kind=gap_fill`),
        );
        const gap = list.items.find((i) => i.focusApplicationId === s.appId);
        expect(gap, "gap-fill interview opened for the application").toBeTruthy();
        if (gap) {
          const iv = await ok<Interview>(call()(`${base()}/interviews/${gap.id}`));
          expect(iv.turns[0]?.role).toBe("interviewer");
          // Answer each question the interviewer asks, about the section it names.
          let question = iv.turns[iv.turns.length - 1]?.content ?? "";
          let done = false;
          for (let i = 0; i < 6 && !done; i++) {
            const topic = /(?:for|For) "([^"]+)"/.exec(question)?.[1] ?? "our work";
            const r = await ok<{ turns: InterviewTurnDto[]; done: boolean }>(
              call()(`${base()}/interviews/${gap.id}/answer`, {
                json: {
                  content: gapAnswer(topic),
                  inputMode: "text",
                },
              }),
            );
            done = r.done;
            question = r.turns[1]?.content ?? "";
          }
          const fin = await ok<Interview>(
            call()(`${base()}/interviews/${gap.id}/complete`, { method: "POST" }),
          );
          expect(fin.status).toBe("completed");
          const gf = await ok<{ items: FactDto[] }>(
            call()(`${base()}/facts?interviewId=${gap.id}`),
          );
          expect(gf.items.length, "gap-fill answers became facts").toBeGreaterThan(0);
        }
        d = await detail();
        // Completing the gap-fill interview redrafts with the new facts and re-verifies.
        expect(d.versions.length, "redrafted after the gap-fill interview").toBe(
          versionsBefore + 1,
        );
        await assertGrounded(d);
        assertNoAutoSubmitWithBlockers(d);
      }
      // Resolve every open blocker by hand (a staff member checked each one).
      for (let round = 0; round < 3; round++) {
        const open = d.flags.filter((f) => f.status === "open" && f.severity === "blocker");
        if (open.length === 0 && d.status === "in_review") break;
        for (const f of open) {
          const resolved = await ok<FlagDto>(
            call()(`${base()}/applications/${s.appId}/flags/${f.id}/resolve`, {
              json: { resolution: "Checked against our records by staff." },
            }),
          );
          expect(resolved.status).toBe("resolved");
        }
        d = await detail();
      }
      expect(d.status).toBe("in_review");
      expect(d.flags.filter((f) => f.status === "open" && f.severity === "blocker")).toHaveLength(
        0,
      );
      await assertGrounded(d);
      assertNoAutoSubmitWithBlockers(d);
      expect(d.submissions).toHaveLength(0);

      const queue = await ok<{ items: (ApplicationDto & { openBlockers: number })[] }>(
        call()(`${base()}/reviews/queue`),
      );
      expect(queue.items.map((a) => a.id)).toContain(s.appId);
    },
    STEP_TIMEOUT,
  );

  it(
    "10. a reviewer leaves feedback and approves; the package sha256 matches; follow-ups exist",
    async () => {
      // Owner invites a reviewer, who signs up and accepts with their own session cookie.
      const reviewerEmail = `reviewer-${RUN}@example.test`;
      const inv = await ok<{ id: string }>(
        call()(`${base()}/members/invitations`, {
          json: { email: reviewerEmail, role: "reviewer" },
        }),
        201,
      );
      const r = await signUp({ name: "Ray Tsosie", email: reviewerEmail });
      const reviewer = clientFor(r.cookie);
      s.reviewer = { cookie: r.cookie, userId: r.userId };
      await ok(reviewer(`/api/me/invitations/${inv.id}/accept`, { method: "POST" }));
      const me = await ok<{ memberships: { orgId: string; role: string }[] }>(reviewer("/api/me"));
      expect(me.memberships).toContainEqual(
        expect.objectContaining({ orgId: s.orgId, role: "reviewer" }),
      );
      // Reviewers cannot edit the fact base.
      const forbidden = await reviewer(`${base()}/facts`, {
        json: { category: "other", statement: "Reviewer should not add facts." },
      });
      expect(forbidden.status).toBe(403);

      const fb = await ok<FeedbackDto>(
        reviewer(`${base()}/reviews/${s.appId}/feedback`, {
          json: { rating: 4, comment: "Clear and well grounded.", tags: ["clear"] },
        }),
        201,
      );
      expect(fb.rating).toBe(4);
      const fbs = await ok<{ items: FeedbackDto[] }>(
        reviewer(`${base()}/reviews/${s.appId}/feedback`),
      );
      expect(fbs.items.map((x) => x.id)).toContain(fb.id);

      const approved = await ok<ApplicationDto>(
        reviewer(`${base()}/reviews/${s.appId}/decision`, {
          json: { decision: "approved", comments: "Approved for submission." },
        }),
      );
      expect(approved.lastError).toBeNull();
      expect(["submitting", "submitted"]).toContain(approved.status);

      const subs = await ok<{ items: (SubmissionDto & { application: { id: string } })[] }>(
        call()(`${base()}/submissions?applicationId=${s.appId}`),
      );
      expect(subs.items).toHaveLength(1);
      const sub = subs.items[0];
      if (!sub) throw new Error("no submission");
      s.submissionId = sub.id;
      expect(sub.application.id).toBe(s.appId);
      expect(sub.approvedBy).toBe(r.userId);
      expect(sub.submittedByType).toBe("user");
      expect(sub.packageSha256).toMatch(/^[0-9a-f]{64}$/);

      const pkg = await call()(`${base()}/submissions/${sub.id}/package`);
      expect(pkg.status).toBe(200);
      const body = await pkg.text();
      expect(await sha256Hex(body)).toBe(sub.packageSha256);
      expect(pkg.headers.get("X-Package-Sha256")).toBe(sub.packageSha256);
      expect(pkg.headers.get("X-Package-Integrity")).toBe("verified");
      const parsed = JSON.parse(body) as Record<string, unknown>;
      expect(JSON.stringify(parsed)).toContain(ORG_NAME);

      // The package is the approved version.
      const d = await detail();
      expect(sub.versionId).toBe(d.currentVersionId);

      // Manual (portal) channel: staff submit by hand and confirm; email channel is already sent.
      if (sub.status === "pending") {
        const confirmed = await ok<SubmissionDto>(
          call()(`${base()}/submissions/${sub.id}/confirm`, {
            json: { externalRef: "PORTAL-12345" },
          }),
        );
        expect(confirmed.status).toBe("confirmed");
      }
      const after = await detail();
      expect(after.status).toBe("submitted");

      const fups = await ok<{ items: FollowupDto[] }>(
        call()(`${base()}/submissions/followups?applicationId=${s.appId}`),
      );
      const kinds = fups.items.filter((f) => f.submissionId === sub.id).map((f) => f.kind);
      expect(kinds).toEqual(expect.arrayContaining(["status_check", "thank_you"]));

      const match = (
        await ok<{ items: MatchItem[] }>(call()(`${base()}/matches?status=all`))
      ).items.find((m) => m.id === s.matchId);
      expect(match?.status).toBe("applied");
    },
    STEP_TIMEOUT,
  );

  it("11. the dashboard shows the counts", async () => {
    const dash = await ok<{
      counts: { byStatus: Record<string, number> };
      pendingReviews: number;
      submittedThisMonth: number;
      awardedCents: number;
      upcomingDeadlines: unknown[];
      recentActivity: { action: string }[];
    }>(call()(`${base()}/submissions/dashboard`));
    const { items: apps } = await ok<{ items: ApplicationDto[] }>(call()(`${base()}/applications`));
    const expected: Record<string, number> = {};
    for (const a of apps) expected[a.status] = (expected[a.status] ?? 0) + 1;
    expect(dash.counts.byStatus).toEqual(expected);
    expect(dash.counts.byStatus.submitted ?? 0).toBeGreaterThanOrEqual(1);
    expect(Object.values(dash.counts.byStatus).reduce((a, b) => a + b, 0)).toBe(
      1 + (s.autoDraftIds?.length ?? 0),
    );
    expect(dash.submittedThisMonth).toBe(apps.filter((a) => a.submittedAt !== null).length);
    const queue = await ok<{ items: unknown[] }>(call()(`${base()}/reviews/queue`));
    expect(dash.pendingReviews).toBe(queue.items.length);
    expect(dash.pendingReviews).toBe(expected.in_review ?? 0);
    expect(dash.awardedCents).toBe(0);
    expect(dash.recentActivity.length).toBeGreaterThan(0);
  });

  it("12. billing overview works", async () => {
    const b = await ok<{
      plan: { key: string } | null;
      usage: { periodKey: string; applicationDrafts: number; limit: number };
      plans: unknown[];
    }>(call()(`${base()}/billing`));
    expect(b.plan).toBeTruthy();
    expect(b.usage.applicationDrafts).toBeGreaterThanOrEqual(1);
    expect(b.usage.limit).toBeGreaterThanOrEqual(b.usage.applicationDrafts);
    expect(Array.isArray(b.plans)).toBe(true);
  });

  it(
    "13. exports the org's data as a zip that contains its documents",
    async () => {
      const exp = await ok<DataExportDto>(
        call()(`${base()}/privacy/exports`, { method: "POST" }),
        201,
      );
      s.exportId = exp.id;
      expect(exp.status).toBe("ready");
      const dl = await call()(`${base()}/privacy/exports/${exp.id}/download`);
      expect(dl.status).toBe(200);
      expect(dl.headers.get("Content-Type")).toBe("application/zip");
      const files = unzipSync(new Uint8Array(await dl.arrayBuffer()));
      const names = Object.keys(files);
      expect(names).toContain("manifest.json");
      const texts = { mission: MISSION_TEXT, program: PROGRAM_TEXT, past: PAST_APP_TEXT };
      const docsJson = JSON.parse(strFromU8(files["data/documents.json"] as Uint8Array)) as {
        id: string;
      }[];
      for (const key of ["mission", "program", "past"] as const) {
        const doc = s.docs[key];
        if (!doc) throw new Error("doc missing");
        expect(docsJson.map((d) => d.id)).toContain(doc.id);
        const original = files[`files/documents/${doc.id}/original`];
        expect(original, `${key} original in export`).toBeTruthy();
        expect(strFromU8(original as Uint8Array)).toBe(texts[key]);
      }
      const factsJson = JSON.parse(strFromU8(files["data/facts.json"] as Uint8Array)) as {
        id: string;
      }[];
      expect(factsJson.map((f) => f.id)).toContain(s.userFactId);
      const subsJson = JSON.parse(strFromU8(files["data/submissions.json"] as Uint8Array)) as {
        id: string;
      }[];
      expect(subsJson.map((x) => x.id)).toContain(s.submissionId);
    },
    STEP_TIMEOUT,
  );

  it("14. a second org's user cannot see any of it (404 on 8+ endpoints)", async () => {
    const o = await signUp({ name: "Other Owner", email: `other-${RUN}@example.test` });
    const other = clientFor(o.cookie);
    const { orgId: otherOrgId } = await ok<{ orgId: string }>(
      other("/api/orgs", {
        json: {
          name: "Other Org",
          legalName: "Other Org, Inc.",
          orgType: "nonprofit_501c3",
          acceptTerms: true,
          policyVersion: POLICY_VERSION,
        },
      }),
      201,
    );
    s.other = { cookie: o.cookie, userId: o.userId, orgId: otherOrgId };
    const doc = s.docs.program?.id;
    const ob = `/api/orgs/${otherOrgId}`;
    const probes: [string, string, unknown?][] = [
      // A's org path directly
      ["GET", `${base()}`],
      ["GET", `${base()}/documents/${doc}`],
      ["GET", `${base()}/applications/${s.appId}`],
      ["GET", `${base()}/submissions/${s.submissionId}/package`],
      ["GET", `${base()}/privacy/exports/${s.exportId}/download`],
      ["GET", `${base()}/facts`],
      ["POST", `${base()}/facts/${s.userFactId}/confirm`],
      ["DELETE", `${base()}/privacy/org`, { confirmName: ORG_NAME }],
      // A's resource ids through B's own org
      ["GET", `${ob}/documents/${doc}`],
      ["GET", `${ob}/documents/${doc}/download`],
      ["GET", `${ob}/facts/${s.userFactId}`],
      ["GET", `${ob}/interviews/${s.interviewId}`],
      ["GET", `${ob}/projects/${s.projectId}`],
      ["GET", `${ob}/applications/${s.appId}`],
      ["GET", `${ob}/submissions/${s.submissionId}`],
      ["GET", `${ob}/submissions/${s.submissionId}/package`],
      ["GET", `${ob}/privacy/exports/${s.exportId}/download`],
      ["PATCH", `${ob}/matches/${s.matchId}`, { status: "dismissed" }],
      ["GET", `${ob}/reviews/${s.appId}/feedback`],
    ];
    const results: string[] = [];
    for (const [method, path, json] of probes) {
      const res = await other(path, { method, json });
      results.push(`${res.status} ${method} ${path}`);
    }
    const leaks = results.filter((r) => !r.startsWith("404 "));
    expect(leaks, leaks.join("\n")).toEqual([]);

    // B's own lists are empty.
    const bApps = await ok<{ items: unknown[] }>(other(`${ob}/applications`));
    expect(bApps.items).toHaveLength(0);
    const bSubs = await ok<{ items: unknown[] }>(other(`${ob}/submissions`));
    expect(bSubs.items).toHaveLength(0);
    const bFacts = await ok<{ items: FactDto[] }>(other(`${ob}/facts`));
    expect(bFacts.items.filter((f) => s.factIds.has(f.id))).toHaveLength(0);
  });

  it(
    "15. the owner deletes the org; all its rows and R2 objects are gone",
    async () => {
      const orgId = s.orgId as string;
      expect((await FILES.list({ prefix: `orgs/${orgId}/` })).objects.length).toBeGreaterThan(0);

      // Reviewer (non-owner) cannot delete; wrong name is refused.
      const reviewer = clientFor(s.reviewer?.cookie ?? "");
      const byReviewer = await reviewer(`${base()}/privacy/org`, {
        method: "DELETE",
        json: { confirmName: ORG_NAME },
      });
      expect(byReviewer.status).toBe(403);
      const wrong = await call()(`${base()}/privacy/org`, {
        method: "DELETE",
        json: { confirmName: "Not the name" },
      });
      expect(wrong.status).toBe(400);

      await ok(
        call()(`${base()}/privacy/org`, { method: "DELETE", json: { confirmName: ORG_NAME } }),
        202,
      );

      // R2
      expect((await FILES.list({ prefix: `orgs/${orgId}/` })).objects).toHaveLength(0);

      // Every table with an org column has no rows for this org.
      const tables = (
        await DB.prepare(
          "select name from sqlite_master where type='table' and name not like 'sqlite_%' and name not like '_cf_%'",
        ).all<{ name: string }>()
      ).results.map((r) => r.name);
      const leftovers: string[] = [];
      for (const t of tables) {
        const cols = (
          await DB.prepare(`select name from pragma_table_info('${t}')`).all<{ name: string }>()
        ).results.map((c) => c.name);
        for (const col of ["org_id", "organization_id", "private_to_org_id"]) {
          if (!cols.includes(col)) continue;
          const row = await DB.prepare(`select count(*) as n from "${t}" where "${col}" = ?`)
            .bind(orgId)
            .first<{ n: number }>();
          if ((row?.n ?? 0) > 0) leftovers.push(`${t}.${col}=${row?.n}`);
        }
      }
      const orgRow = await DB.prepare("select count(*) as n from organization where id = ?")
        .bind(orgId)
        .first<{ n: number }>();
      if ((orgRow?.n ?? 0) > 0) leftovers.push("organization");
      expect(leftovers, leftovers.join(", ")).toEqual([]);

      // The former owner (and reviewer) can no longer reach it; the other org is untouched.
      expect((await call()(base())).status).toBe(404);
      expect((await reviewer(`${base()}/applications`)).status).toBe(404);
      const mine = await ok<{ items: { id: string }[] }>(call()("/api/orgs"));
      expect(mine.items.map((o) => o.id)).not.toContain(orgId);
      const other = clientFor(s.other?.cookie ?? "");
      await ok(other(`/api/orgs/${s.other?.orgId}`));
      // The accounts themselves survive (org deletion is not account deletion).
      const relogin = await signIn(s.owner?.email ?? "", s.owner?.password ?? "");
      expect(relogin.res.status).toBe(200);
    },
    STEP_TIMEOUT,
  );
});
