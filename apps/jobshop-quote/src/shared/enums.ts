// Domain enums shared by the database schema, API contracts and the UI.
// Changing a value here is a breaking change: add values, don't rename them.

export const MEMBER_ROLES = ["owner", "admin", "estimator", "viewer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** Ordered from least to most privileged; used by requireRole(). */
export const ROLE_RANK: Record<MemberRole, number> = {
  viewer: 0,
  estimator: 1,
  admin: 2,
  owner: 3,
};

export const MACHINE_KINDS = [
  "mill_3axis",
  "mill_5axis",
  "lathe",
  "mill_turn",
  "swiss",
  "edm",
  "laser",
  "waterjet",
  "plasma",
  "press_brake",
  "saw",
  "welding",
  "deburr",
  "inspection",
  "other",
] as const;
export type MachineKind = (typeof MACHINE_KINDS)[number];
/** Machine kinds that rough a solid from a blank ("Rough from CAD", removal rates by material). */
export const ROUGHING_MACHINE_KINDS: ReadonlySet<string> = new Set([
  "mill_3axis",
  "mill_5axis",
  "lathe",
  "mill_turn",
  "swiss",
]);

/**
 * A machine that drills holes ("Drill from CAD", drill feeds by material): a roughing kind, or any
 * machine the shop gave a time per hole or a drill feed (a drill press entered as "other").
 */
export const isDrillingMachine = (
  kind: string,
  secondsPerHole: number | null | undefined,
  drillFeedInPerMin: number | null | undefined,
): boolean =>
  ROUGHING_MACHINE_KINDS.has(kind) || (secondsPerHole ?? 0) > 0 || (drillFeedInPerMin ?? 0) > 0;

/** How a material is bought: by weight, or by the stock piece (bar, sheet, tube length). */
export const MATERIAL_PRICING = ["per_lb", "per_stock"] as const;
export type MaterialPricing = (typeof MATERIAL_PRICING)[number];

export const RFQ_STATUSES = ["new", "extracted", "quoted", "archived"] as const;
export type RfqStatus = (typeof RFQ_STATUSES)[number];

/** "superseded": a later revision of the same quote number was sent in its place. */
export const QUOTE_STATUSES = ["draft", "sent", "won", "lost", "expired", "superseded"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/** Fields the RFQ extractor fills. Each extracted value must carry a verbatim source quote. */
export const EXTRACTED_FIELDS = [
  "partNumber",
  "revision",
  "description",
  "material",
  "quantities",
  "tolerances",
  "finish",
  "dueDate",
] as const;
export type ExtractedField = (typeof EXTRACTED_FIELDS)[number];
