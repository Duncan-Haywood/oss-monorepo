// Incremental cost of taking a second building after the drive.
//
// The first-building bid in calc.mjs prices one site. Contractors lose money
// on the second by quoting that same production-rate price and treating the
// van as free. Drive time is loaded labor, not windshield scenery, and the
// extra fuel/wear is a monthly direct cost. Both take overhead the same way
// the first building's chemicals do.
//
// This module does not change calculateBid. Frequency-cut, day-porter, and
// strip-and-wax work stay on those branches; this only answers "does the
// next address still pay once we count the minutes between them?"

import { calculateBid, WEEKS_PER_MONTH } from './calc.mjs';

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

/**
 * Price a second site including the drive from the current route.
 *
 * @param {object} input
 * @param {object} input.candidate          Same shape as calculateBid for the
 *   new building only. Do not re-enter the first site's truck here — that
 *   cost is already on the book. Put only incremental equipment on the
 *   candidate, plus extraVehicleMonthly for fuel and wear.
 * @param {number} input.driveMinutesOneWay Minutes from the current route
 *   (home or the first building) to the new site, one way.
 * @param {number} input.tripsPerWeek       How many times the crew actually
 *   drives there. Usually the new site's cleanings per week; less if they
 *   stack two buildings on the same night.
 * @param {number} input.extraVehicleMonthly Incremental fuel, tolls, and
 *   wear beyond the first site's vehicle line.
 * @param {number|string|null} [input.offeredMonthly] Optional price the
 *   prospect put on the new site, scored against the drive-inclusive cost.
 * @param {number|string|null} [input.existingMonthlyProfit] Optional profit
 *   already kept on the first building, so the combined book is visible.
 */
export function compareSecondSite(input) {
  const driveMinutesOneWay = number(input.driveMinutesOneWay ?? 0, 'Drive minutes one way');
  const tripsPerWeek = number(input.tripsPerWeek ?? 0, 'Trips per week');
  const extraVehicleMonthly = number(input.extraVehicleMonthly ?? 0, 'Extra vehicle cost');
  const overheadRate = number(input.candidate?.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.candidate?.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const building = calculateBid({ ...input.candidate, proposedPrice: undefined });

  // Round trip, then weeks-per-month — the same conversion the first-building
  // bid uses, so a 25-minute hop three nights a week is not "about an hour."
  const monthlyDriveHours = (driveMinutesOneWay * 2 / 60) * tripsPerWeek * WEEKS_PER_MONTH;
  const monthlyDriveLabor = monthlyDriveHours * building.loadedWage;
  const addedDirect = monthlyDriveLabor + extraVehicleMonthly;
  const addedOverhead = addedDirect * overheadRate / 100;
  const incrementalCost = building.monthlyCost + addedDirect + addedOverhead;
  const priceToHoldMargin = incrementalCost / (1 - targetMargin / 100);
  const ignoredDrivePrice = building.monthlyPrice;
  const driveGap = priceToHoldMargin - ignoredDrivePrice;

  const serviceHours = building.monthlyHours + monthlyDriveHours;
  const driveShare = serviceHours === 0 ? 0 : monthlyDriveHours / serviceHours * 100;

  const hasOffer = input.offeredMonthly !== null && input.offeredMonthly !== undefined && input.offeredMonthly !== '';
  const offeredMonthly = hasOffer ? number(input.offeredMonthly, 'Offered monthly price') : null;
  const offeredProfit = offeredMonthly === null ? null : offeredMonthly - incrementalCost;
  const offeredMargin = offeredMonthly === null || offeredMonthly === 0
    ? null
    : offeredProfit / offeredMonthly * 100;

  const hasExisting = input.existingMonthlyProfit !== null
    && input.existingMonthlyProfit !== undefined
    && input.existingMonthlyProfit !== '';
  const existingMonthlyProfit = hasExisting
    ? number(input.existingMonthlyProfit, 'Existing monthly profit')
    : null;

  return {
    building,
    driveMinutesOneWay,
    tripsPerWeek,
    extraVehicleMonthly,
    monthlyDriveHours,
    monthlyDriveLabor,
    addedDirect,
    addedOverhead,
    incrementalCost,
    priceToHoldMargin,
    incrementalProfitAtTarget: priceToHoldMargin - incrementalCost,
    ignoredDrivePrice,
    driveGap,
    serviceHours,
    driveShare,
    walkAwayMonthly: incrementalCost,
    offered: offeredMonthly === null ? null : {
      price: offeredMonthly,
      profit: offeredProfit,
      margin: offeredMargin,
      belowWalkAway: offeredMonthly < incrementalCost,
      missesTarget: offeredMonthly < priceToHoldMargin,
    },
    existingMonthlyProfit,
    combinedProfitAtOffer: existingMonthlyProfit === null || offeredProfit === null
      ? null
      : existingMonthlyProfit + offeredProfit,
    combinedProfitAtTarget: existingMonthlyProfit === null
      ? null
      : existingMonthlyProfit + (priceToHoldMargin - incrementalCost),
  };
}

/**
 * One paragraph a contractor can paste into a bid or a "thanks, here's why
 * the number is not the same as the first building" reply. Arithmetic only.
 */
export function secondSiteNote(comparison, { targetMargin } = {}) {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const marginLabel = Number.isFinite(targetMargin) ? targetMargin : 20;
  const driveLine = comparison.monthlyDriveHours === 0
    ? 'No drive time is included in this figure.'
    : `${comparison.monthlyDriveHours.toFixed(1)} labor hours a month are on the road (${comparison.driveShare.toFixed(0)}% of the hours this site needs), at the same loaded wage as the clean.`;
  const offerLine = comparison.offered === null
    ? `The walk-away on this site, drive included, is ${money(comparison.walkAwayMonthly)}.`
    : comparison.offered.belowWalkAway
      ? `At ${money(comparison.offered.price)} this site loses ${money(Math.abs(comparison.offered.profit))} a month after the drive. Walk-away is ${money(comparison.walkAwayMonthly)}.`
      : comparison.offered.missesTarget
        ? `At ${money(comparison.offered.price)} this site covers cost after the drive but leaves a ${(comparison.offered.margin ?? 0).toFixed(1)}% margin — ${money(comparison.priceToHoldMargin - comparison.offered.price)} a month short of a ${marginLabel}% target.`
        : `At ${money(comparison.offered.price)} this site still holds a ${(comparison.offered.margin ?? 0).toFixed(1)}% margin after the drive.`;
  return [
    `The price that still holds a ${marginLabel}% margin on the second building, including the drive, is ${money(comparison.priceToHoldMargin)} — not the ${money(comparison.ignoredDrivePrice)} you would quote if the van were free.`,
    driveLine,
    offerLine,
  ].join(' ');
}
