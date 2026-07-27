export type SeedItem = {
  slug: string;
  label: string;
  category?: string;
};

export type SeedSurvey = {
  slug: string;
  title: string;
  description?: string;
  items: SeedItem[];
};

const ACTIVITIES: SeedItem[] = [
  { slug: "helicopter-pilot", label: "Private helicopter pilot", category: "Aviation and travel" },
  { slug: "fixed-wing-pilot", label: "Private fixed-wing pilot", category: "Aviation and travel" },
  { slug: "international-travel", label: "International travel", category: "Aviation and travel" },
  { slug: "ocean-sailing", label: "Long-distance ocean sailing expeditions", category: "Aviation and travel" },
  { slug: "motor-yacht-expeditions", label: "Long-distance motor-yacht expeditions", category: "Aviation and travel" },
  { slug: "vehicle-expedition-leader", label: "Leading multi-week vehicle expeditions through remote places", category: "Aviation and travel" },
  { slug: "backpacking-expeditions", label: "Multi-day backpacking expeditions", category: "Aviation and travel" },
  { slug: "horseback-riding", label: "Horseback riding", category: "Aviation and travel" },
  { slug: "scuba-expedition-leader", label: "Leads scuba-diving expeditions", category: "Aviation and travel" },
  { slug: "scuba-expeditions", label: "Scuba-diving expeditions", category: "Aviation and travel" },
  { slug: "marathon-running", label: "Marathon running", category: "Fitness" },
  { slug: "weightlifting", label: "General weightlifting", category: "Fitness" },
  { slug: "bodybuilding", label: "Bodybuilding-style training", category: "Fitness" },
  { slug: "volunteer-firefighter", label: "Volunteer firefighter", category: "Rescue and service" },
  { slug: "volunteer-paramedic", label: "Volunteer paramedic", category: "Rescue and service" },
  { slug: "volunteer-firefighter-paramedic", label: "Volunteer firefighter-paramedic", category: "Rescue and service" },
  { slug: "volunteer-wilderness-sar", label: "Volunteer wilderness search-and-rescue", category: "Rescue and service" },
  { slug: "volunteer-wilderness-sar-paramedic", label: "Volunteer wilderness SAR paramedic", category: "Rescue and service" },
  { slug: "volunteer-wilderness-sar-lead", label: "Volunteer wilderness SAR team leader", category: "Rescue and service" },
  { slug: "volunteer-disaster-response", label: "Volunteer disaster-response operations", category: "Rescue and service" },
  { slug: "volunteer-disaster-medic", label: "Volunteer disaster-response medic", category: "Rescue and service" },
  { slug: "charity-founder", label: "Founder of a respected charity", category: "Charity and leadership" },
  { slug: "charity-board-member", label: "Board member of a respected charity", category: "Charity and leadership" },
  { slug: "charity-volunteer-lead", label: "Leads volunteer projects for a respected charity", category: "Charity and leadership" },
  { slug: "nonprofit-exec-volunteer", label: "Volunteer executive leader of a nonprofit", category: "Charity and leadership" },
  { slug: "youth-mentor", label: "Youth mentor", category: "Charity and leadership" },
  { slug: "polyglot", label: "Fluent in multiple languages", category: "Intellectual and practical" },
  { slug: "adjunct-professor", label: "Adjunct professor", category: "Intellectual and practical" },
  { slug: "home-renovation", label: "Major home-renovation and construction projects", category: "Intellectual and practical" },
  { slug: "excellent-cook", label: "Excellent home cook", category: "Domestic and family" },
  { slug: "accomplished-musician", label: "Plays a musical instrument at a high level", category: "Creative and artistic" },
  { slug: "woodworker", label: "Skilled woodworker and furniture builder", category: "Practical and rugged" },
  { slug: "classic-car-restoration", label: "Restores classic cars", category: "Practical and rugged" },
  { slug: "church-charitable-service", label: "Deeply involved in church and charitable service", category: "Spiritual and moral" },
  { slug: "child-mentoring", label: "Coaches or mentors children", category: "Social and leadership" },
  { slug: "serious-reading", label: "Reads and studies serious subjects extensively", category: "Intellectual and practical" },
  { slug: "publishes-writing", label: "Publishes books or essays", category: "Intellectual and practical" },
  { slug: "hosts-dinners", label: "Hosts dinners and builds community", category: "Social and leadership" },
  { slug: "rural-land-owner", label: "Owns and manages rural land", category: "Practical and rugged" },
  { slug: "combat-sports", label: "Competes in a combat sport", category: "Fitness" },
  { slug: "engineering-hobby-projects", label: "Builds engineering projects for fun", category: "Intellectual and practical" },
];

