// The worked example behind /machine-shop-hourly-rate: one machine's cost per billable hour, built up
// from what the machine, its operator and the shop cost in a year. The arithmetic lives here (not in
// the page) so a unit test checks every figure the page prints.
//
// Copy rules: the example machine and shop are made up and the page says so. Only two inputs are
// public figures, and each carries its source and the date it was read: the employer's share of
// Social Security and Medicare (IRS), and the average US commercial electricity price (EIA). No
// "typical shop rate" is quoted, because we could not read a source for one (bls.gov refuses this
// session's requests); a shop's rate comes from its own costs.

export interface Source {
  label: string;
  url: string;
  read: string;
}

/** Employer Social Security (6.2%) + Medicare (1.45%), IRS Topic no. 751. */
export const EMPLOYER_FICA = {
  rate: 0.0765,
  source: {
    label: "IRS Topic no. 751, Social Security and Medicare withholding rates",
    url: "https://www.irs.gov/taxtopics/tc751",
    read: "2026-11-27",
  } satisfies Source,
} as const;

/** US average commercial electricity price, September 2026 (preliminary), EIA Table 5.6.A. */
export const COMMERCIAL_POWER = {
  centsPerKwh: 14.27,
  source: {
    label: "EIA Electric Power Monthly, Table 5.6.A (September 2026, preliminary)",
    url: "https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_6_a",
    read: "2026-11-27",
  } satisfies Source,
} as const;

export interface RateInputs {
  /** What the machine cost, installed. */
  purchasePrice: number;
  /** What you expect to sell it for at the end of its life. */
  resaleValue: number;
  /** Years you expect to run it. */
  lifeYears: number;
  /** Tooling, maintenance, coolant and service contracts, per year. */
  upkeepPerYear: number;
  /** Average power the machine draws while it runs, in kW (well under its nameplate). */
  averageKw: number;
  /** Electricity price, cents per kWh. */
  centsPerKwh: number;
  /** Floor space the machine and its work area take, square feet. */
  floorSqFt: number;
  /** What a square foot of the building costs a year (rent or ownership, heat, light). */
  floorCostPerSqFtYear: number;
  /** Operator's hourly wage. */
  wage: number;
  /** Hours a year the operator is paid for. */
  paidHours: number;
  /** Machines one operator runs at once (labor is split across them). */
  machinesPerOperator: number;
  /** Employer payroll taxes (FICA). */
  ficaRate: number;
  /** The rest of the burden: workers' comp, unemployment insurance, benefits, paid time off. */
  otherBurdenRate: number;
  /** This machine's share of shop overhead: office, estimating, software, insurance, supervision. */
  overheadShare: number;
  /** Hours a year you can bill on the machine: paid hours × utilization. */
  billableHours: number;
}

export interface RateLine {
  key: "depreciation" | "upkeep" | "power" | "floor" | "labor" | "overhead";
  label: string;
  perYear: number;
  perHour: number;
}

export interface RateResult {
  lines: readonly RateLine[];
  totalPerYear: number;
  perHour: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Cost per billable hour. Profit is not in it: in Job Shop Quote that is the markup, set apart. */
export function machineHourlyRate(i: RateInputs): RateResult {
  if (i.billableHours <= 0) throw new Error("billableHours must be positive");
  if (i.lifeYears <= 0) throw new Error("lifeYears must be positive");
  if (i.machinesPerOperator <= 0) throw new Error("machinesPerOperator must be positive");
  const raw: [RateLine["key"], string, number][] = [
    [
      "depreciation",
      "Machine (price less resale, over its life)",
      (i.purchasePrice - i.resaleValue) / i.lifeYears,
    ],
    ["upkeep", "Tooling and maintenance", i.upkeepPerYear],
    ["power", "Power while it runs", (i.billableHours * i.averageKw * i.centsPerKwh) / 100],
    ["floor", "Floor space", i.floorSqFt * i.floorCostPerSqFtYear],
    [
      "labor",
      "Operator, with payroll taxes and burden",
      (i.wage * i.paidHours * (1 + i.ficaRate + i.otherBurdenRate)) / i.machinesPerOperator,
    ],
    ["overhead", "Share of shop overhead", i.overheadShare],
  ];
  const lines = raw.map(([key, label, perYear]) => ({
    key,
    label,
    perYear: round2(perYear),
    perHour: round2(perYear / i.billableHours),
  }));
  const totalPerYear = round2(raw.reduce((s, [, , v]) => s + v, 0));
  return { lines, totalPerYear, perHour: round2(totalPerYear / i.billableHours) };
}

/** The page's made-up machine: a used 3-axis vertical mill on one shift. */
export const EXAMPLE: RateInputs = {
  purchasePrice: 120_000,
  resaleValue: 30_000,
  lifeYears: 7,
  upkeepPerYear: 6_000,
  averageKw: 8,
  centsPerKwh: COMMERCIAL_POWER.centsPerKwh,
  floorSqFt: 300,
  floorCostPerSqFtYear: 12,
  wage: 28,
  paidHours: 2_000,
  machinesPerOperator: 1,
  ficaRate: EMPLOYER_FICA.rate,
  otherBurdenRate: 0.2,
  overheadShare: 30_000,
  billableHours: 1_500,
};

/** The same machine at other utilizations (billable hours out of 2,000 paid), and run by one operator with two machines. */
export const VARIANTS: readonly { label: string; inputs: RateInputs }[] = [
  { label: "90% billable (1,800 hours)", inputs: { ...EXAMPLE, billableHours: 1_800 } },
  { label: "75% billable (1,500 hours), the example", inputs: EXAMPLE },
  { label: "60% billable (1,200 hours)", inputs: { ...EXAMPLE, billableHours: 1_200 } },
  { label: "45% billable (900 hours)", inputs: { ...EXAMPLE, billableHours: 900 } },
  {
    label: "75% billable, one operator running two machines",
    inputs: { ...EXAMPLE, machinesPerOperator: 2 },
  },
];

export const usd = (n: number, cents = true): string =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;
