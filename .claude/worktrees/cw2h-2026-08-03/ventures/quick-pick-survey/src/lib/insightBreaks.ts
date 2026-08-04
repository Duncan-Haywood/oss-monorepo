import type { PerspectiveValue } from "@/lib/perspective";

export const INSIGHT_CHECK_INTERVAL = 5;
export const MIN_ANSWERS_BETWEEN_BREAKS = 15;

export type InsightBreak = {
  key: string;
  answers: number;
  eyebrow: string;
  headline: string;
  detail: string;
  prompt: string;
  details?: string[];
  experiment?: string;
};

type RankedItem = {
  label?: unknown;
  contested?: unknown;
};

type Category = {
  name?: unknown;
  avg?: unknown;
  n?: unknown;
  strongestItems?: unknown;
};

type InsightPayload = {
  totalAnswers?: unknown;
  content?: unknown;
};

type CoupleInsightPayload = {
  couple?: {
    partner?: { firstName?: unknown } | null;
  } | null;
  makeThemHappy?: unknown;
  shared?: unknown;
  mattersMoreToThem?: unknown;
  dateNightIdeas?: unknown;
  conversationStarters?: unknown;
  explainableInsights?: unknown;
  semanticInsights?: unknown;
};

export function shouldCheckForInsight(answers: number, lastBreakAt: number): boolean {
  return (
    answers >= 15 &&
    answers % INSIGHT_CHECK_INTERVAL === 0 &&
    answers - lastBreakAt >= MIN_ANSWERS_BETWEEN_BREAKS
  );
}

/**
 * Couple-level findings outrank individual summaries because they use both
 * people's answers and create an immediate next step together. The compare
 * endpoint has already applied confidence and cross-person uncertainty gates;
 * this function only decides whether the surviving output earns a pause.
 */
