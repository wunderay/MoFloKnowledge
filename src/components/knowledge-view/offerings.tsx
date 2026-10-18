"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createEmptyProvenance, createEntryDefault, type Offering } from "@/contracts";
import { api, companyPath, write } from "../shared/api-client";
import { Icon, type IconName } from "../shared/icons";
import { textOrNull, type ViewOffering } from "./data";
import { InlineArea, InlineChips, InlineLine, entryScope, plainText, useEdit, type ListSpec, type TextSpec } from "./inline-edit";
import { addHref, CoverageNote, EmptyBox, Field, ItemSource, Source } from "./parts";

const UNDO_MS = 10000;
const COST_HELP = "Enter a number, for example 49.99.";

/** Cost is a plain decimal (49.99): it is saved as a paid price with that amount, and an empty text clears the price. */
const costSpec = (kind: TextSpec["kind"]): TextSpec => ({
  label: "Offering cost",
  kind,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- entry content is a Record<string, any> by design (one editor handles every entry kind)
  read: (content) => (typeof content.pricing?.amount === "string" ? content.pricing.amount : ""),
  apply: (content, text) => {
    const value = text.trim();
    if (value === "") {
      content.pricing = null;
      return { content };
    }
    if (/^-\s*\d/.test(value)) {
      return { error: "Cost cannot be negative. Enter 0 or more." };
    }
    if (!/^\d+(\.\d+)?$/.test(value)) {
      return { error: COST_HELP };
    }
    const amount = value.replace(/^0+(?=\d)/, "");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- entry content is a Record<string, any> by design (one editor handles every entry kind)
    content.pricing = {
      billing_interval: null,
      pricing_model: null,
      qualifications: [],
      currency: null,
      as_of: null,
      ...content.pricing,
      kind: "paid",
      raw: amount,
      amount,
      min_amount: null,
      max_amount: null,
    };
    return { content };
  },
});
/**
 * The editors of one offering. Each offering is its own scope of the editing environment (see `entryScope`), so what was typed,
 * a save in progress and its outcome stay with that offering, whichever offering or section is shown.
 */
function editorsOf(entryId: string) {
  const kind = entryScope("offering", entryId);
  return {
    name: plainText("Offering name", kind, "name"),
    type: plainText("Offering type", kind, "offering_type"),
    description: plainText("Offering description", kind, "description"),
    cost: costSpec(kind),
    features: { noun: "key feature", kind, key: "features" } as ListSpec,
  };
}

/** What the Cost card shows, and the field that holds it: the price wording, else amount with currency and interval, else free/contact. */
function costOf(pricing: Offering["pricing"]): { text: string; path: string } | null {
  if (!pricing) {
    return null;
  }
  const raw = textOrNull(pricing.raw);
  if (raw) {
    return { text: raw, path: "pricing/raw" };
  }
  const amount = textOrNull(pricing.amount);
  if (amount) {
    const text = [amount, textOrNull(pricing.currency)].filter(Boolean).join(" ");
    const interval = textOrNull(pricing.billing_interval);
    // Built from several fields, so the whole pricing is its evidence.
    return { text: interval ? `${text} / ${interval}` : text, path: "pricing" };
  }
  if (pricing.kind === "free") {
    return { text: "Free", path: "pricing/kind" };
  }
  if (pricing.kind === "contact_for_pricing") {
    return { text: "Contact for pricing", path: "pricing/kind" };
  }
  return null;
}

/** How each field is named in its evidence control: "Sources: evidence for cost of <offering>". */
const NOUNS = { name: "name", type: "type", description: "description", features: "key features", cost: "cost", model: "pricing model" };

