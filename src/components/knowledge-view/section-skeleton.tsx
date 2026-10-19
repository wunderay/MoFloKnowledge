import type { ReactNode } from "react";

/** The crawl states in which the company's knowledge is still being filled in. */
export const CRAWL_RUNNING = ["queued", "validating", "crawling", "extracting"];

const widths = ["w-90", "w-75", "w-60"];

/** A grey bar the size of one line of text or one title. */
const Bar = ({ kind = "line", index = 0 }: { kind?: "title" | "line"; index?: number }) => (
  <span className={`knowledge-view__skeleton-bar knowledge-view__skeleton-bar--${kind} knowledge-view__skeleton-bar--${widths[index % widths.length]}`} />
);

/**
 * Placeholder for a section that has no data yet while the crawl runs: a title, then either text lines
 * or list rows, so the page keeps the shape of the content that is about to arrive.
 */
export function SectionSkeleton({ label, shape }: { label: string; shape: "text" | "list" }): ReactNode {
  return (
    <section className="knowledge-view__card knowledge-view__skeleton" aria-busy="true">
      <span className="sr-only">{`Loading ${label}…`}</span>
      <div aria-hidden="true">
        <Bar kind="title" />
        {shape === "text"
          ? [0, 1, 2, 3].map((i) => <Bar key={i} index={i} />)
          : [0, 1, 2].map((i) => (
              <div className="knowledge-view__skeleton-row" key={i}>
                <Bar index={i} />
                <Bar index={i + 1} />
              </div>
            ))}
      </div>
    </section>
  );
}
