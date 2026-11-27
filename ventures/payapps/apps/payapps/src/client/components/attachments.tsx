// Files attached to one pay application (the backup a GC asks for: stored-material invoices,
// certified payroll, insurance certificates; job photos; the signed application that comes back) or
// to one change order (pricing backup, photos of the condition, the signed change order), a notice
// given, an RFI (marked-up sheets, photos, the response), a submittal revision (product data, shop
// drawings, sample photos, the stamped copy returned), a daily report (the day's photos, delivery
// tickets, inspection reports), a T&M ticket (photos of the extra work, material receipts, a scan of
// the paper-signed ticket), a close-out document (the document as sent, photos, the GC's
// receipt), one of the company's insurance certificates (the certificate PDF, its endorsements) or
// one of its company documents (the license card, the bonding letter, a signed W-9).
// The browser checks type and size first (src/shared/attachments.ts); the Worker checks again.
import {
  ACCEPT_ATTRIBUTE,
  ATTACHMENT_CATEGORIES,
  type AttachmentCategory,
  attachmentProblem,
  CA_NOTICE_CATEGORY_LABELS,
  CAMERA_ACCEPT,
  CATEGORY_LABELS,
  CHANGE_ORDER_CATEGORY_LABELS,
  CLOSEOUT_CATEGORY_LABELS,
  COMPANY_DOCUMENT_CATEGORY_LABELS,
  cameraPhotoName,
  DAILY_REPORT_CATEGORY_LABELS,
  formatBytes,
  INSURANCE_CATEGORY_LABELS,
  MAX_ATTACHMENTS_PER_CERTIFICATE,
  MAX_ATTACHMENTS_PER_CHANGE_ORDER,
  MAX_ATTACHMENTS_PER_CLOSEOUT_ITEM,
  MAX_ATTACHMENTS_PER_COMPANY_DOCUMENT,
  MAX_ATTACHMENTS_PER_DAILY_REPORT,
  MAX_ATTACHMENTS_PER_NOTICE,
  MAX_ATTACHMENTS_PER_PAY_APP,
  MAX_ATTACHMENTS_PER_RFI,
  MAX_ATTACHMENTS_PER_SUBMITTAL,
  MAX_ATTACHMENTS_PER_TM_TICKET,
  packetTypeProblem,
  RFI_CATEGORY_LABELS,
  SUBMITTAL_CATEGORY_LABELS,
  TM_TICKET_CATEGORY_LABELS,
} from "@shared/attachments";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ApiError, api } from "../lib/api";
import { packetReadyPhoto } from "../lib/packet-photo";
import { ErrorText } from "./error";

interface AttachmentItem {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  category: AttachmentCategory;
  createdAt: string;
}

interface AttachmentList {
  items: AttachmentItem[];
  storage: { usedBytes: number; limitBytes: number };
  enabled: boolean;
}

/** Where the "Make large photos smaller" choice is remembered in this browser. */
const SHRINK_KEY = "payapps.shrinkPhotos";

/** On unless this browser was told otherwise; storage that throws (private mode) means on. */
function shrinkPreference(): boolean {
  try {
    return globalThis.localStorage?.getItem(SHRINK_KEY) !== "off";
  } catch {
    return true;
  }
}

function rememberShrink(on: boolean) {
  try {
    globalThis.localStorage?.setItem(SHRINK_KEY, on ? "on" : "off");
  } catch {
    // Not remembered; the choice still holds while the page is open.
  }
}

/**
 * fetch() for the multipart upload: api() sends JSON only. `extra` adds form fields (a pay-app file
 * filed on a lower-tier waiver row sends `lowerTierWaiverId`).
 */
