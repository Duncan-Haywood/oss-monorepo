import type { Dimension } from "@/lib/surveyData";

/** Versioned, auditable interpretation metadata produced by AI-assisted curation. */
export const CARD_METADATA_VERSION = "relationship-signals-v1";
export type SignalFamily = "need" | "bond" | "style" | "future" | "tension";
export type RelationshipTheme =
  | "emotional-safety"
  | "practical-support"
  | "novelty-adventure"
  | "shared-vision"
  | "autonomy-boundaries"
  | "intimacy-affection";

export const THEME_LABELS: Record<RelationshipTheme, string> = {
  "emotional-safety": "Emotional Safety & Attunement",
  "practical-support": "Practical Support & Care",
  "novelty-adventure": "Novelty & Shared Adventure",
  "shared-vision": "Shared Vision & Values",
  "autonomy-boundaries": "Autonomy & Personal Space",
  "intimacy-affection": "Intimacy & Affection",
};

export type CardSignal = { key: string; label: string; family: SignalFamily; weight: number; rationale: string };
export type CardMetadata = {
  version: typeof CARD_METADATA_VERSION;
  source: "ai-assisted-curation";
  signals: CardSignal[];
  contexts: string[];
  themes: RelationshipTheme[];
};

type SignalSeed = Omit<CardSignal, "weight">;

const SIGNALS: Record<Dimension, SignalSeed[]> = {
  warmth: [
    { key: "emotional-attunement", label: "Emotional attunement", family: "need", rationale: "This choice signals wanting care that notices and responds." },
    { key: "felt-safety", label: "Felt safety", family: "bond", rationale: "Warm, responsive behavior tends to make closeness feel safer." },
    { key: "gentle-repair", label: "Gentle repair", family: "style", rationale: "It favors connection-preserving responses over winning." },
  ],
  ambition: [
    { key: "shared-growth", label: "Shared growth", family: "future", rationale: "This choice favors progress, mastery, or building toward something." },
    { key: "high-standards", label: "High standards", family: "need", rationale: "It suggests admiration for effort and meaningful achievement." },
    { key: "drive-vs-presence", label: "Drive vs presence", family: "tension", rationale: "Pursuit and availability can compete for the same time and energy." },
  ],
  status: [
    { key: "social-standing", label: "Social standing", family: "need", rationale: "This option carries visible achievement, recognition, or prestige." },
    { key: "public-private-self", label: "Public image vs private life", family: "tension", rationale: "External recognition can compete with private ease and authenticity." },
    { key: "expansive-life", label: "An expansive life", family: "future", rationale: "It points toward access, influence, or a larger social world." },
  ],
  adventure: [
    { key: "novelty", label: "Novelty and aliveness", family: "need", rationale: "This choice carries exploration, intensity, or new experience." },
    { key: "co-adventure", label: "Co-adventure", family: "bond", rationale: "Shared novelty can be a primary way of feeling connected." },
    { key: "freedom-vs-routine", label: "Freedom vs routine", family: "tension", rationale: "Spontaneity and predictability often pull in different directions." },
  ],
  stability: [
    { key: "reliability", label: "Reliability", family: "need", rationale: "This option signals follow-through, predictability, or practical security." },
    { key: "secure-base", label: "A secure base", family: "bond", rationale: "Consistency appears to be part of how closeness is sustained." },
    { key: "planned-life", label: "A planned, durable life", family: "future", rationale: "It favors foundations that remain dependable over time." },
  ],
  intellect: [
    { key: "mental-connection", label: "Mental connection", family: "bond", rationale: "This choice suggests ideas and curiosity are routes to intimacy." },
    { key: "curiosity", label: "Curiosity and depth", family: "need", rationale: "It rewards learning, complexity, or thoughtful engagement." },
    { key: "analysis-vs-feeling", label: "Analysis vs feeling", family: "tension", rationale: "Thinking through an issue can sometimes displace emotional presence." },
  ],
  creativity: [
    { key: "expression", label: "Expression and play", family: "need", rationale: "This option carries originality, beauty, humor, or imagination." },
    { key: "playful-bond", label: "Playful connection", family: "bond", rationale: "Creating or delighting together may be a route to closeness." },
    { key: "made-not-bought", label: "A life made, not merely consumed", family: "future", rationale: "It points toward authorship, craft, and personal expression." },
  ],
  service: [
    { key: "practical-care", label: "Practical care", family: "style", rationale: "This choice turns care into useful action, duty, or contribution." },
    { key: "mutual-support", label: "Mutual support", family: "bond", rationale: "Showing up for one another appears central to connection." },
    { key: "care-vs-overgiving", label: "Care vs over-giving", family: "tension", rationale: "Service can become imbalance when needs and limits stay unspoken." },
  ],
  physicality: [
    { key: "embodied-connection", label: "Embodied connection", family: "bond", rationale: "This option makes touch, vitality, or shared activity salient." },
    { key: "health-energy", label: "Health and energy", family: "future", rationale: "It signals wanting an active, physically capable shared life." },
    { key: "physical-presence", label: "Physical presence", family: "need", rationale: "Closeness may be felt through touch, proximity, or doing." },
  ],
  spirituality: [
    { key: "shared-meaning", label: "Shared meaning", family: "bond", rationale: "This choice connects partnership with moral or spiritual purpose." },
    { key: "principled-life", label: "A principled life", family: "future", rationale: "It favors a life organized around convictions beyond convenience." },
    { key: "tradition-vs-autonomy", label: "Tradition vs autonomy", family: "tension", rationale: "Inherited commitments and individual choice may need negotiation." },
  ],
  family: [
    { key: "belonging", label: "Belonging and family", family: "need", rationale: "This option emphasizes kinship, continuity, or being a team." },
    { key: "we-identity", label: "A strong “we”", family: "bond", rationale: "Partnership is framed as a durable unit rather than two parallel lives." },
    { key: "family-shaped-future", label: "A family-shaped future", family: "future", rationale: "It points toward roots, caregiving, or intergenerational continuity." },
  ],
  independence: [
    { key: "autonomy", label: "Autonomy", family: "need", rationale: "This choice protects self-direction, boundaries, or room to act." },
    { key: "chosen-closeness", label: "Chosen closeness", family: "bond", rationale: "Connection is strongest when it leaves both people fully themselves." },
    { key: "space-vs-togetherness", label: "Space vs togetherness", family: "tension", rationale: "Individual freedom and shared access require explicit calibration." },
  ],
};

