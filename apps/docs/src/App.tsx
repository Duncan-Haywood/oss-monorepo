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
import { GtmPage } from "./pages/GtmPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DemoPage } from "./pages/DemoPage";
import { CommercialViabilityPage } from "./pages/CommercialViabilityPage";
import { ArchiveIndexPage } from "./pages/ArchiveIndexPage";
import { ArchiveReportPage } from "./pages/ArchiveReportPage";

function RequireDocsAuth({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(() => readSession() !== null);
  const refresh = useCallback(() => setAuthed(readSession() !== null), []);

  if (!authed) {
    return <DocsLoginGate onAuthenticated={refresh} />;
  }
  return <>{children}</>;
}

function PrivateRoute({ element }: { element: ReactNode }) {
  return <RequireDocsAuth>{element}</RequireDocsAuth>;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<PrivateRoute element={<HomePage />} />} />
      <Route
        path="/business-plan"
        element={<PrivateRoute element={<BusinessPlanPage />} />}
      />
      <Route path="/gtm" element={<PrivateRoute element={<GtmPage />} />} />
      <Route path="/roi" element={<PrivateRoute element={<RoiPage />} />} />
      <Route
        path="/priorities"
        element={<Navigate to="/roi" replace />}
      />
      <Route path="/vision" element={<PrivateRoute element={<VisionPage />} />} />
      <Route
        path="/architecture"
        element={<PrivateRoute element={<ArchitecturePage />} />}
      />
      <Route path="/metrics" element={<PrivateRoute element={<MetricsPage />} />} />
      <Route path="/privacy" element={<PrivateRoute element={<PrivacyPage />} />} />
      <Route path="/roadmap" element={<PrivateRoute element={<RoadmapPage />} />} />
      <Route path="/demo" element={<PrivateRoute element={<DemoPage />} />} />
      <Route
        path="/dashboard"
        element={<PrivateRoute element={<DashboardPage />} />}
      />
      <Route
        path="/commercial-viability"
        element={<PrivateRoute element={<CommercialViabilityPage />} />}
      />
      <Route
        path="/archive"
        element={<PrivateRoute element={<ArchiveIndexPage />} />}
      />
      <Route
        path="/archive/:slug"
        element={<PrivateRoute element={<ArchiveReportPage />} />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
