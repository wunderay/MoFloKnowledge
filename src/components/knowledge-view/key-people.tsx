"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createEmptyProvenance, type Person } from "@/contracts";
import { Icon } from "../shared/icons";
import { api, companyPath, write } from "../shared/api-client";
import { initialsOf, textOrNull, type ViewPerson } from "./data";
import { DeletePerson, PortraitControl } from "./person-actions";
import { addHref, CoverageNote, EmptyBox, Field, ItemSource, Source } from "./parts";

/** How each field is named in its evidence control: "Sources: evidence for position of <name>". */
const NOUNS = { name: "name", title: "position", role: "role", age: "age", gender: "gender", nationality: "nationality", background_or_relevance: "description" };
type Key = keyof typeof NOUNS;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The portrait's address: always the company's uploads route for the stored reference id. The stored path, and
 * any other address a stored value might carry, is never used.
 */
function portraitSrc(companyId: string, person: Person): string | null {
  const id = person.portrait?.id;
  return typeof id === "string" && UUID.test(id) ? companyPath(companyId, `/uploads/${id}`) : null;
}

/** The portrait, or the person's initials (or a generic mark when there is no name). */
function Avatar({ companyId, person, label, large = false }: { companyId: string; person: Person; label: string; large?: boolean }) {
  const src = portraitSrc(companyId, person);
  const size = large ? " knowledge-view__avatar--large" : "";
  // In the list the name sits next to the avatar, so the image is decorative there.
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- user-supplied remote image URLs; next/image would need remotePatterns for arbitrary hosts
    return <img className={`knowledge-view__avatar${size}`} src={src} alt={large ? `Portrait of ${label}` : ""} />;
  }
  const initials = initialsOf(person.name);
  return (
    <span className={`knowledge-view__avatar knowledge-view__avatar--initials${size}`} aria-hidden="true">
      {initials || <Icon name="users" size={large ? 28 : 16} />}
    </span>
  );
}

