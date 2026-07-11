"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import type { Lead, LeadPipelineStage, BusinessCategory } from "@/lib/leads/types";
import { CSV_LEAD_TEMPLATE } from "@/lib/leads/csv-import";
import { updateLeadStageAction, addLeadAction, importLeadsCsvAction } from "./actions";

interface LeadsClientProps {
  initialLeads: Lead[];
}

const STAGES: { id: LeadPipelineStage; label: string; color: string; desc: string }[] = [
  { id: "discovered", label: "Discovered", color: "bg-zinc-100 text-zinc-800 border-zinc-200", desc: "Found via public listings" },
  { id: "site_built", label: "Site Built", color: "bg-blue-50 text-blue-700 border-blue-200", desc: "Preview site generated" },
  { id: "outreach_sent", label: "Outreach Sent", color: "bg-purple-50 text-purple-700 border-purple-200", desc: "Email preview link sent" },
  { id: "discovery_call", label: "Discovery Call", color: "bg-amber-50 text-amber-700 border-amber-200", desc: "Call to review preview" },
  { id: "paid", label: "Paid", color: "bg-emerald-50 text-emerald-700 border-emerald-200", desc: "Stripe checkout complete" },
  { id: "live", label: "Live", color: "bg-indigo-50 text-indigo-700 border-indigo-200", desc: "Custom domain published" },
];

const CATEGORIES: { id: BusinessCategory; label: string }[] = [
  { id: "restaurant", label: "Restaurant / Cafe" },
  { id: "salon", label: "Salon / Spa" },
  { id: "trades", label: "Home Services / Trades" },
  { id: "generic", label: "Generic / Other" },
];

