// The receipts on one expense (shared/receipts.ts): list, download, add and delete. The file goes up as
// the request body with its name in the query; the browser checks the type and size first so a wrong
// file is named before it is sent, and the worker checks both again plus the file's first bytes.
import {
  checkReceipt,
  MAX_RECEIPT_BYTES,
  MAX_RECEIPTS_PER_EXPENSE,
  megabytes,
  RECEIPT_ACCEPT,
} from "@shared/receipts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ApiError, api, orgPath } from "../lib/api";
import { apiUrl } from "../lib/base-path";

interface Receipt {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
}

async function uploadReceipt(orgId: string, expenseId: string, file: File): Promise<Receipt> {
  if (file.size > MAX_RECEIPT_BYTES) {
    throw new Error(
      `A receipt can be up to ${megabytes(MAX_RECEIPT_BYTES)}; ${file.name} is ${megabytes(file.size)}.`,
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkReceipt(file.name, bytes);
  if (!check.ok) throw new Error(check.reason);
  const res = await fetch(
    apiUrl(orgPath(orgId, `/expenses/${expenseId}/receipts?name=${encodeURIComponent(file.name)}`)),
    {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/octet-stream" },
      body: bytes,
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string };
  };
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data.error?.code ?? "http_error",
      data.error?.message ?? res.statusText,
    );
  }
  return data as unknown as Receipt;
}

export function ExpenseReceipts({
  orgId,
  expenseId,
  canEdit,
}: {
  orgId: string;
  expenseId: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["receipts", orgId, expenseId],
    queryFn: () => api<{ items: Receipt[] }>(orgPath(orgId, `/expenses/${expenseId}/receipts`)),
  });
  const add = useMutation({
    mutationFn: async (files: File[]) => {
      for (const f of files) await uploadReceipt(orgId, expenseId, f);
    },
    onMutate: () => setError(null),
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
    onSettled: () => {
      if (input.current) input.current.value = "";
      return qc
        .invalidateQueries({ queryKey: ["receipts", orgId] })
        .then(() => qc.invalidateQueries({ queryKey: ["expenses", orgId] }));
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api(orgPath(orgId, `/expenses/${expenseId}/receipts/${id}`), { method: "DELETE" }),
    onSettled: () =>
      qc
        .invalidateQueries({ queryKey: ["receipts", orgId] })
        .then(() => qc.invalidateQueries({ queryKey: ["expenses", orgId] })),
  });
  const items = list.data?.items ?? [];
  const full = items.length >= MAX_RECEIPTS_PER_EXPENSE;
  return (
    <div className="space-y-2 text-sm">
      {items.length === 0 && !list.isLoading && (
        <p className="text-stone-600">No receipt on this expense yet.</p>
      )}
      <ul className="space-y-1">
        {items.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2">
            <a
              className="underline"
              href={apiUrl(orgPath(orgId, `/expenses/${expenseId}/receipts/${r.id}`))}
            >
              {r.fileName}
            </a>
            <span className="text-xs text-stone-500">{megabytes(r.size)}</span>
            {canEdit && (
              <button
                type="button"
                className="text-xs text-red-700 underline"
                disabled={remove.isPending}
                onClick={() => remove.mutate(r.id)}
              >
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && !full && (
        <label className="inline-flex items-center gap-2">
          <span className="btn">{add.isPending ? "Uploading…" : "Add receipt"}</span>
          <input
            ref={input}
            className="sr-only"
            type="file"
            accept={RECEIPT_ACCEPT}
            multiple
            disabled={add.isPending}
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              if (files.length > 0) add.mutate(files);
            }}
          />
          <span className="text-xs text-stone-500">
            PDF or photo (JPEG, PNG, WebP, HEIC), up to {megabytes(MAX_RECEIPT_BYTES)}
          </span>
        </label>
      )}
      {full && (
        <p className="text-xs text-stone-500">
          {MAX_RECEIPTS_PER_EXPENSE} receipts is the most one expense can carry.
        </p>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
