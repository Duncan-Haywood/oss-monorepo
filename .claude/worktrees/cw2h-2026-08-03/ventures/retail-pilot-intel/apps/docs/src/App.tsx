import { Navigate, Route, Routes, useParams } from "react-router-dom";
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
import {
  CommercialViabilityReportPage,
  CommercialViabilityAssessmentPage,
  CommercialViabilityDeepAssessmentPage,
  CommercialViabilityDeepDive2026Page,
  CommercialViabilityDeepDivePage,
} from "./pages/commercial-viability";

/** Maps legacy /reports/:slug and /archive/:slug URLs to TSX routes. */
const legacyReportRedirects: Record<string, string> = {
  "commercial-viability-report": "/commercial-viability/report",
  "docs-commercial-viability-report": "/commercial-viability/report",
  "commercial-viability-assessment": "/commercial-viability/assessment",
  "reports-commercial-viability-assessment": "/commercial-viability/assessment",
  "commercial-viability-deep-assessment": "/commercial-viability/deep-assessment",
  "reports-commercial-viability-deep-assessment": "/commercial-viability/deep-assessment",
  "commercial-viability-deep-dive-2026": "/commercial-viability/deep-dive-2026",
  "reports-commercial-viability-deep-dive-2026": "/commercial-viability/deep-dive-2026",
  "commercial-viability-deep-dive": "/commercial-viability/deep-dive",
  "reports-commercial-viability-deep-dive": "/commercial-viability/deep-dive",
};

function LegacyReportRedirect() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return <Navigate to="/commercial-viability" replace />;
  const target = legacyReportRedirects[slug];
  return <Navigate to={target ?? "/commercial-viability"} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/business-plan" element={<BusinessPlanPage />} />
      <Route path="/gtm" element={<GtmPage />} />
      <Route path="/roi" element={<RoiPage />} />
      <Route path="/priorities" element={<Navigate to="/roi" replace />} />
      <Route path="/vision" element={<VisionPage />} />
      <Route path="/architecture" element={<ArchitecturePage />} />
      <Route path="/metrics" element={<MetricsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/roadmap" element={<RoadmapPage />} />
      <Route path="/demo" element={<DemoPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/commercial-viability" element={<CommercialViabilityPage />} />
      <Route path="/commercial-viability/report" element={<CommercialViabilityReportPage />} />
      <Route path="/commercial-viability/assessment" element={<CommercialViabilityAssessmentPage />} />
      <Route path="/commercial-viability/deep-assessment" element={<CommercialViabilityDeepAssessmentPage />} />
      <Route path="/commercial-viability/deep-dive-2026" element={<CommercialViabilityDeepDive2026Page />} />
      <Route path="/commercial-viability/deep-dive" element={<CommercialViabilityDeepDivePage />} />
      <Route path="/reports" element={<Navigate to="/commercial-viability" replace />} />
      <Route path="/reports/:slug" element={<LegacyReportRedirect />} />
      <Route path="/archive" element={<Navigate to="/commercial-viability" replace />} />
      <Route path="/archive/:slug" element={<LegacyReportRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
