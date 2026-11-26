// Deterministic FakeLlm handlers for the discovery module's LLM purposes ("discovery.*").
// Must return data that satisfies the zod schema the real call uses.
import type { FakeHandler } from "../../ports/fake-llm";

/** Text between "<label>:\n" and the next of the given terminators (see buildRequirementsPrompt). */
function block(prompt: string, label: string, until: string[]): string {
  const start = prompt.indexOf(`${label}:\n`);
  if (start < 0) return "";
  const from = start + label.length + 2;
  const ends = until.map((u) => prompt.indexOf(u, from)).filter((i) => i >= 0);
  return prompt.slice(from, ends.length ? Math.min(...ends) : undefined).trim();
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

/**
 * discovery.parse_requirements: headings ("# Title", "1. Title", "Section 2: Title") in the
 * description become sections (with "(N words)" limits); eligibility sentences become criteria.
 * Three or more headings => treated as a complete RFP.
 */
export const parseRequirementsFake: FakeHandler = (req) => {
  const description = block(req.prompt, "Description", ["\n\nEligibility:\n"]);
  const eligibility = block(req.prompt, "Eligibility", [
    "\n\nEligible applicant types:",
    "\n</untrusted_content>",
  ]);
  const sections: {
    key: string;
    title: string;
    prompt: string;
    kind: "narrative" | "budget";
    required: boolean;
    wordLimit: number | null;
    charLimit: number | null;
    guidance: string;
  }[] = [];
  const headingRe = /^(?:#{1,4}\s+|\d{1,2}[.)]\s+|section\s+\d+[:.]\s*)(.{3,100})$/i;
  const lines = description.split("\n").map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    const m = headingRe.exec(lines[i] ?? "");
    if (!m?.[1]) continue;
    const rawTitle = m[1].trim();
    const limit = /\((\d{2,5})\s*words?\)/i.exec(rawTitle);
    const title = rawTitle.replace(/\(.*?\)/g, "").trim();
    if (!title || sections.some((s) => s.key === slug(title))) continue;
    const next = lines[i + 1] ?? "";
    sections.push({
      key: slug(title) || `section_${sections.length + 1}`,
      title,
      prompt: next && !headingRe.test(next) ? next : "",
      kind: /budget/i.test(title) ? "budget" : "narrative",
      required: true,
      wordLimit: limit?.[1] ? Number(limit[1]) : null,
      charLimit: null,
      guidance: "",
    });
  }
  const eligibilityCriteria = eligibility
    .split(/(?<=[.;])\s+|\n/)
    .map((s) => s.replace(/[.;]$/, "").trim())
    .filter((s) => s.length > 3)
    .slice(0, 8);
  const grantsGov = /Source: grants_gov/.test(req.prompt);
  return {
    sections,
    attachments: [],
    eligibilityCriteria,
    submissionInstructions: grantsGov
      ? "Submit through Grants.gov Workspace (see the full announcement for required forms)."
      : "",
    complete: sections.length >= 3,
  };
};

interface FakePlan {
  keyword: string;
  rationale: string;
  eligibilityCodes: string[];
  fundingCategories: string[];
  assistanceListings: string[];
}

const TOPIC_PLANS: { re: RegExp; plan: Omit<FakePlan, "rationale"> }[] = [
  {
    re: /construction|carpentr|trades|apprentice/i,
    plan: {
      keyword: "pre-apprenticeship",
      eligibilityCodes: ["12"],
      fundingCategories: ["ELT"],
      assistanceListings: ["17.285"],
    },
  },
  {
    re: /tribal|native american|navajo|indian/i,
    plan: {
      keyword: "tribal workforce development",
      eligibilityCodes: ["07", "11", "12"],
      fundingCategories: ["ELT"],
      assistanceListings: [],
    },
  },
  {
    re: /housing|home repair/i,
    plan: {
      keyword: "housing rehabilitation",
      eligibilityCodes: [],
      fundingCategories: ["HO", "CD"],
      assistanceListings: [],
    },
  },
];

const clip = (s: string, max = 60) => {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ") > 10 ? cut.lastIndexOf(" ") : max).trim();
};

/**
 * discovery.plan_queries: one plan per profile focus area and per project title (from the
 * planner context), plus topic plans when the profile/facts/projects mention them. Deterministic.
 */
export const planQueriesFake: FakeHandler = (req) => {
  const text = req.context ?? "";
  const plans: FakePlan[] = [];
  const seen = new Set<string>();
  const add = (p: FakePlan) => {
    const k = p.keyword.toLowerCase();
    if (p.keyword.length < 2 || seen.has(k) || plans.length >= 12) return;
    seen.add(k);
    plans.push(p);
  };
  const focus = /^- Focus areas: (.+)$/m.exec(text)?.[1] ?? "";
  for (const area of focus
    .split(";")
    .map((a) => a.trim())
    .filter(Boolean)) {
    add({
      keyword: clip(area),
      rationale: `Profile focus area: ${clip(area, 120)}`,
      eligibilityCodes: [],
      fundingCategories: [],
      assistanceListings: [],
    });
  }
  const projects = text.split("<projects>")[1]?.split("</projects>")[0] ?? "";
  for (const m of projects.matchAll(/^\[(prj_[\w-]+)\] (.+?)(?: — | \(|$)/gm)) {
    if (m[1] && m[2]) {
      add({
        keyword: clip(m[2]),
        rationale: `Project [${m[1]}]`,
        eligibilityCodes: [],
        fundingCategories: [],
        assistanceListings: [],
      });
    }
  }
  for (const t of TOPIC_PLANS) {
    if (t.re.test(text))
      add({ ...t.plan, rationale: "Mentioned in the profile, facts or projects" });
  }
  return { plans };
};

export const fakeHandlers: Record<string, FakeHandler> = {
  "discovery.parse_requirements": parseRequirementsFake,
  "discovery.plan_queries": planQueriesFake,
};
