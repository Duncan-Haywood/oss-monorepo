import { describe, expect, it } from "vitest";
import { type CostInputs, costInputsSchema, emptyCostInputs } from "./costing";
import {
  applyRouting,
  lineMatchesRouting,
  MAX_LINE_FINISHING,
  MAX_LINE_OPERATIONS,
  moveItem,
  type RoutingDto,
  routingCreateSchema,
  routingDraftFrom,
  routingFromInputs,
  routingNameKey,
  routingPatchFrom,
  routingPatchSchema,
  sortRoutings,
} from "./routings";

const op = (machineId: string, label = "", setupMinutes = 30, cycleMinutesPerPart = 4) => ({
  machineId,
  label,
  setupMinutes,
  cycleMinutesPerPart,
});

const line = (): CostInputs => ({
  ...emptyCostInputs([10, 50]),
  material: { materialId: "mat_6061", blank: null, partsPerStock: 4 },
  operations: [op("m_saw", "Op 05 saw", 10, 1)],
  finishing: [{ opId: "f_deburr" }],
  extras: [{ label: "Cert of conformance", perPartCents: 0, lotCents: 2500 }],
});

const routing = {
  operations: [op("m_vmc", "Op 10 mill", 60, 12), op("m_lathe", "Op 20 turn", 45, 6)],
  finishing: [{ opId: "f_anodize" }, { opId: "f_deburr" }],
};

describe("applyRouting", () => {
  it("replace swaps operations and finishing and keeps quantities, material and extras", () => {
    const before = line();
    const r = applyRouting(before, routing, "replace");
    if (!r.ok) throw new Error(r.message);
    expect(r.inputs.operations).toEqual(routing.operations);
    expect(r.inputs.finishing).toEqual([{ opId: "f_anodize" }, { opId: "f_deburr" }]);
    expect(r.inputs.quantities).toEqual([10, 50]);
    expect(r.inputs.material).toEqual(before.material);
    expect(r.inputs.extras).toEqual(before.extras);
    expect(before).toEqual(line()); // the input is not mutated
  });

  it("append adds operations after the line's and finishing it lacks, once", () => {
    const r = applyRouting(line(), routing, "append");
    if (!r.ok) throw new Error(r.message);
    expect(r.inputs.operations.map((o) => o.label)).toEqual([
      "Op 05 saw",
      "Op 10 mill",
      "Op 20 turn",
    ]);
    expect(r.inputs.finishing).toEqual([{ opId: "f_deburr" }, { opId: "f_anodize" }]);
  });

  it("copies only the operation fields, never stray keys from a stored routing", () => {
    const stored = {
      operations: [{ ...op("m_vmc"), machine: "Haas VF-2", retired: true }],
      finishing: [{ opId: "f_anodize", name: "Anodize", retired: false }],
    };
    const r = applyRouting(line(), stored, "replace");
    if (!r.ok) throw new Error(r.message);
    expect(r.inputs.operations[0]).toEqual(op("m_vmc"));
    expect(r.inputs.finishing[0]).toEqual({ opId: "f_anodize" });
  });

  it("refuses to pass the engine's operation limit instead of truncating", () => {
    const full = { ...line(), operations: Array.from({ length: 29 }, () => op("m_vmc")) };
    const r = applyRouting(full, routing, "append");
    expect(r).toEqual({
      ok: false,
      message: `A line can have at most ${MAX_LINE_OPERATIONS} operations; this would make 31`,
    });
    expect(applyRouting(full, routing, "replace").ok).toBe(true);
  });

  it("the routing limits match the engine's", () => {
    const ok = (n: number, f: number) =>
      costInputsSchema.safeParse({
        ...line(),
        operations: Array.from({ length: n }, () => op("m")),
        finishing: Array.from({ length: f }, (_, i) => ({ opId: `f${i}` })),
      }).success;
    expect(ok(MAX_LINE_OPERATIONS, MAX_LINE_FINISHING)).toBe(true);
    expect(ok(MAX_LINE_OPERATIONS + 1, 0)).toBe(false);
    expect(ok(1, MAX_LINE_FINISHING + 1)).toBe(false);
  });
});

describe("routing schemas", () => {
  it("needs a name and at least one operation; trims the name; finishing defaults to none", () => {
    expect(routingCreateSchema.safeParse({ name: "  ", operations: [op("m")] }).success).toBe(
      false,
    );
    expect(routingCreateSchema.safeParse({ name: "Bracket", operations: [] }).success).toBe(false);
    expect(routingCreateSchema.parse({ name: "  Bracket ", operations: [op("m")] })).toEqual({
      name: "Bracket",
      partFamily: null,
      operations: [op("m")],
      finishing: [],
    });
    expect(
      routingCreateSchema.safeParse({ name: "B", operations: [op("m")], price: 1 }).success,
    ).toBe(false);
  });

  it("patch accepts any subset, and not an empty operation list", () => {
    expect(routingPatchSchema.parse({ partFamily: null })).toEqual({ partFamily: null });
    expect(routingPatchSchema.safeParse({ operations: [] }).success).toBe(false);
  });
});

