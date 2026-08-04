/**
 * Rich multi-dimensional card trait metadata framework.
 *
 * Expands items beyond generic dimensions into explicit psychological,
 * relational, and behavioral traits for deep programmatic choice
 * interpretation and transparent insight explainability.
 */

export const LOVE_LANGUAGES = [
  "Words of Affirmation",
  "Quality Time",
  "Physical Touch",
  "Acts of Service",
  "Receiving Gifts",
] as const;
export type LoveLanguage = (typeof LOVE_LANGUAGES)[number];

export const RELATIONAL_DRIVERS = [
  "Security & Safety",
  "Autonomy & Freedom",
  "Novelty & Adventure",
  "Status & Prestige",
  "Vulnerability & Intimacy",
  "Playfulness & Joy",
  "Intellectual Growth",
  "Harmony & Peace",
  "Structure & Predictability",
  "Spontaneity",
  "Nurturing & Care",
] as const;
export type RelationalDriver = (typeof RELATIONAL_DRIVERS)[number];

export const COMMUNICATION_STYLES = [
  "Direct & Explicit",
  "Gentle & Reassuring",
  "Action-Oriented",
  "Reflective & Deep",
  "Space-Giving",
] as const;
export type CommunicationStyle = (typeof COMMUNICATION_STYLES)[number];

export const LIFE_VISIONS = [
  "Shared Growth",
  "Legacy & Impact",
  "Family & Home",
  "Independence & Self-Actualization",
  "Financial Stability",
  "Community & Connection",
] as const;
export type LifeVision = (typeof LIFE_VISIONS)[number];

export const STRESS_RESPONSES = [
  "Co-Regulation",
  "Solitude / Space",
  "Practical Problem Solving",
  "Emotional Reassurance",
] as const;
export type StressResponse = (typeof STRESS_RESPONSES)[number];

export type EffortProfile = {
  timeIntensity: "Low" | "Medium" | "High";
  costLevel: "Low" | "Medium" | "High";
  vulnerabilityLevel: "Low" | "Medium" | "High";
  frequency: "Daily Routine" | "Weekly Practice" | "Periodic Event" | "Milestone";
};

export type CardTraitMetadata = {
  loveLanguages: LoveLanguage[];
  relationalDrivers: RelationalDriver[];
  communicationStyle: CommunicationStyle[];
  effortProfile: EffortProfile;
  lifeVision: LifeVision[];
  stressResponse: StressResponse[];
};

/** Default fallback profile for unannotated items */
export const DEFAULT_CARD_TRAITS: CardTraitMetadata = {
  loveLanguages: ["Quality Time"],
  relationalDrivers: ["Harmony & Peace"],
  communicationStyle: ["Gentle & Reassuring"],
  effortProfile: {
    timeIntensity: "Medium",
    costLevel: "Low",
    vulnerabilityLevel: "Low",
    frequency: "Weekly Practice",
  },
  lifeVision: ["Shared Growth"],
  stressResponse: ["Co-Regulation"],
};

/**
 * Curated registry mapping card slugs / labels to rich trait metadata.
 */
