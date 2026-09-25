// Core arithmetic for comparing a freelance writer's per-word rate against a
// flat per-project fee for the SAME piece of work. No network calls: this
// applies the hours the writer supplies to the two prices on offer. It is
// not a rate-card generator and does not tell anyone what to charge -- see
// README "What this does not cover".
//
// Verified 2026-09-25 via WebSearch against Upwork's "How To Set Your
// Freelance Writing Rate in 2026", bestwriting.com's "Content Writing Rates
// Statistics 2026" (42 data points, 500 active freelance writers surveyed
// January 2026), the Editorial Freelancers Association's 2026 Rate Chart,
// AWAI's 2026 freelance copywriter rate survey, and Peak Freelance's 2026
// rates guide, cross-checked against each other:
//
//   - Per-word rates for content/copywriting in 2026 span roughly
//     $0.05-$0.10/word at the entry level, $0.10-$0.50/word for
//     intermediate-to-senior generalist work, and $0.50-$2.00+/word for
//     specialist (legal, medical, expert B2B) work. The 500-writer
//     bestwriting.com survey put the ACROSS-THE-BOARD average at
//     $0.42/word; AWAI's professional copywriter survey averaged $0.70/word
//     -- the two disagree because they sample different populations
//     (general content vs. established copywriters), not because either is
//     wrong, which is why this tool treats $0.10/word as a low-end flag
//     rather than a single "the" rate.
//   - Most writers who ghostwrite (no byline) do not charge extra for it;
//     of those who do, the majority add a premium of 16-20% over their
//     bylined rate (multiple 2026 rate-guide sources agree on this range).
//   - The single most consistent finding across every source: a pure
//     per-word rate compensates WRITING time only. Research, interviews,
//     outlining, and revision rounds are time the piece actually costs the
//     writer that a per-word rate does not separately pay for -- which is
//     why switching from per-word to flat per-project pricing is described
//     repeatedly as the most reliable way an intermediate writer raises
//     their real hourly income, without raising their quoted per-word rate
//     at all. This module makes that trade-off visible by computing the
//     EFFECTIVE hourly rate each pricing method actually pays once research
//     and revision hours are included, not just the writing hours.
//
// This module does not verify a writer's actual typing speed, a client's
// revision demands, or market rates in any specific niche -- the writer
// supplies each figure, and the page names the rate-guide sources above as
// where to sanity-check them.

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function numOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function money(n) {
  const value = Number(n) || 0;
  const format = (v) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

// Below this, a rate sits at or under the entry-level floor every 2026 rate
// guide above agrees on ($0.05-$0.10/word).
export const LOW_RATE_FLOOR = 0.10;

// A ghostwriting premium some (not most) writers add, per the rate guides
// above -- shown as information, never applied automatically, because most
// writers who ghostwrite do not charge it at all.
export const GHOSTWRITING_PREMIUM_LOW = 0.16;
export const GHOSTWRITING_PREMIUM_HIGH = 0.20;

/**
 * Computes the effective hourly rate a per-word price and a flat project fee
 * each actually pay for the SAME job, once research and revision hours (time
 * a per-word rate does not separately compensate) are counted alongside
 * writing time -- and, given a target hourly rate, the per-word rate or flat
 * fee that would be needed to hit it for this same job.
 */
export function writerRateOutcome({
  wordCount = 0,
  perWordRate = 0,
  flatFee = 0,
  writingWordsPerHour = 0,
  researchHours = 0,
  revisionRounds = 0,
  hoursPerRevision = 0,
  targetHourlyRate = 0,
  isGhostwritten = false,
} = {}) {
  const words = numOrZero(wordCount);
  const rate = numOrZero(perWordRate);
  const fee = numOrZero(flatFee);
  const speed = num(writingWordsPerHour);
  const research = numOrZero(researchHours);
  const rounds = numOrZero(revisionRounds);
  const perRound = numOrZero(hoursPerRevision);
  const target = numOrZero(targetHourlyRate);

  const writingHours = speed > 0 ? words / speed : 0;
  const revisionHours = rounds * perRound;
  const nonWritingHours = research + revisionHours;
  const totalHours = writingHours + nonWritingHours;

  const perWordTotal = words * rate;
  const perWordHourly = totalHours > 0 ? perWordTotal / totalHours : 0;
  const flatFeeHourly = totalHours > 0 ? fee / totalHours : 0;

  const hourlyDifference = Math.abs(perWordHourly - flatFeeHourly);
  let betterOption = "tie";
  if (totalHours > 0 && hourlyDifference > 0.005) {
    betterOption = flatFeeHourly > perWordHourly ? "flat-fee" : "per-word";
  }

  const nonWritingShare = totalHours > 0 ? nonWritingHours / totalHours : 0;

  const requiredPerWordRate = words > 0 && totalHours > 0 ? (target * totalHours) / words : 0;
  const requiredFlatFee = totalHours > 0 ? target * totalHours : 0;

  const findings = [];

  if (totalHours <= 0) {
    findings.push({
      severity: "info",
      title: "Enter a word count and writing speed to see effective hourly rates",
      detail: "This tool needs the hours the job actually takes -- writing speed, research time, and revision rounds -- to turn either price into an hourly figure.",
    });
  } else {
    if (betterOption !== "tie") {
      const winner = betterOption === "flat-fee" ? "flat project fee" : "per-word rate";
      const winnerHourly = betterOption === "flat-fee" ? flatFeeHourly : perWordHourly;
      const loserHourly = betterOption === "flat-fee" ? perWordHourly : flatFeeHourly;
      findings.push({
        severity: "high",
        title: `The ${winner} pays ${money(hourlyDifference)}/hr more for this same job`,
        detail: `At ${money(winnerHourly)}/hr vs. ${money(loserHourly)}/hr across ${totalHours.toFixed(1)} total hours (writing, research, and revisions), the ${winner} is the better price for the job as you have described it -- for this job only, not as a rule for every job.`,
      });
    }

    if (rate > 0 && rate < LOW_RATE_FLOOR) {
      findings.push({
        severity: "medium",
        title: `${money(rate)}/word is at or below the 2026 entry-level range`,
        detail: `2026 freelance rate surveys put entry-level content rates at roughly $0.05-$0.10/word, with intermediate-to-senior generalist work at $0.10-$0.50/word. This rate sits at or under that entry floor.`,
      });
    }

    if (nonWritingShare >= 0.25) {
      findings.push({
        severity: "medium",
        title: `${Math.round(nonWritingShare * 100)}% of the total time is research and revisions, not writing`,
        detail: "A per-word rate pays for words written, not for research, interviews, outlining, or revision rounds. When non-writing time is this large a share of the job, quoting a flat project fee (which can price the whole job) typically pays a higher effective hourly rate than the same per-word rate -- rate guides describe this switch as the single most reliable way an established writer raises real income without raising their quoted per-word figure.",
      });
    }

    if (isGhostwritten) {
      findings.push({
        severity: "info",
        title: "Ghostwritten (no byline) work sometimes commands a premium",
        detail: `Most writers do not charge extra for ghostwriting. Of the writers who do, most add a ${Math.round(GHOSTWRITING_PREMIUM_LOW * 100)}-${Math.round(GHOSTWRITING_PREMIUM_HIGH * 100)}% premium over their bylined rate for the same word count, per 2026 rate-guide surveys. Not applied to the numbers above -- decide separately whether to add it.`,
      });
    }

    if (target > 0) {
      findings.push({
        severity: "info",
        title: `To hit ${money(target)}/hr on this job`,
        detail: `You would need a per-word rate of about ${money(requiredPerWordRate)}/word, or a flat project fee of about ${money(requiredFlatFee)}, across the same ${totalHours.toFixed(1)} total hours.`,
      });
    }
  }

  return {
    wordCount: words,
    perWordRate: rate,
    flatFee: fee,
    writingWordsPerHour: speed,
    researchHours: research,
    revisionRounds: rounds,
    hoursPerRevision: perRound,
    targetHourlyRate: target,
    isGhostwritten: Boolean(isGhostwritten),
    writingHours,
    revisionHours,
    nonWritingHours,
    totalHours,
    perWordTotal,
    perWordHourly,
    flatFeeHourly,
    hourlyDifference,
    betterOption,
    nonWritingShare,
    requiredPerWordRate,
    requiredFlatFee,
    findings,
  };
}
