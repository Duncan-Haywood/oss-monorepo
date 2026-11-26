// RFQ inbox + intake (paste the email, attach drawings).

import { allowanceBanner, intakeNote, packageNote } from "@shared/allowance";
import type { BillingDto, InboundEmailDto, RfqDetailDto, RfqDto } from "@shared/api";
import { parseSenderList } from "@shared/sender-allowlist";
import { countPackage, type PackageCount } from "@shared/upload-pages";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  ErrorText,
  Field,
  Input,
  STATUS_TONE,
  Textarea,
} from "../components/ui";
import { api, orgApi, queryClient } from "../lib/api";
import { canAdmin, canEstimate, useOrg, useOrgId, useShopDay } from "./layout";

export function RfqsPage() {
  const orgId = useOrgId();
  const shopDayOf = useShopDay(orgId);
  const org = useOrg(orgId);
  const rfqs = useQuery({
    queryKey: ["rfqs", orgId],
    queryFn: () => api<{ items: RfqDto[] }>(orgApi(orgId, "/rfqs")),
  });
  return (
    <div className="flex flex-col gap-4">
      <AllowanceBanner orgId={orgId} admin={canAdmin(org.data?.role)} />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="flex flex-col gap-4">
          <InboundAddress orgId={orgId} admin={canAdmin(org.data?.role)} />
          {canEstimate(org.data?.role) && <NewRfq orgId={orgId} admin={canAdmin(org.data?.role)} />}
        </div>
        <Card title="RFQs">
          {rfqs.data?.items.length === 0 && <p className="text-sm text-stone-600">No RFQs yet.</p>}
          <ul className="divide-y divide-stone-100">
            {rfqs.data?.items.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <Link
                  to="/app/$orgId/rfqs/$rfqId"
                  params={{ orgId, rfqId: r.id }}
                  className="text-sky-800 underline"
                >
                  {r.subject || r.customerCompany || r.bodyText.slice(0, 60) || "Untitled RFQ"}
                </Link>
                <span className="flex items-center gap-2 text-stone-500">
                  {r.customerCompany && <span>{r.customerCompany}</span>}
                  {r.source === "email" && <Badge tone="sky">email</Badge>}
                  <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                  <span>{shopDayOf(r.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

/**
 * At 80% and 100% of the month's RFQ allowance, every member sees it here (owners and admins also
 * get one email, services/allowance-notice.ts). Same billing summary as the billing page, so the
 * query is shared; a failed read shows nothing rather than an error on the RFQ page.
 */
function useBilling(orgId: string) {
  return useQuery({
    queryKey: ["billing", orgId],
    queryFn: () => api<BillingDto>(orgApi(orgId, "/billing")),
  });
}

function AllowanceBanner({ orgId, admin }: { orgId: string; admin: boolean }) {
  const billing = useBilling(orgId);
  const banner = billing.data ? allowanceBanner(billing.data, admin) : null;
  if (!banner) return null;
  const full = banner.threshold === 100;
  return (
    <div
      role="status"
      className={`rounded border px-3 py-2 text-sm ${
        full
          ? "border-red-300 bg-red-50 text-red-900"
          : "border-amber-300 bg-amber-50 text-amber-900"
      }`}
    >
      <p>{banner.text}</p>
      <p className="mt-1">
        {banner.linkToBilling ? (
          <Link to="/app/$orgId/billing" params={{ orgId }} className="underline">
            {banner.action}
          </Link>
        ) : (
          banner.action
        )}
      </p>
    </div>
  );
}

/** The shop's inbound RFQ address (services/inbound): forward or CC RFQs to it. */
function InboundAddress({ orgId, admin }: { orgId: string; admin: boolean }) {
  const key = ["inbound-email", orgId];
  const q = useQuery({
    queryKey: key,
    queryFn: () => api<InboundEmailDto>(orgApi(orgId, "/inbound-email")),
  });
  const [copied, setCopied] = useState(false);
  const change = useMutation({
    mutationFn: (action: "rotate" | "off") =>
      api<InboundEmailDto>(
        orgApi(orgId, action === "rotate" ? "/inbound-email/rotate" : "/inbound-email"),
        {
          method: action === "rotate" ? "POST" : "DELETE",
        },
      ),
    onSuccess: (dto) => queryClient.setQueryData(key, dto),
  });
  // The member's own choice; nobody else's (PUT /inbound-email/notify).
  const notify = useMutation({
    mutationFn: (on: boolean) =>
      api<InboundEmailDto>(orgApi(orgId, "/inbound-email/notify"), {
        method: "PUT",
        body: { notify: on },
      }),
    onSuccess: (dto) => queryClient.setQueryData(key, dto),
  });
  const d = q.data;
  if (!d?.available) return null;
  if (!d.address && !admin) return null;
  return (
    <Card title="RFQs by email">
      {d.address ? (
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-stone-600">
            Forward RFQs here, or give it to customers. Each email becomes an RFQ below with its
            drawings attached; press "Extract with AI" to read it.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-stone-100 px-2 py-1 text-stone-900">{d.address}</code>
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(d.address ?? "").then(() => setCopied(true));
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-xs text-stone-500">
            {d.last24h} of {d.dailyLimit} emailed RFQs in the last 24 hours.
          </p>
          <label className="flex items-center gap-2 text-stone-700">
            <input
              type="checkbox"
              checked={d.notifyMe}
              disabled={notify.isPending}
              onChange={(e) => notify.mutate(e.target.checked)}
            />
            Email me when an RFQ arrives
          </label>
          <ErrorText error={notify.error} />
          <AllowedSenders orgId={orgId} admin={admin} dto={d} />
          {admin && (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                disabled={change.isPending}
                onClick={() => {
                  if (
                    window.confirm("Make a new address? Mail to the current one will be refused.")
                  ) {
                    change.mutate("rotate");
                  }
                }}
              >
                New address
              </Button>
              <Button
                variant="ghost"
                disabled={change.isPending}
                onClick={() => change.mutate("off")}
              >
                Turn off
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-stone-600">
            Get an address for this shop: RFQs emailed or forwarded to it land in this inbox with
            their drawings. Nothing is read by AI until an estimator asks.
          </p>
          <Button disabled={change.isPending} onClick={() => change.mutate("rotate")}>
            Turn on RFQ email
          </Button>
        </div>
      )}
      <ErrorText error={change.error} />
    </Card>
  );
}

/**
 * Who may email RFQs to the address (PUT /inbound-email/senders, shared/sender-allowlist.ts). Every
 * member sees the list; admins edit it and can add a sender the list refused with one click.
 */
function AllowedSenders({
  orgId,
  admin,
  dto,
}: {
  orgId: string;
  admin: boolean;
  dto: InboundEmailDto;
}) {
  const key = ["inbound-email", orgId];
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const save = useMutation({
    mutationFn: (senders: string[]) =>
      api<InboundEmailDto>(orgApi(orgId, "/inbound-email/senders"), {
        method: "PUT",
        body: { senders },
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(key, next);
      setEditing(false);
    },
  });
  const parsed = parseSenderList(text);
  const list = dto.allowedSenders;
  return (
    <div className="flex flex-col gap-2 border-t border-stone-200 pt-2">
      <p className="font-medium text-stone-800">Who can email RFQs in</p>
      {list.length === 0 ? (
        <p className="text-stone-600">Anyone with the address.</p>
      ) : (
        <p className="text-stone-600">
          Only {list.join(", ")}. Mail from anyone else is refused with a note to contact you, and
          so is mail that claims a listed sender but fails the sender domain's SPF, DKIM or DMARC
          check.
        </p>
      )}
      {admin && !editing && (
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              setText(list.join("\n"));
              setEditing(true);
            }}
          >
            {list.length === 0 ? "Limit senders" : "Edit senders"}
          </Button>
        </div>
      )}
      {admin && editing && (
        <div className="flex flex-col gap-2">
          <Field
            label="Senders, one per line"
            hint="An address (buyer@acme.com) or a whole domain (@acme.com, which covers its subdomains). If your team forwards RFQs from its own mailboxes, add your own domain too. Leave empty to accept anyone."
          >
            <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          {parsed.invalid.length > 0 && (
            <p className="text-xs text-red-700">
              Not an address or a domain: {parsed.invalid.join(", ")}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              disabled={save.isPending || parsed.invalid.length > 0}
              onClick={() => save.mutate(parsed.entries)}
            >
              Save senders
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {list.length > 0 && dto.refusedSenders.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-stone-500">Recently refused:</p>
          <ul className="flex flex-col gap-1">
            {dto.refusedSenders.map((r) => (
              <li key={r.address} className="flex flex-wrap items-center gap-2 text-xs">
                <code className="break-all text-stone-800">{r.address}</code>
                <span className="text-stone-500">{new Date(r.at).toLocaleString()}</span>
                {r.why === "unverified" ? (
                  <span className="text-amber-800">
                    claimed a listed sender but failed SPF/DKIM/DMARC (possibly forged; ask the
                    sender's IT to check their email setup)
                  </span>
                ) : (
                  <span className="text-stone-500">not on the list</span>
                )}
                {admin && r.why !== "unverified" && (
                  <Button
                    variant="ghost"
                    disabled={save.isPending}
                    onClick={() => save.mutate([...list, r.address])}
                  >
                    Allow
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ErrorText error={save.error} />
    </div>
  );
}

function NewRfq({ orgId, admin }: { orgId: string; admin: boolean }) {
  const navigate = useNavigate();
  // At 100% of the allowance the form says so where the estimator is typing (ROADMAP item 4).
  // The extract call below is still made: if the cached summary is stale and room has come back,
  // the read goes ahead; otherwise it answers 402, nothing is counted, and the RFQ page shows why.
  const billing = useBilling(orgId);
  const note = billing.data ? intakeNote(billing.data, admin) : null;
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  // Drawing pages of the picked files, counted here by the worker's rule (shared/upload-pages.ts),
  // so a package bigger than what is left is flagged before submit (ROADMAP item 4). Null while
  // counting; the worker's own count after upload is the one that is charged.
  const [pkg, setPkg] = useState<PackageCount | null>(null);
  useEffect(() => {
    let live = true;
    setPkg(null);
    countPackage(files.map((f) => ({ name: f.name, type: f.type, bytes: () => f.arrayBuffer() })))
      .then((count) => {
        if (live) setPkg(count);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [files]);
  const sizeNote = billing.data && pkg && !note ? packageNote(billing.data, pkg, admin) : null;
  const create = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.set("subject", subject);
      form.set("bodyText", body);
      for (const f of files) form.append("files", f);
      const rfq = await api<RfqDetailDto>(orgApi(orgId, "/rfqs"), { method: "POST", body: form });
      // Extract straight away; the estimator reviews the result on the next page.
      await api(orgApi(orgId, `/rfqs/${rfq.id}/extract`), { method: "POST" }).catch(
        () => undefined,
      );
      return rfq;
    },
    onSuccess: async (rfq) => {
      await queryClient.invalidateQueries({ queryKey: ["rfqs", orgId] });
      // The read may have used the allowance: refresh the banner and this form's note.
      await queryClient.invalidateQueries({ queryKey: ["billing", orgId] });
      await navigate({ to: "/app/$orgId/rfqs/$rfqId", params: { orgId, rfqId: rfq.id } });
    },
  });
  return (
    <Card title="New RFQ">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Field label="Subject">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field
          label="Paste the RFQ email"
          hint="Sender, part numbers, quantities, material, finish, due date: whatever the customer sent."
        >
          <Textarea rows={12} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <Field
          label="Drawings and attachments"
          hint="PDF drawings, text, images; STEP/DXF are stored for geometry. Up to 10 files, 15 MB each."
        >
          <Input
            type="file"
            multiple
            accept=".pdf,.txt,.png,.jpg,.jpeg,.step,.stp,.iges,.igs,.stl,.dxf"
            onChange={(e) => setFiles([...(e.target.files ?? [])])}
          />
        </Field>
        {note && (
          <div
            role="note"
            data-testid="intake-allowance-note"
            className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900"
          >
            <p>{note.text}</p>
            <p className="mt-1">
              {note.linkToBilling ? (
                <Link to="/app/$orgId/billing" params={{ orgId }} className="underline">
                  {note.action}
                </Link>
              ) : (
                note.action
              )}
            </p>
          </div>
        )}
        {sizeNote && (
          <div
            role="note"
            data-testid="intake-package-note"
            className={
              sizeNote.kind === "short"
                ? "rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900"
                : "rounded border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700"
            }
          >
            <p>{sizeNote.text}</p>
            {sizeNote.action && (
              <p className="mt-1">
                {sizeNote.linkToBilling ? (
                  <Link to="/app/$orgId/billing" params={{ orgId }} className="underline">
                    {sizeNote.action}
                  </Link>
                ) : (
                  sizeNote.action
                )}
              </p>
            )}
          </div>
        )}
        <ErrorText error={create.error} />
        <Button type="submit" disabled={create.isPending || (!body.trim() && files.length === 0)}>
          {create.isPending
            ? note || sizeNote?.kind === "short"
              ? "Saving the RFQ…"
              : "Reading the RFQ…"
            : (note?.submitLabel ?? sizeNote?.submitLabel ?? "Create and extract")}
        </Button>
      </form>
    </Card>
  );
}