export const CARD_TRAITS_REGISTRY: Record<string, Partial<CardTraitMetadata>> = {
  // --- BEHAVIORS & AFFECTION ---
  "listens-fully": {
    loveLanguages: ["Quality Time", "Words of Affirmation"],
    relationalDrivers: ["Vulnerability & Intimacy", "Harmony & Peace"],
    communicationStyle: ["Reflective & Deep", "Gentle & Reassuring"],
    effortProfile: { timeIntensity: "Medium", costLevel: "Low", vulnerabilityLevel: "Medium", frequency: "Daily Routine" },
    lifeVision: ["Shared Growth"],
    stressResponse: ["Emotional Reassurance", "Co-Regulation"],
  },
  "plans-dates": {
    loveLanguages: ["Quality Time", "Acts of Service"],
    relationalDrivers: ["Playfulness & Joy", "Novelty & Adventure"],
    communicationStyle: ["Action-Oriented"],
    effortProfile: { timeIntensity: "High", costLevel: "Medium", vulnerabilityLevel: "Low", frequency: "Weekly Practice" },
    lifeVision: ["Shared Growth"],
    stressResponse: ["Practical Problem Solving"],
  },
  "handles-logistics": {
    loveLanguages: ["Acts of Service"],
    relationalDrivers: ["Security & Safety", "Structure & Predictability"],
    communicationStyle: ["Action-Oriented"],
    effortProfile: { timeIntensity: "High", costLevel: "Low", vulnerabilityLevel: "Low", frequency: "Daily Routine" },
    lifeVision: ["Financial Stability", "Family & Home"],
    stressResponse: ["Practical Problem Solving"],
  },
  "cooks-for-you": {
    loveLanguages: ["Acts of Service", "Quality Time"],
    relationalDrivers: ["Nurturing & Care", "Harmony & Peace"],
    communicationStyle: ["Gentle & Reassuring"],
    effortProfile: { timeIntensity: "Medium", costLevel: "Low", vulnerabilityLevel: "Low", frequency: "Daily Routine" },
    lifeVision: ["Family & Home"],
    stressResponse: ["Co-Regulation"],
  },
  "handles-conflict": {
    loveLanguages: ["Words of Affirmation", "Quality Time"],
    relationalDrivers: ["Vulnerability & Intimacy", "Security & Safety"],
    communicationStyle: ["Direct & Explicit", "Reflective & Deep"],
    effortProfile: { timeIntensity: "Medium", costLevel: "Low", vulnerabilityLevel: "High", frequency: "Weekly Practice" },
    lifeVision: ["Shared Growth"],
    stressResponse: ["Co-Regulation", "Emotional Reassurance"],
  },
  "co-regulates-stress": {
    loveLanguages: ["Physical Touch", "Words of Affirmation"],
    relationalDrivers: ["Security & Safety", "Harmony & Peace"],
    communicationStyle: ["Gentle & Reassuring"],
    effortProfile: { timeIntensity: "Medium", costLevel: "Low", vulnerabilityLevel: "Medium", frequency: "Daily Routine" },
    lifeVision: ["Shared Growth"],
    stressResponse: ["Co-Regulation", "Emotional Reassurance"],
  },

  // --- RELATIONSHIP & COMMUNICATION ---
  "repairs-after-fights": {
    loveLanguages: ["Words of Affirmation", "Quality Time"],
    relationalDrivers: ["Harmony & Peace", "Vulnerability & Intimacy"],
    communicationStyle: ["Direct & Explicit", "Gentle & Reassuring"],
    effortProfile: { timeIntensity: "Medium", costLevel: "Low", vulnerabilityLevel: "High", frequency: "Periodic Event" },
    lifeVision: ["Shared Growth"],
    stressResponse: ["Co-Regulation", "Emotional Reassurance"],
  },
  "gives-you-space": {
    loveLanguages: ["Quality Time"],
    relationalDrivers: ["Autonomy & Freedom"],
    communicationStyle: ["Space-Giving"],
    effortProfile: { timeIntensity: "Low", costLevel: "Low", vulnerabilityLevel: "Low", frequency: "Daily Routine" },
    lifeVision: ["Independence & Self-Actualization"],
    stressResponse: ["Solitude / Space"],
  },
  "names-needs-directly": {
    loveLanguages: ["Words of Affirmation"],
    relationalDrivers: ["Security & Safety", "Structure & Predictability"],
    communicationStyle: ["Direct & Explicit"],
    effortProfile: { timeIntensity: "Low", costLevel: "Low", vulnerabilityLevel: "High", frequency: "Daily Routine" },
    lifeVision: ["Shared Growth"],
    stressResponse: ["Practical Problem Solving"],
  },
  "timeout-and-return": {
    loveLanguages: ["Quality Time"],
    relationalDrivers: ["Structure & Predictability", "Security & Safety"],
    communicationStyle: ["Direct & Explicit", "Space-Giving"],
    effortProfile: { timeIntensity: "Low", costLevel: "Low", vulnerabilityLevel: "Medium", frequency: "Periodic Event" },
    lifeVision: ["Shared Growth"],
    stressResponse: ["Solitude / Space", "Co-Regulation"],
  },

  // --- CHARACTER & VALUES ---
  "kind": {
    loveLanguages: ["Words of Affirmation", "Acts of Service"],
    relationalDrivers: ["Nurturing & Care", "Harmony & Peace"],
    communicationStyle: ["Gentle & Reassuring"],
    effortProfile: { timeIntensity: "Low", costLevel: "Low", vulnerabilityLevel: "Low", frequency: "Daily Routine" },
    lifeVision: ["Community & Connection"],
    stressResponse: ["Emotional Reassurance"],
  },
  "emotionally-open": {
    loveLanguages: ["Words of Affirmation", "Quality Time"],
    relationalDrivers: ["Vulnerability & Intimacy"],
    communicationStyle: ["Reflective & Deep", "Direct & Explicit"],
    effortProfile: { timeIntensity: "Medium", costLevel: "Low", vulnerabilityLevel: "High", frequency: "Daily Routine" },
    lifeVision: ["Shared Growth"],
    stressResponse: ["Co-Regulation", "Emotional Reassurance"],
  },
  "spontaneous": {
    loveLanguages: ["Quality Time"],
    relationalDrivers: ["Spontaneity", "Novelty & Adventure"],
    communicationStyle: ["Direct & Explicit"],
    effortProfile: { timeIntensity: "Medium", costLevel: "Low", vulnerabilityLevel: "Low", frequency: "Weekly Practice" },
    lifeVision: ["Independence & Self-Actualization"],
    stressResponse: ["Solitude / Space"],
  },
  "calm-under-pressure": {
    loveLanguages: ["Acts of Service"],
    relationalDrivers: ["Security & Safety", "Structure & Predictability"],
    communicationStyle: ["Gentle & Reassuring", "Action-Oriented"],
    effortProfile: { timeIntensity: "Low", costLevel: "Low", vulnerabilityLevel: "Low", frequency: "Daily Routine" },
    lifeVision: ["Financial Stability", "Family & Home"],
    stressResponse: ["Practical Problem Solving", "Co-Regulation"],
  },

  // --- LIFESTYLE & INTIMACY ---
  "talks-about-desire": {
    loveLanguages: ["Words of Affirmation", "Physical Touch"],
    relationalDrivers: ["Vulnerability & Intimacy", "Playfulness & Joy"],
    communicationStyle: ["Direct & Explicit", "Reflective & Deep"],
    effortProfile: { timeIntensity: "Medium", costLevel: "Low", vulnerabilityLevel: "High", frequency: "Weekly Practice" },
    lifeVision: ["Shared Growth"],
    stressResponse: ["Co-Regulation"],
  },
  "micro-adventures": {
    loveLanguages: ["Quality Time"],
    relationalDrivers: ["Novelty & Adventure", "Spontaneity", "Playfulness & Joy"],
    communicationStyle: ["Action-Oriented"],
    effortProfile: { timeIntensity: "Medium", costLevel: "Low", vulnerabilityLevel: "Low", frequency: "Weekly Practice" },
    lifeVision: ["Shared Growth"],
    stressResponse: ["Practical Problem Solving"],
  },
  "parallel-play": {
    loveLanguages: ["Quality Time"],
    relationalDrivers: ["Autonomy & Freedom", "Harmony & Peace"],
    communicationStyle: ["Space-Giving"],
    effortProfile: { timeIntensity: "Medium", costLevel: "Low", vulnerabilityLevel: "Low", frequency: "Daily Routine" },
    lifeVision: ["Independence & Self-Actualization"],
    stressResponse: ["Solitude / Space"],
  },
};

