// Appointment economics for a mobile notary / loan signing agent.
//
// WHAT CHANGED, AND WHY
//
// The first version built a quote from the bottom up and stopped there. That
// answers "what should I charge?", which is the right question when the notary
// sets the price -- a direct client calling to have a POA notarized. It is the
// wrong question for the work that actually fills a signing agent's calendar:
// a signing service emails an offer with the fee already on it ("$85, refi
// package, 45 miles, 138 pages"), and the decision is accept, counter, or
// decline. Two things were missing before that decision could be made here:
//
//   * PRINTING. A loan package is 100-200 pages and is routinely printed
//     twice -- the borrower's set and the lender's set. Paper and toner are
//     real money and the printing itself is 20-40 unpaid minutes at the
//     printer. The calculator had nowhere to put either, so every quote it
//     produced for a signing agent was missing the second largest cost in the
//     job. Pages are entered per set with a separate set count because that is
//     how the package arrives and how the fee is negotiated: "138 pages, two
//     copies" is one conversation about scope, and "$0.20 a page" is another
//     about rate.
//   * THE OFFER TEST. What a fee is worth is not the fee; it is the fee minus
//     what the notary spends out of pocket, over every hour the job occupies
//     -- drive, appointment, wait, and printer. That number is what tells a
//     $85 offer 45 miles away apart from an $85 offer down the street, and it
//     is the number a signing agent is doing badly in their head between other
//     appointments.
//
// The two costs are kept on opposite sides of the ledger on purpose, and this
// is the part most likely to be misread later. There are two per-mile figures
// and two per-page figures, and in each pair one is a CHARGE and one is a
// COST:
//
//   mileageRate         what the client is billed per mile   -> revenue
//   vehicleCostPerMile  what the mile actually costs to drive -> out of pocket
//   printChargePerPage  what the client is billed per page   -> revenue
//   printCostPerPage    paper + toner                        -> out of pocket
//
// Collapsing either pair would make the quote and the offer test the same
// arithmetic, and they are not: the quote asks what to charge, the offer test
// asks what is left. A notary who bills $0.70/mile and spends $0.30 driving it
// needs both halves visible to know that a long trip is priced fine and still
// barely worth taking.
//
// Print time is deliberately NOT billed at the hourly rate inside the quote.
// The per-page print charge is what pays for printing; adding the minutes at
// the hourly rate too would bill the same work twice. Those minutes still
// count in `engagedMinutes`, because they are hours the notary cannot sell to
// anyone else -- which is exactly how a print fee that is too low shows up as
// a `feeForTargetHourly` above the quote.
//
// Every new field defaults to the neutral value, so the worked example on
// `how-much-to-charge-for-a-mobile-notary-appointment.html` still holds.

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
  const pagesPerSet = n(input.pagesPerSet, 'Pages per set');
  const printSets = Math.floor(n(input.printSets, 'Printed sets'));
  const printChargePerPage = n(input.printChargePerPage, 'Print charge per page');
  const printCostPerPage = n(input.printCostPerPage, 'Print cost per page');
  const printMinutes = n(input.printMinutes, 'Print and prep time');
  const vehicleCostPerMile = n(input.vehicleCostPerMile, 'Vehicle cost per mile');
  const offeredFee = n(input.offeredFee, 'Offered fee');

  const travelCost = travelMiles * mileageRate;
  const travelTimeCost = (travelMinutes / 60) * hourlyRate;
  const appointmentCost = (appointmentMinutes / 60) * hourlyRate;
  const waitingCost = (waitingMinutes / 60) * waitingRate;

  const printedPages = pagesPerSet * printSets;
  const printCharge = printedPages * printChargePerPage;

  const serviceSubtotal =
    appointmentCost + stateFees + witnessFee * witnesses + afterHoursFee + waitingCost + printCharge;
  const laborAndTravel = travelCost + travelTimeCost + serviceSubtotal;
  const quote = Math.max(minimumFee, laborAndTravel);

  // Money that leaves the notary's pocket whatever the fee turns out to be.
  // Nothing here is a line on the invoice; it is the floor the fee has to
  // clear before any of it is earnings.
  const printCost = printedPages * printCostPerPage;
  const vehicleCost = travelMiles * vehicleCostPerMile;
  const outOfPocket = printCost + vehicleCost;

  // Every minute the job occupies, whether or not it appears on the invoice.
  // Print time belongs here and not in the quote -- see the header.
  const engagedMinutes = travelMinutes + appointmentMinutes + waitingMinutes + printMinutes;
  const engagedHours = engagedMinutes / 60;

  // An offer of zero means "no offer on the table", so the test runs against
  // the notary's own quote instead. Testing a zero offer would report a
  // guaranteed loss for every visitor who has not been offered anything.
  const offerEvaluated = offeredFee > 0;
  const feeUnderTest = offerEvaluated ? offeredFee : quote;
  const offerGap = offerEvaluated ? offeredFee - quote : null;

  const netAfterCosts = feeUnderTest - outOfPocket;
  // Null rather than zero with no time entered: a fee per zero hours is
  // undefined, and zero would read as "this pays nothing an hour".
  const effectiveHourly = engagedHours > 0 ? netAfterCosts / engagedHours : null;

  // Below this the notary is paying to work -- the fee does not cover the
  // paper and the fuel, never mind the time.
  const walkAwayFee = outOfPocket;

  // The fee at which every minute earns the rate the notary entered for it.
  // Waiting is valued at the waiting rate rather than the hourly rate so this
  // stays consistent with how the quote above prices it; pricing waiting twice
  // over at two different rates in the same result is how these two numbers
  // would drift apart without either being wrong on its own.
  const feeForTargetHourly =
    outOfPocket +
    ((travelMinutes + appointmentMinutes + printMinutes) / 60) * hourlyRate +
    (waitingMinutes / 60) * waitingRate;

  return {
    travelCost,
    travelTimeCost,
    appointmentCost,
    waitingCost,
    stateFees,
    witnessCost: witnessFee * witnesses,
    afterHoursFee,
    printedPages,
    printCharge,
    printCost,
    vehicleCost,
    outOfPocket,
    serviceSubtotal,
    laborAndTravel,
    quote,
    minimumApplied: minimumFee > laborAndTravel,
    engagedMinutes,
    engagedHours,
    offeredFee,
    offerEvaluated,
    offerGap,
    feeUnderTest,
    netAfterCosts,
    effectiveHourly,
    walkAwayFee,
    feeForTargetHourly,
  };
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
