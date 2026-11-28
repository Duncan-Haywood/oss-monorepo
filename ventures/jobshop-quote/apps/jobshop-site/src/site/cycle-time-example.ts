// The arithmetic behind the /how-to-estimate-cnc-machining-time guide. The page prints a worked
// example whose figures come from here, so the prose, the table and the tests cannot disagree.
//
// 1. The estimator's own arithmetic, worked out before anything goes on the rate card: spindle speed
//    from surface speed and tool diameter, feed from chip load and flutes, the theoretical removal
//    rate from width and depth of cut, and the share of it a real toolpath keeps.
// 2. The three times Job Shop Quote suggests from a STEP model, following its costing engine
//    (apps/jobshop-quote/src/shared/costing.ts): roughing from the volume removed at the shop's removal
//    rate (suggestRoughingOperation), drilling from seconds per hole, depth at the drill feed and the
//    peck retracts on deep holes (suggestDrillingOperation), and tapping from seconds per tapped hole
//    (suggestTappingOperation).
// 3. The times the app does not suggest (finishing passes, tool changes, loading), typed by the
//    estimator; the page says so.
//
// apps/jobshop-quote/test/unit/site-cycle-time-example.test.ts runs EXAMPLE through the real engine
// and checks every suggested time to the hundredth. The inputs are made up for illustration (labelled
// so on the page), never presented as recommended feeds, speeds or industry figures.

export interface HoleGroup {
  /** What the drawing calls it ("1/4-20 tapped, tap drill #7"). */
  label: string;
  count: number;
  diameterIn: number;
  depthIn: number;
  threaded: boolean;
}

export interface TypedOperation {
  label: string;
  /** How the estimator got the minutes, printed on the page. */
  basis: string;
  cycleMinutesPerPart: number;
}

export interface CycleTimeExample {
  partName: string;
  materialName: string;
  /** Rectangular blank, inches. */
  blank: { lengthIn: number; widthIn: number; thicknessIn: number };
  /** The finished part's volume, as the STEP model measures it. */
  partVolumeIn3: number;
  machineName: string;
  hourlyRateCents: number;
  setupMinutes: number;
  roughing: {
    toolLabel: string;
    toolDiameterIn: number;
    flutes: number;
    surfaceFeetPerMin: number;
    chipLoadIn: number;
    /** Width of cut (radial stepover), inches. */
    widthOfCutIn: number;
    /** Depth of cut (axial), inches. */
    depthOfCutIn: number;
    /** Share of the theoretical rate a whole roughing toolpath keeps, basis points. */
    pathEfficiencyBps: number;
  };
  drilling: {
    /** Position, spot, rapid in and out, the one retract every hole has. */
    secondsPerHole: number;
    drillRpm: number;
    feedPerRevIn: number;
    /** G83 peck depth as a multiple of the drill diameter. */
    peckDepthDiameters: number;
    secondsPerPeck: number;
  };
  secondsPerTappedHole: number;
  holes: HoleGroup[];
  typed: TypedOperation[];
  quantities: number[];
}

export interface SuggestedOperation {
  label: string;
  setupMinutes: number;
  cycleMinutesPerPart: number;
}

export interface CycleTimeResult {
  rpm: number;
  feedInPerMin: number;
  theoreticalRemovalIn3PerMin: number;
  /** The rate the shop types on the rate card: theoretical × path efficiency, to the hundredth. */
  removalRateIn3PerMin: number;
  blankVolumeIn3: number;
  removedIn3: number;
  drillFeedInPerMin: number;
  holeLocations: number;
  totalDepthIn: number;
  deepHoles: number;
  extraPecks: number;
  tappedHoles: number;
  roughing: SuggestedOperation;
  drill: SuggestedOperation;
  tap: SuggestedOperation;
  /** The three suggested operations, then the typed ones. */
  operations: SuggestedOperation[];
  cycleMinutesPerPart: number;
  /** Run cost per part at the machine rate, cents, rounded to the cent. */
  runCentsPerPart: number;
}

/** 12 ÷ π: rpm = SFM × 12 ÷ (π × D), the machinist's 3.82. */
export const RPM_PER_SFM_PER_IN = 12 / Math.PI;
/** The engine's deep-hole line (DEEP_HOLE_DEPTH_TO_DIAMETER): deeper than 3 × D is pecked. */
export const DEEP_HOLE_RATIO = 3;

const pct = (bps: number) => bps / 10_000;
/** The engine's rule for drilling and tapping minutes: rounded UP to the hundredth. */
const upToHundredth = (min: number) => Math.ceil(min * 100 - 1e-9) / 100;

/** Extra peck retracts beyond the one every hole has, as the engine counts them (extraPecks). */
export function pecksFor(depthIn: number, diameterIn: number, peckD: number): number {
  if (!(depthIn > DEEP_HOLE_RATIO * diameterIn + 1e-9)) return 0;
  return Math.max(0, Math.ceil(depthIn / (peckD * diameterIn) - 1e-9) - 1);
}

