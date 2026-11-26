// Rate card editor: shop settings (markups, minimums, quote defaults), machines, materials, finishing.

import type {
  CutSpeedDto,
  DrillFeedDto,
  FinishingOpDto,
  MachineDto,
  MaterialDto,
  RateCardDto,
  RemovalRateDto,
  ShopSettingsDto,
} from "@shared/api";
import { isCuttingMachine } from "@shared/cut-speed-import";
import { isDrillingMachine, MACHINE_KINDS, ROUGHING_MACHINE_KINDS } from "@shared/enums";
import { knownTimeZones } from "@shared/time-zone";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, Button, Card, ErrorText, Field, Input, Select, Textarea } from "../components/ui";
import {
  api,
  fromCents,
  money,
  orgApi,
  parseQuantities,
  pct,
  queryClient,
  toCents,
} from "../lib/api";
import { canAdmin, useOrg, useOrgId } from "./layout";
import { RateCardImport } from "./rate-card-import";

const useRateCard = (orgId: string) =>
  useQuery({
    queryKey: ["rate-card", orgId],
    queryFn: () => api<RateCardDto>(orgApi(orgId, "/rate-card")),
  });

function useSave<T>(orgId: string, fn: (body: T) => Promise<unknown>, onDone?: () => void) {
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      onDone?.();
      void queryClient.invalidateQueries({ queryKey: ["rate-card", orgId] });
      void queryClient.invalidateQueries({ queryKey: ["org", orgId] });
    },
  });
}

export function RateCardPage() {
  const orgId = useOrgId();
  const card = useRateCard(orgId);
  const org = useOrg(orgId);
  const admin = canAdmin(org.data?.role);
  if (!card.data) return <ErrorText error={card.error} />;
  return (
    <div className="flex flex-col gap-4">
      {!admin && (
        <p className="text-sm text-stone-600">Only owners and admins can change the rate card.</p>
      )}
      {/* Keyed by the saved values: a spreadsheet import changes them under the form, which must
          not keep (and save back) the values it opened with. */}
      <SettingsCard
        key={JSON.stringify(card.data.settings)}
        orgId={orgId}
        settings={card.data.settings}
        admin={admin}
      />
      {admin && <RateCardImport orgId={orgId} card={card.data} />}
      <MachinesCard orgId={orgId} rows={card.data.machines} admin={admin} />
      <MaterialsCard orgId={orgId} rows={card.data.materials} admin={admin} />
      <CutSpeedsCard
        orgId={orgId}
        rows={card.data.cutSpeeds}
        machines={card.data.machines}
        materials={card.data.materials}
        admin={admin}
      />
      <RemovalRatesCard
        orgId={orgId}
        rows={card.data.removalRates}
        machines={card.data.machines}
        materials={card.data.materials}
        admin={admin}
      />
      <DrillFeedsCard
        orgId={orgId}
        rows={card.data.drillFeeds}
        machines={card.data.machines}
        materials={card.data.materials}
        admin={admin}
      />
      <FinishingCard orgId={orgId} rows={card.data.finishingOps} admin={admin} />
    </div>
  );
}