export async function uploadFile(
  base: string,
  file: File,
  category: AttachmentCategory,
  extra: Record<string, string> = {},
) {
  const form = new FormData();
  form.set("file", file);
  form.set("category", category);
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  const res = await fetch(`${base}/attachments`, {
    method: "POST",
    body: form,
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiError(
      res.status,
      body?.error?.code ?? "http_error",
      body?.error?.message ?? res.statusText,
    );
  }
}

const PACKET_ORDER: AttachmentCategory[] = ["backup", "photo", "other", "signed"];

/** In the packet unless picked otherwise: every PDF or JPEG/PNG photo but the signed application. */
const packetDefault = (a: AttachmentItem) =>
  a.category !== "signed" && packetTypeProblem(a.contentType) === null;

/**
 * The packet's file list. Without an `order` it is the server's default (backup, photos, other,
 * then a signed copy if picked; oldest first within each). With one (the files as the user arranged
 * them), the ticked files go in that order, and any ticked file the order does not name yet (just
 * ticked or just uploaded) follows in the default order. Items arrive newest first.
 */
export function packetIds(
  items: AttachmentItem[],
  picked: Record<string, boolean>,
  order: readonly string[] | null = null,
): string[] {
  const oldestFirst = [...items].sort((x, y) => x.createdAt.localeCompare(y.createdAt));
  const included = PACKET_ORDER.flatMap((c) =>
    oldestFirst.filter(
      (a) =>
        a.category === c &&
        packetTypeProblem(a.contentType) === null &&
        (picked[a.id] ?? packetDefault(a)),
    ),
  ).map((a) => a.id);
  if (!order) return included;
  const wanted = new Set(included);
  const arranged = [...new Set(order)].filter((id) => wanted.has(id));
  const placed = new Set(arranged);
  return [...arranged, ...included.filter((id) => !placed.has(id))];
}

/** `ids` with the entry at `from` moved to `to` (both clamped to the list). */
export function moveId(ids: readonly string[], from: number, to: number): string[] {
  const out = [...ids];
  if (from < 0 || from >= out.length) return out;
  const [id] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(to, out.length)), 0, id as string);
  return out;
}

const HOLDERS = {
  payApp: {
    labels: CATEGORY_LABELS,
    limit: { max: MAX_ATTACHMENTS_PER_PAY_APP, noun: "pay application" },
    intro:
      "Keep the backup with the application it supports: invoices for stored materials, certified " +
      "payroll, insurance certificates, photos of the work and the signed application the GC sends " +
      "back. Files are private to your company.",
  },
  changeOrder: {
    labels: CHANGE_ORDER_CATEGORY_LABELS,
    limit: { max: MAX_ATTACHMENTS_PER_CHANGE_ORDER, noun: "change order" },
    intro:
      "Keep what supports the price with the change order: supplier quotes, T&M tickets, invoices " +
      "and photos of the condition. The request PDF lists these files as backup attached (not the " +
      "signed copy), so attach them before you download it. Files are private to your company.",
  },
  caNotice: {
    labels: CA_NOTICE_CATEGORY_LABELS,
    limit: { max: MAX_ATTACHMENTS_PER_NOTICE, noun: "notice" },
    intro:
      "For a mailed notice, Cal. Civ. Code § 8118(b) says the proof of notice goes with the post " +
      "office's or carrier's receipt for the mailing, or a return receipt, tracking record or the " +
      "returned envelope. Keep a photo or scan of it here with the signed proof, so the whole record " +
      "is in one place if you record a lien. Files are private to your company.",
  },
  rfi: {
    labels: RFI_CATEGORY_LABELS,
    limit: { max: MAX_ATTACHMENTS_PER_RFI, noun: "RFI" },
    intro:
      "Keep the marked-up sheet or detail and photos of the condition with the RFI, and the " +
      "response when it comes back (a sketch or ASI). The RFI PDF lists the files sent with it, and " +
      '"PDF + files" puts them in one PDF for the GC (not the response). Files are private to ' +
      "your company.",
  },
  insurance: {
    labels: INSURANCE_CATEGORY_LABELS,
    limit: { max: MAX_ATTACHMENTS_PER_CERTIFICATE, noun: "certificate" },
    intro:
      "Keep the certificate your agent sent (usually an ACORD 25) and any endorsements the " +
      "subcontract asks for with it. A draft pay application offers these files for its backup. " +
      "Files are private to your company.",
  },
  companyDocument: {
    labels: COMPANY_DOCUMENT_CATEGORY_LABELS,
    limit: { max: MAX_ATTACHMENTS_PER_COMPANY_DOCUMENT, noun: "document" },
    intro:
      "Keep the document itself with its record: the license card or the board's printout, the " +
      "surety's bonding letter, the EMR letter. A draft pay application offers these files for its " +
      "backup. Files are private to your company.",
  },
  submittal: {
    labels: SUBMITTAL_CATEGORY_LABELS,
    limit: { max: MAX_ATTACHMENTS_PER_SUBMITTAL, noun: "submittal" },
    intro:
      "Keep what you send the reviewer with the submittal: product data sheets, shop drawings, " +
      "calculations and photos of a sample, and the stamped copy that comes back. The transmittal " +
      'lists these files as enclosed (not the returned copy), and "With files" puts them behind ' +
      "it in one PDF. Files are private to your company.",
  },
  dailyReport: {
    labels: DAILY_REPORT_CATEGORY_LABELS,
    limit: { max: MAX_ATTACHMENTS_PER_DAILY_REPORT, noun: "daily report" },
    intro:
      "Keep the day's photos with its report, and the delivery tickets and inspection reports " +
      'from that day. "PDF + photos" puts the report and these files in one PDF for the GC (not a ' +
      "signed copy of the report). Files are private to your company.",
  },
  tmTicket: {
    labels: TM_TICKET_CATEGORY_LABELS,
    limit: { max: MAX_ATTACHMENTS_PER_TM_TICKET, noun: "T&M ticket" },
    intro:
      "Keep photos of the extra work with its ticket (before, during and after), the receipts or " +
      "delivery tickets for the material on it, and a scan of the ticket if the GC signed a paper " +
      'copy. "PDF + photos" puts the priced ticket and every one of these files in one PDF for the ' +
      "GC, and the change order's backup can carry them too. Files are private to your company.",
  },
  closeout: {
    labels: CLOSEOUT_CATEGORY_LABELS,
    limit: { max: MAX_ATTACHMENTS_PER_CLOSEOUT_ITEM, noun: "close-out document" },
    intro:
      "Keep the document as you sent it (the warranty letter, the O&M manual, the as-built set) " +
      "and photos such as attic stock delivered, and the GC's receipt when it comes back. The " +
      "close-out binder puts these files behind one transmittal (not the receipt). Files are " +
      "private to your company.",
  },
} as const;

