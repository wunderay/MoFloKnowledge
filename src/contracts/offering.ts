import {z} from 'zod';
import {UUIDSchema,NullableTextSchema as text,URLSchema,collection} from './primitives';
import {IdentifiedTextSchema} from './value-types';
import {PricingSchema} from './numeric-values';
export const OfferingSchema=z.object({id:UUIDSchema,name:text,description:text,offering_type:text,category:text,features:collection(IdentifiedTextSchema),pricing:PricingSchema.nullable(),url:URLSchema.nullable()}).strict().refine(v=>v.name!==null||v.description!==null||v.offering_type!==null||v.category!==null||v.features.length>0||v.pricing!==null||v.url!==null,'Cannot create wholly empty offering');
export type Offering=z.infer<typeof OfferingSchema>;