const PROFESSIONS: SeedItem[] = [
  { slug: "business-owner", label: "Business owner", category: "Business and finance" },
  { slug: "startup-founder", label: "Startup founder", category: "Business and finance" },
  { slug: "corporate-ceo", label: "Corporate CEO", category: "Business and finance" },
  { slug: "family-office-investor", label: "Family office investor", category: "Business and finance" },
  { slug: "cfo", label: "Chief financial officer (CFO)", category: "Business and finance" },
  { slug: "cto", label: "Chief technology officer (CTO)", category: "Business and finance" },
  { slug: "software-engineer", label: "Software engineer", category: "Engineering and technology" },
  { slug: "electrical-engineer", label: "Electrical engineer", category: "Engineering and technology" },
  { slug: "nuclear-engineer", label: "Nuclear engineer", category: "Engineering and technology" },
  { slug: "biomedical-engineer", label: "Biomedical engineer", category: "Engineering and technology" },
  { slug: "architect", label: "Architect", category: "Engineering and technology" },
  { slug: "university-professor", label: "University professor", category: "Academia" },
  { slug: "surgeon", label: "Surgeon", category: "Medicine" },
  { slug: "pediatrician", label: "Pediatrician", category: "Medicine" },
  { slug: "emergency-physician", label: "Emergency medicine physician", category: "Medicine" },
  { slug: "nurse-practitioner", label: "Nurse practitioner", category: "Medicine" },
  { slug: "commercial-pilot", label: "Commercial pilot", category: "Aviation" },
  { slug: "firefighter", label: "Firefighter", category: "Emergency services" },
  { slug: "firefighter-paramedic", label: "Firefighter-paramedic", category: "Emergency services" },
  { slug: "police-officer", label: "Police officer", category: "Public service" },
  { slug: "military-officer", label: "Military officer", category: "Public service" },
  { slug: "charity-founder-director", label: "Founder of a charity", category: "Charity and leadership" },
  // Finance / investing
  { slug: "venture-capitalist", label: "Venture capitalist", category: "Business and finance" },
  { slug: "private-equity-investor", label: "Private equity investor", category: "Business and finance" },
  { slug: "hedge-fund-manager", label: "Hedge fund portfolio manager", category: "Business and finance" },
  { slug: "investment-banker", label: "Investment banker", category: "Business and finance" },
  // Engineering / technology
  { slug: "ai-ml-engineer", label: "AI / machine learning engineer", category: "Engineering and technology" },
  { slug: "aerospace-engineer", label: "Aerospace engineer", category: "Engineering and technology" },
  { slug: "mechanical-engineer", label: "Mechanical engineer", category: "Engineering and technology" },
  { slug: "engineering-manager", label: "Engineering manager", category: "Engineering and technology" },
  // Medicine
  { slug: "general-physician", label: "General physician", category: "Medicine" },
  { slug: "anesthesiologist", label: "Anesthesiologist", category: "Medicine" },
  { slug: "psychiatrist", label: "Psychiatrist", category: "Medicine" },
  { slug: "dentist", label: "Dentist", category: "Medicine" },
  { slug: "physician-assistant", label: "Physician assistant", category: "Medicine" },
  // Aviation & maritime
  { slug: "military-pilot", label: "Military pilot", category: "Aviation" },
  { slug: "bush-pilot", label: "Bush / backcountry pilot", category: "Aviation" },
  { slug: "helicopter-pilot-pro", label: "Helicopter pilot", category: "Aviation" },
  { slug: "ship-captain", label: "Ship captain", category: "Aviation" },
  // Emergency services
  { slug: "paramedic", label: "Paramedic", category: "Emergency services" },
  { slug: "sar-professional", label: "Search-and-rescue professional", category: "Emergency services" },
  // Public service
  { slug: "detective", label: "Detective", category: "Public service" },
  { slug: "intelligence-officer", label: "Intelligence officer", category: "Public service" },
  { slug: "diplomat", label: "Diplomat", category: "Public service" },
  // Academia & science
  { slug: "research-scientist", label: "Research scientist", category: "Academia" },
  { slug: "physicist", label: "Physicist", category: "Academia" },
  { slug: "mathematician", label: "Mathematician", category: "Academia" },
  // Law & government
  { slug: "lawyer", label: "Lawyer", category: "Law and government" },
  { slug: "judge", label: "Judge", category: "Law and government" },
  { slug: "politician", label: "Politician", category: "Law and government" },
  // Charity
  { slug: "nonprofit-director", label: "Director of a nonprofit", category: "Charity and leadership" },
  { slug: "humanitarian-aid-leader", label: "Humanitarian aid leader", category: "Charity and leadership" },
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
    slug: "combined",
    title: "Activities vs. professions",
    description: "Mixing hobbies and professions together — which matters more?",
    items: [
      ...ACTIVITIES.map((i) => ({ ...i, slug: `act-${i.slug}` })),
      ...PROFESSIONS.map((i) => ({ ...i, slug: `prof-${i.slug}` })),
    ],
  },
];
