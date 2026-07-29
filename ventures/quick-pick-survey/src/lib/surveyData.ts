/**
 * Underlying dimensions an item signals. Items are tagged with these so the
 * dashboard can say "you value warmth over status" rather than only listing
 * items — the ratings roll up into dimension scores, which is what people
 * actually want to know about themselves.
 */
export const DIMENSIONS = [
  "warmth",
  "ambition",
  "status",
  "adventure",
  "stability",
  "intellect",
  "creativity",
  "service",
  "physicality",
  "spirituality",
  "family",
  "independence",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const DIMENSION_LABELS: Record<Dimension, string> = {
  warmth: "Warmth & kindness",
  ambition: "Drive & ambition",
  status: "Status & prestige",
  adventure: "Adventure & risk",
  stability: "Stability & reliability",
  intellect: "Intellect & curiosity",
  creativity: "Creativity & expression",
  service: "Service & duty",
  physicality: "Physicality & health",
  spirituality: "Spirituality & meaning",
  family: "Family orientation",
  independence: "Independence & self-direction",
};

export type AttachmentSignal =
  | "secure-building"
  | "anxious-soothing"
  | "avoidant-triggering"
  | "autonomy-preserving"
  | "merger-oriented";

export type ConflictStyle =
  | "de-escalating"
  | "direct-repair"
  | "reflective-pause"
  | "expressive-venting"
  | "problem-solving";

export type LoveLanguage =
  | "acts_of_service"
  | "words_of_affirmation"
  | "quality_time"
  | "physical_touch"
  | "emotional_attunement"
  | "shared_meaning";

export type GottmanTier =
  | "bids_for_connection"
  | "admiration_appreciation"
  | "turning_towards"
  | "shared_meaning"
  | "de_escalation";

export type LifestylePace =
  | "fast_active"
  | "steady_routine"
  | "contemplative_slow"
  | "flexible_spontaneous";

export type StressResponse =
  | "co_regulation"
  | "solitary_space"
  | "practical_action"
  | "verbal_processing";

export type CardMetadata = {
  attachmentSignal: AttachmentSignal;
  conflictStyle: ConflictStyle;
  loveLanguage: LoveLanguage;
  gottmanTier: GottmanTier;
  lifestylePace: LifestylePace;
  stressResponse: StressResponse;
  vulnerabilityScore: number; // 1-5
  relationalImportance: number; // 1-5
  explainableRationale: string;
};

export type SeedItem = {
  slug: string;
  label: string;
  category?: string;
  /** Dimensions this item signals, strongest first. */
  dimensions?: Dimension[];
  metadata?: Partial<CardMetadata>;
};

export type SeedSurvey = {
  slug: string;
  title: string;
  description?: string;
  items: SeedItem[];
};

/**
 * Intelligent rule-augmented psychometric tagger that bulk tags heavy metadata
 * onto cards based on label, category, and signal dimensions.
 */
export function deriveCardMetadata(item: { label: string; category?: string | null; dimensions?: string[] }): CardMetadata {
  const l = item.label.toLowerCase();
  const c = (item.category ?? "").toLowerCase();
  const dims = item.dimensions ?? [];

  // Attachment Signal
  let attachmentSignal: AttachmentSignal = "secure-building";
  if (l.includes("space") || l.includes("alone") || l.includes("private") || dims.includes("independence")) {
    attachmentSignal = "autonomy-preserving";
  } else if (l.includes("check in") || l.includes("texts") || l.includes("reconnects") || l.includes("reassure")) {
    attachmentSignal = "anxious-soothing";
  } else if (l.includes("contempt") || l.includes("cold") || l.includes("withdrawal")) {
    attachmentSignal = "avoidant-triggering";
  } else if (l.includes("hug") || l.includes("sit close") || l.includes("phone down") || l.includes("listens")) {
    attachmentSignal = "secure-building";
  } else if (c.includes("intimacy") || l.includes("family comes before")) {
    attachmentSignal = "merger-oriented";
  }

  // Conflict Style
  let conflictStyle: ConflictStyle = "problem-solving";
  if (l.includes("repair") || l.includes("apologis") || l.includes("de-escalat") || l.includes("gently")) {
    conflictStyle = "de-escalating";
  } else if (l.includes("direct") || l.includes("names what") || l.includes("room during hard")) {
    conflictStyle = "direct-repair";
  } else if (l.includes("pause") || l.includes("timeout") || l.includes("reflect")) {
    conflictStyle = "reflective-pause";
  } else if (l.includes("vent") || l.includes("express") || l.includes("laugh")) {
    conflictStyle = "expressive-venting";
  }

  // Love Language
  let loveLanguage: LoveLanguage = "quality_time";
  if (c.includes("affection") || l.includes("hug") || l.includes("touch") || l.includes("hand") || l.includes("physical")) {
    loveLanguage = "physical_touch";
  } else if (l.includes("cook") || l.includes("task") || l.includes("logistics") || l.includes("fixes") || c.includes("behaviour")) {
    loveLanguage = "acts_of_service";
  } else if (l.includes("compliment") || l.includes("says") || l.includes("note") || l.includes("proud")) {
    loveLanguage = "words_of_affirmation";
  } else if (l.includes("listens") || l.includes("inner world") || l.includes("understands") || l.includes("bids")) {
    loveLanguage = "emotional_attunement";
  } else if (dims.includes("spirituality") || dims.includes("family") || c.includes("values")) {
    loveLanguage = "shared_meaning";
  }

  // Gottman Tier
  let gottmanTier: GottmanTier = "bids_for_connection";
  if (l.includes("proud") || l.includes("admire") || l.includes("celebrates") || l.includes("compliment")) {
    gottmanTier = "admiration_appreciation";
  } else if (l.includes("listens") || l.includes("notices") || l.includes("responds") || l.includes("coffee")) {
    gottmanTier = "turning_towards";
  } else if (l.includes("repair") || l.includes("apolog") || l.includes("calm") || l.includes("pause")) {
    gottmanTier = "de_escalation";
  } else if (dims.includes("spirituality") || dims.includes("family") || l.includes("vision")) {
    gottmanTier = "shared_meaning";
  }

  // Lifestyle Pace
  let lifestylePace: LifestylePace = "steady_routine";
  if (dims.includes("adventure") || l.includes("pilot") || l.includes("travel") || l.includes("expedition") || l.includes("spontaneous")) {
    lifestylePace = "fast_active";
  } else if (l.includes("quiet") || l.includes("silence") || l.includes("reading") || dims.includes("intellect")) {
    lifestylePace = "contemplative_slow";
  } else if (l.includes("spontaneous") || l.includes("change the plan")) {
    lifestylePace = "flexible_spontaneous";
  }

  // Stress Response
  let stressResponse: StressResponse = "practical_action";
  if (l.includes("calmer when you are stressed") || l.includes("hug") || l.includes("co-regulate") || l.includes("steady")) {
    stressResponse = "co_regulation";
  } else if (l.includes("alone") || l.includes("space") || l.includes("private")) {
    stressResponse = "solitary_space";
  } else if (l.includes("talks") || l.includes("shares inner world") || l.includes("asks whether")) {
    stressResponse = "verbal_processing";
  }

  // Scores
  let vulnerabilityScore = 3;
  if (c.includes("intimacy") || l.includes("inner world") || l.includes("apologis") || l.includes("desire")) vulnerabilityScore = 5;
  else if (c.includes("affection") || c.includes("communication")) vulnerabilityScore = 4;
  else if (c.includes("fitness") || c.includes("aviation")) vulnerabilityScore = 2;

  let relationalImportance = 3;
  if (c.includes("relationship") || c.includes("communication") || c.includes("intimacy") || l.includes("money") || l.includes("family")) relationalImportance = 5;
  else if (c.includes("behaviour") || c.includes("values")) relationalImportance = 4;

  const explainableRationale = `Selecting "${item.label}" signals a high preference for ${loveLanguage.replace("_", " ")} and ${attachmentSignal} relational dynamics.`;

  return {
    attachmentSignal,
    conflictStyle,
    loveLanguage,
    gottmanTier,
    lifestylePace,
    stressResponse,
    vulnerabilityScore,
    relationalImportance,
    explainableRationale,
  };
}


const ACTIVITIES: SeedItem[] = [
  { slug: "helicopter-pilot", label: "Private helicopter pilot", category: "Aviation and travel", dimensions: ["adventure", "status"] },
  { slug: "fixed-wing-pilot", label: "Private fixed-wing pilot", category: "Aviation and travel", dimensions: ["adventure", "status"] },
  { slug: "international-travel", label: "International travel", category: "Aviation and travel", dimensions: ["adventure"] },
  { slug: "ocean-sailing", label: "Long-distance ocean sailing expeditions", category: "Aviation and travel", dimensions: ["adventure", "independence"] },
  { slug: "motor-yacht-expeditions", label: "Long-distance motor-yacht expeditions", category: "Aviation and travel", dimensions: ["adventure", "status"] },
  { slug: "vehicle-expedition-leader", label: "Leading multi-week vehicle expeditions through remote places", category: "Aviation and travel", dimensions: ["adventure", "independence"] },
  { slug: "backpacking-expeditions", label: "Multi-day backpacking expeditions", category: "Aviation and travel", dimensions: ["adventure", "physicality"] },
  { slug: "horseback-riding", label: "Horseback riding", category: "Aviation and travel", dimensions: ["adventure", "physicality"] },
  { slug: "scuba-expedition-leader", label: "Leads scuba-diving expeditions", category: "Aviation and travel", dimensions: ["adventure", "service"] },
  { slug: "scuba-expeditions", label: "Scuba-diving expeditions", category: "Aviation and travel", dimensions: ["adventure"] },
  { slug: "marathon-running", label: "Marathon running", category: "Fitness", dimensions: ["physicality", "ambition"] },
  { slug: "weightlifting", label: "General weightlifting", category: "Fitness", dimensions: ["physicality"] },
  { slug: "bodybuilding", label: "Bodybuilding-style training", category: "Fitness", dimensions: ["physicality", "status"] },
  { slug: "volunteer-firefighter", label: "Volunteer firefighter", category: "Rescue and service", dimensions: ["service", "physicality"] },
  { slug: "volunteer-paramedic", label: "Volunteer paramedic", category: "Rescue and service", dimensions: ["service", "warmth"] },
  { slug: "volunteer-firefighter-paramedic", label: "Volunteer firefighter-paramedic", category: "Rescue and service", dimensions: ["service", "physicality"] },
  { slug: "volunteer-wilderness-sar", label: "Volunteer wilderness search-and-rescue", category: "Rescue and service", dimensions: ["service", "adventure"] },
  { slug: "volunteer-wilderness-sar-paramedic", label: "Volunteer wilderness SAR paramedic", category: "Rescue and service", dimensions: ["service", "adventure"] },
  { slug: "volunteer-wilderness-sar-lead", label: "Volunteer wilderness SAR team leader", category: "Rescue and service", dimensions: ["service", "ambition"] },
  { slug: "volunteer-disaster-response", label: "Volunteer disaster-response operations", category: "Rescue and service", dimensions: ["service", "adventure"] },
  { slug: "volunteer-disaster-medic", label: "Volunteer disaster-response medic", category: "Rescue and service", dimensions: ["service", "warmth"] },
  { slug: "charity-founder", label: "Founder of a respected charity", category: "Charity and leadership", dimensions: ["service", "ambition"] },
  { slug: "charity-board-member", label: "Board member of a respected charity", category: "Charity and leadership", dimensions: ["service", "status"] },
  { slug: "charity-volunteer-lead", label: "Leads volunteer projects for a respected charity", category: "Charity and leadership", dimensions: ["service"] },
  { slug: "nonprofit-exec-volunteer", label: "Volunteer executive leader of a nonprofit", category: "Charity and leadership", dimensions: ["service", "ambition"] },
  { slug: "youth-mentor", label: "Youth mentor", category: "Charity and leadership", dimensions: ["warmth", "service"] },
  { slug: "polyglot", label: "Fluent in multiple languages", category: "Intellectual and practical", dimensions: ["intellect"] },
  { slug: "adjunct-professor", label: "Adjunct professor", category: "Intellectual and practical", dimensions: ["intellect", "service"] },
  { slug: "home-renovation", label: "Major home-renovation and construction projects", category: "Intellectual and practical", dimensions: ["stability", "creativity"] },
  { slug: "excellent-cook", label: "Excellent home cook", category: "Domestic and family", dimensions: ["warmth", "creativity"] },
  { slug: "accomplished-musician", label: "Plays a musical instrument at a high level", category: "Creative and artistic", dimensions: ["creativity"] },
  { slug: "woodworker", label: "Skilled woodworker and furniture builder", category: "Practical and rugged", dimensions: ["creativity", "stability"] },
  { slug: "classic-car-restoration", label: "Restores classic cars", category: "Practical and rugged", dimensions: ["creativity", "independence"] },
  { slug: "church-charitable-service", label: "Deeply involved in church and charitable service", category: "Spiritual and moral", dimensions: ["spirituality", "service"] },
  { slug: "child-mentoring", label: "Coaches or mentors children", category: "Social and leadership", dimensions: ["warmth", "family"] },
  { slug: "serious-reading", label: "Reads and studies serious subjects extensively", category: "Intellectual and practical", dimensions: ["intellect"] },
  { slug: "publishes-writing", label: "Publishes books or essays", category: "Intellectual and practical", dimensions: ["intellect", "creativity"] },
  { slug: "hosts-dinners", label: "Hosts dinners and builds community", category: "Social and leadership", dimensions: ["warmth"] },
  { slug: "rural-land-owner", label: "Owns and manages rural land", category: "Practical and rugged", dimensions: ["independence", "stability"] },
  { slug: "combat-sports", label: "Competes in a combat sport", category: "Fitness", dimensions: ["physicality", "ambition"] },
  { slug: "engineering-hobby-projects", label: "Builds engineering projects for fun", category: "Intellectual and practical", dimensions: ["intellect", "creativity"] },
];

const PROFESSIONS: SeedItem[] = [
  { slug: "business-owner", label: "Business owner", category: "Business and finance", dimensions: ["ambition", "independence"] },
  { slug: "startup-founder", label: "Startup founder", category: "Business and finance", dimensions: ["ambition", "adventure"] },
  { slug: "corporate-ceo", label: "Corporate CEO", category: "Business and finance", dimensions: ["ambition", "status"] },
  { slug: "family-office-investor", label: "Family office investor", category: "Business and finance", dimensions: ["status", "stability"] },
  { slug: "cfo", label: "Chief financial officer (CFO)", category: "Business and finance", dimensions: ["ambition", "stability"] },
  { slug: "cto", label: "Chief technology officer (CTO)", category: "Business and finance", dimensions: ["ambition", "intellect"] },
  { slug: "software-engineer", label: "Software engineer", category: "Engineering and technology", dimensions: ["intellect"] },
  { slug: "electrical-engineer", label: "Electrical engineer", category: "Engineering and technology", dimensions: ["intellect"] },
  { slug: "nuclear-engineer", label: "Nuclear engineer", category: "Engineering and technology", dimensions: ["intellect", "status"] },
  { slug: "biomedical-engineer", label: "Biomedical engineer", category: "Engineering and technology", dimensions: ["intellect", "service"] },
  { slug: "architect", label: "Architect", category: "Engineering and technology", dimensions: ["creativity", "intellect"] },
  { slug: "university-professor", label: "University professor", category: "Academia", dimensions: ["intellect", "status"] },
  { slug: "surgeon", label: "Surgeon", category: "Medicine", dimensions: ["status", "service"] },
  { slug: "pediatrician", label: "Pediatrician", category: "Medicine", dimensions: ["warmth", "service"] },
  { slug: "emergency-physician", label: "Emergency medicine physician", category: "Medicine", dimensions: ["service", "adventure"] },
  { slug: "nurse-practitioner", label: "Nurse practitioner", category: "Medicine", dimensions: ["service", "warmth"] },
  { slug: "commercial-pilot", label: "Commercial pilot", category: "Aviation", dimensions: ["adventure", "status"] },
  { slug: "firefighter", label: "Firefighter", category: "Emergency services", dimensions: ["service", "physicality"] },
  { slug: "firefighter-paramedic", label: "Firefighter-paramedic", category: "Emergency services", dimensions: ["service", "physicality"] },
  { slug: "police-officer", label: "Police officer", category: "Public service", dimensions: ["service", "stability"] },
  { slug: "military-officer", label: "Military officer", category: "Public service", dimensions: ["service", "ambition"] },
  { slug: "charity-founder-director", label: "Founder of a charity", category: "Charity and leadership", dimensions: ["service", "ambition"] },
  // Finance / investing
  { slug: "venture-capitalist", label: "Venture capitalist", category: "Business and finance", dimensions: ["ambition", "status"] },
  { slug: "private-equity-investor", label: "Private equity investor", category: "Business and finance", dimensions: ["ambition", "status"] },
  { slug: "hedge-fund-manager", label: "Hedge fund portfolio manager", category: "Business and finance", dimensions: ["ambition", "status"] },
  { slug: "investment-banker", label: "Investment banker", category: "Business and finance", dimensions: ["ambition", "status"] },
  // Engineering / technology
  { slug: "ai-ml-engineer", label: "AI / machine learning engineer", category: "Engineering and technology", dimensions: ["intellect", "ambition"] },
  { slug: "aerospace-engineer", label: "Aerospace engineer", category: "Engineering and technology", dimensions: ["intellect", "adventure"] },
  { slug: "mechanical-engineer", label: "Mechanical engineer", category: "Engineering and technology", dimensions: ["intellect"] },
  { slug: "engineering-manager", label: "Engineering manager", category: "Engineering and technology", dimensions: ["ambition", "intellect"] },
  // Medicine
  { slug: "general-physician", label: "General physician", category: "Medicine", dimensions: ["service", "stability"] },
  { slug: "anesthesiologist", label: "Anesthesiologist", category: "Medicine", dimensions: ["intellect", "service"] },
  { slug: "psychiatrist", label: "Psychiatrist", category: "Medicine", dimensions: ["intellect", "warmth"] },
  { slug: "dentist", label: "Dentist", category: "Medicine", dimensions: ["stability", "service"] },
  { slug: "physician-assistant", label: "Physician assistant", category: "Medicine", dimensions: ["service", "warmth"] },
  // Aviation & maritime
  { slug: "military-pilot", label: "Military pilot", category: "Aviation", dimensions: ["adventure", "service"] },
  { slug: "bush-pilot", label: "Bush / backcountry pilot", category: "Aviation", dimensions: ["adventure", "independence"] },
  { slug: "helicopter-pilot-pro", label: "Helicopter pilot", category: "Aviation", dimensions: ["adventure", "status"] },
  { slug: "ship-captain", label: "Ship captain", category: "Aviation", dimensions: ["adventure", "independence"] },
  // Emergency services
  { slug: "paramedic", label: "Paramedic", category: "Emergency services", dimensions: ["service", "warmth"] },
  { slug: "sar-professional", label: "Search-and-rescue professional", category: "Emergency services", dimensions: ["service", "adventure"] },
  // Public service
  { slug: "detective", label: "Detective", category: "Public service", dimensions: ["intellect", "service"] },
  { slug: "intelligence-officer", label: "Intelligence officer", category: "Public service", dimensions: ["intellect", "service"] },
  { slug: "diplomat", label: "Diplomat", category: "Public service", dimensions: ["intellect", "status"] },
  // Academia & science
  { slug: "research-scientist", label: "Research scientist", category: "Academia", dimensions: ["intellect"] },
  { slug: "physicist", label: "Physicist", category: "Academia", dimensions: ["intellect"] },
  { slug: "mathematician", label: "Mathematician", category: "Academia", dimensions: ["intellect"] },
  // Law & government
  { slug: "lawyer", label: "Lawyer", category: "Law and government", dimensions: ["intellect", "status"] },
  { slug: "judge", label: "Judge", category: "Law and government", dimensions: ["status", "service"] },
  { slug: "politician", label: "Politician", category: "Law and government", dimensions: ["status", "ambition"] },
  // Charity
  { slug: "nonprofit-director", label: "Director of a nonprofit", category: "Charity and leadership", dimensions: ["service", "ambition"] },
  { slug: "humanitarian-aid-leader", label: "Humanitarian aid leader", category: "Charity and leadership", dimensions: ["service", "adventure"] },
  // Health, care and wellbeing
  { slug: "registered-nurse", label: "Registered nurse", category: "Medicine", dimensions: ["service", "warmth"] },
  { slug: "midwife", label: "Midwife", category: "Medicine", dimensions: ["service", "warmth", "family"] },
  { slug: "physical-therapist", label: "Physical therapist", category: "Medicine", dimensions: ["service", "physicality"] },
  { slug: "veterinarian", label: "Veterinarian", category: "Medicine", dimensions: ["service", "intellect"] },
  { slug: "clinical-psychologist", label: "Clinical psychologist", category: "Medicine", dimensions: ["intellect", "warmth"] },
  { slug: "therapist-counsellor", label: "Therapist / counsellor", category: "Medicine", dimensions: ["warmth", "service"] },
  { slug: "dietitian", label: "Dietitian / nutritionist", category: "Medicine", dimensions: ["service", "physicality"] },
  { slug: "pharmacist", label: "Pharmacist", category: "Medicine", dimensions: ["intellect", "stability"] },
  { slug: "occupational-therapist", label: "Occupational therapist", category: "Medicine", dimensions: ["service", "warmth"] },
  // Education and children
  { slug: "teacher", label: "Schoolteacher", category: "Education", dimensions: ["service", "warmth"] },
  { slug: "early-years-teacher", label: "Early-years teacher", category: "Education", dimensions: ["warmth", "family"] },
  { slug: "school-principal", label: "School principal", category: "Education", dimensions: ["service", "ambition"] },
  { slug: "speech-therapist", label: "Speech and language therapist", category: "Education", dimensions: ["service", "warmth"] },
  { slug: "social-worker", label: "Social worker", category: "Education", dimensions: ["service", "warmth"] },
  // Creative and design
  { slug: "graphic-designer", label: "Graphic designer", category: "Creative and media", dimensions: ["creativity"] },
  { slug: "interior-designer", label: "Interior designer", category: "Creative and media", dimensions: ["creativity"] },
  { slug: "fashion-designer", label: "Fashion designer", category: "Creative and media", dimensions: ["creativity", "status"] },
  { slug: "photographer-pro", label: "Professional photographer", category: "Creative and media", dimensions: ["creativity"] },
  { slug: "journalist", label: "Journalist", category: "Creative and media", dimensions: ["intellect", "creativity"] },
  { slug: "author", label: "Author", category: "Creative and media", dimensions: ["creativity", "intellect"] },
  { slug: "chef", label: "Chef", category: "Creative and media", dimensions: ["creativity", "physicality"] },
  { slug: "architect-creative", label: "Landscape architect", category: "Creative and media", dimensions: ["creativity", "intellect"] },
  { slug: "musician-pro", label: "Professional musician", category: "Creative and media", dimensions: ["creativity"] },
  { slug: "actor", label: "Actor", category: "Creative and media", dimensions: ["creativity", "status"] },
  // Business, people and operations
  { slug: "marketing-director", label: "Marketing director", category: "Business and finance", dimensions: ["ambition", "creativity"] },
  { slug: "hr-director", label: "HR director", category: "Business and finance", dimensions: ["warmth", "ambition"] },
  { slug: "product-manager", label: "Product manager", category: "Business and finance", dimensions: ["ambition", "intellect"] },
  { slug: "management-consultant", label: "Management consultant", category: "Business and finance", dimensions: ["ambition", "status"] },
  { slug: "accountant", label: "Accountant", category: "Business and finance", dimensions: ["stability", "intellect"] },
  { slug: "real-estate-developer", label: "Real estate developer", category: "Business and finance", dimensions: ["ambition", "status"] },
  { slug: "small-shop-owner", label: "Owner of a small local business", category: "Business and finance", dimensions: ["independence", "stability"] },
  { slug: "event-planner", label: "Event planner", category: "Business and finance", dimensions: ["creativity", "warmth"] },
  // Science and environment
  { slug: "environmental-scientist", label: "Environmental scientist", category: "Academia", dimensions: ["intellect", "service"] },
  { slug: "marine-biologist", label: "Marine biologist", category: "Academia", dimensions: ["intellect", "adventure"] },
  { slug: "archaeologist", label: "Archaeologist", category: "Academia", dimensions: ["intellect", "adventure"] },
  { slug: "data-scientist", label: "Data scientist", category: "Engineering and technology", dimensions: ["intellect"] },
  // Public and community
  { slug: "human-rights-lawyer", label: "Human rights lawyer", category: "Law and government", dimensions: ["service", "intellect"] },
  { slug: "civil-servant", label: "Senior civil servant", category: "Law and government", dimensions: ["service", "stability"] },
  { slug: "clergy", label: "Clergy / religious leader", category: "Charity and leadership", dimensions: ["spirituality", "service"] },
];

/**
 * Character traits. Phrased as things a person IS, so the comparison is
 * about disposition rather than achievement.
 */
const TRAITS: SeedItem[] = [
  { slug: "kind", label: "Deeply kind", category: "Character", dimensions: ["warmth"] },
  { slug: "honest", label: "Honest, even when it costs them", category: "Character", dimensions: ["stability", "service"] },
  { slug: "loyal", label: "Fiercely loyal", category: "Character", dimensions: ["warmth", "stability"] },
  { slug: "calm-under-pressure", label: "Calm under pressure", category: "Character", dimensions: ["stability"] },
  { slug: "emotionally-open", label: "Emotionally open", category: "Character", dimensions: ["warmth"] },
  { slug: "self-aware", label: "Genuinely self-aware", category: "Character", dimensions: ["intellect", "warmth"] },
  { slug: "patient", label: "Patient", category: "Character", dimensions: ["warmth", "stability"] },
  { slug: "generous", label: "Generous with what they have", category: "Character", dimensions: ["warmth", "service"] },
  { slug: "humble", label: "Humble about their success", category: "Character", dimensions: ["warmth"] },
  { slug: "principled", label: "Strong moral principles", category: "Character", dimensions: ["service", "spirituality"] },
  { slug: "funny", label: "Genuinely funny", category: "Character", dimensions: ["creativity", "warmth"] },
  { slug: "curious", label: "Endlessly curious", category: "Character", dimensions: ["intellect"] },
  { slug: "disciplined", label: "Highly disciplined", category: "Character", dimensions: ["ambition", "stability"] },
  { slug: "ambitious-trait", label: "Deeply ambitious", category: "Character", dimensions: ["ambition"] },
  { slug: "decisive", label: "Decisive", category: "Character", dimensions: ["ambition", "independence"] },
  { slug: "protective", label: "Protective of the people they love", category: "Character", dimensions: ["warmth", "family"] },
  { slug: "adventurous-trait", label: "Adventurous", category: "Character", dimensions: ["adventure"] },
  { slug: "steady-moods", label: "Even-tempered", category: "Character", dimensions: ["stability"] },
  { slug: "socially-confident", label: "Socially confident", category: "Character", dimensions: ["status", "independence"] },
  { slug: "independent-trait", label: "Independent-minded", category: "Character", dimensions: ["independence", "intellect"] },
  { slug: "affectionate", label: "Openly affectionate", category: "Character", dimensions: ["warmth"] },
  { slug: "hardworking", label: "Relentlessly hardworking", category: "Character", dimensions: ["ambition"] },
  { slug: "forgiving", label: "Quick to forgive", category: "Character", dimensions: ["warmth", "spirituality"] },
  { slug: "attentive", label: "Notices the small things", category: "Character", dimensions: ["warmth"] },
  { slug: "emotionally-regulated", label: "Can feel deeply without losing control", category: "Character", dimensions: ["stability", "warmth"] },
  { slug: "direct-communicator", label: "Says what they mean without playing games", category: "Character", dimensions: ["stability", "independence"] },
  { slug: "playful", label: "Playful and a little mischievous", category: "Character", dimensions: ["creativity", "warmth"] },
  { slug: "intellectually-humble", label: "Can change their mind when the evidence changes", category: "Character", dimensions: ["intellect", "stability"] },
  { slug: "resourceful", label: "Figures things out when plans fall apart", category: "Character", dimensions: ["independence", "intellect"] },
  { slug: "courageous", label: "Does the difficult thing when it matters", category: "Character", dimensions: ["ambition", "service"] },
  { slug: "romantic", label: "Naturally romantic", category: "Character", dimensions: ["warmth", "creativity"] },
  { slug: "grounded", label: "Grounded and hard to rattle", category: "Character", dimensions: ["stability"] },
  { slug: "charismatic", label: "Magnetic in a room", category: "Character", dimensions: ["status", "warmth"] },
  { slug: "private", label: "Private and selective about who gets close", category: "Character", dimensions: ["independence"] },
  { slug: "competitive", label: "Thrives on competition", category: "Character", dimensions: ["ambition", "status"] },
  { slug: "spontaneous", label: "Happy to change the plan on a whim", category: "Character", dimensions: ["adventure", "independence"] },
  { slug: "nurturing", label: "Naturally nurturing", category: "Character", dimensions: ["warmth", "family"] },
  { slug: "worldly", label: "Worldly and culturally fluent", category: "Character", dimensions: ["adventure", "intellect"] },
  { slug: "sensual", label: "Comfortable with sensuality and desire", category: "Character", dimensions: ["physicality", "warmth"] },
  { slug: "self-respecting", label: "Has strong boundaries and self-respect", category: "Character", dimensions: ["independence", "stability"] },
];

/** What a person orients their life around. */
const VALUES: SeedItem[] = [
  { slug: "family-first", label: "Family comes before everything", category: "Values", dimensions: ["family"] },
  { slug: "personal-freedom", label: "Personal freedom above all", category: "Values", dimensions: ["independence"] },
  { slug: "faith-centered", label: "A life centred on faith", category: "Values", dimensions: ["spirituality"] },
  { slug: "achievement", label: "Achieving something significant", category: "Values", dimensions: ["ambition", "status"] },
  { slug: "financial-security", label: "Financial security", category: "Values", dimensions: ["stability"] },
  { slug: "helping-others", label: "Leaving people better than they found them", category: "Values", dimensions: ["service", "warmth"] },
  { slug: "lifelong-learning", label: "Never stopping learning", category: "Values", dimensions: ["intellect"] },
  { slug: "health-longevity", label: "Health and longevity", category: "Values", dimensions: ["physicality", "stability"] },
  { slug: "experiences-over-things", label: "Experiences over possessions", category: "Values", dimensions: ["adventure"] },
  { slug: "community-roots", label: "Deep roots in a community", category: "Values", dimensions: ["family", "service"] },
  { slug: "creative-legacy", label: "Making something that outlasts them", category: "Values", dimensions: ["creativity", "ambition"] },
  { slug: "honesty-value", label: "Honesty, even when inconvenient", category: "Values", dimensions: ["stability"] },
  { slug: "self-mastery", label: "Mastery over themselves", category: "Values", dimensions: ["ambition", "spirituality"] },
  { slug: "beauty-craft", label: "Beauty and craftsmanship", category: "Values", dimensions: ["creativity"] },
  { slug: "tradition", label: "Honouring tradition", category: "Values", dimensions: ["family", "spirituality"] },
  { slug: "justice", label: "Standing up for what's right", category: "Values", dimensions: ["service"] },
];

/** Concrete things a partner DOES. Behaviour, not adjectives. */
const BEHAVIORS: SeedItem[] = [
  { slug: "listens-fully", label: "Puts the phone down and actually listens", category: "Behaviour", dimensions: ["warmth"] },
  { slug: "plans-dates", label: "Plans thoughtful dates without being asked", category: "Behaviour", dimensions: ["warmth", "creativity"] },
  { slug: "handles-logistics", label: "Quietly handles the boring logistics", category: "Behaviour", dimensions: ["service", "stability"] },
  { slug: "cooks-for-you", label: "Cooks for you", category: "Behaviour", dimensions: ["warmth", "service"] },
  { slug: "remembers-details", label: "Remembers the small things you mentioned once", category: "Behaviour", dimensions: ["warmth"] },
  { slug: "defends-you", label: "Defends you in front of others", category: "Behaviour", dimensions: ["warmth", "family"] },
  { slug: "apologises-well", label: "Apologises properly when wrong", category: "Behaviour", dimensions: ["warmth", "stability"] },
  { slug: "makes-you-laugh", label: "Makes you laugh when you're upset", category: "Behaviour", dimensions: ["creativity", "warmth"] },
  { slug: "encourages-goals", label: "Pushes you toward your own goals", category: "Behaviour", dimensions: ["ambition", "warmth"] },
  { slug: "keeps-fit-together", label: "Trains or stays active with you", category: "Behaviour", dimensions: ["physicality"] },
  { slug: "protects-your-time", label: "Protects your rest and your time", category: "Behaviour", dimensions: ["warmth", "service"] },
  { slug: "handles-conflict", label: "Stays in the room during hard conversations", category: "Behaviour", dimensions: ["stability", "warmth"] },
  { slug: "surprises-you", label: "Surprises you for no reason", category: "Behaviour", dimensions: ["creativity", "warmth"] },
  { slug: "includes-your-family", label: "Makes an effort with your family", category: "Behaviour", dimensions: ["family"] },
  { slug: "shares-plans", label: "Includes you in big decisions", category: "Behaviour", dimensions: ["stability", "family"] },
  { slug: "fixes-things", label: "Fixes things around the house", category: "Behaviour", dimensions: ["service", "stability"] },
  { slug: "notices-bids", label: "Notices small bids for attention and responds", category: "Behaviour", dimensions: ["warmth"] },
  { slug: "mental-load", label: "Notices and carries the invisible mental load", category: "Behaviour", dimensions: ["service", "stability"] },
  { slug: "supports-friendships", label: "Supports your friendships instead of competing with them", category: "Behaviour", dimensions: ["warmth", "independence"] },
  { slug: "co-regulates-stress", label: "Helps the room feel calmer when you are stressed", category: "Behaviour", dimensions: ["warmth", "stability"] },
  { slug: "money-transparency", label: "Is completely transparent about money and debt", category: "Behaviour", dimensions: ["stability"] },
  { slug: "follows-through", label: "Does what they said they would do without reminders", category: "Behaviour", dimensions: ["stability", "service"] },
];

/** Love-language concretes — the specific gesture, not the abstract category. */
const AFFECTION: SeedItem[] = [
  { slug: "says-proud", label: "Tells you they're proud of you", category: "Affection", dimensions: ["warmth"] },
  { slug: "long-hug", label: "A long hug when you walk in the door", category: "Affection", dimensions: ["warmth", "physicality"] },
  { slug: "handwritten-note", label: "Leaves a handwritten note", category: "Affection", dimensions: ["warmth", "creativity"] },
  { slug: "undivided-evening", label: "An evening with no phones, just you two", category: "Affection", dimensions: ["warmth"] },
  { slug: "thoughtful-gift", label: "A small gift that shows they were paying attention", category: "Affection", dimensions: ["warmth"] },
  { slug: "brings-coffee", label: "Brings you coffee in the morning", category: "Affection", dimensions: ["service", "warmth"] },
  { slug: "says-i-love-you", label: "Says 'I love you' out of nowhere", category: "Affection", dimensions: ["warmth"] },
  { slug: "holds-hand-public", label: "Holds your hand in public", category: "Affection", dimensions: ["physicality", "warmth"] },
  { slug: "takes-a-task", label: "Takes a task off your plate unprompted", category: "Affection", dimensions: ["service"] },
  { slug: "compliments-specific", label: "Compliments something specific, not generic", category: "Affection", dimensions: ["warmth"] },
  { slug: "checks-in-day", label: "Texts to check in during the day", category: "Affection", dimensions: ["warmth"] },
  { slug: "physical-closeness", label: "Sits close to you without needing to talk", category: "Affection", dimensions: ["physicality", "warmth"] },
];


/**
 * How a relationship actually runs. Less about who someone is, more about
 * what living alongside them is like — which is what long-term satisfaction
 * research keeps pointing at, and what people rarely think to compare.
 */
const RELATIONSHIP: SeedItem[] = [
  { slug: "repairs-after-fights", label: "Repairs quickly after a fight", category: "Relationship", dimensions: ["warmth", "stability"] },
  { slug: "never-contempt", label: "Never speaks to you with contempt", category: "Relationship", dimensions: ["warmth"] },
  { slug: "same-money-values", label: "Wants the same things with money", category: "Relationship", dimensions: ["stability"] },
  { slug: "shared-life-vision", label: "Wants the same shape of life in 10 years", category: "Relationship", dimensions: ["stability", "family"] },
  { slug: "equal-domestic-load", label: "Carries an equal share of the household", category: "Relationship", dimensions: ["service", "stability"] },
  { slug: "respects-your-work", label: "Takes your work as seriously as their own", category: "Relationship", dimensions: ["warmth", "independence"] },
  { slug: "handles-your-family", label: "Handles your family well", category: "Relationship", dimensions: ["family", "warmth"] },
  { slug: "keeps-friendships", label: "Has their own close friendships", category: "Relationship", dimensions: ["independence", "warmth"] },
  { slug: "physical-chemistry", label: "Physical chemistry that lasts", category: "Relationship", dimensions: ["physicality"] },
  { slug: "laughs-together", label: "You laugh together most days", category: "Relationship", dimensions: ["warmth", "creativity"] },
  { slug: "trusts-completely", label: "You never wonder where they are", category: "Relationship", dimensions: ["stability", "warmth"] },
  { slug: "same-parenting", label: "Would parent the way you want to parent", category: "Relationship", dimensions: ["family"] },
  { slug: "handles-your-lows", label: "Is steady when you're at your worst", category: "Relationship", dimensions: ["stability", "warmth"] },
  { slug: "celebrates-your-wins", label: "Genuinely celebrates your wins", category: "Relationship", dimensions: ["warmth"] },
  { slug: "easy-silence", label: "Silence with them is comfortable", category: "Relationship", dimensions: ["warmth", "stability"] },
  { slug: "shared-faith-practice", label: "Shares your faith or practice", category: "Relationship", dimensions: ["spirituality"] },
  { slug: "gives-you-space", label: "Gives you space without taking it personally", category: "Relationship", dimensions: ["independence"] },
  { slug: "same-social-appetite", label: "Wants to go out about as often as you do", category: "Relationship", dimensions: ["independence", "warmth"] },
  { slug: "handles-money-stress", label: "Stays calm when money is tight", category: "Relationship", dimensions: ["stability"] },
  { slug: "grows-over-time", label: "Keeps growing rather than settling", category: "Relationship", dimensions: ["ambition", "intellect"] },
  { slug: "assumes-good-intent", label: "You usually assume good intent in each other", category: "Relationship", dimensions: ["warmth", "stability"] },
  { slug: "individual-identities", label: "You stay two whole people, not one merged identity", category: "Relationship", dimensions: ["independence", "warmth"] },
  { slug: "fair-influence", label: "Both people have real influence over major decisions", category: "Relationship", dimensions: ["stability", "independence"] },
  { slug: "stress-team", label: "Stress makes you operate more like a team, not opponents", category: "Relationship", dimensions: ["stability", "service"] },
  { slug: "admiration-remains", label: "You continue to admire who the other person is", category: "Relationship", dimensions: ["warmth", "status"] },
  { slug: "fair-not-equal", label: "Can divide responsibilities fairly even when 50/50 is impossible", category: "Relationship", dimensions: ["service", "stability"] },
  { slug: "names-relationship-season", label: "Recognises when the relationship is in a hard season, not a bad relationship", category: "Relationship", dimensions: ["stability", "warmth"] },
  { slug: "protects-us-time", label: "Protects time for the relationship when life gets crowded", category: "Relationship", dimensions: ["warmth", "service"] },
  { slug: "allows-changing-minds", label: "Lets both people change their minds and grow without keeping score", category: "Relationship", dimensions: ["independence", "warmth"] },
  { slug: "shared-definition-enough", label: "Can agree on what 'enough' money, work, and success look like", category: "Relationship", dimensions: ["stability", "ambition"] },
  { slug: "keeps-fun-alive", label: "Keeps making room for fun when life gets busy", category: "Relationship", dimensions: ["warmth", "creativity"] },
  { slug: "decisions-without-scorekeeping", label: "Can compromise without keeping score", category: "Relationship", dimensions: ["warmth", "stability"] },
];

/** The day-to-day communication patterns couples often discover too late. */
const COMMUNICATION: SeedItem[] = [
  { slug: "names-needs-directly", label: "Names what they need directly", category: "Communication", dimensions: ["stability", "warmth"] },
  { slug: "asks-before-advising", label: "Asks whether you want comfort or advice", category: "Communication", dimensions: ["warmth", "intellect"] },
  { slug: "hard-talks-early", label: "Raises difficult topics before resentment builds", category: "Communication", dimensions: ["stability", "warmth"] },
  { slug: "curious-in-conflict", label: "Stays curious about your side during conflict", category: "Communication", dimensions: ["warmth", "intellect"] },
  { slug: "clear-digital-contact", label: "Has a similar rhythm for texts and calls", category: "Communication", dimensions: ["stability", "warmth"] },
  { slug: "shares-inner-world", label: "Lets you into their inner world", category: "Communication", dimensions: ["warmth"] },
  { slug: "can-disagree-kindly", label: "Can disagree without becoming cruel or cold", category: "Communication", dimensions: ["stability", "warmth"] },
  { slug: "checks-understanding", label: "Checks that they understood instead of assuming", category: "Communication", dimensions: ["intellect", "warmth"] },
  { slug: "keeps-private-private", label: "Keeps private conversations private", category: "Communication", dimensions: ["stability"] },
  { slug: "humor-without-deflection", label: "Uses humour without dodging serious moments", category: "Communication", dimensions: ["creativity", "stability"] },
  { slug: "timeout-and-return", label: "Can pause a heated argument—and reliably return to it", category: "Communication", dimensions: ["stability", "warmth"] },
  { slug: "validates-before-solving", label: "Makes you feel understood before trying to solve it", category: "Communication", dimensions: ["warmth"] },
  { slug: "private-disagreement", label: "Handles disagreements privately instead of recruiting an audience", category: "Communication", dimensions: ["stability"] },
  { slug: "regular-check-ins", label: "Makes space for regular relationship check-ins", category: "Communication", dimensions: ["stability", "warmth"] },
  { slug: "receives-feedback", label: "Can hear loving criticism without punishing honesty", category: "Communication", dimensions: ["stability", "intellect"] },
  { slug: "soft-startup", label: "Starts a complaint gently instead of opening with blame", category: "Communication", dimensions: ["warmth", "stability"] },
  { slug: "money-without-moralising", label: "Can discuss spending without treating one person as irresponsible or controlling", category: "Communication", dimensions: ["stability", "warmth"] },
  { slug: "asks-story-under-reaction", label: "Asks what fear or story sits underneath a strong reaction", category: "Communication", dimensions: ["warmth", "intellect"] },
  { slug: "specific-appreciation", label: "Says what they appreciate before it becomes invisible routine", category: "Communication", dimensions: ["warmth"] },
  { slug: "ends-hard-talk-connected", label: "Ends a hard conversation feeling like you are still on the same side", category: "Communication", dimensions: ["warmth", "stability"] },
  { slug: "conflict-recovery-speed", label: "Wants to reconnect soon after conflict instead of staying distant", category: "Communication", dimensions: ["warmth", "stability"] },
  { slug: "public-private-boundary", label: "Agrees on what belongs between you and what can be shared with others", category: "Communication", dimensions: ["stability", "independence"] },
  { slug: "talks-about-relationship", label: "Can talk about the relationship itself without treating it as a crisis", category: "Communication", dimensions: ["warmth", "stability"] },
  { slug: "specific-apology", label: "Can apologise specifically and change what happens next", category: "Communication", dimensions: ["warmth", "stability"] },
  { slug: "asks-not-mindreads", label: "Asks what you meant instead of mind-reading the worst", category: "Communication", dimensions: ["warmth", "intellect"] },
];

/** Compatibility in the ordinary shape of a shared week. */
const LIFESTYLE: SeedItem[] = [
  { slug: "similar-social-energy", label: "Wants a similar balance of going out and staying in", category: "Lifestyle", dimensions: ["independence", "warmth"] },
  { slug: "home-order", label: "Keeps the home at a level of order you can live with", category: "Lifestyle", dimensions: ["stability"] },
  { slug: "shared-health-habits", label: "Supports healthy sleep, food, and movement", category: "Lifestyle", dimensions: ["physicality", "stability"] },
  { slug: "travel-compatible", label: "Travels at a pace and comfort level that fits yours", category: "Lifestyle", dimensions: ["adventure", "stability"] },
  { slug: "time-alone", label: "Respects the amount of alone time you need", category: "Lifestyle", dimensions: ["independence", "warmth"] },
  { slug: "money-rhythm", label: "Has compatible instincts about spending and saving", category: "Lifestyle", dimensions: ["stability"] },
  { slug: "work-life-boundaries", label: "Protects a life outside work", category: "Lifestyle", dimensions: ["stability", "family"] },
  { slug: "hosting-community", label: "Enjoys building a home people gather in", category: "Lifestyle", dimensions: ["warmth", "family"] },
  { slug: "simple-vs-luxury", label: "Wants a similar balance of simplicity and luxury", category: "Lifestyle", dimensions: ["status", "stability"] },
  { slug: "pace-of-life", label: "Wants a similar pace of life", category: "Lifestyle", dimensions: ["adventure", "stability"] },
  { slug: "substance-fit", label: "Has compatible boundaries around alcohol and other substances", category: "Lifestyle", dimensions: ["stability", "physicality"] },
  { slug: "screen-boundaries", label: "Wants similar boundaries around phones, gaming, and screens", category: "Lifestyle", dimensions: ["stability", "warmth"] },
  { slug: "sleep-schedule", label: "Keeps a daily schedule that can coexist with yours", category: "Lifestyle", dimensions: ["stability"] },
  { slug: "cleanliness-standard", label: "Shares a workable standard for cleanliness and chores", category: "Lifestyle", dimensions: ["stability", "service"] },
  { slug: "city-country", label: "Wants the same balance of city life, nature, and space", category: "Lifestyle", dimensions: ["adventure", "stability"] },
  { slug: "weekly-ritual", label: "Has a small weekly ritual you both protect", category: "Lifestyle", dimensions: ["warmth", "stability"] },
  { slug: "micro-adventures", label: "Creates small adventures instead of waiting for a big holiday", category: "Lifestyle", dimensions: ["adventure", "creativity"] },
  { slug: "parallel-play", label: "Enjoys doing separate things together in the same room", category: "Lifestyle", dimensions: ["independence", "warmth"] },
  { slug: "recovery-compatible", label: "Understands whether you recover through company, quiet, movement, or rest", category: "Lifestyle", dimensions: ["warmth", "physicality"] },
  { slug: "celebrates-ordinary", label: "Finds ways to make ordinary weeks feel worth remembering", category: "Lifestyle", dimensions: ["creativity", "warmth"] },
  { slug: "financial-autonomy", label: "Balances shared money with some financial independence for each person", category: "Lifestyle", dimensions: ["independence", "stability"] },
  { slug: "political-life-fit", label: "Can live comfortably with each other's political values and involvement", category: "Lifestyle", dimensions: ["stability", "service"] },
  { slug: "rest-ambition-balance", label: "Wants a similar balance between ambition, rest, and enjoying life now", category: "Lifestyle", dimensions: ["ambition", "stability"] },
  { slug: "unstructured-weekend", label: "Enjoys a similar balance of plans and unstructured weekends", category: "Lifestyle", dimensions: ["adventure", "independence"] },
  { slug: "guests-boundaries", label: "Agrees on how often friends or family stay in your home", category: "Lifestyle", dimensions: ["family", "independence"] },
];

/** Closeness, boundaries, and affection without presuming one right style. */
const INTIMACY: SeedItem[] = [
  { slug: "talks-about-desire", label: "Can talk openly and respectfully about desire", category: "Intimacy", dimensions: ["warmth", "physicality"] },
  { slug: "affection-outside-sex", label: "Offers affectionate touch without it always leading somewhere", category: "Intimacy", dimensions: ["warmth", "physicality"] },
  { slug: "respects-no", label: "Treats boundaries and a 'no' as complete answers", category: "Intimacy", dimensions: ["stability", "warmth"] },
  { slug: "initiates-closeness", label: "Initiates closeness instead of leaving it all to you", category: "Intimacy", dimensions: ["warmth", "physicality"] },
  { slug: "private-playfulness", label: "Builds a playful private world with you", category: "Intimacy", dimensions: ["creativity", "warmth"] },
  { slug: "reconnects-after-distance", label: "Notices distance and helps you reconnect", category: "Intimacy", dimensions: ["warmth", "stability"] },
  { slug: "body-kindness", label: "Makes you feel accepted in your body", category: "Intimacy", dimensions: ["warmth", "physicality"] },
  { slug: "compatible-affection", label: "Naturally wants a similar amount of physical affection", category: "Intimacy", dimensions: ["physicality", "warmth"] },
  { slug: "desire-without-shame", label: "Can discuss preferences and fantasies without shame", category: "Intimacy", dimensions: ["physicality", "warmth"] },
  { slug: "navigates-mismatch", label: "Can navigate differences in desire without pressure or withdrawal", category: "Intimacy", dimensions: ["stability", "warmth"] },
  { slug: "protects-private-life", label: "Protects your intimate life from friends, family, and social media", category: "Intimacy", dimensions: ["stability", "independence"] },
  { slug: "keeps-romance-alive", label: "Makes an effort to keep romance alive after the novelty fades", category: "Intimacy", dimensions: ["warmth", "creativity"] },
  { slug: "intimacy-after-stress", label: "Can rebuild closeness after stress, illness, or a difficult season", category: "Intimacy", dimensions: ["warmth", "stability"] },
  { slug: "initiation-balance", label: "Shares responsibility for initiating affection and intimacy", category: "Intimacy", dimensions: ["warmth", "physicality"] },
  { slug: "privacy-vs-openness", label: "Wants a similar balance between intimate privacy and open conversation", category: "Intimacy", dimensions: ["independence", "warmth"] },
];

/** Decisions that determine whether two futures can actually fit together. */
const FUTURE_FAMILY: SeedItem[] = [
  { slug: "children-alignment", label: "Is aligned on whether and how to have children", category: "Future and family", dimensions: ["family", "stability"] },
  { slug: "parenting-team", label: "Would operate as a team through the exhausting parts of parenting", category: "Future and family", dimensions: ["family", "service"] },
  { slug: "caregiving-parents", label: "Can plan fairly for ageing parents and family obligations", category: "Future and family", dimensions: ["family", "service"] },
  { slug: "where-to-live", label: "Can agree on where and how to build a home", category: "Future and family", dimensions: ["stability", "family"] },
  { slug: "career-tradeoffs", label: "Can negotiate whose career takes priority when", category: "Future and family", dimensions: ["ambition", "warmth"] },
  { slug: "shared-financial-plan", label: "Can build and follow a shared financial plan", category: "Future and family", dimensions: ["stability", "family"] },
  { slug: "traditions-together", label: "Wants to create traditions that belong to both of you", category: "Future and family", dimensions: ["family", "creativity"] },
  { slug: "handles-big-change", label: "Can adapt together through illness, moves, and major change", category: "Future and family", dimensions: ["stability", "warmth"] },
  { slug: "retirement-vision", label: "Imagines a later life that fits with yours", category: "Future and family", dimensions: ["family", "stability"] },
  { slug: "community-belonging", label: "Wants to belong to a community together", category: "Future and family", dimensions: ["family", "service"] },
  { slug: "religion-children", label: "Can agree on how faith, culture, or tradition shape family life", category: "Future and family", dimensions: ["family", "spirituality"] },
  { slug: "fertility-uncertainty", label: "Can face fertility uncertainty or alternative paths as a team", category: "Future and family", dimensions: ["family", "stability"] },
  { slug: "debt-risk-honesty", label: "Can make honest joint decisions about debt and financial risk", category: "Future and family", dimensions: ["stability", "family"] },
  { slug: "family-boundaries", label: "Can set healthy boundaries with both extended families", category: "Future and family", dimensions: ["family", "independence"] },
  { slug: "crisis-decisions", label: "Trusts each other to make hard medical and crisis decisions", category: "Future and family", dimensions: ["stability", "service"] },
  { slug: "relocation-sacrifice", label: "Can negotiate relocation without one person's future automatically winning", category: "Future and family", dimensions: ["ambition", "warmth"] },
  { slug: "care-work-division", label: "Can divide childcare and caregiving without defaulting silently to one person", category: "Future and family", dimensions: ["family", "service"] },
  { slug: "uncertain-future-team", label: "Can make good joint decisions even when the future is genuinely uncertain", category: "Future and family", dimensions: ["stability", "intellect"] },
];

/** Money is rarely only about money; these expose safety, freedom, fairness, and power. */
const MONEY_POWER: SeedItem[] = [
  { slug: "full-money-transparency", label: "Can talk openly about every account, debt, and financial obligation", category: "Money and power", dimensions: ["stability", "warmth"] },
  { slug: "equal-financial-voice", label: "Gives both people an equal voice even when one earns much more", category: "Money and power", dimensions: ["warmth", "independence"] },
  { slug: "shared-spending-threshold", label: "Agrees on when a purchase becomes a joint decision", category: "Money and power", dimensions: ["stability", "independence"] },
  { slug: "money-no-control", label: "Never uses money to control the other person's choices", category: "Money and power", dimensions: ["independence", "stability"] },
  { slug: "save-and-live-now", label: "Can balance future security with enjoying life now", category: "Money and power", dimensions: ["stability", "adventure"] },
  { slug: "supports-career-risk", label: "Can support a thoughtful career risk without panicking or dismissing it", category: "Money and power", dimensions: ["ambition", "warmth"] },
  { slug: "fair-sacrifice-recovery", label: "Makes a plan to rebalance after one person sacrifices financially for the relationship", category: "Money and power", dimensions: ["service", "stability"] },
  { slug: "family-money-boundaries", label: "Can set fair boundaries around giving money to extended family", category: "Money and power", dimensions: ["family", "stability"] },
  { slug: "different-money-upbringing", label: "Can understand how different childhoods shaped each person's money habits", category: "Money and power", dimensions: ["warmth", "intellect"] },
  { slug: "defines-enough-together", label: "Can agree when earning more is no longer worth the time it costs", category: "Money and power", dimensions: ["stability", "ambition"] },
  { slug: "no-secret-spending", label: "Would rather disclose an uncomfortable purchase than hide it", category: "Money and power", dimensions: ["stability", "warmth"] },
  { slug: "joint-crisis-buffer", label: "Builds a financial buffer that makes both people feel safer", category: "Money and power", dimensions: ["stability", "service"] },
];

/** What care looks like when one or both people have little capacity left. */
const STRESS_SUPPORT: SeedItem[] = [
  { slug: "asks-support-under-stress", label: "Asks what would help instead of guessing when you are overwhelmed", category: "Stress and support", dimensions: ["warmth", "intellect"] },
  { slug: "takes-over-without-score", label: "Can temporarily carry more without turning it into permanent scorekeeping", category: "Stress and support", dimensions: ["service", "stability"] },
  { slug: "spots-overload-early", label: "Notices overload before it becomes a crisis", category: "Stress and support", dimensions: ["warmth", "service"] },
  { slug: "does-not-personalize-withdrawal", label: "Can give you recovery space without assuming distance means rejection", category: "Stress and support", dimensions: ["independence", "warmth"] },
  { slug: "protects-sleep-in-crisis", label: "Protects each other's sleep and basic needs during a demanding season", category: "Stress and support", dimensions: ["physicality", "service"] },
  { slug: "calms-before-planning", label: "Helps both of you regulate before trying to solve the problem", category: "Stress and support", dimensions: ["stability", "warmth"] },
  { slug: "outside-help-without-shame", label: "Is willing to seek outside help before the relationship is in crisis", category: "Stress and support", dimensions: ["intellect", "stability"] },
  { slug: "protects-team-language", label: "Still speaks as 'we' when stress makes blame tempting", category: "Stress and support", dimensions: ["warmth", "stability"] },
  { slug: "care-without-fixing", label: "Can offer comfort without immediately trying to fix your feelings", category: "Stress and support", dimensions: ["warmth"] },
  { slug: "returns-after-shutdown", label: "Comes back and reconnects after shutting down under pressure", category: "Stress and support", dimensions: ["stability", "warmth"] },
  { slug: "shares-invisible-planning", label: "Shares the invisible planning when life becomes complicated", category: "Stress and support", dimensions: ["service", "family"] },
  { slug: "celebrates-survival-seasons", label: "Can recognise that getting through a hard season together is an achievement", category: "Stress and support", dimensions: ["warmth", "stability"] },
];

/** Trust is built through negotiated boundaries, not mind-reading or surveillance. */
const TRUST_BOUNDARIES: SeedItem[] = [
  { slug: "defines-fidelity-together", label: "Can define fidelity and betrayal explicitly instead of relying on assumptions", category: "Trust and boundaries", dimensions: ["stability", "warmth"] },
  { slug: "phone-privacy-with-trust", label: "Can respect phone privacy without creating secrecy", category: "Trust and boundaries", dimensions: ["independence", "stability"] },
  { slug: "friendship-boundaries", label: "Can agree on boundaries with friends either person could be attracted to", category: "Trust and boundaries", dimensions: ["stability", "warmth"] },
  { slug: "exes-boundaries", label: "Can set clear, mutual boundaries around former partners", category: "Trust and boundaries", dimensions: ["stability", "warmth"] },
  { slug: "social-media-respect", label: "Represents the relationship respectfully online without performing it", category: "Trust and boundaries", dimensions: ["status", "stability"] },
  { slug: "jealousy-without-control", label: "Can talk about jealousy without turning it into control or accusation", category: "Trust and boundaries", dimensions: ["warmth", "independence"] },
  { slug: "protects-private-vulnerability", label: "Never uses something vulnerable you shared as ammunition later", category: "Trust and boundaries", dimensions: ["warmth", "stability"] },
  { slug: "keeps-small-promises", label: "Treats small promises as part of trust, not as optional details", category: "Trust and boundaries", dimensions: ["stability", "service"] },
  { slug: "admits-boundary-crossing", label: "Would disclose crossing a boundary before being discovered", category: "Trust and boundaries", dimensions: ["stability", "warmth"] },
  { slug: "family-access-boundaries", label: "Protects the couple's decisions from family pressure on both sides", category: "Trust and boundaries", dimensions: ["family", "independence"] },
  { slug: "trust-after-rupture", label: "Can rebuild trust through consistent behaviour rather than repeated reassurance", category: "Trust and boundaries", dimensions: ["stability", "service"] },
  { slug: "freedom-with-reliability", label: "Makes room for independence while remaining reliably reachable and accountable", category: "Trust and boundaries", dimensions: ["independence", "stability"] },
];

/** Return-worthy prompts about keeping the relationship alive rather than merely functional. */
const PLAY_GROWTH: SeedItem[] = [
  { slug: "learns-you-again", label: "Keeps getting curious about who you are becoming", category: "Play and growth", dimensions: ["intellect", "warmth"] },
  { slug: "creates-inside-jokes", label: "Builds a private world of stories and inside jokes with you", category: "Play and growth", dimensions: ["creativity", "warmth"] },
  { slug: "tries-each-others-world", label: "Sometimes enters your interests simply because they matter to you", category: "Play and growth", dimensions: ["warmth", "adventure"] },
  { slug: "new-things-together", label: "Regularly tries something neither of you already knows how to do", category: "Play and growth", dimensions: ["adventure", "creativity"] },
  { slug: "supports-reinvention", label: "Can support you becoming different from the person they first met", category: "Play and growth", dimensions: ["independence", "warmth"] },
  { slug: "dreams-without-demand", label: "Makes room for impractical dreams without turning every dream into a plan", category: "Play and growth", dimensions: ["creativity", "warmth"] },
  { slug: "marks-small-moments", label: "Creates small rituals to mark wins, transitions, and ordinary milestones", category: "Play and growth", dimensions: ["creativity", "family"] },
  { slug: "laughs-at-chaos", label: "Can find humour together when plans go wrong", category: "Play and growth", dimensions: ["creativity", "stability"] },
  { slug: "relationship-project", label: "Treats the relationship as something you can keep learning to do better", category: "Play and growth", dimensions: ["intellect", "warmth"] },
  { slug: "future-still-exciting", label: "Can imagine a shared future that feels exciting, not only responsible", category: "Play and growth", dimensions: ["adventure", "family"] },
];

function insightFirst(items: SeedItem[], firstSlugs: string[]): SeedItem[] {
  const rank = new Map(firstSlugs.map((slug, index) => [slug, index]));
  return [...items].sort((a, b) => {
    const aRank = rank.get(a.slug);
    const bRank = rank.get(b.slug);
    if (aRank !== undefined || bRank !== undefined) {
      return (aRank ?? firstSlugs.length) - (bRank ?? firstSlugs.length);
    }
    return 0;
  });
}

const ORDERED_TRAITS = insightFirst(TRAITS, [
  "kind",
  "disciplined",
  "socially-confident",
  "adventurous-trait",
  "calm-under-pressure",
  "curious",
  "funny",
  "principled",
  "sensual",
  "protective",
  "independent-trait",
  "honest",
  "playful",
  "resourceful",
]);
const ORDERED_VALUES = insightFirst(VALUES, [
  "family-first",
  "personal-freedom",
  "achievement",
  "financial-security",
  "helping-others",
  "lifelong-learning",
  "health-longevity",
  "experiences-over-things",
  "faith-centered",
  "creative-legacy",
]);
const ORDERED_BEHAVIORS = insightFirst(BEHAVIORS, [
  "listens-fully",
  "handles-conflict",
  "handles-logistics",
  "encourages-goals",
  "protects-your-time",
  "plans-dates",
  "includes-your-family",
  "keeps-fit-together",
]);
const ORDERED_RELATIONSHIP = insightFirst(RELATIONSHIP, [
  "repairs-after-fights",
  "shared-life-vision",
  "equal-domestic-load",
  "physical-chemistry",
  "gives-you-space",
  "same-money-values",
  "same-parenting",
  "laughs-together",
]);
const ORDERED_COMMUNICATION = insightFirst(COMMUNICATION, [
  "names-needs-directly",
  "validates-before-solving",
  "timeout-and-return",
  "specific-apology",
  "asks-not-mindreads",
  "receives-feedback",
]);
const ORDERED_LIFESTYLE = insightFirst(LIFESTYLE, [
  "money-rhythm",
  "cleanliness-standard",
  "time-alone",
  "work-life-boundaries",
  "similar-social-energy",
  "screen-boundaries",
  "travel-compatible",
  "guests-boundaries",
]);
const ORDERED_INTIMACY = insightFirst(INTIMACY, [
  "talks-about-desire",
  "respects-no",
  "affection-outside-sex",
  "navigates-mismatch",
  "reconnects-after-distance",
  "keeps-romance-alive",
]);
const ORDERED_FUTURE_FAMILY = insightFirst(FUTURE_FAMILY, [
  "children-alignment",
  "where-to-live",
  "career-tradeoffs",
  "shared-financial-plan",
  "family-boundaries",
  "caregiving-parents",
  "handles-big-change",
]);
const ORDERED_MONEY_POWER = insightFirst(MONEY_POWER, [
  "equal-financial-voice",
  "full-money-transparency",
  "save-and-live-now",
  "defines-enough-together",
  "fair-sacrifice-recovery",
  "family-money-boundaries",
]);
const ORDERED_STRESS_SUPPORT = insightFirst(STRESS_SUPPORT, [
  "asks-support-under-stress",
  "calms-before-planning",
  "takes-over-without-score",
  "does-not-personalize-withdrawal",
  "outside-help-without-shame",
  "shares-invisible-planning",
]);
const ORDERED_TRUST_BOUNDARIES = insightFirst(TRUST_BOUNDARIES, [
  "defines-fidelity-together",
  "protects-private-vulnerability",
  "phone-privacy-with-trust",
  "jealousy-without-control",
  "freedom-with-reliability",
  "trust-after-rupture",
]);
const ORDERED_PLAY_GROWTH = insightFirst(PLAY_GROWTH, [
  "learns-you-again",
  "supports-reinvention",
  "creates-inside-jokes",
  "new-things-together",
  "future-still-exciting",
]);

export const SEED_SURVEYS: SeedSurvey[] = [
  {
    slug: "activities",
    title: "Free-time activities",
    description: "Which of these two would you find more attractive in a partner's free time?",
    items: ACTIVITIES,
  },
  {
    slug: "professions",
    title: "Professions",
    description: "Which of these two professions would you find more attractive in a partner?",
    items: PROFESSIONS,
  },
  {
    slug: "traits",
    title: "Character",
    description: "Which of these two matters more to you?",
    items: ORDERED_TRAITS,
  },
  {
    slug: "values",
    title: "Values",
    description: "Which of these two would you rather they built their life around?",
    items: ORDERED_VALUES,
  },
  {
    slug: "behaviors",
    title: "What they do",
    description: "Which of these two would mean more to you day to day?",
    items: ORDERED_BEHAVIORS,
  },
  {
    slug: "affection",
    title: "How they show it",
    description: "Which of these two would you rather receive?",
    items: AFFECTION,
  },
  {
    slug: "relationship",
    title: "What makes it work",
    description: "Which of these two matters more for the relationship itself?",
    items: ORDERED_RELATIONSHIP,
  },
  {
    slug: "communication",
    title: "How you communicate",
    description: "Which communication pattern matters more in a shared life?",
    items: ORDERED_COMMUNICATION,
  },
  {
    slug: "lifestyle",
    title: "Everyday compatibility",
    description: "Which part of day-to-day compatibility matters more?",
    items: ORDERED_LIFESTYLE,
  },
  {
    slug: "intimacy",
    title: "Closeness and intimacy",
    description: "Which kind of closeness matters more?",
    items: ORDERED_INTIMACY,
  },
  {
    slug: "future-family",
    title: "Future and family",
    description: "Which part of building a life together matters more?",
    items: ORDERED_FUTURE_FAMILY,
  },
  {
    slug: "money-power",
    title: "Money and power",
    description: "Which money pattern would matter more to feeling like equal partners?",
    items: ORDERED_MONEY_POWER,
  },
  {
    slug: "stress-support",
    title: "Stress and support",
    description: "When life is hard, which kind of support would matter more?",
    items: ORDERED_STRESS_SUPPORT,
  },
  {
    slug: "trust-boundaries",
    title: "Trust and boundaries",
    description: "Which pattern would do more to protect trust between you?",
    items: ORDERED_TRUST_BOUNDARIES,
  },
  {
    slug: "play-growth",
    title: "Play and growth",
    description: "Which would do more to keep a long relationship alive and interesting?",
    items: ORDERED_PLAY_GROWTH,
  },
  {
    slug: "combined",
    title: "Everything together",
    description: "Across all of it — what actually matters most?",
    items: [
      ...ACTIVITIES.map((i) => ({ ...i, slug: `act-${i.slug}` })),
      ...PROFESSIONS.map((i) => ({ ...i, slug: `prof-${i.slug}` })),
      ...ORDERED_TRAITS.map((i) => ({ ...i, slug: `trait-${i.slug}` })),
      ...ORDERED_VALUES.map((i) => ({ ...i, slug: `val-${i.slug}` })),
      ...ORDERED_BEHAVIORS.map((i) => ({ ...i, slug: `beh-${i.slug}` })),
      ...AFFECTION.map((i) => ({ ...i, slug: `aff-${i.slug}` })),
      ...ORDERED_RELATIONSHIP.map((i) => ({ ...i, slug: `rel-${i.slug}` })),
      ...ORDERED_COMMUNICATION.map((i) => ({ ...i, slug: `com-${i.slug}` })),
      ...ORDERED_LIFESTYLE.map((i) => ({ ...i, slug: `life-${i.slug}` })),
      ...ORDERED_INTIMACY.map((i) => ({ ...i, slug: `int-${i.slug}` })),
      ...ORDERED_FUTURE_FAMILY.map((i) => ({ ...i, slug: `future-${i.slug}` })),
      ...ORDERED_MONEY_POWER.map((i) => ({ ...i, slug: `money-${i.slug}` })),
      ...ORDERED_STRESS_SUPPORT.map((i) => ({ ...i, slug: `stress-${i.slug}` })),
      ...ORDERED_TRUST_BOUNDARIES.map((i) => ({ ...i, slug: `trust-${i.slug}` })),
      ...ORDERED_PLAY_GROWTH.map((i) => ({ ...i, slug: `growth-${i.slug}` })),
    ],
  },
];
