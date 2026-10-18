/**
 * Voice-over project rate calculator, as a deterministic module.
 *
 * Freelance voice-over (VO) artists price two structurally different kinds
 * of work, and rate-guide resources the VO community already relies on
 * (most visibly the GVAA Rate Guide) price each one differently:
 *
 *  - **Script-based work** (commercial, e-learning/corporate narration,
 *    IVR/telephony prompts, explainer/video, animation) is priced per word
 *    or per finished minute of audio, then scaled by the *usage/licensing
 *    term* the buyer wants -- internal training use only, unrestricted web
 *    use, regional broadcast, national broadcast, or a full buyout. This is
 *    the single most common "what should I charge" question in VO
 *    communities, because a script that costs $200 for internal-only use
 *    can reasonably cost several times that for a national broadcast
 *    buyout, and a narrator who quotes a flat per-word rate regardless of
 *    usage leaves that difference on the table.
 *  - **Audiobook narration** is conventionally priced per *finished hour*
 *    (PFH) of produced audio, not per word or per session hour -- this is
 *    the ACX/audiobook-industry convention. A finished hour is estimated
 *    from manuscript word count via a commonly cited words-per-finished-hour
 *    conversion (roughly 9,300 words per finished hour is a frequently
 *    quoted rule of thumb), and editing/proofing/mastering (EPM) is
 *    conventionally either included in the PFH rate or billed separately.
 *
 * Every multiplier and conversion factor here is a widely cited industry
 * convention or rule of thumb, not a fixed or authoritative standard --
 * exposed as an adjustable input, not hard-coded, and the result is a
 * starting point for a negotiation, never a quote, guarantee, or valuation
 * performed on the user's behalf. See index.html's disclaimer for the exact
 * wording.
 */

export const PRICING_METHODS = ["perWord", "perFinishedMinute"];

export const USAGE_TERMS = [
  "internal",
  "web",
  "broadcast_regional",
  "broadcast_national",
  "buyout",
];

export const USAGE_TERM_LABELS = {
  internal: "Internal / training use only",
  web: "Web / unrestricted digital use",
  broadcast_regional: "Regional broadcast (radio or TV)",
  broadcast_national: "National broadcast (radio or TV)",
  buyout: "Full buyout (all media, in perpetuity)",
};

// Commonly cited usage-term multiplier tiers, applied to the base narration
// fee. Deliberately a single representative multiplier per tier rather than a
// range: VO rate guides price usage this same tiered way (narrowest use
// cheapest, unlimited buyout most expensive), and a narrator adjusting for
// their own market is better served by round numbers to start negotiating
// from than by a false-precision range.
export const USAGE_TERM_MULTIPLIERS = {
  internal: 1,
  web: 1.3,
  broadcast_regional: 1.8,
  broadcast_national: 2.75,
  buyout: 4,
};

export const RUSH_MULTIPLIER = 1.5; // commonly cited 50% rush surcharge
export const EXCLUSIVITY_MULTIPLIER = 1.25; // commonly cited category-exclusivity add-on

export const DEFAULT_WORDS_PER_MINUTE = 150; // commonly cited average VO read pace
export const DEFAULT_WORDS_PER_FINISHED_HOUR = 9300; // commonly cited audiobook PFH conversion

export const SEVERITY = { HIGH: "high", MEDIUM: "medium", LOW: "low", INFO: "info" };

function num(value) {
  return Number.isFinite(value) ? value : Number(value);
}

