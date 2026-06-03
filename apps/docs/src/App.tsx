import { useCallback, useState, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { readSession } from "./auth/docsAuth";
import { DocsLoginGate } from "./components/DocsLoginGate";
import { HomePage } from "./pages/HomePage";
import { VisionPage } from "./pages/VisionPage";
import { ArchitecturePage } from "./pages/ArchitecturePage";
import { MetricsPage } from "./pages/MetricsPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { RoadmapPage } from "./pages/RoadmapPage";
import { RoiPage } from "./pages/RoiPage";
import { BusinessPlanPage } from "./pages/BusinessPlanPage";
import { DashboardPage } from "./pages/DashboardPage";

function RequireAuth({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(() => readSession() !== null);
  const refresh = useCallback(() => setAuthed(readSession() !== null), []);

  if (!authed) {
    return <DocsLoginGate onAuthenticated={refresh} />;
  }
  return <>{children}</>;
}

export function App() {
  return (
    <RequireAuth>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/business-plan" element={<BusinessPlanPage />} />
      <Route path="/roi" element={<RoiPage />} />
      <Route path="/priorities" element={<Navigate to="/roi" replace />} />
      <Route path="/vision" element={<VisionPage />} />
      <Route path="/architecture" element={<ArchitecturePage />} />
      <Route path="/metrics" element={<MetricsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/roadmap" element={<RoadmapPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </RequireAuth>
  );
}
