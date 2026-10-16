import { z } from "zod";
import {
  NullableTextSchema as text,
  URLSchema,
  collection,
} from "./primitives";
import { IdentifiedTextSchema, AddressSchema } from "./value-types";
import { EmployeeCountSchema } from "./numeric-values";
export const CompanyFoundationSchema = z
  .object({
    overview: text,
    website: URLSchema.nullable(),
    industry: text,
    business_model: text,
    company_role: collection(IdentifiedTextSchema),
    year_founded: z
      .number()
      .int()
      .min(1000)
      .max(new Date().getUTCFullYear())
      .nullable(),
    legal_entity_type: text,
    employee_count: EmployeeCountSchema.nullable(),
    main_address: AddressSchema.nullable(),
    other_locations: collection(AddressSchema),
    service_locations: collection(IdentifiedTextSchema),
    alternative_company_names: collection(IdentifiedTextSchema),
  })
  .strict();
export type CompanyFoundation = z.infer<typeof CompanyFoundationSchema>;