export function LeadsClient({ initialLeads }: LeadsClientProps) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [filterStage, setFilterStage] = useState<LeadPipelineStage | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Form State
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formCategory, setFormCategory] = useState<BusinessCategory>("generic");
  const [formTier, setFormTier] = useState<"starter" | "growth" | "complete">("starter");
  const [formStage, setFormStage] = useState<LeadPipelineStage>("discovered");
  const [formCity, setFormCity] = useState("Denver");
  const [formState, setFormState] = useState("CO");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formTagline, setFormTagline] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formServices, setFormServices] = useState("");
  const [formWeekday, setFormWeekday] = useState("Mon–Fri 8am–5pm");
  const [formWeekend, setFormWeekend] = useState("Sat 9am–2pm · Closed Sun");
  const [formError, setFormError] = useState<string | null>(null);

  // CSV import state
  const [csvText, setCsvText] = useState(CSV_LEAD_TEMPLATE);
  const [csvDataSource, setCsvDataSource] = useState("csv_import");
  const [csvStage, setCsvStage] = useState<LeadPipelineStage>("discovered");
  const [csvMessage, setCsvMessage] = useState<string | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);

  // Auto-generate slug from name
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFormName(val);
    const generated = val
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
    setFormSlug(generated);
  };

  const handleStageChange = async (slug: string, newStage: LeadPipelineStage) => {
    // Optimistic UI update
    setLeads((prev) =>
      prev.map((l) => (l.slug === slug ? { ...l, stage: newStage } : l))
    );

    const res = await updateLeadStageAction(slug, newStage);
    if (!res.success) {
      alert(`Error updating stage: ${res.error}`);
      // Revert if error
      setLeads(initialLeads);
    }
  };

  const handleCsvFile = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
  };

  const handleCsvImport = (e: React.FormEvent) => {
    e.preventDefault();
    setCsvError(null);
    setCsvMessage(null);

    startTransition(async () => {
      const res = await importLeadsCsvAction({
        csvText,
        dataSource: csvDataSource || "csv_import",
        defaultStage: csvStage,
      });

      if (!res.success) {
        setCsvError(res.error ?? "Import failed");
        return;
      }

      setCsvMessage(
        `Imported ${res.imported} lead${res.imported === 1 ? "" : "s"}` +
          (res.skipped ? ` (${res.skipped} skipped)` : "") +
          (res.errors.length ? `. ${res.errors.length} row warning(s).` : "."),
      );

      // Refresh list from optimistic parse by reloading — server owns truth
      window.location.reload();
    });
  };

  const handleAddLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formName || !formSlug) {
      setFormError("Business Name and Slug are required.");
      return;
    }

    const servicesArray = formServices
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const newLeadData = {
      slug: formSlug,
      businessName: formName,
      category: formCategory,
      city: formCity,
      state: formState,
      tagline: formTagline,
      description: formDesc,
      phone: formPhone,
      email: formEmail || undefined,
      services: servicesArray.length > 0 ? servicesArray : ["Custom digital setup"],
      hours: {
        weekday: formWeekday,
        weekend: formWeekend,
      },
      recommendedTier: formTier,
      stage: formStage,
      dataSource: "manual_entry" as const,
    };

    startTransition(async () => {
      const res = await addLeadAction(newLeadData);
      if (res.success) {
        setLeads((prev) => {
          const existsIdx = prev.findIndex((l) => l.slug === newLeadData.slug);
          if (existsIdx !== -1) {
            const updated = [...prev];
            updated[existsIdx] = newLeadData;
            return updated;
          }
          return [...prev, newLeadData];
        });
        
        // Reset form
        setFormName("");
        setFormSlug("");
        setFormCategory("generic");
        setFormTier("starter");
        setFormStage("discovered");
        setFormPhone("");
        setFormEmail("");
        setFormTagline("");
        setFormDesc("");
        setFormServices("");
        setShowAddForm(false);
      } else {
        setFormError(res.error ?? "Failed to save lead.");
      }
    });
  };

  // Filtered Leads
  const filteredLeads = leads.filter((lead) => {
    const matchesStage = filterStage === "all" || lead.stage === filterStage;
    const matchesSearch =
      lead.businessName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.slug.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStage && matchesSearch;
  });

  return (
    <div className="mt-8">
      {/* Search and Action Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search leads by name, city, or slug..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 pl-10 text-sm outline-none transition focus:border-zinc-950 focus:ring-1 focus:ring-zinc-950"
          />
          <svg
            className="absolute left-3.5 top-3 h-4.5 w-4.5 text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setShowCsvImport(!showCsvImport);
              if (!showCsvImport) setShowAddForm(false);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-50"
          >
            {showCsvImport ? "Close CSV" : "Import CSV"}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAddForm(!showAddForm);
              if (!showAddForm) setShowCsvImport(false);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            {showAddForm ? "Close Form" : "Add Lead Manually"}
          </button>
        </div>
      </div>

      {/* CSV bulk import */}
      {showCsvImport && (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50/50 p-6">
          <h2 className="text-lg font-semibold tracking-tight">Import leads from CSV</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Compliant scale-up before Places API — tag each batch with a data source. Max 100 rows.
            Services use <code>;</code> inside a cell. See{" "}
            <Link href="/docs/compliance" className="underline underline-offset-2">
              Compliance
            </Link>
            .
          </p>

          <form onSubmit={handleCsvImport} className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-zinc-700">Data source</label>
                <input
                  type="text"
                  value={csvDataSource}
                  onChange={(e) => setCsvDataSource(e.target.value)}
                  placeholder="csv_import"
                  className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700">Initial stage</label>
                <select
                  value={csvStage}
                  onChange={(e) => setCsvStage(e.target.value as LeadPipelineStage)}
                  className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
                >
                  {STAGES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700">Upload file</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => void handleCsvFile(e.target.files?.[0] ?? null)}
                className="mt-1.5 block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700">CSV text</label>
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={8}
                spellCheck={false}
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-xs leading-5 outline-none transition focus:border-zinc-900"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:bg-zinc-400"
              >
                {isPending ? "Importing..." : "Import leads"}
              </button>
              <button
                type="button"
                onClick={() => setCsvText(CSV_LEAD_TEMPLATE)}
                className="text-xs font-medium text-zinc-600 underline-offset-2 hover:underline"
              >
                Reset to template
              </button>
            </div>
          </form>

          {csvError && <p className="mt-4 text-xs font-medium text-red-600">{csvError}</p>}
          {csvMessage && <p className="mt-4 text-xs font-medium text-emerald-700">{csvMessage}</p>}
        </div>
      )}

      {/* Manual Add Form (Collapse panel) */}
      {showAddForm && (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50/50 p-6 backdrop-blur-sm transition-all duration-300">
          <h2 className="text-lg font-semibold tracking-tight">Add New Lead</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Input business info to pre-generate a customized preview site.
          </p>

          <form onSubmit={handleAddLeadSubmit} className="mt-6 grid gap-6 sm:grid-cols-2 md:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700">Business Name</label>
              <input
                type="text"
                required
                value={formName}
                onChange={handleNameChange}
                placeholder="e.g. Blue River Salon"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700">Preview Slug</label>
              <input
                type="text"
                required
                value={formSlug}
                onChange={(e) => setFormSlug(e.target.value)}
                placeholder="e.g. blue-river-salon"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700">Category Theme</label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value as BusinessCategory)}
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700">Recommended Tier</label>
              <select
                value={formTier}
                onChange={(e) => setFormTier(e.target.value as "starter" | "growth" | "complete")}
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              >
                <option value="starter">Starter ($500)</option>
                <option value="growth">Growth ($500 + $99/mo)</option>
                <option value="complete">Complete ($500 + $199/mo)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700">Pipeline Stage</label>
              <select
                value={formStage}
                onChange={(e) => setFormStage(e.target.value as LeadPipelineStage)}
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              >
                {STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700">Phone</label>
              <input
                type="text"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="e.g. (303) 555-0199"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700">Email Address</label>
              <input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="e.g. contact@blueriversalon.com"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700">City</label>
              <input
                type="text"
                value={formCity}
                onChange={(e) => setFormCity(e.target.value)}
                placeholder="Denver"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700">State</label>
              <input
                type="text"
                value={formState}
                onChange={(e) => setFormState(e.target.value)}
                placeholder="CO"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700">Tagline</label>
              <input
                type="text"
                value={formTagline}
                onChange={(e) => setFormTagline(e.target.value)}
                placeholder="e.g. Premium local style"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-zinc-700">Description</label>
              <input
                type="text"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="Brief description of business for the preview page"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div className="sm:col-span-2 md:col-span-3">
              <label className="block text-xs font-semibold text-zinc-700">Services (Comma separated)</label>
              <input
                type="text"
                value={formServices}
                onChange={(e) => setFormServices(e.target.value)}
                placeholder="e.g. Hair Coloring, Precision Cut, Blowout"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700">Hours (Weekday)</label>
              <input
                type="text"
                value={formWeekday}
                onChange={(e) => setFormWeekday(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700">Hours (Weekend)</label>
              <input
                type="text"
                value={formWeekend}
                onChange={(e) => setFormWeekend(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div className="flex items-end md:col-span-1">
              <button
                type="submit"
                disabled={isPending}
                className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:bg-zinc-400 transition"
              >
                {isPending ? "Creating..." : "Save Lead"}
              </button>
            </div>
          </form>
          {formError && <p className="mt-4 text-xs font-medium text-red-600">{formError}</p>}
        </div>
      )}

      {/* Kanban Filters */}
      <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        <button
          onClick={() => setFilterStage("all")}
          className={`flex flex-col rounded-xl border p-4 text-left transition ${
            filterStage === "all"
              ? "border-zinc-950 bg-zinc-50 shadow-sm"
              : "border-zinc-200 hover:border-zinc-300"
          }`}
        >
          <span className="text-xs font-medium text-zinc-500">All Stages</span>
          <span className="mt-2 text-2xl font-bold tracking-tight text-zinc-900">
            {leads.length}
          </span>
        </button>

        {STAGES.map((s) => {
          const count = leads.filter((l) => l.stage === s.id).length;
          return (
            <button
              key={s.id}
              onClick={() => setFilterStage(s.id)}
              className={`flex flex-col rounded-xl border p-4 text-left transition ${
                filterStage === s.id
                  ? "border-zinc-950 bg-zinc-50 shadow-sm"
                  : "border-zinc-200 hover:border-zinc-300"
              }`}
            >
              <span className="text-xs font-medium text-zinc-500">{s.label}</span>
              <span className="mt-2 text-2xl font-bold tracking-tight text-zinc-900">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Leads Table */}
      <div className="mt-8 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm text-zinc-600">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50/50 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                <th className="px-6 py-4">Business</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4">Recommended Tier</th>
                <th className="px-6 py-4">Pipeline Stage</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
                    No leads found matching current filter or search.
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => {
                  return (
                    <tr key={lead.slug} className="hover:bg-zinc-50/50 transition">
                      <td className="px-6 py-4.5">
                        <div>
                          <p className="font-semibold text-zinc-900">{lead.businessName}</p>
                          <p className="text-xs text-zinc-400 mt-0.5">
                            {lead.city}, {lead.state}
                            {lead.phone && ` · ${lead.phone}`}
                            {lead.email && ` · ${lead.email}`}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4.5">
                        <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-800 capitalize">
                          {lead.category}
                        </span>
                      </td>
                      <td className="px-6 py-4.5">
                        <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-800 capitalize">
                          {lead.recommendedTier}
                        </span>
                      </td>
                      <td className="px-6 py-4.5">
                        <select
                          value={lead.stage}
                          onChange={(e) =>
                            handleStageChange(lead.slug, e.target.value as LeadPipelineStage)
                          }
                          className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold outline-none transition focus:border-zinc-900"
                        >
                          {STAGES.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4.5 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <Link
                            href={`/preview/${lead.slug}`}
                            className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
                          >
                            Preview Site
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
