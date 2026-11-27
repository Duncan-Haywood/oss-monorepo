// Routing templates, managed outside a quote: rename, retag, and edit a saved routing's operations
// and finishing in place (src/shared/routings.ts). A routing holds cost inputs only, never prices;
// quotes that already used it keep their own copy of the operations, so an edit here changes only
// the next line it is applied to.

import type { FinishingOpDto, MachineDto, RateCardDto } from "@shared/api";
import { cycleText } from "@shared/costing";
import {
  MAX_LINE_FINISHING,
  MAX_LINE_OPERATIONS,
  moveItem,
  type RoutingDraft,
  type RoutingDto,
  type RoutingOperation,
  type RoutingPatch,
  routingDraftFrom,
  routingPatchFrom,
} from "@shared/routings";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, Button, Card, ErrorText, Field, Input, Select } from "../components/ui";
import { api, orgApi, queryClient } from "../lib/api";
import { canEstimate, useOrg, useOrgId } from "./layout";

const num = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export function RoutingsPage() {
  const orgId = useOrgId();
  const org = useOrg(orgId);
  const editable = canEstimate(org.data?.role);
  const routings = useQuery({
    queryKey: ["routings", orgId],
    queryFn: () => api<{ items: RoutingDto[] }>(orgApi(orgId, "/routings")),
  });
  const card = useQuery({
    queryKey: ["rate-card", orgId],
    queryFn: () => api<RateCardDto>(orgApi(orgId, "/rate-card")),
  });
  const [filter, setFilter] = useState("");
  const items = routings.data?.items ?? [];
  const f = filter.trim().toLowerCase();
  const shown = f
    ? items.filter(
        (r) => r.name.toLowerCase().includes(f) || (r.partFamily ?? "").toLowerCase().includes(f),
      )
    : items;
  // Group by part family, families in name order, untagged last.
  const groups = new Map<string, RoutingDto[]>();
  for (const r of shown) {
    const k = r.partFamily ?? "";
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const keys = [...groups.keys()].sort((a, b) =>
    a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-stone-900">Routings</h1>
        {items.length > 5 && (
          <Input
            className="max-w-xs"
            placeholder="Filter by name or part family"
            aria-label="Filter routings"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        )}
      </div>
      <p className="text-sm text-stone-600">
        A routing is a saved set of operations (machine, setup and cycle minutes) and finishing
        steps. Save one from a quote line, then apply it to the next part of the same family. Edits
        here change the routing for the next line it is applied to; quotes that already used it keep
        their own operations. Lines are always priced from today's rate card.
        {!editable && " Viewers can read routings; estimators and admins edit them."}
      </p>
      <ErrorText error={routings.error ?? card.error} />
      {routings.data && items.length === 0 && (
        <Card>
          <p className="text-sm text-stone-600">
            No routings yet. On a quote line, add operations and choose "Save these operations as a
            routing".
          </p>
        </Card>
      )}
      {keys.map((k) => (
        <section key={k || "_none"} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-stone-700">{k || "No part family"}</h2>
          {(groups.get(k) ?? []).map((r) => (
            <RoutingCard
              key={r.id}
              orgId={orgId}
              routing={r}
              card={card.data}
              editable={editable}
            />
          ))}
        </section>
      ))}
      {f && shown.length === 0 && items.length > 0 && (
        <p className="text-sm text-stone-600">No routing matches "{filter}".</p>
      )}
    </div>
  );
}

function RoutingCard({
  orgId,
  routing,
  card,
  editable,
}: {
  orgId: string;
  routing: RoutingDto;
  card: RateCardDto | undefined;
  editable: boolean;
}) {
  const [draft, setDraft] = useState<RoutingDraft | null>(null);
  // Stable React keys for operation rows while editing (rows can be reordered and removed).
  const [opKeys, setOpKeys] = useState<string[]>([]);
  const key = ["routings", orgId];
  const save = useMutation({
    mutationFn: (body: RoutingPatch) =>
      api<RoutingDto>(orgApi(orgId, `/routings/${routing.id}`), { method: "PATCH", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      setDraft(null);
    },
  });
  const remove = useMutation({
    mutationFn: () => api(orgApi(orgId, `/routings/${routing.id}`), { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
  const startEdit = () => {
    const d = routingDraftFrom(routing);
    setDraft(d);
    setOpKeys(d.operations.map(() => crypto.randomUUID()));
    save.reset();
  };
  const retiredCount =
    routing.operations.filter((o) => o.retired).length +
    routing.finishing.filter((f) => f.retired).length;

  if (draft && card) {
    const patch = routingPatchFrom(routing, draft);
    // The server takes only ids on this shop's card: a machine or finishing step deleted since the
    // routing was saved must be replaced or removed before changed operations/finishing can save.
    const goneMachine =
      patch?.operations !== undefined &&
      draft.operations.some((o) => !card.machines.some((m) => m.id === o.machineId));
    const goneFinishing =
      patch?.finishing !== undefined &&
      draft.finishing.some((f) => !card.finishingOps.some((o) => o.id === f.opId));
    const invalid =
      !draft.name.trim() || draft.operations.length === 0 || goneMachine || goneFinishing;
    return (
      <Card>
        <RoutingEditor
          draft={draft}
          opKeys={opKeys}
          routing={routing}
          machines={card.machines}
          finishingOps={card.finishingOps}
          onChange={(d, keys) => {
            setDraft(d);
            if (keys) setOpKeys(keys);
          }}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            disabled={!patch || invalid || save.isPending}
            onClick={() => patch && save.mutate(patch)}
          >
            Save changes
          </Button>
          <Button variant="ghost" onClick={() => setDraft(null)}>
            Cancel
          </Button>
          {!patch && <span className="text-xs text-stone-500">No changes yet.</span>}
          {goneMachine && (
            <span className="text-xs text-red-700">
              Pick a machine for each operation whose machine was deleted.
            </span>
          )}
          {goneFinishing && (
            <span className="text-xs text-red-700">
              Remove the finishing steps no longer on the rate card.
            </span>
          )}
          {draft.operations.length === 0 && (
            <span className="text-xs text-red-700">A routing needs at least one operation.</span>
          )}
        </div>
        <ErrorText error={save.error} />
        {save.error instanceof Error && /someone else/i.test(save.error.message) && (
          <Button
            variant="ghost"
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: key });
              setDraft(null);
            }}
          >
            Discard my edit and reload
          </Button>
        )}
      </Card>
    );
  }

  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          {routing.name}
          {retiredCount > 0 && <Badge tone="amber">{retiredCount} retired on the rate card</Badge>}
        </span>
      }
      actions={
        editable && (
          <>
            <Button variant="secondary" disabled={!card} onClick={startEdit}>
              Edit
            </Button>
            <Button
              variant="ghost"
              disabled={remove.isPending}
              onClick={() =>
                window.confirm(
                  `Delete the routing "${routing.name}"? Quotes that used it keep their operations.`,
                ) && remove.mutate()
              }
            >
              Delete
            </Button>
          </>
        )
      }
    >
      <ol className="list-decimal pl-5 text-sm text-stone-700">
        {routing.operations.map((o, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: read-only list in stored order
          <li key={i}>
            {o.label ? `${o.label} on ${o.machine}` : o.machine}
            {o.retired && " (retired machine)"}: setup {o.setupMinutes} min,{" "}
            {cycleText(o.cycleMinutesPerPart)}
          </li>
        ))}
      </ol>
      {routing.finishing.length > 0 && (
        <p className="mt-1 text-sm text-stone-700">
          Then {routing.finishing.map((f) => f.name + (f.retired ? " (retired)" : "")).join(", ")}
        </p>
      )}
      <p className="mt-1 text-xs text-stone-500">
        Last changed {new Date(routing.updatedAt).toLocaleString()}
      </p>
      <ErrorText error={remove.error} />
    </Card>
  );
}

