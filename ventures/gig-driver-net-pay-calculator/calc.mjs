// Pure gig-delivery/rideshare net-pay arithmetic. No network, no state.
//
// The app screen shows gross pay per hour. It never subtracts the one cost
// that is entirely the driver's: the car. Gas, tires, oil changes, and
// insurance do not show up anywhere in the app, so "I made $22/hour" and
// "I kept $22/hour" are treated as the same sentence when they usually are
// not. This turns one session's numbers into what actually stayed in the
// driver's pocket per mile and per hour, after the vehicle and before
// income tax — plus what to set aside for the tax nothing here withholds.
//
// Every figure is an input. The result is transparent arithmetic the driver
// can check against a fuel receipt and their own odometer — not a claim
// about what any platform, market, or trip "should" pay.

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

function optionalNumber(value, name) {
  if (value === null || value === undefined || value === "") return null;
  return number(value, name);
}

/**
 * Cost one gig-driving session (a dash, a shift, a week — whatever period
 * the figures cover) and report net pay per mile and per hour.
 *
 * @param {object} input
 * @param {number} input.grossPay        Everything the app(s) paid out this session: base pay, tips, promotions.
 * @param {number} input.milesDriven     Every mile driven this session, including the drive to go online and back home.
 * @param {number} input.hoursActive     Hours online / dashing this session.
 * @param {number} input.mpg             Vehicle's average miles per gallon.
 * @param {number} input.gasPrice        Dollars per gallon.
 * @param {number} input.maintenancePerMile Reserve for repairs, tires, and oil changes, per mile.
 * @param {number} input.insuranceMonthly   Monthly insurance cost attributable to driving for the app(s).
 * @param {number} input.otherFixedMonthly  Everything else billed monthly: phone plan, hot bag, car wash, etc.
 * @param {number} input.monthlyMiles    Typical business miles driven in a month — used to spread the two
 *   monthly figures above across this session's share of them.
 * @param {number} input.taxReservePercent Share of profit set aside for self-employment and income tax.
 *   Their number, not ours — see taxReserve below.
 * @param {number|null} input.comparisonHourlyWage Optional: another hourly wage to compare against.
 * @param {number|null} input.targetHourlyTakeHome Optional: solve for the gross pay that would leave this
 *   much per hour after vehicle cost and the tax reserve.
 */
export function calculateSession(input) {
  const grossPay = number(input.grossPay ?? 0, "Gross pay");
  const milesDriven = number(input.milesDriven ?? 0, "Miles driven");
  const hoursActive = number(input.hoursActive ?? 0, "Hours active");
  const mpg = number(input.mpg ?? 0, "Miles per gallon", { allowZero: false });
  const gasPrice = number(input.gasPrice ?? 0, "Gas price");
  const maintenancePerMile = number(input.maintenancePerMile ?? 0, "Maintenance per mile");
  const insuranceMonthly = number(input.insuranceMonthly ?? 0, "Insurance");
  const otherFixedMonthly = number(input.otherFixedMonthly ?? 0, "Other fixed cost");
  const monthlyMiles = number(input.monthlyMiles ?? 0, "Monthly miles", { allowZero: false });

  // Self-employed, so nothing withholds. Left implicit, every dollar figure
  // below would be pre-tax and read as take-home. The percentage is theirs,
  // never ours: it depends on filing status, state, deductions, and other
  // income, none of which this page asks for or should. 0 keeps every
  // figure exactly as it would be with no reserve at all.
  const taxReservePercent = number(input.taxReservePercent ?? 0, "Tax reserve");
  if (taxReservePercent >= 100) throw new Error("Tax reserve must be less than 100%");

  const comparisonHourlyWage = optionalNumber(input.comparisonHourlyWage, "Comparison hourly wage");
  const targetHourlyTakeHome = optionalNumber(input.targetHourlyTakeHome, "Target hourly take-home");

  const fuelCostPerMile = gasPrice / mpg;
  const variableCostPerMile = fuelCostPerMile + maintenancePerMile;
  const variableCost = milesDriven * variableCostPerMile;

  const monthlyFixed = insuranceMonthly + otherFixedMonthly;
  const fixedCostPerMile = monthlyFixed / monthlyMiles;
  // A no-miles session allocates none of the month's fixed cost to itself —
  // the car sat still. That fixed dollar still comes due somewhere across
  // the month; this reports one session, not the month it belongs to.
  const fixedCost = fixedCostPerMile * milesDriven;

  const vehicleCost = variableCost + fixedCost;
  const allInCostPerMile = variableCostPerMile + fixedCostPerMile;

  const netProfit = grossPay - vehicleCost;
  // Only a profitable session owes anything. A losing session is floored at
  // zero rather than generating a negative reserve that would read as a
  // refund this page is in no position to promise — a loss may offset other
  // income or carry over, which is exactly the judgement this page does not
  // make. So takeHome equals netProfit on a losing session.
  const taxReserve = Math.max(0, netProfit) * (taxReservePercent / 100);
  const takeHome = netProfit - taxReserve;

  const grossPerMile = milesDriven === 0 ? null : grossPay / milesDriven;
  const netPerMile = milesDriven === 0 ? null : netProfit / milesDriven;
  const takeHomePerMile = milesDriven === 0 ? null : takeHome / milesDriven;
  const grossPerHour = hoursActive === 0 ? null : grossPay / hoursActive;
  const netPerHour = hoursActive === 0 ? null : netProfit / hoursActive;
  const takeHomePerHour = hoursActive === 0 ? null : takeHome / hoursActive;

  const comparison = comparisonHourlyWage === null
    ? null
    : {
      comparisonHourlyWage,
      // Compared before income tax, same basis as the wage itself — a
      // minimum-wage paycheck is quoted pre-income-tax too. The vehicle
      // cost is already out of both sides of this comparison.
      gapPerHour: netPerHour === null ? null : netPerHour - comparisonHourlyWage,
      clears: netPerHour === null ? null : netPerHour >= comparisonHourlyWage,
    };

  let target = null;
  if (targetHourlyTakeHome !== null) {
    if (hoursActive === 0) {
      target = null;
    } else {
      const totalTarget = targetHourlyTakeHome * hoursActive;
      // The target is what the driver wants to keep, so it is grossed up
      // through the tax reserve before it becomes profit the session has to
      // earn: keeping $20/hr at a 25% reserve means clearing $26.67/hr
      // pre-tax, not $20/hr.
      const neededProfit = totalTarget / (1 - taxReservePercent / 100);
      const neededGrossPay = Math.max(0, vehicleCost + neededProfit);
      target = {
        targetHourlyTakeHome,
        grossPayNeeded: neededGrossPay,
        grossPerMileNeeded: milesDriven === 0 ? null : neededGrossPay / milesDriven,
        grossPerHourNeeded: neededGrossPay / hoursActive,
      };
    }
  }

  return {
    grossPay,
    milesDriven,
    hoursActive,
    fuelCostPerMile,
    variableCostPerMile,
    variableCost,
    monthlyFixed,
    fixedCostPerMile,
    fixedCost,
    vehicleCost,
    allInCostPerMile,
    netProfit,
    taxReservePercent,
    taxReserve,
    takeHome,
    grossPerMile,
    netPerMile,
    takeHomePerMile,
    grossPerHour,
    netPerHour,
    takeHomePerHour,
    comparison,
    target,
  };
}