function SettingsCard({
  orgId,
  settings,
  admin,
}: {
  orgId: string;
  settings: ShopSettingsDto;
  admin: boolean;
}) {
  const [f, setF] = useState({
    displayName: settings.displayName,
    addressLines: settings.addressLines.join("\n"),
    phone: settings.phone ?? "",
    email: settings.email ?? "",
    labor: String(settings.laborMarkupBps / 100),
    material: String(settings.materialMarkupBps / 100),
    outside: String(settings.outsideServiceMarkupBps / 100),
    minimum: fromCents(settings.minimumLineCents),
    quantities: settings.defaultQuantities.join(", "),
    validDays: String(settings.quoteValidDays),
    lead: settings.defaultLeadTimeText ?? "",
    terms: settings.quoteTerms ?? "",
    signature: settings.emailSignature ?? "",
    timeZone: settings.timeZone ?? "",
  });
  const [prefill, setPrefill] = useState(settings.prefillRepeatParts);
  const [zones] = useState(knownTimeZones);
  const [browserZone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch {
      return null;
    }
  });
  const save = useSave(orgId, () =>
    api(orgApi(orgId, "/settings"), {
      method: "PATCH",
      body: {
        displayName: f.displayName,
        addressLines: f.addressLines
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        phone: f.phone.trim() || null,
        email: f.email.trim() || null,
        laborMarkupBps: Math.round(Number(f.labor) * 100),
        materialMarkupBps: Math.round(Number(f.material) * 100),
        outsideServiceMarkupBps: Math.round(Number(f.outside) * 100),
        minimumLineCents: toCents(f.minimum) ?? 0,
        defaultQuantities: parseQuantities(f.quantities),
        quoteValidDays: Number(f.validDays),
        defaultLeadTimeText: f.lead.trim() || null,
        quoteTerms: f.terms.trim() || null,
        emailSignature: f.signature.trim() || null,
        prefillRepeatParts: prefill,
        timeZone: f.timeZone.trim() || null,
      },
    }),
  );
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  return (
    <Card
      title="Shop and pricing rules"
      actions={
        admin && (
          <Button onClick={() => save.mutate(undefined)} disabled={save.isPending}>
            Save
          </Button>
        )
      }
    >
      <fieldset disabled={!admin} className="grid gap-3 md:grid-cols-3">
        <Field label="Shop name (on quotes)">
          <Input value={f.displayName} onChange={set("displayName")} />
        </Field>
        <Field label="Phone">
          <Input value={f.phone} onChange={set("phone")} />
        </Field>
        <Field label="Email">
          <Input value={f.email} onChange={set("email")} />
        </Field>
        <Field label="Address (one line each)">
          <Textarea rows={2} value={f.addressLines} onChange={set("addressLines")} />
        </Field>
        <Field label="Labor markup %" hint="On setup and run time">
          <Input inputMode="decimal" value={f.labor} onChange={set("labor")} />
        </Field>
        <Field label="Material markup %" hint="Also applies to purchased extras">
          <Input inputMode="decimal" value={f.material} onChange={set("material")} />
        </Field>
        <Field label="Outside service markup %" hint="Anodize, plating, heat treat">
          <Input inputMode="decimal" value={f.outside} onChange={set("outside")} />
        </Field>
        <Field label="Line minimum $">
          <Input inputMode="decimal" value={f.minimum} onChange={set("minimum")} />
        </Field>
        <Field label="Default quantity breaks">
          <Input value={f.quantities} onChange={set("quantities")} />
        </Field>
        <Field label="Quote valid (days)">
          <Input inputMode="numeric" value={f.validDays} onChange={set("validDays")} />
        </Field>
        <Field label="Default lead time">
          <Input placeholder="e.g. 3-4 weeks ARO" value={f.lead} onChange={set("lead")} />
        </Field>
        <Field label="Terms (printed on quotes)">
          <Textarea rows={2} value={f.terms} onChange={set("terms")} />
        </Field>
        <Field
          label="Email signature"
          hint="Under the estimator's message on every quote email: shop name, address, phone, certifications"
        >
          <Textarea
            rows={3}
            maxLength={1000}
            placeholder={"Acme Machine LLC\n12 Mill Rd, Dayton OH\nAS9100D certified"}
            value={f.signature}
            onChange={set("signature")}
          />
        </Field>
        <Field
          label="Time zone"
          hint="Quote dates, valid-until days, expiry, win/loss months and CSV dates follow this calendar. Blank is UTC."
        >
          <Input
            list="shop-time-zones"
            placeholder={browserZone ? `e.g. ${browserZone}` : "e.g. America/Chicago"}
            value={f.timeZone}
            onChange={set("timeZone")}
          />
          <datalist id="shop-time-zones">
            {zones.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
          {admin && browserZone && f.timeZone !== browserZone && (
            <button
              type="button"
              className="mt-1 text-xs text-stone-600 underline"
              onClick={() => setF({ ...f, timeZone: browserZone })}
            >
              Use this computer's ({browserZone})
            </button>
          )}
        </Field>
        <label className="flex items-start gap-2 text-sm md:col-span-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={prefill}
            onChange={(e) => setPrefill(e.target.checked)}
          />
          <span>
            <span className="font-medium">Pre-fill repeat parts.</span> A new quote from an RFQ
            starts each part you have won before (same part number and revision) from the last won
            quote's material, operations and finishing, with the RFQ's quantities, priced from
            today's rates. The line says which quote it came from.
          </span>
        </label>
      </fieldset>
      <ErrorText error={save.error} />
    </Card>
  );
}

