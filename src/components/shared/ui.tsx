"use client";
import { useEffect, useRef, useState } from "react";
export function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`status-badge status-badge--${value}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`notice${error ? " notice--error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon" aria-hidden>
        ◇
      </span>
      <h3>{title}</h3>
      {children}
    </div>
  );
}
export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const target = dialog.current?.querySelector<HTMLElement>(
      "input, button, select, textarea, a[href]",
    );
    target?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="dialog"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onClose();
          }
          if (e.key === "Tab") {
            const nodes = Array.from(
              dialog.current?.querySelectorAll<HTMLElement>(
                'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
              ) ?? [],
            );
            const first = nodes[0],
              last = nodes.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="section-heading">
          <h2>{title}</h2>
          <button
            className="button button--quiet"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

/** Keep server-rendered mutation controls inert until their handlers are attached. */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  return hydrated;
}
