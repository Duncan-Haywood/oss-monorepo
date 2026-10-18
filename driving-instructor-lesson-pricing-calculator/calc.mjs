/**
 * Per-lesson profit and minimum price for an independent driving instructor,
 * as deterministic functions with no dependencies.
 *
 * The buyer: a self-employed driving instructor (ADI, or a US driver-ed or
 * behind-the-wheel instructor) who owns a dual-control car and sells lessons
 * by the hour. The mistake this catches: a lesson price is set by looking at
 * what the next instructor charges, while the real cost of a lesson is the
 * fuel and wear of the miles driven to collect and drop the pupil, the car's
 * fixed yearly cost spread over only the lessons that actually happen, and
 * the unpaid gap between pupils. Cancellations quietly raise every one of
 * those per paid lesson.
 *
 * Profit here is before income tax and self-employment tax, and the tool
 * does not give tax advice. It applies the numbers typed in to one year.
 *
 *   priceLessons(inputs)       -- profit, profit per diary hour, the minimum
 *                                 price that reaches a take-home target, and
 *                                 the effect of a block-booking discount.
 *   formatPricingSummary(r)    -- the same result as plain text.
 */

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function money(n) {
  const text = `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

function number(value, name, { allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error(`${name} must be a non-negative number`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

/**
 * @param {{
 *   lessonPrice: number, lessonMinutes?: number, gapMinutes?: number,
 *   slotsPerWeek: number, weeksPerYear?: number, cancelRate?: number,
 *   milesPerLesson: number, mpg: number, fuelPrice: number,
 *   wearPerMile?: number, annualFixedCosts?: number, weeklyFees?: number,
 *   targetAnnualProfit?: number, blockLessons?: number, blockPrice?: number,
 * }} input
 */
export function priceLessons(input = {}) {
  const lessonPrice = number(input.lessonPrice, 'Lesson price', { allowZero: false });
  const lessonMinutes = number(input.lessonMinutes ?? 60, 'Lesson length', { allowZero: false });
  const gapMinutes = number(input.gapMinutes ?? 0, 'Unpaid gap per lesson');
  const slotsPerWeek = number(input.slotsPerWeek, 'Lesson slots per week', { allowZero: false });
  const weeksPerYear = number(input.weeksPerYear ?? 46, 'Working weeks per year', { allowZero: false });
  if (weeksPerYear > 52) throw new Error('Working weeks per year must be 52 or fewer');
  const cancelRate = number(input.cancelRate ?? 8, 'Unpaid cancellation rate');
  if (cancelRate >= 100) throw new Error('Unpaid cancellation rate must be under 100%');
  const milesPerLesson = number(input.milesPerLesson, 'Miles per lesson');
  const mpg = number(input.mpg, 'Miles per gallon', { allowZero: false });
  const fuelPrice = number(input.fuelPrice, 'Fuel price');
  const wearPerMile = number(input.wearPerMile ?? 0, 'Wear per mile');
  const annualFixedCosts = number(input.annualFixedCosts ?? 0, 'Annual fixed costs');
  const weeklyFees = number(input.weeklyFees ?? 0, 'Weekly franchise or desk fees');
  const targetAnnualProfit = number(input.targetAnnualProfit ?? 0, 'Target annual profit');

  const slotsPerYear = slotsPerWeek * weeksPerYear;
  const paidLessons = slotsPerYear * (1 - cancelRate / 100);
  const runningCostPerLesson = (milesPerLesson / mpg) * fuelPrice + milesPerLesson * wearPerMile;
  const fixedPerYear = annualFixedCosts + weeklyFees * weeksPerYear;

  const revenue = paidLessons * lessonPrice;
  const runningCosts = paidLessons * runningCostPerLesson;
  const annualProfit = revenue - runningCosts - fixedPerYear;
  const fixedPerPaidLesson = fixedPerYear / paidLessons;
  const costPerPaidLesson = runningCostPerLesson + fixedPerPaidLesson;
  const profitPerLesson = lessonPrice - costPerPaidLesson;

  const diaryHoursPerYear = (slotsPerYear * (lessonMinutes + gapMinutes)) / 60;
  const profitPerDiaryHour = annualProfit / diaryHoursPerYear;
  // Price scaled to a 60-minute hour so a 90-minute lesson compares fairly.
  const hourlyEquivalentPrice = lessonPrice * (60 / lessonMinutes);

  const minPriceForTarget = (targetAnnualProfit + fixedPerYear) / paidLessons + runningCostPerLesson;
  const breakEvenPrice = fixedPerYear / paidLessons + runningCostPerLesson;

  let block = null;
  const blockLessons = input.blockLessons ? number(input.blockLessons, 'Block size', { allowZero: false }) : 0;
  if (blockLessons && input.blockPrice) {
    const blockPrice = number(input.blockPrice, 'Block price', { allowZero: false });
    const perLesson = blockPrice / blockLessons;
    block = {
      lessons: blockLessons,
      price: round2(blockPrice),
      perLesson: round2(perLesson),
      discountPercent: round2((1 - perLesson / lessonPrice) * 100),
      profitPerLesson: round2(perLesson - costPerPaidLesson),
      annualProfitIfAllBooked: round2(annualProfit - paidLessons * (lessonPrice - perLesson)),
    };
  }

  const findings = [];
  if (annualProfit < 0) {
    findings.push({ severity: 'high', title: 'This price loses money over the year', detail: `After running costs and fixed costs the year ends at ${money(annualProfit)}. The break-even price is ${money(breakEvenPrice)} a lesson.` });
  }
  if (targetAnnualProfit > 0 && annualProfit < targetAnnualProfit) {
    findings.push({ severity: 'medium', title: 'Below your profit target', detail: `At these numbers you would reach ${money(annualProfit)} against a ${money(targetAnnualProfit)} target. A lesson price of ${money(minPriceForTarget)} gets there with the same bookings.` });
  }
  if (cancelRate > 0) {
    const noCancel = fixedPerYear / slotsPerYear;
    findings.push({ severity: 'info', title: 'What cancellations cost per paid lesson', detail: `Spread over only the lessons that happen, fixed costs are ${money(fixedPerPaidLesson)} a lesson instead of ${money(noCancel)} with a full diary. Each unpaid cancellation is lost price plus a fixed-cost share nobody else pays.` });
  }
  if (block && block.profitPerLesson < 0) {
    findings.push({ severity: 'high', title: 'The block price is below your cost', detail: `At ${money(block.perLesson)} a lesson the block loses ${money(-block.profitPerLesson)} on each lesson.` });
  } else if (block && block.discountPercent > 0 && block.annualProfitIfAllBooked < targetAnnualProfit) {
    findings.push({ severity: 'medium', title: 'A block discount on every booking misses the target', detail: `If every lesson sold at the block rate (${block.discountPercent}% off), annual profit would be ${money(block.annualProfitIfAllBooked)}.` });
  }

  return {
    paidLessons: round2(paidLessons),
    revenue: round2(revenue),
    runningCostPerLesson: round2(runningCostPerLesson),
    fixedPerPaidLesson: round2(fixedPerPaidLesson),
    costPerPaidLesson: round2(costPerPaidLesson),
    profitPerLesson: round2(profitPerLesson),
    annualProfit: round2(annualProfit),
    diaryHoursPerYear: round2(diaryHoursPerYear),
    profitPerDiaryHour: round2(profitPerDiaryHour),
    hourlyEquivalentPrice: round2(hourlyEquivalentPrice),
    breakEvenPrice: round2(breakEvenPrice),
    minPriceForTarget: round2(minPriceForTarget),
    block,
    findings,
  };
}

export function formatPricingSummary(r) {
  const lines = [
    'Driving lesson pricing check',
    `Paid lessons per year: ${r.paidLessons}`,
    `Revenue: ${money(r.revenue)}`,
    `Cost per paid lesson: ${money(r.costPerPaidLesson)} (running ${money(r.runningCostPerLesson)} + fixed ${money(r.fixedPerPaidLesson)})`,
    `Profit per lesson: ${money(r.profitPerLesson)}`,
    `Annual profit before tax: ${money(r.annualProfit)}`,
    `Profit per diary hour: ${money(r.profitPerDiaryHour)}`,
    `Break-even price: ${money(r.breakEvenPrice)}`,
    `Price to reach target: ${money(r.minPriceForTarget)}`,
  ];
  if (r.block) lines.push(`Block of ${r.block.lessons} at ${money(r.block.price)}: ${money(r.block.perLesson)} a lesson, ${r.block.discountPercent}% off, ${money(r.block.profitPerLesson)} profit per lesson`);
  lines.push('Arithmetic on the numbers entered. Not tax, legal, or financial advice. Check it before relying on it.');
  return lines.join('\n');
}
