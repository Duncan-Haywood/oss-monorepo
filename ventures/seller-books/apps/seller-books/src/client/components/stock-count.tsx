// Stock count on the Inventory page: check the shelves against the books on a day (December 31 for line
// 41), tick what is there by hand, by scanning or typing a SKU, or from the count sheet filled in on paper
// or in a spreadsheet, then take the items not found out of inventory in one step (and undo it).
// Rules and sums: src/shared/stock-count.ts; server: routes/org/inventory.ts, "stock count".
import {
  type CountItem,
  type CountOutcome,
  countEffect,
  countSheetCsv,
  matchCode,
  readCountSheet,
  summariseCount,
} from "@shared/stock-count";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api, orgPath, today, usd } from "../lib/api";
import { count } from "../lib/count";
import { ErrorText } from "../routes/public";

/** Ticks survive a reload in this browser only (a count can take an afternoon); never needed. */
const storeKey = (orgId: string, asOf: string) => `seller-books:count:${orgId}:${asOf}`;
function loadTicks(orgId: string, asOf: string): Set<string> {
  try {
    const raw = localStorage.getItem(storeKey(orgId, asOf));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function saveTicks(orgId: string, asOf: string, ids: Set<string>) {
  try {
    if (ids.size) localStorage.setItem(storeKey(orgId, asOf), JSON.stringify([...ids]));
    else localStorage.removeItem(storeKey(orgId, asOf));
  } catch {
    // Private window or storage blocked: the count still works for this visit.
  }
}

function lastYearEnd(): string {
  return `${Number(today().slice(0, 4)) - 1}-12-31`;
}

export function StockCount({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [asOf, setAsOf] = useState(() => (today().slice(5) <= "04-15" ? lastYearEnd() : today()));
  const [found, setFound] = useState<Set<string>>(() => new Set());
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [sheetNotes, setSheetNotes] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [outcome, setOutcome] = useState<CountOutcome>("written_off");
  const [done, setDone] = useState<{ ids: string[]; cents: number; asOf: string } | null>(null);

  const data = useQuery({
    queryKey: ["stock-count", orgId, asOf],
    queryFn: () =>
      api<{ items: CountItem[]; truncated: boolean }>(
        orgPath(orgId, `/inventory/count?asOf=${asOf}`),
      ),
    enabled: open && /^\d{4}-\d{2}-\d{2}$/.test(asOf),
  });
  const items = data.data?.items ?? [];

  // Ticks belong to one shop and one count date; ticks of items no longer expected are dropped.
  useEffect(() => {
    setFound(loadTicks(orgId, asOf));
    setMessage(null);
    setSheetNotes([]);
  }, [orgId, asOf]);
  const live = useMemo(() => {
    const ids = new Set(items.map((i) => i.id));
    return new Set([...found].filter((id) => ids.has(id)));
  }, [found, items]);
  const update = (next: Set<string>) => {
    setFound(next);
    saveTicks(orgId, asOf, next);
  };
  const summary = summariseCount(items, live);

  const apply = useMutation({
    mutationFn: (ids: string[]) =>
      api<{ updated: number; costCents: number }>(orgPath(orgId, "/inventory/count"), {
        method: "POST",
        body: { asOf, outcome, missing: ids },
      }),
    onSuccess: (r, ids) => {
      setDone({ ids, cents: r.costCents, asOf });
      update(new Set());
      return qc.invalidateQueries();
    },
  });
  const undo = useMutation({
    mutationFn: (ids: string[]) =>
      api<{ updated: number }>(orgPath(orgId, "/inventory/count/undo"), {
        method: "POST",
        body: { ids },
      }),
    onSuccess: () => {
      setDone(null);
      return qc.invalidateQueries();
    },
  });

  const scan = () => {
    const r = matchCode(items, live, code);
    if (r.kind === "found") {
      update(new Set([...live, r.item.id]));
      setMessage(`Found: ${r.item.title}${r.item.sku ? ` (${r.item.sku})` : ""}`);
    } else if (r.kind === "already")
      setMessage(
        `Every item with SKU ${r.sku} is already ticked. Is this one a duplicate listing?`,
      );
    else setMessage(`No item in stock has SKU "${code.trim()}". Add it, or tick it by hand below.`);
    setCode("");
  };

  const download = () => {
    const blob = new Blob([countSheetCsv(items, live)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `stock-count-${asOf}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const readSheet = async (file: File) => {
    const r = readCountSheet(await file.text(), items);
    const next = new Set(live);
    for (const id of r.found) next.add(id);
    for (const id of r.notFound) next.delete(id);
    update(next);
    setSheetNotes([
      `${file.name}: ${count(r.found.length, "item")} marked found, ${r.notFound.length} not found, ${r.blank} left blank.`,
      ...r.problems,
    ]);
  };

  const f = filter.trim().toLowerCase();
  const shown = f
    ? items.filter((i) =>
        [i.title, i.sku, i.lotName, i.source].some((v) => v?.toLowerCase().includes(f)),
      )
    : items;

  if (!open)
    return (
      <section className="card flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-medium">Count your stock</h2>
          <p className="text-sm text-stone-600">
            Check the shelves against the books before the year end, so line 41 counts only what is
            really there. Items you cannot find come out in one step.
          </p>
        </div>
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          Start a count
        </button>
      </section>
    );

  return (
    <section className="card space-y-3" aria-label="Stock count">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="font-medium">Count your stock</h2>
        <button type="button" className="text-sm underline" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label>
          <span className="label">Count date</span>
          <input
            className="input block"
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
          />
        </label>
        <button type="button" className="text-sm underline" onClick={() => setAsOf(lastYearEnd())}>
          December 31, {lastYearEnd().slice(0, 4)}
        </button>
        <button type="button" className="text-sm underline" onClick={() => setAsOf(today())}>
          Today
        </button>
      </div>
      <p className="text-xs text-stone-500">
        The count lists the items still in stock that were bought on or before this date. Items sold
        since are not on it: they were not yours to count by the time you look.
      </p>
      <ErrorText error={data.error} />
      {data.data?.truncated && (
        <p className="text-sm text-accent-700">
          Only the first {items.length} items are on this count. Count a part at a time, oldest
          first.
        </p>
      )}

      {done && (
        <div className="rounded border border-stone-300 p-2 text-sm" role="status">
          {count(done.ids.length, "item")} ({usd(done.cents)}) taken out of inventory on {done.asOf}
          .{" "}
          <button
            type="button"
            className="underline"
            disabled={undo.isPending}
            onClick={() => undo.mutate(done.ids)}
          >
            Undo
          </button>
          <ErrorText error={undo.error} />
        </div>
      )}

      {data.data && items.length === 0 && (
        <p className="text-sm">
          No items in stock were bought on or before {asOf}: nothing to count.
        </p>
      )}

      {items.length > 0 && (
        <>
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <div className="text-stone-500">On the books</div>
              <div className="font-medium">
                {count(summary.expected, "item")}, {usd(summary.expectedCents)}
              </div>
            </div>
            <div>
              <div className="text-stone-500">Found</div>
              <div className="font-medium">
                {summary.found}, {usd(summary.foundCents)}
              </div>
            </div>
            <div>
              <div className="text-stone-500">Not found yet</div>
              <div className="font-medium">
                {summary.missing}, {usd(summary.missingCents)}
              </div>
            </div>
          </div>

          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              scan();
            }}
          >
            <input
              className="input flex-1"
              placeholder="Scan or type a SKU, then Enter"
              aria-label="Scan or type a SKU"
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button className="btn" type="submit">
              Tick
            </button>
          </form>
          {message && (
            <p className="text-sm" role="status">
              {message}
            </p>
          )}

          <div className="flex flex-wrap gap-3 text-sm">
            <button type="button" className="underline" onClick={download}>
              Download the count sheet (CSV)
            </button>
            <label className="cursor-pointer underline">
              Read a filled-in sheet
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void readSheet(file);
                  e.target.value = "";
                }}
              />
            </label>
            <button type="button" className="underline" onClick={() => update(new Set())}>
              Clear the ticks
            </button>
          </div>
          {sheetNotes.map((n) => (
            <p key={n} className="text-sm text-stone-600">
              {n}
            </p>
          ))}

          <input
            className="input"
            placeholder="Filter by title, SKU, lot or where bought"
            aria-label="Filter the count"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="max-h-96 overflow-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Found</th>
                  <th>Item</th>
                  <th>Bought</th>
                  <th className="num">Cost</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Found ${i.title}`}
                        checked={live.has(i.id)}
                        onChange={(e) => {
                          const next = new Set(live);
                          if (e.target.checked) next.add(i.id);
                          else next.delete(i.id);
                          update(next);
                        }}
                      />
                    </td>
                    <td>
                      {i.title}
                      {i.sku && <span className="ml-1 text-xs text-stone-500">{i.sku}</span>}
                      {i.lotName && (
                        <span className="ml-1 text-xs text-stone-500">· {i.lotName}</span>
                      )}
                    </td>
                    <td>{i.acquiredDate}</td>
                    <td className="num">{usd(i.costCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {summary.missing > 0 && summary.found > 0 && (
            <div className="space-y-2 rounded border border-stone-300 p-3">
              <h3 className="font-medium">
                Finish: {count(summary.missing, "item")} not found ({usd(summary.missingCents)})
              </h3>
              <label className="block">
                <span className="label">What happened to them</span>
                <select
                  className="input block"
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value as CountOutcome)}
                >
                  <option value="written_off">
                    Lost, damaged, thrown away or donated (write off)
                  </option>
                  <option value="personal_use">Kept for myself (personal use)</option>
                </select>
              </label>
              <p className="text-sm text-stone-600">
                {countEffect(asOf, outcome, summary.missingCents)} Check the list first: an item
                sold but never linked to its sale belongs on the Sales page, not here.
              </p>
              <button
                type="button"
                className="btn"
                disabled={apply.isPending}
                onClick={() => apply.mutate(summary.missingItems.map((i) => i.id))}
              >
                Take {count(summary.missing, "item")} out on {asOf}
              </button>
              <ErrorText error={apply.error} />
            </div>
          )}
          {summary.missing > 0 && summary.found === 0 && (
            <p className="text-sm text-stone-600">
              Tick what you find first. Nothing is taken out until you finish the count.
            </p>
          )}
        </>
      )}
    </section>
  );
}
