// Pricing math for a dog/cat groom: size and coat drive the base time, matting
// and add-ons extend it, and — for mobile groomers — travel adds its own time
// and mileage cost, the same shape as mobile-detailing-bid-calculator's whole
// stop. The result is a contribution after costs, a break-even price, and a
// target-margin quote, exactly like every other bid calculator in this
// portfolio.
//
// What this tool is not: it prices the groom you have already decided to do.
// It does not decide whether the animal is fit to be groomed. A severely
// matted coat can hide skin damage that needs a vet or vet tech, not a bigger
// invoice, and a fearful or aggressive animal is a safety call for the
// groomer, not a pricing input. `severeMattingAck` exists so that judgment
// call cannot be skipped past in the direction of a bigger number — see the
// guard below and the disclaimer on every page this venture publishes.

export const SIZE_TIERS = {
  small: { label: 'Small (under 25 lb)', minutes: 45 },
  medium: { label: 'Medium (25–50 lb)', minutes: 60 },
  large: { label: 'Large (50–90 lb)', minutes: 80 },
  giant: { label: 'Giant (90 lb+)', minutes: 105 },
};

export const COAT_TYPES = {
  smooth: { label: 'Short / smooth', multiplier: 1 },
  medium: { label: 'Medium', multiplier: 1.15 },
  long: { label: 'Long / double coat', multiplier: 1.35 },
  curly: { label: 'Curly / doodle', multiplier: 1.6 },
};

export const MATTING_LEVELS = {
  none: { label: 'None', minutes: 0, surcharge: 0, requiresAck: false },
  light: { label: 'Light — a few small mats', minutes: 15, surcharge: 10, requiresAck: false },
  moderate: { label: 'Moderate — matting across the coat', minutes: 35, surcharge: 30, requiresAck: false },
  severe: { label: 'Severe — matted to the skin', minutes: 60, surcharge: 60, requiresAck: true },
};

/**
 * Per-add-on minutes and price, keyed by the boolean field id the form uses.
 * Anal gland expression is a real, common add-on at both mobile and in-shop
 * groomers; the copy stays clinical and factual rather than graphic, matching
 * how a groomer's own price sheet would list it.
 */
export const ADD_ONS = {
  nailTrim: { label: 'Nail trim', minutes: 10, price: 15 },
  nailGrinding: { label: 'Nail grinding (smoothing after trim)', minutes: 10, price: 10 },
  teethBrushing: { label: 'Teeth brushing', minutes: 5, price: 10 },
  earCleaning: { label: 'Ear cleaning', minutes: 10, price: 12 },
  deshedding: { label: 'De-shedding treatment', minutes: 20, price: 25 },
  fleaTick: { label: 'Flea/tick treatment', minutes: 15, price: 20 },
  analGland: { label: 'Anal gland expression', minutes: 10, price: 15 },
};

export const ADD_ON_IDS = Object.keys(ADD_ONS);

const defaults = {
  targetPrice: 75,
  size: 'medium',
  coat: 'medium',
  matting: 'none',
  severeMattingAck: false,
  nailTrim: false,
  nailGrinding: false,
  teethBrushing: false,
  earCleaning: false,
  deshedding: false,
  fleaTick: false,
  analGland: false,
  mobile: false,
  travelMiles: 12,
  vehicleRate: 0.67,
  travelSetupMinutes: 15,
  wage: 0,
  burdenPercent: 25,
  supplies: 6,
  overhead: 5,
  paymentRate: 3,
  targetMargin: 35,
};

