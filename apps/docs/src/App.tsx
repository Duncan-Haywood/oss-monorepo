import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { RequireDocsAuth } from "./components/RequireDocsAuth";
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
import { HtmlReportPage } from "./pages/HtmlReportPage";
import { ReportsIndexPage } from "./pages/ReportsIndexPage";

function Authed({ children }: { children: ReactNode }) {
  return <RequireDocsAuth>{children}</RequireDocsAuth>;
}

export function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <Authed>
            <HomePage />
          </Authed>
        }
      />
      <Route
        path="/business-plan"
        element={
          <Authed>
            <BusinessPlanPage />
          </Authed>
        }
      />
      <Route
        path="/gtm"
        element={
          <Authed>
            <GtmPage />
          </Authed>
        }
      />
      <Route
        path="/roi"
        element={
          <Authed>
            <RoiPage />
          </Authed>
        }
      />
      <Route path="/priorities" element={<Navigate to="/roi" replace />} />
      <Route
        path="/vision"
        element={
          <Authed>
            <VisionPage />
          </Authed>
        }
      />
      <Route
        path="/architecture"
        element={
          <Authed>
            <ArchitecturePage />
          </Authed>
        }
      />
      <Route
        path="/metrics"
        element={
          <Authed>
            <MetricsPage />
          </Authed>
        }
      />
      <Route
        path="/privacy"
        element={
          <Authed>
            <PrivacyPage />
          </Authed>
        }
      />
      <Route
        path="/roadmap"
        element={
          <Authed>
            <RoadmapPage />
          </Authed>
        }
      />
      <Route
        path="/demo"
        element={
          <Authed>
            <DemoPage />
          </Authed>
        }
      />
      <Route
        path="/dashboard"
        element={
          <Authed>
            <DashboardPage />
          </Authed>
        }
      />
      <Route
        path="/reports"
        element={
          <Authed>
            <ReportsIndexPage />
          </Authed>
        }
      />
      <Route
        path="/reports/:slug"
        element={
          <Authed>
            <HtmlReportPage />
          </Authed>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
