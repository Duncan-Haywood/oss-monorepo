import { useEffect, useState } from "react";
import { recordEngagementEvent } from "./engagement-log";
import {
  getPilotApiUrl,
  illustrativeKpiView,
  loadPilotKpiView,
  unreachableKpiView,
  type PilotKpiView,
} from "./pilot-kpis";

export function usePilotKpis(): { view: PilotKpiView; loading: boolean } {
  const apiUrl = getPilotApiUrl();
  const [view, setView] = useState<PilotKpiView>(() => illustrativeKpiView());
  const [loading, setLoading] = useState(Boolean(apiUrl));

  useEffect(() => {
    if (!apiUrl) {
      setView(illustrativeKpiView());
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void loadPilotKpiView(apiUrl)
      .then((next) => {
        if (cancelled) return;
        setView(next);
        recordEngagementEvent({
          name: "kpis_live_viewed",
          path: "/",
          createdAt: new Date().toISOString(),
        });
      })
      .catch(() => {
        if (cancelled) return;
        setView(unreachableKpiView());
        recordEngagementEvent({
          name: "kpis_api_unreachable",
          path: "/",
          createdAt: new Date().toISOString(),
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  return { view, loading };
}
