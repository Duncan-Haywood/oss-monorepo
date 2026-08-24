"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, FolderOpen, Package, Percent, Plus } from "lucide-react";
import B2BSearchForm from "@/components/B2BSearchForm";
import { trackUsageEvent } from "@/components/shared/UsageTracker";
import {
  addLineToProject,
  createB2BProject,
  loadActiveB2BProjectId,
  loadB2BProjectsFromStorage,
  projectLinesToCheckoutItems,
  seedDefaultB2BProjects,
  removeLineFromProject,
  saveActiveB2BProjectId,
  saveB2BProjectsToStorage,
  setProjectLineQuantity,
  summarizeB2BProject,
  tradePriceFromRetail,
  type B2BProject,
} from "@/lib/b2b-catalog";
import { saveCheckoutCartToStorage } from "@/lib/checkout";
import { catalogArtworks, type CatalogArtwork } from "@/lib/marketplace";
import { formatStripeCurrency } from "@/lib/stripe-connect";

export type B2BListing = CatalogArtwork & {
  href: string;
};

type B2BPortalBoardProps = {
  query: string;
  listings: B2BListing[];
  liveCount: number;
};

export default function B2BPortalBoard({ query, listings, liveCount }: B2BPortalBoardProps) {
  const router = useRouter();
  const [projects, setProjects] = useState<B2BProject[]>(() => seedDefaultB2BProjects());
  const [activeProjectId, setActiveProjectId] = useState("hospitality-lobby");
  const [hydrated, setHydrated] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newClient, setNewClient] = useState("");
  const [formError, setFormError] = useState("");
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    const stored = loadB2BProjectsFromStorage();
    const active = loadActiveB2BProjectId(stored);
    setProjects(stored);
    setActiveProjectId(active);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    saveB2BProjectsToStorage(projects);
    if (activeProjectId) {
      saveActiveB2BProjectId(activeProjectId);
    }
  }, [projects, activeProjectId, hydrated]);

  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0];
  const summary = useMemo(
    () => (activeProject ? summarizeB2BProject(activeProject) : null),
    [activeProject],
  );

  const updateActiveProject = (updater: (project: B2BProject) => B2BProject) => {
    if (!activeProject) {
      return;
    }
    setProjects((current) =>
      current.map((project) => (project.id === activeProject.id ? updater(project) : project)),
    );
  };

  const handleAddToProject = (artwork: B2BListing) => {
    updateActiveProject((project) => addLineToProject(project, artwork.slug));
    trackUsageEvent("b2b_add_to_project", `/b2b-portal#${artwork.slug}`);
  };

  const handleCreateProject = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const created = createB2BProject(
        newName,
        newClient,
        projects.map((project) => project.id),
      );
      setProjects((current) => [...current, created]);
      setActiveProjectId(created.id);
      setNewName("");
      setNewClient("");
      setCreating(false);
      setFormError("");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not create project");
    }
  };

  const handleSubmitOrder = () => {
    if (!activeProject || !summary || summary.pieces === 0) {
      setSubmitError("Add at least one live print to the project before submitting a trade order.");
      return;
    }
    const lines = projectLinesToCheckoutItems(activeProject);
    if (lines.length === 0) {
      setSubmitError("This project has no live catalog prints that can check out.");
      return;
    }
    saveCheckoutCartToStorage(lines);
    trackUsageEvent("b2b_submit_order", `/checkout?from=b2b&project=${activeProject.id}`);
    router.push("/checkout?from=b2b");
  };

  const hasActiveSearch = Boolean(query.trim());

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 px-6 py-4 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex justify-between items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Building2 className="w-6 h-6 text-indigo-600" />
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Designer Trade Portal</h1>
              <p className="text-sm text-slate-500 dark:text-gray-400">
                Search live prints • Trade pricing • Project boards
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-full font-medium flex items-center gap-1">
              <Percent className="w-3 h-3" /> 32% trade discount
            </span>
            <Link
              href="/storefront"
              className="text-sm px-4 py-2 border border-slate-300 dark:border-gray-600 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-700 dark:text-gray-300 transition"
            >
              Buyer storefront
            </Link>
            <Link
              href="/"
              className="text-sm px-4 py-2 border border-slate-300 dark:border-gray-600 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-700 dark:text-gray-300 transition"
            >
              Return to Docs
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 flex gap-6 flex-col lg:flex-row">
        <aside className="w-full lg:w-72 shrink-0 space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <FolderOpen className="w-4 h-4" /> Projects
              </h2>
              <button
                type="button"
                aria-label="Start a new project"
                aria-expanded={creating}
                onClick={() => setCreating((open) => !open)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-gray-700 rounded"
              >
                <Plus className="w-4 h-4 text-indigo-600" />
              </button>
            </div>
            {creating ? (
              <form onSubmit={handleCreateProject} className="mb-4 space-y-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-gray-400" htmlFor="new-project-name">
                  Project name
                </label>
                <input
                  id="new-project-name"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                  placeholder="Lobby refresh"
                />
                <label className="block text-xs font-medium text-slate-600 dark:text-gray-400" htmlFor="new-project-client">
                  Client
                </label>
                <input
                  id="new-project-client"
                  value={newClient}
                  onChange={(event) => setNewClient(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
                  placeholder="Studio name"
                />
                {formError ? <p className="text-xs text-rose-600">{formError}</p> : null}
                <button
                  type="submit"
                  className="w-full rounded-lg bg-indigo-600 text-white text-sm py-2 hover:bg-indigo-500"
                >
                  Create project
                </button>
              </form>
            ) : null}
            <div className="space-y-2">
              {projects.map((project) => {
                const projectSummary = summarizeB2BProject(project);
                const selected = project.id === activeProject?.id;
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => setActiveProjectId(project.id)}
                    className={`w-full text-left p-3 rounded-lg transition ${
                      selected
                        ? "bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800"
                        : "hover:bg-slate-50 dark:hover:bg-gray-700"
                    }`}
                  >
                    <div className="font-medium text-sm text-slate-900 dark:text-white">{project.name}</div>
                    <div className="text-xs text-slate-600 dark:text-gray-400 mt-1">{project.client}</div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                      {projectSummary.pieces} pieces • {formatStripeCurrency(projectSummary.tradeSubtotal)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <div className="flex-1 space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-6">
            <div className="flex justify-between items-center mb-6 gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {query.trim() ? `Trade results for “${query.trim()}”` : "Catalog — Trade Pricing"}
                </h2>
                <p className="text-sm text-slate-500 dark:text-gray-400">
                  {listings.length} live {listings.length === 1 ? "print" : "prints"}
                  {query.trim() ? ` matching “${query.trim()}”` : ` of ${liveCount} in the shared catalog`}
                </p>
              </div>
              <B2BSearchForm defaultQuery={query} />
            </div>

            {hasActiveSearch ? (
              <p className="mb-4 text-sm">
                <Link href="/b2b-portal" className="text-indigo-700 dark:text-indigo-300 hover:underline">
                  Clear trade catalog search
                </Link>
              </p>
            ) : null}

            {listings.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-gray-600 px-6 py-12 text-center">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">No live prints match this search</h3>
                <p className="mt-2 text-sm text-slate-500 dark:text-gray-400">
                  Try an artist name, color, or style — only Live catalog work is offered at trade pricing.
                </p>
                <Link
                  href="/b2b-portal"
                  className="mt-4 inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                >
                  Browse all trade listings
                </Link>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-gray-700 text-slate-500 dark:text-gray-400">
                    <th className="text-left py-2">Artwork</th>
                    <th className="text-left py-2">Artist</th>
                    <th className="text-left py-2">Style</th>
                    <th className="text-right py-2">Trade</th>
                    <th className="text-right py-2">Retail</th>
                    <th className="text-right py-2">
                      <span className="sr-only">Add to project</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="text-slate-700 dark:text-gray-300">
                  {listings.map((item) => {
                    const tradePrice = tradePriceFromRetail(item.retailPrice);
                    const alreadyInProject = Boolean(
                      activeProject?.lines.some((line) => line.artworkSlug === item.slug),
                    );
                    return (
                      <tr key={item.slug} className="border-b border-slate-100 dark:border-gray-700/50">
                        <td className="py-3 font-medium">
                          <Link href={item.href} className="hover:text-indigo-700 hover:underline">
                            {item.title}
                          </Link>
                        </td>
                        <td className="py-3">{item.artistName}</td>
                        <td className="py-3">{item.style}</td>
                        <td className="py-3 text-right font-mono text-indigo-600 dark:text-indigo-400">
                          {formatStripeCurrency(tradePrice)}
                        </td>
                        <td className="py-3 text-right font-mono text-slate-500 dark:text-slate-400 line-through">
                          {formatStripeCurrency(item.retailPrice)}
                        </td>
                        <td className="py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleAddToProject(item)}
                            disabled={!activeProject}
                            className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-500 disabled:opacity-50"
                          >
                            {alreadyInProject ? "Add another" : "Add to Project"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-6">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <Package className="w-4 h-4" /> Bulk Order Summary
            </h3>
            {activeProject && summary ? (
              <>
                <p className="text-sm text-slate-600 dark:text-gray-400 mb-3">
                  {activeProject.name} for {activeProject.client}
                </p>
                {activeProject.lines.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-gray-400">
                    This project is empty. Search the trade catalog and add live prints.
                  </p>
                ) : (
                  <ul className="mb-4 space-y-2">
                    {activeProject.lines.map((line) => {
                      const listing =
                        listings.find((item) => item.slug === line.artworkSlug) ??
                        catalogArtworks.find((item) => item.slug === line.artworkSlug);
                      return (
                        <li
                          key={line.artworkSlug}
                          className="flex items-center justify-between gap-3 text-sm text-slate-700 dark:text-gray-300"
                        >
                          <span>
                            {listing?.title ?? line.artworkSlug} × {line.quantity}
                          </span>
                          <span className="flex items-center gap-2">
                            <button
                              type="button"
                              aria-label={`Decrease quantity of ${listing?.title ?? line.artworkSlug}`}
                              onClick={() =>
                                updateActiveProject((project) =>
                                  setProjectLineQuantity(project, line.artworkSlug, line.quantity - 1),
                                )
                              }
                              className="px-2 py-0.5 rounded border border-slate-200 dark:border-gray-600"
                            >
                              −
                            </button>
                            <button
                              type="button"
                              aria-label={`Increase quantity of ${listing?.title ?? line.artworkSlug}`}
                              onClick={() =>
                                updateActiveProject((project) =>
                                  setProjectLineQuantity(project, line.artworkSlug, line.quantity + 1),
                                )
                              }
                              className="px-2 py-0.5 rounded border border-slate-200 dark:border-gray-600"
                            >
                              +
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateActiveProject((project) => removeLineFromProject(project, line.artworkSlug))
                              }
                              className="text-rose-600 hover:text-rose-800"
                            >
                              Remove
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-600 dark:text-gray-400">
                    {summary.pieces} pieces • {summary.distinctPrints}{" "}
                    {summary.distinctPrints === 1 ? "print" : "prints"} • White-glove packaging
                  </span>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">
                      {formatStripeCurrency(summary.tradeSubtotal)}
                    </div>
                    <div className="text-xs text-slate-500 line-through">
                      {formatStripeCurrency(summary.retailSubtotal)} retail
                    </div>
                    <div className="text-xs text-emerald-700 dark:text-emerald-500">
                      Saves {formatStripeCurrency(summary.savings)} at trade • Est. delivery: 7–10 business days
                    </div>
                  </div>
                </div>
                {submitError ? <p className="mt-3 text-sm text-rose-600">{submitError}</p> : null}
                <button
                  type="button"
                  onClick={handleSubmitOrder}
                  disabled={!summary.pieces}
                  className="mt-4 w-full bg-slate-900 dark:bg-indigo-600 text-white py-3 rounded-lg font-medium hover:opacity-90 transition disabled:opacity-50"
                >
                  Submit Bulk Order
                </button>
                <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-gray-400">
                  Trade pricing and delivery windows are modeled demo figures, not a quote, print-ready
                  warranty, or live payment. Submitting copies this project into the local checkout lab so
                  you can review totals. No payment, identity, or artwork file is collected here.
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-500">Create a project to start a trade board.</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