export function selectCoupleInsightBreak(
  payload: CoupleInsightPayload,
  answers: number,
  alreadyShown: ReadonlySet<string> = new Set()
): InsightBreak | null {
  const partnerName =
    typeof payload.couple?.partner?.firstName === "string"
      ? payload.couple.partner.firstName.trim()
      : "";
  if (!partnerName) return null;

  const candidates: InsightBreak[] = [];

  const semantic = Array.isArray(payload.semanticInsights)
    ? payload.semanticInsights.find(
        (row): row is { headline: string; interpretation: string; prompt: string; key: string } =>
          !!row && typeof row === "object" && typeof (row as { headline?: unknown }).headline === "string"
      )
    : null;
  if (semantic) {
    candidates.push({
      key: `couple-semantic-${semantic.key}`,
      answers,
      eyebrow: `Deep Connection Pattern with ${partnerName}`,
      headline: semantic.headline,
      detail: semantic.interpretation,
      prompt: semantic.prompt,
      details: ["Relationship Blueprint", "Semantic Match"],
      experiment: `Take 3 minutes to discuss: "${semantic.prompt}" over coffee today.`,
    });
  }

  const explainable = Array.isArray(payload.explainableInsights)
    ? payload.explainableInsights.find(
        (row): row is { title: string; summary: string; actionableAdvice: string; confidenceScore: number } =>
          !!row && typeof row === "object" && typeof (row as { title?: unknown }).title === "string"
      )
    : null;
  if (explainable) {
    candidates.push({
      key: "couple-explainable-harmony",
      answers,
      eyebrow: `Couples Insight · ${explainable.title}`,
      headline: explainable.title,
      detail: explainable.summary,
      prompt: explainable.actionableAdvice,
      details: [`Confidence ${Math.round(explainable.confidenceScore * 100)}%`, "Cross-person Analysis"],
      experiment: `Try this micro-commitment together: ${explainable.actionableAdvice}`,
    });
  }

  const dateNight = Array.isArray(payload.dateNightIdeas)
    ? payload.dateNightIdeas.find(
        (row): row is { title: string; description: string; sharedItem: string } =>
          !!row && typeof row === "object" && typeof (row as { title?: unknown }).title === "string"
      )
    : null;
  if (dateNight) {
    candidates.push({
      key: "couple-datenight",
      answers,
      eyebrow: `Date Night Spark for You & ${partnerName}`,
      headline: dateNight.title,
      detail: dateNight.description,
      prompt: `Ask ${partnerName}: “Want to try this date night idea together this week?”`,
      details: ["Shared Activity Match", "Date Night Idea"],
      experiment: `Schedule a 1-hour micro-date built around ${dateNight.sharedItem.toLowerCase()}.`,
    });
  }

  const starter = Array.isArray(payload.conversationStarters)
    ? payload.conversationStarters.find(
        (row): row is { headline: string; prompt: string; itemLabel: string } =>
          !!row && typeof row === "object" && typeof (row as { prompt?: unknown }).prompt === "string"
      )
    : null;
  if (starter) {
    candidates.push({
      key: "couple-starter",
      answers,
      eyebrow: `Spark Conversation with ${partnerName}`,
      headline: starter.headline,
      detail: `Your preferences created a unique insight on "${starter.itemLabel}".`,
      prompt: starter.prompt,
      details: ["Spark Conversation", "Connection Prompt"],
      experiment: "Copy this prompt and text or ask it over your next meal.",
    });
  }

  const action = Array.isArray(payload.makeThemHappy)
    ? payload.makeThemHappy.find(
        (row): row is { label: string; category?: string } =>
          !!row && typeof row === "object" && typeof (row as { label?: unknown }).label === "string"
      )
    : null;
  if (action) {
    candidates.push({
      key: "couple-action",
      answers,
      eyebrow: `A useful signal about ${partnerName}`,
      headline: action.label,
      detail: `${partnerName}'s own answers put this among the clearest things you can actually do—not a guess based on your answers.`,
      prompt: `Ask ${partnerName}: “What would this look like on an ordinary week?”`,
      details: action.category ? [action.category, "From both of your results"] : ["From both of your results"],
      experiment: `Pick one small version of this to do for ${partnerName} this week, then ask whether it landed.`,
    });
  }

  const asymmetry = Array.isArray(payload.mattersMoreToThem)
    ? payload.mattersMoreToThem.find(
        (row): row is { label: string; gap?: number } =>
          !!row && typeof row === "object" && typeof (row as { label?: unknown }).label === "string"
      )
    : null;
  if (asymmetry) {
    candidates.push({
      key: "couple-asymmetry",
      answers,
      eyebrow: "A difference that could be useful",
      headline: `${asymmetry.label} matters more to ${partnerName}`,
      detail: "This is not a verdict about either of you. It is a place where a small effort may register more strongly for them than it would for you.",
      prompt: `Ask ${partnerName}: “When do you notice this most—and when do you miss it?”`,
      details: ["Within-person comparison", "Cleared the uncertainty threshold"],
      experiment: "Each name one concrete example of what 'enough' would look like this week.",
    });
  }

  const shared = Array.isArray(payload.shared)
    ? payload.shared.find(
        (row): row is { label: string } =>
          !!row && typeof row === "object" && typeof (row as { label?: unknown }).label === "string"
      )
    : null;
  if (shared) {
    candidates.push({
      key: "couple-shared",
      answers,
      eyebrow: "Common ground worth naming",
      headline: `You and ${partnerName} both put ${shared.label} near the top`,
      detail: "Shared priorities are easy to take for granted. Naming one can explain why some choices already feel natural to both of you.",
      prompt: "Ask each other: “Where are we already living this well?”",
      details: ["Both rankings", "Shared high priority"],
      experiment: "Protect one existing ritual that expresses this shared priority.",
    });
  }

  return candidates.find((candidate) => !alreadyShown.has(candidate.key)) ?? null;
}

function wordingFor(perspective: PerspectiveValue) {
  if (perspective === "PARTNER_GUESS") {
    return {
      subject: "your read of them",
      question: "Would they describe themselves this way?",
    };
  }
  if (perspective === "PARTNER") {
    return {
      subject: "what you want in a partner",
      question: "Is this something your partner already knows matters to you?",
    };
  }
  return {
    subject: "what matters in your own life",
    question: "Does this show up in how you spend your time now?",
  };
}