const CONTEXTS: Record<string, string[]> = {
  Behaviour: ["everyday care", "mental load", "follow-through"],
  Affection: ["reassurance", "love expression", "micro-moments"],
  Relationship: ["relationship standards", "shared direction", "repair"],
  Communication: ["conflict", "understanding", "emotional access"],
  Intimacy: ["vulnerability", "desire", "closeness"],
  Lifestyle: ["daily rhythm", "home life", "time use"],
  Values: ["identity", "meaning", "life priorities"],
  Character: ["partner character", "trust", "admiration"],
};

export function metadataForCard(item: { label?: string; dimensions?: readonly string[]; category?: string | null }): CardMetadata {
  const signals = (item.dimensions ?? []).flatMap((dimension, index) => {
    const weight = index === 0 ? 1 : Math.max(0.55, 0.78 - index * 0.08);
    return (SIGNALS[dimension as Dimension] ?? []).map((seed) => ({ ...seed, weight }));
  });

  const dims = item.dimensions ?? [];
  const themesSet = new Set<RelationshipTheme>();
  if (dims.includes("warmth") || item.category === "Communication" || item.category === "Relationship" || item.category === "Stress and support") {
    themesSet.add("emotional-safety");
    themesSet.add("intimacy-affection");
  }
  if (dims.includes("service") || dims.includes("stability") || item.category === "Behaviour") {
    themesSet.add("practical-support");
  }
  if (dims.includes("adventure") || item.category === "Lifestyle") {
    themesSet.add("novelty-adventure");
  }
  if (dims.includes("family") || dims.includes("ambition") || item.category === "Values" || item.category === "Future and family") {
    themesSet.add("shared-vision");
  }
  if (dims.includes("independence")) {
    themesSet.add("autonomy-boundaries");
  }
  if (themesSet.size === 0) themesSet.add("emotional-safety");

  return {
    version: CARD_METADATA_VERSION,
    source: "ai-assisted-curation",
    signals,
    contexts: item.category ? (CONTEXTS[item.category] ?? [item.category.toLowerCase()]) : [],
    themes: [...themesSet],
  };
}