/**
 * Gets or synthesizes rich card trait metadata for any item.
 */
export function getTraitsForItem(item: {
  slug?: string;
  label: string;
  category?: string | null;
  dimensions?: string[];
}): CardTraitMetadata {
  const slug = item.slug ?? item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const registered = CARD_TRAITS_REGISTRY[slug] || CARD_TRAITS_REGISTRY[item.label];

  if (registered) {
    return {
      loveLanguages: registered.loveLanguages ?? DEFAULT_CARD_TRAITS.loveLanguages,
      relationalDrivers: registered.relationalDrivers ?? DEFAULT_CARD_TRAITS.relationalDrivers,
      communicationStyle: registered.communicationStyle ?? DEFAULT_CARD_TRAITS.communicationStyle,
      effortProfile: registered.effortProfile ?? DEFAULT_CARD_TRAITS.effortProfile,
      lifeVision: registered.lifeVision ?? DEFAULT_CARD_TRAITS.lifeVision,
      stressResponse: registered.stressResponse ?? DEFAULT_CARD_TRAITS.stressResponse,
    };
  }

  // Synthesize traits intelligently from category & dimensions if not explicitly registered
  return synthesizeTraitsFromCategoryAndDimensions(item.label, item.category ?? null, item.dimensions ?? []);
}

