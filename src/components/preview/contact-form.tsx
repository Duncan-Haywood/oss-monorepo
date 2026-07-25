"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { leadContactApiPath } from "@/lib/leads/slug-path";
import {
  COMMERCE_ORDER_EVENT,
  commerceOrderStorageKey,
  type CommerceOrderEventDetail,
} from "./commerce-catalog";

type PreviewContactFormProps = {
  slug: string;
  businessName: string;
  /** Theme-aligned classes from category preview. */
  panelClass: string;
  ctaClass: string;
  accentTextClass: string;
};

type SubmitState = "idle" | "submitting" | "success" | "error";

function readPendingCommerceOrder(slug: string): string {
  if (typeof window === "undefined") return "";
  try {
    const key = commerceOrderStorageKey(slug);
    const pending = sessionStorage.getItem(key);
    if (pending) {
      sessionStorage.removeItem(key);
      return pending;
    }
  } catch {
    // Private mode / blocked storage — leave blank.
  }
  return "";
}

export function PreviewContactForm({
  slug,
  businessName,
  panelClass,
  ctaClass,
  accentTextClass,
}: PreviewContactFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  // Prefill from Commerce "Request order" when sessionStorage has a pending message
  // (cross-navigation). Same-page clicks use the COMMERCE_ORDER_EVENT subscription below.
  const [message, setMessage] = useState(() => readPendingCommerceOrder(slug));
  const [status, setStatus] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const messageFieldRef = useRef<HTMLTextAreaElement>(null);
  const successMessageRef = useRef<HTMLParagraphElement>(null);
  const hadPendingOrderOnMount = useRef(message.length > 0);

  // "Request order" only scrolls the browser to #contact (native hash-jump on
  // the <a> in commerce-catalog.tsx) — it never moves programmatic focus, so a
  // keyboard-only or screen-reader shopper gets no indication they landed on a
  // new section with a message already filled in. Move focus to the message
  // field ourselves, both for the same-page event below and for this
  // cross-navigation (sessionStorage) case on first mount.
  useEffect(() => {
    if (hadPendingOrderOnMount.current) {
      messageFieldRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    const onOrderRequest = (event: Event) => {
      const detail = (event as CustomEvent<CommerceOrderEventDetail>).detail;
      if (!detail || detail.slug !== slug || !detail.message) return;
      setMessage(detail.message);
      messageFieldRef.current?.focus();
    };
    window.addEventListener(COMMERCE_ORDER_EVENT, onOrderRequest);
    return () => window.removeEventListener(COMMERCE_ORDER_EVENT, onOrderRequest);
  }, [slug]);

  // A successful submit unmounts the <form> — including whichever control
  // (the submit button, on a keyboard/screen-reader flow) held focus at that
  // moment — and swaps in the success message below. Without this, focus
  // silently resets to <body> and the next Tab restarts from the top of the
  // page. Move focus onto the (tabIndex={-1}, programmatically-focusable)
  // success message itself so it's both announced and where focus lands.
  useEffect(() => {
    if (status === "success") {
      successMessageRef.current?.focus();
    }
  }, [status]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setErrorMessage(null);

    try {
      const response = await fetch(leadContactApiPath(slug), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, message }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const err =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : "Could not send your message. Try again.";
        setErrorMessage(err);
        setStatus("error");
        return;
      }
      setStatus("success");
      setName("");
      setEmail("");
      setPhone("");
      setMessage("");
    } catch {
      setErrorMessage("Network error — please try again in a moment.");
      setStatus("error");
    }
  }

  return (
    <section className={`rounded-2xl border p-6 backdrop-blur ${panelClass}`} id="contact">
      <p className={`text-sm font-medium uppercase tracking-[0.18em] ${accentTextClass}`}>
        Contact
      </p>
      <h2 className="mt-2 text-xl font-semibold text-zinc-900">Message {businessName}</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">
        Starter sites include a working inquiry form. Try it here — submissions go to the
        contact endpoint for this preview.
      </p>

      {status === "success" ? (
        <p
          ref={successMessageRef}
          tabIndex={-1}
          className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 outline-none"
          role="status"
        >
          Thanks — your message was received. We&apos;ll follow up soon.
        </p>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
          <label className="block text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Name</span>
            <input
              type="text"
              name="name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-300 bg-white/90 px-3 py-2 text-zinc-900 outline-none ring-zinc-400 focus:ring-2"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm text-zinc-700">
              <span className="font-medium text-zinc-900">Email</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-300 bg-white/90 px-3 py-2 text-zinc-900 outline-none ring-zinc-400 focus:ring-2"
              />
            </label>
            <label className="block text-sm text-zinc-700">
              <span className="font-medium text-zinc-900">Phone</span>
              <input
                type="tel"
                name="phone"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-300 bg-white/90 px-3 py-2 text-zinc-900 outline-none ring-zinc-400 focus:ring-2"
              />
            </label>
          </div>
          <label className="block text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">Message</span>
            <textarea
              ref={messageFieldRef}
              name="message"
              rows={4}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-1 w-full resize-y rounded-xl border border-zinc-300 bg-white/90 px-3 py-2 text-zinc-900 outline-none ring-zinc-400 focus:ring-2"
              placeholder="How can we help?"
            />
          </label>

          {status === "error" && errorMessage ? (
            <p className="text-sm text-red-700" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={status === "submitting" || message.trim().length === 0}
            className={`inline-flex h-11 items-center justify-center rounded-full px-6 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${ctaClass}`}
          >
            {status === "submitting" ? "Sending…" : "Send message"}
          </button>
        </form>
      )}
    </section>
  );
}
