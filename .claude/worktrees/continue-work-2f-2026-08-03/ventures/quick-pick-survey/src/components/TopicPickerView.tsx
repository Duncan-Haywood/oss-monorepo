"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SEED_SURVEYS } from "@/lib/surveyData";

export type TopicGroup = {
  name: string;
  glyph: string;
  description: string;
  slugs: string[];
};

const TOPIC_GROUPS: TopicGroup[] = [
  {
    name: "Featured, Hobbies & Professions",
    glyph: "🎨",
    description: "Explore free-time activities, non-standard hobbies, career choices, character traits, and core values.",
    slugs: ["activities", "professions", "traits", "values"],
  },
  {
    name: "Relationship & Intimacy",
    glyph: "💞",
    description: "Deep dive into affection, daily actions, communication patterns, and emotional or physical closeness.",
    slugs: ["behaviors", "affection", "relationship", "communication", "intimacy"],
  },
  {
    name: "Everyday Life, Money & Future",
    glyph: "🏡",
    description: "Align on lifestyle pace, financial trade-offs, building a future, and balancing career with time together.",
    slugs: ["lifestyle", "money-power", "future-family", "work-time"],
  },
  {
    name: "Support, Boundaries & Growth",
    glyph: "🛡️",
    description: "Understand stress responses, trust boundaries, play & humor, care in tough times, and community connection.",
    slugs: ["stress-support", "trust-boundaries", "play-growth", "care-health", "community-belonging"],
  },
  {
    name: "Comprehensive Mode",
    glyph: "✨",
    description: "Let Pairwise adaptively sample across all relationship domains simultaneously.",
    slugs: ["combined"],
  },
];

const TOPIC_BADGES: Record<string, string> = {
  activities: "Hobbies & Activities",
  professions: "Careers & Work",
  traits: "Personal Character",
  values: "Life Direction",
  behaviors: "Daily Actions",
  affection: "Love Languages",
  relationship: "Relational Dynamics",
  communication: "Conflict & Repair",
  lifestyle: "Pace of Life",
  intimacy: "Closeness & Touch",
  "future-family": "Vision & Family",
  "money-power": "Financial Fit",
  "stress-support": "Co-Regulation",
  "trust-boundaries": "Safety & Limits",
  "play-growth": "Humor & Adventure",
  "care-health": "Caregiving & Health",
  "community-belonging": "Social World",
  "work-time": "Time Allocation",
  combined: "Adaptive All-in-One",
};

