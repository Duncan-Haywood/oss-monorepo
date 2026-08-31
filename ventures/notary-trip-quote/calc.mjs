export function calculateQuote(input) {
  const n = (value, label) => {
    const result = Number(value ?? 0);
    if (!Number.isFinite(result) || result < 0) throw new Error(`${label} must be zero or more`);
    return result;
  };
  const travelMiles = n(input.travelMiles, 'Travel miles');
  const mileageRate = n(input.mileageRate, 'Mileage rate');
  const travelMinutes = n(input.travelMinutes, 'Travel time');
  const hourlyRate = n(input.hourlyRate, 'Hourly rate');
  const appointmentMinutes = n(input.appointmentMinutes, 'Appointment time');
  const minimumFee = n(input.minimumFee, 'Minimum fee');
  const stateFees = n(input.stateFees, 'State fees');
  const witnessFee = n(input.witnessFee, 'Witness fee');
  const witnesses = Math.floor(n(input.witnesses, 'Witnesses'));
  const afterHoursFee = n(input.afterHoursFee, 'After-hours fee');
  const waitingMinutes = n(input.waitingMinutes, 'Waiting time');
  const waitingRate = n(input.waitingRate, 'Waiting rate');
  const travelCost = travelMiles * mileageRate;
  const travelTimeCost = (travelMinutes / 60) * hourlyRate;
  const appointmentCost = (appointmentMinutes / 60) * hourlyRate;
  const waitingCost = (waitingMinutes / 60) * waitingRate;
  const serviceSubtotal = appointmentCost + stateFees + witnessFee * witnesses + afterHoursFee + waitingCost;
  const laborAndTravel = travelCost + travelTimeCost + serviceSubtotal;
  const quote = Math.max(minimumFee, laborAndTravel);
  return { travelCost, travelTimeCost, appointmentCost, waitingCost, stateFees, witnessCost: witnessFee * witnesses, afterHoursFee, serviceSubtotal, laborAndTravel, quote, minimumApplied: minimumFee > laborAndTravel };
}

// The page recalculates on every keystroke, and a `type="number"` input lets
// a visitor type a leading "-" (or paste one) even with `min="0"` set — the
// browser only enforces `min` on form submission and the spinner buttons, not
// on typed input. Before this wrapper existed, that single keystroke threw
// out of the page's `update()` with no try/catch around it: the total froze
// on its last value, the breakdown went stale, and nothing on screen told the
// visitor their entry was the problem. `quoteResult` turns the same thrown
// message calculateQuote already had into a value the page can render instead
// of an exception it has to survive.
export function quoteResult(input) {
  try {
    return { ok: true, ...calculateQuote(input) };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}
