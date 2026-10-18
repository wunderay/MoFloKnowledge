"use client";
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- entry content is a Record<string, any> by design (one editor handles every entry kind) */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { MAX_TEXT_LENGTH } from "@/contracts/primitives";
import { ApiError, api, companyPath, write } from "../shared/api-client";
import { Icon } from "../shared/icons";
import { InlineLine, useEntryAction, useTextField, type TextSpec } from "./inline-edit";

const KIND = "branding_and_style";
const HEX_HELP = "Enter a color as #RGB or #RRGGBB, for example #1A2B3C.";

/** #RGB or #RRGGBB as the contract's upper-case #RRGGBB, or null when the text is not a color. */
function normalizeHex(text: string): string | null {
  const value = text.trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return value.toUpperCase();
  }
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    // eslint-disable-next-line @typescript-eslint/no-misused-spread -- spreading a string by code point is intended (no grapheme splitting needed)
    return `#${[...value.slice(1)].map((digit) => digit + digit).join("").toUpperCase()}`;
  }
  return null;
}

/** The hex of the color with this id; typing a color of your own makes it the brand's confirmed color. */
function colorSpec(id: string, position: number): TextSpec {
  return {
    label: `Color ${position}`,
    kind: KIND,
    read: (content) => content.brand_colors?.find((color: { id: string }) => color.id === id)?.hex ?? "",
    apply: (content, text) => {
      const hex = normalizeHex(text);
      if (!hex) {
        return { error: HEX_HELP };
      }
      const color = content.brand_colors?.find((item: { id: string }) => item.id === id);
      if (!color) {
        return { error: "This color is no longer in the list." };
      }
      color.hex = hex;
      color.classification = "brand_guide_confirmed";
      return { content };
    },
  };
}

const addColor: TextSpec = {
  label: "color",
  action: "Add",
  kind: KIND,
  read: () => "",
  apply: (content, text) => {
    const hex = normalizeHex(text);
    if (!hex) {
      return { error: HEX_HELP };
    }
    content.brand_colors = [
      ...content.brand_colors,
      { id: crypto.randomUUID(), hex, alpha: 1, apparent_role: null, classification: "brand_guide_confirmed" },
    ];
    return { content };
  },
};

const addFont: TextSpec = {
  label: "font",
  action: "Add",
  kind: KIND,
  read: () => "",
  apply: (content, text) => {
    const family = text.trim();
    if (family.length > MAX_TEXT_LENGTH) {
      return { error: `Keep this to ${MAX_TEXT_LENGTH.toLocaleString("en-US")} characters or fewer.` };
    }
    content.fonts = [
      ...content.fonts,
      { id: crypto.randomUUID(), family: family || null, apparent_use: null, observations: [], brand_confirmed: true },
    ];
    return { content };
  },
};

/** The hex of one color, edited in place ("Edit Color N"). */
export function ColorHex({ id, position, hex }: { id: string; position: number; hex: string }) {
  return <InlineLine spec={colorSpec(id, position)} shown={hex} placeholder="+ color" />;
}

/** "Add color" or "Add font": a button that opens a text field; Enter adds the item. */
export function AddItem({ noun, className }: { noun: "color" | "font"; className?: string }) {
  const text = useTextField(noun === "color" ? addColor : addFont);
  if (!text) {
    return null;
  }
  return (
    <span className={className}>
      {text.control({ shown: null, placeholder: `+ Add ${noun}` })}
      {text.feedback}
    </span>
  );
}

type List = "brand_colors" | "fonts" | "logos";
/** The "×" button that removes one item of a list, with the outcome of the save under it. */
export function RemoveItem({ list, id, noun, position }: { list: List; id: string; noun: "Color" | "Font" | "Logo"; position: number }) {
  const action = useEntryAction(`${KIND}/remove ${list}`);
  if (!action) {
    return null;
  }
  return (
    <>
      <button
        type="button"
        className="knowledge-view__chip-remove"
        aria-label={`Remove ${noun} ${position}`}
        disabled={action.locked}
        onClick={() =>
          { action.run({
            kind: KIND,
            note: `Removed ${noun.toLowerCase()} from the knowledge view.`,
            transform: (content) => {
              content[list] = content[list].filter((item: { id: string }) => item.id !== id);
              return content;
            },
          }); }
        }
      >
        <span aria-hidden="true">×</span>
      </button>
      {action.feedback}
    </>
  );
}

