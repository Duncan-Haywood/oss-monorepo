// Deterministic FakeLlm handlers for the prospecting module ("prospecting.*").
// Must return data that satisfies the zod schema the real call uses, and cite only ids present in
// the request (funder facts in the prompt, org facts in the context).
//
// "prospecting.score": geography + giving heuristics. Same state +20, funder city among the org's
// places +20, grantmaker with reported giving +15 (more for larger giving); org facts that mention
// the funder's city or state name are cited for the geography reason.
import type { FakeHandler } from "../../ports/fake-llm";
import type { LlmRequestBase } from "../../ports/llm";
import { PROSPECT_SCORE_PURPOSE, type ProspectScoreOutput } from "./scoring";

const STATE_NAMES: Record<string, string> = {
  AZ: "arizona",
  CO: "colorado",
  NM: "new mexico",
  TX: "texas",
  UT: "utah",
};

const section = (text: string, tag: string) =>
  text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? "";
const field = (block: string, name: string) =>
  block.match(new RegExp(`^${name}: (.*)$`, "m"))?.[1]?.trim() ?? "";

export function fakeProspectScore(req: LlmRequestBase): ProspectScoreOutput {
  const funder = section(req.prompt, "funder") || req.prompt;
  const context = req.context ?? "";
  const geo = section(context, "org_geography");
  const orgStates = field(geo, "org_states")
    .split(";")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const orgPlaces = field(geo, "org_places")
    .split(";")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const funderIds = new Set(funder.match(/\bff_[a-z_]+\b/g) ?? []);
  const cite = (id: string) => (funderIds.has(id) ? [id] : []);

  const state = field(funder, "funder_state").toUpperCase();
  const city = field(funder, "funder_city").toLowerCase();
  const type = field(funder, "foundation_type");
  const givingRaw = field(funder, "total_giving_cents");
  const giving = /^\d+$/.test(givingRaw) ? Number(givingRaw) : null;

  const reasons: ProspectScoreOutput["reasons"] = [];
  let score = 25;
  const sameState = state !== "" && orgStates.includes(state);
  const local = city !== "" && orgPlaces.some((p) => p.includes(city) || city.includes(p));
  if (sameState) score += 20;
  if (local) score += 20;

  const placeWords = [city, STATE_NAMES[state] ?? ""].filter((w) => w.length > 2);
  const geoFacts = (section(context, "facts").match(/^\[fct_[0-9a-z]+\].*$/gm) ?? [])
    .filter((line) => placeWords.some((w) => line.toLowerCase().includes(w)))
    .map((line) => line.match(/fct_[0-9a-z]+/)?.[0] ?? "")
    .filter(Boolean)
    .slice(0, 2);
  if (sameState || local) {
    reasons.push({
      text: local
        ? "The foundation is based in the community the organization serves."
        : "The foundation is based in the same state as the organization.",
      polarity: "positive",
      factIds: [...cite("ff_location"), ...geoFacts],
    });
  } else {
    reasons.push({
      text: "The foundation is based outside the organization's state; out-of-state giving is uncommon for small foundations.",
      polarity: "negative",
      factIds: cite("ff_location"),
    });
  }

  if (type === "private_operating") {
    reasons.push({
      text: "Operating foundations mostly run their own programs rather than making grants.",
      polarity: "negative",
      factIds: cite("ff_type"),
    });
  } else if (giving != null && giving > 0) {
    score += giving >= 50_000_000 ? 25 : 15;
    reasons.push({
      text: "Reported grants paid indicate an active grantmaker.",
      polarity: "positive",
      factIds: [...cite("ff_type"), ...cite("ff_giving")],
    });
  } else {
    reasons.push({
      text: "Giving history cannot be confirmed from the available data.",
      polarity: "neutral",
      factIds: cite("ff_giving"),
    });
  }

  const approach: ProspectScoreOutput["approach"] =
    type === "private_operating"
      ? "wait_for_rfp"
      : giving != null && giving > 0
        ? "letter_of_inquiry"
        : "research_first";
  return {
    fitScore: Math.min(score, 95),
    approach,
    approachNotes:
      approach === "letter_of_inquiry"
        ? "Review the grants list on the 990-PF (Part XV) and confirm the foundation accepts unsolicited requests before sending a one-page letter of inquiry."
        : approach === "wait_for_rfp"
          ? "Watch for a published funding opportunity; a cold approach is unlikely to help."
          : "Open the latest 990-PF to confirm grants paid and grantees before deciding on an approach.",
    reasons,
  };
}

export const fakeHandlers: Record<string, FakeHandler> = {
  [PROSPECT_SCORE_PURPOSE]: fakeProspectScore,
};
