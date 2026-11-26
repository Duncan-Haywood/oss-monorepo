// Routing templates: a shop saves a line's operations (machine, op label, setup and cycle minutes)
// and finishing steps under a name, optionally tagged with a part family ("6061 brackets", "turned
// shafts"), and applies them to the next line of that family. A routing carries cost *inputs* only,
// never prices: the line is priced from today's rate card like any other edit, and a machine retired
// since the routing was saved shows up as a blocking issue or flag, not an old rate. Material, blank
// and extras stay with the part, so a routing never brings them.
import { z } from "zod";
import { type CostInputs, costInputsSchema } from "./costing";

/** At most this many routings per shop. */
export const MAX_ROUTINGS = 200;
/** The engine's limits on one line (costInputsSchema in ./costing); test/unit checks they agree. */
export const MAX_LINE_OPERATIONS = 30;
export const MAX_LINE_FINISHING = 20;

const operationsSchema = costInputsSchema.shape.operations;
const finishingSchema = costInputsSchema.shape.finishing;
export type RoutingOperation = CostInputs["operations"][number];
export type RoutingFinishing = CostInputs["finishing"][number];

const name = z.string().trim().min(1).max(80);
const family = z.string().trim().max(80).nullable();

/** POST /routings. A routing needs at least one operation; finishing is optional. */
export const routingCreateSchema = z
  .object({
    name,
    partFamily: family.default(null),
    operations: operationsSchema.unwrap().min(1),
    finishing: finishingSchema,
  })
  .strict();
export type RoutingCreate = z.infer<typeof routingCreateSchema>;

/**
 * PATCH /routings/:id: any of the create fields. `ifUpdatedAt` (the `updatedAt` the editor loaded)
 * makes the save refuse with 409 when someone else changed the routing in the meantime, instead of
 * silently overwriting their edit.
 */
export const routingPatchSchema = z
  .object({
    name: name.optional(),
    partFamily: family.optional(),
    operations: operationsSchema.unwrap().min(1).optional(),
    finishing: finishingSchema.unwrap().optional(),
    ifUpdatedAt: z.iso.datetime().optional(),
  })
  .strict();
export type RoutingPatch = z.infer<typeof routingPatchSchema>;

export interface RoutingOperationDto extends RoutingOperation {
  /** The machine's name on today's rate card, or "Unknown machine" if it was deleted. */
  machine: string;
  /** True when the machine is retired (inactive) or gone from the card. */
  retired: boolean;
}

export interface RoutingDto {
  id: string;
  name: string;
  partFamily: string | null;
  operations: RoutingOperationDto[];
  finishing: (RoutingFinishing & { name: string; retired: boolean })[];
  createdAt: string;
  updatedAt: string;
}

/** Routings are unique per shop by this key: trimmed, upper case, runs of spaces as one. */
export function routingNameKey(n: string): string {
  return n.trim().replace(/\s+/g, " ").toUpperCase();
}

/** What a routing saves from a line: its operations and finishing, copied. */
export function routingFromInputs(inputs: CostInputs): {
  operations: RoutingOperation[];
  finishing: RoutingFinishing[];
} {
  return structuredClone({ operations: inputs.operations, finishing: inputs.finishing });
}

export type ApplyMode = "replace" | "append";

export type ApplyResult = { ok: true; inputs: CostInputs } | { ok: false; message: string };

/**
 * The line's inputs with a routing applied. "replace" swaps the line's operations and finishing for
 * the routing's; "append" adds the routing's operations after the line's and adds any finishing step
 * the line does not already have. Quantities, material, blank and extras are untouched. Fails
 * (rather than truncating) when the result would pass the engine's operation or finishing limits.
 */
export function applyRouting(
  inputs: CostInputs,
  routing: { operations: readonly RoutingOperation[]; finishing: readonly RoutingFinishing[] },
  mode: ApplyMode,
): ApplyResult {
  const ops = routing.operations.map(({ machineId, label, setupMinutes, cycleMinutesPerPart }) => ({
    machineId,
    label,
    setupMinutes,
    cycleMinutesPerPart,
  }));
  const fin = routing.finishing.map(({ opId }) => ({ opId }));
  const operations = mode === "replace" ? ops : [...inputs.operations, ...ops];
  const finishing =
    mode === "replace"
      ? dedupeFinishing(fin)
      : dedupeFinishing([...inputs.finishing.map(({ opId }) => ({ opId })), ...fin]);
  const next = structuredClone({ ...inputs, operations, finishing });
  const parsed = costInputsSchema.safeParse(next);
  if (!parsed.success) {
    if (operations.length > MAX_LINE_OPERATIONS) {
      return {
        ok: false,
        message: `A line can have at most ${MAX_LINE_OPERATIONS} operations; this would make ${operations.length}`,
      };
    }
    if (finishing.length > MAX_LINE_FINISHING) {
      return {
        ok: false,
        message: `A line can have at most ${MAX_LINE_FINISHING} finishing steps; this would make ${finishing.length}`,
      };
    }
    return { ok: false, message: "The routing does not fit this line's inputs" };
  }
  return { ok: true, inputs: next };
}