function RetireButton({ orgId, kind, id }: { orgId: string; kind: string; id: string }) {
  const retire = useSave(orgId, () =>
    api(orgApi(orgId, `/rate-card/${kind}/${id}`), { method: "DELETE" }),
  );
  return (
    <Button variant="ghost" onClick={() => retire.mutate(undefined)}>
      Retire
    </Button>
  );
}

/** The rates a machine contributes to CAD suggestions, as one short line. */
function cadRates(m: MachineDto): string {
  return [
    m.removalRateIn3PerMin && `${m.removalRateIn3PerMin} in³/min`,
    m.cutSpeedInPerMin && `${m.cutSpeedInPerMin} in/min cut`,
    m.pierceSeconds && `${m.pierceSeconds} s pierce`,
    m.secondsPerBend && `${m.secondsPerBend} s/bend`,
    m.secondsPerHole && `${m.secondsPerHole} s/hole`,
    m.drillFeedInPerMin && `${m.drillFeedInPerMin} in/min drill`,
    m.secondsPerTappedHole && `${m.secondsPerTappedHole} s/tap`,
    m.peckDepthDiameters &&
      m.secondsPerPeck &&
      `peck ${m.peckDepthDiameters}×D at ${m.secondsPerPeck} s`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function MachinesCard({
  orgId,
  rows,
  admin,
}: {
  orgId: string;
  rows: MachineDto[];
  admin: boolean;
}) {
  const blank = {
    name: "",
    kind: "mill_3axis",
    rate: "",
    setupRate: "",
    setupMin: "",
    mrr: "",
    cutSpeed: "",
    pierce: "",
    bend: "",
    hole: "",
    drillFeed: "",
    tap: "",
    peckD: "",
    peckS: "",
  };
  const positive = (v: string) => (Number(v) > 0 ? Number(v) : null);
  const [f, setF] = useState(blank);
  const add = useSave(
    orgId,
    () =>
      api(orgApi(orgId, "/rate-card/machines"), {
        method: "POST",
        body: {
          name: f.name,
          kind: f.kind,
          hourlyRateCents: toCents(f.rate) ?? 0,
          setupRateCents: toCents(f.setupRate),
          defaultSetupMinutes: Number(f.setupMin) || 0,
          removalRateIn3PerMin: positive(f.mrr),
          cutSpeedInPerMin: positive(f.cutSpeed),
          pierceSeconds: positive(f.pierce),
          secondsPerBend: positive(f.bend),
          secondsPerHole: positive(f.hole),
          drillFeedInPerMin: positive(f.drillFeed),
          secondsPerTappedHole: positive(f.tap),
          peckDepthDiameters: positive(f.peckD),
          secondsPerPeck: positive(f.peckS),
        },
      }),
    () => setF(blank),
  );
  return (
    <Card title="Machines and work centers">
      <div className="mb-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-stone-500">
            <tr>
              <th>Name</th>
              <th>Kind</th>
              <th className="text-right">$/h</th>
              <th className="text-right">Setup $/h</th>
              <th className="text-right">Default setup</th>
              <th className="text-right" title="Used to suggest operations from CAD files">
                CAD rates
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr
                key={m.id}
                className={
                  m.active
                    ? "border-t border-stone-100"
                    : "border-t border-stone-100 text-stone-400"
                }
              >
                <td className="py-1">
                  {m.name} {!m.active && <Badge>retired</Badge>}
                </td>
                <td>{m.kind}</td>
                <td className="text-right">{money(m.hourlyRateCents)}</td>
                <td className="text-right">
                  {m.setupRateCents == null ? "same" : money(m.setupRateCents)}
                </td>
                <td className="text-right">{m.defaultSetupMinutes} min</td>
                <td className="text-right text-stone-500">{cadRates(m) || "none"}</td>
                <td className="text-right">
                  {admin && m.active && <RetireButton orgId={orgId} kind="machines" id={m.id} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {admin && (
        <form
          className="grid items-end gap-2 md:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate(undefined);
          }}
        >
          <Field label="Name">
            <Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Kind">
            <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              {MACHINE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="$/hour">
            <Input
              required
              inputMode="decimal"
              value={f.rate}
              onChange={(e) => setF({ ...f, rate: e.target.value })}
            />
          </Field>
          <Field label="Setup $/h" hint="Blank = same">
            <Input
              inputMode="decimal"
              value={f.setupRate}
              onChange={(e) => setF({ ...f, setupRate: e.target.value })}
            />
          </Field>
          <Field label="Setup min">
            <Input
              inputMode="numeric"
              value={f.setupMin}
              onChange={(e) => setF({ ...f, setupMin: e.target.value })}
            />
          </Field>
          <Field label="Roughing in³/min" hint="Optional">
            <Input
              inputMode="decimal"
              value={f.mrr}
              onChange={(e) => setF({ ...f, mrr: e.target.value })}
            />
          </Field>
          <Field label="Cut speed in/min" hint="Laser, waterjet, plasma">
            <Input
              inputMode="decimal"
              value={f.cutSpeed}
              onChange={(e) => setF({ ...f, cutSpeed: e.target.value })}
            />
          </Field>
          <Field label="Pierce seconds" hint="Optional">
            <Input
              inputMode="decimal"
              value={f.pierce}
              onChange={(e) => setF({ ...f, pierce: e.target.value })}
            />
          </Field>
          <Field label="Seconds per bend" hint="Press brake">
            <Input
              inputMode="decimal"
              value={f.bend}
              onChange={(e) => setF({ ...f, bend: e.target.value })}
            />
          </Field>
          <Field label="Seconds per hole" hint="Drill: position, drill, retract">
            <Input
              inputMode="decimal"
              value={f.hole}
              onChange={(e) => setF({ ...f, hole: e.target.value })}
            />
          </Field>
          <Field label="Drill feed in/min" hint="Drill: penetration rate, times each hole's depth">
            <Input
              inputMode="decimal"
              value={f.drillFeed}
              onChange={(e) => setF({ ...f, drillFeed: e.target.value })}
            />
          </Field>
          <Field label="Seconds per tapped hole" hint="Tap: in and reverse out, per threaded hole">
            <Input
              inputMode="decimal"
              value={f.tap}
              onChange={(e) => setF({ ...f, tap: e.target.value })}
            />
          </Field>
          <Field
            label="Peck depth ×D"
            hint="Drill: each peck's depth in drill diameters (deep holes)"
          >
            <Input
              inputMode="decimal"
              value={f.peckD}
              onChange={(e) => setF({ ...f, peckD: e.target.value })}
            />
          </Field>
          <Field
            label="Seconds per peck"
            hint="Drill: one retract to clear chips and back to depth"
          >
            <Input
              inputMode="decimal"
              value={f.peckS}
              onChange={(e) => setF({ ...f, peckS: e.target.value })}
            />
          </Field>
          <Button type="submit" disabled={add.isPending}>
            Add machine
          </Button>
        </form>
      )}
      <ErrorText error={add.error} />
    </Card>
  );
}

/** Machines that cut sheet from a DXF flat pattern (the server checks the same). */
const isCutter = isCuttingMachine;

/**
 * Cut speed per material and thickness: a cutting machine's speed on one material row. A DXF
 * part quoted in that material is timed at this speed instead of the machine's single default, and
 * when only one machine has a speed for the material, that machine gets the suggested cut.
 */
function CutSpeedsCard({
  orgId,
  rows,
  machines,
  materials,
  admin,
}: {
  orgId: string;
  rows: CutSpeedDto[];
  machines: MachineDto[];
  materials: MaterialDto[];
  admin: boolean;
}) {
  const cutters = machines.filter((m) => m.active && isCutter(m));
  const sheets = materials.filter((m) => m.active);
  const blank = { machineId: "", materialId: "", speed: "", pierce: "" };
  const [f, setF] = useState(blank);
  const machineId = f.machineId || cutters[0]?.id || "";
  const materialId = f.materialId || sheets[0]?.id || "";
  const save = useSave(
    orgId,
    () =>
      api(orgApi(orgId, "/rate-card/cut-speeds"), {
        method: "PUT",
        body: {
          machineId,
          materialId,
          cutSpeedInPerMin: Number(f.speed),
          pierceSeconds: Number(f.pierce) > 0 ? Number(f.pierce) : null,
        },
      }),
    () => setF({ ...blank, machineId, materialId: "" }),
  );
  const remove = useSave(orgId, (id: string) =>
    api(orgApi(orgId, `/rate-card/cut-speeds/${id}`), { method: "DELETE" }),
  );
  const machineName = (id: string) => machines.find((m) => m.id === id)?.name ?? id;
  const material = (id: string) => materials.find((m) => m.id === id);
  const thickness = (m: MaterialDto | undefined) =>
    m?.sheetThicknessIn ? `${m.sheetThicknessIn} in` : "no thickness";
  return (
    <Card title="Cut speeds by material">
      <p className="mb-3 text-sm text-stone-600">
        A DXF part cut in one of these materials is timed at this speed instead of the machine's
        default. When only one machine has a speed for a material, that machine gets the suggested
        cut. Speeds come from your own cut charts; the app never assumes one.
      </p>
      {rows.length > 0 && (
        <div className="mb-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-stone-500">
              <tr>
                <th>Machine</th>
                <th>Material</th>
                <th className="text-right">Thickness</th>
                <th className="text-right">in/min</th>
                <th className="text-right">Pierce</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const mat = material(r.materialId);
                return (
                  <tr key={r.id} className="border-t border-stone-100">
                    <td className="py-1">{machineName(r.machineId)}</td>
                    <td>{mat?.name ?? r.materialId}</td>
                    <td className="text-right text-stone-500">{thickness(mat)}</td>
                    <td className="text-right">{r.cutSpeedInPerMin}</td>
                    <td className="text-right">
                      {r.pierceSeconds == null ? "machine's" : `${r.pierceSeconds} s`}
                    </td>
                    <td className="text-right">
                      {admin && (
                        <Button
                          variant="ghost"
                          onClick={() => remove.mutate(r.id)}
                          disabled={remove.isPending}
                        >
                          Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {admin && cutters.length === 0 && (
        <p className="text-sm text-stone-500">
          Add a laser, waterjet or plasma machine above to enter its speeds by material.
        </p>
      )}
      {admin && cutters.length > 0 && sheets.length > 0 && (
        <form
          className="grid items-end gap-2 md:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(undefined);
          }}
        >
          <Field label="Machine">
            <Select value={machineId} onChange={(e) => setF({ ...f, machineId: e.target.value })}>
              {cutters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Material">
            <Select value={materialId} onChange={(e) => setF({ ...f, materialId: e.target.value })}>
              {sheets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({thickness(m)})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cut speed in/min">
            <Input
              required
              inputMode="decimal"
              value={f.speed}
              onChange={(e) => setF({ ...f, speed: e.target.value })}
            />
          </Field>
          <Field label="Pierce seconds" hint="Blank = machine's">
            <Input
              inputMode="decimal"
              value={f.pierce}
              onChange={(e) => setF({ ...f, pierce: e.target.value })}
            />
          </Field>
          <Button type="submit" disabled={save.isPending}>
            Save speed
          </Button>
        </form>
      )}
      <ErrorText error={save.error ?? remove.error} />
    </Card>
  );
}

/** Machines that rough a solid from a blank (the server checks the same). */
const isRougher = (m: MachineDto) =>
  ROUGHING_MACHINE_KINDS.has(m.kind) || (m.removalRateIn3PerMin ?? 0) > 0;

/**
 * Removal rate per material: a mill's or lathe's roughing rate in one material row. A STEP part
 * quoted in that material is timed at this rate instead of the machine's single default, and when
 * only one machine has a rate for the material, that machine gets the suggested roughing.
 */
function RemovalRatesCard({
  orgId,
  rows,
  machines,
  materials,
  admin,
}: {
  orgId: string;
  rows: RemovalRateDto[];
  machines: MachineDto[];
  materials: MaterialDto[];
  admin: boolean;
}) {
  const roughers = machines.filter((m) => m.active && isRougher(m));
  const active = materials.filter((m) => m.active);
  const blank = { machineId: "", materialId: "", rate: "" };
  const [f, setF] = useState(blank);
  const machineId = f.machineId || roughers[0]?.id || "";
  const materialId = f.materialId || active[0]?.id || "";
  const save = useSave(
    orgId,
    () =>
      api(orgApi(orgId, "/rate-card/removal-rates"), {
        method: "PUT",
        body: { machineId, materialId, removalRateIn3PerMin: Number(f.rate) },
      }),
    () => setF({ ...blank, machineId, materialId: "" }),
  );
  const remove = useSave(orgId, (id: string) =>
    api(orgApi(orgId, `/rate-card/removal-rates/${id}`), { method: "DELETE" }),
  );
  const machine = (id: string) => machines.find((m) => m.id === id);
  const materialName = (id: string) => materials.find((m) => m.id === id)?.name ?? id;
  return (
    <Card title="Removal rates by material">
      <p className="mb-3 text-sm text-stone-600">
        A STEP part roughed in one of these materials is timed at this rate instead of the machine's
        default, so aluminum and steel are not quoted at the same in³/min. When only one machine has
        a rate for a material, that machine gets the suggested roughing. Rates come from your own
        cuts; the app never assumes one.
      </p>
      {rows.length > 0 && (
        <div className="mb-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-stone-500">
              <tr>
                <th>Machine</th>
                <th>Material</th>
                <th className="text-right">in³/min</th>
                <th className="text-right">Machine default</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const m = machine(r.machineId);
                return (
                  <tr key={r.id} className="border-t border-stone-100">
                    <td className="py-1">{m?.name ?? r.machineId}</td>
                    <td>{materialName(r.materialId)}</td>
                    <td className="text-right">{r.removalRateIn3PerMin}</td>
                    <td className="text-right text-stone-500">
                      {m?.removalRateIn3PerMin ? `${m.removalRateIn3PerMin}` : "none"}
                    </td>
                    <td className="text-right">
                      {admin && (
                        <Button
                          variant="ghost"
                          onClick={() => remove.mutate(r.id)}
                          disabled={remove.isPending}
                        >
                          Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {admin && roughers.length === 0 && (
        <p className="text-sm text-stone-500">
          Add a mill or lathe above to enter its removal rates by material.
        </p>
      )}
      {admin && roughers.length > 0 && active.length > 0 && (
        <form
          className="grid items-end gap-2 md:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(undefined);
          }}
        >
          <Field label="Machine">
            <Select value={machineId} onChange={(e) => setF({ ...f, machineId: e.target.value })}>
              {roughers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Material">
            <Select value={materialId} onChange={(e) => setF({ ...f, materialId: e.target.value })}>
              {active.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Removal rate in³/min">
            <Input
              required
              inputMode="decimal"
              value={f.rate}
              onChange={(e) => setF({ ...f, rate: e.target.value })}
            />
          </Field>
          <Button type="submit" disabled={save.isPending}>
            Save rate
          </Button>
        </form>
      )}
      <ErrorText error={save.error ?? remove.error} />
    </Card>
  );
}

/**
 * Drill feed per material: a drilling machine's feed (in/min) in one material row. A STEP part
 * quoted in that material has its hole depths timed at this feed instead of the machine's single
 * default, and when only one machine has a feed for the material, that machine gets the suggested
 * drilling.
 */
function DrillFeedsCard({
  orgId,
  rows,
  machines,
  materials,
  admin,
}: {
  orgId: string;
  rows: DrillFeedDto[];
  machines: MachineDto[];
  materials: MaterialDto[];
  admin: boolean;
}) {
  const drills = machines.filter(
    (m) => m.active && isDrillingMachine(m.kind, m.secondsPerHole, m.drillFeedInPerMin),
  );
  const active = materials.filter((m) => m.active);
  const blank = { machineId: "", materialId: "", rate: "" };
  const [f, setF] = useState(blank);
  const machineId = f.machineId || drills[0]?.id || "";
  const materialId = f.materialId || active[0]?.id || "";
  const save = useSave(
    orgId,
    () =>
      api(orgApi(orgId, "/rate-card/drill-feeds"), {
        method: "PUT",
        body: { machineId, materialId, drillFeedInPerMin: Number(f.rate) },
      }),
    () => setF({ ...blank, machineId, materialId: "" }),
  );
  const remove = useSave(orgId, (id: string) =>
    api(orgApi(orgId, `/rate-card/drill-feeds/${id}`), { method: "DELETE" }),
  );
  const machine = (id: string) => machines.find((m) => m.id === id);
  const materialName = (id: string) => materials.find((m) => m.id === id)?.name ?? id;
  return (
    <Card title="Drill feeds by material">
      <p className="mb-3 text-sm text-stone-600">
        Holes in a STEP part quoted in one of these materials are timed at this feed instead of the
        machine's default, so stainless is not drilled at aluminum's in/min. The machine's seconds
        per hole still apply. When only one machine has a feed for a material, that machine gets the
        suggested drilling. Feeds come from your own programs; the app never assumes one.
      </p>
      {rows.length > 0 && (
        <div className="mb-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-stone-500">
              <tr>
                <th>Machine</th>
                <th>Material</th>
                <th className="text-right">in/min</th>
                <th className="text-right">Machine default</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const m = machine(r.machineId);
                return (
                  <tr key={r.id} className="border-t border-stone-100">
                    <td className="py-1">{m?.name ?? r.machineId}</td>
                    <td>{materialName(r.materialId)}</td>
                    <td className="text-right">{r.drillFeedInPerMin}</td>
                    <td className="text-right text-stone-500">
                      {m?.drillFeedInPerMin ? `${m.drillFeedInPerMin}` : "none"}
                    </td>
                    <td className="text-right">
                      {admin && (
                        <Button
                          variant="ghost"
                          onClick={() => remove.mutate(r.id)}
                          disabled={remove.isPending}
                        >
                          Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {admin && drills.length === 0 && (
        <p className="text-sm text-stone-500">
          Add a mill, lathe or a machine with a time per hole above to enter its drill feeds by
          material.
        </p>
      )}
      {admin && drills.length > 0 && active.length > 0 && (
        <form
          className="grid items-end gap-2 md:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(undefined);
          }}
        >
          <Field label="Machine">
            <Select value={machineId} onChange={(e) => setF({ ...f, machineId: e.target.value })}>
              {drills.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Material">
            <Select value={materialId} onChange={(e) => setF({ ...f, materialId: e.target.value })}>
              {active.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Drill feed in/min">
            <Input
              required
              inputMode="decimal"
              value={f.rate}
              onChange={(e) => setF({ ...f, rate: e.target.value })}
            />
          </Field>
          <Button type="submit" disabled={save.isPending}>
            Save feed
          </Button>
        </form>
      )}
      <ErrorText error={save.error ?? remove.error} />
    </Card>
  );
}

function MaterialsCard({
  orgId,
  rows,
  admin,
}: {
  orgId: string;
  rows: MaterialDto[];
  admin: boolean;
}) {
  const blank = {
    name: "",
    basis: "per_lb",
    perLb: "",
    density: "",
    thickness: "",
    stock: "",
    stockDesc: "",
    scrap: "",
    min: "",
  };
  const [f, setF] = useState(blank);
  const add = useSave(
    orgId,
    () =>
      api(orgApi(orgId, "/rate-card/materials"), {
        method: "POST",
        body: {
          name: f.name,
          pricingBasis: f.basis,
          pricePerLbCents: f.basis === "per_lb" ? toCents(f.perLb) : null,
          densityLbPerIn3: f.basis === "per_lb" && Number(f.density) > 0 ? Number(f.density) : null,
          sheetThicknessIn:
            f.basis === "per_lb" && Number(f.thickness) > 0 ? Number(f.thickness) : null,
          stockPriceCents: f.basis === "per_stock" ? toCents(f.stock) : null,
          stockDescription: f.stockDesc.trim() || null,
          scrapBps: Math.round((Number(f.scrap) || 0) * 100),
          minChargeCents: toCents(f.min) ?? 0,
        },
      }),
    () => setF(blank),
  );
  return (
    <Card title="Materials">
      <table className="mb-3 w-full text-sm">
        <thead className="text-left text-stone-500">
          <tr>
            <th>Name</th>
            <th>Priced</th>
            <th className="text-right">Scrap</th>
            <th className="text-right">Minimum</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr
              key={m.id}
              className={
                m.active ? "border-t border-stone-100" : "border-t border-stone-100 text-stone-400"
              }
            >
              <td className="py-1">
                {m.name} {!m.active && <Badge>retired</Badge>}
              </td>
              <td>
                {m.pricingBasis === "per_lb"
                  ? `${money(m.pricePerLbCents)}/lb${m.densityLbPerIn3 ? `, ${m.densityLbPerIn3} lb/in³` : ""}${m.sheetThicknessIn ? `, ${m.sheetThicknessIn} in sheet` : ""}`
                  : `${money(m.stockPriceCents)} per ${m.stockDescription ?? "stock piece"}`}
              </td>
              <td className="text-right">{pct(m.scrapBps)}</td>
              <td className="text-right">{money(m.minChargeCents)}</td>
              <td className="text-right">
                {admin && m.active && <RetireButton orgId={orgId} kind="materials" id={m.id} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {admin && (
        <form
          className="grid items-end gap-2 md:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate(undefined);
          }}
        >
          <Field label="Name" hint="Include the grade, e.g. 6061-T6 plate">
            <Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Priced">
            <Select value={f.basis} onChange={(e) => setF({ ...f, basis: e.target.value })}>
              <option value="per_lb">by weight ($/lb)</option>
              <option value="per_stock">by stock piece</option>
            </Select>
          </Field>
          {f.basis === "per_lb" ? (
            <>
              <Field label="$/lb">
                <Input
                  required
                  inputMode="decimal"
                  value={f.perLb}
                  onChange={(e) => setF({ ...f, perLb: e.target.value })}
                />
              </Field>
              <Field label="Density lb/in³" hint="Al 6061 0.0975, steel 0.284">
                <Input
                  inputMode="decimal"
                  value={f.density}
                  onChange={(e) => setF({ ...f, density: e.target.value })}
                />
              </Field>
              <Field
                label="Sheet thickness (in)"
                hint="Sheet or plate only: a DXF flat pattern then sizes the blank"
              >
                <Input
                  inputMode="decimal"
                  value={f.thickness}
                  onChange={(e) => setF({ ...f, thickness: e.target.value })}
                />
              </Field>
              <Field label="Scrap %">
                <Input
                  inputMode="decimal"
                  value={f.scrap}
                  onChange={(e) => setF({ ...f, scrap: e.target.value })}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="$ per piece">
                <Input
                  required
                  inputMode="decimal"
                  value={f.stock}
                  onChange={(e) => setF({ ...f, stock: e.target.value })}
                />
              </Field>
              <Field label="Stock size">
                <Input
                  placeholder="0.75 in round x 12 ft"
                  value={f.stockDesc}
                  onChange={(e) => setF({ ...f, stockDesc: e.target.value })}
                />
              </Field>
            </>
          )}
          <Field label="Minimum charge $">
            <Input
              inputMode="decimal"
              value={f.min}
              onChange={(e) => setF({ ...f, min: e.target.value })}
            />
          </Field>
          <Button type="submit" disabled={add.isPending}>
            Add material
          </Button>
        </form>
      )}
      <ErrorText error={add.error} />
    </Card>
  );
}

function FinishingCard({
  orgId,
  rows,
  admin,
}: {
  orgId: string;
  rows: FinishingOpDto[];
  admin: boolean;
}) {
  const blank = { name: "", perPart: "", lot: "", outside: true, lead: "" };
  const [f, setF] = useState(blank);
  const add = useSave(
    orgId,
    () =>
      api(orgApi(orgId, "/rate-card/finishing-ops"), {
        method: "POST",
        body: {
          name: f.name,
          perPartCents: toCents(f.perPart) ?? 0,
          lotChargeCents: toCents(f.lot) ?? 0,
          outsideService: f.outside,
          leadDays: f.lead ? Number(f.lead) : null,
        },
      }),
    () => setF(blank),
  );
  return (
    <Card title="Finishing and outside services">
      <table className="mb-3 w-full text-sm">
        <thead className="text-left text-stone-500">
          <tr>
            <th>Name</th>
            <th className="text-right">Per part</th>
            <th className="text-right">Lot minimum</th>
            <th>Type</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr
              key={o.id}
              className={
                o.active ? "border-t border-stone-100" : "border-t border-stone-100 text-stone-400"
              }
            >
              <td className="py-1">
                {o.name} {!o.active && <Badge>retired</Badge>}
              </td>
              <td className="text-right">{money(o.perPartCents)}</td>
              <td className="text-right">{money(o.lotChargeCents)}</td>
              <td>
                {o.outsideService ? "outside" : "in-house"}
                {o.leadDays != null ? `, ${o.leadDays} d` : ""}
              </td>
              <td className="text-right">
                {admin && o.active && <RetireButton orgId={orgId} kind="finishing-ops" id={o.id} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {admin && (
        <form
          className="grid items-end gap-2 md:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate(undefined);
          }}
        >
          <Field label="Name">
            <Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="$ per part">
            <Input
              inputMode="decimal"
              value={f.perPart}
              onChange={(e) => setF({ ...f, perPart: e.target.value })}
            />
          </Field>
          <Field label="Lot minimum $">
            <Input
              inputMode="decimal"
              value={f.lot}
              onChange={(e) => setF({ ...f, lot: e.target.value })}
            />
          </Field>
          <Field label="Lead days">
            <Input
              inputMode="numeric"
              value={f.lead}
              onChange={(e) => setF({ ...f, lead: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={f.outside}
              onChange={(e) => setF({ ...f, outside: e.target.checked })}
            />{" "}
            Outside service
          </label>
          <Button type="submit" disabled={add.isPending}>
            Add finish
          </Button>
        </form>
      )}
      <ErrorText error={add.error} />
    </Card>
  );
}