function OfferingDetail({
  companyId,
  item,
  title,
  onDelete,
  deleting,
}: {
  companyId: string;
  item: ViewOffering;
  /** The name shown in the list, which also names this offering's evidence controls. */
  title: string;
  /** Deletes this offering (an editable draft only; read-only views pass nothing). */
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const edit = useEdit();
  const editors = editorsOf(item.entryId);
  const { offering, evidence } = item;
  // "+ Add" opens the editor on this offering; without entryId it would open the first one.
  const href = `${addHref(companyId, "offering")}&entryId=${encodeURIComponent(offering.id)}`;
  const base = `/offerings/@${offering.id}`;
  const name = textOrNull(offering.name);
  const type = textOrNull(offering.offering_type);
  const description = textOrNull(offering.description);
  const features = offering.features.filter((feature) => feature.text.trim());
  const cost = costOf(offering.pricing);
  const model = textOrNull(offering.pricing?.pricing_model);
  const paths = {
    name: `${base}/name`,
    type: `${base}/offering_type`,
    description: `${base}/description`,
    features: `${base}/features`,
    cost: cost ? `${base}/${cost.path}` : `${base}/pricing`,
    model: `${base}/pricing/pricing_model`,
  };
  // One field's value (or its empty state), with its source control and coverage reason.
  const field = (
    label: string,
    key: keyof typeof paths,
    value: ReactNode | null,
    empty: { title: string; hint: string },
    icon?: IconName,
    /** An editable draft's control, in place of the value and its empty state. */
    editor?: ReactNode,
  ) => (
    <Field
      label={label}
      icon={icon}
      source={<Source evidence={evidence} path={paths[key]} filled={value !== null} name={`${NOUNS[key]} of ${title}`} />}
    >
      {editor ? (
        editor
      ) : value !== null ? (
        <>
          {value}
          <CoverageNote evidence={evidence} path={paths[key]} empty={false} />
        </>
      ) : (
        <EmptyBox
          title={empty.title}
          hint={empty.hint}
          href={href}
          note={<CoverageNote evidence={evidence} path={paths[key]} empty />}
        />
      )}
    </Field>
  );
  const text = (value: string | null) => (value === null ? null : <p className="knowledge-view__text">{value}</p>);
  const note = (key: keyof typeof paths, empty: boolean) => <CoverageNote evidence={evidence} path={paths[key]} empty={empty} />;
  // An editable draft edits each value in place.
  const line = (spec: TextSpec, key: keyof typeof paths, value: string | null, placeholder: string) =>
    edit && (
      <>
        <InlineLine spec={spec} shown={value} placeholder={placeholder} />
        {note(key, value === null)}
      </>
    );
  return (
    <section className="knowledge-view__offering-detail" aria-label={`Details of ${title}`}>
      {onDelete && (
        <div className="knowledge-view__offering-actions">
          <button
            type="button"
            className="knowledge-view__site-add knowledge-view__danger"
            aria-label={`Delete ${title}`}
            disabled={deleting || edit?.blocked}
            title={edit?.blocked ? "Reload to see the latest changes before deleting." : undefined}
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
      )}
      {field("Offering", "name", text(name), { title: "No name yet", hint: "Name this offering." }, undefined, line(editors.name, "name", name, "+ Add name"))}
      {field("Type", "type", text(type), { title: "No type yet", hint: "For example, a subscription or a service." }, undefined, line(editors.type, "type", type, "+ Add type"))}
      {field(
        "Description",
        "description",
        text(description),
        { title: "No description yet", hint: "Say what this offering is." },
        undefined,
        edit && (
          <InlineArea
            spec={editors.description}
            value={description}
            empty={{ title: "No description yet", hint: "Say what this offering is." }}
            note={note("description", description === null)}
          />
        ),
      )}
      {field(
        "Key features",
        "features",
        features.length > 0 ? (
          <ul className="knowledge-view__list">
            {features.map((feature) => (
              <li key={feature.id}>
                <span>{feature.text}</span>
                <ItemSource evidence={evidence} path={`${paths.features}/@${feature.id}`} name={feature.text.trim()} />
              </li>
            ))}
          </ul>
        ) : null,
        { title: "No features yet", hint: "List what makes it worth choosing." },
        undefined,
        edit && (
          <>
            <InlineChips
              list={editors.features}
              items={features.map((feature) => ({
                id: feature.id,
                label: feature.text.trim(),
                mark: <ItemSource evidence={evidence} path={`${paths.features}/@${feature.id}`} name={feature.text.trim()} />,
              }))}
            />
            {note("features", features.length === 0)}
          </>
        ),
      )}
      <div className="knowledge-view__field-pair">
        {field(
          "Cost",
          "cost",
          text(cost?.text ?? null),
          { title: "No cost yet", hint: "Add the price or how it is quoted." },
          "dollar",
          line(editors.cost, "cost", cost?.text ?? null, "+ Add cost"),
        )}
        {field(
          "Pricing model",
          "model",
          text(model),
          { title: "No pricing model yet", hint: "For example, monthly or one-time." },
          "tag",
        )}
      </div>
    </section>
  );
}

/** Business Offerings: a list of every offering and the detail of the selected one. An editable draft adds, edits and deletes offerings. */
export function BusinessOfferings({
  companyId,
  offerings,
  selectedId,
  onSelect,
  canEdit = false,
  blocked = false,
  onSaved = () => Promise.resolve(),
}: {
  companyId: string;
  offerings: ViewOffering[];
  /** The `offering` URL value; one that matches no offering selects the first. */
  selectedId: string;
  onSelect: (id: string) => void;
  canEdit?: boolean;
  /** The view is older than a saved change: nothing is written until it is reloaded. */
  blocked?: boolean;
  /** Reloads the draft after a save. It resolves once the save is committed, even if the reload failed. */
  onSaved?: () => Promise<void>;
}) {
  const outer = useEdit();
  const editable = canEdit && outer !== null;
  const href = addHref(companyId, "offering");
  const found = offerings.findIndex((item) => item.offering.id === selectedId);
  const selected = found < 0 ? 0 : found;
  const titles = offerings.map((item, index) => textOrNull(item.offering.name) ?? `Untitled offering ${index + 1}`);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const busy = useRef(false);
  /** The offering just deleted, which Undo puts back. */
  const [deleted, setDeleted] = useState<{ title: string; offeringId: string; entryId: string } | null>(null);
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const [focusTo, setFocusTo] = useState<string | null>(null);

  useEffect(() => {
    if (!focusTo) {
      return;
    }
    const target = rows.current.get(focusTo);
    if (!target) {
      return;
    } // the list has not caught up yet
    target.focus();
    setFocusTo(null);
  }, [focusTo, offerings.length]);
  useEffect(() => {
    if (!deleted) {
      return;
    }
    const timer = setTimeout(() => { setDeleted(null); }, UNDO_MS);
    return () => { clearTimeout(timer); };
  }, [deleted]);

  /** Runs one request; only one at a time. A failure shows the server's message. */
  async function run(request: () => Promise<void>, failed: string) {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setWorking(true);
    setError("");
    try {
      await request();
    } catch (failure) {
      setError((failure as Error).message || failed);
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }
  /** Creates an offering entry, reloads the draft and selects it. */
  const create = async (content: Offering) => {
    await api(
      companyPath(companyId, "/entries"),
      write("POST", { kind: "offering", content, provenance: createEmptyProvenance(), requestId: crypto.randomUUID() }),
    );
    setFocusTo(content.id);
    await onSaved();
    onSelect(content.id);
  };
  const add = () => run(() => create({ ...createEntryDefault("offering", crypto.randomUUID()), name: "Untitled Offering" } as Offering), "The offering could not be added.");
  const remove = (item: ViewOffering, title: string) =>
    run(async () => {
      setDeleted(null);
      await api(companyPath(companyId, `/entries/${item.entryId}`), write("DELETE", { expectedRevision: item.revision, requestId: crypto.randomUUID() }));
      setDeleted({ title, offeringId: item.offering.id, entryId: item.entryId });
      await onSaved();
      onSelect("");
    }, "The offering could not be deleted.");
  const undo = () =>
    run(async () => {
      if (!deleted) {
        return;
      }
      // The deleted entry is archived, not erased: restoring it brings back the offering with its history and evidence.
      await api(companyPath(companyId, `/entries/${deleted.entryId}/restore`), write("POST", {}));
      setFocusTo(deleted.offeringId);
      setDeleted(null);
      await onSaved();
      onSelect(deleted.offeringId);
    }, "The offering could not be restored.");

  const detail = (item: ViewOffering, title: string) =>
    editable ? (
      <OfferingDetail companyId={companyId} item={item} title={title} onDelete={() => void remove(item, title)} deleting={working} />
    ) : (
      <OfferingDetail companyId={companyId} item={item} title={title} />
    );
  return (
    <>
      <div className="knowledge-view__section-head">
        <div>
          <h2 className="knowledge-view__section-title">
            Business Offerings <span className="knowledge-view__count">{offerings.length}</span>
          </h2>
          <p className="knowledge-view__section-subtitle">Pick an offering on the left to see its details on the right.</p>
        </div>
        {editable ? (
          <button
            type="button"
            className="knowledge-view__primary-add"
            onClick={() => void add()}
            disabled={working || blocked}
            aria-busy={working}
            title={blocked ? "Reload to see the latest changes before adding an offering." : undefined}
          >
            Add offering
          </button>
        ) : (
          <Link className="knowledge-view__primary-add" href={href}>+ Add Offering</Link>
        )}
      </div>
      {error && <p className="knowledge-view__dialog-error knowledge-view__people-error" role="alert">{error}</p>}
      {deleted && (
        <span className="knowledge-view__toast" role="status">
          {`Deleted “${deleted.title}”.`}{" "}
          <button type="button" className="knowledge-view__toast-undo" disabled={working || blocked} onClick={() => void undo()}>
            Undo
          </button>
        </span>
      )}
      {offerings.length === 0 ? (
        <EmptyBox title="No offerings yet" hint="Add the products and services you sell." href={href} />
      ) : (
        <div className="knowledge-view__offerings">
          <ul className="knowledge-view__offering-list" aria-label="Business offerings">
            {offerings.map((item, index) => {
              const { offering, evidence } = item;
              const type = textOrNull(offering.offering_type);
              return (
                <li
                  className={`knowledge-view__offering${index === selected ? " knowledge-view__offering--selected" : ""}`}
                  key={offering.id}
                >
                  <button
                    ref={(element) => {
                      if (element) {
                        rows.current.set(offering.id, element);
                      } else {
                        rows.current.delete(offering.id);
                      }
                    }}
                    type="button"
                    className="knowledge-view__offering-button"
                    aria-current={index === selected ? "true" : undefined}
                    onClick={() => { onSelect(offering.id); }}
                  >
                    <span className="knowledge-view__offering-icon" aria-hidden="true"><Icon name="cube" size={16} /></span>
                    <span className="knowledge-view__offering-text">
                      <strong>{titles[index]}</strong>
                      {type && <small>{type}</small>}
                    </span>
                  </button>
                  <ItemSource evidence={evidence} path={`/offerings/@${offering.id}`} name={titles[index]} />
                </li>
              );
            })}
          </ul>
          {detail(offerings[selected], titles[selected])}
        </div>
      )}
    </>
  );
}