function dedupeFinishing(f: RoutingFinishing[]): RoutingFinishing[] {
  return [...new Map(f.map((x) => [x.opId, x])).values()];
}

/**
 * Routings for a line's picker: those tagged with `familyHint` first (compared like names), then the
 * rest, each group by name. An empty hint keeps plain name order.
 */
export function sortRoutings<T extends { name: string; partFamily: string | null }>(
  items: readonly T[],
  familyHint?: string | null,
): T[] {
  const hint = familyHint?.trim() ? routingNameKey(familyHint) : null;
  const rank = (r: T) => (hint && r.partFamily && routingNameKey(r.partFamily) === hint ? 0 : 1);
  return [...items].sort(
    (a, b) => rank(a) - rank(b) || routingNameKey(a.name).localeCompare(routingNameKey(b.name)),
  );
}

/** What the routings page edits: a routing's fields, without the rate-card names. */
export interface RoutingDraft {
  name: string;
  partFamily: string;
  operations: RoutingOperation[];
  finishing: RoutingFinishing[];
}

const plainOps = (ops: readonly RoutingOperation[]): RoutingOperation[] =>
  ops.map(({ machineId, label, setupMinutes, cycleMinutesPerPart }) => ({
    machineId,
    label,
    setupMinutes,
    cycleMinutesPerPart,
  }));
const plainFinishing = (f: readonly RoutingFinishing[]): RoutingFinishing[] =>
  f.map(({ opId }) => ({ opId }));

export function routingDraftFrom(r: RoutingDto): RoutingDraft {
  return {
    name: r.name,
    partFamily: r.partFamily ?? "",
    operations: plainOps(r.operations),
    finishing: plainFinishing(r.finishing),
  };
}

const sameOps = (a: readonly RoutingOperation[], b: readonly RoutingOperation[]) =>
  a.length === b.length &&
  a.every(
    (o, i) =>
      o.machineId === b[i]?.machineId &&
      o.label === b[i]?.label &&
      o.setupMinutes === b[i]?.setupMinutes &&
      o.cycleMinutesPerPart === b[i]?.cycleMinutesPerPart,
  );
const sameFinishing = (a: readonly RoutingFinishing[], b: readonly RoutingFinishing[]) =>
  a.length === b.length && a.every((f, i) => f.opId === b[i]?.opId);

/**
 * The PATCH body for an edited routing: only the fields that changed (names compared trimmed, an
 * empty family as none), plus `ifUpdatedAt` so a concurrent edit is refused rather than lost. Null
 * when nothing changed.
 */
export function routingPatchFrom(original: RoutingDto, draft: RoutingDraft): RoutingPatch | null {
  const before = routingDraftFrom(original);
  const patch: RoutingPatch = {};
  if (draft.name.trim() !== before.name) patch.name = draft.name.trim();
  const fam = draft.partFamily.trim() || null;
  if (fam !== (original.partFamily ?? null)) patch.partFamily = fam;
  if (!sameOps(draft.operations, before.operations)) patch.operations = draft.operations;
  if (!sameFinishing(draft.finishing, before.finishing)) patch.finishing = draft.finishing;
  if (Object.keys(patch).length === 0) return null;
  patch.ifUpdatedAt = original.updatedAt;
  return patch;
}

/** True when a line's operations and finishing are exactly the routing's (nothing to update). */
export function lineMatchesRouting(
  inputs: Pick<CostInputs, "operations" | "finishing">,
  routing: { operations: readonly RoutingOperation[]; finishing: readonly RoutingFinishing[] },
): boolean {
  return (
    sameOps(plainOps(inputs.operations), plainOps(routing.operations)) &&
    sameFinishing(
      dedupeFinishing(plainFinishing(inputs.finishing)),
      plainFinishing(routing.finishing),
    )
  );
}

/** A copy of `items` with item `i` moved one place up (-1) or down (+1); unchanged at the ends. */
export function moveItem<T>(items: readonly T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  const out = [...items];
  if (i < 0 || i >= out.length || j < 0 || j >= out.length) return out;
  [out[i], out[j]] = [out[j] as T, out[i] as T];
  return out;
}