/** Seed-time alias: persisted metadata and runtime fallback use one taxonomy. */
export const buildCardMetadata = metadataForCard;

export function parseCardMetadata(value: unknown): CardMetadata | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CardMetadata>;
  return candidate.version && Array.isArray(candidate.signals)
    ? (candidate as CardMetadata)
    : null;
}

export type DeepProfileEvidence = {
  label: string; category: string | null; contribution: number;
  direction: "supports" | "pushes-against"; rationale: string;
};
export type DeepProfileSignal = {
  key: string; label: string; family: SignalFamily; score: number; evidenceCount: number;
  confidence: "early" | "developing" | "strong"; explanation: string; evidence: DeepProfileEvidence[];
};

export function buildDeepProfile(
  items: { label: string; category: string | null; rating: number; rd: number; dimensions: string[] }[],
): { version: string; signals: DeepProfileSignal[]; coverage: number } | null {
  const rated = items.filter((item) => item.rd < 349 && item.dimensions.length);
  if (rated.length < 5) return null;
  const weightedMean = rated.reduce((sum, item) => sum + item.rating / item.rd ** 2, 0)
    / rated.reduce((sum, item) => sum + 1 / item.rd ** 2, 0);
  const grouped = new Map<string, { seed: CardSignal; rows: DeepProfileEvidence[]; weighted: number; weight: number }>();

  for (const item of rated) {
    const certainty = Math.min(1, 140 / Math.max(item.rd, 70));
    const relative = (item.rating - weightedMean) / 100;
    for (const signal of metadataForCard(item).signals) {
      const contribution = relative * certainty * signal.weight;
      const current = grouped.get(signal.key) ?? { seed: signal, rows: [], weighted: 0, weight: 0 };
      current.weighted += contribution;
      current.weight += certainty * signal.weight;
      current.rows.push({
        label: item.label, category: item.category, contribution,
        direction: contribution >= 0 ? "supports" : "pushes-against", rationale: signal.rationale,
      });
      grouped.set(signal.key, current);
    }
  }

  const signals = [...grouped.values()]
    .filter((group) => group.rows.length >= 2)
    .map((group) => {
      const evidence = group.rows.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 4);
      const score = group.weight ? (group.weighted / group.weight) * 100 : 0;
      const confidence = group.rows.length >= 8 ? "strong" as const : group.rows.length >= 4 ? "developing" as const : "early" as const;
      const supporting = evidence.filter((row) => row.direction === "supports").map((row) => row.label);
      return {
        key: group.seed.key, label: group.seed.label, family: group.seed.family, score,
        evidenceCount: group.rows.length, confidence,
        explanation: supporting.length
          ? `You repeatedly favored choices associated with ${group.seed.label.toLowerCase()}, especially ${supporting.slice(0, 2).join(" and ")}.`
          : `Your choices currently place less emphasis on ${group.seed.label.toLowerCase()}.`,
        evidence,
      };
    })
    .filter((signal) => Math.abs(signal.score) >= 4)
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
  return signals.length ? { version: CARD_METADATA_VERSION, signals: signals.slice(0, 12), coverage: rated.length } : null;
}
