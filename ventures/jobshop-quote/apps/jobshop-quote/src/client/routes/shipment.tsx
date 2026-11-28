// Packing slip and certificate of conformance for a won quote (GET /quotes/:id/shipment.pdf). The
// form only builds the link; the rules (quantities, defaults, what prints) are in
// src/shared/shipment.ts and services/quotes/shipment.ts.

import type { QuoteDetailDto } from "@shared/api";
import type { CustomerLinksDto } from "@shared/customer-link";
import { MAX_LOT_LENGTH, MAX_SHIP_TO_LINES, MAX_SIGNER_LENGTH } from "@shared/shipment";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, Field, Input, Textarea } from "../components/ui";
import { api, orgApi } from "../lib/api";

interface JobDto {
  dueOn: string | null;
  quantities: Record<string, number>;
  shippedOn: string | null;
}

export function ShipmentCard({ orgId, quote }: { orgId: string; quote: QuoteDetailDto }) {
  const [ship, setShip] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [lot, setLot] = useState<Record<string, string>>({});
  const [signer, setSigner] = useState("");
  const [to, setTo] = useState("");
  const [coc, setCoc] = useState(true);
  // Same query keys as the Job and customer-link cards, so these are read once.
  const job = useQuery({
    queryKey: ["job", orgId, quote.id],
    queryFn: () => api<JobDto>(orgApi(orgId, `/quotes/${quote.id}/job`)),
  });
  const links = useQuery({
    queryKey: ["customer-links", orgId, quote.id],
    queryFn: () => api<CustomerLinksDto>(orgApi(orgId, `/quotes/${quote.id}/customer-links`)),
  });
  const response = links.data?.response;
  const accepted = response?.decision === "accepted" ? response.choices : null;
  const ordered = (lineId: string): number | undefined => {
    const saved = job.data?.quantities[lineId];
    if (saved !== undefined) return saved;
    const line = quote.lines.find((l) => l.id === lineId);
    if (accepted) return accepted.find((c) => c.lineId === lineId)?.quantity;
    return line && line.inputs.quantities.length === 1 ? line.inputs.quantities[0] : undefined;
  };
  const typed = (lineId: string) => (qty[lineId] ?? "").trim();
  const missing = quote.lines.filter(
    (l) => ordered(l.id) === undefined && !/^[1-9]\d*$/.test(typed(l.id)) && !accepted,
  );
  const params = new URLSearchParams();
  if (ship) params.set("ship", ship);
  for (const l of quote.lines) {
    if (typed(l.id)) params.set(`qty.${l.id}`, typed(l.id));
    const v = (lot[l.id] ?? "").trim();
    if (v) params.set(`lot.${l.id}`, v);
  }
  if (signer.trim()) params.set("signer", signer.trim());
  if (to.trim()) params.set("to", to.trim());
  if (!coc) params.set("coc", "0");
  const query = params.toString();
  const href = orgApi(orgId, `/quotes/${quote.id}/shipment.pdf${query ? `?${query}` : ""}`);
  return (
    <Card title="Packing slip and certificate of conformance">
      <p className="mb-2 text-sm text-stone-600">
        What goes in the box: a packing slip (ordered and shipped per part, no prices) and a
        certificate of conformance listing each part&apos;s revision, quantity, material, outside
        processing and the heat or lot number you enter, over a blank signature line. Sign it only
        when the parts were made and inspected to the PO and drawing.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <Field
          label="Ship date"
          hint={job.data?.shippedOn ? `job shipped ${job.data.shippedOn}` : "today when blank"}
        >
          <Input type="date" value={ship} onChange={(e) => setShip(e.target.value)} />
        </Field>
        <Field label="Signer, name and title" hint="blank prints a line to write on">
          <Input
            value={signer}
            maxLength={MAX_SIGNER_LENGTH}
            placeholder="Quality manager"
            onChange={(e) => setSigner(e.target.value)}
          />
        </Field>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {quote.lines.map((l) => {
          const o = ordered(l.id);
          return (
            <div key={l.id} className="flex flex-wrap items-end gap-2">
              <Field
                label={`${l.partNumber} shipped`}
                hint={
                  o !== undefined ? `ordered ${o}` : `quoted at ${l.inputs.quantities.join(", ")}`
                }
              >
                <Input
                  className="w-28"
                  inputMode="numeric"
                  value={qty[l.id] ?? ""}
                  placeholder={o !== undefined ? String(o) : ""}
                  onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })}
                />
              </Field>
              <Field label="Heat / lot no.">
                <Input
                  className="w-40"
                  value={lot[l.id] ?? ""}
                  maxLength={MAX_LOT_LENGTH}
                  onChange={(e) => setLot({ ...lot, [l.id]: e.target.value })}
                />
              </Field>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <Field
          label="Ship to"
          hint={`up to ${MAX_SHIP_TO_LINES} lines; the customer's name when blank`}
        >
          <Textarea rows={3} value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={coc} onChange={(e) => setCoc(e.target.checked)} />
          Include the certificate of conformance
        </label>
        {missing.length === 0 ? (
          <a
            className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm"
            href={href}
            target="_blank"
            rel="noreferrer"
          >
            Print packing slip
          </a>
        ) : (
          <span className="text-sm text-stone-600">
            Enter the quantity shipped for {missing.map((l) => l.partNumber).join(", ")}
          </span>
        )}
      </div>
    </Card>
  );
}
