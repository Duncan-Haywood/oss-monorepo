// The arithmetic behind the /machine-shop-hourly-rate guide. The page prints a worked example; its
// figures come from here so the prose, the table and the test cannot disagree. The inputs are made up
// for illustration (labelled so on the page), never presented as industry averages.

export interface ShopRateInputs {
  /** What the machine cost, installed. */
  machinePrice: number;
  /** What you expect to sell it for at the end. */
  resaleValue: number;
  /** Years you expect to run it. */
  yearsOfUse: number;
  /** Maintenance, tooling, coolant and power for this machine, per year. */
  runningCostPerYear: number;
  /** This machine's share of rent, insurance, office staff, software and the rest, per year. */
  overheadSharePerYear: number;
  /** Operator's hourly wage. */
  operatorWage: number;
  /** Payroll taxes, insurance and benefits, as a fraction of wage (0.3 = 30%). */
  laborBurden: number;
  /** Machines one operator runs at once (1 for a manual machine, 2 or more when tending cells). */
  machinesPerOperator: number;
  /** Hours the shop pays the operator in a year. */
  paidHoursPerYear: number;
  /** Hours the machine spends on work a customer pays for in a year. */
  billableHoursPerYear: number;
  /** Profit as a share of the price (0.2 = 20% margin). */
  margin: number;
}

export interface ShopRate {
  ownershipPerYear: number;
  machineAndOverheadPerYear: number;
  machinePerBillableHour: number;
  operatorPerPaidHour: number;
  operatorPerBillableHour: number;
  costPerBillableHour: number;
  /** Price per hour with `margin` as a share of the price: cost / (1 - margin). */
  rateAtMargin: number;
  /** The same percentage applied as a markup on cost, for comparison: cost * (1 + margin). */
  rateAtSameMarkup: number;
  /** Billable hours as a share of paid hours. */
  utilisation: number;
}

export function shopRate(i: ShopRateInputs): ShopRate {
  if (i.billableHoursPerYear <= 0 || i.paidHoursPerYear <= 0 || i.yearsOfUse <= 0)
    throw new Error("hours and years must be positive");
  if (i.billableHoursPerYear > i.paidHoursPerYear * i.machinesPerOperator)
    throw new Error("billable hours cannot exceed the hours the operator is paid to run them");
  if (i.margin < 0 || i.margin >= 1) throw new Error("margin is a fraction below 1");
  const ownershipPerYear = (i.machinePrice - i.resaleValue) / i.yearsOfUse;
  const machineAndOverheadPerYear =
    ownershipPerYear + i.runningCostPerYear + i.overheadSharePerYear;
  const machinePerBillableHour = machineAndOverheadPerYear / i.billableHoursPerYear;
  const operatorPerPaidHour = i.operatorWage * (1 + i.laborBurden);
  // Each machine carries its share of the operator's paid year, spread over its own billable hours.
  const operatorPerBillableHour =
    (operatorPerPaidHour * i.paidHoursPerYear) / i.machinesPerOperator / i.billableHoursPerYear;
  const costPerBillableHour = machinePerBillableHour + operatorPerBillableHour;
  return {
    ownershipPerYear,
    machineAndOverheadPerYear,
    machinePerBillableHour,
    operatorPerPaidHour,
    operatorPerBillableHour,
    costPerBillableHour,
    rateAtMargin: costPerBillableHour / (1 - i.margin),
    rateAtSameMarkup: costPerBillableHour * (1 + i.margin),
    utilisation: i.billableHoursPerYear / i.paidHoursPerYear,
  };
}

/** The made-up shop on the page: one 3-axis mill, one operator, one shift. */
export const EXAMPLE: ShopRateInputs = {
  machinePrice: 180_000,
  resaleValue: 40_000,
  yearsOfUse: 10,
  runningCostPerYear: 12_000,
  overheadSharePerYear: 30_000,
  operatorWage: 28,
  laborBurden: 0.3,
  machinesPerOperator: 1,
  paidHoursPerYear: 2_000,
  billableHoursPerYear: 1_300,
  margin: 0.2,
};

/** "$1,234" for whole dollars, "$12.34" otherwise. */
export function usd(n: number, cents = true): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  })}`;
}
