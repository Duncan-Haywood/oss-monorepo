// Kickstarter creator-payout arithmetic. No network, no stored live schedule.
//
// A funded Kickstarter project pays two fees, and only if the funding goal is
// met -- an unfunded project is charged nothing at all (Kickstarter's own
// "all-or-nothing" model):
//
//   - Platform fee: 5% of the total amount pledged.
//   - Payment processing: charged per pledge, not on the total, and the rate
//     itself changes below a threshold:
//       - Pledges of $10.00 or more: 3% of the pledge, plus $0.20.
//       - Pledges under $10.00 ("micro-pledges"): 5% of the pledge, plus $0.05.
//
// Every rate is a constant lifted from Kickstarter's own published US fee
// schedule ("Fees: United States", kickstarter.com/help/fees), not a live
// fetch -- the schedule is a matter of public record that can change, and a
// creator budgeting against it should confirm the current numbers there.
//
// The processing fee's flat per-pledge component is what a "Kickstarter
// takes 8-10%" summary misses: it is charged once per *pledge*, not once per
// *dollar*. Two campaigns that raise the identical total pay different total
// fees whenever their average pledge size differs, because the same flat
// $0.20 (or $0.05) is spread across more or fewer transactions. A campaign
// with many small pledges keeps a smaller share of its raise than one with
// fewer, larger pledges of the same total -- this tool exists to make that
// difference visible before you set reward tiers, not after the campaign
// closes.

export const PLATFORM_FEE_RATE = 0.05;
export const MICRO_PLEDGE_THRESHOLD = 10;
export const STANDARD_PROCESSING_RATE = 0.03;
export const STANDARD_PROCESSING_FLAT = 0.20;
export const MICRO_PROCESSING_RATE = 0.05;
export const MICRO_PROCESSING_FLAT = 0.05;

export const CAMPAIGN_INPUT_IDS = Object.freeze(['totalRaised', 'backerCount']);
export const PLEDGE_INPUT_IDS = Object.freeze(['pledgeAmount']);

function isBlank(value) {
  return value === '' || value === null || value === undefined || String(value).trim() === '';
}

function number(value, name, { min = 0, integer = false } = {}) {
  if (isBlank(value)) throw new Error(`${name} is required`);
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (integer && !Number.isInteger(result)) throw new Error(`${name} must be a whole number`);
  return result;
}

/** Which processing tier one pledge falls in, and its processing fee. */
export function processingFor(pledgeAmount) {
  if (pledgeAmount < MICRO_PLEDGE_THRESHOLD) {
    return {
      tier: 'micro',
      fee: pledgeAmount * MICRO_PROCESSING_RATE + MICRO_PROCESSING_FLAT,
    };
  }
  return {
    tier: 'standard',
    fee: pledgeAmount * STANDARD_PROCESSING_RATE + STANDARD_PROCESSING_FLAT,
  };
}

/**
 * One pledge, priced the way Kickstarter's own two fees actually land on it:
 * this pledge's 5% share of the platform fee, plus its own per-pledge
 * processing fee. Useful on its own for checking one reward tier, and it is
 * the building block `calculateCampaign` multiplies across every backer.
 */
export function calculatePledge(input) {
  const errors = [];
  const read = (id, label, opts) => {
    try {
      return number(input[id], label, opts);
    } catch (error) {
      errors.push({ id, message: error.message });
      return 0;
    }
  };

  const pledgeAmount = read('pledgeAmount', 'Pledge amount');
  if (errors.length) return { ok: false, errors };

  const platformFee = pledgeAmount * PLATFORM_FEE_RATE;
  const { tier, fee: processingFee } = processingFor(pledgeAmount);
  const totalFee = platformFee + processingFee;
  const netContribution = pledgeAmount - totalFee;
  const effectiveRate = pledgeAmount > 0 ? (totalFee / pledgeAmount) * 100 : 0;

  return {
    ok: true,
    errors: [],
    pledgeAmount,
    tier,
    platformFee,
    processingFee,
    totalFee,
    netContribution,
    effectiveRate,
  };
}

/**
 * A whole campaign's fees, assuming every pledge is close to the campaign's
 * own average (`totalRaised / backerCount`) -- the only assumption possible
 * from aggregate totals alone, since Kickstarter's own reporting to a
 * creator gives per-pledge processing detail only after the campaign closes.
 * A campaign with reward tiers spread far from the average (a $1 sticker
 * tier alongside a $500 collector's tier) will land somewhat differently
 * from this estimate; `calculatePledge` above prices one tier exactly if you
 * want to check a specific reward level rather than the campaign average.
 */
export function calculateCampaign(input) {
  const errors = [];
  const read = (id, label, opts) => {
    try {
      return number(input[id], label, opts);
    } catch (error) {
      errors.push({ id, message: error.message });
      return 0;
    }
  };

  const totalRaised = read('totalRaised', 'Total raised');
  const backerCount = read('backerCount', 'Number of backers', { min: 1, integer: true });
  if (errors.length) return { ok: false, errors };

  const averagePledge = totalRaised / backerCount;
  const perPledge = calculatePledge({ pledgeAmount: averagePledge });

  const platformFee = totalRaised * PLATFORM_FEE_RATE;
  const totalProcessingFee = perPledge.processingFee * backerCount;
  const totalFee = platformFee + totalProcessingFee;
  const netPayout = totalRaised - totalFee;
  const effectiveRate = totalRaised > 0 ? (totalFee / totalRaised) * 100 : 0;

  const notes = [];
  if (perPledge.tier === 'micro') {
    notes.push(
      `At an average pledge of $${averagePledge.toFixed(2)}, every pledge is assumed to fall in the micro-pledge tier (5% + $${MICRO_PROCESSING_FLAT.toFixed(2)} processing, under $${MICRO_PLEDGE_THRESHOLD.toFixed(2)}) -- the higher of the two processing rates.`,
    );
  }
  notes.push(
    `The same $${totalRaised.toFixed(2)} raised across more backers (a smaller average pledge) would keep less, because the $${perPledge.tier === 'micro' ? MICRO_PROCESSING_FLAT.toFixed(2) : STANDARD_PROCESSING_FLAT.toFixed(2)} flat processing charge is per pledge, not per dollar -- it is spread across more transactions.`,
  );
  notes.push('Kickstarter only charges these fees if the funding goal is met. An unfunded project is charged nothing, and no pledge is collected.');

  return {
    ok: true,
    errors: [],
    totalRaised,
    backerCount,
    averagePledge,
    tier: perPledge.tier,
    platformFee,
    totalProcessingFee,
    totalFee,
    netPayout,
    effectiveRate,
    notes,
  };
}
