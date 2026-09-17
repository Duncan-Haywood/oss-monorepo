import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { clearSession, readSession } from "../auth/demoAuth";
import { DemoGuide } from "./DemoGuide";
import { EngagementSummary } from "./EngagementSummary";
import { EngagementTracker } from "./EngagementTracker";
import { storeProfile } from "../data/demoStore";
import type { DataSourceKind } from "../lib/pilot-kpis";

const ownerNav = [
  { to: "/value", label: "Business value" },
  { to: "/", label: "Overview", end: true },
  { to: "/funnel", label: "Funnel" },
  { to: "/products", label: "Products" },
  { to: "/experiments", label: "Experiments" },
  { to: "/trust", label: "Privacy & trust" },
] as const;

const operatorNav = [
  { to: "/", label: "Overview", end: true },
  { to: "/value", label: "Business value" },
  { to: "/funnel", label: "Funnel" },
  { to: "/products", label: "Products" },
  { to: "/experiments", label: "Experiments" },
  { to: "/trust", label: "Privacy & trust" },
] as const;

export function PortalShell({
  children,
  title,
  subtitle,
  dataSource = "illustrative",
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  dataSource?: DataSourceKind;
}) {
  const session = readSession();
  const isOwner = session?.role === "owner";
  const nav = isOwner ? ownerNav : operatorNav;

  function signOut() {
    clearSession();
    window.location.replace("/");
  }

  return (
    <div className="portal-layout">
      <EngagementTracker />
      <aside className="portal-sidebar">
        <div className="brand">
          <span className="brand-mark">RPI</span>
          <div>
            <strong>{storeProfile.name}</strong>
            <span>{storeProfile.location}</span>
          </div>
        </div>

        <nav aria-label="Portal sections">
          {nav.map(({ to, label, ...rest }) => (
            <NavLink
              key={to}
              to={to}
              end={"end" in rest ? rest.end : false}
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-meta">
          <span className={dataSource === "live" ? "pill pill-ok" : "pill pill-demo"}>
            {dataSource === "live" ? "Live SQLite" : "Illustrative data"}
          </span>
          <p>{storeProfile.pilotWeek}</p>
          <p className="muted">{storeProfile.lastSync}</p>
          <p className="role-tag">
            Signed in as <strong>{session?.role ?? "operator"}</strong>
          </p>
          {isOwner ? (
            <p className="sidebar-tip">
              Owner view — start at <strong>Business value</strong> for sales
              demos.
            </p>
          ) : null}
          <EngagementSummary />
          <button type="button" className="btn-ghost" onClick={signOut}>
            Sign out
          </button>
          <p className="sidebar-support">
            Free to run.{" "}
            <a href="https://github.com/sponsors/Duncan-Haywood" rel="noopener">
              Support
            </a>{" "}
            is entirely optional and never changes what this demo does.
          </p>
        </div>
      </aside>

      <div className="portal-main">
        <header className="portal-header">
          <div>
            <h1>{title}</h1>
            {subtitle ? <p className="header-sub">{subtitle}</p> : null}
          </div>
          <div className="header-badges">
            <span className="pill pill-ok">Edge online</span>
            <span className="pill pill-secure">LAN-only demo</span>
          </div>
        </header>
        <main className="portal-content">
          {children}
          <DemoGuide />
        </main>
      </div>
    </div>
  );
}
