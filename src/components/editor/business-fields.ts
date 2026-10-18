export interface FieldSpec {
  label?: string;
  type?: "text" | "long" | "url" | "date" | "number" | "boolean" | "select";
  options?: string[];
  fields?: Record<string, FieldSpec>;
  items?: FieldSpec;
  default?: unknown;
  hint?: string;
}
const t: FieldSpec = { type: "text" },
  long: FieldSpec = { type: "long" },
  url: FieldSpec = { type: "url" },
  num: FieldSpec = { type: "number" },
  date: FieldSpec = { type: "date" };
const textItems: FieldSpec = { items: { fields: { text: t } }, default: [] };
const address: FieldSpec = {
  fields: {
    label: t,
    raw: { ...long, label: "Original address" },
    line1: t,
    line2: t,
    city: t,
    region: t,
    postal_code: t,
    country: t,
  },
};
const pricing: FieldSpec = {
  hint: "Keep the original price wording. Unknown pricing stays empty; free and contact pricing are distinct.",
  fields: {
    kind: {
      type: "select",
      options: ["free", "paid", "contact_for_pricing"],
      default: "paid",
    },
    raw: { ...t, label: "Original pricing wording", default: "" },
    amount: t,
    min_amount: t,
    max_amount: t,
    currency: t,
    billing_interval: t,
    pricing_model: t,
    qualifications: textItems,
    as_of: date,
  },
};
export const CATEGORY_SPECS: Record<
  string,
  {
    label: string;
    icon: string;
    description: string;
    fields: Record<string, FieldSpec>;
  }
> = {
  company_foundation: {
    label: "Company foundation",
    icon: "▦",
    description:
      "The essential facts about the company, where it operates, and how it works.",
    fields: {
      overview: long,
      website: url,
      industry: t,
      business_model: long,
      company_role: textItems,
      year_founded: num,
      legal_entity_type: t,
      employee_count: {
        hint: "Preserve the original range. Do not turn a range into an exact headcount.",
        fields: {
          raw: { ...t, label: "Original employee wording", default: "" },
          exact: num,
          min: num,
          max: num,
          as_of: date,
        },
      },
      main_address: address,
      other_locations: { items: address, default: [] },
      service_locations: textItems,
      alternative_company_names: textItems,
    },
  },
  positioning: {
    label: "Positioning",
    icon: "◇",
    description: "How the company describes its purpose and tells its story.",
    fields: { company_pitch: long, founding_story: long },
  },
  market_and_customers: {
    label: "Market & customers",
    icon: "◎",
    description:
      "Who the company serves, their needs, and the paths that connect them.",
    fields: {
      target_buyers: textItems,
      customer_needs: textItems,
      ideal_customer_personas: {
        items: {
          fields: {
            name: t,
            role: t,
            organization_type: t,
            goals: textItems,
            pain_points: textItems,
          },
        },
      },
      industry_groupings: textItems,
      industry_outlook: {
        items: { fields: { text: long, publisher: t, published_on: date } },
      },
      channels: { items: { fields: { channel_type: t, label: t, url } } },
      funnels: {
        items: {
          fields: { name: t, steps: { items: { fields: { label: t, url } } } },
        },
      },
      ctas: {
        label: "Calls to action",
        items: { fields: { label: t, url, purpose: t } },
      },
      suppliers_and_partners: {
        items: {
          fields: {
            name: t,
            relationship_type: t,
            relationship_text: long,
            url,
          },
        },
      },
    },
  },
  branding_and_style: {
    label: "Branding & style",
    icon: "◐",
    description:
      "Observed writing, visuals, and design details. Technical observations stay distinct from confirmed brand guidance.",
    fields: {
      writing_style_description: long,
      art_style_description: long,
      fonts: {
        items: {
          fields: {
            family: t,
            apparent_use: t,
            observations: {
              type: "select",
              options: ["css_declared", "resource_loaded", "computed_family"],
              default: [],
            },
            brand_confirmed: { type: "boolean", default: false },
          },
        },
      },
      brand_colors: {
        items: {
          fields: {
            hex: { ...t, default: "#000000" },
            alpha: { ...num, default: 1 },
            apparent_role: t,
            classification: {
              type: "select",
              options: ["observed_website_color", "brand_guide_confirmed"],
              default: "observed_website_color",
            },
          },
        },
      },
      logos: {
        items: {
          fields: {
            url: { ...url, default: "" },
            variant: t,
            kind: {
              type: "select",
              options: ["company_logo"],
              default: "company_logo",
            },
          },
        },
      },
    },
  },
  online_presence: {
    label: "Online presence",
    icon: "@",
    description:
      "Official company-linked profiles, kept separate from sites we crawl.",
    fields: {
      social_media_links: {
        items: {
          fields: {
            platform: { ...t, default: "" },
            profile_url: { ...url, default: "" },
          },
        },
      },
    },
  },
  site_links: {
    label: "Site links",
    icon: "↗",
    description:
      "The company's own internal site pages, listed by hand with an optional note.",
    fields: {
      links: {
        items: {
          fields: {
            title: { ...t, default: "" },
            url: { ...url, default: "" },
            note: t,
          },
        },
      },
    },
  },
  key_person: {
    label: "Key people",
    icon: "♙",
    description:
      "Public professional information. Each person is reviewed separately. Never infer gender.",
    fields: {
      name: t,
      title: t,
      role: t,
      gender: {
        ...t,
        hint: "Only use explicit self-description. Leave unknown when not stated.",
      },
      background_or_relevance: long,
    },
  },
  offering: {
    label: "Offerings",
    icon: "▱",
    description:
      "Products and services, with their own features, pricing, and approval.",
    fields: {
      name: t,
      description: long,
      offering_type: t,
      category: t,
      features: textItems,
      pricing,
      url,
    },
  },
};
export function labelOf(key: string) {
  return key.replaceAll("_", " ").replace(/^./, (x) => x.toUpperCase());
}
export function newValue(spec: FieldSpec, identified = false): unknown {
  if (spec.default !== undefined) {
    return structuredClone(spec.default);
  }
  if (spec.items) {
    return [];
  }
  if (spec.fields) {
    return Object.fromEntries([
      ...(identified ? [["id", crypto.randomUUID()]] : []),
      ...Object.entries(spec.fields).map(([k, s]) => [k, newValue(s)]),
    ]);
  }
  return null;
}

/** A readable choice label; stable IDs remain in the underlying candidate. */
export function summarizeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "Unknown";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (Array.isArray(value)) {
    return value.length ? value.map(summarizeValue).join("; ") : "No values";
  }
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    for (const field of [
      "raw",
      "text",
      "name",
      "label",
      "family",
      "hex",
      "url",
      "profile_url",
    ]) {
      if (typeof object[field] === "string" && object[field]) {
        return object[field];
      }
    }
    const fields = Object.entries(object).filter(
      ([key, item]) => key !== "id" && item !== null,
    );
    return fields.length
      ? fields
          .map(([key, item]) => `${labelOf(key)}: ${summarizeValue(item)}`)
          .join("; ")
      : "Unknown";
  }
  return String(value);
}
