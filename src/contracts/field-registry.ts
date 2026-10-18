import registry from "./field-registry.json";
import type { EntryKind } from "./business";
import type { Origin } from "./provenance";
export interface FieldDefinition {
  path: string;
  kind: EntryKind;
  field: string;
  type: string;
  default: unknown;
  allowedOrigins: Origin[];
  coverageRequired: boolean;
}
export const FIELD_REGISTRY = registry as FieldDefinition[];
export function fieldForTarget(path: string): FieldDefinition | undefined {
  return FIELD_REGISTRY.find((field) => {
    const pattern = field.path.replace("/@id", "/@[0-9a-fA-F-]{36}");
    return new RegExp(`^${pattern}(?:/|$)`).test(path);
  });
}
export function allowedOriginsForTarget(path: string): Origin[] {
  const field = fieldForTarget(path);
  if (!field) {
    return [];
  }
  // Nested observations and interpreted purposes have distinct permissions (plan coverage matrix).
  if (
    /\/(?:ctas|funnels)\//.test(path) &&
    !path.endsWith("/purpose") &&
    !path.endsWith("/name")
  ) {
    return ["source_backed", "user_provided"];
  }
  if (path.includes('/fonts/') && !path.endsWith("/apparent_use")) {
    return ["source_backed", "user_provided"];
  }
  if (path.includes('/brand_colors/') && !path.endsWith("/apparent_role")) {
    return ["source_backed", "user_provided"];
  }
  if (path.includes('/logos/') && !path.endsWith("/variant")) {
    return ["source_backed", "user_provided"];
  }
  return field.allowedOrigins;
}
export function requiredCoverageTargets(
  business: Record<string, unknown>,
): string[] {
  const result: string[] = [];
  for (const field of FIELD_REGISTRY) {
    if (field.kind === "key_person" || field.kind === "offering") {
      const key = field.kind === "key_person" ? "key_people" : "offerings";
      const items = business[key];
      if (!Array.isArray(items)) {
        continue;
      }
      if (items.length === 0) {
        if (!result.includes(`/${key}`)) {
          result.push(`/${key}`);
        }
      } else {
        for (const item of items) {
          result.push(field.path.replace("@id", `@${item.id}`));
        }
      }
    } else if (Object.hasOwn(business, field.kind)) {
      result.push(field.path);
    }
  }
  return result;
}