function synthesizeTraitsFromCategoryAndDimensions(
  label: string,
  category: string | null,
  dimensions: string[]
): CardTraitMetadata {
  const lbl = label.toLowerCase();
  const loveLangs = new Set<LoveLanguage>();
  const drivers = new Set<RelationalDriver>();
  const comms = new Set<CommunicationStyle>();
  const lifeVisions = new Set<LifeVision>();
  const stressResps = new Set<StressResponse>();

  // Dimension inference
  if (dimensions.includes("warmth")) {
    loveLangs.add("Words of Affirmation");
    loveLangs.add("Quality Time");
    drivers.add("Vulnerability & Intimacy");
    drivers.add("Harmony & Peace");
    stressResps.add("Co-Regulation");
    stressResps.add("Emotional Reassurance");
  }
  if (dimensions.includes("service")) {
    loveLangs.add("Acts of Service");
    drivers.add("Nurturing & Care");
    comms.add("Action-Oriented");
    stressResps.add("Practical Problem Solving");
  }
  if (dimensions.includes("physicality")) {
    loveLangs.add("Physical Touch");
    drivers.add("Playfulness & Joy");
  }
  if (dimensions.includes("adventure")) {
    loveLangs.add("Quality Time");
    drivers.add("Novelty & Adventure");
    drivers.add("Spontaneity");
    lifeVisions.add("Shared Growth");
  }
  if (dimensions.includes("stability")) {
    drivers.add("Security & Safety");
    drivers.add("Structure & Predictability");
    comms.add("Direct & Explicit");
    lifeVisions.add("Financial Stability");
    lifeVisions.add("Family & Home");
  }
  if (dimensions.includes("independence")) {
    drivers.add("Autonomy & Freedom");
    comms.add("Space-Giving");
    lifeVisions.add("Independence & Self-Actualization");
    stressResps.add("Solitude / Space");
  }
  if (dimensions.includes("ambition") || dimensions.includes("status")) {
    drivers.add("Status & Prestige");
    lifeVisions.add("Legacy & Impact");
    comms.add("Action-Oriented");
  }
  if (dimensions.includes("intellect")) {
    drivers.add("Intellectual Growth");
    comms.add("Reflective & Deep");
    lifeVisions.add("Shared Growth");
  }

  // Label heuristics fallback
  if (lbl.includes("touch") || lbl.includes("hold") || lbl.includes("kiss") || lbl.includes("sex")) {
    loveLangs.add("Physical Touch");
    drivers.add("Vulnerability & Intimacy");
  }
  if (lbl.includes("gift") || lbl.includes("surprises") || lbl.includes("note")) {
    loveLangs.add("Receiving Gifts");
  }
  if (lbl.includes("listen") || lbl.includes("talk") || lbl.includes("say")) {
    loveLangs.add("Words of Affirmation");
  }

  // Fallbacks if empty
  if (loveLangs.size === 0) loveLangs.add("Quality Time");
  if (drivers.size === 0) drivers.add("Harmony & Peace");
  if (comms.size === 0) comms.add("Gentle & Reassuring");
  if (lifeVisions.size === 0) lifeVisions.add("Shared Growth");
  if (stressResps.size === 0) stressResps.add("Co-Regulation");

  const vulnerabilityLevel: "Low" | "Medium" | "High" =
    category === "Intimacy" || lbl.includes("vulnerab") || lbl.includes("conflict") || lbl.includes("desire")
      ? "High"
      : category === "Communication" || category === "Affection"
      ? "Medium"
      : "Low";

  return {
    loveLanguages: [...loveLangs],
    relationalDrivers: [...drivers],
    communicationStyle: [...comms],
    effortProfile: {
      timeIntensity: category === "Aviation and travel" || category === "Fitness" ? "High" : "Medium",
      costLevel: category === "Business and finance" || category === "Aviation and travel" ? "High" : "Low",
      vulnerabilityLevel,
      frequency: category === "Behaviour" || category === "Affection" ? "Daily Routine" : "Weekly Practice",
    },
    lifeVision: [...lifeVisions],
    stressResponse: [...stressResps],
  };
}
