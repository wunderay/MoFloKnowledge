// Guard for the interactive runtime the Site Knowledge / All sections tests drive: it must behave like a
// browser for the ways a dialog can reasonably be built (state, effects with cleanup, refs and focus,
// portals, document-level Escape, native <dialog>, forms, async fetches). These tests pass on the base commit.
import { describe, expect, it } from "vitest";
// The runtime registers its react / react-dom mocks when it is imported, so it comes before them.
import { mountElement } from "../helpers/knowledge-view-site-all-runtime";
import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

function Counter() {
  const [count, setCount] = useState(0);
  const id = useId();
  return (
    <div>
      <button type="button" aria-describedby={id} onClick={() => setCount(count + 1)}>Add one</button>
      <span id={id}>count {count}</span>
    </div>
  );
}

function Modal({ via }: { via: "portal" | "inline" | "native" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nativeRef = useRef<HTMLDialogElement>(null);
  const [log, setLog] = useState<string[]>([]);
  useEffect(() => {
    if (!open) {
      return;
    }
    ref.current?.focus();
    nativeRef.current?.showModal();
    document.getElementById("first-field")?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", key);
    setLog((l) => [...l, "opened"]);
    return () => {
      document.removeEventListener("keydown", key);
      setLog((l) => [...l, "closed"]);
    };
  }, [open]);
  const body = (
    <div role="dialog" aria-modal="true" aria-label="Pick pages" ref={ref} tabIndex={-1}>
      <label><input id="first-field" type="checkbox" onChange={() => {}} /> Shop</label>
      <button type="button" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      <output>{log.join(",")}</output>
      {open && via === "portal" && createPortal(body, document.body)}
      {open && via === "inline" && body}
      {open && via === "native" && <dialog ref={nativeRef} aria-label="Pick pages">{body}</dialog>}
    </div>
  );
}

function Loader() {
  const [rows, setRows] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(0);
  useEffect(() => {
    void fetch("/api/companies/x/sources").then((r) => r.json()).then((b) => setRows(b.data.rows ?? ["none"]));
  }, []);
  return (
    <form onSubmit={(e) => { e.preventDefault(); setSaved((n) => n + 1); }}>
      <p>{rows ? rows.join(" ") : "Loading"}</p>
      <button>Save</button>
      <p>saved {saved}</p>
    </form>
  );
}

describe("the interactive runtime behaves like a browser", () => {
  // guard
  it("keeps state, re-renders, and a handle taken before the click still reaches the current handler", async () => {
    const view = await mountElement(<Counter />);
    const [button] = view.byRole("button", "Add one");
    await view.click(button);
    await view.click(button);
    await view.click(button);
    expect(view.text()).toContain("count 3");
    expect(view.html()).toMatch(/aria-describedby="(:t\d+:)"[^>]*>Add one<\/button><span id="\1">/);
  });

  // guard
  it.each(["portal", "inline", "native"] as const)("opens a %s dialog, moves focus into it and closes it with Escape and Cancel", async (via) => {
    const view = await mountElement(<Modal via={via} />);
    expect(view.dialogs()).toHaveLength(0);
    await view.click(view.byRole("button", "Open")[0]);
    await view.settle();
    const dialogs = view.dialogs();
    expect(dialogs.length).toBeGreaterThanOrEqual(1);
    expect(view.focusMovedInto(dialogs[0])).toBe(true);
    expect(view.text()).toContain("opened");
    await view.press(dialogs[0], "Escape");
    await view.settle();
    expect(view.dialogs()).toHaveLength(0);
    expect(view.text()).toContain("opened,closed");
    await view.click(view.byRole("button", "Open")[0]);
    await view.click(view.byRole("button", "Cancel")[0]);
    await view.settle();
    expect(view.dialogs()).toHaveLength(0);
  });

  // guard
  it("names a checkbox by its wrapping label and checks it", async () => {
    const view = await mountElement(<Modal via="inline" />);
    await view.click(view.byRole("button", "Open")[0]);
    const [box] = view.byRole("checkbox", /shop/i);
    expect(box).toBeDefined();
    expect(view.nameOf(box)).toBe("Shop");
    expect(await view.check(box, true)).toBe(true);
  });

  // guard
  it("serves an async fetch, then submits a form from its submit button", async () => {
    const view = await mountElement(<Loader />);
    expect(view.text()).toContain("none");
    await view.click(view.byRole("button", "Save")[0]);
    expect(view.text()).toContain("saved 1");
    expect(view.server.gets.map((r) => r.path)).toEqual(["/api/companies/x/sources"]);
  });
});
