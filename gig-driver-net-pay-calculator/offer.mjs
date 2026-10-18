// Pure accept-or-decline arithmetic for one delivery or rideshare offer. No
// network, no state.
//
// The session calculator prices a finished shift. This prices the decision a
// driver makes dozens of times a shift, before it is made: the app shows a
// payout and a distance, and nothing about what the miles will cost or how
// long the order really takes. Only the per-mile cost that moves with
// distance (fuel and wear) is charged to an offer. Insurance and phone plan
// are owed whether the offer is accepted or not, so counting them here would
// make good offers look worse than they are.
//
// Every figure is an input; nothing here is a claim about what any platform
// should pay.

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (value === "" || value === null || value === undefined || !Number.isFinite(result)) {
    throw new Error(`${name} must be a number`);
  }
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

function optional(value, name) {
  return value === "" || value === null || value === undefined ? null : number(value, name);
}

/**
 * @param {object} input
 * @param {number} input.payout            Offered pay including any guaranteed tip.
 * @param {number} input.milesToPickup     Miles from where you are to the pickup.
 * @param {number} input.milesToDropoff    Miles from pickup to drop-off.
 * @param {number} input.milesBack         Miles you expect to drive afterwards to reach a place you would
 *   be offered work again (0 if the drop-off is in a busy zone).
 * @param {number} input.minutesToPickup   Minutes to reach the pickup.
 * @param {number} input.minutesWaiting    Minutes you expect to wait at the pickup.
 * @param {number} input.minutesToDropoff  Minutes from pickup to drop-off, including handoff.
 * @param {number} input.minutesBack       Minutes of the drive back, if any.
 * @param {number} input.mpg
 * @param {number} input.gasPrice
 * @param {number} input.maintenancePerMile
 * @param {number|null} input.minNetPerHour Your floor, after the car; optional.
 * @param {number|null} input.minNetPerMile Your floor per mile driven; optional.
 */
export function evaluateOffer(input) {
  const payout = number(input.payout, "Payout");
  const milesToPickup = number(input.milesToPickup ?? 0, "Miles to pickup");
  const milesToDropoff = number(input.milesToDropoff ?? 0, "Miles to drop-off");
  const milesBack = number(input.milesBack ?? 0, "Miles back");
  const minutesToPickup = number(input.minutesToPickup ?? 0, "Minutes to pickup");
  const minutesWaiting = number(input.minutesWaiting ?? 0, "Minutes waiting");
  const minutesToDropoff = number(input.minutesToDropoff ?? 0, "Minutes to drop-off");
  const minutesBack = number(input.minutesBack ?? 0, "Minutes back");
  const mpg = number(input.mpg, "Miles per gallon", { allowZero: false });
  const gasPrice = number(input.gasPrice ?? 0, "Gas price");
  const maintenancePerMile = number(input.maintenancePerMile ?? 0, "Maintenance per mile");
  const minNetPerHour = optional(input.minNetPerHour, "Minimum net per hour");
  const minNetPerMile = optional(input.minNetPerMile, "Minimum net per mile");

  const miles = milesToPickup + milesToDropoff + milesBack;
  const minutes = minutesToPickup + minutesWaiting + minutesToDropoff + minutesBack;
  const hours = minutes / 60;

  const costPerMile = gasPrice / mpg + maintenancePerMile;
  const vehicleCost = miles * costPerMile;
  const net = payout - vehicleCost;

  const grossPerMile = miles === 0 ? null : payout / miles;
  const netPerMile = miles === 0 ? null : net / miles;
  const grossPerHour = hours === 0 ? null : payout / hours;
  const netPerHour = hours === 0 ? null : net / hours;

  // Lowest payout that clears every floor the driver set. With no floor set
  // there is nothing to solve for, so it is null rather than the break-even.
  const floors = [];
  if (minNetPerHour !== null) floors.push(vehicleCost + minNetPerHour * hours);
  if (minNetPerMile !== null) floors.push(vehicleCost + minNetPerMile * miles);
  const minPayout = floors.length === 0 ? null : Math.max(...floors);

  const failures = [];
  if (minNetPerHour !== null && (netPerHour === null || netPerHour < minNetPerHour)) failures.push("hour");
  if (minNetPerMile !== null && (netPerMile === null || netPerMile < minNetPerMile)) failures.push("mile");

  let verdict;
  if (minPayout === null) verdict = net >= 0 ? "no-floor-profit" : "no-floor-loss";
  else verdict = failures.length === 0 ? "accept" : "decline";

  return {
    payout, miles, minutes, hours, costPerMile, vehicleCost, net,
    grossPerMile, netPerMile, grossPerHour, netPerHour,
    minPayout,
    shortfall: minPayout === null ? null : Math.max(0, minPayout - payout),
    failures,
    verdict,
  };
}