function nonNegative(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${name} must be a non-negative number`);
  return number;
}

function oneOf(value, table, name) {
  const key = value ?? undefined;
  if (key === undefined || !(key in table)) throw new Error(`${name} must be one of: ${Object.keys(table).join(', ')}`);
  return key;
}

export function calculateBid(input = {}) {
  const value = (name) => nonNegative(input[name] ?? defaults[name], name);
  const targetPrice = value('targetPrice');
  const size = oneOf(input.size ?? defaults.size, SIZE_TIERS, 'size');
  const coat = oneOf(input.coat ?? defaults.coat, COAT_TYPES, 'coat');
  const matting = oneOf(input.matting ?? defaults.matting, MATTING_LEVELS, 'matting');
  const severeMattingAck = Boolean(input.severeMattingAck ?? defaults.severeMattingAck);
  const addOnFlags = Object.fromEntries(
    ADD_ON_IDS.map((id) => [id, Boolean(input[id] ?? defaults[id])]),
  );
  const mobile = Boolean(input.mobile ?? defaults.mobile);
  const travelMiles = value('travelMiles');
  const vehicleRate = value('vehicleRate');
  const travelSetupMinutes = value('travelSetupMinutes');
  const wage = value('wage');
  const burdenPercent = value('burdenPercent');
  const supplies = value('supplies');
  const overhead = value('overhead');
  const paymentRate = value('paymentRate');
  const targetMargin = value('targetMargin');
  if (paymentRate >= 100) throw new Error('Payment fee must be below 100%');
  if (targetMargin >= 100) throw new Error('Target margin must be below 100%');

  // A severe mat is a welfare and safety judgment call — shave-down risk to
  // damaged skin, sedation, a referral to a vet or vet tech — not just a
  // bigger invoice. It is not this tool's call to make, so it refuses to
  // price it until the groomer has explicitly acknowledged that separately
  // from picking the level, the same shape as the fee+margin guard below.
  if (matting === 'severe' && !severeMattingAck) {
    throw new Error(
      'Severe matting requires the safety acknowledgment before it can be priced — this is a welfare and safety call for the groomer or a vet, not a pricing decision.',
    );
  }

  const mattingInfo = MATTING_LEVELS[matting];
  const addOns = ADD_ON_IDS.filter((id) => addOnFlags[id]);
  const baseMinutes = SIZE_TIERS[size].minutes * COAT_TYPES[coat].multiplier;
  const mattingMinutes = mattingInfo.minutes;
  const addOnMinutes = addOns.reduce((sum, id) => sum + ADD_ONS[id].minutes, 0);
  const addOnPrice = addOns.reduce((sum, id) => sum + ADD_ONS[id].price, 0);
  const travelMinutes = mobile ? travelSetupMinutes : 0;

  const groomMinutes = baseMinutes + mattingMinutes + addOnMinutes;
  const totalMinutes = groomMinutes + travelMinutes;
  const totalHours = totalMinutes / 60;

  const loadedLaborRate = wage * (1 + burdenPercent / 100);
  const laborCost = totalHours * loadedLaborRate;
  const travelCost = mobile ? travelMiles * vehicleRate : 0;
  const mattingSurcharge = mattingInfo.surcharge;
  const directCosts = supplies + overhead + travelCost + laborCost + addOnPrice + mattingSurcharge;
  const paymentFee = targetPrice * paymentRate / 100;
  const totalCost = directCosts + paymentFee;
  const contribution = targetPrice - totalCost;
  const margin = targetPrice === 0 ? 0 : contribution / targetPrice * 100;
  const breakEven = directCosts / (1 - paymentRate / 100);

  // Same guard as the rest of the portfolio's bid calculators: the payment
  // fee and the target margin are both slices of the *final* price, so
  // together they can claim the whole ticket. Infinity is the house signal
  // for "no price reaches this".
  const claimedSharePct = paymentRate + targetMargin;
  const targetDenominator = 1 - claimedSharePct / 100;
  const targetReachable = targetDenominator > 0;
  const targetQuote = targetReachable
    ? directCosts / targetDenominator
    : Infinity;
  const proposedPrice = targetPrice;

  return {
    targetPrice, size, coat, matting, severeMattingAck, addOns, ...addOnFlags, mobile,
    travelMiles, vehicleRate, travelSetupMinutes, wage, burdenPercent,
    supplies, overhead, paymentRate, targetMargin, claimedSharePct, targetReachable,
    baseMinutes, mattingMinutes, addOnMinutes, travelMinutes, groomMinutes, totalMinutes, totalHours,
    loadedLaborRate, laborCost, travelCost, mattingSurcharge, addOnPrice,
    directCosts, paymentFee, totalCost, contribution, margin, breakEven, targetQuote,
    proposedPrice, profit: proposedPrice - totalCost,
    marginAtProposed: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
    effectiveHourly: totalHours === 0 ? 0 : contribution / totalHours,
  };
}

/**
 * Live copy for the fee + margin pair. Both numbers are slices of the
 * *final* price, so they can jointly claim the whole ticket while each
 * input is still individually legal.
 */
export function claimNote(result) {
  const claimed = Number(result.claimedSharePct);
  const fee = Number(result.paymentRate);
  const margin = Number(result.targetMargin);
  if (![claimed, fee, margin].every(Number.isFinite)) {
    return '';
  }
  const claimedLabel = claimed.toFixed(1);
  const leftover = (100 - claimed).toFixed(1);
  if (!result.targetReachable) {
    return `These two already claim ${claimedLabel}% of the price (fee ${fee.toFixed(1)}% + margin ${margin.toFixed(1)}%). No quote can hit that target — lower one of them.`;
  }
  return `Fee and margin claim ${claimedLabel}% of the price, leaving ${leftover}% for job costs.`;
}

/**
 * A visible, plain-language note when the matting level is a welfare/safety
 * call rather than a pricing one. Shown regardless of whether the ack has
 * been given, so a groomer sees the warning before they need the checkbox,
 * not only after the calculation throws.
 */
export function mattingNote(matting) {
  if (matting === 'moderate') {
    return 'Moderate matting slows the groom and this surcharge reflects that extra time — but check the skin underneath before you commit to a price. Matting can hide irritation or early sores that change the job.';
  }
  if (matting === 'severe') {
    return 'Severe matting is a welfare and safety call, not just a bigger invoice. Matted-to-the-skin coats can hide cuts, sores, or skin damage that a shave-down can worsen, and matting this advanced often means sedation or a vet/vet-tech referral rather than a routine groom. This tool does not assess the animal — that judgment belongs to you or a veterinarian. If you are not confident the animal is safe and healthy enough to groom, refer out rather than pricing it in.';
  }
  return '';
}

export { defaults };