export function AttachmentsPanel(props: {
  base: string;
  /** What the files belong to: a pay application (default), a change order or a notice given. */
  holder?: keyof typeof HOLDERS;
  /** Inside another card (a change order row): no card frame, smaller heading. */
  embedded?: boolean;
  /** Called after a file is added or deleted (the holder's own list shows a count). */
  onChanged?: () => unknown;
  /** Extra multipart fields sent with every upload (a W-9's consent to keep the tax ID). */
  uploadFields?: Record<string, string>;
}) {
  const { base } = props;
  const holder = HOLDERS[props.holder ?? "payApp"];
  const qc = useQueryClient();
  const key = ["attachments", base];
  const list = useQuery({
    queryKey: key,
    queryFn: () => api<AttachmentList>(`${base}/attachments`),
  });
  // Daily report and T&M ticket files are mostly photos; everything else starts on backup.
  const [category, setCategory] = useState<AttachmentCategory>(
    props.holder === "dailyReport" || props.holder === "tmTicket" ? "photo" : "backup",
  );
  const [progress, setProgress] = useState("");
  // What the last upload converted (HEIC or WebP photos made JPEG for the packet), shown after it.
  const [converted, setConverted] = useState<string[]>([]);
  // Shrink large photos before upload (Attachments part 3); remembered per browser.
  const [shrink, setShrink] = useState(shrinkPreference);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  // The packet order as the user arranged it; null keeps the default (backup, photos, other).
  const [order, setOrder] = useState<string[] | null>(null);
  const packet = (props.holder ?? "payApp") === "payApp";
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  const add = useMutation({
    mutationFn: async ({ files: picked, as }: { files: File[]; as: AttachmentCategory }) => {
      const data = list.data;
      if (!data) throw new Error(`Still loading the files on this ${holder.limit.noun}`);
      setConverted([]);
      // HEIC and WebP photos become JPEGs here when the browser can read them, so they fit the
      // packet, and large JPEGs are shrunk unless turned off; the size and storage checks below
      // then apply to what is actually sent.
      const files: File[] = [];
      const notes: string[] = [];
      for (const f of picked) {
        const r = await packetReadyPhoto(f, { shrink });
        files.push(r.file);
        if (r.note) notes.push(r.note);
      }
      let used = data.storage.usedBytes;
      let count = data.items.length;
      // Check every file before sending any, so a bad one does not leave half a batch uploaded.
      for (const f of files) {
        const problem = attachmentProblem(
          { name: f.name, sizeBytes: f.size },
          count,
          { usedBytes: used, limitBytes: data.storage.limitBytes },
          holder.limit,
        );
        if (problem) throw new Error(problem);
        used += f.size;
        count += 1;
      }
      for (const [i, f] of files.entries()) {
        setProgress(`Uploading ${i + 1} of ${files.length}: ${f.name}`);
        await uploadFile(base, f, as, props.uploadFields);
      }
      setConverted(notes);
    },
    onSettled: () => {
      setProgress("");
      if (input.current) input.current.value = "";
      if (camera.current) camera.current.value = "";
      props.onChanged?.();
      return qc.invalidateQueries({ queryKey: key });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`${base}/attachments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      props.onChanged?.();
      return qc.invalidateQueries({ queryKey: key });
    },
  });

  const data = list.data;
  return (
    <section className={props.embedded ? "max-w-2xl" : "card max-w-2xl"}>
      {props.embedded ? (
        <h3 className="mb-1 text-sm font-semibold">Files</h3>
      ) : (
        <h2 className="mb-1 font-semibold">Attachments</h2>
      )}
      <p className="mb-2 text-sm text-slate-600">{holder.intro}</p>
      {list.isLoading && <p className="text-sm text-slate-500">Loading files…</p>}
      {data && data.items.length > 0 && (
        <table className="mb-3 w-full">
          <thead>
            <tr>
              <th className="th">File</th>
              <th className="th">Kind</th>
              <th className="th text-right">Size</th>
              {packet && <th className="th text-center">In packet</th>}
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {data.items.map((a) => (
              <tr key={a.id}>
                <td className="td break-all">
                  <a className="underline" href={`${base}/attachments/${a.id}`}>
                    {a.fileName}
                  </a>
                </td>
                <td className="td text-sm">{holder.labels[a.category].split(" (")[0]}</td>
                <td className="td text-right tabular-nums text-sm">{formatBytes(a.sizeBytes)}</td>
                {packet && (
                  <td className="td text-center">
                    {packetTypeProblem(a.contentType) === null ? (
                      <input
                        type="checkbox"
                        aria-label={`Include ${a.fileName} in the packet`}
                        checked={picked[a.id] ?? packetDefault(a)}
                        onChange={(e) => setPicked({ ...picked, [a.id]: e.target.checked })}
                      />
                    ) : (
                      <span
                        className="text-xs text-slate-500"
                        title={packetTypeProblem(a.contentType) ?? ""}
                      >
                        Send separately
                      </span>
                    )}
                  </td>
                )}
                <td className="td text-right">
                  <button
                    type="button"
                    className="text-sm text-red-700 underline"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete ${a.fileName}?`)) remove.mutate(a.id);
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {packet && data && data.items.length > 0 && (
        <PacketLink
          base={base}
          ids={packetIds(data.items, picked, order)}
          items={data.items}
          arranged={order !== null}
          onArrange={setOrder}
        />
      )}
      {data && data.items.length === 0 && (
        <p className="mb-2 text-sm text-slate-500">No files attached yet.</p>
      )}
      {data && !data.enabled && (
        <p className="mb-2 text-sm text-amber-800">
          File storage is not set up on this deployment yet, so files cannot be added.
        </p>
      )}
      {data?.enabled && (
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-sm">
            <span className="text-slate-600">Kind</span>
            <select
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value as AttachmentCategory)}
            >
              {ATTACHMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {holder.labels[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-slate-600">Add files</span>
            <input
              ref={input}
              type="file"
              multiple
              accept={ACCEPT_ATTRIBUTE}
              className="input"
              disabled={add.isPending}
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                if (files.length) add.mutate({ files, as: category });
              }}
            />
          </label>
          <label className="text-sm sm:col-span-3">
            <span className="btn-secondary inline-flex cursor-pointer">Take a photo</span>
            <input
              ref={camera}
              type="file"
              accept={CAMERA_ACCEPT}
              capture="environment"
              className="sr-only"
              aria-label="Take a photo"
              disabled={add.isPending}
              onChange={(e) => {
                const shot = e.target.files?.[0];
                if (!shot) return;
                // Saved as a photo whatever the Kind list says, named by when it was taken.
                const named = new File([shot], cameraPhotoName(shot), {
                  type: shot.type,
                  lastModified: shot.lastModified,
                });
                add.mutate({ files: [named], as: "photo" });
              }}
            />
            <span className="ml-2 text-xs text-slate-500">
              On a phone this opens the camera; the picture is saved as a{" "}
              {holder.labels.photo.toLowerCase()}, named by when it was taken.
            </span>
          </label>
          <label className="text-sm sm:col-span-3">
            <input
              type="checkbox"
              className="mr-2"
              checked={shrink}
              disabled={add.isPending}
              onChange={(e) => {
                setShrink(e.target.checked);
                rememberShrink(e.target.checked);
              }}
            />
            Make large photos smaller before upload
            <span className="ml-2 text-xs text-slate-500">
              JPEG photos over 1 MB are resized to 2560 pixels on the long side (sharp on a printed
              page, usually under 1 MB) and keep the time they were taken; location and camera
              details are left out. Untick to send photos at full size.
            </span>
          </label>
          <p className="text-xs text-slate-500 sm:col-span-3">
            PDF, photos (JPEG, PNG, HEIC, WebP), spreadsheets, Word documents or text, up to 15 MB
            each. HEIC and WebP photos are converted to JPEG on upload when this browser can read
            them (Safari reads HEIC), so they go in the PDF packet.{" "}
            {formatBytes(data.storage.usedBytes)} of {formatBytes(data.storage.limitBytes)} used on
            your plan.
          </p>
        </div>
      )}
      {progress && <p className="text-sm text-slate-600">{progress}</p>}
      {converted.length > 0 && (
        <ul className="text-sm text-slate-600" aria-label="Converted photos">
          {converted.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <ErrorText error={list.error ?? add.error ?? remove.error} />
    </section>
  );
}

/** The one-PDF download: the application, an index, then the files ticked "In packet". */
function PacketLink(props: {
  base: string;
  ids: string[];
  items: AttachmentItem[];
  /** True once the user has moved a file (the reset link shows). */
  arranged: boolean;
  /** The new order, or null for the default. */
  onArrange: (ids: string[] | null) => void;
}) {
  const { ids, onArrange } = props;
  const left = props.items.filter((a) => packetTypeProblem(a.contentType) !== null);
  const href = `${props.base}/packet.pdf?files=${encodeURIComponent(ids.join(","))}`;
  const byId = new Map(props.items.map((a) => [a.id, a]));
  const [dragging, setDragging] = useState<number | null>(null);
  const move = (from: number, to: number) => onArrange(moveId(ids, from, to));
  return (
    <div className="mb-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
      {ids.length > 1 && (
        <div className="mb-3">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <h3 className="font-semibold">Packet order</h3>
            {props.arranged && (
              <button type="button" className="text-xs underline" onClick={() => onArrange(null)}>
                Back to the usual order
              </button>
            )}
          </div>
          <p className="mb-1 text-xs text-slate-500">
            Drag a file, or use the arrows, to put the backup in the order the GC asks for. The
            index page lists them in this order.
          </p>
          <ol className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
            {ids.map((id, i) => {
              const a = byId.get(id);
              const name = a?.fileName ?? id;
              return (
                <li
                  key={id}
                  draggable
                  onDragStart={(e) => {
                    setDragging(i);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", id);
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragging !== null && dragging !== i) move(dragging, i);
                    setDragging(null);
                  }}
                  onDragEnd={() => setDragging(null)}
                  className={`flex cursor-move items-center gap-2 px-2 py-1 ${dragging === i ? "opacity-50" : ""}`}
                >
                  <span className="w-6 text-right tabular-nums text-slate-500">{i + 1}.</span>
                  <span className="flex-1 break-all">{name}</span>
                  <button
                    type="button"
                    className="rounded px-2 py-1 text-slate-700 hover:bg-slate-100 disabled:opacity-30"
                    aria-label={`Move ${name} up`}
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="rounded px-2 py-1 text-slate-700 hover:bg-slate-100 disabled:opacity-30"
                    aria-label={`Move ${name} down`}
                    disabled={i === ids.length - 1}
                    onClick={() => move(i, i + 1)}
                  >
                    ↓
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      <a className="btn-secondary" href={href}>
        Download application + backup (one PDF)
      </a>
      <p className="mt-2 text-slate-600">
        The application, an index page, then the {ids.length} file
        {ids.length === 1 ? "" : "s"} ticked above{ids.length > 1 ? " in the order shown" : ""},
        every page numbered, ready to send the GC. PDFs go in page for page and photos one to a
        page.
        {left.length > 0 &&
          ` ${left.length} file${left.length === 1 ? " is" : "s are"} not a PDF or JPEG/PNG photo and ${left.length === 1 ? "is" : "are"} listed on the index to send separately.`}
      </p>
    </div>
  );
}
