// Mileage log and expenses.
import { EXPENSE_CATEGORIES, PLATFORM_LABELS, type Platform, SALE_CHANNELS } from "@shared/enums";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MileageImport } from "../components/mileage-import";
import { StatementImport } from "../components/statement-import";
import { api, dollarsToCents, orgPath, today, usd } from "../lib/api";
import { useOrgId } from "./org";
import { ErrorText } from "./public";

interface Trip {
  id: string;
  date: string;
  purpose: string;
  startPlace: string | null;
  endPlace: string | null;
  milesTenths: number;
  roundTrip: boolean;
}

export function MileagePage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const year = new Date().getFullYear();
  const trips = useQuery({
    queryKey: ["mileage", orgId, year],
    queryFn: () =>
      api<{ items: Trip[]; totalMiles: number; trips: number }>(
        orgPath(orgId, `/mileage?from=${year}-01-01&to=${year}-12-31&limit=500`),
      ),
  });
  const [t, setT] = useState({
    date: today(),
    purpose: "",
    startPlace: "",
    endPlace: "",
    miles: "",
    roundTrip: false,
  });
  const add = useMutation({
    mutationFn: () =>
      api(orgPath(orgId, "/mileage"), {
        method: "POST",
        body: {
          ...t,
          miles: Number(t.miles),
          startPlace: t.startPlace || null,
          endPlace: t.endPlace || null,
        },
      }),
    onSuccess: () => {
      setT({ ...t, purpose: "", miles: "" });
      return qc.invalidateQueries();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(orgPath(orgId, `/mileage/${id}`), { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries(),
  });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Mileage log</h1>
      <p className="text-sm text-stone-600">
        Log business trips when you make them: sourcing runs, post office drops, supply shopping.
        Record the date, purpose and miles; the IRS expects a contemporaneous record.
      </p>
      <MileageImport orgId={orgId} />
      <form
        className="card grid gap-2 md:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <input
          className="input"
          type="date"
          required
          value={t.date}
          onChange={(e) => setT({ ...t, date: e.target.value })}
        />
        <input
          className="input md:col-span-2"
          placeholder="Purpose"
          required
          value={t.purpose}
          onChange={(e) => setT({ ...t, purpose: e.target.value })}
        />
        <input
          className="input"
          placeholder="From"
          value={t.startPlace}
          onChange={(e) => setT({ ...t, startPlace: e.target.value })}
        />
        <input
          className="input"
          placeholder="To"
          value={t.endPlace}
          onChange={(e) => setT({ ...t, endPlace: e.target.value })}
        />
        <input
          className="input"
          placeholder="Miles"
          inputMode="decimal"
          required
          value={t.miles}
          onChange={(e) => setT({ ...t, miles: e.target.value })}
        />
        <label className="text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={t.roundTrip}
            onChange={(e) => setT({ ...t, roundTrip: e.target.checked })}
          />{" "}
          Round trip (counts the miles twice)
        </label>
        <button className="btn md:col-start-6" type="submit" disabled={add.isPending}>
          Add trip
        </button>
        <ErrorText error={add.error} />
      </form>
      <section className="card overflow-x-auto">
        <h2 className="mb-2 font-medium">
          {year}: {trips.data?.trips ?? 0} trips, {(trips.data?.totalMiles ?? 0).toFixed(1)}{" "}
          business miles
        </h2>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Purpose</th>
              <th>Route</th>
              <th className="num">Miles</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {trips.data?.items.map((r) => (
              <tr key={r.id}>
                <td>{r.date}</td>
                <td>{r.purpose}</td>
                <td>{[r.startPlace, r.endPlace].filter(Boolean).join(" → ")}</td>
                <td className="num">
                  {(r.milesTenths / 10).toFixed(1)}
                  {r.roundTrip && " ×2"}
                </td>
                <td>
                  <button
                    type="button"
                    className="text-xs text-red-700 underline"
                    onClick={() => remove.mutate(r.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

interface Expense {
  id: string;
  date: string;
  category: string;
  amountCents: number;
  vendor: string | null;
  memo: string | null;
  platform: string | null;
}

export function ExpensesPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["expenses", orgId],
    queryFn: () => api<{ items: Expense[] }>(orgPath(orgId, "/expenses?limit=500")),
  });
  const [x, setX] = useState({
    date: today(),
    category: "supplies",
    amount: "",
    vendor: "",
    memo: "",
    platform: "",
  });
  const add = useMutation({
    mutationFn: () =>
      api(orgPath(orgId, "/expenses"), {
        method: "POST",
        body: {
          date: x.date,
          category: x.category,
          amountCents: dollarsToCents(x.amount),
          vendor: x.vendor || null,
          memo: x.memo || null,
          platform: x.platform || null,
        },
      }),
    onSuccess: () => {
      setX({ ...x, amount: "", vendor: "", memo: "" });
      return qc.invalidateQueries();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(orgPath(orgId, `/expenses/${id}`), { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries(),
  });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Expenses</h1>
      <p className="text-sm text-stone-600">
        Costs that are not in your marketplace reports: packaging, supplies, software, a storage
        unit. Don't enter inventory purchases here (add them under Inventory) or fees already in an
        imported report.
      </p>
      <form
        className="card grid gap-2 md:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <input
          className="input"
          type="date"
          required
          value={x.date}
          onChange={(e) => setX({ ...x, date: e.target.value })}
        />
        <select
          className="input"
          value={x.category}
          onChange={(e) => setX({ ...x, category: e.target.value })}
        >
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <input
          className="input"
          placeholder="Amount"
          required
          value={x.amount}
          onChange={(e) => setX({ ...x, amount: e.target.value })}
        />
        <input
          className="input"
          placeholder="Vendor"
          value={x.vendor}
          onChange={(e) => setX({ ...x, vendor: e.target.value })}
        />
        <select
          className="input"
          value={x.platform}
          onChange={(e) => setX({ ...x, platform: e.target.value })}
        >
          <option value="">All platforms</option>
          {SALE_CHANNELS.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABELS[p]}
            </option>
          ))}
        </select>
        <button className="btn" type="submit" disabled={add.isPending}>
          Add
        </button>
        <input
          className="input md:col-span-6"
          placeholder="Memo"
          value={x.memo}
          onChange={(e) => setX({ ...x, memo: e.target.value })}
        />
        {x.category === "equipment" && (
          <p className="text-sm text-stone-600 md:col-span-6">
            Equipment is something you keep and use, not sell: a camera, label printer, shelving or
            a laptop. Enter each item as its own expense. At $2,500 or less an item it goes on line
            27a under the de minimis safe harbor (an election you attach to your return); over
            $2,500 it is depreciated on Form 4562 (line 13), which the worksheet leaves to your
            preparer.
          </p>
        )}
        <ErrorText error={add.error} />
      </form>
      <StatementImport orgId={orgId} />
      <section className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Vendor</th>
              <th>Platform</th>
              <th className="num">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.data?.items.map((e) => (
              <tr key={e.id}>
                <td>{e.date}</td>
                <td>{e.category.replace(/_/g, " ")}</td>
                <td>
                  {e.vendor}
                  {e.memo && <span className="ml-1 text-xs text-stone-500">{e.memo}</span>}
                </td>
                <td>{e.platform ? PLATFORM_LABELS[e.platform as Platform] : "—"}</td>
                <td className="num">{usd(e.amountCents)}</td>
                <td>
                  <button
                    type="button"
                    className="text-xs text-red-700 underline"
                    onClick={() => remove.mutate(e.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