function nonNegative(value) {
  const n = num(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function positiveOrDefault(value, fallback) {
  const n = num(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Script-based project (commercial, e-learning, IVR, explainer, animation).
 *
 * @param {{
 *   wordCount: number,
 *   wordsPerMinute?: number,
 *   pricingMethod: "perWord" | "perFinishedMinute",
 *   rate: number,
 *   usageTerm: string,
 *   rush?: boolean,
 *   exclusive?: boolean,
 *   extraRevisions?: number,
 *   extraRevisionFee?: number,
 * }} input
 */
export function computeProjectQuote({
  wordCount,
  wordsPerMinute,
  pricingMethod,
  rate,
  usageTerm,
  rush = false,
  exclusive = false,
  extraRevisions = 0,
  extraRevisionFee = 0,
}) {
  const words = nonNegative(wordCount);
  const wpm = positiveOrDefault(wordsPerMinute, DEFAULT_WORDS_PER_MINUTE);
  const finishedMinutes = words / wpm;

  const method = PRICING_METHODS.includes(pricingMethod) ? pricingMethod : "perWord";
  const baseRate = nonNegative(rate);
  const baseFee = method === "perWord" ? words * baseRate : finishedMinutes * baseRate;

  const term = USAGE_TERMS.includes(usageTerm) ? usageTerm : "web";
  const usageMultiplier = USAGE_TERM_MULTIPLIERS[term];
  const rushMultiplier = rush ? RUSH_MULTIPLIER : 1;
  const exclusivityMultiplier = exclusive ? EXCLUSIVITY_MULTIPLIER : 1;

  const usageAdjustedFee = baseFee * usageMultiplier;
  const licenseFee = round2(usageAdjustedFee * rushMultiplier * exclusivityMultiplier);

  const revisionRounds = Math.max(0, Math.round(nonNegative(extraRevisions)));
  const revisionFee = round2(revisionRounds * nonNegative(extraRevisionFee));

  const total = round2(licenseFee + revisionFee);

  const findings = [];
  if (words === 0 || baseRate === 0) {
    findings.push({
      id: "missing-input",
      severity: SEVERITY.INFO,
      title: "Enter a word count and a rate",
      detail:
        "Both come from your own script and your own base rate. The quote below is zero until real numbers are entered.",
    });
  }
  if (words > 0 && finishedMinutes < 0.25 && method === "perFinishedMinute") {
    findings.push({
      id: "very-short-script",
      severity: SEVERITY.INFO,
      title: "This script is well under a minute of finished audio",
      detail:
        "Most rate guides set a minimum project fee regardless of length -- consider quoting your minimum project rate instead of the raw per-finished-minute math for a script this short.",
    });
  }
  if (baseRate > 0 && method === "perWord" && words > 0 && words < 20) {
    findings.push({
      id: "very-short-word-count",
      severity: SEVERITY.INFO,
      title: "A very small word count, like a single IVR prompt",
      detail:
        "Per-word pricing on a handful of words rarely covers session setup and file delivery -- most narrators apply a minimum project fee below a threshold like 25-50 words.",
    });
  }

  return {
    finishedMinutes: round2(finishedMinutes),
    baseFee: round2(baseFee),
    usageMultiplier,
    licenseFee,
    revisionRounds,
    revisionFee,
    total,
    findings,
  };
}

/**
 * Audiobook narration, priced per finished hour.
 *
 * @param {{
 *   wordCount: number,
 *   wordsPerFinishedHour?: number,
 *   ratePerFinishedHour: number,
 *   epmRatePerFinishedHour?: number,
 * }} input
 */
export function computeAudiobookQuote({
  wordCount,
  wordsPerFinishedHour,
  ratePerFinishedHour,
  epmRatePerFinishedHour = 0,
}) {
  const words = nonNegative(wordCount);
  const wpfh = positiveOrDefault(wordsPerFinishedHour, DEFAULT_WORDS_PER_FINISHED_HOUR);
  const finishedHours = words / wpfh;

  const narrationRate = nonNegative(ratePerFinishedHour);
  const epmRate = nonNegative(epmRatePerFinishedHour);

  const narrationFee = round2(finishedHours * narrationRate);
  const epmFee = round2(finishedHours * epmRate);
  const total = round2(narrationFee + epmFee);
  const effectivePerWord = words > 0 ? round2(total / words) : 0;

  const findings = [];
  if (words === 0 || narrationRate === 0) {
    findings.push({
      id: "missing-input",
      severity: SEVERITY.INFO,
      title: "Enter a manuscript word count and a per-finished-hour rate",
      detail:
        "The manuscript word count comes from your publisher or your own word processor; the per-finished-hour rate is your own asking rate. The quote below is zero until both are entered.",
    });
  }
  if (finishedHours > 0 && finishedHours < 1) {
    findings.push({
      id: "short-audiobook",
      severity: SEVERITY.INFO,
      title: "Under one estimated finished hour",
      detail:
        "Many narrators set a minimum project fee for very short audiobooks or novellas, since setup, proofing, and file delivery cost roughly the same regardless of length.",
    });
  }
  if (finishedHours > 20) {
    findings.push({
      id: "large-audiobook",
      severity: SEVERITY.INFO,
      title: "A long audiobook -- consider milestone payments",
      detail:
        "Above roughly 20 estimated finished hours, many narrators split the total into a deposit plus milestone payments rather than a single invoice at delivery, so cash flow does not depend on finishing the entire book first.",
    });
  }

  return {
    finishedHours: round2(finishedHours),
    narrationFee,
    epmFee,
    total,
    effectivePerWord,
    findings,
  };
}