/**
 * The company's display name, edited in place (null for a read-only view). The name is the company's own, saved with the
 * company rather than as an entry, so the save quotes the draft's generation. Returns the control for the banner heading and,
 * apart from it (a heading's text is the name), the message that says why a name was refused.
 */
export function useDisplayName(
  companyId: string,
  name: string,
  rename: { generation: number; blocked: boolean; onRenamed: () => Promise<void> } | undefined,
) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState("");
  const [saving, setSaving] = useState(false);
  const working = useRef(false);
  const field = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLSpanElement>(null);
  const back = useRef(false);
  const generation = rename?.generation ?? 0;
  const blocked = rename?.blocked ?? false;

  useEffect(() => {
    if (rename && editing) {
      const element = field.current;
      if (!element) {
        return;
      }
      element.focus();
      element.setSelectionRange(element.value.length, element.value.length);
    } else if (rename && back.current) {
      back.current = false;
      trigger.current?.focus();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- focus management runs only on `editing` transitions; `rename` changing must not steal focus
  }, [editing]);

  const open = () => {
    if (blocked || working.current) {
      return;
    }
    setDraft(name);
    setProblem("");
    setEditing(true);
  };
  const close = (refocus: boolean) => {
    back.current = refocus;
    setEditing(false);
    setProblem("");
  };
  async function commit(refocus: boolean) {
    if (working.current || !editing) {
      return;
    }
    const value = draft.trim();
    if (value === name) {
      close(refocus); return;
    }
    if (!value) {
      setProblem("Enter a name."); return;
    }
    if (value.length > 200) {
      setProblem("Keep the name to 200 characters or fewer."); return;
    }
    working.current = true;
    setSaving(true);
    setProblem("");
    try {
      await api(companyPath(companyId), write("PATCH", { name: value, expectedGeneration: generation }));
    } catch (failure) {
      working.current = false;
      setSaving(false);
      setProblem(
        failure instanceof ApiError && failure.status === 409
          ? "The company changed since the page was loaded. Reload the page to get the latest, then try again."
          : (failure as Error).message || "The name could not be saved.",
      );
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- this save path only runs for the editable name, which is the case where `rename` is set
      await rename!.onRenamed();
    } catch {
      // The name is saved; the view marks itself stale and offers a reload.
    }
    working.current = false;
    setSaving(false);
    close(refocus);
  }
  const keys = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!working.current) {
        close(true);
      }
    } else if (event.key === "Enter" && !event.nativeEvent?.isComposing) {
      event.preventDefault();
      void commit(true);
    }
  };
  if (!rename) {
    return null;
  }
  const control = !editing ? (
      <span
        ref={trigger}
        role="button"
        tabIndex={blocked ? -1 : 0}
        aria-disabled={blocked || undefined}
        aria-label="Edit Display name"
        title={blocked ? "Reload to see the latest before editing again." : "Click to edit"}
        className="knowledge-view__inline"
        onClick={open}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") {
            return;
          }
          event.preventDefault();
          open();
        }}
      >
        <span className="knowledge-view__inline-text">{name}</span>
        <Icon name="pencil" size={13} />
      </span>
    ) : (
      <input
        ref={field}
        type="text"
        className="knowledge-view__inline-input knowledge-view__inline-input--heading"
        aria-label="Display name"
        autoComplete="off"
        value={draft}
        readOnly={saving}
        aria-busy={saving || undefined}
        onChange={(event) => {
          setDraft(event.target.value);
          setProblem("");
        }}
        onKeyDown={keys}
        onBlur={() => {
          // A failed save waits for Enter instead of starting another.
          if (!problem) {
            void commit(false);
          }
        }}
      />
    );
  return {
    control,
    feedback: problem ? <span className="knowledge-view__inline-alert" role="alert">{problem}</span> : null,
  };
}
