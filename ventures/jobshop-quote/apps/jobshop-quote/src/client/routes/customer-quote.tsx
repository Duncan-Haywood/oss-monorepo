// The customer's page for a customer link (/q/$token): the quote as sent, the PDF, and accept (a
// quoted quantity per part, a PO number) or decline. No account: the link is the credential.
// What it shows and accepts is decided by the worker (services/quotes/customer-link.ts).
import { formatMoney } from "@shared/currency";
import {
  type CustomerQuoteDto,
  type CustomerResponseInput,
  priceAcceptance,
} from "@shared/customer-link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useState } from "react";
import { Button, Card, ErrorText, Field, Input, Textarea } from "../components/ui";
import { ApiError, api, queryClient } from "../lib/api";
import { LegalFooter } from "./legal";

const STATE_TEXT: Record<Exclude<CustomerQuoteDto["state"], "open">, string> = {
  accepted: "You accepted this quote.",
  declined: "You declined this quote.",
  won: "This quote has been accepted.",
  lost: "This quote is closed.",
  expired: "This quote has expired.",
  superseded:
    "This quote was replaced by a newer revision. Open the link in that revision's email.",
};

export function CustomerQuotePage() {
  const { token } = useParams({ strict: false }) as { token: string };
  const path = `/api/quote-links/${encodeURIComponent(token)}`;
  const view = useQuery({
    queryKey: ["customer-quote", token],
    queryFn: () => api<CustomerQuoteDto>(path),
  });
  if (view.error instanceof ApiError && view.error.status === 404) {
    return (
      <Shell>
        <Card>
          <p className="text-sm text-stone-700">
            This quote link does not work any more. The shop may have turned it off; reply to the
            email it came in to ask for the quote again.
          </p>
        </Card>
      </Shell>
    );
  }
  const d = view.data;
  if (!d) {
    return (
      <Shell>
        <ErrorText error={view.error} />
      </Shell>
    );
  }
  const money = (c: number) => formatMoney(c, d.shop.currency);
  return (
    <Shell>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-stone-900">{d.shop.displayName}</p>
            <div className="text-xs text-stone-600">
              {[...d.shop.addressLines, d.shop.phone, d.shop.email].filter(Boolean).map((l) => (
                <div key={l}>{l}</div>
              ))}
            </div>
          </div>
          <div className="text-right text-sm text-stone-700">
            <p className="text-base font-semibold text-stone-900">Quote {d.quote.label}</p>
            {d.quote.replacesLabel && <p>Replaces {d.quote.replacesLabel}</p>}
            {d.quote.sentOn && <p>Date {d.quote.sentOn}</p>}
            {d.quote.validUntil && <p>Valid until {d.quote.validUntil}</p>}
          </div>
        </div>
        <p className="mt-3 text-sm text-stone-700">
          Prepared for <strong>{d.quote.customerCompany}</strong>
          {d.quote.customerContact ? `, ${d.quote.customerContact}` : ""}
          {d.quote.leadTimeText ? ` · Lead time: ${d.quote.leadTimeText}` : ""}
        </p>
        <a
          className="mt-2 inline-block text-sm text-sky-800 underline"
          href={`${path}/pdf`}
          target="_blank"
          rel="noreferrer"
        >
          Open the quote PDF as sent
        </a>
      </Card>

      {d.state === "open" ? (
        <Answer token={token} path={path} data={d} money={money} />
      ) : (
        <Card>
          <p className="text-sm font-medium text-stone-900">{STATE_TEXT[d.state]}</p>
          {d.response && <ResponseSummary r={d.response} money={money} />}
          <QuoteLines data={d} money={money} />
        </Card>
      )}

      {(d.quote.notes || d.quote.terms) && (
        <Card>
          {d.quote.notes && (
            <>
              <h2 className="text-sm font-semibold text-stone-900">Notes</h2>
              <p className="mb-2 whitespace-pre-wrap text-sm text-stone-700">{d.quote.notes}</p>
            </>
          )}
          {d.quote.terms && (
            <>
              <h2 className="text-sm font-semibold text-stone-900">Terms</h2>
              <p className="whitespace-pre-wrap text-sm text-stone-700">{d.quote.terms}</p>
            </>
          )}
        </Card>
      )}
      <p className="text-center text-xs text-stone-500">
        Sent with Job Shop Quote. The prices are {d.shop.displayName}'s; questions about them go to
        the shop.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">{children}</main>
      <LegalFooter />
    </>
  );
}

