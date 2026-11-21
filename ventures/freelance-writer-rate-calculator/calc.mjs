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
//   - Most writers who ghostwrite (no byline) do not charge extra for it.
//     Peak Freelance's survey (213 writers) found about a third of
//     ghostwriters add a premium, most often around 16-20% over their
//     bylined rate. That is one survey, not a consensus.
//   - Rate guides recommend counting research, interviews, outlining and
//     revision rounds as hours the piece costs. For ONE job, both offers are
//     fixed sums divided by the same hours, so the higher total always has
//     the higher effective hourly rate (audit 2026-11-21: 144 of 144 grid
//     cases). What the hours add is the size of the gap per hour, whether
//     either offer clears the writer's target hourly rate, and the price
//     that would. This module computes those, plus the same hourly rates
//     after US self-employment tax (IRS Schedule SE: 15.3% on 92.35% of
//     net earnings).
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
  const format = (v) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).replace(/\.\d$/, (m) => m + "0")}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

// Below this, a rate sits under the top of the entry-level band several 2026
// guides quote ($0.05-$0.10/word); bestwriting.com's own tiers put beginners
// near $0.15, so this is a conservative low-end flag, not a consensus figure.
export const LOW_RATE_FLOOR = 0.10;

// A ghostwriting premium some (not most) writers add, per the rate guides
// above -- shown as information, never applied automatically, because most
// writers who ghostwrite do not charge it at all.
export const GHOSTWRITING_PREMIUM_LOW = 0.16;
export const GHOSTWRITING_PREMIUM_HIGH = 0.20;

// US self-employment tax (Social Security 12.4% + Medicare 2.9%) applies to
// 92.35% of net self-employment earnings (IRS Schedule SE, line 4a). Before
// income tax; ignores the Social Security wage base and the deduction for
// half of SE tax, both of which only matter for the income-tax bill or for
// higher earners.
// The $400 floor applies to a year's net earnings, not one job, so this
// per-job hourly assumes the writer's year clears it (stated on the page).
export const SE_TAX_RATE = 0.153;
export const SE_TAX_BASE = 0.9235;
export const SE_TAX_EFFECTIVE = SE_TAX_RATE * SE_TAX_BASE;

// Hourly differences at or below this (half a cent per hour) are a tie: the
// two offers differ only by rounding.
export const TIE_TOLERANCE = 0.005;

// Share of total hours spent on research and revisions at or above which the
// tool points out that this time needs pricing in.
export const NON_WRITING_SHARE_NOTE = 0.25;

// Per-word rates live below a dollar, so cents are not enough precision: a
// solved $0.0125/word must not print as $0.01. Shows 2 to 4 decimals.
export function perWordMoney(n) {
  const value = Math.abs(Number(n) || 0);
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

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

  // Words with no writing speed means the writing time is unknown, not zero:
  // computing hourly rates without it overstates both (audit 2026-11-13).
  const speedMissing = words > 0 && speed <= 0;
  const writingHours = speed > 0 ? words / speed : 0;
  const revisionHours = rounds * perRound;
  const nonWritingHours = research + revisionHours;
  const totalHours = speedMissing ? 0 : writingHours + nonWritingHours;

  const perWordTotal = words * rate;
  const perWordHourly = totalHours > 0 ? perWordTotal / totalHours : 0;
  const flatFeeHourly = totalHours > 0 ? fee / totalHours : 0;

  const hourlyDifference = Math.abs(perWordHourly - flatFeeHourly);
  let betterOption = "tie";
  if (totalHours > 0 && hourlyDifference > TIE_TOLERANCE) {
    betterOption = flatFeeHourly > perWordHourly ? "flat-fee" : "per-word";
  }

  const nonWritingShare = totalHours > 0 ? nonWritingHours / totalHours : 0;

  const requiredPerWordRate = words > 0 && totalHours > 0 ? (target * totalHours) / words : 0;
  const requiredFlatFee = totalHours > 0 ? target * totalHours : 0;
  const perWordHourlyAfterSeTax = perWordHourly * (1 - SE_TAX_EFFECTIVE);
  const flatFeeHourlyAfterSeTax = flatFeeHourly * (1 - SE_TAX_EFFECTIVE);

  const findings = [];

  if (speedMissing) {
    findings.push({
      severity: "info",
      title: "Enter your writing speed (words per hour) to see effective hourly rates",
      detail: "Without a writing speed the writing time is unknown, so any hourly figure would leave it out and overstate what both prices pay.",
    });
  } else if (totalHours <= 0) {
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
        title: `${perWordMoney(rate)}/word is below the 2026 entry-level range`,
        detail: `2026 freelance rate surveys put entry-level content rates at roughly $0.05-$0.10/word, with intermediate-to-senior generalist work at $0.10-$0.50/word. This rate sits below the top of that band.`,
      });
    }

    if (nonWritingShare >= NON_WRITING_SHARE_NOTE && betterOption !== "per-word") {
      findings.push({
        severity: "medium",
        title: `${Math.round(nonWritingShare * 100)}% of the total time is research and revisions, not writing`,
        detail: "A per-word rate pays for words written, not for research, interviews, outlining, or revision rounds. When non-writing time is this large a share of the job, quoting a flat project fee lets you price that time in. Check the flat fee against your target hourly rate below.",
      });
    }

    if (isGhostwritten) {
      findings.push({
        severity: "info",
        title: "Ghostwritten (no byline) work sometimes commands a premium",
        detail: `Most writers do not charge extra for ghostwriting. In one 2026 survey of 213 writers (Peak Freelance), about a third of ghostwriters added a premium, most often around ${Math.round(GHOSTWRITING_PREMIUM_LOW * 100)}-${Math.round(GHOSTWRITING_PREMIUM_HIGH * 100)}% over their bylined rate. Not applied to the numbers above -- decide separately whether to add it.`,
      });
    }

    if (target > 0) {
      findings.push({
        severity: "info",
        title: `To hit ${money(target)}/hr on this job`,
        detail: `You would need a per-word rate of about ${perWordMoney(requiredPerWordRate)}/word, or a flat project fee of about ${money(requiredFlatFee)}, across the same ${totalHours.toFixed(1)} total hours.`,
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
    perWordHourlyAfterSeTax,
    flatFeeHourlyAfterSeTax,
    speedMissing,
    findings,
  };
}
