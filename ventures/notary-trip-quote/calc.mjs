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