function PersonDetail({
  companyId,
  item,
  title,
  editable,
  blocked,
  onSaved,
  onDeleted,
}: {
  companyId: string;
  item: ViewPerson;
  /** The name shown in the list, which also names this person's evidence controls. */
  title: string;
  editable: boolean;
  blocked: boolean;
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const { person, evidence } = item;
  // "+ Add" opens the editor on this person; without entryId it would open the first one.
  const href = `${addHref(companyId, "key_person")}&entryId=${encodeURIComponent(person.id)}`;
  const base = `/key_people/@${person.id}`;
  const field = (label: string, key: Key, value: ReactNode | null, empty: { title: string; hint: string }) => (
    <Field
      label={label}
      source={<Source evidence={evidence} path={`${base}/${key}`} filled={value !== null} name={`${NOUNS[key]} of ${title}`} />}
    >
      {value !== null ? (
        <>
          {value}
          <CoverageNote evidence={evidence} path={`${base}/${key}`} empty={false} />
        </>
      ) : (
        <EmptyBox title={empty.title} hint={empty.hint} href={href} note={<CoverageNote evidence={evidence} path={`${base}/${key}`} empty />} />
      )}
    </Field>
  );
  const text = (value: string | null) => (value === null ? null : <p className="knowledge-view__text">{value}</p>);
  // An age of 0 is a value; only a missing one is empty.
  const age = person.age === null || person.age === undefined ? null : <p className="knowledge-view__text">{person.age}</p>;
  return (
    <section className="knowledge-view__person-detail" aria-label={`Details of ${title}`}>
      <div className="knowledge-view__person-head">
        <Avatar companyId={companyId} person={person} label={title} large />
        <div className="knowledge-view__person-head-text">
          <p className="knowledge-view__person-title">{title}</p>
          {editable && <PortraitControl key={person.id} companyId={companyId} item={item} blocked={blocked} onSaved={onSaved} />}
        </div>
        {editable && <DeletePerson key={person.id} companyId={companyId} item={item} title={title} blocked={blocked} onDeleted={onDeleted} />}
      </div>
      <div className="knowledge-view__field-pair">
        {field("Name", "name", text(textOrNull(person.name)), { title: "No name yet", hint: "Name this person." })}
        {field("Position", "title", text(textOrNull(person.title)), { title: "No position yet", hint: "For example, Co-founder and CEO." })}
      </div>
      {field("Role", "role", text(textOrNull(person.role)), { title: "No role yet", hint: "Their role is set in the full editor." })}
      <div className="knowledge-view__field-pair">
        {field("Age", "age", age, { title: "No age yet", hint: "Add their age if you want it shown." })}
        {field("Gender", "gender", text(textOrNull(person.gender)), { title: "No gender yet", hint: "Only what they have said about themselves." })}
      </div>
      {field("Nationality", "nationality", text(textOrNull(person.nationality)), { title: "No nationality yet", hint: "Add where they are from." })}
      {field("Description", "background_or_relevance", text(textOrNull(person.background_or_relevance)), {
        title: "No description yet",
        hint: "Say why this person matters to the company.",
      })}
    </section>
  );
}

/** What a new person starts as: only a name the owner can change in the editor, everything else empty. */
function newPerson(): Person {
  return {
    id: crypto.randomUUID(),
    name: "Untitled person",
    title: null,
    role: null,
    gender: null,
    background_or_relevance: null,
    age: null,
    nationality: null,
    portrait: null,
  };
}

/**
 * Key People: every person on the left and the selected person's detail on the right. An editable draft
 * adds a person, deletes the selected one and uploads their portrait; a saved version or a viewer only reads.
 */
export function KeyPeople({
  companyId,
  people,
  selectedId,
  onSelect,
  canEdit = false,
  blocked = false,
  onSaved = () => Promise.resolve(),
}: {
  companyId: string;
  people: ViewPerson[];
  /** The `person` URL value; one that matches nobody selects the first person. */
  selectedId: string;
  onSelect: (id: string) => void;
  canEdit?: boolean;
  /** The view is older than a saved change: nothing is written until it is reloaded. */
  blocked?: boolean;
  /** Reloads the draft after a save. It resolves once the save is committed, even if the reload failed. */
  onSaved?: () => Promise<void>;
}) {
  const href = addHref(companyId, "key_person");
  const found = people.findIndex((item) => item.person.id === selectedId);
  const selected = found < 0 ? 0 : found;
  const titles = people.map((item, index) => textOrNull(item.person.name) ?? `Untitled person ${index + 1}`);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const creating = useRef(false);
  const add = useRef<HTMLButtonElement>(null);
  const rows = useRef(new Map<string, HTMLButtonElement>());
  // Where focus goes once the list shows the result of an action: a person's row, or "selected" for whoever is selected.
  const [focusTo, setFocusTo] = useState<string | null>(null);
  const selectedPerson = people[selected]?.person.id ?? "";

  useEffect(() => {
    if (!focusTo) {
      return;
    }
    const target = focusTo === "selected" ? (rows.current.get(selectedPerson) ?? add.current) : rows.current.get(focusTo);
    if (!target) {
      return;
    } // the list has not caught up yet
    target.focus();
    setFocusTo(null);
  }, [focusTo, people.length, selectedPerson]);

  async function addPerson() {
    if (creating.current) {
      return;
    }
    creating.current = true;
    setAdding(true);
    setError("");
    try {
      const content = newPerson();
      await api(
        companyPath(companyId, "/entries"),
        write("POST", { kind: "key_person", content, provenance: createEmptyProvenance(), requestId: crypto.randomUUID() }),
      );
      setFocusTo(content.id);
      await onSaved();
      onSelect(content.id);
    } catch (failure) {
      setError((failure as Error).message || "The person could not be added.");
    } finally {
      creating.current = false;
      setAdding(false);
    }
  }
  async function afterDelete() {
    await onSaved();
    onSelect("");
    setFocusTo("selected");
  }

  return (
    <>
      <div className="knowledge-view__section-head">
        <div>
          <h2 className="knowledge-view__section-title">
            Key People <span className="knowledge-view__count">{people.length}</span>
          </h2>
          <p className="knowledge-view__section-subtitle">
            The people who represent your company, such as founders, leaders and spokespeople. Pick a person on the left to see their details.
          </p>
        </div>
        {canEdit && (
          <button
            ref={add}
            type="button"
            className="knowledge-view__primary-add"
            onClick={() => void addPerson()}
            disabled={adding || blocked}
            aria-busy={adding}
            title={blocked ? "Reload to see the latest changes before adding a person." : undefined}
          >
            Add person
          </button>
        )}
      </div>
      {error && <p className="knowledge-view__dialog-error knowledge-view__people-error" role="alert">{error}</p>}
      {people.length === 0 ? (
        <EmptyBox title="No key people yet" hint="Add the people your content should name or quote." href={href} />
      ) : (
        <div className="knowledge-view__people-layout">
          <ul className="knowledge-view__people-list" aria-label="Key people">
            {people.map((item, index) => {
              const { person, evidence } = item;
              const position = textOrNull(person.title);
              return (
                <li
                  className={`knowledge-view__person${index === selected ? " knowledge-view__person--selected" : ""}`}
                  key={person.id}
                >
                  <button
                    ref={(element) => {
                      if (element) {
                        rows.current.set(person.id, element);
                      } else {
                        rows.current.delete(person.id);
                      }
                    }}
                    type="button"
                    className="knowledge-view__person-button"
                    aria-current={index === selected ? "true" : undefined}
                    onClick={() => { onSelect(person.id); }}
                  >
                    <Avatar companyId={companyId} person={person} label={titles[index]} />
                    <span className="knowledge-view__person-text">
                      <strong>{titles[index]}</strong>
                      {position && <small>{position}</small>}
                    </span>
                  </button>
                  <ItemSource evidence={evidence} path={`/key_people/@${person.id}`} name={titles[index]} />
                </li>
              );
            })}
          </ul>
          <PersonDetail
            key={people[selected].person.id}
            companyId={companyId}
            item={people[selected]}
            title={titles[selected]}
            editable={canEdit}
            blocked={blocked}
            onSaved={onSaved}
            onDeleted={afterDelete}
          />
        </div>
      )}
    </>
  );
}