export function cycleTimeExample(e: CycleTimeExample): CycleTimeResult {
  const r = e.roughing;
  if (r.pathEfficiencyBps <= 0 || r.pathEfficiencyBps > 10_000)
    throw new Error("path efficiency is above 0 and at most 100%");
  const rpm = (r.surfaceFeetPerMin * RPM_PER_SFM_PER_IN) / r.toolDiameterIn;
  const feedInPerMin = rpm * r.flutes * r.chipLoadIn;
  const theoreticalRemovalIn3PerMin = r.widthOfCutIn * r.depthOfCutIn * feedInPerMin;
  const removalRateIn3PerMin =
    Math.round(theoreticalRemovalIn3PerMin * pct(r.pathEfficiencyBps) * 100) / 100;
  const { lengthIn, widthIn, thicknessIn } = e.blank;
  const blankVolumeIn3 = lengthIn * widthIn * thicknessIn;
  const removedIn3 = Math.max(0, blankVolumeIn3 - e.partVolumeIn3);
  // suggestCycleMinutes rounds roughing to the tenth.
  const roughMinutes = Math.round((removedIn3 / removalRateIn3PerMin) * 10) / 10;

  const d = e.drilling;
  const drillFeedInPerMin = d.drillRpm * d.feedPerRevIn;
  const holeLocations = e.holes.reduce((s, h) => s + h.count, 0);
  const totalDepthIn = e.holes.reduce((s, h) => s + h.count * h.depthIn, 0);
  const deepHoles = e.holes
    .filter((h) => h.depthIn > DEEP_HOLE_RATIO * h.diameterIn + 1e-9)
    .reduce((s, h) => s + h.count, 0);
  const extraPecks = e.holes.reduce(
    (s, h) => s + h.count * pecksFor(h.depthIn, h.diameterIn, d.peckDepthDiameters),
    0,
  );
  const drillMinutes = upToHundredth(
    (holeLocations * d.secondsPerHole) / 60 +
      totalDepthIn / drillFeedInPerMin +
      (extraPecks * d.secondsPerPeck) / 60,
  );
  const tappedHoles = e.holes.filter((h) => h.threaded).reduce((s, h) => s + h.count, 0);
  const tapMinutes = upToHundredth((tappedHoles * e.secondsPerTappedHole) / 60);

  const roughing = {
    label: "Rough from CAD (volume removed at the removal rate)",
    setupMinutes: e.setupMinutes,
    cycleMinutesPerPart: roughMinutes,
  };
  // The mill is already set up for roughing, so the engine charges no second setup.
  const drill = { label: "Drill from CAD", setupMinutes: 0, cycleMinutesPerPart: drillMinutes };
  const tap = { label: "Tap from CAD", setupMinutes: 0, cycleMinutesPerPart: tapMinutes };
  const operations = [
    roughing,
    drill,
    tap,
    ...e.typed.map((t) => ({
      label: t.label,
      setupMinutes: 0,
      cycleMinutesPerPart: t.cycleMinutesPerPart,
    })),
  ];
  const cycleMinutesPerPart =
    Math.round(operations.reduce((s, o) => s + o.cycleMinutesPerPart, 0) * 100) / 100;
  const runCentsPerPart = Math.round((cycleMinutesPerPart / 60) * e.hourlyRateCents);
  return {
    rpm,
    feedInPerMin,
    theoreticalRemovalIn3PerMin,
    removalRateIn3PerMin,
    blankVolumeIn3,
    removedIn3,
    drillFeedInPerMin,
    holeLocations,
    totalDepthIn,
    deepHoles,
    extraPecks,
    tappedHoles,
    roughing,
    drill,
    tap,
    operations,
    cycleMinutesPerPart,
    runCentsPerPart,
  };
}

/**
 * The made-up job on the page: a 6061 manifold block roughed from plate, six 1/4-20 tapped holes and
 * two 1/4 in through holes, on one 3-axis mill at the rate the /machine-shop-hourly-rate guide works
 * out ($123.85). Every speed, feed, chip load, efficiency and time is invented to show the arithmetic.
 */
export const EXAMPLE: CycleTimeExample = {
  partName: "manifold block",
  materialName: "6061-T6 aluminum plate",
  blank: { lengthIn: 4.25, widthIn: 3.25, thicknessIn: 1.5 },
  partVolumeIn3: 12.4,
  machineName: "3-axis mill",
  hourlyRateCents: 12_385,
  setupMinutes: 45,
  roughing: {
    toolLabel: "1/2 in 3-flute carbide end mill",
    toolDiameterIn: 0.5,
    flutes: 3,
    surfaceFeetPerMin: 800,
    chipLoadIn: 0.003,
    widthOfCutIn: 0.2,
    depthOfCutIn: 0.5,
    pathEfficiencyBps: 5_000,
  },
  drilling: {
    secondsPerHole: 4,
    drillRpm: 3_000,
    feedPerRevIn: 0.004,
    peckDepthDiameters: 1.5,
    secondsPerPeck: 1.5,
  },
  secondsPerTappedHole: 5,
  holes: [
    {
      label: "1/4-20 tapped, #7 (0.201 in) tap drill, 0.75 in deep",
      count: 6,
      diameterIn: 0.201,
      depthIn: 0.75,
      threaded: true,
    },
    {
      label: "1/4 in through, 1.5 in deep",
      count: 2,
      diameterIn: 0.25,
      depthIn: 1.5,
      threaded: false,
    },
  ],
  typed: [
    {
      label: "Finish walls and floors",
      basis: "72 in of finishing toolpath at 36 in/min",
      cycleMinutesPerPart: 2,
    },
    {
      label: "Tool changes",
      basis: "5 tools × 9 s chip to chip",
      cycleMinutesPerPart: 0.75,
    },
    {
      label: "Load, unload and blow off",
      basis: "timed on the last job in the same vise",
      cycleMinutesPerPart: 1.5,
    },
  ],
  quantities: [10, 100],
};