function QuoteLines({ data, money }: { data: CustomerQuoteDto; money: (c: number) => string }) {
  return (
    <div className="mt-3 flex flex-col gap-3">
      {data.lines.map((l) => (
        <div key={l.id} className="border-t border-stone-100 pt-2">
          <p className="text-sm font-semibold text-stone-900">
            {l.partNumber}
            {l.revision ? ` Rev ${l.revision}` : ""}
          </p>
          {l.description && <p className="text-xs text-stone-600">{l.description}</p>}
          <table className="mt-1 text-sm">
            <tbody>
              {l.breaks.map((b) => (
                <tr key={b.quantity}>
                  <td className="pr-4 text-right">{b.quantity}</td>
                  <td className="pr-4 text-right">{money(b.unitPriceCents)} each</td>
                  <td className="text-right">{money(b.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function ResponseSummary({
  r,
  money,
}: {
  r: NonNullable<CustomerQuoteDto["response"]>;
  money: (c: number) => string;
}) {
  return (
    <div className="mt-2 text-sm text-stone-700">
      <p>
        By {r.name} on {r.createdAt.slice(0, 10)}
        {r.poNumber ? `, PO ${r.poNumber}` : ""}.
      </p>
      {r.choices.length > 0 && (
        <ul className="list-disc pl-5">
          {r.choices.map((c) => (
            <li key={c.lineId}>
              {c.partNumber}: {c.quantity} at {money(c.unitPriceCents)} = {money(c.totalCents)}
            </li>
          ))}
        </ul>
      )}
      {r.amountCents != null && <p className="font-medium">Total {money(r.amountCents)}</p>}
      {r.note && <p className="mt-1 whitespace-pre-wrap text-stone-600">{r.note}</p>}
    </div>
  );
}

function Answer({
  token,
  path,
  data,
  money,
}: {
  token: string;
  path: string;
  data: CustomerQuoteDto;
  money: (c: number) => string;
}) {
  // Each line starts on its first quoted quantity; "Not ordering" leaves it out.
  const [picked, setPicked] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(data.lines.map((l) => [l.id, l.breaks[0]?.quantity ?? null])),
  );
  const [name, setName] = useState(data.quote.customerContact ?? "");
  const [email, setEmail] = useState("");
  const [po, setPo] = useState("");
  const [note, setNote] = useState("");
  const [declining, setDeclining] = useState(false);
  const respond = useMutation({
    mutationFn: (body: CustomerResponseInput) =>
      api<CustomerQuoteDto>(`${path}/respond`, { method: "POST", body }),
    onSuccess: (d) => queryClient.setQueryData(["customer-quote", token], d),
  });
  const choices = Object.entries(picked)
    .filter((e): e is [string, number] => e[1] !== null)
    .map(([lineId, quantity]) => ({ lineId, quantity }));
  const priced = priceAcceptance(data.lines, choices);
  return (
    <Card title={declining ? "Decline this quote" : "Accept this quote"}>
      {!declining && (
        <div className="flex flex-col gap-3">
          {data.lines.map((l) => (
            <fieldset key={l.id} className="border-t border-stone-100 pt-2">
              <legend className="text-sm font-semibold text-stone-900">
                {l.partNumber}
                {l.revision ? ` Rev ${l.revision}` : ""}
              </legend>
              {l.description && <p className="text-xs text-stone-600">{l.description}</p>}
              <div className="mt-1 flex flex-col gap-1 text-sm">
                {l.breaks.map((b) => (
                  <label key={b.quantity} className="flex flex-wrap items-center gap-2">
                    <input
                      type="radio"
                      name={`line-${l.id}`}
                      checked={picked[l.id] === b.quantity}
                      onChange={() => setPicked({ ...picked, [l.id]: b.quantity })}
                    />
                    <span>
                      {b.quantity} at {money(b.unitPriceCents)} each = {money(b.totalCents)}
                    </span>
                  </label>
                ))}
                <label className="flex items-center gap-2 text-stone-600">
                  <input
                    type="radio"
                    name={`line-${l.id}`}
                    checked={picked[l.id] === null}
                    onChange={() => setPicked({ ...picked, [l.id]: null })}
                  />
                  Not ordering this part
                </label>
              </div>
            </fieldset>
          ))}
          <p className="text-sm font-medium text-stone-900">
            {priced.ok ? `Total ${money(priced.amountCents)}` : priced.error}
          </p>
        </div>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Field label="Your name">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </Field>
        <Field label="Your email (optional)">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </Field>
        {!declining && (
          <Field label="PO number (optional)">
            <Input value={po} onChange={(e) => setPo(e.target.value)} />
          </Field>
        )}
      </div>
      <div className="mt-2">
        <Field
          label={declining ? "Reason (optional, helps the shop)" : "Note to the shop (optional)"}
        >
          <Textarea
            rows={3}
            value={note}
            placeholder={declining ? "price, lead time, project cancelled…" : ""}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>
      <p className="mt-2 text-xs text-stone-500">
        {declining
          ? "The shop is told you declined, with your name and reason."
          : "Accepting tells the shop you are ordering these quantities at these prices, on the quote's terms. The shop confirms the order with you."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {declining ? (
          <>
            <Button
              variant="danger"
              disabled={respond.isPending || !name.trim()}
              onClick={() =>
                respond.mutate({
                  decision: "decline",
                  name,
                  email: email || null,
                  note: note || null,
                })
              }
            >
              Decline the quote
            </Button>
            <Button variant="secondary" onClick={() => setDeclining(false)}>
              Back
            </Button>
          </>
        ) : (
          <>
            <Button
              disabled={respond.isPending || !priced.ok || !name.trim()}
              onClick={() =>
                respond.mutate({
                  decision: "accept",
                  name,
                  email: email || null,
                  poNumber: po || null,
                  choices,
                  note: note || null,
                })
              }
            >
              Accept the quote
            </Button>
            <Button variant="ghost" onClick={() => setDeclining(true)}>
              Decline instead
            </Button>
          </>
        )}
      </div>
      <ErrorText error={respond.error} />
    </Card>
  );
}