function RoutingEditor({
  draft,
  opKeys,
  routing,
  machines,
  finishingOps,
  onChange,
}: {
  draft: RoutingDraft;
  opKeys: string[];
  routing: RoutingDto;
  machines: MachineDto[];
  finishingOps: FinishingOpDto[];
  onChange: (d: RoutingDraft, opKeys?: string[]) => void;
}) {
  const active = machines.filter((m) => m.active);
  const setOp = (i: number, p: Partial<RoutingOperation>) =>
    onChange({
      ...draft,
      operations: draft.operations.map((o, j) => (j === i ? { ...o, ...p } : o)),
    });
  const move = (i: number, dir: -1 | 1) =>
    onChange(
      { ...draft, operations: moveItem(draft.operations, i, dir) },
      moveItem(opKeys, i, dir),
    );
  // A retired or deleted machine already on the routing stays selectable (and flagged), so opening
  // the editor never silently swaps it; new choices come from active machines only.
  const machineOptions = (current: string) => {
    const opts = [...active];
    const m = machines.find((x) => x.id === current);
    if (m && !m.active) opts.push(m);
    return { opts, missing: !m };
  };
  const finishingShown = finishingOps.filter(
    (o) => o.active || draft.finishing.some((f) => f.opId === o.id),
  );
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="grid gap-2 md:grid-cols-2">
        <Field label="Routing name">
          <Input
            value={draft.name}
            maxLength={80}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
          />
        </Field>
        <Field label="Part family (optional)">
          <Input
            value={draft.partFamily}
            maxLength={80}
            placeholder="e.g. Brackets"
            onChange={(e) => onChange({ ...draft, partFamily: e.target.value })}
          />
        </Field>
      </div>
      <div>
        <div className="mb-1 font-medium">Operations</div>
        {draft.operations.map((op, i) => {
          const { opts, missing } = machineOptions(op.machineId);
          const retired = machines.find((m) => m.id === op.machineId)?.active === false;
          return (
            <div
              key={opKeys[i] ?? i}
              className="mb-2 grid grid-cols-2 items-end gap-1 border-b border-stone-100 pb-2 md:grid-cols-[2fr_2fr_1fr_1fr_auto]"
            >
              <Field label={`${i + 1}. Machine`}>
                <Select
                  value={op.machineId}
                  onChange={(e) => setOp(i, { machineId: e.target.value })}
                >
                  {missing && <option value={op.machineId}>Unknown machine (deleted)</option>}
                  {opts.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.active ? "" : " (retired)"}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Label">
                <Input
                  value={op.label}
                  maxLength={120}
                  placeholder="e.g. Op 10"
                  onChange={(e) => setOp(i, { label: e.target.value })}
                />
              </Field>
              <Field label="Setup min">
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={op.setupMinutes}
                  onChange={(e) => setOp(i, { setupMinutes: num(e.target.value) })}
                />
              </Field>
              <Field label="Cycle min/part">
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={op.cycleMinutesPerPart ?? ""}
                  placeholder="per part"
                  onChange={(e) =>
                    setOp(i, {
                      cycleMinutesPerPart:
                        e.target.value.trim() === "" ? null : num(e.target.value),
                    })
                  }
                />
              </Field>
              <div className="col-span-2 flex gap-1 md:col-span-1">
                <Button
                  variant="ghost"
                  aria-label={`Move operation ${i + 1} up`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  aria-label={`Move operation ${i + 1} down`}
                  disabled={i === draft.operations.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </Button>
                <Button
                  variant="ghost"
                  aria-label={`Remove operation ${i + 1}`}
                  onClick={() =>
                    onChange(
                      { ...draft, operations: draft.operations.filter((_, j) => j !== i) },
                      opKeys.filter((_, j) => j !== i),
                    )
                  }
                >
                  ✕
                </Button>
              </div>
              {(retired || missing) && (
                <p className="col-span-full text-xs text-amber-800">
                  This machine is {missing ? "no longer on the rate card" : "retired"}: a line using
                  this routing shows it as an issue until you pick another machine.
                </p>
              )}
            </div>
          );
        })}
        {active.length === 0 ? (
          <p className="text-xs text-stone-500">Add machines on the rate card first.</p>
        ) : (
          <Button
            variant="ghost"
            disabled={draft.operations.length >= MAX_LINE_OPERATIONS}
            onClick={() => {
              const m = active[0];
              if (!m) return;
              onChange(
                {
                  ...draft,
                  operations: [
                    ...draft.operations,
                    {
                      machineId: m.id,
                      label: "",
                      setupMinutes: m.defaultSetupMinutes,
                      // Left blank: the quote line asks for the part's own cycle time.
                      cycleMinutesPerPart: null,
                    },
                  ],
                },
                [...opKeys, crypto.randomUUID()],
              );
            }}
          >
            + Operation
          </Button>
        )}
      </div>
      <div>
        <div className="mb-1 font-medium">Finishing</div>
        {finishingShown.length === 0 && (
          <p className="text-xs text-stone-500">No finishing steps on the rate card.</p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {finishingShown.map((o) => {
            const on = draft.finishing.some((f) => f.opId === o.id);
            return (
              <label key={o.id} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!on && draft.finishing.length >= MAX_LINE_FINISHING}
                  onChange={() =>
                    onChange({
                      ...draft,
                      finishing: on
                        ? draft.finishing.filter((f) => f.opId !== o.id)
                        : [...draft.finishing, { opId: o.id }],
                    })
                  }
                />
                {o.name}
                {!o.active && " (retired)"}
              </label>
            );
          })}
        </div>
        {routing.finishing
          .filter((f) => !finishingOps.some((o) => o.id === f.opId))
          .map((f) => (
            <p key={f.opId} className="text-xs text-amber-800">
              {f.name} is no longer on the rate card
              {draft.finishing.some((x) => x.opId === f.opId) ? (
                <>
                  {" "}
                  <Button
                    variant="ghost"
                    onClick={() =>
                      onChange({
                        ...draft,
                        finishing: draft.finishing.filter((x) => x.opId !== f.opId),
                      })
                    }
                  >
                    Remove it
                  </Button>
                </>
              ) : (
                " (removed)"
              )}
            </p>
          ))}
      </div>
    </div>
  );
}
