"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { KNOWLEDGE_SECTIONS, sectionLabel, type KnowledgeSectionId } from "./sections";

const last = KNOWLEDGE_SECTIONS.length - 1;
const indexOf = (id: KnowledgeSectionId) => Math.max(0, KNOWLEDGE_SECTIONS.findIndex((item) => item.id === id));

/**
 * The "Knowledge section" control: a button that opens a listbox of the sections.
 * Arrow keys, Home and End move through the options, Enter or Space selects one,
 * Escape and a press outside close it. `data-state` drives the open/closed animation.
 */
export function SectionListbox({ value, onSelect }: { value: KnowledgeSectionId; onSelect: (id: KnowledgeSectionId) => void }) {
  const base = useId();
  const labelId = `${base}-label`;
  const triggerId = `${base}-trigger`;
  const listId = `${base}-list`;
  const optionId = (id: string) => `${base}-option-${id}`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(indexOf(value));
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  /** Space selected an option: its keyup would otherwise click the trigger (Firefox) and reopen the list. */
  const swallowKeyup = useRef(false);
  const state = open ? "open" : "closed";

  useEffect(() => {
    if (!open) {
      return;
    }
    list.current?.focus();
    const away = (event: Event) => {
      if (!wrap.current?.contains(event.target as Node | null)) {
        setOpen(false);
      }
    };
    const types = ["pointerdown", "mousedown", "touchstart", "focusin"];
    for (const type of types) {
      document.addEventListener(type, away);
    }
    return () => {
      for (const type of types) {
        document.removeEventListener(type, away);
      }
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      document.getElementById(optionId(KNOWLEDGE_SECTIONS[active].id))?.scrollIntoView?.({ block: "nearest" });
    }
  }, [open, active]);

  const show = () => {
    swallowKeyup.current = false;
    setActive(indexOf(value));
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const choose = (index: number) => {
    const next = KNOWLEDGE_SECTIONS[index].id;
    close();
    onSelect(next);
  };
  const onTriggerKeyUp = (event: KeyboardEvent) => {
    if (event.key === " " && swallowKeyup.current) {
      event.preventDefault();
    }
    swallowKeyup.current = false;
  };
  const onTriggerKey = (event: KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    event.preventDefault();
    if (!open) {
      show();
    }
  };
  const onListKey = (event: KeyboardEvent) => {
    const move = (to: number) => {
      event.preventDefault();
      setActive(to);
    };
    if (event.key === "ArrowDown") {
      move(Math.min(last, active + 1));
    } else if (event.key === "ArrowUp") {
      move(Math.max(0, active - 1));
    } else if (event.key === "Home") {
      move(0);
    } else if (event.key === "End") {
      move(last);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      swallowKeyup.current = event.key === " ";
      choose(active);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div className="knowledge-view__listbox" data-state={state} ref={wrap}>
      <span className="sr-only" id={labelId} hidden>Knowledge section</span>
      <button
        type="button"
        id={triggerId}
        ref={trigger}
        className="knowledge-view__listbox-trigger"
        data-state={state}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${labelId} ${triggerId}`}
        onClick={() => { open ? close() : show(); }}
        onKeyDown={onTriggerKey}
        onKeyUp={onTriggerKeyUp}
      >
        <span>{sectionLabel(value)}</span>
        <span className="knowledge-view__listbox-chevron" aria-hidden="true" />
      </button>
      <ul
        id={listId}
        ref={list}
        role="listbox"
        tabIndex={-1}
        className="knowledge-view__listbox-list"
        data-state={state}
        hidden={!open}
        aria-labelledby={labelId}
        aria-activedescendant={open ? optionId(KNOWLEDGE_SECTIONS[active].id) : undefined}
        onKeyDown={onListKey}
      >
        {KNOWLEDGE_SECTIONS.map((item, index) => (
          <li
            key={item.id}
            id={optionId(item.id)}
            data-section={item.id}
            role="option"
            aria-selected={item.id === value}
            className={`knowledge-view__listbox-option${index === active ? " knowledge-view__listbox-option--active" : ""}`}
            onMouseDown={(event) => { event.preventDefault(); }}
            onMouseMove={() => active !== index && setActive(index)}
            onClick={() => { choose(index); }}
          >
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
