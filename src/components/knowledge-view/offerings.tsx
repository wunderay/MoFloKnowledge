import Link from "next/link";
import type { ReactNode } from "react";
import type { Offering } from "@/contracts";
import { Icon, type IconName } from "../icons";
import { textOrNull, type ViewOffering } from "./data";
import { addHref, CoverageNote, EmptyBox, ItemSource, Source } from "./parts";

/** What the Cost card shows, and the field that holds it: the price wording, else amount with currency and interval, else free/contact. */
function costOf(pricing: Offering["pricing"]): { text: string; path: string } | null {
  if (!pricing) return null;
  const raw = textOrNull(pricing.raw);
  if (raw) return { text: raw, path: "pricing/raw" };
  const amount = textOrNull(pricing.amount);
  if (amount) {
    const text = [amount, textOrNull(pricing.currency)].filter(Boolean).join(" ");
    const interval = textOrNull(pricing.billing_interval);
    return { text: interval ? `${text} / ${interval}` : text, path: "pricing/amount" };
  }
  if (pricing.kind === "free") return { text: "Free", path: "pricing/kind" };
  if (pricing.kind === "contact_for_pricing") return { text: "Contact for pricing", path: "pricing/kind" };
  return null;
}

/** How each field is named in its evidence control: "Sources: evidence for cost of <offering>". */
const NOUNS = { name: "name", type: "type", description: "description", features: "key features", cost: "cost", model: "pricing model" };

function Field({
  label,
  icon,
  source,
  children,
}: {
  label: string;
  icon?: IconName;
  source: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="knowledge-view__field">
      {icon && (
        <span className="knowledge-view__field-icon" aria-hidden="true"><Icon name={icon} size={18} /></span>
      )}
      <div className="knowledge-view__field-body">
        <p className="knowledge-view__mini-label">{label}{source}</p>
        {children}
      </div>
    </div>
  );
}

function OfferingDetail({
  companyId,
  item,
  title,
}: {
  companyId: string;
  item: ViewOffering;
  /** The name shown in the list, which also names this offering's evidence controls. */
  title: string;
}) {
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
  ) => (
    <Field
      label={label}
      icon={icon}
      source={<Source evidence={evidence} path={paths[key]} filled={value !== null} name={`${NOUNS[key]} of ${title}`} />}
    >
      {value !== null ? (
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
  return (
    <section className="knowledge-view__offering-detail" aria-label={`Details of ${title}`}>
      {field("Offering", "name", text(name), { title: "No name yet", hint: "Name this offering." })}
      {field("Type", "type", text(type), { title: "No type yet", hint: "For example, a subscription or a service." })}
      {field("Description", "description", text(description), {
        title: "No description yet",
        hint: "Say what this offering is.",
      })}
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
      )}
      <div className="knowledge-view__field-pair">
        {field("Cost", "cost", text(cost?.text ?? null), { title: "No cost yet", hint: "Add the price or how it is quoted." }, "dollar")}
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

/** Business Offerings: a list of every offering and the detail of the selected one. Read only. */
export function BusinessOfferings({
  companyId,
  offerings,
  selectedId,
  onSelect,
}: {
  companyId: string;
  offerings: ViewOffering[];
  /** The `offering` URL value; one that matches no offering selects the first. */
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const href = addHref(companyId, "offering");
  const found = offerings.findIndex((item) => item.offering.id === selectedId);
  const selected = found < 0 ? 0 : found;
  const titles = offerings.map((item, index) => textOrNull(item.offering.name) ?? `Untitled offering ${index + 1}`);
  return (
    <>
      <div className="knowledge-view__section-head">
        <div>
          <h2 className="knowledge-view__section-title">
            Business Offerings <span className="knowledge-view__count">{offerings.length}</span>
          </h2>
          <p className="knowledge-view__section-subtitle">Pick an offering on the left to see its details on the right.</p>
        </div>
        <Link className="knowledge-view__primary-add" href={href}>+ Add Offering</Link>
      </div>
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
                    type="button"
                    className="knowledge-view__offering-button"
                    aria-current={index === selected ? "true" : undefined}
                    onClick={() => onSelect(offering.id)}
                  >
                    <span className="knowledge-view__offering-icon" aria-hidden="true"><Icon name="cube" size={16} /></span>
                    <span className="knowledge-view__offering-text">
                      <strong>{titles[index]}</strong>
                      {type && <small>{type}</small>}
                    </span>
                  </button>
                  <ItemSource evidence={evidence} path={`/offerings/@${offering.id}`} name={titles[index]!} />
                </li>
              );
            })}
          </ul>
          <OfferingDetail companyId={companyId} item={offerings[selected]!} title={titles[selected]!} />
        </div>
      )}
    </>
  );
}
