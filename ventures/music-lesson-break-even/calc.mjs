export const INPUT_FIELDS = ['lessonPrice', 'lessonsPerWeek', 'weeksPerYear', 'cancelRate', 'prepMinutes', 'travelMinutes', 'monthlyCosts', 'targetPay'];

export function calculateLesson(input) {
  const number = (value, name) => {
    const result = Number(value);
    if (!Number.isFinite(result) || result < 0) throw new Error(`${name} must be a non-negative number`);
    return result;
  };
  const lessonPrice = number(input.lessonPrice, 'Lesson price');
  const lessonsPerWeek = number(input.lessonsPerWeek, 'Lessons per week');
  const weeksPerYear = number(input.weeksPerYear ?? 48, 'Teaching weeks');
  const cancelRate = number(input.cancelRate ?? 8, 'Cancellation rate');
  const prepMinutes = number(input.prepMinutes ?? 10, 'Preparation minutes');
  const travelMinutes = number(input.travelMinutes ?? 0, 'Travel minutes');
  const monthlyCosts = number(input.monthlyCosts ?? 0, 'Monthly costs');
  const targetPay = number(input.targetPay ?? 40000, 'Target annual pay');
  if (cancelRate > 100) throw new Error('Cancellation rate must be 100% or less');
  const attendanceRate = 1 - cancelRate / 100;
  const annualScheduled = lessonsPerWeek * weeksPerYear;
  const annualPaid = annualScheduled * attendanceRate;
  const annualRevenue = annualPaid * lessonPrice;
  const annualCosts = monthlyCosts * 12;
  const annualHours = annualScheduled * (60 + prepMinutes + travelMinutes) / 60;
  const netAfterCosts = annualRevenue - annualCosts;
  const effectiveHourly = annualHours === 0 ? 0 : netAfterCosts / annualHours;
  const breakEvenPrice = annualPaid === 0 ? Infinity : annualCosts / annualPaid;
  const targetPrice = annualPaid === 0 ? Infinity : (targetPay + annualCosts) / annualPaid;
  return { lessonPrice, annualScheduled, annualPaid, annualRevenue, annualCosts, annualHours, netAfterCosts, effectiveHourly, breakEvenPrice, targetPrice, attendanceRate };
}

function numericInput(input) {
  return {
    lessonPrice: input.lessonPrice,
    lessonsPerWeek: input.lessonsPerWeek,
    weeksPerYear: input.weeksPerYear,
    cancelRate: input.cancelRate,
    prepMinutes: input.prepMinutes,
    travelMinutes: input.travelMinutes,
    monthlyCosts: input.monthlyCosts,
    targetPay: input.targetPay,
  };
}

/**
 * Same teaching week, three policy changes a teacher can actually make:
 * fewer empty slots, two more booked lessons, or driving to the student.
 * Travel changes hours (and the effective hourly), not cash.
 */
export function comparePolicyLevers(input) {
  const baseInput = numericInput(input);
  const current = calculateLesson(baseInput);
  const cancelRate = Number(baseInput.cancelRate ?? 8);
  const travelMinutes = Number(baseInput.travelMinutes ?? 0);
  const lessonsPerWeek = Number(baseInput.lessonsPerWeek);
  const lessonPrice = Number(baseInput.lessonPrice);
  const rows = [
    { id: 'current', label: 'As entered', result: current },
    {
      id: 'tighter_cancels',
      label: '5 percentage points fewer cancellations',
      result: calculateLesson({ ...baseInput, cancelRate: Math.max(0, cancelRate - 5) }),
    },
    {
      id: 'more_slots',
      label: 'Two more weekly lessons',
      result: calculateLesson({ ...baseInput, lessonsPerWeek: lessonsPerWeek + 2 }),
    },
  ];
  if (travelMinutes > 0) {
    rows.push({
      id: 'no_travel',
      label: 'No travel (studio only)',
      result: calculateLesson({ ...baseInput, travelMinutes: 0 }),
    });
  } else {
    rows.push({
      id: 'house_call_30',
      label: '30 minutes of travel per lesson',
      result: calculateLesson({ ...baseInput, travelMinutes: 30 }),
    });
  }
  if (Number.isFinite(current.targetPrice) && current.targetPrice > lessonPrice) {
    const roundedPrice = Math.ceil(current.targetPrice / 5) * 5;
    rows.push({
      id: 'raise_to_target',
      label: `Raise price to $${roundedPrice.toFixed(2)} (nearest $5 at or above target)`,
      result: calculateLesson({ ...baseInput, lessonPrice: roundedPrice }),
    });
  }
  return rows.map((row) => ({
    ...row,
    netDelta: row.result.netAfterCosts - current.netAfterCosts,
    hourlyDelta: row.result.effectiveHourly - current.effectiveHourly,
    targetDelta: row.result.targetPrice - current.targetPrice,
  }));
}

export function leverSummary(rows) {
  const current = rows.find((row) => row.id === 'current');
  if (!current) throw new Error('comparePolicyLevers must include the current week');
  const cashRows = rows.filter((row) => row.id !== 'current' && row.netDelta !== 0);
  const bestCash = cashRows.reduce((winner, row) => (row.netDelta > winner.netDelta ? row : winner), cashRows[0]);
  const travelRow = rows.find((row) => row.id === 'no_travel' || row.id === 'house_call_30');
  const travelNote = travelRow
    ? travelRow.id === 'no_travel'
      ? 'Dropping travel does not change cash; it only raises the effective hourly rate.'
      : 'Thirty minutes of travel per lesson does not change cash; it only lowers the effective hourly rate.'
    : '';
  if (!bestCash) {
    return `None of the compared changes move annual cash versus the week as entered. ${travelNote}`.trim();
  }
  const more = bestCash.netDelta > 0;
  const cash = Math.abs(bestCash.netDelta);
  const target = bestCash.result.targetPrice;
  const verb = more ? 'keeps' : 'leaves';
  const vs = more ? 'more' : 'less';
  return `${bestCash.label} ${verb} $${cash.toFixed(2)} ${vs} after costs than the week as entered, and the price that hits your target becomes $${target.toFixed(2)}. ${travelNote}`.trim();
}
