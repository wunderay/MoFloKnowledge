import { z } from "zod";
import {
  TextSchema,
  DecimalSchema,
  DateOnlySchema,
  NullableTextSchema,
  collection,
} from "./primitives";
import { IdentifiedTextSchema } from "./value-types";
const count = z.number().int().nonnegative().safe().nullable();
export const EmployeeCountSchema = z
  .object({
    raw: TextSchema,
    exact: count,
    min: count,
    max: count,
    as_of: DateOnlySchema.nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.exact !== null && (v.min !== null || v.max !== null)) {
      ctx.addIssue({
        code: "custom",
        message: "Exact and range employee counts are exclusive",
      });
    }
    if (v.min !== null && v.max !== null && v.min > v.max) {
      ctx.addIssue({
        code: "custom",
        message: "Employee minimum exceeds maximum",
      });
    }
    if (
      v.exact !== null &&
      /\d\s*(?:[-–—]|to|\+)\s*\d|\d\s*\+|(?:over|more than|at least|approximately|about)\s*\d/i.test(
        v.raw,
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Range or approximate wording cannot establish an exact count",
      });
    }
  });
export function compareDecimal(a: string, b: string): number {
  const [ai, af = ""] = a.split(".");
  const [bi, bf = ""] = b.split(".");
  if (ai.length !== bi.length) {
    return ai.length - bi.length;
  }
  if (ai !== bi) {
    return ai < bi ? -1 : 1;
  }
  const width = Math.max(af.length, bf.length);
  const x = af.padEnd(width, "0"),
    y = bf.padEnd(width, "0");
  return x === y ? 0 : x < y ? -1 : 1;
}
export const PricingSchema = z
  .object({
    kind: z.enum(["free", "paid", "contact_for_pricing"]),
    raw: TextSchema,
    amount: DecimalSchema.nullable(),
    min_amount: DecimalSchema.nullable(),
    max_amount: DecimalSchema.nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    billing_interval: NullableTextSchema,
    pricing_model: NullableTextSchema,
    qualifications: collection(IdentifiedTextSchema),
    as_of: DateOnlySchema.nullable(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const range = v.min_amount !== null || v.max_amount !== null;
    if (v.amount !== null && range) {
      ctx.addIssue({ code: "custom", message: "Choose amount or range" });
    }
    if (v.kind !== "paid" && (v.amount !== null || range)) {
      ctx.addIssue({
        code: "custom",
        message: "Free/contact prices preserve wording without numeric zero",
      });
    }
    if (
      v.min_amount !== null &&
      v.max_amount !== null &&
      compareDecimal(v.min_amount, v.max_amount) > 0
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Price minimum exceeds maximum",
      });
    }
  });
export type EmployeeCount = z.infer<typeof EmployeeCountSchema>;
export type Pricing = z.infer<typeof PricingSchema>;
