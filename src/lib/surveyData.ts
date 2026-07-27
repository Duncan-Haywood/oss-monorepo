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

export type SeedItem = {
  slug: string;
  label: string;
  category?: string;
  /** Dimensions this item signals, strongest first. */
  dimensions?: Dimension[];
};

export type SeedSurvey = {
  slug: string;
  title: string;
  description?: string;
  items: SeedItem[];
};

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
];

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
    items: TRAITS,
  },
  {
    slug: "values",
    title: "Values",
    description: "Which of these two would you rather they built their life around?",
    items: VALUES,
  },
  {
    slug: "behaviors",
    title: "What they do",
    description: "Which of these two would mean more to you day to day?",
    items: BEHAVIORS,
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
    items: RELATIONSHIP,
  },
  {
    slug: "combined",
    title: "Everything together",
    description: "Across all of it — what actually matters most?",
    items: [
      ...ACTIVITIES.map((i) => ({ ...i, slug: `act-${i.slug}` })),
      ...PROFESSIONS.map((i) => ({ ...i, slug: `prof-${i.slug}` })),
      ...TRAITS.map((i) => ({ ...i, slug: `trait-${i.slug}` })),
      ...VALUES.map((i) => ({ ...i, slug: `val-${i.slug}` })),
      ...BEHAVIORS.map((i) => ({ ...i, slug: `beh-${i.slug}` })),
      ...AFFECTION.map((i) => ({ ...i, slug: `aff-${i.slug}` })),
      ...RELATIONSHIP.map((i) => ({ ...i, slug: `rel-${i.slug}` })),
    ],
  },
];
