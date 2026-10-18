// Self-check of the drivers in tests/helpers/knowledge-view-listbox.ts (like
// knowledge-view-site-all-runtime.test.tsx does for its runtime): a reference listbox
// written in this file, in the shape the acceptance tests expect, must satisfy every
// driver. It is test code only; it is not the implementation of the listbox.
import { describe, expect, it } from "vitest";
// The runtime registers its react / next mocks when it is imported, so it comes before them.
import { mountElement, navigations } from "../helpers/knowledge-view-site-all-runtime";
import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LABELS,
  LISTBOX_SECTIONS,
  activeLabel,
  chooseByClick,
  clickOutside,
  isExpanded,
  navigatedTo,
  open,
  optionLabels,
  options,
  press,
  stateHooks,
  trigger,
} from "../helpers/knowledge-view-listbox";

function Reference({ mode }: { mode: "push" | "link" }) {
  const router = useRouter();
  const [isOpen, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const btn = useRef<any>(null);
  const box = useRef<any>(null);
  const wrap = useRef<any>(null);
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const away = () => setOpen(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [isOpen]);
  useEffect(() => {
    if (isOpen) {
      box.current?.focus();
    }
  }, [isOpen]);
  const choose = (id: string) => {
    setOpen(false);
    router.push(`/knowledge/view?section=${id}`);
  };
  const last = LISTBOX_SECTIONS.length - 1;
  return (
    <main>
      <h1>Company</h1>
      <div ref={wrap} data-state={isOpen ? "open" : "closed"}>
        <button ref={btn} aria-label="Knowledge section" aria-haspopup="listbox" aria-expanded={isOpen} aria-controls="lb" onClick={() => setOpen(!isOpen)}>
          General Info
        </button>
        {isOpen && (
          <ul
            id="lb"
            ref={box}
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={`o-${LISTBOX_SECTIONS[active].id}`}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                setActive(Math.min(last, active + 1));
              } else if (e.key === "ArrowUp") {
                setActive(Math.max(0, active - 1));
              } else if (e.key === "Home") {
                setActive(0);
              } else if (e.key === "End") {
                setActive(last);
              } else if (e.key === "Enter" || e.key === " ") {
                choose(LISTBOX_SECTIONS[active].id);
              } else if (e.key === "Escape") {
                setOpen(false);
                btn.current?.focus();
              }
            }}
          >
            {LISTBOX_SECTIONS.map((s) => (
              <li key={s.id} id={`o-${s.id}`} role="option" aria-selected={s.id === "general"} onClick={mode === "push" ? () => choose(s.id) : undefined}>
                {mode === "link" ? <a href={`?section=${s.id}`}>{s.label}</a> : s.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

describe("listbox drivers against a reference listbox", () => {
  it("open, list, keys, Escape, outside click and state hook work", async () => {
    const view = await mountElement(<Reference mode="push" />);
    expect(isExpanded(view)).toBe("false");
    expect(stateHooks(view)).toEqual(["closed"]);
    await open(view);
    expect(stateHooks(view)).toContain("open");
    expect(optionLabels(view)).toEqual(LABELS);
    await press(view, "End");
    expect(activeLabel(view)).toBe("All sections");
    await press(view, "ArrowUp");
    expect(activeLabel(view)).toBe("Site Knowledge");
    await press(view, "Home");
    expect(activeLabel(view)).toBe("General Info");
    await press(view, "Escape");
    expect(isExpanded(view)).toBe("false");
    expect(options(view)).toHaveLength(0);
    await open(view);
    await clickOutside(view);
    expect(isExpanded(view)).toBe("false");
    expect(navigations()).toEqual([]);
  });

  it("keyboard selection and click selection are seen as navigation", async () => {
    const view = await mountElement(<Reference mode="push" />);
    await open(view);
    await press(view, "Home");
    await press(view, "ArrowDown");
    await press(view, " ");
    expect(navigatedTo(view)?.searchParams.get("section")).toBe("brand");
    await open(view);
    const { url } = await chooseByClick(view, "Key People");
    expect(url?.searchParams.get("section")).toBe("key-people");
  });

  it("a link inside an option counts as navigation to its href", async () => {
    const view = await mountElement(<Reference mode="link" />);
    await open(view);
    const { url } = await chooseByClick(view, "Site Knowledge");
    expect(url?.pathname).toBe("/knowledge/view");
    expect(url?.searchParams.get("section")).toBe("site");
    expect(trigger(view).tag).toBe("button");
  });
});