describe("helpers", () => {
  it("routingFromInputs copies operations and finishing only", () => {
    const inputs = line();
    const r = routingFromInputs(inputs);
    expect(r).toEqual({ operations: inputs.operations, finishing: inputs.finishing });
    const first = r.operations[0];
    if (first) first.label = "changed";
    expect(inputs.operations[0]?.label).toBe("Op 05 saw");
  });

  it("name keys ignore case and spacing", () => {
    expect(routingNameKey("  6061  bracket ")).toBe(routingNameKey("6061 Bracket"));
  });

  it("sorts the line's part family first, then by name", () => {
    const items = [
      { name: "Turned shaft", partFamily: "Shafts" },
      { name: "bracket B", partFamily: "brackets" },
      { name: "Bracket A", partFamily: "Brackets" },
      { name: "Anodized plate", partFamily: null },
    ];
    expect(sortRoutings(items, " BRACKETS").map((r) => r.name)).toEqual([
      "Bracket A",
      "bracket B",
      "Anodized plate",
      "Turned shaft",
    ]);
    expect(sortRoutings(items).map((r) => r.name)).toEqual([
      "Anodized plate",
      "Bracket A",
      "bracket B",
      "Turned shaft",
    ]);
  });
});

describe("editing a routing in place", () => {
  const dto: RoutingDto = {
    id: "rtg_1",
    name: "6061 bracket",
    partFamily: "Brackets",
    operations: [
      {
        machineId: "m_mill",
        label: "Op 10",
        setupMinutes: 60,
        cycleMinutesPerPart: 12,
        machine: "Haas VF-2",
        retired: false,
      },
      {
        machineId: "m_saw",
        label: "",
        setupMinutes: 5,
        cycleMinutesPerPart: 1,
        machine: "Saw",
        retired: true,
      },
    ],
    finishing: [{ opId: "f_anod", name: "Anodize", retired: false }],
    createdAt: "2026-11-25T10:00:00.000Z",
    updatedAt: "2026-11-25T11:00:00.000Z",
  };

  it("drafts the routing without rate-card names and sends nothing when nothing changed", () => {
    const draft = routingDraftFrom(dto);
    expect(draft.operations[1]).toEqual({
      machineId: "m_saw",
      label: "",
      setupMinutes: 5,
      cycleMinutesPerPart: 1,
    });
    expect(draft.finishing).toEqual([{ opId: "f_anod" }]);
    expect(routingPatchFrom(dto, draft)).toBeNull();
    // Whitespace around the name and an unchanged family are not changes.
    expect(routingPatchFrom(dto, { ...draft, name: " 6061 bracket  " })).toBeNull();
  });

  it("sends only the changed fields, with the loaded updatedAt", () => {
    const draft = routingDraftFrom(dto);
    const cycle = draft.operations.map((o, i) => (i === 0 ? { ...o, cycleMinutesPerPart: 10 } : o));
    const patch = routingPatchFrom(dto, { ...draft, operations: cycle });
    expect(patch).toEqual({ operations: cycle, ifUpdatedAt: dto.updatedAt });
    expect(routingPatchSchema.safeParse(patch).success).toBe(true);

    expect(routingPatchFrom(dto, { ...draft, partFamily: "  " })).toEqual({
      partFamily: null,
      ifUpdatedAt: dto.updatedAt,
    });
    expect(routingPatchFrom(dto, { ...draft, name: "Bracket v2", finishing: [] })).toEqual({
      name: "Bracket v2",
      finishing: [],
      ifUpdatedAt: dto.updatedAt,
    });
    // Reordering operations is a change.
    expect(
      routingPatchFrom(dto, { ...draft, operations: moveItem(draft.operations, 0, 1) })?.operations,
    ).toEqual([draft.operations[1], draft.operations[0]]);
  });

  it("moves an item one place and leaves the ends alone", () => {
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
    const src = ["a", "b"];
    moveItem(src, 0, 1);
    expect(src).toEqual(["a", "b"]);
  });

  it("knows when a line already matches its routing", () => {
    const line = { operations: routingDraftFrom(dto).operations, finishing: [{ opId: "f_anod" }] };
    expect(lineMatchesRouting(line, dto)).toBe(true);
    expect(
      lineMatchesRouting({ ...line, finishing: [{ opId: "f_anod" }, { opId: "f_anod" }] }, dto),
    ).toBe(true);
    expect(lineMatchesRouting({ ...line, finishing: [] }, dto)).toBe(false);
    expect(
      lineMatchesRouting(
        {
          ...line,
          operations: line.operations.map((o) => ({ ...o, setupMinutes: o.setupMinutes + 1 })),
        },
        dto,
      ),
    ).toBe(false);
  });
});
