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
