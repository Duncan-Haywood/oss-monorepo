import { DIMENSION_LABELS, Dimension, DIMENSIONS } from "@/lib/surveyData";

export type ScoredItem = {
  label: string;
  rating: number;
  rd: number;
  dimensions: string[];
};

export type DimensionScore = {
  key: Dimension;
  label: string;
  /** Mean rating of items carrying this dimension, in Glicko points. */
  score: number;
  /** Relative to the person's own average across all rated items. */
  delta: number;
  /** How many rated items fed this score — below ~3 it's noise. */
  n: number;
  /** Standard error of the mean, for the confidence band. */
  se: number;
};

export type PersonalityArchetype = {
  name: string;
  tagline: string;
  traits: string[];
  description: string;
};

/**
 * Rolls per-item ratings up into per-dimension scores weighted by certainty (1/rd²).
 */
export function scoreDimensions(items: ScoredItem[]): DimensionScore[] {
  const rated = items.filter((i) => i.rd < 349 && i.dimensions.length > 0);
  if (rated.length === 0) return [];

  let wSum = 0;
  let wxSum = 0;
  for (const i of rated) {
    const w = 1 / (i.rd * i.rd);
    wSum += w;
    wxSum += w * i.rating;
  }
  const overall = wxSum / wSum;

  const out: DimensionScore[] = [];
  for (const key of DIMENSIONS) {
    const members = rated.filter((i) => i.dimensions.includes(key));
    if (members.length === 0) continue;

    let w = 0;
    let wx = 0;
    for (const m of members) {
      const wi = 1 / (m.rd * m.rd);
      w += wi;
      wx += wi * m.rating;
    }
    const score = wx / w;
    const se = Math.sqrt(1 / w);

    out.push({
      key,
      label: DIMENSION_LABELS[key],
      score,
      delta: score - overall,
      n: members.length,
      se,
    });
  }

  return out.sort((a, b) => b.delta - a.delta);
}

/**
 * Maps top dimension scores into deep psychometric personality archetypes.
 */
export function synthesizeArchetype(scores: DimensionScore[]): PersonalityArchetype | null {
  const solid = scores.filter((s) => s.n >= 2 && s.delta > 0);
  if (solid.length === 0) return null;

  const topKeys = new Set(solid.slice(0, 3).map((s) => s.key));

  if (topKeys.has("warmth") && (topKeys.has("service") || topKeys.has("family"))) {
    return {
      name: "The Devoted Anchor",
      tagline: "High Empathy & Relational Depth",
      traits: ["Deeply Altruistic", "Family-Oriented", "Emotionally Attuned"],
      description: "You prioritize genuine warmth, mutual care, and emotional safety over external competition or status.",
    };
  }

  if (topKeys.has("ambition") && (topKeys.has("status") || topKeys.has("stability"))) {
    return {
      name: "The Driven Architect",
      tagline: "High Mastery & Future Building",
      traits: ["Purpose-Driven", "High Standards", "Resilient Focus"],
      description: "You are energized by tangible accomplishment, leadership, and building a secure, high-achieving life together.",
    };
  }

  if (topKeys.has("adventure") && (topKeys.has("independence") || topKeys.has("physicality"))) {
    return {
      name: "The Fearless Co-Pilot",
      tagline: "High Autonomy & Experiential Curiosity",
      traits: ["Self-Directed", "Risk-Tolerant", "Exploratory Spirit"],
      description: "You value freedom, novel experiences, and exploring the world as partners over predictable routines.",
    };
  }

  if (topKeys.has("intellect") && (topKeys.has("creativity") || topKeys.has("independence"))) {
    return {
      name: "The Mindful Craftsperson",
      tagline: "High Curiosity & Creative Expression",
      traits: ["Deep Thinker", "Creative Problem Solver", "Original Mind"],
      description: "You seek intellectual depth, rich conversation, and meaningful creative expression in your shared life.",
    };
  }

  if (topKeys.has("stability") && (topKeys.has("physicality") || topKeys.has("warmth"))) {
    return {
      name: "The Grounded Sanctuary",
      tagline: "High Reliability & Calm Strength",
      traits: ["Calm Under Pressure", "Grounded Discipline", "Rock-Solid Partner"],
      description: "You provide steady, unshakeable calm and practical dependability when life gets noisy or chaotic.",
    };
  }

  if (topKeys.has("creativity") && (topKeys.has("warmth") || topKeys.has("adventure"))) {
    return {
      name: "The Playful Spark",
      tagline: "High Spontaneity & Joyful Connection",
      traits: ["Shared Laughter", "Naturally Romantic", "Expressive"],
      description: "You thrive on spontaneous romance, shared humor, and keeping a joyful, vibrant energy in your relationship.",
    };
  }

  return {
    name: "The Balanced Harmonizer",
    tagline: "Well-Rounded Preference Profile",
    traits: ["Adaptable", "Multifaceted", "Harmonious Focus"],
    description: "Your preferences show an exceptionally balanced integration of warmth, ambition, independence, and stability.",
  };
}

export function describeDimensions(scores: DimensionScore[], totalAnswers: number): string | null {
  const solid = scores.filter((s) => s.n >= 2);
  if (solid.length < 2) return null;

  const top = solid[0];
  const bottom = solid[solid.length - 1];
  const archetype = synthesizeArchetype(scores);

  if (top.delta - bottom.delta < 15) {
    return "So far your preferences look fairly even across the board — no single trait is dominating yet.";
  }

  const hedge =
    totalAnswers < 40
      ? "Early read: "
      : totalAnswers < 100
        ? "Fairly consistent profile: "
        : "Clear pattern: ";

  return `${hedge}You align strongly with ${top.label.toLowerCase()}${archetype ? ` (${archetype.name})` : ""}, while placing lower priority on ${bottom.label.toLowerCase()}.`;
}