function experimentForCategory(category: string | undefined): string {
  switch (category) {
    case "Money and power":
      return "Set a 15-minute money check-in: name one thing that feels safe, one thing that feels unequal, and one next decision.";
    case "Stress and support":
      return "Before the next hard day, each finish: “When I am overloaded, the most useful thing you can do is…”";
    case "Trust and boundaries":
      return "Compare your unspoken rule for this topic, then agree on one boundary in words rather than assumptions.";
    case "Play and growth":
      return "Choose one small, novel thing to do together this week—something neither person has to be good at.";
    case "Communication":
      return "Try this once in your next real conversation, then ask whether it made the discussion feel easier.";
    case "Future and family":
      return "Each answer this separately: “What would a fair version of this look like five years from now?”";
    default:
      return "Each give one real example of what this looks like when it is going well.";
  }
}

/**
 * Selects only findings concrete enough to justify stopping the card flow.
 *
 * Level boundaries are a useful time to check, but not a reason to show a
 * modal by themselves. A close or generic result stays in the insights page;
 * the interruption is reserved for a clear preference, a repeated pattern,
 * or a measured trade-off that gives the person something worth discussing.
 */
export function selectInsightBreak(
  payload: InsightPayload,
  perspective: PerspectiveValue,
  alreadyShown: ReadonlySet<string> = new Set()
): InsightBreak | null {
  const answers = typeof payload.totalAnswers === "number" ? payload.totalAnswers : 0;
  if (!payload.content || typeof payload.content !== "object" || answers < 10) return null;

  const content = payload.content as Record<string, unknown>;
  const words = wordingFor(perspective);
  const candidates: InsightBreak[] = [];

  const deep = content["deep-profile"] as {
    headline?: unknown;
    summary?: unknown;
    attachmentSignal?: unknown;
    loveLanguage?: unknown;
  } | undefined;
  if (typeof deep?.headline === "string" && deep.headline.trim()) {
    candidates.push({
      key: "deep-profile",
      answers,
      eyebrow: "Relational Dynamics Unlocked",
      headline: deep.headline.trim(),
      detail: typeof deep.summary === "string" ? deep.summary : "A deeper relational orientation is emerging from your card choices.",
      prompt: words.question,
      details: [
        typeof deep.attachmentSignal === "string" ? deep.attachmentSignal : "Relational Pattern",
        typeof deep.loveLanguage === "string" ? deep.loveLanguage : "Love Language",
      ],
      experiment: "Discuss with your partner how this pattern shows up when life gets stressful.",
    });
  }

  const traits = content["trait-profile"] as {
    primaryTrait?: unknown;
    summary?: unknown;
    topSignals?: string[];
  } | undefined;
  if (typeof traits?.summary === "string" && traits.summary.trim()) {
    candidates.push({
      key: "trait-profile",
      answers,
      eyebrow: "Psychometric Trait Vector",
      headline: typeof traits.primaryTrait === "string" ? traits.primaryTrait : "Key Trait Revealed",
      detail: traits.summary.trim(),
      prompt: words.question,
      details: Array.isArray(traits.topSignals) ? traits.topSignals.slice(0, 3) : ["Trait Vector"],
      experiment: "Share this trait discovery with your partner and see if they agree.",
    });
  }

  const couplePrompt = content["couple-prompt"] as {
    label?: unknown;
    contrast?: unknown;
    category?: unknown;
  } | undefined;
  if (typeof couplePrompt?.label === "string" && couplePrompt.label.trim()) {
    const contrast =
      typeof couplePrompt.contrast === "string" && couplePrompt.contrast.trim()
        ? couplePrompt.contrast.trim()
        : null;
    candidates.push({
      key: "couple-prompt",
      answers,
      eyebrow: "Worth asking each other",
      headline: couplePrompt.label.trim(),
      detail: contrast
        ? `Your choices put this clearly ahead of “${contrast}.” That makes it specific enough to compare, not just agree with.`
        : "This relationship pattern is now clear enough to compare with your partner.",
      prompt:
        perspective === "PARTNER_GUESS"
          ? "Ask them to choose before showing your prediction."
          : "Ask them what they thought you would choose before you reveal it.",
      experiment: experimentForCategory(
        typeof couplePrompt.category === "string" ? couplePrompt.category : undefined
      ),
    });
  }

  const tradeoffs = content.tradeoffs as {
    summary?: unknown;
    tradeoffs?: { n?: unknown; rate?: unknown }[];
  } | undefined;
  const strongestTradeoff = tradeoffs?.tradeoffs?.[0];
  if (
    typeof tradeoffs?.summary === "string" &&
    tradeoffs.summary.trim().length > 20 &&
    typeof strongestTradeoff?.n === "number" &&
    strongestTradeoff.n >= 3 &&
    typeof strongestTradeoff.rate === "number" &&
    Math.abs(strongestTradeoff.rate - 0.5) >= 0.2
  ) {
    candidates.push({
      key: "tradeoffs",
      answers,
      eyebrow: "A real trade-off",
      headline: `When two good things compete, ${words.subject} has a winner`,
      detail: tradeoffs.summary.trim(),
      prompt: words.question,
      details: ["Preference trade-off", "Direct decision"],
      experiment: "Each predict the other's choice in this trade-off, then reveal your answers together.",
    });
  }

  const profile = content["value-profile"] as {
    summary?: unknown;
    scores?: { label: string; delta?: unknown; n?: unknown }[];
    archetype?: { name?: unknown; tagline?: unknown } | null;
  } | undefined;
  const strongestDimension = profile?.scores
    ?.filter(
      (score) =>
        typeof score.delta === "number" &&
        typeof score.n === "number" &&
        score.n >= 2
    )
    .sort((a, b) => Math.abs(Number(b.delta)) - Math.abs(Number(a.delta)))[0];
  if (
    typeof profile?.summary === "string" &&
    profile.summary.trim().length > 20 &&
    typeof strongestDimension?.delta === "number" &&
    Math.abs(strongestDimension.delta) >= 15
  ) {
    const archetypeName =
      typeof profile.archetype?.name === "string" ? profile.archetype.name.trim() : "";
    const topDimensions = Array.isArray(profile.scores)
      ? profile.scores.slice(0, 3).map((s) => s.label)
      : [];
    candidates.push({
      key: "value-profile",
      answers,
      eyebrow: "A pattern across topics",
      headline: archetypeName || `A theme in ${words.subject}`,
      detail: profile.summary.trim(),
      prompt: words.question,
      details: topDimensions.length ? topDimensions : ["Core values", "Personality archetype"],
    });
  }

  const top = content["top-pick"] as RankedItem | undefined;
  if (top?.contested === false && typeof top.label === "string" && top.label.trim()) {
    candidates.push({
      key: "top-pick",
      answers,
      eyebrow: "A clear front-runner",
      headline: top.label.trim(),
      detail: `This is currently the strongest signal in ${words.subject} — not merely the option shown most recently.`,
      prompt: words.question,
      details: ["#1 Priority", "Clear lead"],
    });
  }

  const categories = content["category-lean"] as Category[] | undefined;
  const leadingCategory = Array.isArray(categories) ? categories[0] : undefined;
  const runnerUpCategory = Array.isArray(categories) ? categories[1] : undefined;
  if (
    typeof leadingCategory?.name === "string" &&
    typeof leadingCategory.avg === "number" &&
    typeof leadingCategory.n === "number" &&
    leadingCategory.n >= 2 &&
    typeof runnerUpCategory?.avg === "number" &&
    leadingCategory.avg - runnerUpCategory.avg >= 20
  ) {
    const examples = Array.isArray(leadingCategory.strongestItems)
      ? leadingCategory.strongestItems.filter((item): item is string => typeof item === "string").slice(0, 2)
      : [];
    candidates.push({
      key: "category-lean",
      answers,
      eyebrow: "A theme is repeating",
      headline: `${leadingCategory.name} keeps rising to the top`,
      detail: examples.length
        ? `The pattern is being driven by choices such as ${examples.join(" and ")}.`
        : `Several choices now point toward the same part of ${words.subject}.`,
      prompt: words.question,
      details: examples,
    });
  }

  return candidates.find((candidate) => !alreadyShown.has(candidate.key)) ?? null;
}

