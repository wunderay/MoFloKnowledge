"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar">
        <Link href="/dashboard" className="brand">
          <span className="brand__mark">◈</span>
          <span>
            MoFlo<span className="brand__light">Knowledge</span>
          </span>
        </Link>
        <p className="app-shell__label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          <Link
            className={
              path === "/dashboard"
                ? "app-shell__link app-shell__link--active"
                : "app-shell__link"
            }
            href="/dashboard"
          >
            <span aria-hidden>▦</span> Companies
          </Link>
        </nav>
        <div className="app-shell__note">
          <span className="app-shell__note-icon">↗</span>
          <strong>Knowledge you can trust</strong>
          <p>
            Every fact has a source.
            <br />
            Every change has a history.
          </p>
        </div>
        <div className="app-shell__footer">
          <span className="avatar">M</span>
          <div>
            Company workspace<small>Private to your members</small>
          </div>
        </div>
      </aside>
      <div className="app-shell__body">
        <header className="app-shell__topbar">
          <span>Company intelligence</span>
          <span className="app-shell__privacy">◉ Private workspace</span>
        </header>
        <main id="main-content" className="app-shell__main">
          {children}
        </main>
      </div>
    </div>
  );
}
