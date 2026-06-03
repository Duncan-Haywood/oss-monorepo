import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { isDocsAuthRequired, readDocsSession } from "./auth/docsAuth";
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

export function App() {
  const [authed, setAuthed] = useState(
    () => !isDocsAuthRequired() || readDocsSession() !== null,
  );

  if (isDocsAuthRequired() && !authed) {
    return <DocsLoginGate onAuthenticated={() => setAuthed(true)} />;
  }

  return (
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
  );
}