export function TopicPickerView({
  onSelectTopic,
}: {
  onSelectTopic?: (slug: string) => void;
}) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string>("all");

  function handlePick(slug: string) {
    if (onSelectTopic) {
      onSelectTopic(slug);
    } else {
      router.push(`/app?domain=${encodeURIComponent(slug)}`);
    }
  }

  const filteredSurveys = SEED_SURVEYS.filter((survey) => {
    const matchesSearch =
      survey.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (survey.description?.toLowerCase() ?? "").includes(searchQuery.toLowerCase()) ||
      (TOPIC_BADGES[survey.slug]?.toLowerCase() ?? "").includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (selectedGroup === "all") return true;
    const group = TOPIC_GROUPS.find((g) => g.name === selectedGroup);
    return group ? group.slugs.includes(survey.slug) : true;
  });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header Banner */}
      <header className="flex flex-col gap-4 text-center sm:text-left">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-stone-200 pb-6 dark:border-stone-800">
          <div>
            <span className="text-xs font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Pick Your Survey Topic
            </span>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-stone-900 dark:text-stone-50 sm:text-4xl">
              What do you want to compare?
            </h1>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400 max-w-2xl">
              Choose a specific topic to focus your micro-comparisons on, or let Pairwise adaptively sample across all areas of your relationship.
            </p>
          </div>

          <Link
            href="/app"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-amber-500 px-5 py-3 text-sm font-bold text-stone-950 shadow-sm transition hover:bg-amber-400 active:scale-95"
          >
            🔥 Resume Swiping
          </Link>
        </div>

        {/* Loosely Held Design Goal Callout */}
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4 text-left text-xs leading-relaxed text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="font-bold">💡 Design Philosophy & Measurement</p>
          <p className="mt-1 opacity-90">
            Pairwise spans a broad range of personal topics—including professions, standard & non-standard hobbies, lifestyle habits, attraction, and intimate values. Questions do not have to measure a single property (like attraction alone). Pairwise uses instinctive pairwise choice & Glicko-2 / Bradley-Terry statistical modeling to build true preference hierarchies that yield deep insights for couples.
          </p>
        </div>
      </header>

      {/* Filter and Search Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Category Pill Filters */}
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Topic categories">
          <button
            role="tab"
            aria-selected={selectedGroup === "all"}
            onClick={() => setSelectedGroup("all")}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
              selectedGroup === "all"
                ? "bg-amber-500 text-stone-950 shadow-xs"
                : "bg-stone-200/70 text-stone-700 hover:bg-stone-300/60 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
            }`}
          >
            All Topics ({SEED_SURVEYS.length})
          </button>
          {TOPIC_GROUPS.map((group) => (
            <button
              key={group.name}
              role="tab"
              aria-selected={selectedGroup === group.name}
              onClick={() => setSelectedGroup(group.name)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                selectedGroup === group.name
                  ? "bg-amber-500 text-stone-950 shadow-xs"
                  : "bg-stone-200/70 text-stone-700 hover:bg-stone-300/60 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
              }`}
            >
              <span>{group.glyph}</span>
              <span>{group.name}</span>
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="relative shrink-0 sm:w-64">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search topics or hobbies…"
            className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-medium text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
          />
        </div>
      </div>

      {/* Topics Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredSurveys.map((survey) => {
          const badge = TOPIC_BADGES[survey.slug] ?? "Topic";
          const itemCount = survey.items.length;
          const isFeatured = survey.slug === "activities" || survey.slug === "professions";

          return (
            <div
              key={survey.slug}
              className={`group flex flex-col justify-between rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                isFeatured
                  ? "border-amber-400/80 bg-gradient-to-b from-amber-50/50 to-white dark:border-amber-500/40 dark:from-amber-950/20 dark:to-stone-900"
                  : "border-stone-200/80 bg-white dark:border-stone-800 dark:bg-stone-900/80"
              }`}
            >
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-800 dark:bg-amber-400/10 dark:text-amber-300">
                    {badge}
                  </span>
                  <span className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">
                    {itemCount} items
                  </span>
                </div>

                <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                  {survey.title}
                </h3>

                {survey.description && (
                  <p className="text-xs leading-relaxed text-stone-600 dark:text-stone-400">
                    {survey.description}
                  </p>
                )}
              </div>

              <div className="mt-5 pt-3 border-t border-stone-100 dark:border-stone-800/60 flex items-center justify-between">
                <span className="text-[11px] font-medium text-stone-500 dark:text-stone-400">
                  {survey.slug === "activities" ? "Includes non-standard hobbies" : `${itemCount} options`}
                </span>
                <button
                  onClick={() => handlePick(survey.slug)}
                  className="rounded-xl bg-stone-900 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-amber-500 hover:text-stone-950 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-amber-400 dark:hover:text-stone-950"
                >
                  Pick Topic &rarr;
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredSurveys.length === 0 && (
        <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center dark:border-stone-800 dark:bg-stone-900">
          <p className="text-sm font-semibold text-stone-600 dark:text-stone-400">
            No topics matched &ldquo;{searchQuery}&rdquo;.
          </p>
          <button
            onClick={() => {
              setSearchQuery("");
              setSelectedGroup("all");
            }}
            className="mt-3 text-xs font-bold text-amber-700 underline dark:text-amber-400"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
